import { describe, expect, it } from "vitest";
import { bandColor, citabilityHeight, trajectorySeries, CHART } from "../src/report/charts.js";
import type { GeoAuditResult } from "../src/geo/types.js";
import type { CitabilityResult } from "../src/geo/citability.js";

function auditWith(score: number, points: number[]): GeoAuditResult {
  return {
    score,
    recommendations: points.map((value, index) => ({
      priority: "medium",
      category: "robots",
      checkId: `check.${index}`,
      points: value,
      action: "fix it",
    })),
  } as unknown as GeoAuditResult;
}

describe("report charts", () => {
  it("starts the trajectory at the audited score", () => {
    const series = trajectorySeries(auditWith(71, [3, 3, 2]));
    expect(series[0]).toEqual({ step: 0, score: 71 });
  });

  it("adds one point per recommendation, in order", () => {
    const series = trajectorySeries(auditWith(71, [3, 3, 2]));
    expect(series.map((point) => point.score)).toEqual([71, 74, 77, 79]);
    expect(series.map((point) => point.step)).toEqual([0, 1, 2, 3]);
  });

  it("ends exactly at score plus every recoverable point", () => {
    const points = [3, 3, 3, 2, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1];
    const series = trajectorySeries(auditWith(71, points));
    const total = points.reduce((sum, value) => sum + value, 0);
    expect(series.at(-1)?.score).toBe(71 + total);
    expect(series.at(-1)?.score).toBe(100);
  });

  it("keeps the curve monotonic — a fix never removes points", () => {
    const series = trajectorySeries(auditWith(60, [1, 4, 2, 3, 1]));
    for (let index = 1; index < series.length; index += 1) {
      expect(series[index].score).toBeGreaterThanOrEqual(series[index - 1].score);
    }
  });

  it("colours by the published band thresholds", () => {
    expect(bandColor(1)).toBe(CHART.green);
    expect(bandColor(0.8)).toBe(CHART.green);
    expect(bandColor(0.79)).toBe(CHART.amber);
    expect(bandColor(0.6)).toBe(CHART.amber);
    expect(bandColor(0.59)).toBe(CHART.red);
    expect(bandColor(0)).toBe(CHART.red);
  });

  it("sizes the citability grid from the method count", () => {
    const citability = { methods: new Array(12).fill({ points: 1, max: 3 }) } as unknown as CitabilityResult;
    expect(citabilityHeight(citability)).toBe(34 + 6 * 13);
    const short = { methods: new Array(4).fill({ points: 1, max: 3 }) } as unknown as CitabilityResult;
    expect(citabilityHeight(short)).toBe(34 + 2 * 13);
  });
});
