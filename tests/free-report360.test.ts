import { describe, expect, it } from "vitest";
import { buildFreeReport360 } from "../src/freeread/report360.js";
import type { FreeReadEvidence } from "../src/freeread/evidence.js";

const evidence = {
  observedAt: "2026-11-16T12:25:00.000Z",
  page: { url: "https://example.org/fr/", status: 200 },
} as FreeReadEvidence;

function fixture() {
  return {
    finalUrl: "https://example.org/fr/", httpStatus: 200, score: 42,
    checksSummary: { passed: 3, toImprove: 7, total: 10 },
    opportunities: [
      { checkId: "meta.x_robots_noindex", category: "meta", priority: "critical" as const, status: "fail" as const, points: 10, action: "Review noindex", evidence: "robots noindex" },
      { checkId: "schema.organization", category: "schema", priority: "high" as const, status: "partial" as const, points: 3, action: "Review entity", evidence: "Missing Organization schema" },
      { checkId: "content.words", category: "content", priority: "low" as const, status: "fail" as const, points: 2, action: "Review answers", evidence: "129 words" },
    ],
    socialProfiles: [{ platform: "LinkedIn", url: "https://linkedin.com/company/example", source: "schema" as const }],
    evidence,
    tables: [
      { id: "seo.meta", title: "SEO", rows: [
        { label: "Title", value: "missing", status: "fail" as const, note: "No title" },
        { label: "Canonical", value: "https://example.org/fr/", status: "pass" as const },
        { label: "hreflang", value: "0 alternate(s)", status: "info" as const },
      ] },
      { id: "seo.technical", title: "SEO links", rows: [
        { label: "Images without alt", value: "2", status: "warn" as const, note: "2 of 3" },
      ] },
      { id: "ga4.traffic", title: "Illustrative", sample: true, rows: [
        { label: "Conversions", value: "99", status: "fail" as const },
      ] },
    ],
  };
}

describe("versioned public 360 report", () => {
  it("uses real public observations and never turns unknown metrics into zero scores", () => {
    const report = buildFreeReport360(fixture());
    expect(report.schemaVersion).toBe(1);
    expect(report.method).toBe("geo-v1-public-page");
    expect(report.scope).toBe("single_public_url");
    expect(report.observedAt).toBe(evidence.observedAt);
    expect(report.comparison).toBeNull();
    expect(report.pillars.map(p => p.id)).toEqual(["seo", "geo", "ai", "crm", "social"]);
    expect(report.pillars.map(p => p.score)).toEqual([null, 42, null, null, null]);
    expect(report.pillars.find(p => p.id === "seo")).toMatchObject({ coverage: "measured", observedChecks: 3, needsAttention: 2 });
    expect(report.pillars.find(p => p.id === "crm")).toMatchObject({ coverage: "not_measured", observedCount: null });
    expect(report.pillars.find(p => p.id === "social")).toMatchObject({ coverage: "partial", observedCount: 1 });
    expect(report.unmeasured).toContain("ai_citations");
    expect(JSON.stringify(report)).not.toContain("99"); // illustrative GA4 row excluded
  });

  it("provides reproducible, source-linked proofs only for actual checked issues", () => {
    const report = buildFreeReport360(fixture());
    const title = report.actions.find(a => a.id === "seo.title");
    expect(title).toMatchObject({ kind: "observed_fix", priority: "high", points: null });
    expect(title?.proof).toMatchObject({
      id: "seo.meta:Title", sourceUrl: "https://example.org/fr/",
      observedAt: "2026-11-16T12:25:00.000Z", value: "missing", format: "html_observation",
    });
    const geo = report.actions.find(a => a.id === "geo.meta.x_robots_noindex");
    expect(geo).toMatchObject({ kind: "observed_fix", points: 10 });
    expect(geo?.proof?.value).toBe("robots noindex");
    expect(report.actions.some(a => a.id === "seo.canonical")).toBe(false);
    expect(report.actions.some(a => a.pillar === "crm" && a.kind === "observed_fix")).toBe(false);
    expect(report.actions.filter(a => a.kind === "next_step")).toHaveLength(3);
    expect(report.actions.filter(a => a.kind === "next_step").every(a => a.proof === null && a.points === null)).toBe(true);
  });

  it("records zero outbound links as a valid page observation, not zero social impact", () => {
    const report = buildFreeReport360({ ...fixture(), socialProfiles: [] });
    const social = report.pillars.find(p => p.id === "social");
    expect(social).toMatchObject({ observedCount: 0, score: null, coverage: "partial" });
    expect(social?.missing).toContain("inbound_links");
  });
});
