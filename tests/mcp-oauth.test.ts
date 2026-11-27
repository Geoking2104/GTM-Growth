import { describe, expect, it, afterAll } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../src/tenants/store.js";
import { mountMcpHttp, mountMcpMetadata } from "../src/mcp/http.js";
import { mcpResourceConfig, metadataUrl, protectedResourceMetadata, wwwAuthenticate } from "../src/mcp/resource.js";
import { assertTenantScope, isWriteToolCall, runWithMcpAuth, type McpAuthContext } from "../src/mcp/context.js";
import { TenantAccessError } from "../src/tenants/context.js";

const issuer = "https://auth.example.com/realms/gtm-growth";
const resource = "https://gtm.example.com/mcp";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const loader = async () => ({ keys: [jwk] });
const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

const store = new TenantStore(join(mkdtempSync(join(tmpdir(), "mcp-tenants-")), "tenants.json"));
store.upsert({
  id: "acme",
  name: "Acme",
  mode: "organization",
  issuer,
  domains: ["acme.fr"],
  emailDomains: ["acme.fr"],
  gscProperties: ["sc-domain:acme.fr"],
  ga4Properties: ["123"],
  gtmContainers: ["accounts/1/containers/2"],
  googleCredential: "acme.json",
  branding: {},
  identityProviders: [],
  status: "active",
  createdAt: "",
});
store.upsert({
  id: "beta",
  name: "Beta",
  mode: "organization",
  issuer,
  domains: ["beta.fr"],
  emailDomains: ["beta.fr"],
  gscProperties: ["sc-domain:beta.fr"],
  ga4Properties: ["999"],
  branding: {},
  identityProviders: [],
  status: "active",
  createdAt: "",
});

