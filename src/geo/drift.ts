/**
 * llms.txt drift check.
 *
 * Compares the deployed /llms.txt against the current sitemap: links that no
 * longer exist (stale) and sitemap pages that were never added (missing).
 * No per-link HTTP request — the same trade-off the source model makes, so it
 * is cheap enough to gate a deploy.
 */

import { fetchQuiet, fetchText } from "./http.js";
import type { Fetcher } from "./http.js";
import { collectSitemapEntries } from "./site.js";

export interface LlmsDriftOptions {
  url: string;
  sitemapUrl?: string;
  /** Sitemap pages to compare against, strongest priority first. Default 50. */
  maxUrls?: number;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export interface LlmsDriftResult {
  baseUrl: string;
  llmsUrl: string;
  llmsFound: boolean;
  sitemapUrl: string;
  /** Entries collected from the sitemap (may span several sub-sitemaps). */
  sitemapEntries: number;
  sitemapUrls: number;
  llmsLinks: number;
  /** Sitemap pages (within maxUrls) not linked from llms.txt. */
  missingFromLlms: string[];
  /** Same-host llms.txt links that are not in the sitemap. */
  staleInLlms: string[];
  /** Share of llms.txt links that exist in the collected sitemap, 0–100. */
  coverage: number;
  /** True when nothing in llms.txt is stale — the CI-gateable signal. */
  inSync: boolean;
}

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

function normalize(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Same-host http(s) links from llms.txt, resolved and de-duplicated. */
export function extractLlmsLinks(body: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(LINK_RE)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:")) continue;
    try {
      const resolved = new URL(raw, baseUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      if (hostOf(resolved.toString()) !== hostOf(baseUrl)) continue;
      seen.add(normalize(resolved.toString()));
    } catch {
      continue;
    }
  }
  return [...seen];
}

/** Pure comparison, exported for fixtures. */
export function compareLlmsToSitemap(
  llmsLinks: string[],
  sitemapUrls: string[]
): { missingFromLlms: string[]; staleInLlms: string[] } {
  const llmsSet = new Set(llmsLinks.map(normalize));
  const sitemapSet = new Set(sitemapUrls.map(normalize));

  return {
    missingFromLlms: sitemapUrls.filter((url) => !llmsSet.has(normalize(url))).map(normalize),
    staleInLlms: llmsLinks.filter((url) => !sitemapSet.has(normalize(url))).map(normalize),
  };
}

export async function checkLlmsDrift(options: LlmsDriftOptions): Promise<LlmsDriftResult> {
  const fetcher = options.fetcher ?? fetchText;
  const baseUrl = new URL(/^https?:\/\//i.test(options.url) ? options.url : `https://${options.url}`);
  const llmsUrl = new URL("/llms.txt", baseUrl.origin).toString();

  const [llmsResponse, sitemap] = await Promise.all([
    fetchQuiet(fetcher, llmsUrl, { timeoutMs: options.timeoutMs, accept: "text/plain,*/*" }),
    collectSitemapEntries({
      url: baseUrl.origin,
      sitemapUrl: options.sitemapUrl,
      fetcher,
      timeoutMs: options.timeoutMs,
      maxSitemaps: 20,
    }),
  ]);

  const llmsFound = llmsResponse?.status === 200 && (llmsResponse.body ?? "").trim().length > 0;
  const llmsLinks = llmsFound ? extractLlmsLinks(llmsResponse?.body ?? "", baseUrl.origin) : [];

  const maxUrls = Math.min(Math.max(options.maxUrls ?? 50, 1), 500);
  const sampled = [...sitemap.entries]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxUrls)
    .map((entry) => entry.url);

  // Staleness is checked against the whole sitemap; coverage against the sample.
  const allSitemapUrls = new Set(sitemap.entries.map((entry) => normalize(entry.url)));
  const llmsSet = new Set(llmsLinks.map(normalize));
  const missingFromLlms = sampled.filter((url) => !llmsSet.has(normalize(url)));
  const staleInLlms = llmsLinks.filter((url) => !allSitemapUrls.has(normalize(url)));
  const coverage = llmsLinks.length
    ? Math.round(((llmsLinks.length - staleInLlms.length) / llmsLinks.length) * 100)
    : 0;

  return {
    baseUrl: baseUrl.origin,
    llmsUrl,
    llmsFound,
    sitemapUrl: sitemap.sitemapUrl,
    sitemapEntries: sitemap.entries.length,
    sitemapUrls: sampled.length,
    llmsLinks: llmsLinks.length,
    missingFromLlms: missingFromLlms.slice(0, 25),
    staleInLlms: staleInLlms.slice(0, 25),
    coverage,
    inSync: llmsFound && staleInLlms.length === 0,
  };
}
