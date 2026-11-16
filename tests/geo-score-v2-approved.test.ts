import { describe, expect, it } from "vitest";
import { approvedV2Grid } from "../src/geo/score/v2/approved-grid.js";
import { CATEGORY_WEIGHTS, validateGrid } from "../src/geo/score/v2/rubric.js";
import { calculateV2Coverage } from "../src/geo/score/v2/coverage.js";
import type { CoverageObservation } from "../src/geo/score/v2/coverage.js";

const grid = approvedV2Grid();
const proof = (id: string) => ({
  type: "extract" as const, value: `Measured ${id}`, url: `proof://test/${id}`,
});
const full = (): CoverageObservation[] => grid.controls.map(control => ({
  controlId: control.id, status: "measured", earned: control.maxPoints, proof: proof(control.id),
}));

describe("approved 42-control GEO v2 grid", () => {
  it("has all approved stable IDs and 100 exact points", () => {
    expect(() => validateGrid(grid)).not.toThrow();
    expect(grid.controls).toHaveLength(42);
    expect(new Set(grid.controls.map(control => control.id)).size).toBe(42);
    expect(Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const counts = Object.fromEntries(Object.keys(CATEGORY_WEIGHTS).map(k => [
      k, grid.controls.filter(c => c.category === k).length,
    ]));
    expect(counts).toEqual({
      robots: 5, llms: 6, jsonld: 6, meta: 5,
      content: 8, brand: 5, discovery: 3, rendering: 4,
    });
    expect(grid.controls.filter(c => c.id === "L05" || c.id === "L06")
      .every(c => c.maxPoints === 2 && c.measurementMethod.includes("1000"))).toBe(true);
  });

  it("scores a complete evidence set deterministically", async () => {
    const inputs = full();
    const a = await calculateV2Coverage(grid, { url: "https://example.com" }, inputs);
    const b = await calculateV2Coverage(grid, { url: "https://example.com" }, [...inputs].reverse());
    expect(a).toEqual(b);
    expect(a.status).toBe("complete");
    expect(a.score).toBe(100);
    expect(a.scoreRange).toEqual({ min: 100, max: 100 });
    expect(a.controls).toHaveLength(42);
    expect(a.controls.every(control => control.status === "measured" && Boolean(control.proof?.url))).toBe(true);
  });

  it("binds the observation hash to earned points and proof", async () => {
    const entries = full();
    const first = await calculateV2Coverage(grid, { html: "same" }, entries);
    entries[0] = { ...entries[0], status: "measured", earned: 0, proof: proof("R01") };
    const changed = await calculateV2Coverage(grid, { html: "same" }, entries);
    expect(first.auditHash).toBe(changed.auditHash);
    expect(first.observationHash).not.toBe(changed.observationHash);
    expect(changed.controls[0]).toMatchObject({ controlId: "R01", earned: 0, status: "measured" });
  });

  it("never awards missing evidence, nor mislabels it as a failed zero", async () => {
    const result = await calculateV2Coverage(grid, {}, full().slice(0, -1));
    expect(result.status).toBe("incomplete");
    expect(result.score).toBeNull();
    expect(result.unknownMaximum).toBe(2);
    expect(result.scoreRange).toEqual({ min: 98, max: 100 });
    expect(result.unmeasuredControls).toEqual(["P04"]);
  });

  it("normalizes proven N/A controls, but rejects unproven exclusion", async () => {
    const entries = full();
    entries[0] = { controlId: "R01", status: "not_applicable", reason: "Verified scope exemption",
      proof: proof("R01") };
    const result = await calculateV2Coverage(grid, {}, entries);
    expect(result.status).toBe("complete");
    expect(result.applicableMaximum).toBe(97);
    expect(result.excludedMaximum).toBe(3);
    expect(result.score).toBe(100);
    entries[0] = { controlId: "R01", status: "not_applicable", reason: "Unverified",
      proof: { type: "extract", value: "", url: "" } };
    await expect(calculateV2Coverage(grid, {}, entries)).rejects.toThrow("Missing applicability proof");
  });

  it("returns failed/null for inaccessible audits and rejects duplicated IDs", async () => {
    const failed = await calculateV2Coverage(grid, {}, [], true);
    expect(failed.status).toBe("failed");
    expect(failed.score).toBeNull();
    expect(failed.scoreRange).toBeNull();
    await expect(calculateV2Coverage(grid, {}, [full()[0], full()[0]])).rejects.toThrow("duplicate");
  });
});
