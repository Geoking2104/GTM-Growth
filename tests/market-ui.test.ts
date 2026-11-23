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

const statusDisabled = {
  enabled: false, locales: ["FR"], provider: "market-data", provenance: "partner-api", localGridDepth: 20,
  note: "Les volumes, positions et grilles locales viennent du pont partenaire de l'opérateur.",
};
const statusEnabled = { ...statusDisabled, enabled: true };
const volumesResult = {
  provider: "market-data", provenance: "partner-api", locale: "FR", device: "mobile", observedAt: "2026-11-23T10:00:00Z", costUsd: 0.012,
  results: [
    { keyword: "audit seo lyon", searchVolume: 1300, cpc: 2.5, competition: 0.42, currency: "EUR" },
    { keyword: "mot inconnu", searchVolume: null, cpc: null, competition: null, currency: null },
  ],
};
const serpResult = {
  provider: "market-data", provenance: "partner-api", locale: "FR", device: "desktop", observedAt: "2026-11-23T11:00:00Z", costUsd: 0.002,
  results: [{ position: 1, url: "https://a.example/", title: "A" }],
  aiOverview: { present: true, citedUrls: ["https://a.example/"] },
};
const gridResult = {
  provider: "market-data", provenance: "partner-api", locale: "FR", device: "mobile", observedAt: "2026-11-23T12:00:00Z", costUsd: 0.004,
  results: [
    { id: "p0", latitude: 48.8576, longitude: 2.3522, rank: 2, status: "found" },
    { id: "p1", latitude: 48.8576, longitude: 2.3545, rank: null, status: "not-found" },
  ],
};
/** api() double: answers /market/status plus the three partner routes. */
const apiWith = (status: Record<string, unknown>) => vi.fn(async (route: string) => {
  if (route === "/market/status") return status;
  if (route === "/market/volumes") return volumesResult;
  if (route === "/market/serp") return serpResult;
  return gridResult;
});

it.each(["fr", "en"])("shows the disabled-bridge state and gates every partner button in %s", async lang => {
  const { document } = dom(lang);
  const api = apiWith(statusDisabled);
  const { renderOpsMarket } = await import("../site/console/market.js");
  const root = renderOpsMarket({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("MARKET_DATA_ENABLED"));
  expect(api.mock.calls.length).toBe(1);
  expect(api.mock.calls[0]![0]).toBe("/market/status");
  const buttons = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.length).toBe(3);
  for (const b of buttons) expect(b.disabled).toBe(true);
  expect(root!.querySelector("h3")!.textContent).toBe(lang === "fr" ? "Données de marché partenaires" : "Partner market data");
  expect(root!.textContent).toContain(lang === "fr" ? "aucune donnée n’est inventée" : "no data is invented");
});

it("runs the three admin partner calls with bounded bodies and maps the partner answers", async () => {
  const { document } = dom("en");
  const api = apiWith(statusEnabled);
  const { renderOpsMarket } = await import("../site/console/market.js");
  const root = renderOpsMarket({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("Bridge enabled"));
  const buttons = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  for (const b of buttons) expect(b.disabled).toBe(false);

  const volumeInput = root!.querySelector("textarea")!;
  volumeInput.value = "  audit seo lyon \n mot inconnu \n\n";
  const [volumes, serp] = buttons;
  volumes.click();
  await vi.waitFor(() => expect(root!.querySelector("table")!.textContent).toContain("1300"));
  expect(api.mock.calls.some((call: any[]) => call[0] === "/market/volumes" && call[1].keywords.length === 2 && call[1].keywords[0] === "audit seo lyon" && call[1].device === "desktop")).toBe(true);
  expect(root!.textContent).toContain("partner-api");
  expect(root!.textContent).toContain("2026-11-23");
  expect(root!.textContent).toContain("0.012 USD");
  expect(root!.querySelector("table")!.textContent).toContain("—");

  serp.click();
  await vi.waitFor(() => expect(root!.textContent).toContain("https://a.example/"));
  expect(api.mock.calls.some((call: any[]) => call[0] === "/market/serp" && call[1].depth === 20)).toBe(true);
  expect(root!.textContent).toContain("AI Overview");

  const grid = buttons[2]!;
  grid.click();
  await vi.waitFor(() => expect(root!.textContent).toContain("p1"));
  expect(api.mock.calls.some((call: any[]) => call[0] === "/market/local-grid" && call[1].columns === 5 && call[1].rows === 5 && call[1].device === "mobile" && call[1].distanceKm === 1)).toBe(true);
  expect(root!.textContent).toContain("not found (—)");
});

it("shows the partner error when a call is refused", async () => {
  const { document } = dom("en");
  const api = vi.fn(async (route: string) => {
    if (route === "/market/status") return statusEnabled;
    throw new Error("Aucun pont données de marché activé (MARKET_DATA_ENABLED).");
  });
  const { renderOpsMarket } = await import("../site/console/market.js");
  const root = renderOpsMarket({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.querySelector("button")!.disabled).toBe(false));
  root!.querySelector("button")!.click();
  await vi.waitFor(() => expect(root!.textContent).toContain("Aucun pont données de marché activé"));
});

it("keeps the partner buttons disabled for a member even when the bridge is enabled", async () => {
  const { document } = dom("en");
  const api = apiWith(statusEnabled);
  const { renderOpsMarket } = await import("../site/console/market.js");
  const root = renderOpsMarket({ api, me: { role: "member" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("Bridge enabled"));
  for (const b of [...root!.querySelectorAll<HTMLButtonElement>("button")]) expect(b.disabled).toBe(true);
  expect(root!.textContent).toContain("Only tenant administrators can trigger partner calls");
  expect(api.mock.calls.length).toBe(1);
});
