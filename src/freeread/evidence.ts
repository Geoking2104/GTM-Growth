/** Bounded observations from the requests already made by the free read. */
import { HtmlDoc } from "../geo/html.js";
import type { FetchResult } from "../geo/http.js";

export function hasNoindex(doc: HtmlDoc, headers: Record<string, string>) {
  const values = [headers["x-robots-tag"] || "", ...doc.all("meta")
    .filter(node => ["robots", "googlebot"].includes((node.attrs.name || "").toLowerCase()))
    .map(node => node.attrs.content || "")];
  return values.some(value => /\b(noindex|none)\b/i.test(value));
}

export function sitemapEvidence(body: string) {
  const source = body.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*<\?xml[^>]*>\s*/i, "").trim();
  const root = /^<(urlset|sitemapindex)\b/i.exec(source)?.[1]?.toLowerCase();
  if (!root) return null;
  const doc = HtmlDoc.parse(source);
  const entries = doc.all(root === "urlset" ? "url" : "sitemap");
  return {
    kind: root as "urlset" | "sitemapindex",
    count: entries.length,
    examples: doc.all("loc").slice(0, 3).map(node => doc.textOf(node).trim().slice(0, 2048)),
  };
}

export function buildFreeReadEvidence(page: FetchResult, doc: HtmlDoc, robots: FetchResult | null, sitemaps: (FetchResult | null)[], candidates: string[]) {
  const observedAt = new Date().toISOString();
  const bounded = (value: string) => ({ value: value.slice(0, 2048), truncated: value.length > 2048 });
  const resource = (requestedUrl: string, response: FetchResult | null) => ({
    requestedUrl, url: response?.url || requestedUrl, status: response?.status ?? null,
  });
  const title = (doc.title() ?? "").trim();
  return {
    version: 1 as const, observedAt,
    page: { url: page.url, status: page.status },
    title: { ...bounded(title), characters: title.length, present: Boolean(doc.first("title")) },
    canonicals: doc.all("link").filter(node => (node.attrs.rel || "").toLowerCase().split(/\s+/).includes("canonical")).slice(0, 20).map(node => bounded(node.attrs.href || "")),
    directives: doc.all("meta").filter(node => ["robots", "googlebot"].includes((node.attrs.name || "").toLowerCase())).slice(0, 20).map(node => ({ agent: node.attrs.name.toLowerCase(), ...bounded(node.attrs.content || "") })),
    xRobotsTag: bounded(page.headers["x-robots-tag"] || ""),
    noindex: hasNoindex(doc, page.headers),
    robots: {
      ...resource(new URL("/robots.txt", page.url).href, robots),
      declarations: robots && robots.status >= 200 && robots.status < 300
        ? [...robots.body.matchAll(/^sitemap:\s*(\S+)/gim)].slice(0, 20).map(match => match[1].slice(0, 2048)) : [],
    },
    sitemaps: candidates.map((url, i) => ({
      ...resource(url, sitemaps[i]),
      document: sitemaps[i] && sitemaps[i]!.status >= 200 && sitemaps[i]!.status < 300 ? sitemapEvidence(sitemaps[i]!.body) : null,
    })),
  };
}

export type FreeReadEvidence = ReturnType<typeof buildFreeReadEvidence>;
