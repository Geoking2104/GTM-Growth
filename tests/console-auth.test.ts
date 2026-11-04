import { describe, expect, it, afterAll } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { JwksCache, verifyAccessToken, type OidcConfig } from "../src/console/auth.js";
import { buildConsoleRouter } from "../src/console/api.js";
import { TenantStore } from "../src/tenants/store.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const store = new TenantStore(join(mkdtempSync(join(tmpdir(), "tenants-")), "tenants.json"));
store.upsert({ id: "acme", name: "Acme", mode: "organization", issuer: "https://auth.example.com/realms/gtm-growth", domains: ["acme.fr"], emailDomains: ["acme.fr"], gscProperties: [], branding: {}, identityProviders: [], status: "active", createdAt: "" });

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const loader = async () => ({ keys: [jwk] });
const config: OidcConfig = { issuer: "https://auth.example.com/realms/gtm-growth", clientId: "gtm-console", jwksUrl: "https://auth.example.com/certs", requiredRole: "console-user" };
const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function token(claims: Record<string, unknown>, kid = "k1") {
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc({ iss: config.issuer, aud: "gtm-console", exp: Math.floor(Date.now() / 1000) + 300, realm_access: { roles: ["console-user"] }, preferred_username: "geoffroy", organization: ["acme"], groups: ["/tenants/acme/tenant-user"], ...claims });
  return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url")}`;
}

describe("console OIDC", () => {
  const jwks = new JwksCache(config.jwksUrl, loader);
  it("accepts a valid Keycloak token", async () => {
    const claims = await verifyAccessToken(token({}), config, jwks);
    expect(claims.preferred_username).toBe("geoffroy");
  });
  it("rejects expired, wrong issuer, wrong audience, missing role and tampered tokens", async () => {
    await expect(verifyAccessToken(token({ exp: 1 }), config, jwks)).rejects.toThrow(/expired/);
    await expect(verifyAccessToken(token({ iss: "https://evil" }), config, jwks)).rejects.toThrow(/issuer/);
    await expect(verifyAccessToken(token({ aud: "other" }), config, jwks)).rejects.toThrow(/audience/);
    await expect(verifyAccessToken(token({ realm_access: { roles: [] } }), config, jwks)).rejects.toThrow(/role/);
    const t = token({}).split(".");
    t[1] = enc({ iss: config.issuer, aud: "gtm-console", exp: 9999999999, realm_access: { roles: ["console-user"] } });
    await expect(verifyAccessToken(t.join("."), config, jwks)).rejects.toThrow(/signature/);
    await expect(verifyAccessToken(token({}, "unknown"), config, jwks)).rejects.toThrow(/key/);
  });
  it("accepts azp when aud is absent (Keycloak public client)", async () => {
    const claims = await verifyAccessToken(token({ aud: undefined, azp: "gtm-console" }), config, jwks);
    expect(claims.azp).toBe("gtm-console");
  });

  const app = express();
  app.use(express.json());
  app.use("/api/console", buildConsoleRouter([{ path: "/echo", needsUrl: false, handler: async ({ user }) => ({ who: user?.preferred_username }) }], { config, jwksLoader: loader, store }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/console`;
  afterAll(() => server.close());

  it("protects every console route", async () => {
    expect((await fetch(`${base}/echo`, { method: "POST" })).status).toBe(401);
    expect((await fetch(`${base}/me`)).status).toBe(401);
    expect((await fetch(`${base}/echo`, { method: "POST", headers: { Authorization: "Bearer junk" } })).status).toBe(401);
    const ok = await fetch(`${base}/echo`, { method: "POST", headers: { Authorization: `Bearer ${token({})}`, "Content-Type": "application/json" }, body: "{}" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ who: "geoffroy" });
  });

  it("returns 503 when OIDC is not configured", async () => {
    const a = express();
    a.use("/c", buildConsoleRouter([], { config: null }));
    const s = a.listen(0);
    const r = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/c/me`);
    s.close();
    expect(r.status).toBe(503);
  });
});
