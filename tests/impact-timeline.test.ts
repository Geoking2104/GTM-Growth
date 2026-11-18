import { describe, it, expect } from "vitest";
import { runFreeRead, type FreeReadResult } from "../src/freeread/index.js";
import { buildImpactTimeline, TIMELINE_NOTE } from "../src/impact/timeline.js";
import { planFollowUps, FOLLOW_UP_NOTE } from "../src/impact/follow-ups.js";

const url = "https://benchmark.example/";
/** Same fetch shape as the PostgreSQL route tests: pages only, no robots.txt or sitemap. */
const snapshot = (body: string) => runFreeRead({
  url, fetcher: async target => target.endsWith("/robots.txt") || target.includes("sitemap")
    ? { url: target, status: 404, ok: false, headers: {}, body: "" }
    : { url, status: 200, ok: true, headers: {}, body },
});
const poor = "<html><head></head><body></body></html>";
const rich = `<html lang="fr"><head><title>Benchmark</title><meta name="description" content="Desc"><meta property="og:title" content="T"></head><body><h1>Benchmark</h1><h2>Section</h2><p>Texte</p><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script></body></html>`;

/** Clone with an explicit observation date so steps stay deterministic. */
const observed = (result: FreeReadResult, observedAt: string): FreeReadResult => {
  const copy = structuredClone(result) as FreeReadResult;
  copy.report360.observedAt = observedAt;
  return copy;
};
/** Force every control to measured so coverage is 1.00 (pure test data). */
const fullyMeasured = (result: FreeReadResult): FreeReadResult => {
  const copy = structuredClone(result) as FreeReadResult;
  for (const control of copy.geoV2.controls) control.status = "measured";
  return copy;
};
/** Force a measured fraction so coverage stays partial. */
const partiallyMeasured = (result: FreeReadResult, fraction: number): FreeReadResult => {
  const copy = structuredClone(result) as FreeReadResult;
  const measured = Math.floor(copy.geoV2.controls.length * fraction);
  copy.geoV2.controls.forEach((control, index) => { control.status = index < measured ? "measured" : "unknown"; });
  return copy;
};

