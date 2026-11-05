/** Durable multi-process storage for AI visibility on a single local filesystem. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { validTenantId } from "../tenants/store.js";

export interface StoredDataset { id: string; createdAt: string; brands: unknown[]; observations: unknown[] }
type Row = { payload: string };
const connections = new Map<string, Database.Database>();
function root(): string { return path.resolve(process.env.AI_VISIBILITY_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"), "ai-visibility")); }
function validateTenant(id: string) { if (!validTenantId(id)) throw new Error("Invalid tenant"); }
function database(): Database.Database {
  const dir = root(); const file = path.join(dir, "datasets.sqlite3"); const existing = connections.get(file); if (existing) return existing;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Create the database with restrictive permissions before SQLite opens it.
  try { const fd = fs.openSync(file, "wx", 0o600); fs.closeSync(fd); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const db = new Database(file, { timeout: 10000 });
  db.pragma("busy_timeout = 10000"); db.pragma("journal_mode = DELETE"); db.pragma("synchronous = FULL");
  db.exec(`CREATE TABLE IF NOT EXISTS datasets (tenant_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS legacy_imports (tenant_id TEXT PRIMARY KEY, imported_at TEXT NOT NULL);
           CREATE TABLE IF NOT EXISTS competition_state (tenant_id TEXT PRIMARY KEY, payload TEXT NOT NULL);`);
  connections.set(file, db); return db;
}
export function readCompetitionState<T>(tenantId: string, fallback: T): T {
  validateTenant(tenantId); const row = database().prepare("SELECT payload FROM competition_state WHERE tenant_id = ?").get(tenantId) as Row | undefined;
  return row ? parse<T>(row) : fallback;
}
export function updateCompetitionState<T>(tenantId: string, fallback: T, update: (state: T) => void): T {
  validateTenant(tenantId); const db = database();
  const transaction = db.transaction(() => {
    const row = db.prepare("SELECT payload FROM competition_state WHERE tenant_id = ?").get(tenantId) as Row | undefined;
    const state = row ? parse<T>(row) : fallback; update(state);
    db.prepare("INSERT INTO competition_state (tenant_id, payload) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET payload = excluded.payload").run(tenantId, JSON.stringify(state));
    return state;
  }); return transaction.immediate();
}
function parse<T>(row: Row): T { return JSON.parse(row.payload) as T; }
function migrateLegacy(db: Database.Database, tenantId: string) {
  if (db.prepare("SELECT 1 FROM legacy_imports WHERE tenant_id = ?").get(tenantId)) return;
  const migrate = db.transaction(() => {
    if (db.prepare("SELECT 1 FROM legacy_imports WHERE tenant_id = ?").get(tenantId)) return;
    const file = path.join(root(), `${tenantId}.json`);
    if (fs.existsSync(file)) {
      const contents: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(contents)) throw new Error("Invalid legacy dataset file");
      const insert = db.prepare("INSERT OR IGNORE INTO datasets (tenant_id, id, created_at, payload) VALUES (?, ?, ?, ?)");
      const check = db.prepare("SELECT payload FROM datasets WHERE tenant_id = ? AND id = ?");
      for (const entry of contents) {
        if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id || typeof entry.createdAt !== "string" || !Array.isArray(entry.brands) || !Array.isArray(entry.observations)) throw new Error("Invalid legacy dataset");
        const payload = JSON.stringify(entry); insert.run(tenantId, entry.id, entry.createdAt, payload);
        if ((check.get(tenantId, entry.id) as Row).payload !== payload) throw new Error("Legacy dataset ID conflict");
      }
    }
    db.prepare("INSERT INTO legacy_imports (tenant_id, imported_at) VALUES (?, ?)").run(tenantId, new Date().toISOString());
  });
  migrate.immediate();
}
export function listDatasets<T extends StoredDataset>(tenantId: string): T[] {
  validateTenant(tenantId); const db = database(); migrateLegacy(db, tenantId);
  return (db.prepare("SELECT payload FROM datasets WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId) as Row[]).map(parse<T>);
}
export function getDataset<T extends StoredDataset>(tenantId: string, id: string): T | undefined {
  validateTenant(tenantId); const db = database(); migrateLegacy(db, tenantId);
  const row = db.prepare("SELECT payload FROM datasets WHERE tenant_id = ? AND id = ?").get(tenantId, id) as Row | undefined; return row ? parse<T>(row) : undefined;
}
export function insertDataset<T extends StoredDataset>(tenantId: string, data: T) {
  validateTenant(tenantId); const db = database(); migrateLegacy(db, tenantId);
  const insert = db.transaction(() => {
    const count = db.prepare("SELECT COUNT(*) AS n FROM datasets WHERE tenant_id = ?").get(tenantId) as { n: number };
    if (count.n >= 100) throw new Error("Dataset limit reached");
    db.prepare("INSERT INTO datasets (tenant_id, id, created_at, payload) VALUES (?, ?, ?, ?)").run(tenantId, data.id, data.createdAt, JSON.stringify(data));
  }); insert.immediate();
}
export function updateDataset<T extends StoredDataset>(tenantId: string, id: string, update: (dataset: T) => void) {
  validateTenant(tenantId); const db = database(); migrateLegacy(db, tenantId);
  const modify = db.transaction(() => {
    const row = db.prepare("SELECT payload FROM datasets WHERE tenant_id = ? AND id = ?").get(tenantId, id) as Row | undefined;
    if (!row) throw new Error("Dataset not found"); const data = parse<T>(row); update(data);
    db.prepare("UPDATE datasets SET payload = ? WHERE tenant_id = ? AND id = ?").run(JSON.stringify(data), tenantId, id);
  }); modify.immediate();
}
/** Used by tests and orderly shutdown. */
export function closeVisibilityStores() { for (const db of connections.values()) db.close(); connections.clear(); }
