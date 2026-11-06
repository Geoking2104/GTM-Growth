/** Durable storage for the operations layer: prompt pool, rank tracking,
 * alerts, article drafts and publications. One sqlite file per deployment,
 * tenant-scoped rows, same conventions as ai-visibility-store.ts. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { validTenantId } from "../tenants/store.js";

export interface TrackedPrompt { id: string; prompt: string; group: string; createdAt: string }
export interface VisibilityRun { id: string; ranAt: string; engine: string; prompts: number; succeeded: number; failed: number; datasetId: string | null; error: string | null }
export interface RankKeyword { id: string; keyword: string; locale: string; createdAt: string }
export interface RankSnapshot { id: string; keywordId: string; checkedAt: string; position: number | null; url: string | null; aiOverview: boolean; citedInAiOverview: boolean }
export interface AlertRow { id: string; createdAt: string; kind: string; severity: "info" | "warn" | "critical"; title: string; detail: string; payload: string; acknowledged: 0 | 1 }
export interface AutomationConfig { promptChecks?: { enabled: boolean; intervalHours: number; engines: string[] }; rankChecks?: { enabled: boolean; intervalHours: number }; lastPromptRun?: string; lastRankRun?: string }

type Row = { payload: string };
const connections = new Map<string, Database.Database>();
function root(): string { return path.resolve(process.env.OPS_STORE_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"), "ops")); }
function validateTenant(id: string) { if (!validTenantId(id)) throw new Error("Invalid tenant"); }
export function database(): Database.Database {
  const dir = root(); const file = path.join(dir, "ops.sqlite3"); const existing = connections.get(file); if (existing) return existing;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { const fd = fs.openSync(file, "wx", 0o600); fs.closeSync(fd); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const db = new Database(file, { timeout: 10000 });
  db.pragma("busy_timeout = 10000"); db.pragma("journal_mode = DELETE"); db.pragma("synchronous = FULL");
  db.exec(`CREATE TABLE IF NOT EXISTS prompts (tenant_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS visibility_runs (tenant_id TEXT NOT NULL, id TEXT NOT NULL, ran_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS rank_keywords (tenant_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS rank_snapshots (tenant_id TEXT NOT NULL, id TEXT NOT NULL, keyword_id TEXT NOT NULL, checked_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS alerts (tenant_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS automation_config (tenant_id TEXT PRIMARY KEY, payload TEXT NOT NULL);`);
  connections.set(file, db); return db;
}
const parse = <T>(row: Row): T => JSON.parse(row.payload) as T;
const now = () => new Date().toISOString();

/* ---------- prompt pool ---------- */
export function listPrompts(tenantId: string): TrackedPrompt[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT payload FROM prompts WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId) as Row[]).map(parse<TrackedPrompt>);
}
export function addPrompt(tenantId: string, prompt: string, group = "general"): TrackedPrompt {
  validateTenant(tenantId); const clean = prompt.trim();
  if (!clean || clean.length > 2000) throw new Error("Prompt invalide (1–2000 caractères).");
  const existing = listPrompts(tenantId);
  if (existing.some((p) => p.prompt === clean)) throw new Error("Prompt déjà suivi.");
  if (existing.length >= 200) throw new Error("Limite de 200 prompts suivis atteinte.");
  const row: TrackedPrompt = { id: crypto.randomUUID(), prompt: clean, group: group.trim().slice(0, 60) || "general", createdAt: now() };
  database().prepare("INSERT INTO prompts (tenant_id, id, created_at, payload) VALUES (?, ?, ?, ?)").run(tenantId, row.id, row.createdAt, JSON.stringify(row));
  return row;
}
export function removePrompt(tenantId: string, id: string): boolean {
  validateTenant(tenantId);
  return database().prepare("DELETE FROM prompts WHERE tenant_id = ? AND id = ?").run(tenantId, id).changes > 0;
}

/* ---------- visibility runs ---------- */
export function recordVisibilityRun(tenantId: string, run: VisibilityRun): void {
  validateTenant(tenantId);
  database().prepare("INSERT INTO visibility_runs (tenant_id, id, ran_at, payload) VALUES (?, ?, ?, ?)").run(tenantId, run.id, run.ranAt, JSON.stringify(run));
}
export function listVisibilityRuns(tenantId: string, limit = 50): VisibilityRun[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT payload FROM visibility_runs WHERE tenant_id = ? ORDER BY ran_at DESC, id LIMIT ?").all(tenantId, limit) as Row[]).map(parse<VisibilityRun>);
}

