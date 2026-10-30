/**
 * Minimal sitemap reader: `<urlset>` and `<sitemapindex>` documents.
 *
 * Only `<loc>` values (and a few optional hints) are needed to build an
 * llms.txt and to sample pages for a site-wide audit.
 */

export interface SitemapEntry {
  url: string;
  priority: number;
  changefreq: string | null;
  lastmod: string | null;
}

const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi;
const URL_BLOCK_RE = /<url>([\s\S]*?)<\/url>/gi;
const SITEMAP_BLOCK_RE = /<sitemap>([\s\S]*?)<\/sitemap>/gi;

function firstTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`, "i").exec(block);
  return match ? decode(match[1].trim()) : null;
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** True when the document is a sitemap index (points at other sitemaps). */
export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/** Sub-sitemap URLs declared by a sitemap index. */
export function parseSitemapIndex(xml: string): string[] {
  const out: string[] = [];
  let block: RegExpExecArray | null;
  SITEMAP_BLOCK_RE.lastIndex = 0;
  while ((block = SITEMAP_BLOCK_RE.exec(xml))) {
    const loc = firstTag(block[1], "loc");
    if (loc) out.push(loc);
  }
  if (!out.length) {
    let match: RegExpExecArray | null;
    LOC_RE.lastIndex = 0;
    while ((match = LOC_RE.exec(xml))) out.push(decode(match[1].trim()));
  }
  return out;
}

/** Page entries declared by a `<urlset>` document. */
export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  let block: RegExpExecArray | null;
  URL_BLOCK_RE.lastIndex = 0;
  while ((block = URL_BLOCK_RE.exec(xml))) {
    const body = block[1];
    const loc = firstTag(body, "loc");
    if (!loc) continue;
    const priority = Number.parseFloat(firstTag(body, "priority") ?? "");
    entries.push({
      url: loc,
      priority: Number.isFinite(priority) ? priority : 0.5,
      changefreq: firstTag(body, "changefreq"),
      lastmod: firstTag(body, "lastmod"),
    });
  }

  if (!entries.length) {
    let match: RegExpExecArray | null;
    LOC_RE.lastIndex = 0;
    while ((match = LOC_RE.exec(xml))) {
      const url = decode(match[1].trim());
      if (url) entries.push({ url, priority: 0.5, changefreq: null, lastmod: null });
    }
  }

  return entries;
}

/** Same registrable host, scheme-agnostic enough for sitemap filtering. */
export function belongsToDomain(url: string, host: string): boolean {
  try {
    const target = new URL(url);
    const base = host.replace(/^www\./, "").toLowerCase();
    const candidate = target.hostname.replace(/^www\./, "").toLowerCase();
    return candidate === base || candidate.endsWith(`.${base}`);
  } catch {
    return false;
  }
}
