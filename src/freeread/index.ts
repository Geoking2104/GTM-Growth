/**
 * The free read, server-side.
 *
 * The homepage, robots.txt and sitemap are fetched once and injected into the
 * GEO audit, so a free read costs the target one request per resource — the
 * same shape as a normal visitor, not a crawler storm.
 *
 * Returns the GEO score, the fixes that move it most, the SEO tables and the
 * GA4 / Search Console blocks. Traffic rows are real only when a credential is
 * supplied; otherwise they carry `sample: true`.
 */

import { extractJourneyContext, type JourneyContext } from "./journey-context.js";
import { runGeoAudit } from "../geo/audit.js";
import { fetchText, type FetchResult, type Fetcher } from "../geo/http.js";
import { HtmlDoc } from "../geo/html.js";
import { ga4Table, gscTable, trafficTable, type TrafficSample } from "./analytics.js";
import { seoTables, type DataTable } from "./seo.js";
import { buildSitemapMap, type SitemapMap } from "./sitemap-map.js";

export interface FreeReadOpportunity {
  checkId: string;
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "fail" | "partial";
  points: number;
  action: string;
  evidence: string;
}

export interface FreeReadSocialProfile {
  platform: string;
  url: string;
  source: "page" | "schema";
}

export interface FreeReadOptions {
  url: string;
  /** Injected for tests; defaults to the real fetcher. */
  fetcher?: Fetcher;
  timeoutMs?: number;
  /** Real traffic rows, when the caller has a connected property. */
  traffic?: { ga4?: TrafficSample | null; gsc?: TrafficSample | null; connected: boolean };
}

export interface FreeReadResult {
  url: string;
  finalUrl: string;
  httpStatus: number;
  durationMs: number;
  score: number;
  band: string;
  projectedScore: number;
  recoverablePoints: number;
  headline: { label: string; value: string }[];
  topFixes: { checkId: string; points: number; action: string }[];
  /** A bounded, evidence-backed set of choices for the public recommendation assistant. */
  opportunities: FreeReadOpportunity[];
  checksSummary: { passed: number; toImprove: number; total: number };
  /** Outbound social profile links only; inbound backlinks are never inferred. */
  socialProfiles: FreeReadSocialProfile[];
  /** Observed page facts for a clearly hypothetical customer journey. */
  journeyContext: JourneyContext;
  pageSignals: { title: string; description: string; htmlLang: string; h1: string[]; h2: string[] };
  tables: DataTable[];
  /** Sitemap architecture and freshness data for the free visual map. */
  sitemapMap: SitemapMap | null;
  limitations: string[];
}

const SITEMAP_CANDIDATES = ["/sitemap.xml", "/sitemap_index.xml"];

const SOCIAL_DOMAINS: Record<string, string[]> = {
  LinkedIn: ["linkedin.com"],
  Instagram: ["instagram.com"],
  "X / Twitter": ["x.com", "twitter.com"],
  TikTok: ["tiktok.com"],
  Reddit: ["reddit.com"],
  Discord: ["discord.gg", "discord.com"],
  YouTube: ["youtube.com", "youtu.be"],
  Facebook: ["facebook.com"],
};

function socialProfiles(doc: HtmlDoc, sameAs: string[]): FreeReadSocialProfile[] {
  const found = new Map<string, FreeReadSocialProfile>();
  const hrefs = doc.all("a").map((anchor) => anchor.attrs.href ?? "");
  for (const [source, urls] of [["schema", sameAs], ["page", hrefs]] as const) {
    for (const candidate of urls) {
      try {
        const url = new URL(candidate);
        if (url.protocol !== "https:" && url.protocol !== "http:") continue;
        const host = url.hostname.toLowerCase();
        const match = Object.entries(SOCIAL_DOMAINS).find(([, domains]) =>
          domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
        );
        if (match && !found.has(match[0])) found.set(match[0], { platform: match[0], url: url.href, source });
      } catch { /* Ignore relative/non-HTTP links and malformed schema values. */ }
    }
  }
  return [...found.values()];
}

const keyOf = (value: string): string => {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value;
  }
};

/** Serve already-fetched resources to the audit instead of asking twice. */
function withSeeds(seeds: Map<string, FetchResult>, fetcher: Fetcher): Fetcher {
  return async (url, init) => {
    const key = keyOf(url);
    const seed = seeds.get(key);
    if (seed) {
      seeds.delete(key);
      return seed;
    }
    return fetcher(url, init);
  };
}

async function tryFetch(
  fetcher: Fetcher | null,
  url: string,
  accept: string,
  timeoutMs: number
): Promise<FetchResult | null> {
  if (!fetcher) return null;
  try {
    const result = await fetcher(url, { accept, timeoutMs });
    return result.status >= 200 && result.status < 300 ? result : null;
  } catch {
    return null;
  }
}

