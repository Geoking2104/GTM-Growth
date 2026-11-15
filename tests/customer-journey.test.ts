import { describe, expect, it, vi } from "vitest";
import { HtmlDoc } from "../src/geo/html.js";
import { extractJourneyContext } from "../src/freeread/journey-context.js";
import { extractOnboardingProfile } from "../src/console/onboarding-profile.js";
import { readJourneyPage } from "../src/console/journey.js";
import { buildJourneyPreview } from "../site/console/customer-journey-model.js";
import type { Tenant } from "../src/tenants/store.js";

const url = "https://www.corthay.test/";
const html = `<title>Corthay</title><h1>Bel Air</h1><meta name="description" content="Maison de souliers">
<article itemscope itemtype="https://schema.org/Product"><h3 itemprop="name"><a href="/fr/souliers/arca.html">Arca</a></h3><p class="product-color-variant">CUIR DE VEAU - NOIR</p></article>
<a href="/size-guide">Guide des Tailles</a><a href="/returns">Retours et Échanges</a>`;
const context = extractJourneyContext(HtmlDoc.parse(html), url);
const input = { url, finalUrl: url, journeyContext: context, contextConfirmed: true, productId: context.products[0].id, category: "souliers en cuir", audience: "particuliers", goal: "une tenue de mariage", language: "fr" };
const texts = (i = input) => buildJourneyPreview(i).stages.flatMap(s => s.prompts.map(p => p.text));
describe("grounded buyer journey", () => {
  it("reads product microdata and never promotes the featured H1 to a product", () => {
    expect(context.brand).toBe("Corthay"); expect(context.brandSource).toBe("title:candidate");
    expect(context.products).toHaveLength(1); expect(context.products[0].name).toBe("Arca");
    expect(context.products[0].attributes.variant).toBe("CUIR DE VEAU - NOIR");
    expect(context.links.map(l => l.kind)).toEqual(["size", "returns"]);
    expect(texts().join(" ")).not.toMatch(/Bel Air|mon activité|my business|solution pour/);
    expect(texts().join(" ")).toContain("Corthay — Arca");
  });
  it("distinguishes brand organizations from products even if the product is first", () => {
    const doc = HtmlDoc.parse(`<script type="application/ld+json">${JSON.stringify([{ "@type": "Product", name: "Bel Air" }, { "@type": "Organization", name: "Corthay" }])}</script>`);
    expect(extractOnboardingProfile(doc, url, 200).siteName).toBe("Corthay");
    expect(extractJourneyContext(doc, url).brand).toBe("Corthay");
  });
  it("cannot infer a brand from Product-only schema", () => {
    const doc = HtmlDoc.parse('<script type="application/ld+json">{"@type":"Product","name":"Bel Air"}</script>');
    expect(extractOnboardingProfile(doc, url, 200).siteName).toBeNull(); expect(extractJourneyContext(doc, url).brand).toBe("");
  });
  it("reads nested catalogs and restricts product URLs to the source site", () => {
    const doc = HtmlDoc.parse(`<script type="application/ld+json">${JSON.stringify({ "@type": "ItemList", itemListElement: [{ "@type": "Product", name: "Bag", material: "leather", url: "/bag" }, { "@type": "Product", name: "Foreign", url: "https://foreign.test/" }] })}</script>`);
    const result = extractJourneyContext(doc, url); expect(result.products.map(p => p.name)).toEqual(["Bag"]); expect(result.products[0].attributes.material).toBe("leather");
  });
  it("stable product IDs survive reordering and change when product facts change", () => {
    const one = extractJourneyContext(HtmlDoc.parse(html), url).products[0];
    const two = extractJourneyContext(HtmlDoc.parse('<article itemtype="https://schema.org/Product"><h3 itemprop="name">Other</h3></article>' + html), url).products.find(p => p.name === "Arca")!;
    expect(one.id).toBe(two.id);
    expect(extractJourneyContext(HtmlDoc.parse(html.replace("NOIR", "BLEU")), url).products[0].id).not.toBe(one.id);
  });
  it.each(["contextConfirmed", "productId", "category", "audience", "goal"])("generates nothing without %s", key => {
    expect(texts({ ...input, [key]: key === "contextConfirmed" ? false : "" })).toEqual([]);
  });
  it("generates nothing from page headings or a bare hostname", () => {
    expect(buildJourneyPreview({ url, pageSignals: { h1: ["Bel Air"] } }).stages.flatMap(s => s.prompts)).toEqual([]);
    expect(texts({ ...input, finalUrl: "https://another.test/" })).toEqual([]);
  });
  it("never fills a missing comparison or decision stage", () => {
    const result = buildJourneyPreview({ ...input, journeyContext: { ...context, links: [] } });
    expect(result.stages[2].prompts).toEqual([]); expect(result.stages[4].prompts).toEqual([]);
  });
  it("requires a real selected competitor product and explicit comparability", () => {
    const other = extractJourneyContext(HtmlDoc.parse(html.replaceAll("Corthay", "Other").replaceAll("Arca", "Derby")), "https://other.test/");
    const choice = { context: other, productId: other.products[0].id, comparable: true };
    const result = buildJourneyPreview({ ...input, competitors: [choice] });
    expect(result.stages[2].prompts[0].text).toContain("Other — Derby");
    expect(result.stages[2].prompts[0].evidence).toHaveLength(2);
    for (const invalid of [{ ...choice, comparable: false }, { ...choice, productId: "invented" }, { ...choice, context }]) expect(buildJourneyPreview({ ...input, competitors: [invalid] }).stages[2].prompts).toEqual([]);
  });
  it("keeps every output a sourced hypothesis and uses the requested language", () => {
    const result = buildJourneyPreview({ ...input, language: "en", category: "leather shoes", audience: "wedding guests", goal: "a summer wedding" });
    expect(result.stages[0].prompts[0].text).toContain("For wedding guests");
    for (const p of result.stages.flatMap(s => s.prompts)) { expect(p.sourceKind).toBe("inferred"); expect(p.sourceRef).toBe("gtm-journey-context:2.0.0"); expect(p.evidence[0].url).toBe(url); }
  });
});
describe("tenant-bound journey reading", () => {
  const tenant = { id: "acme", status: "active", domains: ["corthay.test"] } as Tenant;
  it("refuses a foreign primary page before fetching", async () => {
    const fetcher = vi.fn(); await expect(readJourneyPage(tenant, { pageUrl: "https://foreign.test/", competitor: false }, fetcher)).rejects.toThrow("outside"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses redirects outside the workspace and failed reads", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, url: "https://foreign.test/", body: html });
    await expect(readJourneyPage(tenant, { pageUrl: url, competitor: false }, fetcher)).rejects.toThrow("outside");
    fetcher.mockResolvedValue({ ok: false, url, body: html }); await expect(readJourneyPage(tenant, { pageUrl: url, competitor: false }, fetcher)).rejects.toThrow("unavailable");
  });
  it("reads an explicitly selected public rival without customer credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, url: "https://other.test/", body: html });
    const result = await readJourneyPage(tenant, { pageUrl: "https://other.test/", competitor: true }, fetcher);
    expect(result.journeyContext.products[0].name).toBe("Arca"); expect(fetcher).toHaveBeenCalledWith("https://other.test/", { timeoutMs: 12000 });
  });
});
