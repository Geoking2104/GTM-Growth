import { describe, expect, it } from "vitest";
import { clusterQueries, ctrForPosition, losingPages, scoreOpportunities, seoBudget, seoRoi, tokens, trafficValue } from "../src/console/keywords.js";

const rows = [
  { keys: ["audit seo gratuit", "https://ex.fr/audit"], clicks: 10, impressions: 2000, position: 7.2 },
  { keys: ["audit seo en ligne", "https://ex.fr/audit"], clicks: 5, impressions: 900, position: 9 },
  { keys: ["prix logiciel crm", "https://ex.fr/crm"], clicks: 40, impressions: 300, position: 2 },
  { keys: ["rare", "https://ex.fr/x"], clicks: 0, impressions: 3, position: 40 },
];

describe("keyword opportunities", () => {
  it("has a decreasing CTR curve", () => {
    expect(ctrForPosition(1)).toBeGreaterThan(ctrForPosition(3));
    expect(ctrForPosition(10)).toBeGreaterThan(ctrForPosition(15));
    expect(ctrForPosition(50)).toBe(0.003);
  });
  it("ranks striking-distance queries first and drops low-impression rows", () => {
    const opps = scoreOpportunities(rows);
    expect(opps[0].query).toBe("audit seo gratuit");
    expect(opps[0].score).toBe(100);
    expect(opps.find((o) => o.query === "rare")).toBeUndefined();
  });
  it("clusters related queries", () => {
    expect(tokens("Les audits SEO à Paris")).toEqual(["audit", "seo", "pari"]);
    const clusters = clusterQueries(scoreOpportunities(rows));
    expect(clusters[0].queries).toEqual(["audit seo gratuit", "audit seo en ligne"]);
    expect(clusters).toHaveLength(2);
  });
  it("finds pages losing clicks", () => {
    const out = losingPages([{ keys: ["/a"], clicks: 5 }, { keys: ["/b"], clicks: 50 }], [{ keys: ["/a"], clicks: 20 }, { keys: ["/b"], clicks: 10 }, { keys: ["/c"], clicks: 4 }]);
    expect(out.map((p) => p.page)).toEqual(["/a", "/c"]);
    expect(out[0].deltaPercent).toBe(-75);
  });
  it("computes calculators", () => {
    expect(trafficValue({ clicks: 100, cpc: 2 }).monthlyValue).toBe(200);
    const roi = seoRoi({ monthlyTraffic: 1000, conversionRate: 2, averageOrderValue: 100, monthlyCost: 1000 });
    expect(roi.revenue).toBe(2000);
    expect(roi.roiPercent).toBe(100);
    expect(roi.breakEvenTraffic).toBe(500);
    expect(seoBudget({ targetRevenue: 1000, conversionRate: 1, averageOrderValue: 50, costPerVisit: 0.5 })).toEqual({ conversionsNeeded: 20, trafficNeeded: 2000, monthlyBudget: 1000 });
  });
});
