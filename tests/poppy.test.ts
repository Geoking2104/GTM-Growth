import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { constants, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { PapStore } from "../src/poppy/store.js";
import { hash, now, random, scopes, type Client, type Grant, type Token } from "../src/poppy/types.js";
import { verifyAssertion, verifySession } from "../src/poppy/crypto.js";
import { clientLoader, fetchMetadata, redirectAllowed } from "../src/poppy/client.js";
import { mountPoppy } from "../src/poppy/router.js";
import { TenantStore, type Tenant } from "../src/tenants/store.js";
import { readModel } from "../src/data-agent/service.js";
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }), rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }), delegated = generateKeyPairSync("ec", { namedCurve: "P-256" });
const ej = { ...ec.publicKey.export({ format: "jwk" }), kid: "ec", alg: "ES256" }, rj = { ...rsa.publicKey.export({ format: "jwk" }), kid: "rsa", alg: "PS384" }, dj = delegated.publicKey.export({ format: "jwk" });
const thumb = hash(JSON.stringify({ crv: dj.crv, kty: dj.kty, x: dj.x, y: dj.y }));
const client: Client = { client_id: "https://agent.example/client.json", client_name: "Pilot agent", jwks_uri: "https://agent.example/keys", redirect_uris: ["https://agent.example/callback", "http://127.0.0.1:1234/callback"], keys: [ej, rj] };
const config = { origin: "https://gtm.example", issuer: "https://gtm.example/api/poppy/oauth", clients: [client.client_id], path: ":memory:" };
const oidcIssuer = "https://auth.example/realms/gtm";
function jwt(header: object, payload: object, key: KeyObject, alg = "ES256") {
    const data = [header, payload].map(x => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
    const signature = sign(alg === "PS384" ? "sha384" : "sha256", Buffer.from(data), alg === "PS384" ? { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 } : { key, dsaEncoding: "ieee-p1363" });
    return `${data}.${signature.toString("base64url")}`;
}
const assertion = (extra: object = {}, alg = "ES256") => jwt({ alg, kid: alg === "PS384" ? "rsa" : "ec" }, { iss: client.client_id, sub: client.client_id, aud: config.issuer, iat: now(), exp: now() + 300, jti: random(), ...extra }, alg === "PS384" ? rsa.privateKey : ec.privateKey, alg);
function proof(token: string, extra: object = {}, dlgExtra: object = {}, alg = "ES256", headerExtra: object = {}) {
    const dlg = jwt({ typ: "poppy-delegation+jwt", alg, kid: alg === "PS384" ? "rsa" : "ec" }, { iss: client.client_id, cnf: { jwk: dj }, iat: now(), exp: now() + 3600, jti: random(), ...dlgExtra }, alg === "PS384" ? rsa.privateKey : ec.privateKey, alg);
    return jwt({ typ: "poppy-session+jwt", alg: "ES256", kid: thumb, poppy_dlg: dlg, ...headerExtra }, { iss: client.client_id, aud: config.issuer, htm: "POST", htu: `${config.origin}/api/poppy/read`, sid: "session_001", sub: "opaque-user", iat: now(), jti: random(), ath: hash(token), ...extra }, delegated.privateKey);
}
const verifyProof = (raw: string, store: PapStore, token = "token", account = "account") => verifySession(raw, client, config.issuer, "POST", `${config.origin}/api/poppy/read`, token, account, store);
describe("PAP cryptographic boundary", () => {
    let store: PapStore;
    beforeEach(() => { store = new PapStore(":memory:"); });
    it.each(["ES256", "PS384"])("accepts five-minute %s assertions and delegations", alg => { verifyAssertion(assertion({}, alg), client, config.issuer, store); expect(verifyProof(proof("token", {}, {}, alg), store).sub).toBe("opaque-user"); });
    it.each([{ aud: config.issuer + "/token" }, { aud: [config.issuer] }, { sub: "foreign" }, { exp: now() + 3600 }, { exp: now() - 1 }, { iat: now() + 90, exp: now() + 300 }, { jti: "" }])("rejects invalid client claims %j", extra => { expect(() => verifyAssertion(assertion(extra), client, config.issuer, store)).toThrow(); });
    it("rejects assertion and request replay", () => { const a = assertion(); verifyAssertion(a, client, config.issuer, store); expect(() => verifyAssertion(a, client, config.issuer, store)).toThrow(); const p = proof("token"); verifyProof(p, store); expect(() => verifyProof(p, store)).toThrow(); });
    it.each([{ aud: config.origin }, { aud: [config.issuer] }, { htm: "GET" }, { htu: "https://evil.example/api/poppy/read" }, { htu: `${config.origin}/api/poppy/read?token=secret` }, { iat: now() - 61 }, { iat: now() + 3600 }, { ath: "wrong" }, { iss: "https://other.example/client" }])("rejects mismatched Session claims %j", extra => { expect(() => verifyProof(proof("token", extra), store)).toThrow(); });
    it("rejects expired/overlong/private delegated keys and header confusion", () => {
        for (const extra of [{ exp: now() - 1 }, { exp: now() + 86401 }, { cnf: { jwk: { ...dj, d: "private" } } }])
            expect(() => verifyProof(proof("token", {}, extra), store)).toThrow();
        for (const extra of [{ kid: "other" }, { typ: "JWT" }, { alg: "none" }, { jku: "https://evil.example/keys" }, { crit: ["x"] }])
            expect(() => verifyProof(proof("token", {}, {}, "ES256", extra), store)).toThrow();
    });
    it("holds agent id, delegated user and account continuity", () => {
        verifyProof(proof("token", { agent_id: "worker" }), store);
        expect(() => verifyProof(proof("token", { agent_id: "other" }), store)).toThrow("session_ended");
        expect(() => verifyProof(proof("token", { agent_id: "worker" }), store, "token", "other-account")).toThrow("session_ended");
        expect(() => verifyProof(proof("token", { sid: "new", sub: "other-user" }), store)).toThrow();
    });
    it("coordinates replay and revocation across connections and restart", () => {
        const file = join(mkdtempSync(join(tmpdir(), "pap-durable-")), "pap.sqlite3"), a = new PapStore(file), b = new PapStore(file);
        const assertionJwt = assertion();
        verifyAssertion(assertionJwt, client, config.issuer, a);
        expect(() => verifyAssertion(assertionJwt, client, config.issuer, b)).toThrow();
        const g = grant();
        a.saveGrant(g);
        b.revoke(g.id);
        a.close();
        const reopened = new PapStore(file);
        expect(() => reopened.active(g.id)).toThrow("invalid_token");
        b.close();
        reopened.close();
    });
});
describe("CIMD and network boundary", () => {
    const metadata = { ...client, token_endpoint_auth_method: "private_key_jwt" };
    it("fetches only an exact allowlisted client and same-host keys", async () => { const fetcher = vi.fn(async (url: string) => url === client.client_id ? metadata : { keys: client.keys }); const load = clientLoader([client.client_id], fetcher); expect((await load(client.client_id)).client_name).toBe("Pilot agent"); await expect(load("https://evil.example/client")).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2); });
    it.each([{ client_id: "https://other.example/client" }, { jwks_uri: "https://evil.example/keys" }, { redirect_uris: ["https://evil.example/callback"] }, { token_endpoint_auth_method: "client_secret_basic" }])("rejects unsafe metadata %j", async (extra) => { const load = clientLoader([client.client_id], async () => ({ ...metadata, ...extra })); await expect(load(client.client_id)).rejects.toThrow(); });
    it("accepts loopback port variation only, rejects path/host changes", () => { expect(redirectAllowed("http://127.0.0.1:8765/callback", client.redirect_uris[1])).toBe(true); expect(redirectAllowed("http://localhost:8765/callback", client.redirect_uris[1])).toBe(false); expect(redirectAllowed("https://agent.example/other", client.redirect_uris[0])).toBe(false); });
    it.each(["http://public.example/keys", "https://127.0.0.1/keys", "https://localhost/keys", "https://user:secret@agent.example/keys", "https://agent.example:8080/keys"])("blocks unsafe metadata address %s", async (url) => { await expect(fetchMetadata(url)).rejects.toThrow(); });
});
const tenant: Tenant = { id: "acme", name: "Acme", mode: "organization", issuer: oidcIssuer, organizationId: "org", domains: ["acme.example", "private.example"], emailDomains: [], gscProperties: ["sc-domain:acme.example", "sc-domain:private.example"], ga4Properties: ["123", "456"], branding: {}, identityProviders: [], status: "active", createdAt: "2026-01-01" };
const selected = { domains: ["acme.example"], search: ["sc-domain:acme.example"], analytics: ["123"] };
function grant(): Grant { return { id: random(), issuer: oidcIssuer, user: "user", session: "kc-session", client: client.client_id, clientName: client.client_name, tenant: "acme", scopes, resources: selected, created: now(), expires: now() + 86400, lastUsed: null, revoked: null }; }
const consoleJwt = (sub = "user") => jwt({ alg: "ES256", kid: "ec" }, { iss: oidcIssuer, aud: "gtm-console", sub, sid: "kc-session", exp: now() + 600, organization: ["acme"], groups: ["/tenants/acme/tenant-admin"] }, ec.privateKey);
describe("PAP HTTP consent and read lifecycle", () => {
    const store = new PapStore(":memory:"), dir = mkdtempSync(join(tmpdir(), "pap-http-")), tenants = new TenantStore(join(dir, "tenants.json"));
    tenants.upsert(tenant);
    tenants.upsert({ ...tenant, id: "other", domains: ["other.example"] });
    let activeMember = true, outage = false, memberCalls = 0;
    let memberHook: ((call: number) => void) | undefined;
    const read = vi.fn(async (t: Tenant, q: unknown) => readModel(t, q));
    const app = express();
    mountPoppy(app, { config, store, tenants, readTimeoutMs: 1000, client: async () => client, read, member: async (p, t) => { memberHook?.(++memberCalls); if (outage)
            throw new Error("Identity credentials must never leak"); return activeMember && p.user === "user" && t.id === "acme" ? "tenant-admin" : null; }, oidc: { issuer: oidcIssuer, clientId: "gtm-console", jwksUrl: oidcIssuer + "/certs" }, jwks: async () => ({ keys: [ej] }) });
    let server: ReturnType<typeof app.listen>, base: string;
    beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; config.origin = base.replace("http:", "https:"); config.issuer = config.origin + "/api/poppy/oauth"; });
    afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); });
    beforeEach(() => { store.db.exec("DELETE FROM pap_records; DELETE FROM pap_audit"); activeMember = true; outage = false; memberCalls = 0; memberHook = undefined; read.mockReset(); read.mockImplementation((t, q) => readModel(t, q)); store.put("policy", "acme", { enabled: true, clients: [client.client_id] }, now() + 86400); tenants.upsert(tenant); });
    const http = (url: string, init: RequestInit = {}) => fetch(url, { ...init, headers: { Host: new URL(config.origin).host, ...init.headers } });
    const post = (path: string, body: object, extra: Record<string, string> = {}) => http(base + "/api/poppy/" + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: config.origin, ...extra }, body: JSON.stringify(body) });
    const consolePost = (path: string, body: object, extra: Record<string, string> = {}) => post("console/" + path, body, { Authorization: `Bearer ${consoleJwt()}`, ...extra });
    const oauth = (path: string, body: Record<string, string>, a = assertion()) => http(base + "/api/poppy/oauth/" + path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client.client_id, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: a, ...body }) });
    function access(overrides: Partial<Grant> = {}) { const g = { ...grant(), ...overrides }; store.saveGrant(g); const raw = random(); store.put("access", hash(raw), { grant: g.id, client: g.client, scopes: g.scopes, resource: config.origin, expires: now() + 300 } satisfies Token, now() + 300); return { g, raw }; }
    const query = (raw: string, body: object = { model: "workspace" }, headers: Record<string, string> = {}) => post("read", body, { Authorization: `Bearer ${raw}`, "Poppy-Version": "1.0", "Poppy-Session": proof(raw), ...headers });
    async function requestCode() {
        const verifier = random();
        const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: "code", scope: scopes.join(" "), state: "original-state", code_challenge: hash(verifier), code_challenge_method: "S256" });
        const start = await http(base + "/api/poppy/oauth/authorize?" + params, { redirect: "manual" });
        expect(start.status).toBe(303);
        return { request: new URL(start.headers.get("location")!).searchParams.get("request")!, cookie: start.headers.get("set-cookie")!.split(";")[0], verifier };
    }
    async function consent() { const pending = await requestCode(); const r = await consolePost("consent", { request: pending.request, tenant: "acme", approve: true, scopes, resources: selected }, { Cookie: pending.cookie }); expect(r.status).toBe(200); const url = new URL((await r.json()).redirect); expect(url.searchParams.get("state")).toBe("original-state"); expect(url.searchParams.get("iss")).toBe(config.issuer); return { ...pending, code: url.searchParams.get("code")! }; }
    it("serves accurate public metadata with RFC 8414 issuer path", async () => { const m = await http(base + "/.well-known/poppy.json").then(r => r.json()); expect(m.protocol_version).toBe("1.0"); expect(m.agent).toBeUndefined(); const a = await http(base + "/.well-known/oauth-authorization-server/api/poppy/oauth").then(r => r.json()); expect(a.token_endpoint_auth_signing_alg_values_supported).toEqual(["ES256", "PS384"]); const c = await http(base + "/api/poppy/capabilities").then(r => r.text()); expect(c).not.toContain("acme"); });
    it("performs consent, code exchange, rotation, scope narrowing and durable revocation", async () => {
        const c = await consent();
        const body = { grant_type: "authorization_code", code: c.code, code_verifier: c.verifier, redirect_uri: client.redirect_uris[0] };
        const r = await oauth("token", body, assertion({}, "PS384"));
        expect(r.status).toBe(200);
        const tokens = await r.json();
        expect((await oauth("token", body)).status).toBe(400);
        expect((await query(tokens.access_token)).status).toBe(200);
        const rotated = await oauth("token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, scope: "gtm:workspace:read", resource: config.origin }).then(r => r.json());
        expect(rotated.scope).toBe("gtm:workspace:read");
        expect((await oauth("token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token })).status).toBe(400);
        expect((await oauth("revoke", { token: tokens.refresh_token })).status).toBe(200);
        expect((await query(rotated.access_token)).status).toBe(200);
        expect((await oauth("token", { grant_type: "refresh_token", refresh_token: rotated.refresh_token, scope: "gtm:search:read" })).status).toBe(400);
        await oauth("revoke", { token: rotated.refresh_token });
        expect((await query(tokens.access_token)).status).toBe(401);
        expect((await query(rotated.access_token)).status).toBe(401);
    });
    it("enforces browser binding, origin, PKCE and denial redirect issuer", async () => {
        const c = await requestCode();
        const body = { request: c.request, tenant: "acme", approve: true, scopes, resources: selected };
        expect((await consolePost("consent", body)).status).toBe(400);
        expect((await consolePost("consent", body, { Cookie: c.cookie, Origin: "https://evil.example" })).status).toBe(403);
        const deny = await consolePost("consent", { request: c.request, approve: false }, { Cookie: c.cookie }).then(r => r.json());
        expect(new URL(deny.redirect).searchParams.get("error")).toBe("access_denied");
        expect(new URL(deny.redirect).searchParams.get("iss")).toBe(config.issuer);
        const good = await consent();
        expect((await oauth("token", { grant_type: "authorization_code", code: good.code, code_verifier: random(), redirect_uri: client.redirect_uris[0] })).status).toBe(400);
    });
    it("requires a member's explicit scopes and resource subset, not platform access", async () => {
        const c = await requestCode();
        for (const body of [{ tenant: "other", scopes, resources: selected }, { tenant: "acme", scopes: [], resources: selected }, { tenant: "acme", scopes, resources: { ...selected, search: ["sc-domain:foreign.example"] } }])
            expect((await consolePost("consent", { request: c.request, approve: true, ...body }, { Cookie: c.cookie })).ok).toBe(false);
        const context = await consolePost("context", { tenant: "acme" }).then(r => r.json());
        expect(context.workspaces.map((x: {
            id: string;
        }) => x.id)).toEqual(["acme"]);
    });
    it("filters summaries and provider source choices to consented resources", async () => { const { raw } = access(); const r = await query(raw); expect(r.status).toBe(200); const result = await r.json(); expect(result.data.metrics.map((m: {
        value: number;
    }) => m.value)).toEqual([1, 1, 1]); expect(result.data.href).toBe(config.origin + "/console/#tracking"); expect(JSON.stringify(result)).not.toContain("private.example"); expect((await query(raw, { model: "search", source: "sc-domain:private.example" })).status).toBe(403); expect(read).toHaveBeenCalledTimes(1); });
    it("enforces scopes, token audience, session proof, schema and input limits", async () => {
        const { raw } = access({ scopes: ["gtm:workspace:read"] });
        expect((await query(raw, { model: "operations" })).status).toBe(403);
        expect((await query(raw, { model: "workspace", tenant: "other" })).status).toBe(400);
        expect((await query(raw, { model: "workspace", sql: "select *" })).status).toBe(400);
        expect((await query(raw, { model: "workspace" }, { "Poppy-Version": "0.3" })).status).toBe(400);
        expect((await query(raw, { model: "workspace" }, { "Poppy-Session": "" })).status).toBe(400);
        expect((await query(raw, { model: "workspace" }, { "X-Tenant": "other" })).status).toBe(400);
        expect((await query(raw, { model: "workspace", payload: "x".repeat(17000) })).status).toBe(413);
        const token = store.get<Token>("access", hash(raw))!;
        store.put("access", hash(raw), { ...token, resource: "https://foreign.example" }, now() + 300);
        expect((await query(raw)).status).toBe(401);
    });
    it("blocks role/session removal, fails closed on outage and never leaks identity error text", async () => {
        const { raw, g } = access();
        outage = true;
        const r = await query(raw);
        expect(r.status).toBe(503);
        expect(await r.text()).not.toContain("credentials");
        outage = false;
        activeMember = false;
        expect((await query(raw)).status).toBe(401);
        expect(store.grant(g.id)?.revoked).toBeTruthy();
        activeMember = true;
        expect((await query(raw)).status).toBe(401);
    });
    it("does not emit data when revocation completes during a read", async () => { const { raw, g } = access(); read.mockImplementationOnce(async (t, q) => { const result = await readModel(t, q); store.revoke(g.id); return result; }); const r = await query(raw); expect(r.status).toBe(401); expect(await r.text()).not.toContain("metrics"); });
    it("does not emit data when a property is removed during a read", async () => { const { raw } = access(); read.mockImplementationOnce(async (t, q) => { const result = await readModel(t, q); tenants.upsert({ ...tenant, domains: [] }); return result; }); expect((await query(raw)).status).toBe(403); });
    it("refreshes resource policy after the final asynchronous identity check", async () => {
        const { raw } = access();
        memberHook = call => { if (call === 2) tenants.upsert({ ...tenant, domains: [] }); };
        const result = await query(raw);
        expect(result.status).toBe(403);
        expect(await result.text()).not.toContain("metrics");
    });
    it("revokes through console disconnect and admin suspension", async () => { const a = access(); expect((await consolePost("revoke", { tenant: "other", grant: a.g.id })).status).toBe(403); expect((await consolePost("revoke", { tenant: "acme", grant: a.g.id })).status).toBe(200); expect((await query(a.raw)).status).toBe(401); const b = access(); await consolePost("policy", { tenant: "acme", enabled: false, clients: [] }); expect((await query(b.raw)).status).toBe(401); });
    it("bounds the complete response and retains capacity until timed-out work settles", async () => {
        const { raw } = access(); const finishes: Array<() => void> = [];
        read.mockImplementation((t, q) => new Promise(resolve => finishes.push(() => { void readModel(t, q).then(resolve); })));
        expect((await query(raw)).status).toBe(504);
        expect((await query(raw)).status).toBe(504);
        expect(store.all("lease")).toHaveLength(2);
        expect((await query(raw)).status).toBe(429);
        for (const finish of finishes) finish();
        await vi.waitFor(() => expect(store.all("lease")).toHaveLength(0));
        expect(store.db.prepare("SELECT count(*) AS n FROM pap_audit WHERE outcome='read_timeout'").get()).toEqual({ n: 2 });
    });
    it("fails closed with a sanitized JSON error when durable auditing fails", async () => {
        const { raw } = access();
        const audit = vi.spyOn(store, "audit").mockImplementation(() => { throw new Error("private database failure"); });
        try {
            const response = await query(raw);
            expect(response.status).toBe(503);
            const result = await response.json();
            expect(result.error).toBe("service_unavailable");
            expect(JSON.stringify(result)).not.toContain("private database");
            expect(result.data).toBeUndefined();
        } finally { audit.mockRestore(); }
    });
    it("returns Retry-After and keeps audits free of tokens and result content", async () => { const { raw, g } = access(); for (let i = 0; i < 30; i++)
        store.rate(`grant:${g.id}`, 30); const r = await query(raw); expect(r.status).toBe(429); expect(r.headers.get("retry-after")).toBe("60"); const audit = JSON.stringify(store.db.prepare("SELECT * FROM pap_audit").all()); expect(audit).not.toContain(raw); expect(audit).not.toContain("metrics"); });
});

it("leaves discovery unpublished and private routes unavailable when disabled", async () => {
    const app = express(); expect(mountPoppy(app, { config: null })).toBeNull();
    const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        expect((await fetch(url + "/.well-known/poppy.json")).status).toBe(404);
        const response = await fetch(url + "/api/poppy/read", { method: "POST" });
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "pilot_disabled" });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
