import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractVisualPage, collectVisualCatalog, normalizeVisualImport, visualUrl, visualCatalogRoutes } from "../src/console/visual-catalog.js";
import { closeVisibilityStores, readVisualCatalog, saveVisualCatalog } from "../src/console/ai-visibility-store.js";
import { normalizeImport } from "../src/console/ai-visibility.js";

afterEach(() => { closeVisibilityStores(); vi.unstubAllEnvs(); });
const html = `<title>Atelier catalogue</title><meta property="og:image" content="/cover.jpg"><script type="application/ld+json">${JSON.stringify({ "@graph": [
  { "@type": "Organization", name: "Atelier", logo: { "@type": "ImageObject", url: "/logo.png" } },
  { "@type": "ItemList", itemListElement: [{ "@type": "ListItem", item: { "@type": "Product", name: "Affiche Alpes", url: "/produits/alpes", image: [{ url: "/alpes.jpg" }, "/detail.jpg"], brand: { name: "Atelier" }, sku: "ALP-1", description: "Une affiche", offers: { price: 29, priceCurrency: "EUR", availability: "https://schema.org/InStock" } } }] },
] })}</script><a href="/produits/alpes">Alpes</a><a href="/cart">Panier</a><a href="https://other.example.com/">Other</a>`;

it("extracts nested product and page images with their source, without inventing visibility", () => {
  const result = extractVisualPage(html, "https://atelier.example.com/", "2026-11-13T00:00:00Z");
  expect(result.profile.logoUrl).toBe("https://atelier.example.com/logo.png");
  expect(result.items[0]).toMatchObject({ kind: "product", imageUrl: "https://atelier.example.com/alpes.jpg", price: "29", currency: "EUR", sku: "ALP-1", availability: "InStock", source: "JSON-LD Product" });
  expect(result.items[0].images).toHaveLength(2);
  expect(result.items[1]).toMatchObject({ kind: "page", imageUrl: "https://atelier.example.com/cover.jpg" });
  expect(result.items[0]).not.toHaveProperty("visibility");
  expect(result.links).toEqual(["https://atelier.example.com/produits/alpes"]);
});

it("bounds discovery, deduplicates products, and retains partial failures", async () => {
  const fetcher = vi.fn(async (url: string) => ({ url, ok: url.endsWith("/"), status: url.endsWith("/") ? 200 : 403, headers: {}, body: html }));
  const result = await collectVisualCatalog("https://atelier.example.com/", fetcher);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.pagesRead).toBe(1); expect(result.warnings).toEqual([{ url: "https://atelier.example.com/produits/alpes", reason: "HTTP 403" }]);
  expect(result.items).toHaveLength(2);
  const many = html + Array.from({ length: 20 }, (_, i) => `<a href="/products/${i}">${i}</a>`).join("");
  fetcher.mockImplementation(async url => ({ url, ok: true, status: 200, headers: {}, body: many }));
  fetcher.mockClear(); await collectVisualCatalog("https://atelier.example.com/", fetcher); expect(fetcher).toHaveBeenCalledTimes(6);
});

it("rejects active content, credentials, local addresses and foreign catalogue pages", () => {
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,x", "https://user:pass@example.com/x", "http://example.com/x", "https://127.0.0.1/x", "https://[::1]/x", "https://foo.local/x"]) expect(visualUrl(url)).toBeNull();
  expect(visualUrl("/x.jpg", "https://example.com/")).toBe("https://example.com/x.jpg");
  expect(() => normalizeVisualImport([{ kind: "product", name: "Bad", url: "https://other.example.com/x" }], "https://example.com/")).toThrow(/selected site/);
  expect(() => normalizeVisualImport([{ kind: "product", name: "Bad", url: "https://example.com/x", imageUrl: "javascript:bad" }], "https://example.com/")).toThrow(/Images/);
  expect(normalizeVisualImport([{ kind: "page", name: "Home", url: "https://example.com/" }], "https://example.com/")[0]).toMatchObject({ id: "https://example.com/", imageUrl: null, kind: "page" });
});

it("keeps imported catalogues separate by customer and origin", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "visual-catalog-")); vi.stubEnv("AI_VISIBILITY_PATH", dir);
  try {
    saveVisualCatalog("alpha", "https://a.example.com", [{ name: "A" }]);
    saveVisualCatalog("alpha", "https://b.example.com", [{ name: "B" }]);
    expect(readVisualCatalog("alpha", "https://a.example.com", [])).toEqual([{ name: "A" }]);
    expect(readVisualCatalog("alpha", "https://b.example.com", [])).toEqual([{ name: "B" }]);
    expect(readVisualCatalog("beta", "https://a.example.com", [])).toEqual([]);
    expect(visualCatalogRoutes.filter(r => /import/.test(r.path)).every(r => r.adminOnly && r.needsUrl !== false)).toBe(true);
  } finally { closeVisibilityStores(); fs.rmSync(dir, { recursive: true, force: true }); }
});

it("preserves explicit brand logos through response import and validates them", () => {
  const input = { brands: [{ name: "Atelier", aliases: [], website: "https://example.com/", logoUrl: "https://cdn.example.com/logo.png" }], responses: [{ prompt: "Qui choisir ?", answer: "Atelier est fiable.", source: "Manual", observedAt: "2026-11-13T00:00:00Z" }] };
  expect(normalizeImport(input).brands[0]).toMatchObject({ logoUrl: input.brands[0].logoUrl });
  expect(() => normalizeImport({ ...input, brands: [{ ...input.brands[0], logoUrl: "file:///secret" }] })).toThrow(/HTTPS/);
});
