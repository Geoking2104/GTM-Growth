/** Durable tenant-isolated state. Mutations run under an immediate SQLite transaction. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { validTenantId } from "../tenants/store.js";
import type { LocalState } from "./model.js";
const connections = new Map<string, Database.Database>();
export const initial = (): LocalState => ({ sites: [], grants: {}, observations: [], actions: [], audit: [] });
function database() {
  const file = path.resolve(process.env.LOCAL_SEO_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"), "local-seo.sqlite3"));
  let db = connections.get(file); if (db) return db;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { fs.closeSync(fs.openSync(file, "wx", 0o600)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  db = new Database(file); db.pragma("busy_timeout = 10000"); db.pragma("synchronous = FULL");
  db.exec("CREATE TABLE IF NOT EXISTS local_state (tenant TEXT PRIMARY KEY, payload TEXT NOT NULL)");
  connections.set(file, db); return db;
}
export function readState(tenant: string): LocalState {
  if (!validTenantId(tenant)) throw new Error("Invalid tenant");
  const row = database().prepare("SELECT payload FROM local_state WHERE tenant = ?").get(tenant) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : initial();
}
export function updateState<T>(tenant: string, mutate: (s: LocalState) => T): T {
  const db = database(); return db.transaction(() => {
    const state = readState(tenant); const result = mutate(state);
    db.prepare("INSERT INTO local_state VALUES (?, ?) ON CONFLICT(tenant) DO UPDATE SET payload = excluded.payload").run(tenant, JSON.stringify(state));
    return result;
  }).immediate();
}
export function closeLocalStores() { for (const db of connections.values()) db.close(); connections.clear(); }
