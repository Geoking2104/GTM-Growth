import { afterEach, describe, expect, it, vi } from "vitest";
import { marketDataRoutes, proposedLocalSeoObservation } from "../src/console/market-data.js";
import { observationSchema } from "../src/local-seo/model.js";
import { LOCAL_GRID_DEPTH, MARKET_DATA_PROVENANCE, PROVIDER_NAME } from "../src/market/provider.js";
import type { HandlerContext } from "../src/console/util.js";

const ctx = (body: Record<string, unknown>, tenancy?: Partial<HandlerContext["tenancy"]>): HandlerContext =>
  ({ url: "/api/console", body, tenancy: tenancy as HandlerContext["tenancy"] });

const transportWith = (payload: Record<string, unknown>) => {
  const bodies: unknown[] = [];
  const transport = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as typeof fetch;
  return { bodies, transport };
};

const enable = () => {
  vi.stubEnv("MARKET_DATA_ENABLED", "true");
  vi.stubEnv("MARKET_DATA_API_URL", "https://bridge.example/");
  vi.stubEnv("MARKET_DATA_API_LOGIN", "login@example");
  vi.stubEnv("MARKET_DATA_API_PASSWORD", "secret");
};

afterEach(() => vi.unstubAllEnvs());

const byPath = (routes: ReturnType<typeof marketDataRoutes>, path: string) => routes.find((route) => route.path === path)!;

describe("market-data console routes (R4)", () => {
  it("serves the bridge badge for free, disabled-honest, without admin rights", async () => {
    const routes = marketDataRoutes();
    const badge = byPath(routes, "/market/config");
    expect(badge.adminOnly).toBeFalsy();
    expect(badge.needsUrl).toBe(false);
    expect(await badge.handler(ctx({}))).toEqual({ provider: PROVIDER_NAME, enabled: false, locales: [], provenance: MARKET_DATA_PROVENANCE });
  });

  it("keeps every partner call administrator-only and refuses a disabled bridge", async () => {
    const routes = marketDataRoutes();
    for (const path of ["/market/volumes", "/market/serp", "/market/grid"]) {
      expect(byPath(routes, path).adminOnly).toBe(true);
      await expect(byPath(routes, path).handler(ctx({}))).rejects.toThrow(/MARKET_DATA_ENABLED/);
    }
  });

  it("accepts a grid geometry or explicit points, never both", async () => {
    enable();
    const { bodies, transport } = transportWith({ points: [{ rank: 1 }, { rank: 3 }, { rank: null }, { rank: 4 }] });
    const routes = marketDataRoutes(transport);
    const geometry = await byPath(routes, "/market/grid").handler(ctx({
      keyword: "plombier paris",
      geometry: { latitude: 48.8566, longitude: 2.3522, columns: 2, rows: 2, distanceKm: 2 },
    })) as unknown as { results: Array<{ id: string }> };
    expect(geometry.results).toHaveLength(4);
    expect(geometry.results.map((point) => point.id)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(bodies[0]).toMatchObject({ keyword: "plombier paris", locale: "FR", device: "mobile", grid: [{ id: "r0c0" }, { id: "r0c1" }, { id: "r1c0" }, { id: "r1c1" }] });

    const points = await byPath(routes, "/market/grid").handler(ctx({
      keyword: "plombier paris",
      points: [{ latitude: 48.85, longitude: 2.35 }, { latitude: 48.86, longitude: 2.36 }],
    })) as unknown as { results: Array<{ id: string }> };
    expect(points.results).toHaveLength(2);
    expect((bodies[1] as { grid: Array<{ latitude: number }> }).grid[0].latitude).toBe(48.85);

    await expect(byPath(routes, "/market/grid").handler(ctx({
      keyword: "plombier paris",
      geometry: { latitude: 48.8566, longitude: 2.3522, columns: 2, rows: 2, distanceKm: 2 },
      points: [{ latitude: 48.85, longitude: 2.35 }],
    }))).rejects.toThrow();
    await expect(byPath(routes, "/market/grid").handler(ctx({ keyword: "plombier paris" }))).rejects.toThrow();
  });

  it("marks tenant positions inside a partner SERP with the same host match as tracked rankings", async () => {
    enable();
    const { transport } = transportWith({
      organic_results: [
        { position: 1, link: "https://other.example/", title: "A" },
        { position: 2, link: "https://www.acme.fr/services", title: "B" },
        { position: 3, link: "https://shop.acme.fr/", title: "C" },
      ],
    });
    const routes = marketDataRoutes(transport);
    const serp = await byPath(routes, "/market/serp").handler(ctx({ keyword: "crm pme" }, {
      tenant: { id: "acme", name: "Acme", mode: "organization", issuer: "https://sso.example/", domains: ["acme.fr"], emailDomains: [], gscProperties: [] },
      role: "tenant-admin", platformAdmin: false, memberships: [],
    }));
    expect(serp).toMatchObject({ tenantRank: 2, tenantUrl: "https://www.acme.fr/services", provider: PROVIDER_NAME });
  });

  it("proposes a Global & local SEO observation that the importer of record re-validates as-is", () => {
    const result = {
      keyword: "plombier paris", locale: "FR", device: "mobile" as const,
      observedAt: "2026-11-23T10:00:00.000Z",
      results: [
        { id: "p0", latitude: 48.85, longitude: 2.35, rank: 2, status: "found" as const },
        { id: "p1", latitude: 48.86, longitude: 2.36, rank: null, status: "not-found" as const },
      ],
    };
    const proposal = proposedLocalSeoObservation("site-1", result);
    expect(proposal.observation).toMatchObject({
      siteId: "site-1", source: `${PROVIDER_NAME} (${MARKET_DATA_PROVENANCE})`, method: "partner-local-grid",
      country: "FR", surface: "maps", query: "plombier paris", device: "mobile", depth: LOCAL_GRID_DEPTH, identity: "partner-grid-v1",
    });
    expect(proposal.observation.points).toEqual([
      { id: "p0", latitude: 48.85, longitude: 2.35, status: "found", rank: 2 },
      { id: "p1", latitude: 48.86, longitude: 2.36, status: "not-found" },
    ]);
    expect(observationSchema.safeParse(proposal.observation).success).toBe(true);
  });

  it("returns the observation proposal only when the administrator names the site", async () => {
    enable();
    const { transport } = transportWith({ points: [{ rank: 1 }] });
    const routes = marketDataRoutes(transport);
    const body = { keyword: "plombier paris", points: [{ latitude: 48.85, longitude: 2.35 }] };
    const anonymous = await byPath(routes, "/market/grid").handler(ctx(body));
    expect(anonymous).not.toHaveProperty("observation");
    const declared = await byPath(routes, "/market/grid").handler(ctx({ ...body, siteId: "site-1" }));
    expect(declared).toHaveProperty("observation");
  });
});
