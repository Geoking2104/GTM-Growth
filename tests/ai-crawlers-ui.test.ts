import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function dom(lang = "en") {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("location", { search: `?lang=${lang}` });
  vi.stubGlobal("localStorage", { getItem: () => lang, setItem: vi.fn() });
  return { document, window };
}

const stats = {
  version: "ai-crawler-logs-v1",
  provenance: { source: "tenant-supplied-access-logs", parsedAt: "2026-11-23T14:00:00Z", logFormat: "nginx-combined" },
  totals: { lines: 4, parsed: 3, ignored: 1, crawlerRequests: 3, otherRequests: 0 },
  crawlers: [
    { bot: "GPTBot", owner: "OpenAI (ChatGPT training)", requests: 2, pages: 2, served: 2, errors: 0 },
    { bot: "OAI-SearchBot", owner: "OpenAI (ChatGPT search citations)", requests: 1, pages: 1, served: 1, errors: 0 },
  ],
  sections: [{ section: "/blog", requests: 3, pages: 2, byCrawler: { GPTBot: 2, "OAI-SearchBot": 1 } }],
  firstSeenAt: "2026-11-23T09:00:00.000Z", lastSeenAt: "2026-11-23T11:00:00.000Z",
  note: "Analyse fondée uniquement sur les journaux fournis ; aucune donnée n'est inventée hors de ces journaux.",
};
const draft = {
  policy: {
    version: "ai-crawler-policy-draft-v1", mode: "dry-run",
    robots: {
      before: "User-agent: *\nDisallow: /private/\n",
      after: "User-agent: *\nDisallow: /private/\n\nUser-agent: PerplexityBot\nDisallow: /\n",
      diff: "--- a/robots.txt\n+++ b/robots.txt\n@@ -1,2 +1,6 @@\n User-agent: *\n Disallow: /private/\n+User-agent: PerplexityBot\n+Disallow: /\n",
      changed: true,
      manualReview: ["Règle robots existante conservée pour GPTBot ; modifiez-la à la main si besoin."],
    },
    llms: { before: null, after: "# www.example.com\n> Description du site à compléter par l'exploitant ; aucune description n'est inventée automatiquement.\n", diff: null, changed: true },
    changed: true,
    note: "Simulation uniquement (dry-run).",
  },
  actionsAvailable: ["draft"],
  writesEnabled: false,
  requiresSeparateDomainVerificationAndApproval: true,
};
/** api() double: answers the analyze and policy routes with the fixtures. */
const apiWith = () => vi.fn(async (route: string) => {
  if (route === "/ai-crawlers/analyze") return stats;
  if (route === "/apply/ai-crawlers/policy") return draft;
  throw new Error("unexpected route");
});

