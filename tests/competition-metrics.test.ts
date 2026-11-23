import { describe, expect, it } from "vitest";
import { opportunityScore } from "../site/console/competition-metrics.js";
describe("competition metrics", () => {
  it("makes priority decrease with lower confidence and higher effort", () => {
    expect(opportunityScore(10, 10, 3, 1, true)?.score).toBe(50);
    expect(opportunityScore(20, 20, 3, 3, true)?.score).toBe(33);
    expect(opportunityScore(20, 20, 3, 1, false)?.score).toBe(75);
    expect(opportunityScore(1, 0, 3, 1)).toBeNull();
  });
});
