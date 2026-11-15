/** A bounded, read-only catalogue of real public metadata. No AI metrics are inferred. */
import { isIP } from "node:net";
import { HtmlDoc } from "../geo/html.js";
import type { Fetcher } from "../geo/http.js";
import { fetchPublicPage } from "../http/public-fetch.js";
import { readVisualCatalog, saveVisualCatalog } from "./ai-visibility-store.js";
import type { ConsoleRoute } from "./util.js";

type ObjectValue = Record<string, unknown>;
export interface VisualItem {
  id: string; kind: "product" | "page"; name: string; url: string; imageUrl: string | null;
  images: string[]; description: string; brand: string; sku: string; gtin: string; category: string;
  price: string; currency: string; availability: string; source: string; observedAt: string;
}
const text = (v: unknown, max = 500) => typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
const object = (v: unknown): ObjectValue => v && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
export function visualUrl(value: unknown, base?: string): string | null {
  try {
    if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname) || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname) || url.hostname.includes(":")) return null;
    url.hash = ""; return url.href;
  } catch { return null; }
}
function imageUrls(value: unknown, base: string): string[] {
  return [...new Set((Array.isArray(value) ? value : [value]).flatMap(v => {
    const data = object(v); const url = visualUrl(typeof v === "string" ? v : data.contentUrl ?? data.url ?? data["@id"], base);
    return url ? [url] : [];
  }))].slice(0, 8);
}
function jsonObjects(doc: HtmlDoc): ObjectValue[] {
  const out: ObjectValue[] = [];
  const walk = (v: unknown, depth = 0) => {
    if (depth > 10 || out.length >= 500) return;
    if (Array.isArray(v)) { for (const item of v.slice(0, 100)) walk(item, depth + 1); return; }
    if (!v || typeof v !== "object") return;
    out.push(v as ObjectValue); for (const child of Object.values(v)) if (child && typeof child === "object") walk(child, depth + 1);
  };
  for (const script of doc.all("script").filter(s => s.attrs.type?.toLowerCase() === "application/ld+json").slice(0, 20)) {
    try { walk(JSON.parse(doc.textOf(script))); } catch { /* malformed metadata is simply unavailable */ }
  }
  return out;
}
function productItem(data: ObjectValue, pageUrl: string, observedAt: string): VisualItem {
  const images = imageUrls(data.image, pageUrl), offer = object(Array.isArray(data.offers) ? data.offers[0] : data.offers);
  const url = visualUrl(data.url ?? offer.url, pageUrl) ?? pageUrl;
  const name = text(data.name, 200), sku = text(data.sku ?? data.mpn, 100);
  return { id: `${url}|${sku || name}`, kind: "product", name, url, images, imageUrl: images[0] ?? null,
    description: text(data.description, 1500), brand: text(object(data.brand).name ?? data.brand, 100), sku,
    gtin: text(data.gtin ?? data.gtin13 ?? data.gtin14 ?? data.gtin12 ?? data.gtin8, 100), category: text(data.category, 200),
    price: text(offer.price ?? offer.lowPrice, 40), currency: text(offer.priceCurrency, 8), availability: text(offer.availability, 150).split("/").at(-1) ?? "",
    source: "JSON-LD Product", observedAt };
}
export function extractVisualPage(html: string, url: string, observedAt = new Date().toISOString()) {
  const doc = HtmlDoc.parse(html), objects = jsonObjects(doc);
  const hasType = (o: ObjectValue, type: string) => (Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]]).includes(type);
  const organization = objects.find(o => hasType(o, "Organization") || hasType(o, "LocalBusiness")) ?? {};
  const ogImage = doc.metaByProperty("og:image")?.attrs.content ?? doc.metaByName("twitter:image")?.attrs.content;
  const imageUrl = imageUrls(ogImage, url)[0] ?? null;
  const logoUrl = imageUrls(organization.logo, url)[0] ?? imageUrls(doc.all("link").find(n => /(?:^|\s)icon(?:\s|$)/.test(n.attrs.rel ?? ""))?.attrs.href, url)[0] ?? null;
  const name = text(organization.name ?? doc.metaByProperty("og:site_name")?.attrs.content, 200) || new URL(url).hostname;
  const products = objects.filter(o => hasType(o, "Product") && text(o.name)).map(o => productItem(o, url, observedAt));
  const page: VisualItem = { id: url, kind: "page", url, name: doc.title() || name, imageUrl, images: imageUrl ? [imageUrl] : [], description: text(doc.metaByName("description")?.attrs.content ?? doc.metaByProperty("og:description")?.attrs.content, 1500), brand: name, sku: "", gtin: "", category: "", price: "", currency: "", availability: "", source: imageUrl ? "Open Graph / Twitter" : "HTML", observedAt };
  const origin = new URL(url).origin;
  const links = [...new Set([...objects.map(o => o.url), ...doc.all("a").map(a => a.attrs.href)].flatMap(v => {
    const candidate = visualUrl(v, url);
    return candidate && new URL(candidate).origin === origin && candidate !== url && !/\.(?:pdf|zip|png|jpg|jpeg|webp|svg|xml)(?:\?|$)/i.test(candidate) && !/\/(?:login|logout|cart|checkout|account|wp-admin)(?:\/|\?|$)/i.test(candidate) ? [candidate] : [];
  }))].sort((a, b) => Number(/product|produit|shop|boutique/i.test(b)) - Number(/product|produit|shop|boutique/i.test(a)));
  return { profile: { name, url, logoUrl, imageUrl, description: page.description }, items: [...products, page], links };
}
export async function collectVisualCatalog(url: string, fetcher: Fetcher = fetchPublicPage) {
  const observedAt = new Date().toISOString(), first = await fetcher(url, { timeoutMs: 8000 });
  if (!first.ok) throw new Error(`HTTP ${first.status}`);
  if (new URL(first.url).hostname.replace(/^www\./, "") !== new URL(url).hostname.replace(/^www\./, "")) throw new Error("The site redirects to a different domain");
  const initial = extractVisualPage(first.body, first.url, observedAt), items = [...initial.items], warnings: Array<{ url: string; reason: string }> = [];
  const links = initial.links.slice(0, 5);
  const pages = await Promise.allSettled(links.map(async link => {
    const response = await fetcher(link, { timeoutMs: 8000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (new URL(response.url).origin !== new URL(first.url).origin) throw new Error("Redirect outside the selected site");
    return extractVisualPage(response.body, response.url, observedAt).items;
  }));
  pages.forEach((result, i) => result.status === "fulfilled" ? items.push(...result.value) : warnings.push({ url: links[i], reason: String(result.reason?.message ?? "Unavailable") }));
  const unique = new Map(items.filter(i => new URL(i.url).origin === new URL(first.url).origin).map(i => [i.id, i]));
  return { profile: initial.profile, items: [...unique.values()].slice(0, 200), observedAt, pagesRead: 1 + pages.filter(p => p.status === "fulfilled").length, pageLimit: 6, warnings, scope: "bounded-public-sample" };
}
export function normalizeVisualImport(input: unknown, siteUrl: string): VisualItem[] {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new Error("Provide 1–200 products or pages");
  const origin = new URL(siteUrl).origin, observedAt = new Date().toISOString(), seen = new Set<string>();
  return input.map(raw => {
    const v = object(raw), url = visualUrl(v.url), name = text(v.name, 200);
    if (!url || new URL(url).origin !== origin || !name || !["product", "page"].includes(String(v.kind))) throw new Error("Each item needs a name, kind (product/page) and HTTPS URL on the selected site");
    const images = imageUrls(v.images ?? v.imageUrl, url);
    if ((v.imageUrl || v.images) && !images.length) throw new Error("Images require public HTTPS URLs");
    const item = productItem({ ...v, image: images, offers: { price: v.price, priceCurrency: v.currency, availability: v.availability } }, url, observedAt);
    item.kind = v.kind as VisualItem["kind"]; if (item.kind === "page") item.id = url; item.source = "Manual import";
    if (seen.has(item.id)) throw new Error("Duplicate catalogue item"); seen.add(item.id); return item;
  });
}
const tenantId = (ctx: Parameters<ConsoleRoute["handler"]>[0]) => { if (!ctx.tenancy?.tenant) throw new Error("Select a tenant"); return ctx.tenancy.tenant.id; };
export const visualCatalogRoutes: ConsoleRoute[] = [
  { path: "/visual/catalog", handler: async ctx => {
    const saved = readVisualCatalog<VisualItem[]>(tenantId(ctx), new URL(ctx.url).origin, []);
    try { const result = await collectVisualCatalog(ctx.url); const merged = new Map(result.items.map(i => [i.id, i])); for (const item of saved) merged.set(item.id, item); return { ...result, items: [...merged.values()], imported: saved.length }; }
    catch (error) { if (!saved.length) throw error; return { items: saved, imported: saved.length, pagesRead: 0, pageLimit: 6, warnings: [{ url: ctx.url, reason: (error as Error).message }], profile: null, scope: "import-only" }; }
  } },
  { path: "/visual/import-preview", adminOnly: true, handler: async ctx => ({ items: normalizeVisualImport(ctx.body.items, ctx.url) }) },
  { path: "/visual/import", adminOnly: true, handler: async ctx => {
    const items = normalizeVisualImport(ctx.body.items, ctx.url), id = tenantId(ctx), origin = new URL(ctx.url).origin;
    saveVisualCatalog(id, origin, items); return { imported: items.length };
  } },
];
