import { afterEach, expect, it, vi } from "vitest";
class ElementStub {
  children: ElementStub[] = []; textContent = ""; value = ""; className = ""; onclick?: () => unknown; onchange?: () => unknown; onsubmit?: (e: { preventDefault(): void }) => unknown;
  constructor(public tagName: string) {}
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  setAttribute() {}
  querySelector(tag: string): ElementStub | undefined { return this.children.find((x) => x.tagName === tag) || this.children.map((x) => x.querySelector(tag)).find(Boolean); }
  get lastChild() { return this.children.at(-1); }
}
const flatten = (node: ElementStub): ElementStub[] => [node, ...node.children.flatMap(flatten)];
afterEach(() => { vi.unstubAllGlobals(); });
it("renders competition and loads GSC suggestions without a browser session", async () => {
  vi.stubGlobal("location", { search: "" }); vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => {} });
  vi.stubGlobal("document", { documentElement: { lang: "fr" }, createElement: (tag: string) => new ElementStub(tag), createTextNode: (text: string) => { const node = new ElementStub("text"); node.textContent = text; return node; } });
  const { renderCompetition } = await import("../site/console/competition.js");
  const answer = { id: "r", prompt: "Meilleur logiciel wiki", answer: "Beta", source: "A", observedAt: "2026-01-01T00:00:00Z", citations: [], mentions: [{ brand: "Beta", evidence: "Beta", sentiment: "unknown" }] };
  const api = vi.fn(async (path: string) => path === "/ai-visibility/datasets" ? { datasets: [{ id: "d", createdAt: "2026-01-01", count: 1 }] } : path === "/competition/state" ? { panels: {}, actions: [] } : path === "/competition/alert" ? { state: "not-configured" } : path === "/ai-visibility/report" ? { brands: [{ name: "Alpha", aliases: ["Alpha"] }, { name: "Beta", aliases: ["Beta"] }], sources: ["A"], responses: [answer] } : { rows: [{ query: "logiciel wiki", page: "https://acme.test/wiki", clicks: 1, impressions: 2 }], period: { start: "2026-01-01", end: "2026-01-02" } });
  const root = renderCompetition({ api, me: { role: "tenant-admin" }, property: "sc-domain:acme.test", days: 28 }) as unknown as ElementStub;
  await new Promise((resolve) => setTimeout(resolve, 10));
  const search = flatten(root).find((x) => x.textContent === "Rechercher les pages associées"); expect(search).toBeDefined();
  await search!.onclick!();
  expect(flatten(root).some((x) => x.textContent.includes("https://acme.test/wiki"))).toBe(true);
  expect(flatten(root).some((x) => x.textContent.includes("Priorités proposées"))).toBe(true);
});
