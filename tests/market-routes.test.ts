import { afterEach, describe, expect, it, vi } from "vitest";
import { marketRoutes } from "../src/console/market.js";
import { LOCAL_GRID_DEPTH, marketLocaleError, type MarketDataConfig } from "../src/market/provider.js";
import type { HandlerContext } from "../src/console/util.js";

afterEach(() => vi.unstubAllGlobals());

const ctx = (body: Record<string, unknown> = {}): HandlerContext => ({ url: "", body, tenancy: { tenant: { id: "acme" } } } as HandlerContext);
const route = (path: string, config: MarketDataConfig | null = null) => marketRoutes(config).find((r) => r.path === path)!;
const config: MarketDataConfig = { baseUrl: "https://bridge.example", locales: ["FR"], login: "login@example", password: "secret" };

/** Fake partner transport capturing every call and answering a fixed JSON payload. */
const stubPartner = (payload: Record<string, unknown>) => {
  const calls: Array<{ url: string; body: Record<string, unknown>; authorization: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>, authorization: String(init?.headers?.Authorization ?? "") });
    return { ok: true, status: 200, json: async () => payload };
  });
  return calls;
};

describe("market-data console routes (R4)", () => {
  it("reports a fail-closed status without the operator configuration", async () => {
    const status = route("/market/status");
    const result = await status.handler(ctx()) as Record<string, unknown>;
    expect(result).toMatchObject({ enabled: false, locales: ["FR"], provider: "market-data", provenance: "partner-api", localGridDepth: LOCAL_GRID_DEPTH });
    expect(status.adminOnly).toBeUndefined();
  });

  it("keeps the partner calls tenant-admin only and refuses them when the bridge is off", async () => {
    for (const path of ["/market/volumes", "/market/serp", "/market/local-grid"]) {
      const partner = route(path);
      expect(partner.adminOnly).toBe(true);
      await expect(partner.handler(ctx({ keywords: ["a"], keyword: "a", latitude: 0, longitude: 0 }))).rejects.toThrow("Aucun pont données de marché activé");
    }
  });

  it("sends bounded keyword volumes with tenant-supplied keywords and maps the partner answer", async () => {
    const calls = stubPartner({ observedAt: "2026-11-23T10:00:00Z", costUsd: 0.012, volumes: [{ keyword: "audit seo lyon", search_volume: 1300, cpc: 2.5, competition: 0.42, currency: "EUR" }] });
    const result = await route("/market/volumes", config).handler(ctx({ keywords: [" audit seo lyon ", "mot inconnu"], device: "mobile" })) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://bridge.example/volumes", authorization: "Basic bG9naW5AZXhhbXBsZTpzZWNyZXQ=", body: { keywords: ["audit seo lyon", "mot inconnu"], locale: "FR", device: "mobile" } });
    expect(result).toMatchObject({ provider: "market-data", provenance: "partner-api", locale: "FR", device: "mobile", observedAt: "2026-11-23T10:00:00Z", costUsd: 0.012 });
    expect(result.results).toEqual([
      { keyword: "audit seo lyon", searchVolume: 1300, cpc: 2.5, competition: 0.42, currency: "EUR" },
      { keyword: "mot inconnu", searchVolume: null, cpc: null, competition: null, currency: null },
    ]);
  });

  it("bounds the volume request before any partner call", async () => {
    stubPartner({ volumes: [] });
    const volumes = route("/market/volumes", config);
    await expect(volumes.handler(ctx({}))).rejects.toThrow("Au moins un mot-clé est requis.");
    await expect(volumes.handler(ctx({ keywords: Array.from({ length: 21 }, (_, i) => `mot-clé ${i}`) }))).rejects.toThrow("20 mots-clés maximum par appel.");
    await expect(volumes.handler(ctx({ keywords: ["x".repeat(201)] }))).rejects.toThrow("Mot-clé trop long");
    await expect(volumes.handler(ctx({ keywords: ["a"], locale: "de" }))).rejects.toThrow(marketLocaleError("DE", ["FR"]));
  });

  it("checks one Google SERP with a clamped depth and keeps the AI Overview", async () => {
    const calls = stubPartner({ observedAt: "2026-11-23T11:00:00Z", organic_results: [{ position: 1, link: "https://a.example/", title: "A" }], ai_overview: { present: true, cited_urls: ["https://a.example/"] } });
    const result = await route("/market/serp", config).handler(ctx({ keyword: "crm pour pme", depth: 500 })) as Record<string, unknown>;
    expect(calls[0]!.body).toEqual({ keyword: "crm pour pme", locale: "FR", device: "desktop", depth: 100 });
    expect(result).toMatchObject({ locale: "FR", device: "desktop" });
    expect(result.aiOverview).toEqual({ present: true, citedUrls: ["https://a.example/"] });
    await expect(route("/market/serp", config).handler(ctx({}))).rejects.toThrow("Mot-clé requis.");
  });

  it("builds the local GBP rank grid around the centre and caps ranks at the grid depth", async () => {
    const calls = stubPartner({ points: [{ rank: LOCAL_GRID_DEPTH + 5 }, { rank: 3 }] });
    const result = await route("/market/local-grid", config).handler(ctx({ keyword: "plombier paris", latitude: 48.8566, longitude: 2.3522, columns: 2, rows: 1, distanceKm: 2 })) as Record<string, unknown>;
    const grid = calls[0]!.body.grid as Array<Record<string, unknown>>;
    expect(grid).toHaveLength(2);
    expect(result).toMatchObject({ locale: "FR", device: "mobile" });
    expect(result.results).toEqual([
      { id: "p0", latitude: grid[0]!.latitude, longitude: grid[0]!.longitude, rank: null, status: "not-found" },
      { id: "p1", latitude: grid[1]!.latitude, longitude: grid[1]!.longitude, rank: 3, status: "found" },
    ]);
  });

  it("refuses a local grid without centre coordinates", async () => {
    stubPartner({ points: [] });
    await expect(route("/market/local-grid", config).handler(ctx({ keyword: "plombier paris" }))).rejects.toThrow("Coordonnées du centre de grille requises.");
    const clamped = await route("/market/local-grid", config).handler(ctx({ keyword: "plombier paris", latitude: 91, longitude: 0, columns: 1, rows: 1, distanceKm: 1 })) as Record<string, unknown>;
    expect(clamped).toHaveProperty("results");
  });
});
