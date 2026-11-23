import { describe, it, expect, afterEach, vi } from "vitest";
import {
  gridPoints,
  marketDataConfig,
  marketGrid,
  marketLocaleError,
  marketSerp,
  marketVolumes,
  parseLocales,
  LOCAL_GRID_DEPTH,
} from "../src/market/provider.js";

afterEach(() => vi.unstubAllEnvs());

const env = (overrides: Record<string, string> = {}) => ({
  MARKET_DATA_ENABLED: "true",
  MARKET_DATA_API_URL: "https://bridge.example/",
  MARKET_DATA_API_LOGIN: "login@example",
  MARKET_DATA_API_PASSWORD: "secret",
  ...overrides,
});

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };
/** Fake partner transport capturing every call and answering a fixed JSON payload. */
const transportWith = (payload: Record<string, unknown>, status = 200) => {
  const calls: Call[] = [];
  const transport = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    return { ok: status < 400, status, json: async () => payload } as Response;
  }) as typeof fetch;
  return { calls, transport };
};

describe("market-data bridge configuration (R4)", () => {
  it("stays fail-closed without the explicit flag, even when every credential is present", () => {
    expect(marketDataConfig(env({ MARKET_DATA_ENABLED: "1" }))).toBeNull();
    expect(marketDataConfig(env({ MARKET_DATA_ENABLED: "false" }))).toBeNull();
    expect(marketDataConfig({ ...env(), MARKET_DATA_ENABLED: undefined })).toBeNull();
  });

  it("refuses an incomplete or malformed configuration", () => {
    expect(marketDataConfig(env({ MARKET_DATA_API_LOGIN: "" }))).toBeNull();
    expect(marketDataConfig(env({ MARKET_DATA_API_PASSWORD: "" }))).toBeNull();
    expect(marketDataConfig(env({ MARKET_DATA_API_URL: "not-a-url" }))).toBeNull();
  });

  it("normalises the base URL and defaults to Google.fr first", () => {
    const config = marketDataConfig(env({ MARKET_DATA_API_URL: "https://bridge.example/v1///" }));
    expect(config).toMatchObject({ baseUrl: "https://bridge.example/v1", locales: ["FR"] });
    expect(marketDataConfig(env({ MARKET_DATA_LOCALES: "fr, de ,13, fr" }))?.locales).toEqual(["DE", "FR"]);
  });

  it("defaults locales to FR and never invents a locale", () => {
    expect(parseLocales(undefined)).toEqual(["FR"]);
    expect(parseLocales("gb")).toEqual(["GB"]);
    expect(parseLocales("!!!")).toEqual([]);
  });
});

