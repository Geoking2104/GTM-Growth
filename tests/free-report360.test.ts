import { describe, expect, it } from "vitest";
import { buildFreeReport360 } from "../src/freeread/report360.js";
import type { FreeReadEvidence } from "../src/freeread/evidence.js";
import { approvedV2Grid } from "../src/geo/score/v2/approved-grid.js";
import { calculateV2Coverage } from "../src/geo/score/v2/coverage.js";

const evidence = {
  observedAt: "2026-11-16T12:25:00.000Z",
  page: { url: "https://example.org/fr/", status: 200 },
} as FreeReadEvidence;

async function fixture() {
  const geoV2 = await calculateV2Coverage(approvedV2Grid(), { url: "https://example.org/fr/" }, [
    { controlId: "M01", status: "measured", earned: 0, proof: { type: "extract", value: "Missing HTML title", url: "https://example.org/fr/" } },
  ]);
  return {
    finalUrl: "https://example.org/fr/", httpStatus: 200, score: 42,
    checksSummary: { passed: 3, toImprove: 7, total: 10 },
    opportunities: [
      { checkId: "meta.x_robots_noindex", category: "meta", priority: "critical" as const, status: "fail" as const, points: 10, action: "Review noindex", evidence: "robots noindex" },
      { checkId: "schema.organization", category: "schema", priority: "high" as const, status: "partial" as const, points: 3, action: "Review entity", evidence: "Missing Organization schema" },
      { checkId: "content.words", category: "content", priority: "low" as const, status: "fail" as const, points: 2, action: "Review answers", evidence: "129 words" },
    ],
    socialProfiles: [{ platform: "LinkedIn", url: "https://linkedin.com/company/example", source: "schema" as const }],
    geoV2,
    pageSignals: { title: "", description: "Example summary", h1: ["My site"], h2: ["Products", "Contact"] },
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
  it("uses the approved v2 ledger and never turns unknown metrics into zero scores", async () => {
    const report = buildFreeReport360(await fixture());
    expect(report.schemaVersion).toBe(1);
    expect(report.method).toBe("geo-v2-public-evidence");
    expect(report.scope).toBe("single_public_url");
    expect(report.observedAt).toBe(evidence.observedAt);
    expect(report.comparison).toBeNull();
    expect(report.pillars.map(p => p.id)).toEqual(["seo", "geo", "ai", "crm", "social"]);
    expect(report.pillars.map(p => p.score)).toEqual([null, null, null, null, null]);
    expect(report.geoV2?.controls).toHaveLength(42);
    expect(report.geoV2?.unmeasuredControls).toHaveLength(41);
    expect(report.geoV2?.score).toBeNull();
    expect(JSON.stringify(report.geoV2)).not.toContain('"earned"');
    expect(JSON.stringify(report.geoV2)).not.toContain('"scoreRange"');
    expect(report.pillars.find(p => p.id === "geo")).toMatchObject({ coverage: "partial", observedChecks: 1, needsAttention: 1 });
    expect(report.sourcePreview).toMatchObject({ kind: "observed_html_reconstruction", heading: "My site", screenshotUrl: null });
    expect(report.pillars.find(p => p.id === "seo")).toMatchObject({ coverage: "measured", observedChecks: 3, needsAttention: 2 });
    expect(report.pillars.find(p => p.id === "crm")).toMatchObject({ coverage: "not_measured", observedCount: null });
    expect(report.pillars.find(p => p.id === "social")).toMatchObject({ coverage: "partial", observedCount: 1 });
    expect(report.unmeasured).toContain("ai_citations");
    expect(JSON.stringify(report)).not.toContain("99"); // illustrative GA4 row excluded
  });

  it("provides source-linked evidence only for measured failed v2 controls", async () => {
    const report = buildFreeReport360(await fixture());
    const title = report.actions.find(a => a.id === "seo.title");
    expect(title).toMatchObject({ kind: "observed_fix", priority: "high", points: null });
    expect(title?.proof).toMatchObject({
      id: "seo.meta:Title", sourceUrl: "https://example.org/fr/",
      observedAt: "2026-11-16T12:25:00.000Z", value: "missing", format: "html_observation",
    });
    const geo = report.actions.find(a => a.id === "geo.v2.M01");
    expect(geo).toMatchObject({ kind: "observed_fix", points: null, checkId: "M01" });
    expect(geo?.proof?.value).toBe("Missing HTML title");
    expect(geo?.proof?.sourceUrl).toBe("https://example.org/fr/");
    expect(report.actions.some(a => a.id === "geo.meta.x_robots_noindex")).toBe(false);
    expect(report.actions.filter(a => a.pillar === "geo" && a.kind === "observed_fix")).toHaveLength(1);
    expect(report.actions.some(a => a.id === "seo.canonical")).toBe(false);
    expect(report.actions.some(a => a.pillar === "crm" && a.kind === "observed_fix")).toBe(false);
    expect(report.actions.filter(a => a.kind === "next_step")).toHaveLength(3);
    expect(report.actions.filter(a => a.kind === "next_step").every(a => a.proof === null && a.points === null)).toBe(true);
  });

  it("records zero outbound links as a valid page observation, not zero social impact", async () => {
    const report = buildFreeReport360({ ...await fixture(), socialProfiles: [] });
    const social = report.pillars.find(p => p.id === "social");
    expect(social).toMatchObject({ observedCount: 0, score: null, coverage: "partial" });
    expect(social?.missing).toContain("inbound_links");
  });
});