function jwt(claims: Record<string, unknown>) {
  const head = enc({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = enc({
    iss: issuer,
    aud: resource,
    exp: Math.floor(Date.now() / 1000) + 300,
    sub: "user-1",
    email: "dev@acme.fr",
    organization: ["acme"],
    groups: ["/tenants/acme/tenant-user"],
    scope: "mcp:read",
    ...claims,
  });
  return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url")}`;
}

const env: NodeJS.ProcessEnv = {
  OIDC_ISSUER: issuer,
  MCP_RESOURCE: resource,
  MCP_PUBLIC_ORIGIN: "https://gtm.example.com",
  MCP_API_TOKEN: "operator-static-token-value-32chars",
  MCP_STATIC_TOKEN_ENABLED: "true",
};

function app() {
  const a = express();
  a.use(express.json());
  mountMcpMetadata(a, env);
  mountMcpHttp(a, {
    env,
    store,
    jwksLoader: loader,
    resource: mcpResourceConfig(env),
  });
  return a;
}

const server = app().listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

async function mcp(token: string | undefined, body: object, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${base()}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
}

function parseBody(text: string): unknown {
  if (text.startsWith("event:") || text.includes("data:")) {
    const line = text.split("\n").filter((l) => l.startsWith("data:")).pop();
    return JSON.parse(line!.slice(5).trim());
  }
  return JSON.parse(text);
}

describe("MCP resource metadata", () => {
  it("serves RFC 9728 at the path-specific well-known URI", async () => {
    const r = await fetch(`${base()}/.well-known/oauth-protected-resource/mcp`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject(protectedResourceMetadata(mcpResourceConfig(env)!));
    expect(body.authorization_servers).toEqual([issuer]);
    expect(body.scopes_supported).toEqual(["mcp:read", "mcp:write"]);
    expect(metadataUrl(resource)).toBe("https://gtm.example.com/.well-known/oauth-protected-resource/mcp");
  });

  it("includes resource_metadata on unauthenticated /mcp", async () => {
    const r = await mcp(undefined, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    expect(r.status).toBe(401);
    const www = r.headers.get("www-authenticate") ?? "";
    expect(www).toMatch(/resource_metadata=/);
    expect(www).toContain("/.well-known/oauth-protected-resource/mcp");
    expect(www).toContain("scope=");
    expect(wwwAuthenticate(mcpResourceConfig(env)!, { error: "invalid_token" })).toContain("Bearer");
  });
});

describe("MCP bearer auth", () => {
  it("accepts the operator static token (backward compatible)", async () => {
    const r = await mcp(env.MCP_API_TOKEN, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(200);
    const body = parseBody(await r.text()) as { result?: { tools?: { name: string }[] } };
    expect((body.result?.tools?.length ?? 0)).toBeGreaterThan(50);
  });

  it("accepts a Keycloak JWT bound to the MCP resource and lists tools", async () => {
    const r = await mcp(jwt({}), { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(200);
    const body = parseBody(await r.text()) as { result?: { tools?: { name: string }[] } };
    expect(body.result?.tools?.some((t) => t.name === "geo_crawler_access")).toBe(true);
  });

  it("rejects a console token (aud=gtm-console) — no token passthrough", async () => {
    const r = await mcp(jwt({ aud: "gtm-console", azp: "gtm-console" }), { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(401);
  });

  it("rejects a console token even if it also lists the MCP audience", async () => {
    const r = await mcp(jwt({ aud: [resource, "gtm-console"], azp: "gtm-console" }), { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(401);
  });

  it("rejects a JWT without mcp:read", async () => {
    const r = await mcp(jwt({ scope: "openid" }), { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(403);
    expect(r.headers.get("www-authenticate") ?? "").toContain("insufficient_scope");
  });

  it("returns 403 when a write tool is called without mcp:write", async () => {
    const r = await mcp(jwt({ scope: "mcp:read" }), {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "indexnow_submit", arguments: { confirm: true, url: "https://acme.fr/page" } },
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: expect.stringMatching(/mcp:write/) });
  });

  it("scopes AI tracker reads to the selected organization", async () => {
    const response = await mcp(jwt({}), {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "ai_tracker.list_brands", arguments: { tenantId: "beta" } },
    });
    expect(parseBody(await response.text())).toMatchObject({
      result: { isError: true, content: [{ text: expect.stringContaining("selected tenant") }] },
    });
  });

  it("requires write scope and administrator access to create a tracker prompt", async () => {
    const call = {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "ai_tracker.create_prompt", arguments: {
        tenantId: "acme", brandId: "acme", engines: ["chatgpt"], promptText: "Which tool?", confirmed: true,
      } },
    };
    expect((await mcp(jwt({}), call)).status).toBe(403);
    const response = await mcp(jwt({ scope: "mcp:read mcp:write" }), call);
    expect(parseBody(await response.text())).toMatchObject({
      result: { isError: true, content: [{ text: expect.stringContaining("administrator") }] },
    });
  });

  it("does not require mcp:write for a dry configure_measurement_protocol", async () => {
    expect(isWriteToolCall("configure_measurement_protocol", { confirm: true })).toBe(true);
    expect(isWriteToolCall("configure_measurement_protocol", {})).toBe(false);
    expect(isWriteToolCall("geo_audit", { url: "https://acme.fr" })).toBe(false);
  });
});

describe("MCP tenant scoping", () => {
  const oauth = (over: Partial<McpAuthContext> = {}): McpAuthContext => ({
    mode: "oauth",
    sub: "user-1",
    scopes: ["mcp:read"],
    tenant: store.get("acme")!,
    role: "tenant-user",
    platformAdmin: false,
    memberships: [{ id: "acme", role: "tenant-user" }],
    ...over,
  });

  it("blocks a URL outside the tenant", () => {
    expect(() => runWithMcpAuth(oauth(), () => assertTenantScope(oauth(), { url: "https://beta.fr" }))).toThrow(TenantAccessError);
  });

  it("allows a URL on the tenant domain", () => {
    expect(() => assertTenantScope(oauth(), { url: "https://www.acme.fr/page" })).not.toThrow();
  });

  it("does not scope the operator static token", () => {
    const op: McpAuthContext = { mode: "static", sub: "operator:static", scopes: ["mcp:read", "mcp:write"], tenant: null, role: "operator", platformAdmin: true, memberships: [] };
    expect(() => assertTenantScope(op, { url: "https://anywhere.example" })).not.toThrow();
  });
});
