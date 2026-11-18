/**
 * Impact timeline for ONE scope (one public URL): the requestor's own
 * consecutive completed snapshots, compared pairwise with explicit per-step
 * confidence. Counters stay per step: nothing is ever summed across steps,
 * scopes or clients, and points and scores remain withheld.
 */
import type { FreeReadResult } from "../freeread/index.js";
import { compareAuditSnapshots, type AuditComparison } from "../audit-jobs/comparison.js";
import { planFollowUps, FOLLOW_UP_NOTE, type ClientFollowUp } from "./follow-ups.js";

export type ImpactConfidence = "high" | "medium" | "low";

export interface ImpactTimelineStep {
  previousObservedAt: string;
  currentObservedAt: string;
  intervalDays: number;
  gridVersions: { previous: string; current: string };
  measuredCoverage: { previous: number; current: number };
  comparison: AuditComparison;
  confidence: ImpactConfidence;
  confidenceReasons: string[];
}

export type ImpactTimeline =
  | { status: "insufficient_observations"; url: string; observationCount: number; latestObservedAt: string | null; followUps: ClientFollowUp[]; note: string }
  | { status: "timeline"; url: string; observationCount: number; observedDates: string[]; latestObservedAt: string; steps: ImpactTimelineStep[]; followUps: ClientFollowUp[]; note: string }
  | { status: "scope_mismatch"; url: string; note: string };

export const TIMELINE_NOTE = "One timeline per scope: each step compares one consecutive pair of the requestor's own snapshots. Outcome counters are reported per step and never summed across steps, scopes or clients. Earned points and private scores remain withheld.";

const followUpsOf = (observations: FreeReadResult[], now: Date): ClientFollowUp[] =>
  planFollowUps(observations[observations.length - 1]?.report360.observedAt, now) ?? [];

const coverageOf = (observation: FreeReadResult): number => {
  const controls = observation.geoV2?.controls ?? [];
  if (!controls.length) return 0;
  return controls.filter(control => control.status === "measured").length / controls.length;
};

/** Deterministic confidence: reasons are explicit and machine-checkable. */
const classify = (step: {
  gridVersions: { previous: string; current: string };
  measuredCoverage: { previous: number; current: number };
  intervalDays: number;
  comparable: boolean;
}): { confidence: ImpactConfidence; confidenceReasons: string[] } => {
  const reasons: string[] = [];
  if (!step.comparable) return { confidence: "low", confidenceReasons: ["pair_not_comparable"] };
  reasons.push("comparable_pair");
  reasons.push(step.gridVersions.previous === step.gridVersions.current ? "same_grid_version" : "grid_version_changed");
  const minCoverage = Math.min(step.measuredCoverage.previous, step.measuredCoverage.current);
  reasons.push(`measured_coverage_${step.measuredCoverage.previous.toFixed(2)}_${step.measuredCoverage.current.toFixed(2)}`);
  reasons.push(`interval_days_${Math.round(step.intervalDays)}`);
  if (step.gridVersions.previous !== step.gridVersions.current) reasons.push("confidence_capped_grid_version_changed");
  if (step.intervalDays < 1) reasons.push("confidence_capped_window_too_short");
  if (minCoverage < 0.2) reasons.push("confidence_capped_coverage_below_0.20");
  if (step.intervalDays > 365) reasons.push("confidence_capped_interval_over_365_days");
  if (reasons.some(r => r.startsWith("confidence_capped"))) return { confidence: "low", confidenceReasons: reasons };
  if (minCoverage < 0.5) reasons.push("confidence_limited_partial_coverage");
  if (step.intervalDays > 180) reasons.push("confidence_limited_long_interval");
  const limited = reasons.some(r => r.startsWith("confidence_limited"));
  return { confidence: limited ? "medium" : "high", confidenceReasons: reasons };
};

const isUsableObservation = (o: FreeReadResult | null | undefined): o is FreeReadResult => !!o && !!o.report360 && !!o.geoV2;

/**
 * Builds the impact timeline of one scope from the requestor's own snapshots.
 * Snapshots must all cover the exact same page (source URL and final URL);
 * any foreign snapshot refuses the whole timeline (`scope_mismatch`) rather
 * than polluting one client's history.
 */
export function buildImpactTimeline(observations: Array<FreeReadResult | null | undefined>, url: string, now: Date = new Date()): ImpactTimeline {
  const valid = observations.filter(isUsableObservation);
  if (!valid.length) return { status: "insufficient_observations", url, observationCount: 0, latestObservedAt: null, followUps: [], note: `${TIMELINE_NOTE} ${FOLLOW_UP_NOTE}` };
  const scope = valid[0];
  if (valid.some(o => o.report360.sourceUrl !== scope.report360.sourceUrl || o.finalUrl !== scope.finalUrl))
    return { status: "scope_mismatch", url, note: "All snapshots must cover the same page; cross-scope timelines are never assembled." };
  valid.sort((a, b) => Date.parse(a.report360.observedAt) - Date.parse(b.report360.observedAt));
  const followUps = followUpsOf(valid, now);
  if (valid.length < 2) return { status: "insufficient_observations", url, observationCount: valid.length, latestObservedAt: valid[valid.length - 1].report360.observedAt, followUps, note: `${TIMELINE_NOTE} ${FOLLOW_UP_NOTE}` };
  const steps: ImpactTimelineStep[] = [];
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1], current = valid[i];
    const comparison = compareAuditSnapshots(previous, current);
    const measuredCoverage = { previous: coverageOf(previous), current: coverageOf(current) };
    const gridVersions = { previous: previous.geoV2.gridVersion, current: current.geoV2.gridVersion };
    const intervalDays = (Date.parse(current.report360.observedAt) - Date.parse(previous.report360.observedAt)) / 86_400_000;
    const { confidence, confidenceReasons } = classify({ gridVersions, measuredCoverage, intervalDays, comparable: comparison.status === "compared" });
    steps.push({ previousObservedAt: previous.report360.observedAt, currentObservedAt: current.report360.observedAt, intervalDays, gridVersions, measuredCoverage, comparison, confidence, confidenceReasons });
  }
  return {
    status: "timeline", url: scope.report360.sourceUrl, observationCount: valid.length,
    observedDates: valid.map(o => o.report360.observedAt),
    latestObservedAt: valid[valid.length - 1].report360.observedAt,
    steps, followUps, note: `${TIMELINE_NOTE} ${FOLLOW_UP_NOTE}`,
  };
}
