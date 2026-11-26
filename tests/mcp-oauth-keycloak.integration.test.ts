/**
 * Live Keycloak 26.4.7 integration. Skipped unless the local container is up
 * (see deploy/kayroslab-vps/keycloak/mcp-oauth/up-local.sh).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { TenantStore } from "../src/tenants/store.js";
import { mountMcpHttp, mountMcpMetadata } from "../src/mcp/http.js";
import { mcpResourceConfig } from "../src/mcp/resource.js";

const kc = (process.env.KEYCLOAK_URL || "http://127.0.0.1:8180").replace(/\/$/, "");
const realm = process.env.REALM || "gtm-growth-mcp-test";
const issuer = `${kc}/realms/${realm}`;
const password = process.env.MCP_TEST_USER_PASSWORD || "ChangeMe_test_only_12";

async function keycloakUp(): Promise<boolean> {
  try {
    const r = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

const ready = await keycloakUp();

function b64url(buf: Buffer) {
  return buf.toString("base64url");
}

function pkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function listenCallback(): Promise<{ port: number; wait: () => Promise<URL>; close: () => Promise<void> }> {
  let resolveUrl: (u: URL) => void;
  const done = new Promise<URL>((resolve) => { resolveUrl = resolve; });
  const server = createServer((req, res) => {
    const u = new URL(req.url || "/", `http://127.0.0.1`);
    res.statusCode = 200;
    res.end("ok");
    resolveUrl(u);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { port, wait: () => done, close: () => new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())) };
}

async function loginWithAuthorizationCode(opts: { clientId: string; redirect: string; scope: string; username: string }): Promise<{ code: string; verifier: string }> {
  const { verifier, challenge } = pkce();
  const auth = new URL(`${issuer}/protocol/openid-connect/auth`);
  auth.searchParams.set("client_id", opts.clientId);
  auth.searchParams.set("redirect_uri", opts.redirect);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", opts.scope);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("state", "st");
  auth.searchParams.set("resource", "http://127.0.0.1:18790/mcp");

  const jar = new Map<string, string>();
  const headers = (): Record<string, string> => ({
    Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
  });
  const storeCookies = (res: Response) => {
    const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
    for (const c of raw) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  };
  const hidden = (html: string) => {
    const form = new URLSearchParams();
    for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
      const tag = match[0];
      const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
      const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? "";
      if (name && name !== "username" && name !== "password") form.set(name, value.replace(/&amp;/g, "&"));
    }
    return form;
  };
  const formAction = (html: string) => {
    const tagged = html.match(/<form[^>]*id=["']kc-form-login["'][^>]*>/i)?.[0]
      ?? html.match(/<form[^>]*action=["'][^"']+["'][^>]*>/i)?.[0];
    const action = tagged?.match(/action=["']([^"']+)["']/i)?.[1];
    if (!action) throw new Error("Keycloak login form not found");
    return action.replace(/&amp;/g, "&");
  };
  const submit = async (action: string, form: URLSearchParams) => {
    const res = await fetch(action, {
      method: "POST",
      redirect: "manual",
      headers: { ...headers(), "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    storeCookies(res);
    return res;
  };
  const codeFrom = (res: Response, base: string): string | undefined => {
    const loc = res.headers.get("location");
    if (!(res.status >= 300 && res.status < 400 && loc)) return;
    const next = new URL(loc, base);
    if (next.origin === new URL(opts.redirect).origin) return next.searchParams.get("code") ?? undefined;
  };

  let location = auth.href;
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(location, { redirect: "manual", headers: headers() });
    storeCookies(res);
    const early = codeFrom(res, location);
    if (early) return { code: early, verifier };
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      location = new URL(loc, location).href;
      continue;
    }
    const html = await res.text();
    const action = formAction(html);
    const form = hidden(html);
    const hasUser = /name=["']username["']/i.test(html);
    const hasPass = /name=["']password["']/i.test(html);
    if (hasUser) form.set("username", opts.username);
    if (hasPass) form.set("password", password);
    if (!hasUser && !hasPass) throw new Error("unsupported Keycloak login step");
    const post = await submit(action, form);
    const code = codeFrom(post, action);
    if (code) return { code, verifier };
    const dest = post.headers.get("location");
    if (dest) {
      location = new URL(dest, action).href;
      continue;
    }
    if (post.status === 200 && hasUser && !hasPass) {
      // Username-first form: the next page asks for the password.
      location = action;
      // Re-parse the password page from the POST body.
      const nextHtml = await post.text();
      const nextAction = formAction(nextHtml);
      const nextForm = hidden(nextHtml);
      nextForm.set("password", password);
      const pw = await submit(nextAction, nextForm);
      const pwCode = codeFrom(pw, nextAction);
      if (pwCode) return { code: pwCode, verifier };
      if (pw.headers.get("location")) {
        location = new URL(pw.headers.get("location")!, nextAction).href;
        continue;
      }
      throw new Error(`password step failed (${pw.status})`);
    }
    throw new Error(`login failed (${post.status})`);
  }
  throw new Error("too many hops during authorization code login");
}

describe.runIf(ready)("MCP OAuth against local Keycloak 26.4.7", () => {
  let accessRead = "";
  let accessWrite = "";
  let mcpBase = "";
  let closeMcp: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const discovery = await (await fetch(`${issuer}/.well-known/openid-configuration`)).json() as {
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint?: string;
      code_challenge_methods_supported?: string[];
    };
    expect(discovery.code_challenge_methods_supported).toContain("S256");
    expect(discovery.registration_endpoint).toBeTruthy();

    const cb = await listenCallback();
    const redirect = `http://127.0.0.1:${cb.port}/callback`;
    const registration = await fetch(discovery.registration_endpoint!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "gtm-mcp-integration",
        redirect_uris: [redirect],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        application_type: "web",
      }),
    });
    const raw = await registration.text();
    expect(registration.status, raw).toBe(201);
    const client = JSON.parse(raw) as { client_id: string };
    expect(client.client_id).toBeTruthy();

    const login = await loginWithAuthorizationCode({
      clientId: client.client_id,
      redirect,
      scope: "openid mcp:read organization",
      username: "mcp-reader",
    });
    // The callback server may or may not have seen the browser-less redirect; the login helper already has the code.
    await cb.close();

    const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code: login.code,
        redirect_uri: redirect,
        code_verifier: login.verifier,
        resource: "http://127.0.0.1:18790/mcp",
      }),
    });
    const tokenBody = await tokenRes.json() as { access_token?: string; error?: string };
    expect(tokenRes.ok, tokenBody.error).toBe(true);
    accessRead = tokenBody.access_token!;
    expect(accessRead.split(".").length).toBe(3);
    const claims = JSON.parse(Buffer.from(accessRead.split(".")[1], "base64url").toString("utf8")) as {
      aud?: string | string[]; iss?: string; azp?: string; scope?: string; groups?: string[];
    };
    const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    expect(claims.iss).toBe(issuer);
    expect(aud).toContain("http://127.0.0.1:18790/mcp");
    expect(String(claims.scope ?? "")).toContain("mcp:read");
    expect((claims.groups ?? []).some((g) => g.includes("/tenants/acme/"))).toBe(true);

    // A second public client + writer user with mcp:write would need another redirect port; reuse DCR client with a new callback later if needed.
    accessWrite = accessRead;

    const store = new TenantStore(join(mkdtempSync(join(tmpdir(), "mcp-kc-")), "tenants.json"));
    store.upsert({
      id: "acme",
      name: "Acme",
      mode: "organization",
      issuer,
      domains: ["acme.fr"],
      emailDomains: ["acme.fr"],
      gscProperties: ["sc-domain:acme.fr"],
      ga4Properties: ["123"],
      branding: {},
      identityProviders: [],
      status: "active",
      createdAt: "",
    });
    const env: NodeJS.ProcessEnv = {
      OIDC_ISSUER: issuer,
      MCP_RESOURCE: "http://127.0.0.1:18790/mcp",
      MCP_PUBLIC_ORIGIN: "http://127.0.0.1:18790",
      MCP_STATIC_TOKEN_ENABLED: "false",
    };
    const a = express();
    a.use(express.json());
    mountMcpMetadata(a, env);
    mountMcpHttp(a, { env, store, resource: mcpResourceConfig(env) });
    const srv = a.listen(18790, "127.0.0.1");
    await new Promise<void>((resolve) => srv.once("listening", () => resolve()));
    mcpBase = "http://127.0.0.1:18790";
    closeMcp = () => new Promise((resolve, reject) => srv.close((e) => e ? reject(e) : resolve()));
  }, 90_000);

  afterAll(async () => { await closeMcp(); });

  async function call(token: string | undefined, body: object) {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${mcpBase}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  }

  it("discovers the protected resource and authorization server", async () => {
    const meta = await (await fetch(`${mcpBase}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(meta.resource).toBe("http://127.0.0.1:18790/mcp");
    expect(meta.authorization_servers).toContain(issuer);
  });

  it("returns 401 without a token", async () => {
    const r = await call(undefined, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate") ?? "").toContain("resource_metadata=");
  });

  it("lists tools with an access token scoped to the tenant", async () => {
    const r = await call(accessRead, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(200);
    const text = await r.text();
    const line = text.includes("data:") ? text.split("\n").filter((l) => l.startsWith("data:")).pop()!.slice(5) : text;
    const body = JSON.parse(line) as { result?: { tools?: unknown[] } };
    expect((body.result?.tools?.length ?? 0)).toBeGreaterThan(50);
  });

  it("returns 403 on a write tool without mcp:write", async () => {
    const r = await call(accessWrite, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "indexnow_submit", arguments: { confirm: true, url: "https://acme.fr/" } },
    });
    expect(r.status).toBe(403);
  });
});

describe.skipIf(ready)("MCP OAuth against local Keycloak 26.4.7", () => {
  it("skips when Keycloak is not running", () => {
    expect(ready).toBe(false);
  });
});
