import { describe, expect, it } from "vitest";
import { accessProblem, bingDate, bingPerformance, delta, ga4Overview, periodOf, searchPerformance } from "../src/console/analytics.js";
import { tenantOwnsBingSite, tenantOwnsGa4, type Tenant } from "../src/tenants/store.js";

describe("periods and deltas", () => {
  it("builds equal-length current and previous periods", () => {
    const p = periodOf(28, 3, Date.UTC(2026, 10, 4));
    expect(p).toEqual({ start: "2026-10-05", end: "2026-11-01", prevStart: "2026-09-07", prevEnd: "2026-10-04", days: 28 });
    expect(delta(120, 100)).toBe(20);
    expect(delta(5, 0)).toBeNull();
  });
});

describe("Search Console performance", () => {
  it("returns totals, deltas, trend and every breakdown", async () => {
    const calls: string[][] = [];
    const fake = async (a: any) => {
      calls.push(a.dimensions);
      const d = a.dimensions[0];
      if (!d) return { rows: [{ clicks: a.startDate < "2026" ? 0 : 50, impressions: 1000, ctr: 0.05, position: 7 }] } as any;
      return { rows: [{ keys: [d === "date" ? "2026-10-01" : `${d}-1`], clicks: 10, impressions: 100, ctr: 0.1, position: 3 }] } as any;
    };
    const d: any = await searchPerformance({ property: "sc-domain:acme.fr", days: 28 }, fake as any);
    expect(d.totals.clicks).toBe(50);
    expect(d.queries[0]).toMatchObject({ query: "query-1", clicks: 10 });
    expect(d.pages[0].page).toBe("page-1");
    expect(d.devices[0].device).toBe("device-1");
    expect(d.countries[0].country).toBe("country-1");
    expect(d.trend[0].date).toBe("2026-10-01");
    expect(calls.map((c) => c.join(","))).toEqual(expect.arrayContaining(["", "date", "query", "page", "device", "country", "searchAppearance"]));
  });
  it("turns a 403 into a grant-access problem", async () => {
    process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com" });
    const d: any = await searchPerformance({ property: "sc-domain:acme.fr" }, (async () => { throw Object.assign(new Error("User does not have sufficient permission"), { code: 403 }); }) as any);
    expect(d.problem.state).toBe("no-access");
    expect(d.problem.grantEmail).toBe("sa@p.iam.gserviceaccount.com");
    delete process.env.GOOGLE_CREDENTIALS_JSON;
    expect(accessProblem(new Error("x"), "ga4", "1").state).toBe("no-credentials");
  });
  it("asks for configuration without a property", async () => {
    expect(((await searchPerformance({})) as any).problem.state).toBe("not-configured");
  });
});

describe("GA4 overview", () => {
  it("maps totals and breakdowns", async () => {
    const fake = async (p: any) => ({ rows: p.dimensions.length ? [{ [p.dimensions[0]]: p.dimensions[0] === "date" ? "20261001" : "x", sessions: "12", keyEvents: "2" }] : [{ sessions: "100", totalUsers: "80", keyEvents: "4", engagementRate: "0.6" }] });
    const d: any = await ga4Overview({ ga4Property: "properties/123456", days: 7 }, fake as any);
    expect(d.propertyId).toBe("123456");
    expect(d.totals.sessions).toBe(100);
    expect(d.trend[0].date).toBe("2026-10-01");
    for (const k of ["channels", "sources", "pages", "landingPages", "devices", "countries", "events"]) expect(d[k][0].sessions).toBe(12);
  });
});

describe("Bing Webmaster", () => {
  it("aggregates weekly rows within the period", async () => {
    const now = Date.now();
    const at = (daysAgo: number) => `/Date(${now - daysAgo * 86_400_000}-0000)/`;
    const f = async (u: string) => {
      const m = /json\/(\w+)/.exec(u)![1];
      expect(u).toContain("apikey=k");
      const d = m === "GetRankAndTrafficStats" ? [{ Date: at(3), Clicks: 5, Impressions: 50 }, { Date: at(40), Clicks: 1, Impressions: 10 }]
        : [{ Date: at(3), Query: m === "GetQueryStats" ? "dpe" : "https://acme.fr/", Clicks: 2, Impressions: 20, AvgImpressionPosition: 4 }, { Date: at(10), Query: m === "GetQueryStats" ? "dpe" : "https://acme.fr/", Clicks: 1, Impressions: 20, AvgImpressionPosition: 6 }];
      return new Response(JSON.stringify({ d }), { status: 200 });
    };
    process.env.BING_WEBMASTER_API_KEY = "k";
    const d: any = await bingPerformance({ bingSite: "https://acme.fr/", days: 28 }, undefined, f);
    delete process.env.BING_WEBMASTER_API_KEY;
    expect(d.totals.clicks).toBe(5);
    expect(d.previous.clicks).toBe(1);
    expect(d.queries[0]).toMatchObject({ query: "dpe", clicks: 3, impressions: 40, position: 5 });
    expect(d.pages[0].page).toBe("https://acme.fr/");
    expect(bingDate("/Date(0)/")).toBe("1970-01-01");
  });
  it("needs a key", async () => {
    expect(((await bingPerformance({ bingSite: "https://acme.fr/" }, undefined)) as any).problem.state).toBe("not-configured");
  });
});

describe("tenant scoping of GA4 / Bing", () => {
  const t = { id: "acme", domains: ["acme.fr"], ga4Properties: ["123456"], bingSites: [] } as unknown as Tenant;
  it("only allows the tenant's properties and sites", () => {
    expect(tenantOwnsGa4(t, "properties/123456")).toBe(true);
    expect(tenantOwnsGa4(t, "999999")).toBe(false);
    expect(tenantOwnsBingSite(t, "https://www.acme.fr/")).toBe(true);
    expect(tenantOwnsBingSite(t, "https://globex.com/")).toBe(false);
  });
});
