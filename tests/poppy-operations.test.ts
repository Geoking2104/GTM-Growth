import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { PapStore } from "../src/poppy/store.js";
import { hash, now, proposeScope, random, scopes, type Client, type Grant, type Token } from "../src/poppy/types.js";
import { mountPoppy } from "../src/poppy/router.js";
import { TenantStore, type Tenant } from "../src/tenants/store.js";
import { ActionLedger } from "../src/actions/ledger.js";

/** R11 L2: `gtm:operations:propose` and POST /api/poppy/operations/propose.
 *  An agent may only propose catalog operations into the governed ledger;
 *  approval and execution stay human console acts. The extension is
 *  fail-closed: disabled means never advertised and 503 on the route. */

const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }), delegated = generateKeyPairSync("ec", { namedCurve: "P-256" });
const ej = { ...ec.publicKey.export({ format: "jwk" }), kid: "ec", alg: "ES256" } as Record<string, unknown>;
const dj = delegated.publicKey.export({ format: "jwk" });
const thumb = hash(JSON.stringify({ crv: dj.crv, kty: dj.kty, x: dj.x, y: dj.y }));
const client: Client = { client_id: "https://agent.example/client.json", client_name: "Pilot agent", jwks_uri: "https://agent.example/keys", redirect_uris: ["https://agent.example/callback"], keys: [ej] };
const oidcIssuer = "https://auth.example/realms/gtm";

