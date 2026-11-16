/**
 * Owner-consent boundary for anonymous GEO v2 reports. The audit may compute
 * numeric scores internally, but neither the score nor per-control earned
 * points are released in a public/emailed snapshot by default.
 */
import type { V2CoverageScore } from "./coverage.js";

export type PublicV2Control = {
  controlId: string;
  title: string;
  category: V2CoverageScore["controls"][number]["category"];
  status: V2CoverageScore["controls"][number]["status"];
  outcome: "pass" | "review" | "unknown" | "not_applicable";
  proof: V2CoverageScore["controls"][number]["proof"];
  reason: string | null;
};

export interface PublicV2Coverage {
  gridVersion: string;
  status: V2CoverageScore["status"];
  /** Explicitly withheld even if all applicable controls have observations. */
  score: null;
  controls: PublicV2Control[];
  unmeasuredControls: string[];
}

export function publicV2Coverage(coverage: V2CoverageScore): PublicV2Coverage {
  return {
    gridVersion: coverage.gridVersion,
    status: coverage.status,
    score: null,
    unmeasuredControls: [...coverage.unmeasuredControls],
    controls: coverage.controls.map(control => ({
      controlId: control.controlId,
      title: control.title,
      category: control.category,
      status: control.status,
      outcome: control.status === "unknown" ? "unknown" :
        control.status === "not_applicable" ? "not_applicable" :
          control.earned === control.maxPoints ? "pass" : "review",
      proof: control.proof,
      reason: control.reason,
    })),
  };
}
