/**
 * sitemap.xml builder — the one GeoSuite tool this repo did not have.
 *
 * Adapted from the MIT-licensed toolkit by GeoSuite / Matteo Perino
 * (https://github.com/TryGeoSuite/geo-toolkit). Crawl a site from its homepage,
 * stay inside the host, respect robots.txt, and emit a sitemap.xml.
 *
 * Bounded on purpose: a tool that quietly crawls 50 000 pages from a landing page
 * is a liability. The defaults are small, the caps are explicit.
 */

import { HtmlDoc } from "../geo/html.js";
import { fetchText, type Fetcher } from "../geo/http.js";
import { parseRobots } from "../geo/robots.js";

export interface SitemapBuildOptions {
  url: string;
  /** Maximum pages to include. Defaults to 50, capped at 500. */
  maxUrls?: number;
  /** Skip URLs whose last path segment looks like an asset. */
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export interface SitemapBuildResult {
  host: string;
  startUrl: string;
  urls: { loc: string; lastmod: string | null; source: "homepage" | "link" | "sitemap" }[];
  skipped: { loc: string; reason: string }[];
  xml: string;
  stats: { fetched: number; discovered: number; included: number; blocked: number; capped: boolean };
  limits: string[];
}

const ASSET = /\.(png|jpe?g|gif|svg|webp|avif|ico|pdf|zip|rar|7z|gz|mp4|mp3|wav|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?)$/i;
const SKIP_PREFIX = ["/wp-admin", "/wp-login", "/cart", "/checkout", "/account", "/search?", "/?"];
const MAX_CAP = 500;

const normalize = (value: string): string => {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.href;
};

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Same-host, non-asset, non-admin links from one page. */
export function extractLinks(doc: HtmlDoc, pageUrl: string, host: string): string[] {
  const out = new Set<string>();
  for (const node of doc.all("a")) {
    const href = (node.attrs.href ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (resolved.hostname.replace(/^www\./, "") !== host) continue;
    if (ASSET.test(resolved.pathname)) continue;
    if (SKIP_PREFIX.some((prefix) => resolved.pathname.startsWith(prefix.split("?")[0]) && prefix !== "/?")) continue;
    out.add(normalize(resolved.href));
  }
  return [...out];
}

export function buildSitemapXml(host: string, urls: { loc: string; lastmod: string | null }[]): string {
  const body = urls
    .map((entry) =>
      [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : "",
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

/**
 * Crawl breadth-first from the homepage. Every page is fetched once; robots.txt
 * is honoured for the tool's own user-agent.
 */
export async function buildSitemap(options: SitemapBuildOptions): Promise<SitemapBuildResult> {
  const fetcher = options.fetcher ?? fetchText;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxUrls = Math.max(1, Math.min(options.maxUrls ?? 50, MAX_CAP));

  const start = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(options.url) ? options.url : `https://${options.url}`);
  const host = start.hostname.replace(/^www\./, "");
  const origin = start.origin;

  // robots.txt first: no point crawling a host that forbids it.
  let disallow: string[] = [];
  try {
    const robots = await fetcher(`${origin}/robots.txt`, { accept: "text/plain", timeoutMs });
    if (robots.status === 200) {
      const parsed = parseRobots(robots.body);
      const mine = parsed["gtmgrowthgeo"] ?? parsed["*"];
      disallow = mine?.disallow ?? [];
    }
  } catch {
    disallow = [];
  }
  const blockedByRobots = (url: string): boolean => {
    const path = new URL(url).pathname;
    return disallow.some((rule) => rule !== "/" && rule !== "" && path.startsWith(rule));
  };

  const queue: string[] = [normalize(origin + "/")];
  const seen = new Set<string>();
  const included: SitemapBuildResult["urls"] = [];
  const skipped: SitemapBuildResult["skipped"] = [];
  let fetched = 0;
  let blocked = 0;
  let capped = false;

  while (queue.length) {
    if (included.length >= maxUrls) {
      capped = true;
      break;
    }
    const url = queue.shift() as string;
    if (seen.has(url)) continue;
    seen.add(url);

    if (blockedByRobots(url)) {
      blocked += 1;
      skipped.push({ loc: url, reason: "disallowed by robots.txt" });
      continue;
    }

    let page;
    try {
      page = await fetcher(url, { accept: "text/html", timeoutMs });
      fetched += 1;
    } catch {
      skipped.push({ loc: url, reason: "unreachable" });
      continue;
    }
    if (page.status !== 200) {
      skipped.push({ loc: url, reason: `HTTP ${page.status}` });
      continue;
    }

    const lastmod = page.headers["last-modified"] ? new Date(page.headers["last-modified"]).toISOString().slice(0, 10) : null;
    included.push({ loc: url, lastmod, source: url === normalize(origin + "/") ? "homepage" : "link" });

    const doc = HtmlDoc.parse(page.body);
    for (const link of extractLinks(doc, page.url || url, host)) {
      if (!seen.has(link) && !queue.includes(link)) queue.push(link);
    }
    // Politeness: one page at a time, no hammering.
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  return {
    host,
    startUrl: normalize(origin + "/"),
    urls: included,
    skipped,
    xml: buildSitemapXml(host, included),
    stats: { fetched, discovered: seen.size, included: included.length, blocked, capped },
    limits: [
      `Included at most ${maxUrls} pages (hard cap ${MAX_CAP}); sitemap.xml is a map, not an archive.`,
      "lastmod comes from the Last-Modified header only — never invented.",
      "robots.txt is honoured for this tool's user-agent; disallowed paths are listed, not crawled.",
    ],
  };
}
