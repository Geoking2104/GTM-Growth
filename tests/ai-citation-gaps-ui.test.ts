import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function dom(lang = "en") {
  const { document, window } = parseHTML("<html><body></body></html>");
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true, get() { return [...this.options].find(o => o.selected)?.value || ""; }, set(v) { for (const o of this.options) o.removeAttribute("selected"); [...this.options].find(o => o.value === v)?.setAttribute("selected", ""); } });
  window.open = vi.fn(); vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("location", { search: `?lang=${lang}` }); vi.stubGlobal("localStorage", { getItem: () => lang, setItem: vi.fn() });
  return { document, window };
}
const answer = { id: "r1", prompt: "Best CRM?", answer: "Alpha helps teams.", source: "ChatGPT", observedAt: "2026-01-01T00:00:00Z", citations: ["https://www.reddit.com/r/crm/"], mentions: [{ brand: "Alpha", evidence: "Alpha helps teams.", sentiment: "neutral" }] };
const report = { brand: "Alpha", count: 1, total: 1, presenceDenominator: 1, visibility: 100, shareOfVoice: 100, brands: [{ name: "Alpha", aliases: ["Alpha"], website: "https://alpha.example/" }], sources: ["ChatGPT"], responses: [answer], counts: [{ brand: "Alpha", count: 1 }], sentiment: { positive: 0, neutral: 1, negative: 0, mixed: 0, unknown: 0 }, trend: [{ date: "2026-01-01", count: 1, total: 1 }] };
const views = { panel: "d1", createdAt: "2026-01-01", brand: "Alpha", source: null, totalResponses: 1, totalMentions: 1, engines: [], overall: { responses: 1, mentions: 1, brands: [] }, note: "panel only" };
const gaps = {
  panel: "d1", createdAt: "2026-01-01", brand: "Alpha", source: null,
  ownWebsite: "https://alpha.example/", evaluated: true,
  note: "Gaps are computed from this panel's stored citation URLs only; they are not engine market share or all consumer sessions.",
  totals: { observations: 2, withCitations: 2, citations: 3, promptsMentioningBrand: 2, promptsMentioningBrandWithOwnCitation: 0 },
  categories: [
    { category: "own", citations: 0, citedPrompts: 0, shareOfCitations: 0 },
    { category: "competitor", citations: 0, citedPrompts: 0, shareOfCitations: 0 },
    { category: "reddit", citations: 2, citedPrompts: 1, shareOfCitations: 66.7 },
    { category: "youtube", citations: 0, citedPrompts: 0, shareOfCitations: 0 },
    { category: "linkedin", citations: 0, citedPrompts: 0, shareOfCitations: 0 },
    { category: "wikipedia", citations: 0, citedPrompts: 0, shareOfCitations: 0 },
    { category: "web", citations: 1, citedPrompts: 1, shareOfCitations: 33.3 },
  ],
  topHosts: [{ host: "reddit.com", category: "reddit", citations: 2, example: "https://www.reddit.com/r/crm/" }],
  gaps: [{ id: "r1", prompt: "Best CRM?", observedAt: "2026-01-01T00:00:00Z", evidence: "Alpha helps teams.", citations: ["https://www.reddit.com/r/crm/"] }],
  competitorHosts: [],
};
it.each(["fr", "en"])("renders the citation gaps section with evidence links in %s", async lang => {
  const { document } = dom(lang); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : route === "/ai-visibility/share-of-voice" ? views : route === "/ai-visibility/citation-gaps" ? gaps : {});
  const root = renderAiVisibility({ api, me: { role: "tenant-admin" } }); document.body.append(root);
  await vi.waitFor(() => expect([...root.querySelectorAll("h3")].some(h => h.textContent === (lang === "fr" ? "Écarts de citations" : "Citation gaps"))).toBe(true));
  const section = [...root.querySelectorAll<HTMLElement>("section")].find(s => s.querySelector("h3")?.textContent === (lang === "fr" ? "Écarts de citations" : "Citation gaps"))!;
  expect(section.textContent).toContain("not engine market share");
  expect(section.textContent).toContain("3 ");
  expect(section.textContent).toContain(lang === "fr" ? "Site propre" : "Own site");
  expect(section.textContent).not.toContain(lang === "fr" ? "Concurrents" : "Competitors");
  const rows = section.querySelectorAll("div.ai-bar-row");
  expect(rows.length).toBeGreaterThanOrEqual(3);
  const redditRow = [...rows].find(r => r.querySelector("span")?.textContent === "Reddit")!;
  expect(redditRow.querySelector("strong")!.textContent).toContain(lang === "fr" ? "66,7 %" : "66.7 %");
  const ownRow = [...rows].find(r => r.querySelector("span")?.textContent === (lang === "fr" ? "Site propre" : "Own site"))!;
  expect(ownRow.querySelector("strong")!.textContent).toContain("0 %");
  const hostLink = section.querySelector<HTMLAnchorElement>("a.ai-chart-link")!;
  expect(hostLink.rel).toBe("noopener noreferrer");
  expect(section.querySelectorAll("details.ai-answer").length).toBe(1);
  const detail = section.querySelector<HTMLDetailsElement>("details.ai-answer")!;
  expect(detail.textContent).toContain("Alpha helps teams.");
  const gapCite = [...detail.querySelectorAll("a")].find(a => a.textContent === "https://www.reddit.com/r/crm/")!;
  expect(gapCite.rel).toBe("noopener noreferrer"); expect(gapCite.target).toBe("_blank");
  const call = api.mock.calls.find(([route]) => route === "/ai-visibility/citation-gaps");
  expect(call![1]).toMatchObject({ datasetId: "d1", source: "", brand: "" });
});
it("keeps own-source gaps unevaluated when the brand declares no website", async () => {
  const { document } = dom(); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const unevaluated = { ...gaps, evaluated: false, ownWebsite: null, note: "The tracked brand has no declared website in this panel: own-source citation gaps stay unknown, never zero. Declare the brand website before interpreting own-category numbers.", totals: { observations: 1, withCitations: 0, citations: 0, promptsMentioningBrand: 1, promptsMentioningBrandWithOwnCitation: 0 }, categories: gaps.categories.map(c => ({ ...c, citations: 0, citedPrompts: 0, shareOfCitations: null })), topHosts: [], gaps: [] };
  const api = vi.fn(async (route: string) => route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : route === "/ai-visibility/share-of-voice" ? views : route === "/ai-visibility/citation-gaps" ? unevaluated : {});
  const root = renderAiVisibility({ api, me: { role: "marketer" } }); document.body.append(root);
  await vi.waitFor(() => expect([...root.querySelectorAll("h3")].some(h => h.textContent === "Citation gaps")).toBe(true));
  const section = [...root.querySelectorAll<HTMLElement>("section")].find(s => s.querySelector("h3")?.textContent === "Citation gaps")!;
  expect(section.textContent).toContain("Declare the brand website");
  expect(section.querySelectorAll("details.ai-answer").length).toBe(0);
  expect([...section.querySelectorAll("strong")].every(s => s.textContent!.includes("—"))).toBe(true);
});
it("still renders the report when the citation-gaps view fails", async () => {
  const { document } = dom(); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => { if (route === "/ai-visibility/citation-gaps") throw new Error("Gaps unavailable"); return route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : route === "/ai-visibility/share-of-voice" ? views : {}; });
  const root = renderAiVisibility({ api, me: { role: "marketer" } }); document.body.append(root);
  await vi.waitFor(() => expect([...root.querySelectorAll("h3")].some(h => h.textContent === "Answers and evidence")).toBe(true));
  expect([...root.querySelectorAll("h3")].some(h => h.textContent === "Citation gaps")).toBe(false);
});
