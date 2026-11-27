/** Native AI tracker — dedicated SQLite store. Raw answers are never truncated, never deleted. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { validTenantId } from "../tenants/store.js";
import type { Citation, EngineStatus, MentionJudgement, Opportunity, StoredRun, TrackedBrand, TrackedPrompt } from "./types.js";
import { trackerConfig } from "./config.js";

const connections = new Map<string, Database.Database>();
type Row = Record<string, unknown>;
const json = <T>(value: unknown, fallback: T): T => { if (typeof value !== "string" || !value) return fallback; try { return JSON.parse(value) as T; } catch { return fallback; } };

function validateTenant(id: string) { if (!validTenantId(id)) throw new Error("Invalid tenant"); }
export function promptHash(text: string): string { return createHash("sha256").update(text.trim().toLowerCase()).digest("hex"); }
/** Domain normalisation: lowercase, no protocol, no path, no trailing slash. */
export function normalizeDomain(input: string): string {
  try { return new URL(input.includes("://") ? input : `https://${input}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase(); }
}
export function runIdFor(tenantId: string, brandId: string, promptId: string, engine: string, provider: string, runDate: string): string {
  return createHash("sha256").update([tenantId, brandId, promptId, engine, provider, runDate].join("|")).digest("hex").slice(0, 32);
}

export function database(): Database.Database {
  const file = path.resolve(trackerConfig().dbPath);
  const existing = connections.get(file);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { const fd = fs.openSync(file, "wx", 0o600); fs.closeSync(fd); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const db = new Database(file, { timeout: 10000 });
  db.pragma("busy_timeout = 10000"); db.pragma("journal_mode = DELETE"); db.pragma("synchronous = FULL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_brands (
      tenant_id TEXT NOT NULL, brand_id TEXT NOT NULL, name TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]', domains_json TEXT NOT NULL DEFAULT '[]',
      competitors_json TEXT NOT NULL DEFAULT '[]', locale TEXT NOT NULL DEFAULT 'fr-FR',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
      PRIMARY KEY (tenant_id, brand_id));
    CREATE TABLE IF NOT EXISTS ai_prompts (
      tenant_id TEXT NOT NULL, brand_id TEXT NOT NULL, prompt_id TEXT NOT NULL,
      prompt_text TEXT NOT NULL, prompt_hash TEXT NOT NULL, tags_json TEXT NOT NULL DEFAULT '[]',
      locale TEXT NOT NULL DEFAULT 'fr-FR', engines_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      PRIMARY KEY (tenant_id, brand_id, prompt_id),
      UNIQUE (tenant_id, brand_id, prompt_hash));
    CREATE TABLE IF NOT EXISTS ai_runs (
      run_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, brand_id TEXT NOT NULL, prompt_id TEXT NOT NULL,
      engine TEXT NOT NULL, provider TEXT NOT NULL, collection_mode TEXT NOT NULL,
      run_date TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
      raw_text TEXT NOT NULL, citations_json TEXT NOT NULL DEFAULT '[]', fanout_json TEXT NOT NULL DEFAULT '[]',
      model TEXT, source TEXT NOT NULL DEFAULT 'native-tracker', synced_at TEXT NOT NULL,
      UNIQUE (tenant_id, brand_id, prompt_id, engine, provider, run_date));
    CREATE TABLE IF NOT EXISTS ai_mentions (
      run_id TEXT NOT NULL, tenant_id TEXT NOT NULL, company_id TEXT NOT NULL, company_type TEXT NOT NULL,
      counted INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'judged',
      passage TEXT, sentiment TEXT, position INTEGER, judge_version TEXT NOT NULL, judged_at TEXT NOT NULL,
      PRIMARY KEY (run_id, company_id, judge_version));
    CREATE TABLE IF NOT EXISTS ai_opportunities (
      opportunity_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, brand_id TEXT NOT NULL,
      prompt_id TEXT NOT NULL, engine TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      evidence_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_engine_state (
      tenant_id TEXT NOT NULL, engine TEXT NOT NULL, health TEXT NOT NULL DEFAULT 'disabled',
      consecutive_failures INTEGER NOT NULL DEFAULT 0, last_checked_at TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '', PRIMARY KEY (tenant_id, engine));
    CREATE INDEX IF NOT EXISTS ai_runs_prompt ON ai_runs (tenant_id, brand_id, prompt_id, run_date);
    CREATE INDEX IF NOT EXISTS ai_mentions_run ON ai_mentions (run_id);`);
  connections.set(file, db);
  return db;
}

/** Tests and orderly shutdown. */
export function closeTrackerStores() { for (const db of connections.values()) db.close(); connections.clear(); }

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

const brandFromRow = (row: Row): TrackedBrand => ({
  brandId: String(row.brand_id), tenantId: String(row.tenant_id), name: String(row.name),
  aliases: json<string[]>(row.aliases_json, []), domains: json<string[]>(row.domains_json, []),
  competitors: json<TrackedBrand["competitors"]>(row.competitors_json, []),
  locale: String(row.locale), active: Number(row.active) === 1,
  createdAt: String(row.created_at), createdBy: String(row.created_by),
});

export function listBrands(tenantId: string): TrackedBrand[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT * FROM ai_brands WHERE tenant_id = ? ORDER BY created_at, brand_id").all(tenantId) as Row[]).map(brandFromRow);
}
export function getBrand(tenantId: string, brandId: string): TrackedBrand | undefined {
  validateTenant(tenantId);
  const row = database().prepare("SELECT * FROM ai_brands WHERE tenant_id = ? AND brand_id = ?").get(tenantId, brandId) as Row | undefined;
  return row ? brandFromRow(row) : undefined;
}
export function upsertBrand(tenantId: string, brand: Omit<TrackedBrand, "tenantId">): void {
  validateTenant(tenantId);
  if (brand.competitors.length > 10) throw new Error("A brand tracks at most 10 competitors");
  database().prepare(`INSERT INTO ai_brands (tenant_id, brand_id, name, aliases_json, domains_json, competitors_json, locale, active, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, brand_id) DO UPDATE SET name = excluded.name, aliases_json = excluded.aliases_json,
      domains_json = excluded.domains_json, competitors_json = excluded.competitors_json, locale = excluded.locale, active = excluded.active`)
    .run(tenantId, brand.brandId, brand.name, JSON.stringify(brand.aliases), JSON.stringify(brand.domains), JSON.stringify(brand.competitors), brand.locale, brand.active ? 1 : 0, brand.createdAt, brand.createdBy);
}
/** Deactivation stops collection, never deletes history. */
export function setBrandActive(tenantId: string, brandId: string, active: boolean): void {
  validateTenant(tenantId);
  database().prepare("UPDATE ai_brands SET active = ? WHERE tenant_id = ? AND brand_id = ?").run(active ? 1 : 0, tenantId, brandId);
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const promptFromRow = (row: Row): TrackedPrompt => ({
  promptId: String(row.prompt_id), tenantId: String(row.tenant_id), brandId: String(row.brand_id),
  promptText: String(row.prompt_text), promptHash: String(row.prompt_hash),
  tags: json<string[]>(row.tags_json, []), locale: String(row.locale),
  engines: json<string[]>(row.engines_json, []).filter(Boolean) as TrackedPrompt["engines"],
  active: Number(row.active) === 1, createdAt: String(row.created_at), createdBy: String(row.created_by), source: String(row.source),
});

export function listPrompts(tenantId: string, brandId?: string): TrackedPrompt[] {
  validateTenant(tenantId);
  const rows = brandId
    ? database().prepare("SELECT * FROM ai_prompts WHERE tenant_id = ? AND brand_id = ? ORDER BY created_at, prompt_id").all(tenantId, brandId)
    : database().prepare("SELECT * FROM ai_prompts WHERE tenant_id = ? ORDER BY created_at, prompt_id").all(tenantId);
  return (rows as Row[]).map(promptFromRow);
}
export function getPrompt(tenantId: string, brandId: string, promptId: string): TrackedPrompt | undefined {
  validateTenant(tenantId);
  const row = database().prepare("SELECT * FROM ai_prompts WHERE tenant_id = ? AND brand_id = ? AND prompt_id = ?").get(tenantId, brandId, promptId) as Row | undefined;
  return row ? promptFromRow(row) : undefined;
}
export function insertPrompt(tenantId: string, prompt: Omit<TrackedPrompt, "tenantId">): { reused: boolean } {
  validateTenant(tenantId);
  if (getPrompt(tenantId, prompt.brandId, prompt.promptId)) throw new Error("Prompt ID already exists");
  try {
    database().prepare(`INSERT INTO ai_prompts (tenant_id, brand_id, prompt_id, prompt_text, prompt_hash, tags_json, locale, engines_json, active, created_at, created_by, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(tenantId, prompt.brandId, prompt.promptId, prompt.promptText, prompt.promptHash, JSON.stringify(prompt.tags), prompt.locale, JSON.stringify(prompt.engines), prompt.active ? 1 : 0, prompt.createdAt, prompt.createdBy, prompt.source);
    return { reused: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "SQLITE_CONSTRAINT_UNIQUE") return { reused: true };
    throw error;
  }
}
export function setPromptActive(tenantId: string, brandId: string, promptId: string, active: boolean): void {
  validateTenant(tenantId);
  database().prepare("UPDATE ai_prompts SET active = ? WHERE tenant_id = ? AND brand_id = ? AND prompt_id = ?").run(active ? 1 : 0, tenantId, brandId, promptId);
}

// ---------------------------------------------------------------------------
// Runs (idempotent per day: tenant + brand + prompt + engine + provider + date)
// ---------------------------------------------------------------------------

export function insertRun(tenantId: string, run: StoredRun): { reused: boolean } {
  validateTenant(tenantId);
  if (!run.rawText || !run.rawText.trim()) throw new Error("Empty answer: a failed run is not a missing mention");
  const db = database();
  try {
    db.prepare(`INSERT INTO ai_runs (run_id, tenant_id, brand_id, prompt_id, engine, provider, collection_mode, run_date, started_at, finished_at, raw_text, citations_json, fanout_json, model, source, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(run.runId, tenantId, run.brandId, run.promptId, run.engine, run.provider, run.collectionMode, run.runDate, run.startedAt, run.finishedAt, run.rawText, JSON.stringify(run.citations), JSON.stringify(run.fanOut), run.model, run.source, new Date().toISOString());
    return { reused: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "SQLITE_CONSTRAINT_UNIQUE") return { reused: true };
    throw error;
  }
}

const runFromRow = (row: Row): StoredRun => ({
  runId: String(row.run_id), tenantId: String(row.tenant_id), brandId: String(row.brand_id), promptId: String(row.prompt_id),
  engine: String(row.engine), provider: String(row.provider), collectionMode: String(row.collection_mode) as StoredRun["collectionMode"],
  runDate: String(row.run_date), startedAt: String(row.started_at), finishedAt: String(row.finished_at),
  rawText: String(row.raw_text), citations: json<Citation[]>(row.citations_json, []), fanOut: json<string[]>(row.fanout_json, []),
  model: row.model == null ? null : String(row.model), source: String(row.source),
});

export function listRuns(tenantId: string, filters: { brandId?: string; promptId?: string; engine?: string; mode?: string; from?: string; to?: string; cursor?: string; limit?: number }): { runs: StoredRun[]; nextCursor: string | null } {
  validateTenant(tenantId);
  const clauses = ["tenant_id = ?"], args: unknown[] = [tenantId];
  if (filters.brandId) { clauses.push("brand_id = ?"); args.push(filters.brandId); }
  if (filters.promptId) { clauses.push("prompt_id = ?"); args.push(filters.promptId); }
  if (filters.engine) { clauses.push("engine = ?"); args.push(filters.engine); }
  if (filters.mode) { clauses.push("collection_mode = ?"); args.push(filters.mode); }
  if (filters.from) { clauses.push("run_date >= ?"); args.push(filters.from); }
  if (filters.to) { clauses.push("run_date <= ?"); args.push(filters.to); }
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  if (filters.cursor) { clauses.push("run_date || '|' || run_id < ?"); args.push(filters.cursor); }
  const rows = database().prepare(`SELECT * FROM ai_runs WHERE ${clauses.join(" AND ")} ORDER BY run_date DESC, run_id DESC LIMIT ?`).all(...args, limit) as Row[];
  const runs = rows.map(runFromRow);
  const last = runs.at(-1);
  return { runs, nextCursor: runs.length === limit && last ? `${last.runDate}|${last.runId}` : null };
}
export function getRun(tenantId: string, runId: string): StoredRun | undefined {
  validateTenant(tenantId);
  const row = database().prepare("SELECT * FROM ai_runs WHERE tenant_id = ? AND run_id = ?").get(tenantId, runId) as Row | undefined;
  return row ? runFromRow(row) : undefined;
}
export function runsForWindow(tenantId: string, brandId: string, promptId: string | undefined, engine: string | undefined, from: string, to: string, mode?: string): StoredRun[] {
  validateTenant(tenantId);
  const clauses = ["tenant_id = ?", "brand_id = ?", "run_date >= ?", "run_date <= ?"];
  const args: unknown[] = [tenantId, brandId, from, to];
  if (promptId) { clauses.push("prompt_id = ?"); args.push(promptId); }
  if (engine) { clauses.push("engine = ?"); args.push(engine); }
  if (mode) { clauses.push("collection_mode = ?"); args.push(mode); }
  return (database().prepare(`SELECT * FROM ai_runs WHERE ${clauses.join(" AND ")} ORDER BY run_date, run_id`).all(...args) as Row[]).map(runFromRow);
}

// ---------------------------------------------------------------------------
// Mentions (append-only per judge version)
// ---------------------------------------------------------------------------

export function insertMention(tenantId: string, mention: MentionJudgement): void {
  validateTenant(tenantId);
  database().prepare(`INSERT INTO ai_mentions (run_id, tenant_id, company_id, company_type, counted, status, passage, sentiment, position, judge_version, judged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id, company_id, judge_version) DO NOTHING`)
    .run(mention.runId, tenantId, mention.companyId, mention.companyType, mention.counted ? 1 : 0, mention.status, mention.passage, mention.sentiment, mention.position, mention.judgeVersion, mention.judgedAt);
}
export function mentionsForRun(tenantId: string, runId: string, judgeVersion?: string): MentionJudgement[] {
  validateTenant(tenantId);
  const rows = judgeVersion
    ? database().prepare("SELECT * FROM ai_mentions WHERE tenant_id = ? AND run_id = ? AND judge_version = ?").all(tenantId, runId, judgeVersion)
    : database().prepare("SELECT * FROM ai_mentions WHERE tenant_id = ? AND run_id = ?").all(tenantId, runId);
  return (rows as Row[]).map(row => ({
    runId: String(row.run_id), companyId: String(row.company_id), companyType: String(row.company_type) as MentionJudgement["companyType"],
    counted: Number(row.counted) === 1, status: String(row.status) as MentionJudgement["status"],
    passage: row.passage == null ? null : String(row.passage), sentiment: row.sentiment == null ? null : String(row.sentiment) as MentionJudgement["sentiment"],
    position: row.position == null ? null : Number(row.position), judgeVersion: String(row.judge_version), judgedAt: String(row.judged_at),
  }));
}
/** Latest judgements for a set of runs (highest judge version wins). */
export function latestMentions(tenantId: string, runIds: string[]): Map<string, MentionJudgement[]> {
  validateTenant(tenantId);
  const map = new Map<string, MentionJudgement[]>();
  if (!runIds.length) return map;
  const placeholders = runIds.map(() => "?").join(",");
  const rows = database().prepare(`SELECT m.* FROM ai_mentions m
    JOIN (SELECT run_id, company_id, MAX(judge_version) AS v FROM ai_mentions WHERE tenant_id = ? GROUP BY run_id, company_id) latest
      ON m.run_id = latest.run_id AND m.company_id = latest.company_id AND m.judge_version = latest.v
    WHERE m.tenant_id = ? AND m.run_id IN (${placeholders})`).all(tenantId, tenantId, ...runIds) as Row[];
  for (const row of rows) {
    const runId = String(row.run_id);
    const list = map.get(runId) ?? [];
    list.push({
      runId, companyId: String(row.company_id), companyType: String(row.company_type) as MentionJudgement["companyType"],
      counted: Number(row.counted) === 1, status: String(row.status) as MentionJudgement["status"],
      passage: row.passage == null ? null : String(row.passage), sentiment: row.sentiment == null ? null : String(row.sentiment) as MentionJudgement["sentiment"],
      position: row.position == null ? null : Number(row.position), judgeVersion: String(row.judge_version), judgedAt: String(row.judged_at),
    });
    map.set(runId, list);
  }
  return map;
}
/** Re-judge window: runs whose answer still exists, last 90 days. */
export function runsForRejudge(tenantId: string, sinceDate: string): StoredRun[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT * FROM ai_runs WHERE tenant_id = ? AND run_date >= ? ORDER BY run_date").all(tenantId, sinceDate) as Row[]).map(runFromRow);
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export function insertOpportunity(tenantId: string, opportunity: Opportunity): void {
  validateTenant(tenantId);
  database().prepare(`INSERT INTO ai_opportunities (opportunity_id, tenant_id, brand_id, prompt_id, engine, type, title, evidence_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(opportunity_id) DO NOTHING`)
    .run(opportunity.opportunityId, tenantId, opportunity.brandId, opportunity.promptId, opportunity.engine, opportunity.type, opportunity.title, JSON.stringify(opportunity.evidence), opportunity.status, opportunity.createdAt);
}
export function listOpportunities(tenantId: string, status?: string): Opportunity[] {
  validateTenant(tenantId);
  const rows = status
    ? database().prepare("SELECT * FROM ai_opportunities WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC").all(tenantId, status)
    : database().prepare("SELECT * FROM ai_opportunities WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId);
  return (rows as Row[]).map(row => ({
    opportunityId: String(row.opportunity_id), tenantId: String(row.tenant_id), brandId: String(row.brand_id),
    promptId: String(row.prompt_id), engine: String(row.engine), type: String(row.type) as Opportunity["type"],
    title: String(row.title), evidence: json(row.evidence_json, null), status: String(row.status), createdAt: String(row.created_at),
  }));
}
export function setOpportunityStatus(tenantId: string, opportunityId: string, status: string): void {
  validateTenant(tenantId);
  database().prepare("UPDATE ai_opportunities SET status = ? WHERE tenant_id = ? AND opportunity_id = ?").run(status, tenantId, opportunityId);
}

// ---------------------------------------------------------------------------
// Engine health
// ---------------------------------------------------------------------------

export function getEngineState(tenantId: string, engine: string): EngineStatus {
  validateTenant(tenantId);
  const row = database().prepare("SELECT * FROM ai_engine_state WHERE tenant_id = ? AND engine = ?").get(tenantId, engine) as Row | undefined;
  return {
    tenantId, engine,
    health: (row ? String(row.health) : "disabled") as EngineStatus["health"],
    consecutiveFailures: row ? Number(row.consecutive_failures) : 0,
    lastCheckedAt: row ? String(row.last_checked_at) : "",
    note: row ? String(row.note) : "",
  };
}
export function setEngineState(tenantId: string, engine: string, state: Partial<Pick<EngineStatus, "health" | "consecutiveFailures" | "lastCheckedAt" | "note">>): void {
  validateTenant(tenantId);
  const current = getEngineState(tenantId, engine);
  const next = { ...current, ...state };
  database().prepare(`INSERT INTO ai_engine_state (tenant_id, engine, health, consecutive_failures, last_checked_at, note)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, engine) DO UPDATE SET health = excluded.health,
      consecutive_failures = excluded.consecutive_failures, last_checked_at = excluded.last_checked_at, note = excluded.note`)
    .run(tenantId, engine, next.health, next.consecutiveFailures, next.lastCheckedAt, next.note);
}
export function listEngineStates(tenantId: string): EngineStatus[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT * FROM ai_engine_state WHERE tenant_id = ?").all(tenantId) as Row[]).map(row => ({
    tenantId, engine: String(row.engine), health: String(row.health) as EngineStatus["health"],
    consecutiveFailures: Number(row.consecutive_failures), lastCheckedAt: String(row.last_checked_at), note: String(row.note),
  }));
}
