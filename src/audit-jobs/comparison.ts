/**
 * Before/after comparisons between the requestor's own completed public audit
 * snapshots for the same URL. Evidence-first contract: outcomes only, never
 * earned points or scores, and only after method and scope both match.
 */
import type { FreeReadResult } from "../freeread/index.js";

export type AuditControlOutcome = "pass" | "review" | "unknown" | "not_applicable";
export type AuditControlChange =
  | "improved" | "regressed" | "unchanged"
  | "newly_observed" | "newly_unavailable"
  | "newly_applicable" | "no_longer_applicable";

export interface AuditComparisonControl {
  controlId: string;
  title: string;
  previousOutcome: AuditControlOutcome | null;
  currentOutcome: AuditControlOutcome | null;
  change: AuditControlChange;
}

export interface AuditComparisonActions {
  resolved: string[];
  new: string[];
  unchanged: number;
}

export type AuditComparison =
  | {
      status: "compared";
      method: FreeReadResult["report360"]["method"];
      scope: "single_public_url";
      url: string;
      gridVersion: string;
      previousObservedAt: string;
      currentObservedAt: string;
      summary: {
        improved: number; regressed: number; unchanged: number;
        newlyObserved: number; newlyUnavailable: number;
        newlyApplicable: number; noLongerApplicable: number;
      };
      controls: AuditComparisonControl[];
      actions: AuditComparisonActions;
      note: string;
    }
  | { status: "not_comparable"; reason: "no_previous_snapshot" | "method_mismatch" | "scope_mismatch"; note: string };

const NOTE_OUTCOMES_ONLY = "Comparison of public outcomes only: earned points and private scores remain withheld.";

const outcomeOf = (result: FreeReadResult, controlId: string): AuditControlOutcome | null =>
  result.geoV2?.controls.find(c => c.controlId === controlId)?.outcome ?? null;

const classify = (previous: AuditControlOutcome | null, current: AuditControlOutcome | null): AuditControlChange => {
  if (current === null) return previous === null || previous === "unknown" ? "unchanged" : "newly_unavailable";
  if (current === "unknown") return previous === null || previous === "unknown" ? "unchanged" : "newly_unavailable";
  if (previous === null || previous === "unknown") return current === "not_applicable" ? "unchanged" : "newly_observed";
  if (current === "not_applicable") return "no_longer_applicable";
  if (previous === "not_applicable") return "newly_applicable";
  if (previous !== "pass" && current === "pass") return "improved";
  if (previous === "pass" && current !== "pass") return "regressed";
  return "unchanged";
};

const SUMMARY_KEY = {
  improved: "improved", regressed: "regressed", unchanged: "unchanged", newly_observed: "newlyObserved",
  newly_unavailable: "newlyUnavailable", newly_applicable: "newlyApplicable", no_longer_applicable: "noLongerApplicable",
} as const;

/**
 * Compares a previous snapshot with the current one. Both results are the
 * requestor's own; the caller is responsible for never pairing results that
 * belong to different requestors. A guard response is returned whenever the
 * method, the scope, or the observed URL differs between snapshots.
 */
export function compareAuditSnapshots(previous: FreeReadResult | null | undefined, current: FreeReadResult | null | undefined): AuditComparison {
  if (!previous || !current) return { status: "not_comparable", reason: "no_previous_snapshot", note: "No previous completed snapshot of this URL is retained." };
  const previousReport = previous.report360, currentReport = current.report360;
  if (previousReport.method !== currentReport.method) return { status: "not_comparable", reason: "method_mismatch", note: "Snapshots were produced with different methods and are not comparable." };
  if (previousReport.scope !== currentReport.scope || previousReport.sourceUrl !== currentReport.sourceUrl || previous.finalUrl !== current.finalUrl)
    return { status: "not_comparable", reason: "scope_mismatch", note: "Snapshots cover different pages and are not comparable." };
  const summary = { improved: 0, regressed: 0, unchanged: 0, newlyObserved: 0, newlyUnavailable: 0, newlyApplicable: 0, noLongerApplicable: 0 };
  const controls: AuditComparisonControl[] = [];
  const currentIds = new Set(current.geoV2.controls.map(c => c.controlId));
  const controlIds = new Set([...previous.geoV2.controls.map(c => c.controlId), ...currentIds]);
  for (const controlId of controlIds) {
    const currentControl = current.geoV2.controls.find(c => c.controlId === controlId);
    const previousOutcome = outcomeOf(previous, controlId), currentOutcome = outcomeOf(current, controlId);
    const change = classify(previousOutcome, currentOutcome);
    summary[SUMMARY_KEY[change]] += 1;
    if (change !== "unchanged") controls.push({ controlId, title: currentControl?.title ?? previous.geoV2.controls.find(c => c.controlId === controlId)?.title ?? controlId, previousOutcome, currentOutcome, change });
  }
  const previousActionIds = new Set(previousReport.actions.map(a => a.id));
  const currentActionIds = new Set(currentReport.actions.map(a => a.id));
  const actions: AuditComparisonActions = {
    resolved: previousReport.actions.filter(a => !currentActionIds.has(a.id)).map(a => a.id),
    new: currentReport.actions.filter(a => !previousActionIds.has(a.id)).map(a => a.id),
    unchanged: currentReport.actions.filter(a => previousActionIds.has(a.id)).length,
  };
  const gridNote = previous.geoV2.gridVersion !== current.geoV2.gridVersion
    ? ` Rubric versions differ (${previous.geoV2.gridVersion} to ${current.geoV2.gridVersion}); new or removed controls appear as newly_observed or newly_unavailable.`
    : "";
  return {
    status: "compared", method: currentReport.method, scope: currentReport.scope, url: currentReport.sourceUrl,
    gridVersion: current.geoV2.gridVersion,
    previousObservedAt: previousReport.observedAt, currentObservedAt: currentReport.observedAt,
    summary, controls, actions, note: `${NOTE_OUTCOMES_ONLY}${gridNote}`,
  };
}