function jwt(header: object, payload: object, key: KeyObject) {
  const data = [header, payload].map((x) => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
  return `${data}.${sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
function proposeProof(token: string, htu: string, extra: object = {}) {
  const dlg = jwt({ typ: "poppy-delegation+jwt", alg: "ES256", kid: "ec" }, { iss: client.client_id, cnf: { jwk: dj }, iat: now(), exp: now() + 3600, jti: random() }, ec.privateKey);
  return jwt({ typ: "poppy-session+jwt", alg: "ES256", kid: thumb, poppy_dlg: dlg }, { iss: client.client_id, aud: config.issuer, htm: "POST", htu, sid: "session_001", sub: "opaque-user", iat: now(), jti: random(), ath: hash(token), ...extra }, delegated.privateKey);
}

const tenant: Tenant = { id: "acme", name: "Acme", mode: "organization", issuer: oidcIssuer, organizationId: "org", domains: ["acme.example", "private.example"], emailDomains: [], gscProperties: ["sc-domain:acme.example"], ga4Properties: ["123"], branding: {}, identityProviders: [], status: "active", createdAt: "2026-01-01" } as unknown as Tenant;
const selected = { domains: ["acme.example"], search: ["sc-domain:acme.example"], analytics: ["123"] };
const proposeHtu = () => `${config.origin}/api/poppy/operations/propose`;
const config = { origin: "https://gtm.example", issuer: "https://gtm.example/api/poppy/oauth", clients: [client.client_id], path: ":memory:", operations: true };
const disabledConfig = { ...config, operations: false };
function grant(withPropose: boolean): Grant {
  return { id: random(), issuer: oidcIssuer, user: "user", session: "kc-session", client: client.client_id, clientName: client.client_name, tenant: "acme", scopes: withPropose ? [...scopes, proposeScope] : scopes, resources: selected, created: now(), expires: now() + 86400, lastUsed: null, revoked: null };
}

describe("PAP operations propose (R11 L2, fail-closed)", () => {
  const store = new PapStore(":memory:");
  const dir = mkdtempSync(join(tmpdir(), "pap-ops-"));
  const tenants = new TenantStore(join(dir, "tenants.json"));
  tenants.upsert(tenant);
  const ledger = new ActionLedger(join(dir, "actions.sqlite3"));
  const app = express();
  mountPoppy(app, {
    config, store, tenants,
    client: async () => client,
    oidc: { issuer: oidcIssuer, clientId: "gtm-console", jwksUrl: oidcIssuer + "/certs" },
    jwks: async () => ({ keys: [ej] }),
    member: async (p, t) => p.user === "user" && t.id === "acme" ? "tenant-admin" : null,
    propose: (t, actor, action, terms, at) => ledger.propose({ tenantId: t.id, action, terms, origin: "pap", actor, now: at }),
  });
  const disabledApp = express();
  mountPoppy(disabledApp, {
    config: disabledConfig, store, tenants,
    client: async () => client,
    oidc: { issuer: oidcIssuer, clientId: "gtm-console", jwksUrl: oidcIssuer + "/certs" },
    jwks: async () => ({ keys: [ej] }),
    member: async (p, t) => p.user === "user" && t.id === "acme" ? "tenant-admin" : null,
  });
  let server: ReturnType<typeof app.listen>, base: string;
  let disabledServer: ReturnType<typeof app.listen>, disabledBase: string;
  beforeAll(async () => {
    server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.origin = base.replace("http:", "https:");
    config.issuer = config.origin + "/api/poppy/oauth";
    disabledServer = await new Promise((resolve) => { const s = disabledApp.listen(0, "127.0.0.1", () => resolve(s)); });
    disabledBase = `http://127.0.0.1:${(disabledServer.address() as AddressInfo).port}`;
    disabledConfig.origin = disabledBase.replace("http:", "https:");
    disabledConfig.issuer = disabledConfig.origin + "/api/poppy/oauth";
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await new Promise<void>((resolve) => disabledServer.close(() => resolve())); store.close(); ledger.close?.(); });
  beforeEach(() => { store.db.exec("DELETE FROM pap_records; DELETE FROM pap_audit"); store.put("policy", "acme", { enabled: true, clients: [client.client_id] }, now() + 86400); tenants.upsert(tenant); });

  const http = (url: string, init: RequestInit = {}) => fetch(url, { ...init, headers: { Host: new URL(url).host, ...init.headers } });
  function access(withPropose: boolean, overrides: Partial<Grant> = {}) {
    const g = { ...grant(withPropose), ...overrides };
    store.saveGrant(g);
    const raw = random();
    store.put("access", hash(raw), { grant: g.id, client: g.client, scopes: g.scopes, resource: config.origin, expires: now() + 300 } satisfies Token, now() + 300);
    return { g, raw };
  }
  const propose = (raw: string, body: object, headers: Record<string, string> = {}) =>
    http(base + "/api/poppy/operations/propose", { method: "POST", headers: { "Content-Type": "application/json", Origin: config.origin, Authorization: `Bearer ${raw}`, "Poppy-Version": "1.0", "Poppy-Session": proposeProof(raw, proposeHtu()), ...headers }, body: JSON.stringify(body) });
  const validIndexNow = { action: "indexnow.submit", terms: { host: "acme.example", key: "acme-indexnow-key-1", urls: ["https://acme.example/changed"] } };

  it("never advertises the propose scope while the extension is disabled; the route answers 503", async () => {
    const metadata = await http(disabledBase + "/.well-known/oauth-protected-resource").then((r) => r.json());
    expect(metadata.scopes_supported).not.toContain(proposeScope);
    const openapi = await http(disabledBase + "/api/poppy/openapi.json").then((r) => r.json());
    expect(Object.keys(openapi.paths)).not.toContain("/api/poppy/operations/propose");
    const discovery = await fetch(disabledBase + "/.well-known/poppy.json").then((r) => r.json());
    expect(Object.keys(discovery.auth.scopes)).not.toContain(proposeScope);
    const refused = await fetch(disabledBase + "/api/poppy/operations/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft.generate" }) });
    expect(refused.status).toBe(503);
    expect(await refused.text()).toContain("service_unavailable");
  });

  it("advertises the propose scope and route only when the operator enables the flag", async () => {
    const metadata = await http(base + "/.well-known/oauth-protected-resource").then((r) => r.json());
    expect(metadata.scopes_supported).toContain(proposeScope);
    const openapi = await http(base + "/api/poppy/openapi.json").then((r) => r.json());
    expect(Object.keys(openapi.paths)).toContain("/api/poppy/operations/propose");
    const discovery = await fetch(base + "/.well-known/poppy.json").then((r) => r.json());
    expect(Object.keys(discovery.auth.scopes)).toContain(proposeScope);
  });

  it("isolates the propose scope from read models and refuses it on read grants", async () => {
    const { raw } = access(false);
    const r = await propose(raw, validIndexNow, { "Poppy-Session": proposeProof(raw, proposeHtu()) });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("insufficient_scope");
  });

  it("requires a fresh delegated session proof bound to the bearer token", async () => {
    const { raw } = access(true);
    const stale = await propose(raw, validIndexNow, { "Poppy-Session": proposeProof("other", proposeHtu()) });
    expect(stale.status).toBe(400);
    expect((await stale.json()).error).toBe("invalid_session");
  });

  it("proposes a catalog operation for the exact tenant, actor and terms; execution stays human", async () => {
    const { g, raw } = access(true);
    const r = await propose(raw, validIndexNow);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.schemaVersion).toBe("1.0");
    expect(body.workspaceId).toBe("acme");
    expect(body.data.proposed).toBe(true);
    expect(body.data.state).toBe("proposed");
    const recorded = ledger.list("acme", 10).find((o) => o.id === body.data.operationId);
    expect(recorded).toBeDefined();
    expect(recorded!.origin).toBe("pap");
    expect(recorded!.createdBy).toBe(`agent:${g.client}`);
    expect(recorded!.terms).toMatchObject({ host: "acme.example", key: "acme-indexnow-key-1" });
    expect(ledger.list("other", 10)).toHaveLength(0);
    const audit = store.db.prepare("SELECT action, outcome FROM pap_audit WHERE action = 'propose'").all() as { action: string; outcome: string }[];
    expect(audit.length).toBe(1);
    expect(audit[0].outcome).toBe("proposed");
  });

  it("refuses out-of-catalog actions and malformed terms with invalid_request", async () => {
    const { raw } = access(true);
    const excluded = await propose(raw, { action: "wordpress.publish", terms: {} });
    expect(excluded.status).toBe(400);
    expect((await excluded.json()).error).toBe("invalid_request");
    const malformed = await propose(raw, { action: "indexnow.submit", terms: { host: "acme.example", key: "bad key!", urls: [] } });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toBe("invalid_request");
  });

  it("refuses IndexNow proposals outside the consented tenant domains (resource_denied)", async () => {
    const { raw } = access(true);
    const r = await propose(raw, { action: "indexnow.submit", terms: { host: "evil.example", key: "acme-indexnow-key-1", urls: ["https://evil.example/x"] } });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("resource_denied");
    expect(ledger.list("acme", 10)).toHaveLength(0);
  });
});
