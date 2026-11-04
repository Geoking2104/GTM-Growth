/**
 * Small in-house crawler for the technical audit: same-host BFS, manual
 * redirect following (to record chains), per-page checks (canonical, title,
 * meta description, Hn structure, noindex) and broken-link detection.
 */

import { HtmlDoc, type HtmlNode } from "../geo/html.js";
import { USER_AGENT } from "../geo/config.js";

export interface RawResponse { status: number; location: string | null; contentType: string; body: string; }
export type PageFetcher = (url: string, method?: "GET" | "HEAD") => Promise<RawResponse>;
/** Returns true when a URL may be fetched (SSRF guard for off-host links). */
export type UrlGuard = (url: string) => Promise<boolean>;

export interface Issue { severity: "erreur" | "alerte" | "info"; code: string; message: string; }
export interface CrawledPage {
  url: string;
  finalUrl: string;
  status: number;
  redirects: { from: string; to: string; status: number }[];
  depth: number;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  headings: { level: number; text: string }[];
  noindex: boolean;
  internalLinks: number;
  issues: Issue[];
}
export interface BrokenLink { url: string; status: number | null; foundOn: string[]; internal: boolean; }
export interface TechAuditResult {
  startUrl: string;
  pages: CrawledPage[];
  brokenLinks: BrokenLink[];
  redirectChains: { url: string; hops: number; chain: string[] }[];
  summary: { pages: number; errors: number; warnings: number; brokenLinks: number; duplicateTitles: number; duplicateDescriptions: number };
  capped: boolean;
}

