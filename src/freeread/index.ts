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

import { runGeoAudit } from "../geo/audit.js";
import { fetchText, type FetchResult, type Fetcher } from "../geo/http.js";
import { HtmlDoc } from "../geo/html.js";
import { analyzeSocialLinks } from "../geo/social-links.js";
import type { SocialLink } from "../geo/social-links.js";
import { ga4Table, gscTable, trafficTable, type TrafficSample } from "./analytics.js";
import { seoTables, type DataTable } from "./seo.js";
import { buildSitemapMap, type SitemapMap } from "./sitemap-map.js";

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
  scoreBreakdown: Record<string, number>;
  scoreMax: Record<string, number>;
  band: string;
  projectedScore: number;
  recoverablePoints: number;
  headline: { label: string; value: string }[];
  topFixes: { checkId: string; points: number; action: string }[];
  tables: DataTable[];
  /** Sitemap architecture and freshness data for the free visual map. */
  sitemapMap: SitemapMap | null;
  socialLinks: { outboundProfiles: SocialLink[]; inboundObservationCount: number; notice: string };
  scoreVersion: "v1";
  limitations: string[];
}

const SITEMAP_CANDIDATES = ["/sitemap.xml", "/sitemap_index.xml"];

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
  const social = analyzeSocialLinks(finalUrl, page.body);
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
    {
      id: "geo.social",
      title: "GEO — social cross-links",
      subtitle: "Website outbound links observed; inbound backlinks not automatically verified",
      rows: social.outboundProfiles.length
        ? social.outboundProfiles.map(link => ({
            label: link.platform,
            value: link.url,
            status: "info" as const,
            note: `Source: ${link.sources.join(" + ")} · Inbound: not checked`,
          }))
        : [{ label: "Social profiles", value: "none detected", status: "warn" as const,
             note: "Link official profiles from your site and Organization sameAs data." }],
    },
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

  return {
    url: options.url,
    finalUrl,
    httpStatus: page.status,
    durationMs: Date.now() - started,
    score: audit.score,
    scoreBreakdown: audit.scoreBreakdown,
    scoreMax: audit.scoreMax,
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
    tables,
    sitemapMap: buildSitemapMap(sitemap?.body ?? null, sitemap?.url ?? null, host),
    scoreVersion: "v1",
    socialLinks: { outboundProfiles: social.outboundProfiles, inboundObservationCount: 0, notice: social.notice },
    limitations: [
      "The GEO score is the existing v1 rubric, not the developing v2 score.",
      "Social inbound backlinks are not automatically verified.",
      "The GEO score covers the audited page only, not the whole site.",
      "GA4 and Search Console traffic rows are sample data unless a property is connected.",
      "No AI engine is queried: readiness is measured, citations are not claimed.",
    ],
  };
}
