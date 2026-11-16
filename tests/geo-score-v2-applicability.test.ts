import { describe, expect, it } from "vitest";
import { evaluateApplicability } from "../src/geo/score/v2/applicability.js";
import type { ApplicabilityRule } from "../src/geo/score/v2/applicability.js";

describe("GEO v2 deterministic applicability", () => {
  const rendering: ApplicabilityRule = {
    op: "all",
    rules: [
      { op: "fact", name: "verified_domain", value: true },
      { op: "fact", name: "html_available", value: true },
    ],
  };

  it("requires both domain verification and available HTML for rendering assessment", () => {
    expect(evaluateApplicability(rendering, { verified_domain: true, html_available: true })).toBe("applicable");
    expect(evaluateApplicability(rendering, { verified_domain: false, html_available: true })).toBe("not_applicable");
    expect(evaluateApplicability(rendering, { html_available: true })).toBe("unknown");
  });

  it("does not confuse an unknown signal with a false one", () => {
    const rule: ApplicabilityRule = {
      op: "any",
      rules: [
        { op: "fact", name: "site_is_local", value: true },
        { op: "fact", name: "site_is_ecommerce", value: true },
      ],
    };
    expect(evaluateApplicability(rule, { site_is_local: false })).toBe("unknown");
    expect(evaluateApplicability(rule, { site_is_local: false, site_is_ecommerce: false })).toBe("not_applicable");
    expect(evaluateApplicability(rule, { site_is_local: true })).toBe("applicable");
  });

  it("supports deterministic negation and rejects empty composite rules", () => {
    expect(evaluateApplicability({ op: "not", rule: { op: "fact", name: "llms_available", value: true } },
      { llms_available: false })).toBe("applicable");
    expect(evaluateApplicability({ op: "not", rule: { op: "fact", name: "llms_available", value: true } },
      {})).toBe("unknown");
    expect(() => evaluateApplicability({ op: "all", rules: [] }, {})).toThrow("at least one");
  });
});
