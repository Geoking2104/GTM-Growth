/**
 * Deterministic, three-valued applicability evaluation.
 *
 * Unknown input must never turn into a failure (or an awarded point).
 * Rules are data; the approved control-specific rules will plug into this
 * engine without a model call or any network access.
 */
export type ApplicabilityFact = "verified_domain" | "html_available" | "robots_available" |
  "llms_available" | "schema_available" | "rendered_dom_available" |
  "site_is_local" | "site_is_ecommerce" | "site_is_saas" | "site_is_publisher";

export type ApplicabilityRule =
  | { op: "fact"; name: ApplicabilityFact; value: boolean }
  | { op: "all" | "any"; rules: readonly ApplicabilityRule[] }
  | { op: "not"; rule: ApplicabilityRule };

export type ApplicabilityResult = "applicable" | "not_applicable" | "unknown";
export type ApplicabilityFacts = Partial<Record<ApplicabilityFact, boolean>>;

function triNot(value: ApplicabilityResult): ApplicabilityResult {
  return value === "unknown" ? value : value === "applicable" ? "not_applicable" : "applicable";
}

/** Closed-world fact names; unknown/missing facts remain explicitly unknown. */
export function evaluateApplicability(
  rule: ApplicabilityRule,
  facts: ApplicabilityFacts,
): ApplicabilityResult {
  if (rule.op === "fact") {
    const actual = facts[rule.name];
    return typeof actual !== "boolean"
      ? "unknown"
      : actual === rule.value ? "applicable" : "not_applicable";
  }
  if (rule.op === "not") return triNot(evaluateApplicability(rule.rule, facts));
  if (rule.rules.length === 0) throw new Error("Applicability all/any must contain at least one rule");
  const outcomes = rule.rules.map(child => evaluateApplicability(child, facts));
  if (rule.op === "all") {
    if (outcomes.includes("not_applicable")) return "not_applicable";
    return outcomes.includes("unknown") ? "unknown" : "applicable";
  }
  if (outcomes.includes("applicable")) return "applicable";
  return outcomes.includes("unknown") ? "unknown" : "not_applicable";
}