it.each(["fr", "en"])("renders the panel, its gate note and titles in %s", async lang => {
  const { document } = dom(lang);
  const api = apiWith();
  const { renderOpsAiCrawlers } = await import("../site/console/ai-crawlers.js");
  const root = renderOpsAiCrawlers({ api, me: { role: "member", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  expect(root!.querySelector("h3")!.textContent).toBe(lang === "fr" ? "Analytics crawlers IA" : "AI crawler analytics");
  const buttons = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.length).toBe(2);
  for (const b of buttons) expect(b.disabled).toBe(true);
  expect(api.mock.calls.length).toBe(0);
  expect(root!.textContent).toContain(lang === "fr" ? "Seuls les administrateurs du client" : "Only tenant administrators");
  expect(root!.textContent).toContain(lang === "fr" ? "Couverture de crawl par IA" : "AI crawl coverage");
});

it.each(["fr", "en"])("analyzes pasted logs and renders the coverage tables with provenance in %s", async lang => {
  const { document } = dom(lang);
  const api = apiWith();
  const { renderOpsAiCrawlers } = await import("../site/console/ai-crawlers.js");
  const root = renderOpsAiCrawlers({ api, me: { role: "tenant-admin", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  const [analyze] = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  expect(analyze!.disabled).toBe(false);
  const logs = root!.querySelector("textarea")!;
  logs.value = `203.0.113.5 - - [23/Nov/2026:10:00:00 +0100] "GET /blog/guide HTTP/1.1" 200 512 "-" "Mozilla/5.0 (compatible; GPTBot/1.0)"`;
  analyze!.click();
  await vi.waitFor(() => expect(root!.querySelector("table")!.textContent).toContain("GPTBot"));
  expect(api.mock.calls[0]![0]).toBe("/ai-crawlers/analyze");
  expect(api.mock.calls[0]![1]).toMatchObject({ logs: logs.value });
  const tables = [...root!.querySelectorAll("table")];
  expect(tables[0]!.textContent).toContain("GPTBot");
  expect(tables[0]!.textContent).toContain("OpenAI");
  expect(tables[1]!.textContent).toContain("/blog");
  expect(tables[1]!.textContent).toContain("GPTBot 2");
  expect(root!.textContent).toContain(lang === "fr" ? "journaux fournis par le client" : "tenant-supplied"); // provenance always visible
  expect(root!.textContent).toContain("2026-11-23");
  expect(root!.textContent).toContain(lang === "fr" ? "lignes analysables" : "parsable lines");
});

it("generates the dry-run policy drafts with the per-crawler choices", async () => {
  const { document } = dom("en");
  const api = apiWith();
  const { renderOpsAiCrawlers } = await import("../site/console/ai-crawlers.js");
  const root = renderOpsAiCrawlers({ api, me: { role: "tenant-admin", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  const url = root!.querySelector<HTMLInputElement>("input[type=url]")!;
  expect(url!.value).toBe("https://example.com");
  const selects = [...root!.querySelectorAll("select")];
  expect(selects.length).toBe(6);
  // linkedom only exposes select.value once an option carries selected; the panel defaults to allow.
  expect(selects[0]!.value).toBe("allow");
  // Refuse PerplexityBot (fifth policy select; a real browser deselects the
  // previous option; linkedom needs it done explicitly).
  const perplexity = selects[4]!;
  const [allowOption, refuse] = [...perplexity.querySelectorAll("option")];
  allowOption!.selected = false;
  refuse!.selected = true;
  const [, draftButton] = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  draftButton!.click();
  await vi.waitFor(() => expect(root!.querySelector("details")!.textContent).toContain("+User-agent: PerplexityBot"));
  const policyCall = api.mock.calls.find(([route]) => route === "/apply/ai-crawlers/policy")!;
  expect(policyCall![1]).toMatchObject({ url: "https://example.com" });
  const choices = policyCall![1].choices as Array<{ agent: string; action: string }>;
  expect(choices).toHaveLength(6);
  expect(choices.some((c) => c.agent === "GPTBot" && c.action === "allow")).toBe(true);
  expect(choices.some((c) => c.agent === "PerplexityBot" && c.action === "disallow")).toBe(true);
  expect(choices.every((c) => c.action === "allow" || c.action === "disallow")).toBe(true);
  expect(root!.textContent).toContain("Preview only. No writer is wired");
  expect(root!.textContent).toContain("Manual review:");
  const links = [...root!.querySelectorAll("a")];
  expect(links.some((a) => a.getAttribute("href") === "#apply_mode")).toBe(true);
});

it("surfaces refused partner/server errors without inventing data", async () => {
  const { document } = dom("en");
  const api = vi.fn(async () => { throw new Error("Aucune ligne de journal fournie (format nginx combiné attendu)."); });
  const { renderOpsAiCrawlers } = await import("../site/console/ai-crawlers.js");
  const root = renderOpsAiCrawlers({ api, me: { role: "tenant-admin", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  root!.querySelector("button")!.click();
  await vi.waitFor(() => expect(root!.textContent).toContain("Aucune ligne de journal fournie"));
  expect(root!.querySelector("table")).toBeNull();
});
