/** One durable local planning store, bound to the existing persistent data volume. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { validTenantId } from '../tenants/store.js';
import { ScenarioError, evidenceSchema, type Evidence } from './model.js';
const connections = new Map<string, Database.Database>();
export function scenarioDb(): Database.Database {
  const file = path.resolve(process.env.SCENARIOS_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? 'data/tenants.json'), 'scenarios.sqlite3'));
  const existing = connections.get(file); if (existing) return existing;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { fs.closeSync(fs.openSync(file, 'wx', 0o600)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const db = new Database(file); db.pragma('busy_timeout = 10000'); db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL'); db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenario_plans(tenant TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant,id));
    CREATE TABLE IF NOT EXISTS scenario_revisions(tenant TEXT NOT NULL,plan_id TEXT NOT NULL,version INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant,plan_id,version),FOREIGN KEY(tenant,plan_id) REFERENCES scenario_plans(tenant,id));
    CREATE TABLE IF NOT EXISTS scenario_comments(tenant TEXT NOT NULL,plan_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(tenant,id),FOREIGN KEY(tenant,plan_id) REFERENCES scenario_plans(tenant,id));
    CREATE TABLE IF NOT EXISTS scenario_proposals(tenant TEXT NOT NULL,plan_id TEXT NOT NULL,id TEXT NOT NULL,base_version INTEGER NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL,expires_at TEXT NOT NULL,accepted_version INTEGER,PRIMARY KEY(tenant,id),FOREIGN KEY(tenant,plan_id) REFERENCES scenario_plans(tenant,id));
    CREATE TABLE IF NOT EXISTS scenario_source_evidence(tenant TEXT NOT NULL,id TEXT NOT NULL,observed_at TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant,id));
    CREATE INDEX IF NOT EXISTS scenario_plans_recent ON scenario_plans(tenant,updated_at DESC);
    CREATE INDEX IF NOT EXISTS scenario_comments_recent ON scenario_comments(tenant,plan_id,created_at);
    CREATE INDEX IF NOT EXISTS scenario_proposals_recent ON scenario_proposals(tenant,plan_id,expires_at);
  `);
  connections.set(file, db); return db;
}
export function assertTenant(tenant: string): void { if (!validTenantId(tenant)) throw new ScenarioError(403, 'SCENARIO_ACCESS'); }
export function assertActor(actor: string): void { if (typeof actor !== 'string' || !actor.trim() || actor.length > 200) throw new ScenarioError(403, 'SCENARIO_ACCESS'); }
/** Retain every revision; reject the transaction instead of silently discarding history. */
export const SCENARIO_STORAGE_LIMIT_BYTES = 128 * 1024 * 1024;
export function assertScenarioCapacity(tenant: string): void {
  assertTenant(tenant);
  const row = scenarioDb().prepare(`SELECT SUM(size) AS bytes FROM (
    SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS size FROM scenario_plans WHERE tenant=?
    UNION ALL SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM scenario_revisions WHERE tenant=?
    UNION ALL SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM scenario_comments WHERE tenant=?
    UNION ALL SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM scenario_proposals WHERE tenant=?
    UNION ALL SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM scenario_source_evidence WHERE tenant=?
  )`).get(tenant, tenant, tenant, tenant, tenant) as { bytes: number };
  if (row.bytes > SCENARIO_STORAGE_LIMIT_BYTES) throw new ScenarioError(413, 'SCENARIO_STORAGE_LIMIT', 'The workspace reached its 128 MiB planning storage limit. Export your plans and contact your administrator about retention. Reads remain available.');
}
export function storeScenarioEvidence(tenant: string, evidence: Evidence[]): void {
  assertTenant(tenant);
  if (evidence.length > 500) throw new ScenarioError(413, 'SCENARIO_CAPACITY');
  const parsed = evidence.map(item => evidenceSchema.parse(item));
  scenarioDb().transaction(() => {
    for (const item of parsed) {
      const payload = JSON.stringify(item), existing = scenarioDb().prepare('SELECT payload FROM scenario_source_evidence WHERE tenant=? AND id=?').get(tenant, item.id) as { payload: string } | undefined;
      if (existing && existing.payload !== payload) throw new ScenarioError(409, 'SCENARIO_EVIDENCE_CHANGED');
      scenarioDb().prepare('INSERT OR IGNORE INTO scenario_source_evidence VALUES (?,?,?,?)').run(tenant, item.id, item.observedAt, payload);
    }
    scenarioDb().prepare('DELETE FROM scenario_source_evidence WHERE tenant=? AND id NOT IN (SELECT id FROM scenario_source_evidence WHERE tenant=? ORDER BY observed_at DESC,id LIMIT 1000)').run(tenant, tenant);
    assertScenarioCapacity(tenant);
  }).immediate();
}
export function listScenarioEvidence(tenant: string): Evidence[] {
  assertTenant(tenant);
  return (scenarioDb().prepare('SELECT payload FROM scenario_source_evidence WHERE tenant=? ORDER BY observed_at DESC,id LIMIT 1000').all(tenant) as Array<{ payload: string }>).map(row => JSON.parse(row.payload));
}
export function closeScenarioStores(): void { for (const db of connections.values()) db.close(); connections.clear(); }
