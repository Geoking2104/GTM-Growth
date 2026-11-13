/** Tenant-scoped API accounts. Credentials are encrypted at rest and never returned. */
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { validTenantId } from "../tenants/store.js";
import { readAIConnections, writeAIConnection, removeAIConnection } from "./ai-visibility-store.js";
import type { ConsoleRoute } from "./util.js";

export const CONNECTION_PROVIDERS = ["openai", "gemini", "claude", "mistral", "grok"] as const;
export type ConnectionProvider = typeof CONNECTION_PROVIDERS[number];
export interface AICredential { key: string; organization?: string; project?: string; workspace?: string }
interface Account { id: string; provider: ConnectionProvider; label: string; fingerprint: string; createdAt: string; sealed: string }
function provider(value: unknown): ConnectionProvider {
  if (!CONNECTION_PROVIDERS.includes(value as ConnectionProvider)) throw new Error("Invalid AI provider");
  return value as ConnectionProvider;
}
function tenant(id: string) { if (!validTenantId(id)) throw new Error("Invalid tenant"); return id; }
function masterKey(): Buffer {
  const configured = process.env.AI_CONNECTIONS_MASTER_KEY;
  if (configured) {
    if (!/^[a-f0-9]{64}$/i.test(configured)) throw new Error("Invalid AI account encryption configuration");
    return Buffer.from(configured, "hex");
  }
  const root = path.resolve(process.env.AI_VISIBILITY_PATH ?? path.join(path.dirname(process.env.TENANTS_PATH ?? "data/tenants.json"), "ai-visibility"));
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, "accounts.key");
  if (!fs.existsSync(file)) {
    const temp = `${file}.${randomUUID()}`;
    fs.writeFileSync(temp, randomBytes(32), { flag: "wx", mode: 0o600 });
    try { fs.linkSync(temp, file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    finally { fs.unlinkSync(temp); }
  }
  const key = fs.readFileSync(file);
  if (key.length !== 32 || (fs.statSync(file).mode & 0o077) !== 0) throw new Error("Invalid AI account encryption configuration");
  return key;
}
function seal(value: AICredential, aad: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString("base64");
}
function unseal(value: string, aad: string): AICredential {
  try {
    const bytes = Buffer.from(value, "base64"), decipher = createDecipheriv("aes-256-gcm", masterKey(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
  } catch { throw new Error("AI account could not be decrypted; reconnect the account or restore its encryption key"); }
}
const aad = (tenantId: string, p: ConnectionProvider, id: string) => JSON.stringify([tenantId, p, id]);
function environmentKey(tenantId: string, p: ConnectionProvider) { return process.env[`AI_VISIBILITY_${p.toUpperCase()}_KEY_${tenant(tenantId).toUpperCase().replace(/-/g, "_")}`] || ""; }
export function listAIAccounts(tenantId: string, p: ConnectionProvider) {
  tenant(tenantId); provider(p);
  const accounts = readAIConnections<Account>(tenantId).filter(a => a.provider === p).map(({ sealed: _secret, ...a }) => ({ ...a, kind: "saved" }));
  if (environmentKey(tenantId, p)) accounts.unshift({ id: "server", provider: p, label: "Server configuration", fingerprint: "", createdAt: "", kind: "server" });
  return accounts;
}
export function resolveAIAccount(tenantId: string, p: ConnectionProvider, id?: unknown): AICredential {
  tenant(tenantId); provider(p);
  // Legacy callers may use their tenant's server key; a supplied ID never falls back.
  if (id === undefined || id === "server") {
    const key = environmentKey(tenantId, p);
    if (!key) throw new Error("Connect and select an AI API account before collection");
    return { key };
  }
  if (typeof id !== "string") throw new Error("Select an AI API account");
  const account = readAIConnections<Account>(tenantId).find(a => a.id === id && a.provider === p);
  if (!account) throw new Error("AI account not found in this workspace; choose another account");
  return unseal(account.sealed, aad(tenantId, p, id));
}
function credential(input: Record<string, unknown>, p: ConnectionProvider): AICredential {
  if (typeof input.key !== "string" || !/^[\x21-\x7e]{20,4096}$/.test(input.key.trim())) throw new Error("Enter a valid API key, not a password or session token");
  const result: AICredential = { key: input.key.trim() };
  for (const field of ["organization", "project", "workspace"] as const) {
    if (!input[field]) continue;
    if ((field === "workspace" ? p !== "claude" : p !== "openai") || typeof input[field] !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input[field] as string)) throw new Error("Invalid API account scope");
    result[field] = input[field] as string;
  }
  return result;
}
export function accountHeaders(p: ConnectionProvider, account: AICredential): Record<string, string> {
  if (p === "gemini") return { "x-goog-api-key": account.key };
  if (p === "claude") return { "x-api-key": account.key, "anthropic-version": "2023-06-01", ...(account.workspace ? { "anthropic-workspace-id": account.workspace } : {}) };
  return { Authorization: `Bearer ${account.key}`, ...(p === "openai" && account.organization ? { "OpenAI-Organization": account.organization } : {}), ...(p === "openai" && account.project ? { "OpenAI-Project": account.project } : {}) };
}
const modelUrls = { openai: "https://api.openai.com/v1/models", gemini: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", claude: "https://api.anthropic.com/v1/models?limit=1", mistral: "https://api.mistral.ai/v1/models", grok: "https://api.x.ai/v1/models" };
export async function verifyAIAccount(p: ConnectionProvider, account: AICredential, transport: typeof fetch = fetch) {
  let response;
  try { response = await transport(modelUrls[p], { headers: accountHeaders(p, account), signal: AbortSignal.timeout(12000), redirect: "error" }); }
  catch { throw new Error("Account check unavailable; retry later (no generation requested)"); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Account check HTTP ${response.status}; verify API key, project/workspace access and provider availability`);
  }
  try {
    const data = await response.json() as Record<string, unknown>;
    if (!data || !Array.isArray(p === "gemini" ? data.models : data.data)) throw new Error();
  } catch { throw new Error("Account check returned an invalid model list; retry later"); }
  return { verifiedAt: new Date().toISOString(), generationTested: false };
}
export async function connectAIAccount(tenantId: string, input: Record<string, unknown>, transport: typeof fetch = fetch) {
  tenant(tenantId); const p = provider(input.provider), account = credential(input, p);
  if (input.confirmed !== true) throw new Error("Confirm sharing this API account with workspace administrators");
  if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 80 || /[\x00-\x1f]/.test(input.label)) throw new Error("Name this API account (1–80 characters)");
  const checked = await verifyAIAccount(p, account, transport);
  const id = randomUUID(), record: Account = { id, provider: p, label: input.label.trim(), fingerprint: createHash("sha256").update(account.key).digest("hex").slice(0, 8), createdAt: checked.verifiedAt, sealed: seal(account, aad(tenantId, p, id)) };
  writeAIConnection(tenantId, id, record);
  return { id, ...checked };
}
export const aiConnectionRoutes: ConsoleRoute[] = [
  { path: "/ai-visibility/accounts", needsUrl: false, adminOnly: true, handler: async ctx => ({ accounts: listAIAccounts(tenant(ctx.tenancy?.tenant?.id || ""), provider(ctx.body.provider)) }) },
  { path: "/ai-visibility/accounts/connect", needsUrl: false, adminOnly: true, handler: async ctx => connectAIAccount(tenant(ctx.tenancy?.tenant?.id || ""), ctx.body) },
  { path: "/ai-visibility/accounts/check", needsUrl: false, adminOnly: true, handler: async ctx => { const p = provider(ctx.body.provider); return verifyAIAccount(p, resolveAIAccount(tenant(ctx.tenancy?.tenant?.id || ""), p, ctx.body.accountId)); } },
  { path: "/ai-visibility/accounts/disconnect", needsUrl: false, adminOnly: true, handler: async ctx => {
    const id = tenant(ctx.tenancy?.tenant?.id || ""), p = provider(ctx.body.provider);
    if (ctx.body.confirmed !== true || typeof ctx.body.accountId !== "string" || ctx.body.accountId === "server") throw new Error("Confirm removal of a saved account");
    if (!listAIAccounts(id, p).some(a => a.id === ctx.body.accountId)) throw new Error("AI account not found");
    removeAIConnection(id, ctx.body.accountId); return { disconnected: true };
  } },
];
