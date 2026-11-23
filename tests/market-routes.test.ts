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

describe("market backlinks console routes (R5)", () => {
  it("keeps the partner calls tenant-admin only and refuses them when the bridge is off", async () => {
    for (const path of ["/market/backlinks/overview", "/market/backlinks/gap"]) {
      const partner = route(path);
      expect(partner.adminOnly).toBe(true);
      await expect(partner.handler(ctx({ domain: "exemple.fr", competitors: ["comp.fr"] }))).rejects.toThrow("Aucun pont données de marché activé");
    }
    await expect(route("/market/backlinks/overview", config).handler(ctx({}))).rejects.toThrow("Nom de domaine requis.");
  });

  it("maps the backlink overview with a bounded referrer list and full provenance", async () => {
    const calls = stubPartner({
      observedAt: "2026-11-23T12:00:00Z", costUsd: 0.03, backlinks: 900, ref_domains: 120,
      referrers: [{ domain: "site-a.fr", backlinks: 7 }, { domain: "site-b.fr" }],
    });
    const result = await route("/market/backlinks/overview", config).handler(ctx({ domain: "https://www.exemple.fr", referrersLimit: 99 })) as Record<string, unknown>;
    expect(calls[0]).toMatchObject({ url: "https://bridge.example/backlinks/overview", authorization: "Basic bG9naW5AZXhhbXBsZTpzZWNyZXQ=", body: { domain: "exemple.fr", locale: "FR", limit: 50 } });
    expect(result).toMatchObject({ provider: "market-data", provenance: "partner-api", locale: "FR", observedAt: "2026-11-23T12:00:00Z", costUsd: 0.03 });
    expect(result.profile).toEqual({ domain: "exemple.fr", backlinks: 900, refDomains: 120 });
    expect(result.referrers).toEqual([{ domain: "site-a.fr", backlinks: 7 }, { domain: "site-b.fr", backlinks: null }]);
  });

  it("bounds the link-gap competitors and dedupes them before the partner call", async () => {
    const calls = stubPartner({ observedAt: "2026-11-23T12:00:00Z", costUsd: 0.04, profiles: [{ domain: "comp1.fr", backlinks: 10, ref_domains: 3 }], gaps: [{ domain: "cible.fr", links_to: ["comp1.fr"], backlinks: 2 }] });
    const gap = route("/market/backlinks/gap", config);
    await expect(gap.handler(ctx({ domain: "exemple.fr" }))).rejects.toThrow("Au moins un concurrent est requis.");
    await expect(gap.handler(ctx({ domain: "exemple.fr", competitors: ["comp1.fr", "comp1.fr ", "comp2.fr", "comp3.fr", "comp4.fr", "comp5.fr", "comp6.fr"] }))).rejects.toThrow("5 concurrents maximum par appel.");
    await expect(gap.handler(ctx({ domain: "exemple.fr", competitors: ["exemple.fr"] }))).rejects.toThrow("propre concurrent.");
    const result = await gap.handler(ctx({ domain: "exemple.fr", competitors: ["www.comp1.fr", "COMP1.fr"] })) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ domain: "exemple.fr", competitors: ["comp1.fr"], locale: "FR" });
    expect(result.profiles).toEqual([{ domain: "comp1.fr", backlinks: 10, refDomains: 3 }]);
    expect(result.gaps).toEqual([{ domain: "cible.fr", citedBy: ["comp1.fr"], backlinks: 2 }]);
  });

  it("generates the disavow file with the bridge off: a pure tenant selection", async () => {
    const partner = route("/market/backlinks/disavow");
    expect(partner.adminOnly).toBe(true);
    const result = await partner.handler(ctx({ domains: ["www.spam1.fr", "spam1.fr", "spam2.fr"] })) as Record<string, unknown>;
    expect(result.provenance).toBe("tenant-selection");
    expect(/^disavow-\d{4}-\d{2}-\d{2}\.txt$/.test(String(result.filename))).toBe(true);
    expect(result.count).toBe(2);
    expect(String(result.content)).toContain("domain: spam1.fr");
    expect(String(result.note)).toContain("sans appel partenaire");
    await expect(partner.handler(ctx({}))).rejects.toThrow("Au moins un domaine est requis.");
    await expect(partner.handler(ctx({ domains: ["pas-un-domaine"] }))).rejects.toThrow("Nom de domaine invalide.");
  });
});

describe("partner-cost metering (R10)", () => {
  it("meters the partner-reported cost of every successful partner call for the exact tenant", async () => {
    const metered: Array<[string, number]> = [];
    const meterPartnerCost = (tenantId: string, costUsd: number) => metered.push([tenantId, costUsd]);
    const routes = (path: string) => marketRoutes(config, { meterPartnerCost }).find((r) => r.path === path)!;
    stubPartner({ observedAt: "2026-11-23T12:00:00Z", costUsd: 0.012, volumes: [{ keyword: "audit seo lyon", search_volume: 1300 }] });
    await routes("/market/volumes").handler(ctx({ keywords: ["audit seo lyon"] }));
    stubPartner({ observedAt: "2026-11-23T12:30:00Z", costUsd: 0.04, profiles: [], gaps: [] });
    await routes("/market/backlinks/gap").handler(ctx({ domain: "exemple.fr", competitors: ["comp1.fr"] }));
    stubPartner({ observedAt: "2026-11-23T13:00:00Z", costUsd: 0.002, organic_results: [] });
    await routes("/market/serp").handler(ctx({ keyword: "crm pme" }));
    expect(metered).toEqual([["acme", 0.012], ["acme", 0.04], ["acme", 0.002]]);
  });

  it("never meters an unknown partner cost nor the partner-free disavow export", async () => {
    const metered: Array<[string, number]> = [];
    const meterPartnerCost = (tenantId: string, costUsd: number) => metered.push([tenantId, costUsd]);
    const routes = (path: string) => marketRoutes(config, { meterPartnerCost }).find((r) => r.path === path)!;
    stubPartner({ observedAt: "2026-11-23T14:00:00Z", volumes: [{ keyword: "mot", search_volume: 10 }] });
    const volumes = await routes("/market/volumes").handler(ctx({ keywords: ["mot"] })) as Record<string, unknown>;
    expect(volumes.costUsd).toBeNull();
    await routes("/market/backlinks/disavow").handler(ctx({ domains: ["spam1.fr"] }));
    expect(metered).toEqual([]);
  });

  it("swallows a metering failure: the partner answer wins over the measurement", async () => {
    stubPartner({ observedAt: "2026-11-23T15:00:00Z", costUsd: 0.03, backlinks: 900, ref_domains: 120, referrers: [] });
    const routes = (path: string) => marketRoutes(config, { meterPartnerCost: () => { throw new Error("ledger indisponible"); } }).find((r) => r.path === path)!;
    const result = await routes("/market/backlinks/overview").handler(ctx({ domain: "exemple.fr" })) as Record<string, unknown>;
    expect(result.costUsd).toBe(0.03);
    expect(result.profile).toEqual({ domain: "exemple.fr", backlinks: 900, refDomains: 120 });
  });
});
