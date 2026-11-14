/** Read product evidence, never infer a business from an H1 or a domain name. */
import { HtmlDoc, type HtmlNode } from "../geo/html.js";
import { auditSchema } from "../geo/audit/schema.js";

export interface JourneyProduct {
  id: string; name: string; url: string; kind: "Product" | "Service";
  category: string; description: string; attributes: Record<string, string>;
  source: "schema" | "microdata"; sourceUrl: string;
}
export interface JourneyContext {
  url: string; readAt: string; brand: string; brandSource: string;
  description: string; products: JourneyProduct[];
  links: Array<{ kind: "size" | "delivery" | "returns" | "care"; label: string; url: string }>;
}
const clean = (v: unknown, max = 180): string => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const types = (o: Record<string, unknown>) => Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]];
function sameSite(raw: unknown, base: string): string {
  try { const u = new URL(String(raw || base), base); const root = new URL(base);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.hostname.replace(/^www\./, "") !== root.hostname.replace(/^www\./, "")) return "";
    u.hash = ""; return u.href;
  } catch { return ""; }
}
function descendants(node: HtmlNode): HtmlNode[] {
  const out: HtmlNode[] = [], stack = [...node.children].reverse();
  while (stack.length && out.length < 4000) { const child = stack.pop()!; out.push(child); stack.push(...[...child.children].reverse()); }
  return out;
}
export function extractJourneyContext(doc: HtmlDoc, url: string): JourneyContext {
  const objects = auditSchema(doc).data.objects;
  const organization = objects.find(o => types(o).some(t => ["Organization", "Brand", "WebSite", "LocalBusiness"].includes(String(t))) && clean(o.name));
  const metaBrand = clean(doc.metaByProperty("og:site_name")?.attrs.content);
  // Short title is only a candidate, shown for explicit confirmation in the UI.
  const shortTitle = clean(doc.title(), 70);
  let brand = clean(organization?.name, 70) || metaBrand || (!/[|–—:]/.test(shortTitle) ? shortTitle : "");
  const products: JourneyProduct[] = [];
  const add = (p: Omit<JourneyProduct, "id">) => {
    if (!p.name || !p.url || products.some(x => x.url === p.url && x.name === p.name) || products.length >= 20) return;
    let hash = 2166136261;
    for (const c of JSON.stringify([p.url, p.name, p.category, p.description, p.attributes])) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    products.push({ ...p, id: "product-" + (hash >>> 0).toString(16) });
  };
  // Product objects can be nested in ItemList/hasOfferCatalog. Traverse bounded JSON only.
  const queue: unknown[] = [...objects]; let visited = 0;
  while (queue.length && visited++ < 500) {
    const value = queue.shift(); if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) { queue.push(...value.slice(0, 50)); continue; }
    const o = value as Record<string, unknown>; queue.push(...Object.values(o).filter(v => v && typeof v === "object"));
    const kind = types(o).includes("Product") ? "Product" : types(o).includes("Service") ? "Service" : null;
    if (!kind) continue;
    const attributes: Record<string, string> = {};
    for (const key of ["material", "color", "size"]) if (clean(o[key])) attributes[key] = clean(o[key]);
    add({ name: clean(o.name, 100), url: sameSite(o.url, url), kind, category: clean(o.category, 100), description: clean(o.description, 500), attributes, source: "schema", sourceUrl: url });
  }
  for (const card of doc.all("article").concat(doc.all("div")).filter(n => /(?:schema\.org\/Product\b)/i.test(n.attrs.itemtype || "")).slice(0, 50)) {
    const nodes = descendants(card); const named = nodes.find(n => n.attrs.itemprop === "name");
    const link = named && descendants(named).find(n => n.tag === "a" && n.attrs.href);
    const property = (key: string) => { const n = nodes.find(n => n.attrs.itemprop === key); return n ? clean(n.attrs.content || doc.textOf(n), 500) : ""; };
    const variant = nodes.find(n => (n.attrs.class || "").split(/\s+/).includes("product-color-variant"));
    const attributes: Record<string, string> = {};
    for (const key of ["material", "color", "size"]) if (property(key)) attributes[key] = property(key);
    if (variant) attributes.variant = clean(doc.textOf(variant));
    add({ name: property("name"), url: sameSite(link?.attrs.href || nodes.find(n => n.attrs.itemprop === "url")?.attrs.content, url), kind: "Product", category: property("category"), description: property("description"), attributes, source: "microdata", sourceUrl: url });
  }
  const links: JourneyContext["links"] = [];
  for (const a of doc.all("a")) {
    const label = clean(doc.textOf(a), 100), href = sameSite(a.attrs.href, url); if (!label || !href) continue;
    const kind = /^(guide des tailles|size guide|sizing guide)$/i.test(label) ? "size" : /^(conditions de livraison|livraison|delivery|shipping)$/i.test(label) ? "delivery" : /^(retours et [ée]changes|retours|returns(?: and exchanges)?)$/i.test(label) ? "returns" : /^(entretien|care|shoe care|product care)$/i.test(label) ? "care" : null;
    if (kind && !links.some(l => l.kind === kind)) links.push({ kind, label, url: href });
  }
  if (!organization && !metaBrand && products.some(p => p.name.toLowerCase() === brand.toLowerCase())) brand = "";
  return { url, readAt: new Date().toISOString(), brand, brandSource: organization ? "schema:organization" : metaBrand ? "meta:og:site_name" : brand ? "title:candidate" : "missing", description: clean(doc.metaByName("description")?.attrs.content, 500), products, links };
}
