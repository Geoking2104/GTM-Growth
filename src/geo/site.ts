import { fetchQuiet, fetchText } from "./http.js";
import type { Fetcher } from "./http.js";
import { normalizeUrl, runGeoAudit } from "./audit.js";
import { belongsToDomain, isSitemapIndex, parseSitemap, parseSitemapIndex } from "./sitemap.js";
import type { SitemapEntry } from "./sitemap.js";
import type { GeoAuditResult, SitemapAuditResult } from "./types.js";

export interface SiteAuditOptions {
  url: string;
  sitemapUrl?: string;
  /** Pages to audit, strongest sitemap priority first. Default 10, max 25. */
  maxUrls?: number;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export interface CollectSitemapOptions {
  url: string;
  sitemapUrl?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
  /** Sub-sitemaps followed when the sitemap is an index. Default 5. */
  maxSitemaps?: number;
}

export interface CollectedSitemap {
  sitemapUrl: string;
  entries: SitemapEntry[];
}

function rootUrl(base: string, path: string): string {
  return new URL(path, new URL(base).origin).toString();
}

/** Discover the sitemap an AI crawler would use: robots.txt, then the defaults. */
async function discoverSitemaps(
  base: string,
  explicit: string | undefined,
  fetcher: Fetcher,
  timeoutMs?: number
): Promise<string[]> {
  if (explicit) return [explicit];

  const robots = await fetchQuiet(fetcher, rootUrl(base, "/robots.txt"), {
    timeoutMs,
    accept: "text/plain,*/*",
  });
  if (robots?.status === 200) {
    const declared = robots.body
      .split(/\r?\n/)
      .map((line) => line.split("#")[0].trim())
      .filter((line) => /^sitemap:/i.test(line))
      .map((line) => line.slice(line.indexOf(":") + 1).trim())
      .filter((value) => /^https?:\/\//i.test(value));
    if (declared.length) return declared;
  }

  return [rootUrl(base, "/sitemap.xml"), rootUrl(base, "/sitemap_index.xml")];
}

/**
 * Read a site's sitemap (following one level of sitemap index) and return the
 * page entries that belong to the site's own host.
 */
export async function collectSitemapEntries(
  options: CollectSitemapOptions
): Promise<CollectedSitemap> {
  const fetcher = options.fetcher ?? fetchText;
  const base = normalizeUrl(options.url);
  const host = new URL(base).hostname;
  const maxSitemaps = Math.min(Math.max(options.maxSitemaps ?? 5, 1), 10);

  const candidates = await discoverSitemaps(base, options.sitemapUrl, fetcher, options.timeoutMs);
  let sitemapUrl = candidates[0];
  let entries: SitemapEntry[] = [];

  for (const candidate of candidates) {
    const response = await fetchQuiet(fetcher, candidate, {
      timeoutMs: options.timeoutMs,
      accept: "application/xml,text/xml,*/*",
    });
    if (!response || response.status !== 200) continue;

    sitemapUrl = candidate;
    if (isSitemapIndex(response.body)) {
      const children = parseSitemapIndex(response.body).slice(0, maxSitemaps);
      for (const child of children) {
        const childResponse = await fetchQuiet(fetcher, child, {
          timeoutMs: options.timeoutMs,
          accept: "application/xml,text/xml,*/*",
        });
        if (childResponse?.status === 200) entries.push(...parseSitemap(childResponse.body));
      }
    } else {
      entries.push(...parseSitemap(response.body));
    }
    if (entries.length) break;
  }

  return {
    sitemapUrl,
    entries: [...new Map(entries.map((entry) => [entry.url, entry])).values()].filter((entry) =>
      belongsToDomain(entry.url, host)
    ),
  };
}

/**
 * Audit a sample of a site's pages so a single strong homepage cannot hide a
 * site-wide GEO gap. Sitemap discovery follows robots.txt first, matching what
 * crawlers do.
 */
export async function runSiteGeoAudit(options: SiteAuditOptions): Promise<SitemapAuditResult> {
  const fetcher = options.fetcher ?? fetchText;
  const base = normalizeUrl(options.url);
  const maxUrls = Math.min(Math.max(options.maxUrls ?? 10, 1), 25);

  const { sitemapUrl, entries } = await collectSitemapEntries({
    url: base,
    sitemapUrl: options.sitemapUrl,
    fetcher,
    timeoutMs: options.timeoutMs,
  });

  const ordered = [...entries].sort((a, b) => b.priority - a.priority);
  const normalizedBase = base.replace(/\/$/, "");
  const home = ordered.find((entry) => entry.url.replace(/\/$/, "") === normalizedBase);
  const targets = [
    home ?? { url: base, priority: 1, changefreq: null, lastmod: null },
    ...ordered.filter((entry) => entry !== home),
  ]
    .filter((entry, index, list) => list.findIndex((item) => item.url === entry.url) === index)
    .slice(0, maxUrls);

  if (!targets.length) targets.push({ url: base, priority: 1, changefreq: null, lastmod: null });

  const results: GeoAuditResult[] = [];
  let pagesFailed = 0;
  for (const target of targets) {
    const result = await runGeoAudit({
      url: target.url,
      fetcher,
      timeoutMs: options.timeoutMs,
      includeAiDiscovery: false,
    });
    if (result.error) pagesFailed += 1;
    results.push(result);
  }

  const successful = results.filter((result) => !result.error);
  const averageScore = successful.length
    ? Math.round(successful.reduce((sum, result) => sum + result.score, 0) / successful.length)
    : 0;

  const weakest = [...successful]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((result) => ({
      url: result.url,
      score: result.score,
      band: result.band,
      topFixes: result.recommendations.slice(0, 2).map((recommendation) => recommendation.action),
    }));

  const failureCounts = new Map<string, { label: string; pages: number; max: number }>();
  for (const result of successful) {
    for (const check of result.checks) {
      if (check.status === "pass" || check.max === 0) continue;
      const existing = failureCounts.get(check.id);
      if (existing) existing.pages += 1;
      else failureCounts.set(check.id, { label: check.label, pages: 1, max: check.max });
    }
  }

  const missingAcrossSite = [...failureCounts.entries()]
    .sort((a, b) => b[1].pages - a[1].pages || b[1].max - a[1].max)
    .slice(0, 5)
    .map(([id, info]) => `${id} — ${info.label} (${info.pages}/${successful.length} pages)`);

  return {
    baseUrl: base,
    sitemapUrl,
    pagesAudited: results.length,
    pagesFailed,
    averageScore,
    weakest,
    missingAcrossSite,
  };
}
