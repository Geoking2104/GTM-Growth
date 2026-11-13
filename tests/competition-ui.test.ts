import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
afterEach(() => { vi.unstubAllGlobals(); });
it("renders competition and loads GSC suggestions without a browser session", async () => {
  vi.stubGlobal("location", { search: "" }); vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => {} });
  const { document, window } = parseHTML("<html><body></body></html>");
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true, get() { return [...this.options].find(o => o.selected)?.value || ""; }, set(value) { for (const option of this.options) option.selected = option.value === value; } });
  vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("Node", window.Node);
  const { renderCompetition } = await import("../site/console/competition.js");
  const answer = { id: "r", prompt: "Meilleur logiciel wiki", answer: "Beta", source: "A", observedAt: "2026-01-01T00:00:00Z", citations: [], mentions: [{ brand: "Beta", evidence: "Beta", sentiment: "unknown" }] };
  const api = vi.fn(async (path: string) => path === "/ai-visibility/datasets" ? { datasets: [{ id: "d", createdAt: "2026-01-01", count: 1 }] } : path === "/competition/state" ? { panels: {}, actions: [] } : path === "/competition/alert" ? { state: "not-configured" } : path === "/ai-visibility/report" ? { brands: [{ name: "Alpha", aliases: ["Alpha"] }, { name: "Beta", aliases: ["Beta"] }], sources: ["A"], responses: [answer] } : { rows: [{ query: "logiciel wiki", page: "https://acme.test/wiki", clicks: 1, impressions: 2 }], period: { start: "2026-01-01", end: "2026-01-02" } });
  const root = renderCompetition({ api, me: { role: "tenant-admin" }, property: "sc-domain:acme.test", days: 28 });
  await vi.waitFor(() => expect(root.textContent).toContain("Priorités proposées"));
  expect(api).toHaveBeenCalledWith("/search/query-pages", { property: "sc-domain:acme.test", days: 28 });
  expect(root.textContent).toContain("https://acme.test/wiki");
  expect(root.querySelectorAll(".v-trend")).toHaveLength(2);
});
