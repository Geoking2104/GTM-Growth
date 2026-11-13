import { z } from "zod";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { validTenantId } from "../tenants/store.js";

export const profileSchema = z.object({
  role: z.enum(["owner", "marketer", "agency", "technical"]).default("owner"),
  goal: z.enum(["traffic", "leads", "sales", "ai-visibility", "local"]).default("traffic"),
  stage: z.enum(["discover", "activate", "grow", "retain", "expand"]).default("activate"),
  audience: z.string().trim().max(200).default(""),
  target: z.object({ metric: z.enum(["clicks", "sessions", "keyEvents"]), value: z.number().finite().positive().max(1e12) }).strict().nullable().default(null),
}).strict();
export type AgentProfile = z.infer<typeof profileSchema>;
const connections = new Map<string, Database.Database>();
export function agentDatabase(): Database.Database {
  const file = path.resolve(process.env.DATA_AGENT_STORE_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"), "data-agent.sqlite3"));
  const existing = connections.get(file); if (existing) return existing;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { fs.closeSync(fs.openSync(file, "wx", 0o600)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const db = new Database(file); db.pragma("journal_mode = DELETE"); db.pragma("busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS profiles (tenant TEXT NOT NULL, principal TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (tenant, principal));
    CREATE TABLE IF NOT EXISTS bridge_nonces (binding TEXT NOT NULL, nonce TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY (binding, nonce));`);
  connections.set(file, db); return db;
}
function identity(tenant: string, principal: string) {
  if (!validTenantId(tenant) || !principal || principal.length > 1000) throw new Error("Invalid agent identity");
}
export function readProfile(tenant: string, principal: string): AgentProfile {
  identity(tenant, principal);
  const row = agentDatabase().prepare("SELECT payload FROM profiles WHERE tenant = ? AND principal = ?").get(tenant, principal) as { payload: string } | undefined;
  return profileSchema.parse(row ? JSON.parse(row.payload) : {});
}
export function saveProfile(tenant: string, principal: string, input: unknown) {
  identity(tenant, principal); const profile = profileSchema.parse(input);
  agentDatabase().prepare("INSERT INTO profiles VALUES (?, ?, ?) ON CONFLICT(tenant, principal) DO UPDATE SET payload = excluded.payload").run(tenant, principal, JSON.stringify(profile));
  return profile;
}
export function claimNonce(binding: string, nonce: string, now: number) {
  const db = agentDatabase();
  return db.transaction(() => {
    db.prepare("DELETE FROM bridge_nonces WHERE expires < ?").run(now);
    return db.prepare("INSERT OR IGNORE INTO bridge_nonces VALUES (?, ?, ?)").run(binding, nonce, now + 600).changes === 1;
  }).immediate();
}
export function closeAgentStores() { for (const db of connections.values()) db.close(); connections.clear(); }
