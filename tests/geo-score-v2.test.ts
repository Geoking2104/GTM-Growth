import { describe, expect, it } from "vitest";
import { calculateV2Score, canonicalJson } from "../src/geo/score/v2/calculate.js";
import type { ObservedControl } from "../src/geo/score/v2/calculate.js";
import { CATEGORY_WEIGHTS, GRID_VERSION, validateGrid } from "../src/geo/score/v2/rubric.js";
import type { ScoreGrid, V2Category } from "../src/geo/score/v2/rubric.js";

const categories = Object.keys(CATEGORY_WEIGHTS) as V2Category[];
const grid: ScoreGrid = {
  version: GRID_VERSION,
  profile: "general",
  categoryWeights: CATEGORY_WEIGHTS,
  // Contract fixtures only: real control allocations will be introduced in 0.1-B.
  controls: categories.map((category) => ({
    id: `${category}.fixture`, category, title: `Test ${category}`,
    definition: "Fixture control", measurementMethod: "Fixture input",
    expectedProof: "Fixture URL", maxPoints: CATEGORY_WEIGHTS[category],
    successThreshold: 1, fixType: "content", effort: "S" as const,
  })),
};

const observations = (seed: number): ObservedControl[] => grid.controls.map((control, index) => ({
  controlId: control.id,
  earned: (seed + index) % (control.maxPoints + 1),
  proof: { type: "extract", value: `fixture ${seed}-${index}`, url: `proof://fixture/${index}` },
}));

describe("GEO Score v2 core contracts", () => {
  it("allocates precisely 100 points across eight approved categories", () => {
    expect(Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(categories).toHaveLength(8);
    expect(() => validateGrid(grid)).not.toThrow();
  });

  it("is deterministic across 20 distinct fixture snapshots", async () => {
    for (let seed = 0; seed < 20; seed++) {
      const input = { url: `https://example${seed}.com`, html: `<h1>${seed}</h1>`, resources: { robots: "ok" } };
      const data = observations(seed);
      const first = await calculateV2Score(grid, input, data);
      const second = await calculateV2Score(grid, { resources: { robots: "ok" }, html: `<h1>${seed}</h1>`, url: `https://example${seed}.com` }, [...data].reverse());
      expect(second).toEqual(first);
      expect(first.score).toBe(Object.values(first.scoreByCategory).reduce((a, b) => a + b, 0));
      expect(first.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
      expect(first.auditHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("changes the audit hash if the grid changes, but keeps the snapshot hash", async () => {
    const old = await calculateV2Score(grid, { html: "same" }, observations(1));
    const changed: ScoreGrid = { ...grid, version: "v2.0.1" };
    const next = await calculateV2Score(changed, { html: "same" }, observations(1));
    expect(old.snapshotHash).toBe(next.snapshotHash);
    expect(old.auditHash).not.toBe(next.auditHash);
  });

  it("rejects missing proof, incomplete controls, and invalid point totals", async () => {
    const noProof = observations(1);
    noProof[0].proof.url = "";
    await expect(calculateV2Score(grid, {}, noProof)).rejects.toThrow("Missing proof");
    await expect(calculateV2Score(grid, {}, observations(1).slice(1))).rejects.toThrow("Exactly one observation");
    expect(() => validateGrid({ ...grid, categoryWeights: { ...CATEGORY_WEIGHTS, robots: 13 } })).toThrow("100 points");
    expect(() => validateGrid({ ...grid, controls: grid.controls.slice(1) })).toThrow("allocation mismatch");
  });

  it("rejects non-finite snapshot numbers", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("unsupported");
  });
});
