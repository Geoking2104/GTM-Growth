import { CATEGORY_WEIGHTS, validateGrid } from "./rubric.js";
import type { ScoreGrid, V2Category } from "./rubric.js";

export interface ObservedControl {
  controlId: string;
  earned: number;
  proof: { type: "extract" | "log" | "file" | "screenshot"; value: string; url: string };
}

export interface V2Score {
  gridVersion: string;
  profile: ScoreGrid["profile"];
  snapshotHash: string;
  auditHash: string;
  score: number;
  scoreByCategory: Record<V2Category, number>;
  topActions: Array<{ controlId: string; points: number; effort: "S" | "M" | "L"; title: string }>;
}

/** Canonical JSON with lexicographically ordered object keys. Arrays retain order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value) {
    return `{${Object.entries(value).filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  throw new Error("Snapshot contains an unsupported value");
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Pure scoring: no fetch, clock, randomness, persistence, or LLM involvement. */
export async function calculateV2Score(grid: ScoreGrid, snapshot: unknown, observations: readonly ObservedControl[]): Promise<V2Score> {
  validateGrid(grid);
  const snapshotHash = await sha256(canonicalJson(snapshot));
  const auditHash = await sha256(canonicalJson({ snapshotHash, grid }));
  const byId = new Map(observations.map((observation) => [observation.controlId, observation]));
  if (byId.size !== observations.length || byId.size !== grid.controls.length) {
    throw new Error("Exactly one observation is required for every control");
  }
  const scoreByCategory = Object.fromEntries(Object.keys(CATEGORY_WEIGHTS).map((key) => [key, 0])) as Record<V2Category, number>;
  const actions: V2Score["topActions"] = [];
  for (const control of grid.controls) {
    const observation = byId.get(control.id);
    if (!observation) throw new Error(`Missing observation: ${control.id}`);
    if (!Number.isSafeInteger(observation.earned) || observation.earned < 0 || observation.earned > control.maxPoints) {
      throw new Error(`Invalid earned points: ${control.id}`);
    }
    if (!observation.proof?.value || !observation.proof.url || !/^(https?:\/\/|proof:\/\/)/.test(observation.proof.url)) {
      throw new Error(`Missing proof: ${control.id}`);
    }
    scoreByCategory[control.category] += observation.earned;
    const points = control.maxPoints - observation.earned;
    if (points > 0) actions.push({ controlId: control.id, points, effort: control.effort, title: control.title });
  }
  actions.sort((a, b) => b.points - a.points || (a.controlId < b.controlId ? -1 : a.controlId > b.controlId ? 1 : 0));
  return {
    gridVersion: grid.version,
    profile: grid.profile,
    snapshotHash,
    auditHash,
    score: Object.values(scoreByCategory).reduce((sum, points) => sum + points, 0),
    scoreByCategory,
    topActions: actions.slice(0, 3),
  };
}
