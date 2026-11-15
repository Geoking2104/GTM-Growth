import { describe, it, expect } from "vitest";
import { buildLocalPlan, localSchema, localPlanMarkdown, safeUrl } from "../site/console/local-seo-model.js";
const profile = { name: "Atelier Martin", phone: "+33 1 23 45 67 89", website: "https://example.fr/paris", street: "12 rue des Fleurs", postalCode: "75001", city: "Paris", country: "FR", publicAddress: true, service: "Plomberie", area: "Paris" };
describe("local SEO declarations", () => {
  it("keeps absent evidence unknown and connections unavailable", () => {
    const plan = buildLocalPlan({ citations: [{ name: "Someone" }] }, "en");
    expect(plan.checks.every(c => c.status === "missing")).toBe(true);
    expect(plan.citations[0].comparison.name).toBe("unknown");
    expect(Object.values(plan.integrations).every(v => v === "not-connected")).toBe(true);
    expect(plan.queries).toEqual([]);
    expect(plan.limitation).toContain("no listing");
  });
  it("compares entered NAP conservatively without pretending to verify directories", () => {
    const plan = buildLocalPlan({ profile, citations: [{ directory: "Sample", name: " atelier   martin ", phone: "+33(1)23-45-67-89", address: "12 rue des Fleurs, 75001, Paris, FR" }, { name: "Another company", phone: "0123456789" }] });
    expect(plan.citations[0].comparison).toEqual({ name: "match", phone: "match", address: "match" });
    expect(plan.citations[1].comparison).toEqual({ name: "review", phone: "review", address: "unknown" });
    expect(plan.citations[0].source).toBe("user-declared");
    expect(plan.querySource).toBe("hypothesis");
    expect(plan.queries).toEqual(["Plomberie Paris"]);
  });
  it("never emits a private or incomplete address as LocalBusiness", () => {
    expect(localSchema({ ...profile, publicAddress: false })).toBeNull();
    expect(localSchema({ ...profile, city: "" })).toBeNull();
    expect(localSchema({ ...profile, website: "javascript:alert(1)" })).toBeNull();
    expect(localSchema(profile)?.address.addressCountry).toBe("FR");
    expect(buildLocalPlan({ profile: { ...profile, publicAddress: false }, citations: [{ address: "private" }] }).citations[0].comparison.address).toBe("not-applicable");
  });
  it("bounds malformed imports and rejects executable or credential-bearing URLs", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,a", "https://user:secret@example.com", "invalid"]) expect(safeUrl(url)).toBe("");
    const plan = buildLocalPlan({ profile: null, citations: [null, 1, ...Array(25).fill({ name: "x".repeat(300) })] });
    expect(plan.citations).toHaveLength(20);
    expect(plan.citations[2].name).toHaveLength(200);
  });
  it("exports limitations and actions in the selected language", () => {
    for (const lang of ["fr", "en"]) {
      const plan = buildLocalPlan({ profile }, lang);
      const report = localPlanMarkdown(plan, lang);
      expect(report).toContain(plan.limitation);
      expect(report).toContain(lang === "fr" ? "Hypothèses de requêtes" : "Query hypotheses");
      expect(report).not.toContain("undefined");
    }
  });
});