/* ---------- rank tracking ---------- */
export function listRankKeywords(tenantId: string): RankKeyword[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT payload FROM rank_keywords WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId) as Row[]).map(parse<RankKeyword>);
}
export function addRankKeyword(tenantId: string, keyword: string, locale = "fr-fr"): RankKeyword {
  validateTenant(tenantId); const clean = keyword.trim();
  if (!clean || clean.length > 200) throw new Error("Mot-clé invalide (1–200 caractères).");
  const existing = listRankKeywords(tenantId);
  if (existing.some((k) => k.keyword.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new Error("Mot-clé déjà suivi.");
  if (existing.length >= 200) throw new Error("Limite de 200 mots-clés suivis atteinte.");
  const row: RankKeyword = { id: crypto.randomUUID(), keyword: clean, locale: locale.trim().slice(0, 10) || "fr-fr", createdAt: now() };
  database().prepare("INSERT INTO rank_keywords (tenant_id, id, created_at, payload) VALUES (?, ?, ?, ?)").run(tenantId, row.id, row.createdAt, JSON.stringify(row));
  return row;
}
export function removeRankKeyword(tenantId: string, id: string): boolean {
  validateTenant(tenantId);
  const db = database();
  const removed = db.prepare("DELETE FROM rank_keywords WHERE tenant_id = ? AND id = ?").run(tenantId, id).changes > 0;
  db.prepare("DELETE FROM rank_snapshots WHERE tenant_id = ? AND keyword_id = ?").run(tenantId, id);
  return removed;
}
export function insertRankSnapshot(tenantId: string, snapshot: RankSnapshot): void {
  validateTenant(tenantId);
  database().prepare("INSERT INTO rank_snapshots (tenant_id, id, keyword_id, checked_at, payload) VALUES (?, ?, ?, ?, ?)").run(tenantId, snapshot.id, snapshot.keywordId, snapshot.checkedAt, JSON.stringify(snapshot));
}
export function listRankSnapshots(tenantId: string, keywordId: string): RankSnapshot[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT payload FROM rank_snapshots WHERE tenant_id = ? AND keyword_id = ? ORDER BY checked_at, id").all(tenantId, keywordId) as Row[]).map(parse<RankSnapshot>);
}
export function lastRankSnapshots(tenantId: string): Map<string, RankSnapshot> {
  validateTenant(tenantId);
  const rows = database().prepare("SELECT payload FROM rank_snapshots WHERE tenant_id = ? ORDER BY checked_at, id").all(tenantId) as Row[];
  const byKeyword = new Map<string, RankSnapshot>();
  for (const row of rows) { const snap = parse<RankSnapshot>(row); byKeyword.set(snap.keywordId, snap); }
  return byKeyword;
}

/* ---------- alerts ---------- */
export function insertAlert(tenantId: string, alert: Omit<AlertRow, "id" | "createdAt" | "acknowledged" | "payload"> & { payload?: unknown }): AlertRow {
  validateTenant(tenantId);
  const row: AlertRow = { id: crypto.randomUUID(), createdAt: now(), kind: alert.kind.slice(0, 40), severity: alert.severity, title: alert.title.slice(0, 200), detail: alert.detail.slice(0, 1000), payload: JSON.stringify(alert.payload ?? null), acknowledged: 0 };
  database().prepare("INSERT INTO alerts (tenant_id, id, created_at, payload, acknowledged) VALUES (?, ?, ?, ?, 0)").run(tenantId, row.id, row.createdAt, JSON.stringify({ kind: row.kind, severity: row.severity, title: row.title, detail: row.detail, payload: row.payload }));
  return row;
}
export function listAlerts(tenantId: string, includeAcknowledged = true): Array<AlertRow & { kind: string; severity: string; title: string; detail: string; payload: unknown }> {
  validateTenant(tenantId);
  const rows = includeAcknowledged
    ? database().prepare("SELECT payload, acknowledged FROM alerts WHERE tenant_id = ? ORDER BY created_at DESC, id LIMIT 200").all(tenantId) as Array<Row & { acknowledged: number }>
    : database().prepare("SELECT payload, acknowledged FROM alerts WHERE tenant_id = ? AND acknowledged = 0 ORDER BY created_at DESC, id LIMIT 200").all(tenantId) as Array<Row & { acknowledged: number }>;
  return rows.map((r) => { const inner = parse<AlertRow>(r); return { ...inner, payload: JSON.parse(inner.payload), acknowledged: r.acknowledged === 1 ? 1 : 0 }; });
}
export function acknowledgeAlert(tenantId: string, id: string): boolean {
  validateTenant(tenantId);
  return database().prepare("UPDATE alerts SET acknowledged = 1 WHERE tenant_id = ? AND id = ?").run(tenantId, id).changes > 0;
}

/* ---------- automation config ---------- */
export function readAutomationConfig(tenantId: string): AutomationConfig {
  validateTenant(tenantId);
  const row = database().prepare("SELECT payload FROM automation_config WHERE tenant_id = ?").get(tenantId) as Row | undefined;
  return row ? parse<AutomationConfig>(row) : {};
}
export function writeAutomationConfig(tenantId: string, config: AutomationConfig): void {
  validateTenant(tenantId);
  database().prepare("INSERT INTO automation_config (tenant_id, payload) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET payload = excluded.payload").run(tenantId, JSON.stringify(config));
}

/** Used by tests and orderly shutdown. */
export function closeOpsStores() { for (const db of connections.values()) db.close(); connections.clear(); }
