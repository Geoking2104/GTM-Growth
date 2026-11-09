import { canonicalJson, sha256 } from "./calculate.js";
import { validateGrid } from "./rubric.js";
import type { ScoreGrid, V2Category } from "./rubric.js";
import type { ObservedControl } from "./calculate.js";

export type CoverageObservation =
  | (ObservedControl & { status: "measured" })
  | { controlId: string; status: "not_applicable"; reason: string; proof: ObservedControl["proof"] }
  | { controlId: string; status: "unknown"; reason: string };

export interface V2CoverageScore {
  gridVersion: string;
  snapshotHash: string;
  auditHash: string;
  status: "complete" | "incomplete" | "failed";
  /** Null when evidence is incomplete; never treat unmeasured points as zero. */
  score: number | null;
  scoreRange: { min: number; max: number } | null;
  measuredPoints: number;
  applicableMaximum: number;
  unknownMaximum: number;
  excludedMaximum: number;
  byCategory: Record<V2Category, { earned: number; applicable: number; unknown: number; excluded: number }>;
  unmeasuredControls: string[];
  /** Evidence-bound observation digest, separate from the snapshot/grid audit hash. */
  observationHash: string;
  /** Full 42-control trace for independent review and clickable source proofs. */
  controls: Array<{
    controlId: string; title: string; category: V2Category; maxPoints: number;
    status: CoverageObservation["status"]; earned: number | null;
    proof: ObservedControl["proof"] | null; reason: string | null;
  }>;
}

const validProof = (proof: ObservedControl["proof"] | undefined): boolean =>
  Boolean(proof && proof.value?.trim() && /^(https?:\/\/|proof:\/\/)/.test(proof.url) &&
    ["extract", "log", "file", "screenshot"].includes(proof.type));

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Deterministic applicability-aware score.
 * - N/A requires proof, is removed from denominator, and cannot earn points.
 * - Unknown/missing is tracked, never counted as a failure.
 * - Until all 42 controls are resolved the final score remains null.
 */
export async function calculateV2Coverage(
  grid: ScoreGrid,
  snapshot: unknown,
  observations: readonly CoverageObservation[],
  auditFailed = false,
): Promise<V2CoverageScore> {
  validateGrid(grid);
  const byId = new Map(grid.controls.map(control => [control.id, control]));
  const received = new Map<string, CoverageObservation>();
  for (const item of observations) {
    if (!byId.has(item.controlId) || received.has(item.controlId))
      throw new Error(`Unknown or duplicate observation: ${item.controlId}`);
    received.set(item.controlId, item);
  }
  const snapshotHash = await sha256(canonicalJson(snapshot));
  const auditHash = await sha256(canonicalJson({ grid, snapshotHash }));
  const byCategory = Object.fromEntries(
    Object.keys(grid.categoryWeights).map(key =>
      [key, { earned: 0, applicable: 0, unknown: 0, excluded: 0 }])
  ) as V2CoverageScore["byCategory"];
  const unmeasuredControls: string[] = [];
  const controls: V2CoverageScore["controls"] = [];

  for (const control of grid.controls) {
    const entry = received.get(control.id);
    const bucket = byCategory[control.category];
    if (!entry || entry.status === "unknown") {
      if (entry && !entry.reason?.trim()) throw new Error(`Missing unknown reason: ${control.id}`);
      bucket.unknown += control.maxPoints;
      unmeasuredControls.push(control.id);
      controls.push({
        controlId: control.id, title: control.title, category: control.category,
        maxPoints: control.maxPoints, status: "unknown", earned: null,
        proof: null, reason: entry?.reason ?? "No observation provided",
      });
    } else if (entry.status === "not_applicable") {
      if (!entry.reason?.trim() || !validProof(entry.proof))
        throw new Error(`Missing applicability proof: ${control.id}`);
      bucket.excluded += control.maxPoints;
      controls.push({
        controlId: control.id, title: control.title, category: control.category,
        maxPoints: control.maxPoints, status: "not_applicable", earned: null,
        proof: entry.proof, reason: entry.reason,
      });
    } else {
      if (!Number.isSafeInteger(entry.earned) ||
          entry.earned < 0 || entry.earned > control.maxPoints || !validProof(entry.proof))
        throw new Error(`Invalid measured observation: ${control.id}`);
      bucket.earned += entry.earned;
      bucket.applicable += control.maxPoints;
      controls.push({
        controlId: control.id, title: control.title, category: control.category,
        maxPoints: control.maxPoints, status: "measured", earned: entry.earned,
        proof: entry.proof, reason: null,
      });
    }
  }

  const observationHash = await sha256(canonicalJson(controls));
  const total = Object.values(byCategory).reduce((sum, item) => ({
    earned: sum.earned + item.earned,
    applicable: sum.applicable + item.applicable,
    unknown: sum.unknown + item.unknown,
    excluded: sum.excluded + item.excluded,
  }), { earned: 0, applicable: 0, unknown: 0, excluded: 0 });
  const potential = total.applicable + total.unknown;
  const scoreRange = auditFailed || potential === 0 ? null : {
    min: round(100 * total.earned / potential),
    max: round(100 * (total.earned + total.unknown) / potential),
  };
  const complete = !auditFailed && total.unknown === 0 && total.applicable > 0;
  return {
    gridVersion: grid.version, snapshotHash, auditHash,
    status: auditFailed ? "failed" : complete ? "complete" : "incomplete",
    score: complete ? round(100 * total.earned / total.applicable) : null,
    scoreRange,
    measuredPoints: total.earned,
    applicableMaximum: total.applicable,
    unknownMaximum: total.unknown,
    excludedMaximum: total.excluded,
    byCategory,
    unmeasuredControls,
    observationHash,
    controls,
  };
}
