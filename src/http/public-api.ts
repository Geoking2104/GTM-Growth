/**
 * Public website API: the endpoints the landing page calls.
 *
 * Two routes, both JSON, both safe to expose:
 *   POST /api/free-read  → the enriched free read (SEO tables + GA4/GSC blocks)
 *   POST /api/lead       → lead capture, no mail client
 *
 * Protections that matter for a public endpoint:
 *  - the free read only fetches public http(s) origins (no localhost, no RFC1918,
 *    no link-local, no decimal/hex IP tricks) and caps redirects;
 *  - a small per-IP token bucket keeps one visitor from turning it into a
 *    crawler;
 *  - CORS is limited to the configured site origins, and the endpoint answers
 *    OPTIONS so the browser never falls back to a form POST.
 */

import type { Express, Request, Response } from "express";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { appendLead, validateLead } from "../leads/store.js";
import { runFreeRead } from "../freeread/index.js";
import { fetchPublicPage } from "./public-fetch.js";
import { logger } from "../utils/logger.js";

const CACHE_TTL_MS = 10 * 60_000;
const MAX_BODY = 4 * 1024;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

function createLimiter(perMinute: number) {
  const buckets = new Map<string, Bucket>();
  return (key: string, now = Date.now()): boolean => {
    const bucket = buckets.get(key) ?? { tokens: perMinute, updatedAt: now };
    const refill = ((now - bucket.updatedAt) / 60_000) * perMinute;
    bucket.tokens = Math.min(perMinute, bucket.tokens + refill);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    if (buckets.size > 5000) {
      for (const [id, value] of buckets) {
        if (now - value.updatedAt > 15 * 60_000) buckets.delete(id);
      }
    }
    return true;
  };
}

const freeReadLimiter = createLimiter(8);
const leadLimiter = createLimiter(5);

/** Private, loopback, link-local and metadata ranges — refused outright. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    return false;
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === "::1" || value === "::") return true;
    if (value.startsWith("fc") || value.startsWith("fd")) return true;
    if (value.startsWith("fe80")) return true;
    if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
    return false;
  }
  return false;
}

export interface UrlCheck {
  ok: boolean;
  url?: string;
  reason?: string;
}

/**
 * Validate a target URL for a server-side fetch: public host, no credentials in
 * the URL, only http(s), and a DNS answer that is not private.
 */
export async function checkTarget(raw: unknown, options: { resolve?: typeof lookup } = {}): Promise<UrlCheck> {
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
  if (isIP(url.hostname) && isPrivateAddress(url.hostname)) return { ok: false, reason: "private addresses are not allowed" };

  const resolve = options.resolve ?? lookup;
  try {
    const answers = await resolve(url.hostname, { all: true });
    const list = Array.isArray(answers) ? answers : [{ address: (answers as { address: string }).address }];
    if (list.some((entry) => isPrivateAddress(entry.address))) {
      return { ok: false, reason: "host resolves to a private address" };
    }
  } catch {
    return { ok: false, reason: "host could not be resolved" };
  }
  return { ok: true, url: url.href };
}

function originAllowed(origin: string | undefined): boolean {
  const allowed = (process.env.SITE_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.length) return true; // open by default: the endpoint serves public data
  if (!origin) return true; // curl/CLI, no browser origin
  return allowed.includes(origin);
}

function cors(res: Response, origin: string | undefined): void {
  res.setHeader("Access-Control-Allow-Origin", origin && originAllowed(origin) ? origin : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
}

const cache = new Map<string, { at: number; payload: unknown }>();

export function mountPublicApi(app: Express): void {
  app.options("/api/free-read", (req, res) => {
    cors(res, req.headers.origin);
    res.status(204).end();
  });
  app.options("/api/lead", (req, res) => {
    cors(res, req.headers.origin);
    res.status(204).end();
  });

  app.post("/api/free-read", async (req: Request, res: Response) => {
    cors(res, req.headers.origin);
    if (!originAllowed(req.headers.origin)) return res.status(403).json({ error: "origin not allowed" });

    const ip = req.ip ?? "unknown";
    if (!freeReadLimiter(ip)) return res.status(429).json({ error: "Too many reads — try again in a minute." });

    const body = (req.body ?? {}) as { url?: unknown };
    const check = await checkTarget(body.url);
    if (!check.ok || !check.url) return res.status(400).json({ error: check.reason ?? "invalid url" });

    const key = check.url.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return res.json({ ...(cached.payload as object), cached: true });
    }

    try {
      const result = await runFreeRead({ url: check.url, timeoutMs: 12_000, fetcher: fetchPublicPage });
      cache.set(key, { at: Date.now(), payload: result });
      if (cache.size > 500) cache.clear();
      return res.json(result);
    } catch (error) {
      logger.info(`[free-read] ${check.url} failed: ${(error as Error).message}`);
      return res.status(502).json({ error: "The site could not be read. Check that it is publicly reachable." });
    }
  });

  app.post("/api/lead", (req: Request, res: Response) => {
    cors(res, req.headers.origin);
    if (!originAllowed(req.headers.origin)) return res.status(403).json({ error: "origin not allowed" });

    const ip = req.ip ?? "unknown";
    if (!leadLimiter(ip)) return res.status(429).json({ error: "Too many requests — try again shortly." });

    const raw = JSON.stringify(req.body ?? {});
    if (raw.length > MAX_BODY) return res.status(413).json({ error: "payload too large" });

    const validation = validateLead((req.body ?? {}) as Record<string, unknown>);
    if (!validation.ok || !validation.lead) {
      if (validation.errors?.includes("rejected")) return res.status(202).json({ ok: true });
      return res.status(400).json({ error: "Invalid submission", fields: validation.errors ?? [] });
    }

    const lead = validation.lead;
    const file = process.env.LEADS_PATH ?? "data/leads.jsonl";

    try {
      appendLead(lead, file);
    } catch (error) {
      logger.info(`[lead] could not persist: ${(error as Error).message}`);
      return res.status(500).json({ error: "Could not store the request." });
    }

    const webhook = process.env.LEAD_WEBHOOK_URL;
    if (webhook) {
      void fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `New GEO report request — ${lead.name} (${lead.website})`, lead }),
        signal: AbortSignal.timeout(6000),
      }).catch((error: Error) => logger.info(`[lead] webhook failed: ${error.message}`));
    }

    logger.info(`[lead] stored ${lead.id} (${lead.email})`);
    return res.status(201).json({ ok: true, id: lead.id });
  });
}
