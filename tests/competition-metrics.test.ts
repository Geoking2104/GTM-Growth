import { describe, expect, it } from "vitest";
import { comparePeriods, opportunityScore } from "../site/console/competition-metrics.js";
const row = (date: string, prompt: string, mentioned: boolean, source = "A") => ({ observedAt: `${date}T12:00:00Z`, prompt, source, mentions: mentioned ? [{ brand: "Alpha", status: "confirmed" }] : [] });
describe("competition metrics", () => {
  it("compares only shared prompt/source strata with equal weights", () => {
    const rows = [row("2026-01-01", "Q1", true), row("2026-01-01", "Q2", false), row("2026-01-02", "Q1", false), row("2026-01-02", "Q1", false), row("2026-01-02", "Q2", true), row("2026-01-02", "new", true)];
    const result = comparePeriods(rows, "Alpha", "2026-01-02", "2026-01-02");
    expect(result?.shared).toBe(2); expect(result?.previous).toBe(50); expect(result?.current).toBe(50); expect(result?.delta).toBe(0); expect(result?.currentCount).toBe(3);
  });
  it("does not compare unmatched prompts or invalid periods", () => {
    expect(comparePeriods([row("2026-01-01", "Q1", true), row("2026-01-02", "Q2", true)], "Alpha", "2026-01-02", "2026-01-02")?.delta).toBeNull();
    expect(comparePeriods([], "Alpha", "2026-01-03", "2026-01-02")).toBeNull();
    expect(comparePeriods([], "Alpha", "2026-02-30", "2026-03-02")).toBeNull();
  });
  it("makes priority decrease with lower confidence and higher effort", () => {
    expect(opportunityScore(10, 10, 3, 1, true)?.score).toBe(50);
    expect(opportunityScore(20, 20, 3, 3, true)?.score).toBe(33);
    expect(opportunityScore(20, 20, 3, 1, false)?.score).toBe(75);
    expect(opportunityScore(1, 0, 3, 1)).toBeNull();
  });
});