describe("Impact timeline per scope", () => {
  it("refuses to assemble a timeline without comparable observations, but still plans the reminders of the latest one", async () => {
    const empty = buildImpactTimeline([], url);
    expect(empty.status).toBe("insufficient_observations");
    expect((empty as { observationCount: number }).observationCount).toBe(0);
    const single = buildImpactTimeline([await snapshot(rich)], url);
    expect(single.status).toBe("insufficient_observations");
    expect(single.followUps).toHaveLength(2);
    expect(single.followUps[0].label).toBe("J+14");
    expect(single.followUps[1].label).toBe("J+28");
  });

  it("refuses snapshots from another page: a timeline is per scope and never crosses clients", async () => {
    const first = await snapshot(rich);
    const stray = structuredClone(first) as FreeReadResult;
    stray.finalUrl = "https://other.example/";
    stray.report360.sourceUrl = "https://other.example/";
    expect(buildImpactTimeline([first, stray], url)).toMatchObject({ status: "scope_mismatch" });
  });

  it("builds consecutive-pair steps with explicit high confidence and per-step counters only", async () => {
    const base = fullyMeasured(await snapshot(rich));
    const timeline = buildImpactTimeline([
      observed(base, "2026-09-01T09:00:00Z"),
      observed(structuredClone(base) as FreeReadResult, "2026-09-22T09:00:00Z"),
      observed(structuredClone(base) as FreeReadResult, "2026-10-13T09:00:00Z"),
    ], url);
    expect(timeline.status).toBe("timeline");
    if (timeline.status !== "timeline") return;
    expect(timeline.observationCount).toBe(3);
    expect(timeline.steps).toHaveLength(2);
    expect(timeline.steps[0]).toMatchObject({
      previousObservedAt: "2026-09-01T09:00:00Z",
      currentObservedAt: "2026-09-22T09:00:00Z",
      intervalDays: 21,
      confidence: "high",
    });
    expect(timeline.steps[0].confidenceReasons).toContain("comparable_pair");
    expect(timeline.steps[0].confidenceReasons).toContain("same_grid_version");
    expect(JSON.stringify(timeline.steps[0].confidenceReasons)).toContain("interval_days_21");
    expect(timeline.steps[0].measuredCoverage).toEqual({ previous: 1, current: 1 });
    // Anti-summing: no key totals counters across steps, scopes or clients ("summary" is one pair's own counters).
    expect(JSON.stringify(timeline)).not.toMatch(/"total[A-Za-z_]*":/i);
    expect(JSON.stringify(timeline)).not.toMatch(/"sum(?!mary)[A-Za-z_]*":/i);
    expect(timeline.note).toContain(TIMELINE_NOTE.split(".")[0]);
  });

  it("caps confidence at low when the grid version changed between two steps", async () => {
    const base = fullyMeasured(await snapshot(rich));
    const future = structuredClone(base) as FreeReadResult;
    future.geoV2.gridVersion = `${future.geoV2.gridVersion}-next`;
    const timeline = buildImpactTimeline([observed(base, "2026-09-01T09:00:00Z"), observed(future, "2026-09-22T09:00:00Z")], url);
    expect(timeline.status).toBe("timeline");
    if (timeline.status !== "timeline") return;
    expect(timeline.steps[0].confidence).toBe("low");
    expect(timeline.steps[0].confidenceReasons).toContain("grid_version_changed");
    expect(timeline.steps[0].comparison.status).toBe("compared");
  });

  it("keeps a non-comparable pair in the timeline with an explicit reason, never guessing impact", async () => {
    const before = fullyMeasured(await snapshot(rich));
    const previousMethod = observed(before, "2026-09-01T09:00:00Z");
    previousMethod.report360.method = "geo-v1-public-page";
    const timeline = buildImpactTimeline([previousMethod, observed(structuredClone(before) as FreeReadResult, "2026-09-22T09:00:00Z")], url);
    expect(timeline.status).toBe("timeline");
    if (timeline.status !== "timeline") return;
    expect(timeline.steps[0].comparison).toMatchObject({ status: "not_comparable", reason: "method_mismatch" });
    expect(timeline.steps[0].confidence).toBe("low");
    expect(timeline.steps[0].confidenceReasons).toContain("pair_not_comparable");
  });

  it("caps confidence when the observation window is too short or the interval too long", async () => {
    const base = fullyMeasured(await snapshot(rich));
    const tooShort = buildImpactTimeline([
      observed(base, "2026-09-01T09:00:00Z"),
      observed(structuredClone(base) as FreeReadResult, "2026-09-01T11:00:00Z"),
    ], url);
    expect(tooShort.status).toBe("timeline");
    if (tooShort.status !== "timeline") return;
    expect(tooShort.steps[0].confidence).toBe("low");
    expect(tooShort.steps[0].confidenceReasons).toContain("confidence_capped_window_too_short");

    const tooLong = buildImpactTimeline([
      observed(base, "2025-01-01T09:00:00Z"),
      observed(structuredClone(base) as FreeReadResult, "2026-09-01T09:00:00Z"),
    ], url);
    if (tooLong.status !== "timeline") throw new Error("expected a timeline");
    expect(tooLong.steps[0].confidence).toBe("low");
    expect(tooLong.steps[0].confidenceReasons).toContain("confidence_capped_interval_over_365_days");
  });

  it("limits confidence to medium when the measured coverage is partial", async () => {
    const before = partiallyMeasured(await snapshot(poor), 0.3);
    const after = partiallyMeasured(structuredClone(await snapshot(poor)) as FreeReadResult, 0.3);
    const timeline = buildImpactTimeline([observed(before, "2026-09-01T09:00:00Z"), observed(after, "2026-09-22T09:00:00Z")], url);
    expect(timeline.status).toBe("timeline");
    if (timeline.status !== "timeline") return;
    expect(timeline.steps[0].confidence).toBe("medium");
    expect(timeline.steps[0].confidenceReasons).toContain("confidence_limited_partial_coverage");
  });

  it("derives J+14 and J+28 from the latest observation, bilingual, without any autonomous action", async () => {
    const base = fullyMeasured(await snapshot(rich));
    const now = new Date("2026-11-20T12:00:00Z");
    const timeline = buildImpactTimeline([
      observed(base, "2026-09-01T09:00:00Z"),
      observed(structuredClone(base) as FreeReadResult, "2026-10-13T09:00:00Z"),
    ], url, now);
    if (timeline.status !== "timeline") throw new Error("expected a timeline");
    expect(timeline.latestObservedAt).toBe("2026-10-13T09:00:00Z");
    expect(timeline.followUps).toHaveLength(2);
    const [j14, j28] = timeline.followUps;
    expect(j14.dueAt).toBe("2026-10-27T00:00:00.000Z");
    expect(j14.status).toBe("due");
    expect(j28.dueAt).toBe("2026-11-10T00:00:00.000Z");
    expect(j28.status).toBe("due");
    expect(j14.suggestion.fr).toContain("marque blanche");
    expect(j28.suggestion.en.toLowerCase()).toContain("white-label");
    expect(timeline.note).toContain(FOLLOW_UP_NOTE.split(".")[0]);

    const followUps = planFollowUps("2026-10-13T09:00:00Z", new Date("2026-10-20T12:00:00Z"));
    if (!followUps) throw new Error("expected a plan");
    expect(followUps.map(f => f.status)).toEqual(["upcoming", "upcoming"]);
    expect(planFollowUps("not a date")).toBeNull();
    expect(planFollowUps(undefined)).toBeNull();
  });
});
