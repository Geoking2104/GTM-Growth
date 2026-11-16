import { validateGrid } from "./rubric.js";
import type { ControlDefinition, ScoreGrid, V2Category } from "./rubric.js";

export interface ControlGridChange {
  controlId: string;
  category: V2Category | null;
  previousPoints: number;
  nextPoints: number;
  reason: string;
  kind: "added" | "removed" | "reweighted" | "redefined";
}

export interface GridChangeSet {
  fromVersion: string;
  toVersion: string;
  changes: ControlGridChange[];
}

/**
 * Explicit, deterministic grid changelog. Reasons are supplied by an editor:
 * changes without a documented explanation are rejected, not inferred.
 */
export function diffScoreGrids(
  previous: ScoreGrid,
  next: ScoreGrid,
  reasons: Readonly<Record<string, string>>
): GridChangeSet {
  validateGrid(previous);
  validateGrid(next);
  if (previous.version === next.version) {
    throw new Error("Changed grids must have different semantic versions");
  }
  const oldById = new Map(previous.controls.map(control => [control.id, control]));
  const newById = new Map(next.controls.map(control => [control.id, control]));
  const changes: ControlGridChange[] = [];
  for (const id of [...new Set([...oldById.keys(), ...newById.keys()])].sort()) {
    const oldControl = oldById.get(id);
    const newControl = newById.get(id);
    if (oldControl && newControl && sameDefinition(oldControl, newControl)) continue;
    const reason = reasons[id]?.trim();
    if (!reason) throw new Error(`Missing changelog reason for ${id}`);
    changes.push({
      controlId: id,
      category: newControl?.category ?? oldControl?.category ?? null,
      previousPoints: oldControl?.maxPoints ?? 0,
      nextPoints: newControl?.maxPoints ?? 0,
      reason,
      kind: !oldControl ? "added" : !newControl ? "removed"
        : oldControl.maxPoints !== newControl.maxPoints ? "reweighted" : "redefined",
    });
  }
  // A version bump with no control modifications is valid, but must not conceal
  // a profile/budget change behind a seemingly empty changelog.
  if (previous.profile !== next.profile ||
      Object.keys(previous.categoryWeights).some(key =>
        previous.categoryWeights[key as V2Category] !== next.categoryWeights[key as V2Category])) {
    if (!reasons["$grid"]?.trim()) throw new Error("Missing changelog reason for $grid");
    changes.push({
      controlId: "$grid",
      category: null,
      previousPoints: 100,
      nextPoints: 100,
      reason: reasons["$grid"].trim(),
      kind: "redefined",
    });
  }
  return { fromVersion: previous.version, toVersion: next.version, changes };
}

function sameDefinition(left: ControlDefinition, right: ControlDefinition): boolean {
  return left.id === right.id &&
    left.category === right.category &&
    left.title === right.title &&
    left.definition === right.definition &&
    left.measurementMethod === right.measurementMethod &&
    left.expectedProof === right.expectedProof &&
    left.maxPoints === right.maxPoints &&
    left.successThreshold === right.successThreshold &&
    left.fixType === right.fixType &&
    left.effort === right.effort;
}
