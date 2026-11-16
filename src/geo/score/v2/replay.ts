import { calculateV2Score } from "./calculate.js";
import type { ObservedControl } from "./calculate.js";
import { CATEGORY_WEIGHTS, GRID_VERSION } from "./rubric.js";
import type { ScoreGrid } from "./rubric.js";

export interface EvidenceEnvelope {
  grid: ScoreGrid;
  snapshot: unknown;
  observations: ObservedControl[];
}

export async function replayV2Evidence(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Evidence file must contain grid, snapshot and observations");
  }
  const value = input as Partial<EvidenceEnvelope>;
  if (!value.grid || !Object.prototype.hasOwnProperty.call(value, "snapshot") ||
      !Array.isArray(value.observations)) {
    throw new Error("Evidence file must contain grid, snapshot and observations");
  }
  if (value.grid.version !== GRID_VERSION ||
      Object.entries(CATEGORY_WEIGHTS).some(([key, weight]) =>
        value.grid?.categoryWeights?.[key as keyof typeof CATEGORY_WEIGHTS] !== weight)) {
    throw new Error("Evidence grid must use the approved GEO v2.0.0 category weights");
  }
  const result = await calculateV2Score(value.grid, value.snapshot, value.observations);
  return { ...result, evidenceStatus: "user_supplied_unverified" as const };
}
