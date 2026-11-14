import fs from "node:fs";
import path from "node:path";
import { randomBytes, createHmac } from "node:crypto";
import Database from "better-sqlite3";
import { validTenantId } from "../tenants/store.js";
import { hash, now, uuid, type Settings } from "./model.js";
const connections = new Map<string, Database.Database>();
export function database(): Database.Database {
  const file = path.resolve(
    process.env.CRM_PATH ??
      path.join(
        path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"),
        "crm.sqlite3",
      ),
  );
  let db = connections.get(file);
  if (db) return db;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.closeSync(fs.openSync(file, "wx", 0o600));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  db = new Database(file);
  db.pragma("busy_timeout=10000");
  db.pragma("synchronous=FULL");
  db.exec(`
 CREATE TABLE IF NOT EXISTS crm_settings(tenant TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS crm_keys(tenant TEXT PRIMARY KEY,secret TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS crm_contacts(tenant TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant,id));
 CREATE TABLE IF NOT EXISTS crm_bindings(tenant TEXT NOT NULL,key TEXT NOT NULL,profile_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant,key));
 CREATE INDEX IF NOT EXISTS crm_binding_profile ON crm_bindings(tenant,profile_id);
 CREATE TABLE IF NOT EXISTS crm_events(tenant TEXT NOT NULL,id TEXT NOT NULL,source TEXT NOT NULL,event_key TEXT NOT NULL,identity_key TEXT NOT NULL,occurred_at TEXT NOT NULL,channel TEXT NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant,id),UNIQUE(tenant,source,event_key));
 CREATE INDEX IF NOT EXISTS crm_event_identity ON crm_events(tenant,identity_key,occurred_at,id);
 CREATE TABLE IF NOT EXISTS crm_blocked(tenant TEXT NOT NULL,key TEXT NOT NULL,PRIMARY KEY(tenant,key));
 CREATE TABLE IF NOT EXISTS crm_receipts(tenant TEXT NOT NULL,actor TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant,actor,key));
 CREATE TABLE IF NOT EXISTS crm_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT NOT NULL,payload TEXT NOT NULL);
 `);
  connections.set(file, db);
  return db;
}
export function valid(tenant: string) {
  if (!validTenantId(tenant)) throw new Error("CRM_ACCESS");
}
export function transaction<T>(tenant: string, fn: () => T): T {
  valid(tenant);
  return database().transaction(fn).immediate();
}
export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  const row = database()
    .prepare(sql)
    .get(...params) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : undefined;
}
export function many<T>(sql: string, ...params: unknown[]): T[] {
  return (
    database()
      .prepare(sql)
      .all(...params) as Array<{ payload: string }>
  ).map((r) => JSON.parse(r.payload));
}
export function settings(tenant: string): Settings {
  valid(tenant);
  return (
    one<Settings>(
      "SELECT payload FROM crm_settings WHERE tenant=?",
      tenant,
    ) ?? { enabled: false, mode: "native", roles: {} }
  );
}
export function saveSettings(tenant: string, s: Settings) {
  database()
    .prepare(
      "INSERT INTO crm_settings VALUES (?,?) ON CONFLICT(tenant) DO UPDATE SET payload=excluded.payload",
    )
    .run(tenant, JSON.stringify(s));
}
export function identityKey(
  tenant: string,
  kind: string,
  scope: string,
  value: string,
) {
  valid(tenant);
  let row = database()
    .prepare("SELECT secret FROM crm_keys WHERE tenant=?")
    .get(tenant) as { secret: string } | undefined;
  if (!row) {
    const key = randomBytes(32).toString("base64");
    database()
      .prepare("INSERT OR IGNORE INTO crm_keys VALUES (?,?)")
      .run(tenant, key);
    row = database()
      .prepare("SELECT secret FROM crm_keys WHERE tenant=?")
      .get(tenant) as { secret: string };
  }
  return createHmac("sha256", Buffer.from(row.secret, "base64"))
    .update(JSON.stringify([tenant, kind, scope, value]))
    .digest("hex");
}
export function audit(
  tenant: string,
  actor: string,
  action: string,
  target: string,
  detail?: string,
) {
  const prior = one<{ hash: string }>(
    "SELECT payload FROM crm_audit WHERE tenant=? ORDER BY seq DESC LIMIT 1",
    tenant,
  );
  const value = {
    id: uuid(),
    at: now(),
    actor,
    action,
    target,
    ...(detail ? { detail } : {}),
    previous: prior?.hash ?? "",
  };
  database()
    .prepare("INSERT INTO crm_audit(tenant,payload) VALUES (?,?)")
    .run(tenant, JSON.stringify({ ...value, hash: hash(value) }));
}
export function idempotent<T>(
  tenant: string,
  actor: string,
  key: string,
  input: unknown,
  fn: () => T,
): T {
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(key)) throw new Error("CRM_INVALID_KEY");
  return transaction(tenant, () => {
    const digest = hash(input),
      row = database()
        .prepare(
          "SELECT hash,payload FROM crm_receipts WHERE tenant=? AND actor=? AND key=?",
        )
        .get(tenant, actor, key) as
        | { hash: string; payload: string }
        | undefined;
    if (row) {
      if (row.hash !== digest) throw new Error("CRM_IDEMPOTENCY_CONFLICT");
      return JSON.parse(row.payload);
    }
    const result = fn();
    database()
      .prepare("INSERT INTO crm_receipts VALUES (?,?,?,?,?)")
      .run(tenant, actor, key, digest, JSON.stringify(result));
    return result;
  });
}
export function blocked(tenant: string, key: string) {
  return !!database()
    .prepare("SELECT 1 FROM crm_blocked WHERE tenant=? AND key=?")
    .get(tenant, key);
}
export function closeCrmStores() {
  for (const db of connections.values()) db.close();
  connections.clear();
}