export const defaultPageFetcher: PageFetcher = async (url, method = "GET") => {
  const res = await fetch(url, { method, redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.8" }, signal: AbortSignal.timeout(10_000) });
  const contentType = res.headers.get("content-type") ?? "";
  const body = method === "GET" && contentType.includes("html") ? (await res.text()).slice(0, 2_000_000) : "";
  return { status: res.status, location: res.headers.get("location"), contentType, body };
};

const norm = (u: URL): string => { const c = new URL(u.href); c.hash = ""; return c.href; };

function textOf(node: HtmlNode): string {
  if (node.tag === "#text") return node.text;
  return node.children.map(textOf).join("");
}

export function analysePage(html: string, url: string): Omit<CrawledPage, "url" | "finalUrl" | "status" | "redirects" | "depth" | "internalLinks"> & { links: string[] } {
  const doc = HtmlDoc.parse(html);
  const issues: Issue[] = [];
  const title = doc.title()?.trim() || null;
  const metaDescription = doc.metaByName("description")?.attrs.content?.trim() || null;
  const canonicalRaw = doc.linkByRel("canonical")?.attrs.href ?? null;
  let canonical: string | null = null;
  try { canonical = canonicalRaw ? new URL(canonicalRaw, url).href : null; } catch { canonical = null; }
  const robots = (doc.metaByName("robots")?.attrs.content ?? "").toLowerCase();
  const noindex = robots.includes("noindex");
  const headings: { level: number; text: string }[] = [];
  const walk = (n: HtmlNode) => { const m = /^h([1-6])$/.exec(n.tag); if (m) headings.push({ level: Number(m[1]), text: textOf(n).replace(/\s+/g, " ").trim().slice(0, 160) }); n.children.forEach(walk); };
  walk(doc.root);
  const links = doc.all("a").map((a) => a.attrs.href).filter((h): h is string => Boolean(h) && !/^(mailto:|tel:|javascript:|#)/i.test(h as string));

  if (!title) issues.push({ severity: "erreur", code: "title.missing", message: "Balise <title> absente" });
  else if (title.length > 60) issues.push({ severity: "alerte", code: "title.long", message: `Title trop long (${title.length} car., ~60 max)` });
  else if (title.length < 20) issues.push({ severity: "alerte", code: "title.short", message: `Title trop court (${title.length} car.)` });
  if (!metaDescription) issues.push({ severity: "alerte", code: "meta.missing", message: "Meta description absente" });
  else if (metaDescription.length > 160) issues.push({ severity: "alerte", code: "meta.long", message: `Meta description trop longue (${metaDescription.length} car., ~155 max)` });
  else if (metaDescription.length < 70) issues.push({ severity: "info", code: "meta.short", message: `Meta description courte (${metaDescription.length} car.)` });
  if (!canonical) issues.push({ severity: "alerte", code: "canonical.missing", message: "Pas de balise canonical" });
  else if (norm(new URL(canonical)) !== norm(new URL(url))) {
    const cross = new URL(canonical).host !== new URL(url).host;
    issues.push({ severity: cross ? "alerte" : "info", code: cross ? "canonical.cross-host" : "canonical.other", message: `Canonical vers ${canonical}` });
  }
  const h1 = headings.filter((h) => h.level === 1).length;
  if (h1 === 0) issues.push({ severity: "erreur", code: "h1.missing", message: "Aucun H1" });
  if (h1 > 1) issues.push({ severity: "alerte", code: "h1.multiple", message: `${h1} balises H1` });
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) { issues.push({ severity: "info", code: "hn.skip", message: `Saut de niveau H${headings[i - 1].level} → H${headings[i].level} (« ${headings[i].text.slice(0, 40)} »)` }); break; }
  }
  if (noindex) issues.push({ severity: "info", code: "noindex", message: "Page en noindex" });
  return { title, metaDescription, canonical, headings, noindex, issues, links };
}

export interface CrawlOptions { url: string; maxPages?: number; maxExternalChecks?: number; concurrency?: number; fetcher?: PageFetcher; guard?: UrlGuard; }

export async function runTechAudit(options: CrawlOptions): Promise<TechAuditResult> {
  const fetcher = options.fetcher ?? defaultPageFetcher;
  const guard = options.guard ?? (async () => true);
  const maxPages = Math.min(Math.max(options.maxPages ?? 30, 1), 200);
  const start = new URL(options.url);
  const host = start.host;
  const queue: { url: string; depth: number }[] = [{ url: norm(start), depth: 0 }];
  const seen = new Set([norm(start)]);
  const pages: CrawledPage[] = [];
  const linkSources = new Map<string, Set<string>>();
  const statusOf = new Map<string, number | null>();
  const redirectChains: TechAuditResult["redirectChains"] = [];
  let capped = false;

  async function follow(url: string, method: "GET" | "HEAD" = "GET") {
    const redirects: CrawledPage["redirects"] = [];
    let current = url;
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetcher(current, method);
      if (res.status >= 300 && res.status < 400 && res.location) {
        const next = new URL(res.location, current).href;
        redirects.push({ from: current, to: next, status: res.status });
        if (new URL(next).host !== host && !(await guard(next))) return { res, finalUrl: next, redirects };
        current = next;
        continue;
      }
      return { res, finalUrl: current, redirects };
    }
    return { res: { status: 310, location: null, contentType: "", body: "" }, finalUrl: current, redirects };
  }

  async function crawlOne(item: { url: string; depth: number }) {
    try {
      const { res, finalUrl, redirects } = await follow(item.url);
      statusOf.set(item.url, res.status);
      if (redirects.length > 1) redirectChains.push({ url: item.url, hops: redirects.length, chain: [item.url, ...redirects.map((r) => r.to)] });
      const isHtml = res.contentType.includes("html") && res.status === 200;
      const analysed = isHtml ? analysePage(res.body, finalUrl) : null;
      const issues: Issue[] = analysed?.issues ?? [];
      if (res.status >= 400) issues.unshift({ severity: "erreur", code: "http.error", message: `HTTP ${res.status}` });
      if (redirects.length > 1) issues.push({ severity: "alerte", code: "redirect.chain", message: `Chaîne de ${redirects.length} redirections` });
      if (redirects.some((r) => r.status === 302 || r.status === 307)) issues.push({ severity: "info", code: "redirect.temporary", message: "Redirection temporaire (302/307) — préférer 301 si définitive" });
      let internal = 0;
      for (const href of analysed?.links ?? []) {
        let target: URL;
        try { target = new URL(href, finalUrl); } catch { continue; }
        if (target.protocol !== "http:" && target.protocol !== "https:") continue;
        const key = norm(target);
        if (!linkSources.has(key)) linkSources.set(key, new Set());
        linkSources.get(key)!.add(finalUrl);
        if (target.host === host) {
          internal++;
          if (!seen.has(key)) {
            if (seen.size >= maxPages) { capped = true; continue; }
            seen.add(key);
            queue.push({ url: key, depth: item.depth + 1 });
          }
        }
      }
      pages.push({ url: item.url, finalUrl, status: res.status, redirects, depth: item.depth, title: analysed?.title ?? null, metaDescription: analysed?.metaDescription ?? null, canonical: analysed?.canonical ?? null, headings: analysed?.headings ?? [], noindex: analysed?.noindex ?? false, internalLinks: internal, issues });
    } catch (error) {
      statusOf.set(item.url, null);
      pages.push({ url: item.url, finalUrl: item.url, status: 0, redirects: [], depth: item.depth, title: null, metaDescription: null, canonical: null, headings: [], noindex: false, internalLinks: 0, issues: [{ severity: "erreur", code: "fetch.failed", message: (error as Error).message }] });
    }
  }

  const concurrency = Math.min(Math.max(options.concurrency ?? 4, 1), 8);
  while (queue.length) {
    const batch = queue.splice(0, concurrency);
    await Promise.all(batch.map(crawlOne));
  }

  // External links: HEAD-checked (guarded, capped).
  const external = [...linkSources.keys()].filter((u) => new URL(u).host !== host).slice(0, options.maxExternalChecks ?? 40);
  await Promise.all(external.map(async (u) => {
    if (!(await guard(u))) return;
    try {
      let { res } = await follow(u, "HEAD");
      if (res.status === 405 || res.status === 403) ({ res } = await follow(u, "GET"));
      statusOf.set(u, res.status);
    } catch { statusOf.set(u, null); }
  }));

  const brokenLinks: BrokenLink[] = [];
  for (const [u, sources] of linkSources) {
    if (!statusOf.has(u)) continue;
    const status = statusOf.get(u) ?? null;
    if (status === null || status >= 400) brokenLinks.push({ url: u, status, foundOn: [...sources].slice(0, 5), internal: new URL(u).host === host });
  }

  const dup = (key: "title" | "metaDescription") => {
    const counts = new Map<string, CrawledPage[]>();
    for (const p of pages) { const v = p[key]; if (v && p.status === 200) counts.set(v, [...(counts.get(v) ?? []), p]); }
    let n = 0;
    for (const [, list] of counts) if (list.length > 1) { n++; for (const p of list) p.issues.push({ severity: "alerte", code: `${key}.duplicate`, message: `${key === "title" ? "Title" : "Meta description"} dupliqué(e) sur ${list.length} pages` }); }
    return n;
  };
  const duplicateTitles = dup("title");
  const duplicateDescriptions = dup("metaDescription");
  const all = pages.flatMap((p) => p.issues);
  pages.sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url));
  return { startUrl: norm(start), pages, brokenLinks, redirectChains, summary: { pages: pages.length, errors: all.filter((i) => i.severity === "erreur").length, warnings: all.filter((i) => i.severity === "alerte").length, brokenLinks: brokenLinks.length, duplicateTitles, duplicateDescriptions }, capped };
}

