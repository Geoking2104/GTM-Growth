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
const answer = { id: "r1", prompt: "Best CRM?", answer: "Alpha helps teams.", source: "ChatGPT", observedAt: "2026-01-01T00:00:00Z", citations: [], mentions: [{ brand: "Alpha", evidence: "Alpha helps teams.", sentiment: "neutral" }] };
const report = { brand: "Alpha", count: 1, total: 1, presenceDenominator: 1, visibility: 100, shareOfVoice: 100, brands: [{ name: "Alpha", aliases: ["Alpha"] }], sources: ["ChatGPT"], responses: [answer], counts: [{ brand: "Alpha", count: 1 }], sentiment: { positive: 0, neutral: 1, negative: 0, mixed: 0, unknown: 0 }, trend: [{ date: "2026-01-01", count: 1, total: 1 }] };
const sentiment = { positive: 0, neutral: 1, negative: 0, mixed: 0, unknown: 0 };
const views = {
  panel: "d1", createdAt: "2026-01-01", brand: "Alpha", source: null, totalResponses: 1, totalMentions: 1,
  engines: [
    { engine: "ChatGPT", responses: 1, mentions: 1, brands: [{ brand: "Alpha", mentions: 1, shareOfVoice: 100, visibility: 100, sentiment }] },
    { engine: "Perplexity", responses: 0, mentions: 0, brands: [{ brand: "Alpha", mentions: 0, shareOfVoice: null, visibility: null, sentiment }] },
  ],
  overall: { responses: 1, mentions: 1, brands: [{ brand: "Alpha", mentions: 1, shareOfVoice: 100, visibility: 100, sentiment }] },
  note: "Shares are proportions of this stored panel only: mentions per engine divided by that engine's mention total. This is not engine market share and not consumer sessions.",
};
const previewResult = { provider: "generic", format: "csv", count: 2, engines: ["ChatGPT"], mapping: { prompt: ["prompt"] }, previewDigest: "digest", ignoredColumns: ["utm"], normalisedDates: 1, sources: ["Generic import (ChatGPT)"], provenance: "imported", warning: "Tracker imports keep the tracker's own measurement; no external call was made." };
const importResult = { id: "d9", count: 2, provider: "meteoria", engines: ["ChatGPT"], ignoredColumns: ["utm"], normalisedDates: 1, provenance: "imported" };
it.each(["fr", "en"])("reviews then commits a tracker import in %s", async lang => {
  const { document, window } = dom(lang); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : route === "/ai-visibility/share-of-voice" ? views : route === "/ai-visibility/import-tracker-preview" ? previewResult : importResult);
  const root = renderAiVisibility({ api, me: { role: "tenant-admin" } }); document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector("details.ai-import-tracker")).not.toBeNull());
  const panel = root.querySelector<HTMLDetailsElement>("details.ai-import-tracker")!;
  expect(panel.querySelector("summary")!.textContent).toBe(lang === "fr" ? "Importer un export de tracker" : "Import a tracker export");
  const textareas = panel.querySelectorAll<HTMLTextAreaElement>("textarea");
  const payload = textareas[0]!, brands = textareas[1]!;
  const commit = panel.querySelectorAll<HTMLButtonElement>("button").find(b => b.textContent === (lang === "fr" ? "Enregistrer l’import tracker" : "Save tracker import"))!;
  expect(commit.disabled).toBe(true);
  brands.value = JSON.stringify([{ name: "Alpha", aliases: [] }]);
  payload.value = "date,prompt,answer,utm\n02/01/2026,Best CRM?,Alpha helps teams.,x";
  commit.click();
  await vi.waitFor(() => expect(api.mock.calls.some(([route]) => route === "/ai-visibility/import-tracker")).toBe(false));
  const preview = panel.querySelectorAll<HTMLButtonElement>("button").find(b => b.textContent === (lang === "fr" ? "Vérifier l’export tracker" : "Review tracker export"))!;
  preview.click();
  await vi.waitFor(() => expect(commit.disabled).toBe(false));
  const feedback = panel.querySelector("[role=status]")!;
  expect(feedback.textContent).toContain(lang === "fr" ? "colonnes ignorées" : "ignored columns");
  expect(feedback.textContent).toContain("generic · csv · 2");
  expect(feedback.textContent).toContain(lang === "fr" ? "Question ← prompt" : "Prompt ← prompt");
  const previewCall = api.mock.calls.filter(([route]) => route === "/ai-visibility/import-tracker-preview").at(-1)!;
  expect(previewCall[1]).toMatchObject({ provider: "generic", format: "csv", brands: [{ name: "Alpha", aliases: [] }] });
  payload.value = "date,prompt,answer,utm\n02/01/2026,Best CRM?,Alpha helps teams.,changed";
  payload.dispatchEvent(new window.Event("input"));
  expect(commit.disabled).toBe(true);
  commit.click();
  await vi.waitFor(() => expect(api.mock.calls.some(([route]) => route === "/ai-visibility/import-tracker")).toBe(false));
  preview.click();
  await vi.waitFor(() => expect(commit.disabled).toBe(false));
  commit.click();
  await vi.waitFor(() => expect(api.mock.calls.some(([route]) => route === "/ai-visibility/import-tracker")).toBe(true));
  const importCall = api.mock.calls.filter(([route]) => route === "/ai-visibility/import-tracker").at(-1)!;
  expect(importCall[1]).toMatchObject({ provider: "generic", format: "csv", previewDigest: "digest", payload: expect.stringContaining("changed"), brands: [{ name: "Alpha", aliases: [] }] });
});
it("shows a tracker preview error without enabling the commit", async () => {
  const { document } = dom(); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => { if (route === "/ai-visibility/import-tracker-preview") throw new Error("CSV export has no recognised column; expected prompt, answer and date columns"); return route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : route === "/ai-visibility/share-of-voice" ? views : importResult; });
  const root = renderAiVisibility({ api, me: { role: "tenant-admin" } }); document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector("details.ai-import-tracker")).not.toBeNull());
  const panel = root.querySelector<HTMLDetailsElement>("details.ai-import-tracker")!;
  const textareas = panel.querySelectorAll<HTMLTextAreaElement>("textarea");
  textareas[0]!.value = "prompt,answer\nQ?,A"; textareas[1]!.value = JSON.stringify([{ name: "Alpha", aliases: [] }]);
  panel.querySelectorAll<HTMLButtonElement>("button").find(b => b.textContent === "Review tracker export")!.click();
  await vi.waitFor(() => expect(panel.querySelector("[role=status]")!.textContent).toContain("no recognised column"));
  const commit = panel.querySelectorAll<HTMLButtonElement>("button").find(b => b.textContent === "Save tracker import")!;
  expect(commit.disabled).toBe(true);
});
it("keeps the tracker import admin-only", async () => {
  const { document } = dom(); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : route === "/ai-visibility/share-of-voice" ? views : {});
  const root = renderAiVisibility({ api, me: { role: "marketer" } }); document.body.append(root);
  await vi.waitFor(() => expect([...root.querySelectorAll("h3")].some(h => h.textContent === "Share of voice per engine")).toBe(true));
  expect(root.querySelectorAll("details.ai-import-tracker").length).toBe(0);
  expect(api.mock.calls.some(([route]) => route.includes("import-tracker"))).toBe(false);
  expect(root.querySelectorAll("details.ai-import").length).toBe(0);
});
it("renders the share-of-voice section with null shares as em dashes", async () => {
  const { document } = dom(); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : route === "/ai-visibility/share-of-voice" ? views : {});
  const root = renderAiVisibility({ api, me: { role: "marketer" } }); document.body.append(root);
  await vi.waitFor(() => expect([...root.querySelectorAll("h3")].some(h => h.textContent === "Share of voice per engine")).toBe(true));
  const section = [...root.querySelectorAll<HTMLElement>("section")].find(s => s.querySelector("h3")?.textContent === "Share of voice per engine")!;
  expect(section.textContent).toContain("not engine market share");
  const lines = section.querySelectorAll("div.ai-bar-row");
  expect(lines.length).toBe(3);
  expect(lines[0]!.textContent).toContain("ChatGPT · 1/1");
  expect(lines[0]!.querySelector("strong")!.textContent).toContain("100 %");
  expect(lines[1]!.textContent).toContain("Perplexity · 0/0");
  expect(lines[1]!.querySelector("strong")!.textContent).toBe("—");
  expect(lines[2]!.textContent).toContain("All engines");
  const call = api.mock.calls.find(([route]) => route === "/ai-visibility/share-of-voice");
  expect(call![1]).toMatchObject({ datasetId: "d1", source: "", brand: "" });
});
it("still renders the report when the share-of-voice view fails", async () => {
  const { document } = dom(); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => { if (route === "/ai-visibility/share-of-voice") throw new Error("View unavailable"); return route === "/ai-visibility/datasets" ? { datasets: [{ id: "d1", createdAt: "2026-01-01", count: 1 }] } : route === "/ai-visibility/report" ? report : {}; });
  const root = renderAiVisibility({ api, me: { role: "marketer" } }); document.body.append(root);
  await vi.waitFor(() => expect([...root.querySelectorAll("h3")].some(h => h.textContent === "Answers and evidence")).toBe(true));
  expect([...root.querySelectorAll("h3")].some(h => h.textContent === "Share of voice per engine")).toBe(false);
});
