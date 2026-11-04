/** Sitemap-only data for the public visual map; it never infers traffic. */
import { belongsToDomain, parseSitemap } from "../geo/sitemap.js";

export interface SitemapMapNode { id: string; parentId: string | null; label: string; url: string; depth: number; priority: number; lastmod: string | null; }
export interface SitemapMap {
  sitemapUrl: string; nodeCount: number; shownNodeCount: number; truncated: boolean;
  metrics: { maxDepth: number; lastmodCoveragePercent: number; oldestLastmod: string | null; newestLastmod: string | null; sections: { label: string; pages: number }[]; };
  nodes: SitemapMapNode[];
}
const MAX_NODES = 150;
const idOf = (url: URL) => `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}${url.search}`;
function parsed(value: string): URL | null { try { const url = new URL(value); url.hash = ""; return url; } catch { return null; } }
function labelFor(url: URL): string {
  if (url.pathname === "/") return "Home";
  const value = url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname;
  try { return decodeURIComponent(value).replace(/[-_]+/g, " "); } catch { return value.replace(/[-_]+/g, " "); }
}
function parentFor(url: URL, ids: Set<string>): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const parent = new URL(url.href); parent.pathname = `/${parts.join("/")}/`; parent.search = "";
    if (ids.has(idOf(parent))) return idOf(parent);
  }
  return null;
}

/** A bounded, path-based model for the SlickMap-style UI. */
export function buildSitemapMap(xml: string | null, sitemapUrl: string | null, host: string): SitemapMap | null {
  if (!xml || !sitemapUrl) return null;
  const entries = parseSitemap(xml)
    .filter((entry) => belongsToDomain(entry.url, host))
    .map((entry) => ({ entry, url: parsed(entry.url) }))
    .filter((row): row is { entry: ReturnType<typeof parseSitemap>[number]; url: URL } => Boolean(row.url));
  if (!entries.length) return null;
  const ids = new Set(entries.map(({ url }) => idOf(url)));
  const nodes = entries.slice(0, MAX_NODES).map(({ entry, url }) => ({
    id: idOf(url), parentId: parentFor(url, ids), label: labelFor(url), url: url.href,
    depth: url.pathname.split("/").filter(Boolean).length, priority: entry.priority, lastmod: entry.lastmod,
  })).sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url));
  const dated = entries.map(({ entry }) => entry.lastmod).filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value)))).sort();
  const sections = new Map<string, number>();
  for (const { url } of entries) {
    const first = url.pathname.split("/").filter(Boolean)[0]; const section = first ? `/${first}/` : "/";
    sections.set(section, (sections.get(section) ?? 0) + 1);
  }
  return {
    sitemapUrl, nodeCount: entries.length, shownNodeCount: nodes.length, truncated: entries.length > nodes.length,
    metrics: {
      maxDepth: Math.max(...entries.map(({ url }) => url.pathname.split("/").filter(Boolean).length)),
      lastmodCoveragePercent: Math.round((dated.length / entries.length) * 100), oldestLastmod: dated[0] ?? null, newestLastmod: dated.at(-1) ?? null,
      sections: [...sections.entries()].map(([label, pages]) => ({ label, pages })).sort((a, b) => b.pages - a.pages || a.label.localeCompare(b.label)).slice(0, 12),
    }, nodes,
  };
}
