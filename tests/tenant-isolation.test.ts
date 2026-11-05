import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import type { OidcConfig } from "../src/console/auth.js";
import { buildConsoleRouter, buildPlatformRouter, discoverTenant } from "../src/console/api.js";
import { TenantStore, type Tenant } from "../src/tenants/store.js";
import { resolveTenant } from "../src/tenants/context.js";
import { saveTenantReport } from "../src/tenants/data.js";
import { KeycloakAdmin } from "../src/tenants/keycloak-admin.js";

const dir = mkdtempSync(join(tmpdir(), "iso-"));
process.env.REPORTS_PATH = join(dir, "reports");
process.env.LEADS_PATH = join(dir, "leads.jsonl");
writeFileSync(process.env.LEADS_PATH, [
  { name: "A", email: "a@x.fr", website: "https://www.acme.fr", createdAt: "2026-01-01" },
  { name: "B", email: "b@y.fr", website: "https://globex.com/page", createdAt: "2026-01-01" },
].map((l) => JSON.stringify(l)).join("\n") + "\n");

const ISS = "https://auth.example.com/realms/gtm-growth";
const REALM_ISS = "https://auth.example.com/realms/tenant-initech";
const store = new TenantStore(join(dir, "tenants.json"));
const base = (id: string, extra: Partial<Tenant> = {}): Tenant => ({ id, name: id, mode: "organization", issuer: ISS, domains: [`${id === "acme" ? "acme.fr" : `${id}.com`}`], emailDomains: [`${id}.fr`], gscProperties: [`sc-domain:${id}`], branding: { primaryColor: "#112233" }, identityProviders: [], status: "active", createdAt: "", organizationId: `org-${id}`, ...extra });
store.upsert(base("acme"));
store.upsert(base("globex"));
store.upsert(base("initech", { mode: "realm", issuer: REALM_ISS }));
store.upsert(base("umbrella", { status: "suspended" }));
saveTenantReport("globex", "https://globex.com", Buffer.from("%PDF globex"));

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const loader = async () => ({ keys: [jwk] });
const config: OidcConfig = { issuer: ISS, clientId: "gtm-console", jwksUrl: "https://auth.example.com/certs" };
const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims: Record<string, unknown>) {
  const head = enc({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = enc({ iss: ISS, aud: "gtm-console", exp: Math.floor(Date.now() / 1000) + 300, sub: "u1", ...claims });
  return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url")}`;
}
const acmeUser = { organization: { acme: { id: "o1" } }, groups: ["/tenants/acme/tenant-user"] };
const acmeAdmin = { organization: ["acme"], groups: ["/tenants/acme/tenant-admin"] };
const superAdmin = { realm_access: { roles: ["platform-admin"] } };

const app = express();
app.use(express.json());
const echo = { path: "/echo", needsUrl: false, handler: async ({ url, body, tenancy }: any) => ({ url, property: body.property, tenant: tenancy?.tenant?.id }) };
const kcCalls: string[] = [];
const fakeFetch = (async (u: string | URL, init?: RequestInit) => {
  const url = String(u); kcCalls.push(`${init?.method ?? "GET"} ${url}`);
  if (url.endsWith("/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 60 }), { status: 200 });
  if (url.includes("/clients?clientId=")) return new Response(JSON.stringify([{ id: "c1", redirectUris: [] }]), { status: 200 });
  if (url.includes("/groups") && (init?.method ?? "GET") === "GET") return new Response("[]", { status: 200 });
  if (init?.method === "POST") return new Response(null, { status: 201, headers: { location: `${url}/new-${kcCalls.length}` } });
  return new Response(null, { status: 204 });
}) as typeof fetch;
const keycloakAdmin = new KeycloakAdmin({ baseUrl: "http://kc", authRealm: "master", clientId: "p", clientSecret: "s", fetch: fakeFetch });
app.use("/c", buildConsoleRouter([echo], { config, jwksLoader: loader, store, keycloakAdmin }));
app.use("/p", buildPlatformRouter({ config, jwksLoader: loader, store, keycloakAdmin }));
let server: ReturnType<typeof app.listen>; let root = "";
beforeAll(() => { server = app.listen(0); root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => server.close());

const call = (path: string, claims: Record<string, unknown>, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${root}${path}`, { method: body === undefined ? "GET" : path.includes("settings") ? "PUT" : "POST", headers: { Authorization: `Bearer ${token(claims)}`, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("isolation stricte entre tenants", () => {
  it("scope l'URL au domaine du tenant", async () => {
    // public IPs needed by SSRF guard: use well-known domains? we only test the tenant rejection path with a host the guard accepts.
    const r = await call("/c/echo", acmeUser, { url: "https://globex.com" });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/globex.com/);
    expect((await call("/c/echo", acmeUser, { inspectUrl: "https://globex.com/x" })).status).toBe(403);
    const ok = await (await call("/c/echo", acmeUser, {})).json();
    expect(ok).toMatchObject({ tenant: "acme", property: "sc-domain:acme" });
  });
  it("refuse une propriété GSC d'un autre tenant et applique la propriété par défaut", async () => {
    expect((await call("/c/echo", acmeUser, { property: "sc-domain:globex" })).status).toBe(403);
  });
  it("refuse une propriété GA4 ou un site Bing d'un autre tenant ; la clé Bing n'est jamais exposée", async () => {
    expect((await call("/c/echo", acmeUser, { ga4Property: "999999" })).status).toBe(403);
    expect((await call("/c/echo", acmeUser, { bingSite: "https://globex.com/" })).status).toBe(403);
    const r = await call("/c/tenant/settings", acmeAdmin, { ga4Properties: ["123456"], bingSites: ["https://www.acme.fr/"], bingApiKey: "ABCDEF0123456789ABCDEF" });
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.tenant).toMatchObject({ ga4Properties: ["123456"], bingSites: ["https://www.acme.fr/"], bingKeyConfigured: true });
    expect(JSON.stringify(body)).not.toContain("ABCDEF0123456789ABCDEF");
    expect((await call("/c/echo", acmeUser, { ga4Property: "123456" })).status).toBe(200);
    expect((await call("/c/tenant/settings", acmeAdmin, { ga4Properties: ["abc"] })).status).toBe(400);
  });
  it("valide et cloisonne les concurrents du démarrage guidé", async () => {
    const ok = await call("/c/tenant/settings", acmeAdmin, { competitors: ["https://rival1.fr/", "https://rival2.fr/"] });
    expect(ok.status).toBe(200);
    expect((await ok.json()).tenant).toMatchObject({ competitors: ["https://rival1.fr/", "https://rival2.fr/"] });
    // URL invalide refusée, plus de 5 refusés, non-admin refusé.
    expect((await call("/c/tenant/settings", acmeAdmin, { competitors: ["rival1.fr"] })).status).toBe(400);
    expect((await call("/c/tenant/settings", acmeAdmin, { competitors: ["https://a.fr/", "https://b.fr/", "https://c.fr/", "https://d.fr/", "https://e.fr/", "https://f.fr/"] })).status).toBe(400);
    expect((await call("/c/tenant/settings", acmeUser, { competitors: ["https://rival1.fr/"] })).status).toBe(403);
  });
  it("refuse un en-tête X-Tenant usurpé", async () => {
    expect((await call("/c/me", acmeUser, undefined, { "X-Tenant": "globex" })).status).toBe(403);
  });
  it("ignore un groupe sans appartenance à l'organisation", async () => {
    expect((await call("/c/me", { organization: ["acme"], groups: ["/tenants/globex/tenant-admin"] })).status).toBe(403);
    expect(() => resolveTenant({ iss: ISS, groups: ["/tenants/acme/tenant-admin"] }, store, ISS)).toThrow();
  });
  it("refuse un tenant suspendu", async () => {
    expect(() => resolveTenant({ iss: ISS, organization: ["umbrella"], groups: ["/tenants/umbrella/tenant-admin"] }, store, ISS)).toThrow();
  });
  it("realm dédié : l'émetteur détermine le tenant", () => {
    expect(resolveTenant({ iss: REALM_ISS, realm_access: { roles: ["tenant-user"] } }, store, ISS).tenant?.id).toBe("initech");
    expect(() => resolveTenant({ iss: REALM_ISS, realm_access: { roles: ["tenant-user"] } }, store, ISS, "acme")).toThrow();
    expect(() => resolveTenant({ iss: "https://evil/realms/x", realm_access: { roles: ["tenant-admin"] } }, store, ISS)).toThrow();
    // A realm-mode tenant cannot be reached through shared-realm groups.
    expect(() => resolveTenant({ iss: ISS, organization: ["initech"], groups: ["/tenants/initech/tenant-admin"] }, store, ISS)).toThrow();
  });
  it("rejette un émetteur inconnu", async () => {
    expect((await call("/c/me", { ...acmeUser, iss: "https://auth.example.com/realms/inconnu" })).status).toBe(401);
  });
  it("leads et rapports filtrés par tenant", async () => {
    const leads = (await (await call("/c/leads", acmeUser)).json()).leads;
    expect(leads.map((l: { name: string }) => l.name)).toEqual(["A"]);
    expect((await (await call("/c/reports", acmeUser)).json()).reports).toEqual([]);
    const g = (await (await call("/c/reports", superAdmin, undefined, { "X-Tenant": "globex" })).json()).reports;
    expect(g).toHaveLength(1);
    expect((await call(`/c/reports/${g[0].file}`, acmeUser)).status).toBe(404);
    expect((await call(`/c/reports/..%2F..%2Ftenants.json`, acmeUser)).status).toBe(404);
  });
  it("/me expose le tenant, le rôle et la console de compte", async () => {
    const me = await (await call("/c/me", acmeUser)).json();
    expect(me).toMatchObject({ role: "tenant-user", tenant: { id: "acme" }, accountConsole: `${ISS}/account/` });
  });
  it("paramètres et invitations réservés au tenant-admin", async () => {
    expect((await call("/c/tenant/settings", acmeUser, { domains: ["globex.com"] })).status).toBe(403);
    expect((await call("/c/tenant/users", acmeUser, { email: "x@acme.fr" })).status).toBe(403);
    const ok = await call("/c/tenant/settings", acmeAdmin, { branding: { primaryColor: "#abcdef" } });
    expect(ok.status).toBe(200);
    const inv = await call("/c/tenant/users", acmeAdmin, { email: "new@acme.fr" });
    expect(inv.status, await inv.clone().text()).toBe(201);
    expect((await call("/c/tenant/users", acmeAdmin, { email: "new@globex.fr" })).status).toBe(502);
  });
  it("super-admin : agit sur n'importe quel tenant, API plateforme réservée", async () => {
    const r = await call("/c/echo", superAdmin, { property: "sc-domain:globex" }, { "X-Tenant": "globex" });
    expect(r.status).toBe(200);
    expect((await call("/p/tenants", acmeAdmin)).status).toBe(403);
    expect((await call("/p/tenants", { ...superAdmin, iss: REALM_ISS })).status).toBe(403);
    const list = await (await call("/p/tenants", superAdmin)).json();
    expect(list.tenants.length).toBe(4);
  });
  it("provisionne un tenant via l'API Admin Keycloak", async () => {
    const r = await call("/p/tenants", superAdmin, { id: "hooli", name: "Hooli", emailDomains: ["hooli.fr"], domains: ["hooli.com"], admin: { email: "ceo@hooli.fr" }, identityProvider: { kind: "microsoft", clientId: "cid", clientSecret: "sec", tenant: "tid" } });
    expect(r.status).toBe(201);
    expect(store.get("hooli")?.organizationId).toBeTruthy();
    expect(kcCalls.some((c) => c.includes("/organizations"))).toBe(true);
    expect(kcCalls.some((c) => c.includes("execute-actions-email"))).toBe(true);
    expect((await call("/p/tenants", superAdmin, { id: "admin", name: "x", emailDomains: ["a.fr"], admin: { email: "a@a.fr" } })).status).toBe(400);
  });
});

describe("découverte du tenant", () => {
  it("par e-mail, sous-domaine ou identifiant, sans fuite de données", () => {
    expect(discoverTenant(store, { email: "jean@acme.fr" })?.id).toBe("acme");
    expect(discoverTenant(store, { host: "globex.gtm.kayroslab.com" }, "gtm.kayroslab.com")?.id).toBe("globex");
    const d = discoverTenant(store, { tenant: "initech" });
    expect(d).toMatchObject({ mode: "realm", issuer: REALM_ISS, organization: null });
    expect(d).not.toHaveProperty("domains");
    expect(discoverTenant(store, { tenant: "umbrella" })).toBeNull();
    expect(discoverTenant(store, { email: "x@inconnu.fr" })).toBeNull();
  });
});
