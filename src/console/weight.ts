/**
 * Page weight, measured in-house: fetch the HTML, list the resources it
 * references (scripts, stylesheets, images, fonts preloads) and read their size
 * with HEAD (Content-Length), falling back to a capped GET.
 */

import { HtmlDoc } from "../geo/html.js";

export interface WeightResource { url: string; type: "html" | "script" | "style" | "image" | "font" | "other"; bytes: number | null; }
export interface PageWeightResult {
  url: string;
  totalBytes: number;
  byType: Record<string, { count: number; bytes: number }>;
  resources: WeightResource[];
  unknown: number;
  capped: boolean;
}

export type SizeProbe = (url: string) => Promise<number | null>;

const defaultProbe: SizeProbe = async (url) => {
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(6000) });
    const len = Number(head.headers.get("content-length"));
    if (head.ok && Number.isFinite(len) && len > 0) return len;
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.arrayBuffer()).byteLength;
  } catch {
    return null;
  }
};

export function listResources(html: string, pageUrl: string): Omit<WeightResource, "bytes">[] {
  const doc = HtmlDoc.parse(html);
  const out = new Map<string, WeightResource["type"]>();
  const add = (raw: string | undefined, type: WeightResource["type"]) => {
    if (!raw || raw.startsWith("data:")) return;
    try {
      const url = new URL(raw, pageUrl);
      if (url.protocol === "http:" || url.protocol === "https:") out.set(url.href, type);
    } catch { /* ignore */ }
  };
  for (const node of doc.all("script")) add(node.attrs.src, "script");
  for (const node of doc.all("img")) add(node.attrs.src, "image");
  for (const node of doc.all("link")) {
    const rel = (node.attrs.rel ?? "").toLowerCase();
    if (rel.includes("stylesheet")) add(node.attrs.href, "style");
    else if (rel.includes("preload") && node.attrs.as === "font") add(node.attrs.href, "font");
    else if (rel.includes("icon")) add(node.attrs.href, "image");
  }
  return [...out].map(([url, type]) => ({ url, type }));
}

export async function measurePageWeight(url: string, options: { maxResources?: number; probe?: SizeProbe; fetchHtml?: (u: string) => Promise<{ body: string; url: string }> } = {}): Promise<PageWeightResult> {
  const probe = options.probe ?? defaultProbe;
  const fetchHtml = options.fetchHtml ?? (async (u: string) => {
    const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(12000) });
    return { body: await res.text(), url: res.url || u };
  });
  const page = await fetchHtml(url);
  const all = listResources(page.body, page.url);
  const max = options.maxResources ?? 60;
  const picked = all.slice(0, max);
  const sized = await Promise.all(picked.map(async (r) => ({ ...r, bytes: await probe(r.url) })));
  const resources: WeightResource[] = [{ url: page.url, type: "html", bytes: Buffer.byteLength(page.body) }, ...sized];
  const byType: PageWeightResult["byType"] = {};
  let total = 0;
  for (const r of resources) {
    const bucket = (byType[r.type] ??= { count: 0, bytes: 0 });
    bucket.count += 1;
    bucket.bytes += r.bytes ?? 0;
    total += r.bytes ?? 0;
  }
  return { url: page.url, totalBytes: total, byType, resources, unknown: resources.filter((r) => r.bytes === null).length, capped: all.length > max };
}
