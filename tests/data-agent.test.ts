import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { TenantStore, type Tenant } from "../src/tenants/store.js";
import { buildConsoleRouter } from "../src/console/api.js";
import { dataAgentRoutes } from "../src/console/data-agent.js";
import { buildDataAgentBridge, bridgeSignature, loadBindings } from "../src/data-agent/bridge.js";
import { readModel, nextActions } from "../src/data-agent/service.js";
import { closeAgentStores, profileSchema, readProfile, saveProfile } from "../src/data-agent/profile.js";
import { insertDataset, closeVisibilityStores } from "../src/console/ai-visibility-store.js";
import { normalizeImport } from "../src/console/ai-visibility.js";
import { currentKeyFile } from "../src/auth/service-account.js";

const dir = mkdtempSync(join(tmpdir(), "gtm-agent-"));
const issuer = "https://auth.example/realms/gtm";
const tenant = (id: string): Tenant => ({ id, name: id, mode: "organization", issuer, domains: [`${id}.example`], emailDomains: [], gscProperties: [`sc-domain:${id}.example`], ga4Properties: [id === "acme" ? "123" : "456"], bingSites: [id + ".example"], googleCredential: `${id}.json`, branding: {}, identityProviders: [], status: "active", createdAt: "2026-01-01" });
const acme = tenant("acme"), other = tenant("other");
const store = new TenantStore(join(dir, "tenants.json"));
store.upsert(acme); store.upsert(other);
const secret = "test-only-secret-".repeat(3);
const bindingsFile = join(dir, "bindings.json");
const binding = { tenantId: "acme", teamId: "T123", channelIds: ["C123"], userIds: ["U123"], secretEnv: "GTM_AGENT_SECRET_ACME" };
const env = { GTM_DATA_AGENT_BINDINGS_FILE: bindingsFile, GTM_AGENT_SECRET_ACME: secret };
writeFileSync(bindingsFile, JSON.stringify([binding]));
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" };
const jwt = (id: string, sub = "u1") => {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const data = `${b64({ alg: "RS256", kid: "test" })}.${b64({ iss: issuer, aud: "gtm-console", sub, exp: Math.floor(Date.now() / 1000) + 120, organization: [id], groups: [`/tenants/${id}/tenant-user`] })}`;
  return `${data}.${sign("sha256", Buffer.from(data), privateKey).toString("base64url")}`;
};
const app = express();
app.use("/bridge", buildDataAgentBridge({ store, env }));
app.use(express.json());
app.use("/console", buildConsoleRouter(dataAgentRoutes, { store, config: { issuer, clientId: "gtm-console", jwksUrl: issuer + "/certs" }, jwksLoader: async () => ({ keys: [jwk] }) }));
let server: ReturnType<typeof app.listen>, base: string;
beforeAll(async () => {
  vi.stubEnv("DATA_AGENT_STORE_PATH", join(dir, "agent.sqlite3")); vi.stubEnv("AI_VISIBILITY_PATH", join(dir, "visibility"));
  vi.stubEnv("OPS_STORE_PATH", join(dir, "ops")); vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", join(dir, "base.json"));
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); closeAgentStores(); closeVisibilityStores(); vi.unstubAllEnvs(); });
const consoleCall = (route: string, body: unknown, id = "acme", selected = id) => fetch(base + "/console/data-agent/" + route, { method: "POST", headers: { Authorization: "Bearer " + jwt(id), "X-Tenant": selected, "Content-Type": "application/json" }, body: JSON.stringify(body) });
function signed(input: object, extra: { timestamp?: string; nonce?: string; secret?: string } = {}) {
  const body = JSON.stringify({ operation: "query", model: "workspace", teamId: "T123", channelId: "C123", userId: "U123", ...input });
  const ts = extra.timestamp ?? String(Math.floor(Date.now() / 1000)), nonce = extra.nonce ?? randomUUID();
  return { method: "POST", headers: { "Content-Type": "application/json", "X-GTM-Timestamp": ts, "X-GTM-Nonce": nonce, "X-GTM-Signature": bridgeSignature(extra.secret ?? secret, ts, nonce, body) }, body };
}