export async function runFreeRead(options: FreeReadOptions): Promise<FreeReadResult> {
  const fetcher = options.fetcher ?? fetchText;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const started = Date.now();

  // Two requests up front: the page, and robots.txt (the audit wants it too).
  const page = await fetcher(options.url, { accept: "text/html,application/xhtml+xml", timeoutMs });
  const finalUrl = page.url || options.url;
  const origin = new URL(finalUrl).origin;

  const robots = await tryFetch(fetcher, `${origin}/robots.txt`, "text/plain", timeoutMs);
  const sitemapResults = await Promise.all(
    SITEMAP_CANDIDATES.map((path) => tryFetch(fetcher, `${origin}${path}`, "application/xml,text/xml", timeoutMs))
  );
  const sitemap = sitemapResults.find(Boolean) ?? null;

  const seeds = new Map<string, FetchResult>();
  seeds.set(keyOf(finalUrl), page);
  seeds.set(keyOf(options.url), page);
  if (robots) seeds.set(keyOf(robots.url || `${origin}/robots.txt`), robots);

  const audit = await runGeoAudit({
    url: options.url,
    fetcher: withSeeds(seeds, fetcher),
    timeoutMs,
  });

  const doc = HtmlDoc.parse(page.body);
  const analyticsInput = {
    doc,
    finalUrl,
    robotsTxt: robots?.body ?? null,
    sitemapXml: sitemap?.body ?? null,
    headers: page.headers,
  };

  const traffic = options.traffic;
  const tables: DataTable[] = [
    ...seoTables(doc, finalUrl, page.headers),
    ga4Table(analyticsInput, page.body),
    gscTable(analyticsInput),
    trafficTable("ga4", traffic?.ga4 ?? null, Boolean(traffic?.connected && traffic?.ga4)),
    trafficTable("gsc", traffic?.gsc ?? null, Boolean(traffic?.connected && traffic?.gsc)),
  ];

  const host = (() => {
    try {
      return new URL(finalUrl).hostname;
    } catch {
      return options.url;
    }
  })();

  const byId = new Map(audit.checks.map((check) => [check.id, check]));
  const opportunities: FreeReadOpportunity[] = audit.recommendations.slice(0, 12).map((rec) => ({
    checkId: rec.checkId,
    category: rec.category,
    priority: rec.priority,
    status: byId.get(rec.checkId)?.status === "partial" ? "partial" : "fail",
    points: rec.points,
    action: rec.action,
    evidence: byId.get(rec.checkId)?.evidence ?? "No evidence available",
  }));

  return {
    url: options.url,
    finalUrl,
    httpStatus: page.status,
    durationMs: Date.now() - started,
    score: audit.score,
    band: audit.band,
    projectedScore: audit.projectedScore,
    recoverablePoints: audit.recoverablePoints,
    headline: [
      { label: "GEO score", value: `${audit.score}/100` },
      { label: "Projected", value: `${audit.projectedScore}/100` },
      { label: "Recoverable", value: `${audit.recoverablePoints} pts` },
      { label: "Host", value: host },
    ],
    topFixes: audit.recommendations.slice(0, 3).map((rec) => ({
      checkId: rec.checkId,
      points: rec.points,
      action: rec.action,
    })),
    opportunities,
    checksSummary: {
      passed: audit.checks.filter((check) => check.status === "pass").length,
      toImprove: audit.checks.filter((check) => check.status === "fail" || check.status === "partial").length,
      total: audit.checks.filter((check) => check.status !== "info").length,
    },
    socialProfiles: socialProfiles(doc, audit.details.schema.sameAsUrls),
    journeyContext: extractJourneyContext(doc, finalUrl),
    pageSignals: {
      title: (doc.title() ?? "").replace(/\s+/g, " ").trim().slice(0, 130),
      description: (doc.metaByName("description")?.attrs.content ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
      htmlLang: (doc.htmlLang() ?? "").slice(0, 20),
      h1: doc.all("h1").slice(0, 4).map((node) => doc.textOf(node).replace(/\s+/g, " ").trim().slice(0, 130)),
      h2: doc.all("h2").slice(0, 8).map((node) => doc.textOf(node).replace(/\s+/g, " ").trim().slice(0, 130)),
    },
    tables,
    sitemapMap: buildSitemapMap(sitemap?.body ?? null, sitemap?.url ?? null, host),
    limitations: [
      "The GEO score covers the audited page only, not the whole site.",
      "GA4 and Search Console traffic rows are sample data unless a property is connected.",
      "No AI engine is queried: readiness is measured, citations are not claimed.",
    ],
  };
}
