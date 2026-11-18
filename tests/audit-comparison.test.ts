import { describe, it, expect } from "vitest";
import { runFreeRead, type FreeReadResult } from "../src/freeread/index.js";
import { compareAuditSnapshots } from "../src/audit-jobs/comparison.js";

const url = "https://benchmark.example/";
/** Same fetch shape as the PostgreSQL route tests: pages only, no robots.txt or sitemap. */
const snapshot = (body: string) => runFreeRead({
  url, fetcher: async target => target.endsWith("/robots.txt") || target.includes("sitemap")
    ? { url: target, status: 404, ok: false, headers: {}, body: "" }
    : { url, status: 200, ok: true, headers: {}, body },
});
const poor = "<html><head></head><body></body></html>";
const rich = `<html lang="fr"><head><title>Benchmark</title><meta name="description" content="Desc"><meta property="og:title" content="T"></head><body><h1>Benchmark</h1><h2>Section</h2><p>Texte</p><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script></body></html>`;

describe("Public audit snapshot comparison", () => {
  it("guards against missing snapshots and mismatching method or page", async () => {
    const current = await snapshot(rich);
    expect(compareAuditSnapshots(null, current)).toMatchObject({ status: "not_comparable", reason: "no_previous_snapshot" });
    const previousMethod = structuredClone(await snapshot(rich)) as FreeReadResult;
    previousMethod.report360.method = "geo-v1-public-page";
    expect(compareAuditSnapshots(previousMethod, current)).toMatchObject({ status: "not_comparable", reason: "method_mismatch" });
    const previousPage = structuredClone(await snapshot(rich)) as FreeReadResult;
    previousPage.finalUrl = "https://moved.example/";
    previousPage.report360.sourceUrl = "https://moved.example/";
    expect(compareAuditSnapshots(previousPage, current)).toMatchObject({ status: "not_comparable", reason: "scope_mismatch" });
    const previousStray = structuredClone(await snapshot(rich)) as FreeReadResult;
    previousStray.report360.scope = "domain" as unknown as FreeReadResult["report360"]["scope"];
    expect(compareAuditSnapshots(previousStray, current)).toMatchObject({ status: "not_comparable", reason: "scope_mismatch" });
  });

  it("compares matching snapshots through public outcomes only, never points or scores", async () => {
    const [before, after] = await Promise.all([snapshot(poor), snapshot(rich)]);
    const comparison = compareAuditSnapshots(before, after);
    expect(comparison.status).toBe("compared");
    if (comparison.status !== "compared") return;
    expect(comparison.method).toBe("geo-v2-public-evidence");
    expect(comparison.scope).toBe("single_public_url");
    expect(comparison.url).toBe(after.report360.sourceUrl);
    expect(comparison.gridVersion).toBe(after.geoV2.gridVersion);
    expect(comparison.previousObservedAt).toBe(before.report360.observedAt);
    expect(comparison.currentObservedAt).toBe(after.report360.observedAt);
    expect(comparison.summary).toEqual({ improved: 4, regressed: 0, unchanged: 36, newlyObserved: 2, newlyUnavailable: 0, newlyApplicable: 0, noLongerApplicable: 0 });
    expect(comparison.summary.improved + comparison.summary.regressed + comparison.summary.unchanged + comparison.summary.newlyObserved
      + comparison.summary.newlyUnavailable + comparison.summary.newlyApplicable + comparison.summary.noLongerApplicable).toBe(after.geoV2.controls.length);
    expect(comparison.controls.map(c => c.controlId).sort()).toEqual(["B01", "J01", "J02", "J06", "M01", "M02"]);
    expect(comparison.controls).toContainEqual({ controlId: "J01", title: expect.any(String), previousOutcome: "review", currentOutcome: "pass", change: "improved" });
    expect(comparison.controls).toContainEqual({ controlId: "B01", title: expect.any(String), previousOutcome: "unknown", currentOutcome: "pass", change: "newly_observed" });
    expect(comparison.controls.every(c => c.previousOutcome !== null || c.currentOutcome !== null)).toBe(true);
    expect(comparison.note).toContain("remain withheld");
    // The redaction contract is untouched: snapshots and coverage still withhold scores, and the stored report keeps comparison null.
    expect(after.geoV2.score).toBeNull();
    expect(after.report360.comparison).toBeNull();
  });

  it("reports resolved and new plan actions by stable id", async () => {
    const [before, after] = await Promise.all([snapshot(rich), snapshot(poor)]);
    const comparison = compareAuditSnapshots(before, after);
    expect(comparison.status).toBe("compared");
    if (comparison.status !== "compared") return;
    const previousIds = new Set(before.report360.actions.map(a => a.id)), currentIds = new Set(after.report360.actions.map(a => a.id));
    expect(comparison.actions.resolved.length).toBeGreaterThan(0);
    expect(comparison.actions.new.length).toBeGreaterThan(0);
    expect(comparison.actions.resolved.every(id => !currentIds.has(id))).toBe(true);
    expect(comparison.actions.new.every(id => currentIds.has(id) && !previousIds.has(id))).toBe(true);
    expect(comparison.actions.unchanged).toBe(after.report360.actions.filter(a => previousIds.has(a.id)).length);
    expect(comparison.actions.resolved.length + comparison.actions.new.length + comparison.actions.unchanged).toBe(new Set([...previousIds, ...currentIds]).size);
  });
});
