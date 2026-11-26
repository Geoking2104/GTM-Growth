import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { parseHTML } from "linkedom";
import { auditSeries, dashboardMetrics, outcomeChart, sitemapActivity, trendPanel } from "../site/read-dashboard.js";

const report = { score: 80, total: 10, passed: 8 };
const sample = (url: string, day: number, measured: number, version = "2") => ({
  finalUrl: url,
  report360: { observedAt: new Date(Date.UTC(2026, 9, day)).toISOString() },
  geoV2: { gridVersion: version, status: "incomplete", controls: Array.from({ length: 42 }, (_, index) => ({
    status: index < measured ? "measured" : index === 41 ? "not_applicable" : "unknown",
    outcome: index < measured ? "review" : index === 41 ? "not_applicable" : "unknown",
  })) },
});

beforeEach(() => {
  vi.stubGlobal("document", parseHTML("<html></html>").document);
  const storage: Record<string,string> = {};
  Object.defineProperties(storage, {
    setItem: { value: (k: string, v: string) => { storage[k] = v; } },
    getItem: { value: (k: string) => storage[k] ?? null },
    removeItem: { value: (k: string) => { delete storage[k]; } },
  });
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("public audit dashboard", () => {
  it("separates resolved or excluded checks from checks that passed", () => {
    const payload = sample("https://example.org/shop", 1, 20);
    const cards = dashboardMetrics(report, payload, "en");
    expect(cards.querySelector(".read-geo .read-value")?.textContent).toBe("50%");
    expect(cards.querySelector(".read-pending .read-value")?.textContent).toBe("50%");
    expect(outcomeChart(payload.geoV2.controls, "en")?.querySelector(".read-legend li b")?.textContent).toBe("0");
    expect(dashboardMetrics(report, null, "en").querySelector(".read-geo .read-value")?.textContent).toBe("—");
  });
  it("compares distinct server readings for the same page and grid, deduplicating replays", async () => {
    const first = sample("https://example.org/shop", 1, 20);
    const next = sample("https://example.org/shop", 2, 22);
    expect(await auditSeries(first)).toHaveLength(1);
    const series = await auditSeries(next);
    expect(series.map((p: {resolved: number}) => p.resolved)).toEqual([21, 23]);
    expect(await auditSeries(next)).toHaveLength(2);
    expect(await auditSeries(first)).toHaveLength(1);
    expect(trendPanel(series, "fr").querySelector("polyline")).not.toBeNull();
    expect(trendPanel(series, "fr").textContent).toContain("+5 pts");
    expect(await auditSeries(sample("https://example.org/other", 3, 21))).toHaveLength(1);
    expect(await auditSeries(sample(first.finalUrl, 3, 20, "3"))).toHaveLength(1);
  });
  it("plots monthly lastmod counts for the mapped URLs and rejects missing or future dates", () => {
    const nodes = ["2026-10-01", "2026-08-02", null, "bad", "2027-01-01"].map(lastmod => ({lastmod}));
    const panel = sitemapActivity({nodes}, "2026-10-03", "en");
    expect([...panel!.querySelectorAll(".read-month b")].map(n=>n.textContent)).toEqual(["0","0","0","1","0","1"]);
    expect(panel!.textContent).toContain("2/5");
    expect(sitemapActivity({nodes: []}, "2026-10-03", "en")).toBeNull();
  });
});