describe("market volumes (R4)", () => {
  it("maps partner fields to null-never-zero volumes and keeps the request order", async () => {
    const config = marketDataConfig(env())!;
    const { calls, transport } = transportWith({
      observedAt: "2026-11-23T10:00:00Z", cost_usd: 0.012,
      volumes: [
        { keyword: "audit seo lyon", search_volume: 1300, cpc: 2.5, competition: 0.42, currency: "EUR" },
      ],
    });
    const result = await marketVolumes(config, { keywords: ["audit seo lyon", "mot inconnu"] }, transport);
    expect(result.results).toEqual([
      { keyword: "audit seo lyon", searchVolume: 1300, cpc: 2.5, competition: 0.42, currency: "EUR" },
      { keyword: "mot inconnu", searchVolume: null, cpc: null, competition: null, currency: null },
    ]);
    expect(result).toMatchObject({ provider: "market-data", provenance: "partner-api", locale: "FR", device: "desktop", observedAt: "2026-11-23T10:00:00Z", costUsd: 0.012 });
    expect(calls[0].url).toBe("https://bridge.example/volumes");
    expect(calls[0].body).toEqual({ keywords: ["audit seo lyon", "mot inconnu"], locale: "FR", device: "desktop" });
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(String(calls[0].init.headers && (calls[0].init.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
  });

  it("refuses a locale the operator did not enable", async () => {
    const config = marketDataConfig(env())!;
    const { transport } = transportWith({ volumes: [] });
    await expect(marketVolumes(config, { keywords: ["x"], locale: "de" }, transport))
      .rejects.toThrow(marketLocaleError("DE", ["FR"]));
  });
});

describe("market serp (R4)", () => {
  it("clamps depth, drops rows without a URL and maps the AI Overview", async () => {
    const config = marketDataConfig(env())!;
    const { calls, transport } = transportWith({
      observedAt: "2026-11-23T11:00:00Z", costUsd: 0.002,
      organic_results: [
        { position: 1, link: "https://a.example/", title: "A" },
        { position: 0, link: "https://broken.example/", title: "broken position" },
        { position: 3, link: "", title: "no url" },
        { position: 4, link: "https://b.example/", title: "B" },
      ],
      ai_overview: { present: true, cited_urls: ["https://a.example/", 42] },
    });
    const result = await marketSerp(config, { keyword: "crm pour pme", depth: 500 }, transport);
    expect(calls[0].body).toEqual({ keyword: "crm pour pme", locale: "FR", device: "desktop", depth: 100 });
    expect(result.results).toEqual([
      { position: 1, url: "https://a.example/", title: "A" },
      { position: null, url: "https://broken.example/", title: "broken position" },
      { position: 4, url: "https://b.example/", title: "B" },
    ]);
    expect(result.aiOverview).toEqual({ present: true, citedUrls: ["https://a.example/"] });
  });

  it("reports no AI Overview when the partner stays silent", async () => {
    const config = marketDataConfig(env())!;
    const { transport } = transportWith({ organic_results: [{ position: 1, link: "https://a.example/", title: "A" }] });
    const result = await marketSerp(config, { keyword: "k" }, transport);
    expect(result.aiOverview).toBeNull();
  });
});

describe("local rank grid geometry (R4)", () => {
  it("builds a bounded row-by-row grid with ids and a latitude-compensated step", () => {
    const points = gridPoints({ latitude: 48.8566, longitude: 2.3522 }, 2, 2, 2);
    expect(points.map((p) => p.id)).toEqual(["r0c0", "r0c1", "r1c0", "r1c1"]);
    expect(points[0].latitude).toBeCloseTo(48.8566 - 2 / 2 / 111.32, 4);
    expect(points).toHaveLength(4);
    const wide = gridPoints({ latitude: 0, longitude: 10 }, 3, 1, 3);
    expect(wide[0].longitude).toBeCloseTo(10 - 1.5 / 111.32, 4);
    expect(wide[2].longitude - wide[1].longitude).toBeCloseTo(wide[1].longitude - wide[0].longitude, 9);
  });

  it("bounds the grid before any partner call", () => {
    expect(() => gridPoints({ latitude: 0, longitude: 0 }, 8, 1, 2)).toThrow(/7×7/);
    expect(() => gridPoints({ latitude: 0, longitude: 0 }, 1, 1, 0.05)).toThrow(/Distance/);
    expect(() => gridPoints({ latitude: 91, longitude: 0 }, 1, 1, 2)).toThrow(/Latitude/);
    expect(() => gridPoints({ latitude: 0, longitude: 181 }, 1, 1, 2)).toThrow(/Longitude/);
  });
});

describe("local rank grid results (R4)", () => {
  it("aligns partner answers with the grid order and caps ranks at the grid depth", async () => {
    const config = marketDataConfig(env())!;
    const grid = gridPoints({ latitude: 48.8566, longitude: 2.3522 }, 2, 1, 2);
    const { calls, transport } = transportWith({
      points: [{ rank: 2 }, { rank: LOCAL_GRID_DEPTH + 5 }, {}],
    });
    const result = await marketGrid(config, { keyword: "plombier paris", grid }, transport);
    expect(calls[0].body).toEqual({ keyword: "plombier paris", locale: "FR", device: "mobile", grid });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ id: "p0", latitude: grid[0].latitude, status: "found", rank: 2 });
    expect(result.results[1]).toMatchObject({ id: "p1", status: "not-found", rank: null });
    expect(result.device).toBe("mobile");
  });
});
