import { describe, expect, it } from "vitest";
import { phase1Routes } from "../src/console/api.js";

describe("console /overview", () => {
  it("expose la route de vue d'ensemble pour le tableau de bord", () => {
    expect(phase1Routes.some((r) => r.path === "/overview")).toBe(true);
  });
});
