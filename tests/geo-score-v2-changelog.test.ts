import { describe, expect, it } from "vitest";
import { CATEGORY_WEIGHTS, GRID_VERSION } from "../src/geo/score/v2/rubric.js";
import type { ScoreGrid, V2Category } from "../src/geo/score/v2/rubric.js";
import { diffScoreGrids } from "../src/geo/score/v2/changelog.js";

const baseline: ScoreGrid = {
  version: GRID_VERSION,
  profile: "general",
  categoryWeights: CATEGORY_WEIGHTS,
  controls: (Object.keys(CATEGORY_WEIGHTS) as V2Category[]).map(category => ({
    id: `${category}.check`, category, title: category,
    definition: "Deterministic fixture", measurementMethod: "Fixture",
    expectedProof: "Fixture", maxPoints: CATEGORY_WEIGHTS[category],
    successThreshold: 1, fixType: "content", effort: "S",
  })),
};

describe("GEO v2 grid changelog", () => {
  const next = (): ScoreGrid => ({
    ...baseline,
    version: "v2.0.1",
    controls: baseline.controls.map(control => control.id === "robots.check"
      ? { ...control, definition: "Changed deterministic requirement" } : { ...control }),
  });

  it("reports exact control changes and editorial reasons", () => {
    const result = diffScoreGrids(baseline, next(), { "robots.check": "Clarify bot matching" });
    expect(result).toEqual({
      fromVersion: "v2.0.0",
      toVersion: "v2.0.1",
      changes: [{
        controlId: "robots.check", category: "robots",
        previousPoints: 14, nextPoints: 14, reason: "Clarify bot matching",
        kind: "redefined",
      }],
    });
  });

  it("refuses undocumented changes or silent same-version edits", () => {
    expect(() => diffScoreGrids(baseline, next(), {})).toThrow("Missing changelog reason");
    expect(() => diffScoreGrids(baseline, { ...next(), version: GRID_VERSION },
      { "robots.check": "Reason" })).toThrow("different semantic versions");
  });

  it("does not pretend a version-only update changed control points", () => {
    const result = diffScoreGrids(baseline, { ...baseline, version: "v2.1.0" }, {});
    expect(result.changes).toEqual([]);
  });
});
