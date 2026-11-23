import { describe, it, expect, afterEach, vi } from "vitest";
import {
  backlinkDisavowFile,
  marketBacklinkGap,
  marketBacklinkOverview,
  marketDataConfig,
  normaliseMarketDomain,
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

describe("market domain normalisation (R4/R5)", () => {
  it("tolerates schemes, paths and www, then enforces hostname rules", () => {
    expect(normaliseMarketDomain(" https://www.exemple.fr/some/page ")).toBe("exemple.fr");
    expect(normaliseMarketDomain("WWW.Exemple.FR:443")).toBe("exemple.fr");
    expect(normaliseMarketDomain("sous-domaine.exemple.fr")).toBe("sous-domaine.exemple.fr");
  });

  it("refuses anything that is not a plain hostname", () => {
    expect(() => normaliseMarketDomain("")).toThrow("Nom de domaine requis.");
    expect(() => normaliseMarketDomain("   ")).toThrow("Nom de domaine requis.");
    expect(() => normaliseMarketDomain("exemple")).toThrow("Nom de domaine invalide.");
    expect(() => normaliseMarketDomain("exa mple.fr")).toThrow("Nom de domaine invalide.");
    expect(() => normaliseMarketDomain("-exemple.fr")).toThrow("Nom de domaine invalide.");
    expect(() => normaliseMarketDomain("exa_mple.fr")).toThrow("Nom de domaine invalide.");
    expect(() => normaliseMarketDomain("e".repeat(64) + ".fr")).toThrow("Nom de domaine invalide.");
  });
});

describe("market backlink overview (R5)", () => {
  it("calls the partner with Basic auth and a bounded request, then maps the answer with provenance", async () => {
    const config = marketDataConfig(env())!;
    const { calls, transport } = transportWith({
      observedAt: "2026-11-23T10:00:00.000Z",
      costUsd: 0.02,
      backlinks: 1200,
      ref_domains: 150,
      referrers: [
        { domain: "SiteA.fr", backlinks: 12 },
        { domain: "siteb.fr", backlinks: null },
        { domain: "", backlinks: 5 },
        { domain: "sitec.fr" },
      ],
    });
    const result = await marketBacklinkOverview(config, { domain: "https://www.exemple.fr", referrersLimit: 5 }, transport);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://bridge.example/backlinks/overview");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Basic bG9naW5AZXhhbXBsZTpzZWNyZXQ=");
    expect(calls[0].body).toMatchObject({ domain: "exemple.fr", locale: "FR", limit: 5 });
    expect(result).toMatchObject({
      provider: "market-data",
      provenance: "partner-api",
      locale: "FR",
      observedAt: "2026-11-23T10:00:00.000Z",
      costUsd: 0.02,
    });
    expect(result.profile).toMatchObject({ domain: "exemple.fr", backlinks: 1200, refDomains: 150 });
    expect(result.referrers.length).toBe(3);
    expect(result.referrers[0]).toMatchObject({ domain: "sitea.fr", backlinks: 12 });
    expect(result.referrers[1]).toMatchObject({ domain: "siteb.fr", backlinks: null });
    expect(result.referrers[2]).toMatchObject({ domain: "sitec.fr", backlinks: null });
  });

  it("keeps unknown figures null, never zero, and slices the referrer list to the requested bound", async () => {
    const config = marketDataConfig(env())!;
    const many = Array.from({ length: 60 }, (_, i) => ({ domain: `ref${i}.fr`, backlinks: i + 1 }));
    const { transport } = transportWith({ referrers: many });
    const result = await marketBacklinkOverview(config, { domain: "exemple.fr", referrersLimit: 3 }, transport, () => "2026-05-05T00:00:00.000Z");
    expect(result.profile).toMatchObject({ domain: "exemple.fr", backlinks: null, refDomains: null });
    expect(result.costUsd).toBeNull();
    expect(result.observedAt).toBe("2026-05-05T00:00:00.000Z"); /* injected clock below */
    expect(result.referrers.length).toBe(3);
  });
});

describe("market backlink gap (R5)", () => {
  const payload = {
    observedAt: "2026-11-23T09:00:00.000Z",
    costUsd: 0.05,
    profiles: [
      { domain: "Exemple.fr", backlinks: 1200, ref_domains: 150 },
      { domain: "comp1.fr", backlinks: 800, ref_domains: 90 },
      { domain: "comp2.fr", backlinks: 400, ref_domains: 60 },
    ],
    gaps: [
      { domain: "one-cite.fr", links_to: ["comp1.fr"], backlinks: 3 },
      { domain: "TWO-CITES.fr", links_to: ["comp1.fr", "comp2.fr", "not-a-competitor.io"], backlinks: 8 },
      { domain: "no-valid-citation.fr", links_to: ["not-a-competitor.io"], backlinks: 9 },
      { domain: "", links_to: ["comp2.fr"], backlinks: 1 },
    ],
  };

  it("dedupes competitors, filters citations to the declared list and sorts by coverage", async () => {
    const config = marketDataConfig(env())!;
    const { calls, transport } = transportWith(payload);
    const result = await marketBacklinkGap(config, { domain: "exemple.fr", competitors: ["www.comp1.fr", "COMP1.fr", "comp2.fr"] }, transport);
    expect(calls[0].body).toMatchObject({ domain: "exemple.fr", competitors: ["comp1.fr", "comp2.fr"], locale: "FR" });
    expect(result.profiles.length).toBe(3);
    expect(result.profiles[0]).toMatchObject({ domain: "exemple.fr", backlinks: 1200, refDomains: 150 });
    expect(result.gaps.length).toBe(2);
    expect(result.gaps[0]).toMatchObject({ domain: "two-cites.fr", citedBy: ["comp1.fr", "comp2.fr"], backlinks: 8 });
    expect(result.gaps[1]).toMatchObject({ domain: "one-cite.fr", citedBy: ["comp1.fr"], backlinks: 3 });
    expect(result.gaps[0].citedBy.includes("not-a-competitor.io")).toBe(false);
  });

  it("keeps provenance partner-api with observation date and cost", async () => {
    const config = marketDataConfig(env())!;
    const { transport } = transportWith(payload);
    const result = await marketBacklinkGap(config, { domain: "exemple.fr", competitors: ["comp1.fr"] }, transport);
    expect(result).toMatchObject({ provider: "market-data", provenance: "partner-api", locale: "FR", observedAt: "2026-11-23T09:00:00.000Z", costUsd: 0.05 });
  });

  it("refuses an empty competitor list, the tenant domain as its own competitor, and more than five", async () => {
    const config = marketDataConfig(env())!;
    const { transport } = transportWith({});
    await expect(marketBacklinkGap(config, { domain: "exemple.fr", competitors: [] }, transport)).rejects.toThrow("Au moins un concurrent est requis");
    await expect(marketBacklinkGap(config, { domain: "exemple.fr", competitors: ["exemple.fr"] }, transport)).rejects.toThrow("propre concurrent");
    await expect(marketBacklinkGap(config, { domain: "exemple.fr", competitors: ["a.fr", "b.fr", "c.fr", "d.fr", "e.fr", "f.fr"] }, transport))
      .rejects.toThrow("5 concurrents maximum");
  });
});

describe("backlink disavow export (R5)", () => {
  it("builds a reviewable file from the tenant selection, deduped and www-stripped", () => {
    const file = backlinkDisavowFile({ domains: ["www.spam1.fr", "SPAM1.fr", " spam2.fr "], now: new Date("2026-11-23T12:00:00.000Z") });
    expect(file.filename).toBe("disavow-2026-11-23.txt");
    expect(file.count).toBe(2);
    expect(file.content.startsWith("#")).toBe(true);
    expect(file.content).toContain("sélection client");
    expect(file.content).toContain("domain: spam1.fr");
    expect(file.content).toContain("domain: spam2.fr");
    expect(file.content.match(/domain: spam1\.fr/g)?.length).toBe(1);
  });

  it("bounds the selection and refuses invalid domains", () => {
    expect(() => backlinkDisavowFile({ domains: [] })).toThrow("Au moins un domaine est requis");
    expect(() => backlinkDisavowFile({ domains: Array.from({ length: 201 }, (_, i) => `spam${i}.fr`) })).toThrow("200 domaines maximum");
    expect(() => backlinkDisavowFile({ domains: ["pas-un-domaine"] })).toThrow("Nom de domaine invalide.");
  });
});