// ── SERP snippet preview ──────────────────────────────────────────────────

/** Rough Arial 20px/14px width estimate (px) — Google truncates titles near 600 px, descriptions near 920 px (desktop). */
export function estimatePixels(text: string, fontPx: number): number {
  let units = 0;
  for (const ch of text) {
    if ("iljtf.,;:!|'I ".includes(ch)) units += 0.3;
    else if ("mwMW@".includes(ch)) units += 0.85;
    else if (ch >= "A" && ch <= "Z") units += 0.65;
    else units += 0.52;
  }
  return Math.round(units * fontPx);
}

export function truncateToPixels(text: string, fontPx: number, maxPx: number): { text: string; truncated: boolean } {
  if (estimatePixels(text, fontPx) <= maxPx) return { text, truncated: false };
  let out = "";
  for (const word of text.split(" ")) {
    const next = out ? `${out} ${word}` : word;
    if (estimatePixels(`${next} …`, fontPx) > maxPx) break;
    out = next;
  }
  return { text: `${out} …`, truncated: true };
}

export function serpPreview(input: { url: string; title: string; description: string }) {
  const u = new URL(input.url);
  const breadcrumb = [u.hostname, ...u.pathname.split("/").filter(Boolean)].join(" › ");
  const title = truncateToPixels(input.title, 20, 600);
  const description = truncateToPixels(input.description, 14, 920);
  const warnings: string[] = [];
  if (title.truncated) warnings.push(`Title tronqué (≈${estimatePixels(input.title, 20)} px pour ~600 px affichés)`);
  if (description.truncated) warnings.push(`Description tronquée (≈${estimatePixels(input.description, 14)} px pour ~920 px affichés)`);
  if (!input.description) warnings.push("Pas de meta description : Google choisira un extrait de la page");
  return { breadcrumb, title: title.text, description: description.text, titleChars: input.title.length, descriptionChars: input.description.length, titlePx: estimatePixels(input.title, 20), descriptionPx: estimatePixels(input.description, 14), warnings };
}
