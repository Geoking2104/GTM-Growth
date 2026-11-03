/**
 * Cloudflare Worker for the public website API.
 *
 * Same contract as the Express routes in `src/http/public-api.ts`, same shared
 * modules — the GEO audit, the SEO tables and the lead validator are the code the
 * CLI and the MCP server already use, so there is no second implementation to
 * drift.
 *
 *   POST /api/free-read   GEO score + SEO tables + GA4/GSC blocks
 *   POST /api/lead        contact request (forwarded, and stored in KV if bound)
 *   GET  /health
 *
 * Deploy: `npm run worker:deploy` (see docs/WORKER.md).
 */

import { runFreeRead } from "../freeread/index.js";
import { validateLead, type Lead } from "../leads/validate.js";

export interface Env {
  /** Comma-separated CORS allowlist, e.g. "https://geoking2104.github.io". */
  SITE_ORIGINS?: string;
  /** Where a validated lead is forwarded — Formspree, a CRM, your own inbox. */
  LEAD_FORWARD_URL?: string;
  /** Optional KV namespace: keeps a copy of every lead. */
  LEADS?: KVNamespace;
  /** Optional KV namespace used for per-IP rate limiting. */
  RATE?: KVNamespace;
  /** Requests per minute per IP. Defaults to 8 for reads, 5 for leads. */
  RATE_LIMIT?: string;
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" } as const;
const MAX_BODY_BYTES = 8 * 1024;
const READ_TIMEOUT_MS = 12_000;
const CACHE_TTL_SECONDS = 600;

type Ctx = { waitUntil(promise: Promise<unknown>): void };

/* ── guards ──────────────────────────────────────────────────────────────── */

/** Syntactic SSRF guard. Workers never reach RFC1918 space, but refuse it anyway. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  const v6 = host.replace(/%.*$/, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  if (/^fe80:/.test(v6)) return true;
  return false;
}

export interface TargetCheck {
  ok: boolean;
  url?: string;
  reason?: string;
}

/** Validate the URL a visitor asked us to read. */
export function checkTarget(raw: unknown): TargetCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "url is required" };
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "invalid url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "only http(s) is supported" };
  if (url.username || url.password) return { ok: false, reason: "credentials in the url are not allowed" };
  if (!url.hostname.includes(".")) return { ok: false, reason: "host must be a public domain" };
  if (isBlockedHost(url.hostname)) return { ok: false, reason: "private addresses are not allowed" };
  return { ok: true, url: url.href };
}

/* ── cors ────────────────────────────────────────────────────────────────── */

export function allowedOrigins(env: Env): string[] {
  return (env.SITE_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = allowedOrigins(env);
  const list = allowed.length ? allowed : ["*"];
  const value = origin && (list.includes("*") || list.includes(origin.replace(/\/$/, ""))) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/* ── rate limiting ───────────────────────────────────────────────────────── */

/** Best-effort per-minute counter. KV is eventually consistent: the WAF is the backstop. */
export async function underLimit(
  env: Env,
  bucket: string,
  ip: string,
  limit: number,
  now = Date.now()
): Promise<boolean> {
  if (!env.RATE) return true;
  const window = Math.floor(now / 60_000);
  const key = `rl:${bucket}:${ip}:${window}`;
  const current = Number((await env.RATE.get(key)) ?? "0");
  if (current >= limit) return false;
  await env.RATE.put(key, String(current + 1), { expirationTtl: 120 });
  return true;
}

/* ── handlers ────────────────────────────────────────────────────────────── */

const json = (body: unknown, status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

async function readJsonBody(request: Request): Promise<{ ok: boolean; value?: Record<string, unknown>; error?: string }> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return { ok: false, error: "payload too large" };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: "payload too large" };
  try {
    const parsed = JSON.parse(text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "invalid body" };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "invalid json" };
  }
}

export async function handleLead(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const headers = corsHeaders(request.headers.get("origin"), env);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = Number(env.RATE_LIMIT ?? 5) || 5;
  if (!(await underLimit(env, "lead", ip, limit))) {
    return json({ error: "Too many requests — try again shortly." }, 429, headers);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !body.value) return json({ error: body.error ?? "invalid body" }, 400, headers);

  const validation = validateLead(body.value);
  if (!validation.ok || !validation.lead) {
    // A honeypot or an instant post gets a 202 and stores nothing.
    if (validation.errors?.includes("rejected")) return json({ ok: true }, 202, headers);
    return json({ error: "Invalid submission", fields: validation.errors ?? [] }, 400, headers);
  }

  const lead: Lead = validation.lead;

  if (env.LEADS) {
    ctx.waitUntil(env.LEADS.put(`lead:${lead.receivedAt}:${lead.id}`, JSON.stringify(lead), { expirationTtl: 60 * 60 * 24 * 180 }));
  }

  const forward = env.LEAD_FORWARD_URL;
  if (forward) {
    const payload = { ...lead, _subject: `GEO report request — ${lead.website}` };
    ctx.waitUntil(
      fetch(forward, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined)
    );
  }

  return json({ ok: true, id: lead.id }, 201, headers);
}

export async function handleFreeRead(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const headers = corsHeaders(request.headers.get("origin"), env);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = Number(env.RATE_LIMIT ?? 8) || 8;
  if (!(await underLimit(env, "read", ip, limit))) {
    return json({ error: "Too many reads — try again in a minute." }, 429, headers);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !body.value) return json({ error: body.error ?? "invalid body" }, 400, headers);

  const check = checkTarget(body.value.url);
  if (!check.ok || !check.url) return json({ error: check.reason ?? "invalid url" }, 400, headers);

  // The Cache API is an optimisation, never a requirement: local workerd and
  // some plan tiers expose `caches` without a usable `default` cache.
  const cacheKey = new Request(`https://cache.internal/free-read?url=${encodeURIComponent(check.url.toLowerCase())}`);
  let cache: Cache | undefined;
  try {
    cache = (caches as unknown as { default?: Cache } | undefined)?.default;
  } catch {
    cache = undefined;
  }
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const cached = (await hit.json()) as Record<string, unknown>;
        return json({ ...cached, cached: true }, 200, headers);
      }
    } catch {
      cache = undefined;
    }
  }

  try {
    const result = await runFreeRead({ url: check.url, timeoutMs: READ_TIMEOUT_MS });
    if (cache) {
      ctx.waitUntil(
        cache
          .put(
            cacheKey,
            new Response(JSON.stringify(result), {
              headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` },
            })
          )
          .catch(() => undefined)
      );
    }
    return json(result, 200, headers);
  } catch (error) {
    console.error("free-read failed", error instanceof Error ? error.message : String(error));
    return json({ error: "The site could not be read. Check that it is publicly reachable." }, 502, headers);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin"), env) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ status: "ok", runtime: "worker" }, 200);
    }

    if (url.pathname === "/api/lead" && request.method === "POST") return handleLead(request, env, ctx);
    if (url.pathname === "/api/free-read" && request.method === "POST") return handleFreeRead(request, env, ctx);

    return json({ error: "not found", routes: ["POST /api/lead", "POST /api/free-read", "GET /health"] }, 404);
  },
};