describe("console agent", () => {
  it("requires SSO and the selected tenant; keeps profile scoped to issuer, subject and tenant", async () => {
    expect((await fetch(base + "/console/data-agent/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await consoleCall("context", {}, "acme", "other")).status).toBe(403);
    const response = await consoleCall("profile", { role: "technical", goal: "leads", audience: "Local owners", target: { metric: "keyEvents", value: 12 } });
    expect(response.status).toBe(200);
    const context = await consoleCall("context", { locale: "en", section: "ga4" }); expect(context.status).toBe(200); expect(context.headers.get("cache-control")).toBe("no-store");
    const data = await context.json(); expect(data.profile.role).toBe("technical"); expect(data.actions.map((a: { href: string }) => a.href)).toContain("#ga4");
    expect(readProfile("acme", "different-issuer:u1").role).toBe("owner"); expect(readProfile("other", issuer + ":u1").audience).toBe("");
    expect(() => saveProfile("acme", "u1", { role: "tenant-admin" })).toThrow();
    const read = await consoleCall("query", { model: "workspace" }); expect(read.status).toBe(200); expect(JSON.stringify(await read.json())).not.toContain("googleCredential");
  });
  it("refuses cross-tenant properties and arbitrary writes even for syntactically valid reads", async () => {
    expect((await consoleCall("query", { model: "search", source: "sc-domain:other.example" })).status).toBeGreaterThanOrEqual(400);
    expect((await consoleCall("query", { model: "workspace", tool: "publish", tenantId: "other" })).status).toBeGreaterThanOrEqual(400);
    const deps = { search: vi.fn(), analytics: vi.fn() };
    await expect(readModel(acme, { model: "analytics", source: "456" }, deps as never)).rejects.toThrow("outside workspace");
    expect(deps.analytics).not.toHaveBeenCalled();
  });
  it("does not silently select a Google property or manufacture zeroes", async () => {
    const deps = { search: vi.fn(async () => ({ rows: [] })), analytics: vi.fn(async () => ({ rows: [] })) };
    expect((await readModel({ ...acme, ga4Properties: ["123", "234"] }, { model: "analytics" }, deps as never)).state).toBe("choose-source");
    expect(deps.analytics).not.toHaveBeenCalled();
    const empty = await readModel(acme, { model: "search", days: 7 }, deps as never); expect(empty.state).toBe("empty"); expect(empty.metrics).toEqual([]);
    expect(deps.search.mock.calls[0][0]).toMatchObject({ dimensions: [], rowLimit: 1, siteUrl: "sc-domain:acme.example" });
    const fail = await readModel(acme, { model: "analytics", locale: "fr" }, { ...deps, analytics: async () => { throw new Error("secret-provider-key"); } } as never);
    expect(fail.state).toBe("unavailable"); expect(JSON.stringify(fail)).not.toContain("secret-provider-key"); expect(fail.summary).toContain("Vérifiez");
  });
  it("reads aggregates with tenant credentials and reports a real period", async () => {
    const analytics = vi.fn(async () => { expect(currentKeyFile()).toBe(join(dir, "acme.json")); return { rows: [{ sessions: "42", keyEvents: "3" }] }; });
    const r = await readModel(acme, { model: "analytics", days: 28 }, { search: vi.fn(), analytics } as never);
    expect(r.metrics.map(m => m.value)).toEqual([42, 3]); expect(r.period?.start).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(r.caveats.join()).toContain("not necessarily leads");
  });
  it("uses actual observation dates and distinguishes reviewed mentions without returning raw answers", async () => {
    const dataset = normalizeImport({ brands: [{ name: "Acme" }], responses: [
      { prompt: "Example", answer: "Acme has a private observation", source: "manual", observedAt: "2025-01-01T00:00:00Z" },
      { prompt: "Example 2", answer: "Acme is another observation", source: "manual", observedAt: "2025-01-02T00:00:00Z" },
    ] }); dataset.observations[0].mentions[0].status = "confirmed"; insertDataset("acme", dataset);
    const r = await readModel(acme, { model: "visibility", days: 7 });
    expect(r.period?.start).toContain("2025-01-01"); expect(r.metrics.find(m => m.id === "confirmedPresence")?.value).toBe(50);
    expect(r.metrics.find(m => m.id === "unreviewedResponses")?.value).toBe(1); expect(JSON.stringify(r)).not.toContain("private observation");
    expect((await readModel(other, { model: "visibility" })).state).toBe("empty");
  });
  it("adapts navigation to role, goal and lifecycle without changing access", () => {
    const p = profileSchema.parse({ role: "agency", goal: "local", stage: "retain" });
    const actions = nextActions(p, "fr"); expect(actions.map(a => a.href)).toEqual(["#local_seo/network", "#ops/alerts", "#report", "#journey"]);
    expect(() => profileSchema.parse({ target: { metric: "revenue", value: 1 } })).toThrow();
  });
});

describe("Eve bridge", () => {
  it("fails closed without configuration and rejects malformed, unsigned, expired and tampered requests", async () => {
    expect(loadBindings({})).toEqual([]);
    expect((await fetch(base + "/bridge/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await fetch(base + "/bridge/read", signed({}, { timestamp: "1000000000" }))).status).toBe(401);
    const request = signed({}); request.body = request.body.replace("workspace", "operations");
    expect((await fetch(base + "/bridge/read", request)).status).toBe(403);
  });
  it("binds team/channel/user, disallows tenant overrides, and records replay nonces durably", async () => {
    for (const changes of [{ teamId: "T999" }, { channelId: "C999" }, { userId: "U999" }]) expect((await fetch(base + "/bridge/read", signed(changes))).status).toBe(403);
    expect((await fetch(base + "/bridge/read", signed({ tenantId: "other" }))).status).toBe(400);
    const request = signed({}); const r = await fetch(base + "/bridge/read", request); expect(r.status).toBe(200); expect((await r.json()).metrics[0].value).toBe(1);
    closeAgentStores(); expect((await fetch(base + "/bridge/read", request)).status).toBe(409);
  });
  it("rechecks active tenants, current allowlists and ambiguous binding configuration on every call", async () => {
    store.upsert({ ...acme, status: "suspended" }); expect((await fetch(base + "/bridge/read", signed({}))).status).toBe(403); store.upsert(acme);
    writeFileSync(bindingsFile, JSON.stringify([{ ...binding, userIds: ["U999"] }])); expect((await fetch(base + "/bridge/read", signed({}))).status).toBe(403);
    writeFileSync(bindingsFile, JSON.stringify([binding, { ...binding, tenantId: "other" }])); expect(() => loadBindings(env)).toThrow();
    writeFileSync(bindingsFile, JSON.stringify([binding]));
    const r = await fetch(base + "/bridge/read", signed({ operation: "context" })); expect(r.status).toBe(200); expect((await r.json()).consolePath).toContain("tenant=acme");
  });
});
