import { describe, expect, it } from "vitest";
import { replayV2Evidence } from "../src/geo/score/v2/replay.js";
import { CATEGORY_WEIGHTS, GRID_VERSION } from "../src/geo/score/v2/rubric.js";
import type { ScoreGrid, V2Category } from "../src/geo/score/v2/rubric.js";

const grid: ScoreGrid = {
  version: GRID_VERSION,
  profile: "general",
  categoryWeights: CATEGORY_WEIGHTS,
  controls: (Object.keys(CATEGORY_WEIGHTS) as V2Category[]).map(category => ({
    id: category + ".demo",
    category,
    title: "Improve " + category,
    definition: "Offline evidence demonstration",
    measurementMethod: "Manual synthetic observation",
    expectedProof: "Synthetic proof",
    maxPoints: CATEGORY_WEIGHTS[category],
    successThreshold: 1,
    fixType: "content",
    effort: "S",
  })),
};
const envelope = {
  grid,
  snapshot: { url: "https://example.com", html: "<h1>Example</h1>" },
  observations: grid.controls.map(control => ({
    controlId: control.id,
    earned: control.maxPoints,
    proof: { type: "extract" as const, value: "Synthetic test evidence", url: "proof://fixture" },
  })),
};

describe("GEO v2 CLI evidence replay", () => {
  it("returns deterministic scores, hashes and an explicit unverified status", async () => {
    const first = await replayV2Evidence(envelope);
    const second = await replayV2Evidence({
      ...envelope,
      snapshot: { html: "<h1>Example</h1>", url: "https://example.com" },
      observations: [...envelope.observations].reverse(),
    });
    expect(first).toEqual(second);
    expect(first.score).toBe(100);
    expect(first.evidenceStatus).toBe("user_supplied_unverified");
    expect(first.topActions).toEqual([]);
  });

  it("rejects modified category weights and incomplete evidence", async () => {
    await expect(replayV2Evidence({ ...envelope, grid: {
      ...grid, categoryWeights: { ...CATEGORY_WEIGHTS, robots: 13, llms: 15 },
    } })).rejects.toThrow("approved");
    await expect(replayV2Evidence({ ...envelope, observations: envelope.observations.slice(1) }))
      .rejects.toThrow("Exactly one");
    await expect(replayV2Evidence({ grid, observations: [] })).rejects.toThrow("snapshot");
  });
});
