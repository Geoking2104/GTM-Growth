/** Durable workspace UI state; no connector credentials or cross-tenant index. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { validTenantId } from "../tenants/store.js";
export interface Review {
  id: string; kind: string; title: string; target: string; origin: string;
  author: string; createdAt: string; expiresAt: string; digest: string;
  status: "proposed" | "approved" | "rejected" | "executing" | "completed" | "uncertain";
  payload: any; baseline?: string; approval?: { actor: string; at: string; comment: string };
  result?: unknown; error?: string; dispatchedAt?: string;
}
export interface IntentEvidence {
  id: string; source: "gsc" | "bing" | "ai"; query: string; page: string | null;
  clicks: number | null; impressions: number | null; ctr: number | null; position: number | null;
  observedAt: string; period: string; sourceScope: string; detail?: string;
  responseId?: string;
  ai?: { answer: string; citations: string[]; source: string; brand: string; cohort: string };
}
export interface IntentPin { id: string; stage: string; targetUrl: string; evidence: IntentEvidence; actor: string; at: string; }
export interface EditorialDraft {
  title: string; slug: string; body: string; metaDescription: string;
  outline: Array<{ h2: string; bullets: string[] }>; entities?: string[];
}
export interface EditorialBrief {
  pinId: string; revision: number; draft: EditorialDraft; savedAt: string;
}
export interface EditorialIntervention {
  reviewId: string; pinId: string; revision: number; effectiveAt: string; verifiedAt: string; postId: number;
}
export interface DecisionState {
  version: number; reviews: Review[]; audits: any[]; evidence: IntentEvidence[]; pins: IntentPin[];
  auditLog: Array<{ at: string; actor: string; action: string; target: string }>;
  overviews?: Array<{ url: string; at: string; score: number | null }>;
  editorialBriefs?: EditorialBrief[];
  editorialInterventions?: EditorialIntervention[];
}
const connections = new Map<string, Database.Database>();
function db() {
  const file = path.resolve(process.env.DECISION_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"), "decision.sqlite3"));
  if (connections.has(file)) return connections.get(file)!;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { fs.closeSync(fs.openSync(file, "wx", 0o600)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const database = new Database(file); database.pragma("busy_timeout = 10000"); database.pragma("synchronous = FULL");
  database.exec("CREATE TABLE IF NOT EXISTS decision_state(tenant TEXT PRIMARY KEY,payload TEXT NOT NULL)");
  connections.set(file, database); return database;
}
export function readDecision(tenant: string): DecisionState {
  if (!validTenantId(tenant)) throw new Error("DECISION_ACCESS");
  const row = db().prepare("SELECT payload FROM decision_state WHERE tenant=?").get(tenant) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : { version: 0, reviews: [], audits: [], evidence: [], pins: [], auditLog: [] };
}
export function changeDecision<T>(tenant: string, change: (s: DecisionState) => T): T {
  return db().transaction(() => {
    const s = readDecision(tenant), result = change(s); s.version++;
    s.audits = s.audits.slice(-30); s.auditLog = s.auditLog.slice(-5000);
    if (s.reviews.length > 1000 || s.pins.length > 500 || s.evidence.length > 500 || JSON.stringify(s).length > 8_000_000) throw new Error("DECISION_CAPACITY");
    db().prepare("INSERT INTO decision_state VALUES (?,?) ON CONFLICT(tenant) DO UPDATE SET payload=excluded.payload").run(tenant, JSON.stringify(s)); return result;
  }).immediate();
}
export function logDecision(s: DecisionState, actor: string, action: string, target: string) { s.auditLog.push({ at: new Date().toISOString(), actor, action, target }); }
export function closeDecisionStores() { for (const d of connections.values()) d.close(); connections.clear(); }
