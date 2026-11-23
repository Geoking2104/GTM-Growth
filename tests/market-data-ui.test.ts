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
  return { document };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const config = { provider: "market-data", enabled: true, locales: ["FR"], provenance: "partner-api" };
const admin = { platformAdmin: true };

/** Console API fake capturing every call; /market/config answers the badge, and every other path answers a fixed payload. */
const apiWith = (answers: Record<string, unknown> = {}) => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const api = (path: string, body = {}) => {
    calls.push({ path, body });
    if (path === "/market/config") return Promise.resolve(JSON.parse(JSON.stringify(config)));
    const answer = answers[path];
    if (answer === undefined) throw new Error(`Unexpected call ${path}`);
    return Promise.resolve(JSON.parse(JSON.stringify(answer)));
  };
  return { calls, api };
};

it.each(["fr", "en"])("renders the partner provenance and the three administrator tools in %s", async lang => {
  const { document } = dom(lang);
  const { calls, api } = apiWith();
  const { renderOpsMarket } = await import("../site/console/market-data.js");
  const box = renderOpsMarket({ api, me: admin });
  document.body.append(box);
  await flush();
  expect(calls.map((call) => call.path)).toEqual(["/market/config"]);
  expect(box.textContent).toContain(lang === "fr" ? "Données de marché (pont partenaire)" : "Market data (partner bridge)");
  expect(box.textContent).toContain(lang === "fr" ? "provenance partenaire" : "partner provenance");
  expect([...box.querySelectorAll("summary")].map((node) => node.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("/volumes"), expect.stringContaining("/serp"), expect.stringContaining("/grid")]));
  expect(box.querySelectorAll("details")).toHaveLength(3);
  expect([...box.querySelectorAll("input")].some((input) => input.disabled)).toBe(false);
});

it("keeps the bridge honest when it is not configured and never leaks a partner call", async () => {
  const { document } = dom("fr");
  const calls: Array<{ path: string }> = [];
  const api = (path: string) => { calls.push({ path }); return Promise.resolve({ provider: "market-data", enabled: false, locales: [], provenance: "partner-api" }); };
  const { renderOpsMarket } = await import("../site/console/market-data.js");
  const box = renderOpsMarket({ api, me: admin });
  document.body.append(box);
  await flush();
  expect(calls).toEqual([{ path: "/market/config" }]);
  expect(box.textContent).toContain("MARKET_DATA_ENABLED=true");
  expect(box.querySelectorAll("details")).toHaveLength(0);
});

it("runs a keyword volume call only on an explicit administrator click, with provenance displayed", async () => {
  const { document } = dom("fr");
  const { calls, api } = apiWith({
    "/market/volumes": { provider: "market-data", provenance: "partner-api", locale: "FR", device: "desktop", observedAt: "2026-11-23T10:00:00.000Z", costUsd: 0.012, results: [{ keyword: "crm pme", searchVolume: 1300, cpc: 2.5, competition: 0.4, currency: "EUR" }, { keyword: "seo local", searchVolume: null, cpc: null, competition: null, currency: null }] },
  });
  const { renderOpsMarket } = await import("../site/console/market-data.js");
  const box = renderOpsMarket({ api, me: admin });
  document.body.append(box);
  await flush();
  const [keywordInput] = [...box.querySelectorAll("input")] as Array<HTMLInputElement>;
  keywordInput.value = "crm pme, seo local";
  const click = ([...box.querySelectorAll("button")][0] as HTMLButtonElement).onclick as unknown as (() => void) | null;
  expect(click).toBeTruthy();
  click!();
  await flush();
  expect(calls.map((call) => call.path)).toEqual(["/market/config", "/market/volumes"]);
  expect(calls[1].body).toEqual({ keywords: ["crm pme", "seo local"] });
  expect(box.textContent).toContain("crm pme");
  expect(box.textContent).toContain("volume inconnu");
  expect(box.textContent).toContain("partner-api");
});

it("disables the calls for non-administrators and keeps the badge readable", async () => {
  const { document } = dom("en");
  const { calls, api } = apiWith();
  const { renderOpsMarket } = await import("../site/console/market-data.js");
  const box = renderOpsMarket({ api, me: { platformAdmin: false, role: "tenant-user" } });
  document.body.append(box);
  await flush();
  expect(calls.map((call) => call.path)).toEqual(["/market/config"]);
  expect(box.textContent).toContain("Only administrators can run partner calls.");
  expect([...box.querySelectorAll("input")].every((input) => input.disabled)).toBe(true);
});
