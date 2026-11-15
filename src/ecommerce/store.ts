/** Tenant-scoped SQLite persistence for e-commerce connectors: connected
 * stores (with encrypted credentials), products, orders, sync cursors and
 * webhook idempotency keys. Same conventions as ops-store.ts. */
import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { validTenantId } from "../tenants/store.js";
import type { Order, Product, Store, SyncCursor } from "./types.js";

export interface StoreConnection extends Store {
  /** AES-256-GCM sealed credentials — never returned to the browser. */
  credentialsSealed: string;
  webhookSecretSealed: string | null;
  scopes: string[];
}

type Row = { payload: string };
const connections = new Map<string, Database.Database>();
const now = () => new Date().toISOString();

function root(): string { return path.resolve(process.env.ECOMMERCE_STORE_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"), "ecommerce")); }
function validateTenant(id: string) { if (!validTenantId(id)) throw new Error("Invalid tenant"); }

export function database(): Database.Database {
  const dir = root(); const file = path.join(dir, "ecommerce.sqlite3"); const existing = connections.get(file); if (existing) return existing;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { const fd = fs.openSync(file, "wx", 0o600); fs.closeSync(fd); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const db = new Database(file, { timeout: 10000 });
  db.pragma("busy_timeout = 10000"); db.pragma("journal_mode = DELETE"); db.pragma("synchronous = FULL");
  db.exec(`CREATE TABLE IF NOT EXISTS stores (tenant_id TEXT NOT NULL, id TEXT NOT NULL, connected_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS products (tenant_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE TABLE IF NOT EXISTS orders (tenant_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, id));
           CREATE UNIQUE INDEX IF NOT EXISTS orders_number ON orders (tenant_id, id);
           CREATE TABLE IF NOT EXISTS sync_cursors (tenant_id TEXT NOT NULL, resource TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant_id, resource));
           CREATE TABLE IF NOT EXISTS webhook_events (tenant_id TEXT NOT NULL, event_id TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY (tenant_id, event_id));`);
  db.exec("CREATE TABLE IF NOT EXISTS commerce_crm_outbox(tenant_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,observed_at TEXT NOT NULL,delivered INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant_id,id)); CREATE INDEX IF NOT EXISTS crm_outbox_pending ON commerce_crm_outbox(tenant_id,delivered,observed_at);");
  connections.set(file, db); return db;
}

const parse = <T>(row: Row): T => JSON.parse(row.payload) as T;
/** Public shape of a connection: no sealed secret ever leaves the store. */
export const publicStore = (s: StoreConnection) => ({ id: s.id, provider: s.provider, domain: s.domain, currency: s.currency, timezone: s.timezone, connectedAt: s.connectedAt, status: s.status, scopes: s.scopes });

/* ---------- connections ---------- */

export function listConnections(tenantId: string): StoreConnection[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT payload FROM stores WHERE tenant_id = ? ORDER BY connected_at, id").all(tenantId) as Row[]).map(parse<StoreConnection>);
}
export function getConnection(tenantId: string, storeId: string): StoreConnection | undefined {
  validateTenant(tenantId);
  const row = database().prepare("SELECT payload FROM stores WHERE tenant_id = ? AND id = ?").get(tenantId, storeId) as Row | undefined;
  return row ? parse<StoreConnection>(row) : undefined;
}
export function saveConnection(tenantId: string, connection: StoreConnection): void {
  validateTenant(tenantId);
  database().prepare("INSERT INTO stores (tenant_id, id, connected_at, payload) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, id) DO UPDATE SET payload = excluded.payload, connected_at = excluded.connected_at").run(tenantId, connection.id, connection.connectedAt, JSON.stringify(connection));
}
export function removeConnection(tenantId: string, storeId: string): boolean {
  validateTenant(tenantId);
  const db = database();
  const removed = db.prepare("DELETE FROM stores WHERE tenant_id = ? AND id = ?").run(tenantId, storeId).changes > 0;
  db.prepare("DELETE FROM products WHERE tenant_id = ? AND id LIKE ?").run(tenantId, `${storeId}:%`);
  db.prepare("DELETE FROM orders WHERE tenant_id = ? AND json_extract(payload,'$.storeId') = ?").run(tenantId, storeId);
  db.prepare("DELETE FROM commerce_crm_outbox WHERE tenant_id = ? AND json_extract(payload,'$.storeId') = ?").run(tenantId, storeId);
  db.prepare("DELETE FROM sync_cursors WHERE tenant_id = ? AND json_extract(payload,'$.storeId') = ?").run(tenantId, storeId);
  return removed;
}

/* ---------- products & orders ---------- */

export function upsertProducts(tenantId: string, products: Product[]): void {
  validateTenant(tenantId);
  const stmt = database().prepare("INSERT INTO products (tenant_id, id, updated_at, payload) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at");
  const write = database().transaction((rows: Product[]) => { for (const p of rows) stmt.run(tenantId, p.id, p.updatedAt, JSON.stringify(p)); });
  write(products);
}
export function listProducts(tenantId: string, storeId: string): Product[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT payload FROM products WHERE tenant_id = ? AND id LIKE ? ORDER BY updated_at DESC, id").all(tenantId, `${storeId}:%`) as Row[]).map(parse<Product>);
}
export function getProductId(tenantId: string, id: string): Product | undefined {
  validateTenant(tenantId);
  const row = database().prepare("SELECT payload FROM products WHERE tenant_id = ? AND id = ?").get(tenantId, id) as Row | undefined;
  return row ? parse<Product>(row) : undefined;
}

/** Upsert keyed by canonical order id: webhook replay or out-of-order delivery
 * (e.g. orders/paid before orders/create) never duplicates a row. */
export function upsertOrder(tenantId:string,order:Order):{inserted:boolean;order:Order}{
 validateTenant(tenantId);if(order.customerRef&&!/^cust_[a-f0-9]{24}$/.test(order.customerRef))throw new Error('ECOMMERCE_CUSTOMER_NOT_PSEUDONYMIZED');
 const db=database();return db.transaction(()=>{
 const canonical=order.id.startsWith(order.storeId+':')?order.id:order.storeId+':'+order.id;
 const row=db.prepare("SELECT payload FROM orders WHERE tenant_id=? AND (id=? OR (id=? AND json_extract(payload,'$.storeId')=?)) ORDER BY id=? DESC LIMIT 1").get(tenantId,canonical,order.id,order.storeId,canonical) as Row|undefined;
 const existing=row?parse<Order>(row):undefined;
 if(existing?.updatedAt&&order.updatedAt&&Number.isFinite(Date.parse(existing.updatedAt))&&Number.isFinite(Date.parse(order.updatedAt))&&Date.parse(order.updatedAt)<Date.parse(existing.updatedAt))return {inserted:false,order:existing};
 const merged:Order={...(existing??{}),...order,id:canonical,lines:order.lines.length?order.lines:existing?.lines??[]};
 db.prepare('INSERT INTO orders (tenant_id,id,created_at,payload) VALUES (?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at').run(tenantId,canonical,merged.createdAt,JSON.stringify(merged));
 if(existing&&existing.id!==canonical)db.prepare('DELETE FROM orders WHERE tenant_id=? AND id=?').run(tenantId,existing.id);
 if(!existing||sha256(JSON.stringify({...existing,id:canonical}))!==sha256(JSON.stringify(merged)))queueCrmOrder(tenantId,merged);
 return {inserted:!existing,order:merged};
 }).immediate();
}
export function queueCrmOrder(tenantId:string,order:Order){validateTenant(tenantId);if(order.customerRef&&!/^cust_[a-f0-9]{24}$/.test(order.customerRef))return;const id=sha256(JSON.stringify([order.storeId,order.id,order.updatedAt??null,order.status,order.total,order.currency,order.customerRef]));database().prepare('INSERT OR IGNORE INTO commerce_crm_outbox(tenant_id,id,payload,observed_at) VALUES (?,?,?,?)').run(tenantId,id,JSON.stringify({id:order.id,storeId:order.storeId,provider:order.provider,number:order.number,createdAt:order.createdAt,updatedAt:order.updatedAt,currency:order.currency,total:order.total,status:order.status,customerRef:order.customerRef}),now());}
export function pendingCrmOrders(tenantId:string,limit=250){validateTenant(tenantId);return database().prepare('SELECT id,payload,observed_at FROM commerce_crm_outbox WHERE tenant_id=? AND delivered=0 ORDER BY observed_at,id LIMIT ?').all(tenantId,Math.min(limit,500)) as Array<{id:string;payload:string;observed_at:string}>;}
export function acknowledgeCrmOrder(tenantId:string,id:string){validateTenant(tenantId);database().prepare('UPDATE commerce_crm_outbox SET delivered=1 WHERE tenant_id=? AND id=?').run(tenantId,id);}
export function listOrders(tenantId: string, storeId: string, limit = 200): Order[] {
  validateTenant(tenantId);
  return (database().prepare("SELECT payload FROM orders WHERE tenant_id = ? AND json_extract(payload,'$.storeId') = ? ORDER BY created_at DESC, id LIMIT ?").all(tenantId, storeId, limit) as Row[]).map(parse<Order>);
}
export function getOrder(tenantId: string, id: string): Order | undefined {
  validateTenant(tenantId);
  const row = database().prepare("SELECT payload FROM orders WHERE tenant_id = ? AND id = ?").get(tenantId, id) as Row | undefined;
  return row ? parse<Order>(row) : undefined;
}

/* ---------- sync cursors ---------- */

export function readCursor(tenantId: string, resource: "products" | "orders", storeId?:string): SyncCursor | null {
  validateTenant(tenantId);
  const row = database().prepare("SELECT payload FROM sync_cursors WHERE tenant_id = ? AND resource = ?").get(tenantId, storeId?`${storeId}:${resource}`:resource) as Row | undefined;
  return row ? parse<SyncCursor>(row) : null;
}
export function writeCursor(tenantId: string, cursor: SyncCursor): void {
  validateTenant(tenantId);
  database().prepare("INSERT INTO sync_cursors (tenant_id, resource, payload) VALUES (?, ?, ?) ON CONFLICT(tenant_id, resource) DO UPDATE SET payload = excluded.payload").run(tenantId, `${cursor.storeId}:${cursor.resource}`, JSON.stringify(cursor));
}

/* ---------- webhook idempotency ---------- */

/** Returns false when the event was already processed (replay). Key: provider event id. */
export function claimWebhookEvent(tenantId: string, eventId: string): boolean {
  validateTenant(tenantId);
  const db = database();
  const res = db.prepare("INSERT INTO webhook_events (tenant_id, event_id, received_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id, event_id) DO NOTHING").run(tenantId, eventId, now());
  return res.changes > 0;
}

/* ---------- pseudonymization ---------- */

/** Stable per-tenant pseudonym: keyed HMAC of the provider customer id. */
export function customerPseudonym(tenantId: string, providerCustomerId: string, secret: Buffer): string {
  return `cust_${createHmac("sha256", secret).update(`${tenantId}:${providerCustomerId}`).digest("hex").slice(0, 24)}`;
}

export const newId = () => randomUUID();
export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Used by tests and orderly shutdown. */
export function closeEcommerceStores() { for (const db of connections.values()) db.close(); connections.clear(); }
