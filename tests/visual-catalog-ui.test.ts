import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
beforeEach(() => {
  const { document, window } = parseHTML("<html><body></body></html>");
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true, get() { return [...this.options].find(o => o.selected)?.value || ""; }, set(value) { for (const o of this.options) o.selected = o.value === value; } });
  vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("location", { search: "?lang=fr" }); vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: vi.fn() });
});
const item = { id: "p", name: "Affiche des Alpes", kind: "product", url: "https://example.com/alpes", imageUrl: "https://cdn.example.com/alpes.jpg", images: ["https://cdn.example.com/alpes.jpg"], description: "Une affiche", brand: "Atelier", sku: "A1", currency: "EUR", price: "29", availability: "InStock", source: "JSON-LD Product", observedAt: "2026-11-13" };

it("loads a visual catalogue immediately, filters it and switches to an illustrated table", async () => {
  const { renderCatalog } = await import("../site/console/catalog.js");
  const api = vi.fn().mockResolvedValue({ items: [item], pagesRead: 1, pageLimit: 6, warnings: [] });
  const root = renderCatalog({ api, state: { url: "https://example.com/" }, me: { role: "viewer" } }); document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector(".v-product-card h3")?.textContent).toBe(item.name));
  expect(api.mock.calls).toEqual([["/visual/catalog", { url: "https://example.com/" }]]);
  expect(root.querySelector("img")?.getAttribute("src")).toBe(item.imageUrl);
  expect(root.querySelectorAll(".v-gauge")).toHaveLength(4);
  const buttons = () => [...root.querySelectorAll<HTMLButtonElement>("button")];
  buttons().find(b => b.textContent === "Vue tableau")?.click(); expect(root.querySelector(".c-table-wrap img")).toBeTruthy();
  const search = root.querySelector<HTMLInputElement>('input[type="search"]')!; search.value = "absent"; search.dispatchEvent(new window.Event("input"));
  expect(root.textContent).toContain("Aucun élément ne correspond");
  buttons().find(b => b.textContent === "Réinitialiser les filtres")?.click(); expect(root.querySelector(".c-table-wrap img")).toBeTruthy();
  expect(root.querySelector('input[type="file"]')).toBeNull();
});

it("requires preview after every input edit before a catalogue can be saved", async () => {
  const { renderCatalog } = await import("../site/console/catalog.js");
  const api = vi.fn(async (route: string) => route.endsWith("import-preview") ? { items: [item] } : { items: [], pagesRead: 0 });
  const root = renderCatalog({ api, state: { url: "https://example.com/" }, me: { role: "tenant-admin" } }); document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector("textarea")).toBeTruthy());
  const input = root.querySelector("textarea")!, save = [...root.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Enregistrer ce catalogue")!;
  expect(save.disabled).toBe(true); input.value = JSON.stringify([item]);
  [...root.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Prévisualiser l’import")!.click();
  await vi.waitFor(() => expect(save.disabled).toBe(false));
  input.value = "[]"; input.dispatchEvent(new window.Event("input")); expect(save.disabled).toBe(true);
  expect(api.mock.calls.some(([route]) => route === "/visual/import")).toBe(false);
});

it("keeps missing images and missing measurements honest, with accessible chart data", async () => {
  const { thumbnail, gauge, visibilityChart, setVisualEntities, entityCell } = await import("../site/console/visuals.js");
  const brand = entityCell("Atelier", { kind: "brand", url: item.url }); document.body.append(brand);
  setVisualEntities([item], "https://example.com/");
  expect(brand.querySelector("img")).toBeNull();
  expect(entityCell("Atelier", { kind: "brand", url: item.url }).querySelector("img")).toBeNull();
  const bad = thumbnail({ name: "Product", imageUrl: "javascript:alert(1)" }); expect(bad.querySelector("img")).toBeNull();
  const image = thumbnail({ name: "Product", imageUrl: item.imageUrl }); image.querySelector("img")!.dispatchEvent(new window.Event("error")); expect(image.querySelector("img")).toBeNull(); expect(image.title).toContain("indisponible");
  expect(gauge("Unknown", null).textContent).toContain("—");
  const rows = [{ observedAt: "2026-11-01", source: "A", present: true }, { observedAt: "2026-11-02", source: "B", present: false }, { observedAt: "2026-11-03", source: "A", present: true }];
  const chart = visibilityChart(rows, [{ label: "A", filter: (r: {source: string}) => r.source === "A", matches: (r: {present: boolean}) => r.present }], "Presence");
  expect(chart.querySelector("polyline")).toBeNull();
  expect(chart.querySelectorAll("circle")).toHaveLength(2);
  expect(chart.querySelector("details")?.textContent).toContain("—");
});
