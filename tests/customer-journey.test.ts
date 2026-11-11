import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildJourneyPreview, JOURNEY_STAGES, JOURNEY_VERSION } from "../site/console/customer-journey-model.js";
import { rankRecommendations } from "../site/console/public-read-model.js";

const sample = {
  url: "https://example.org/services",
  finalUrl: "https://example.org/services",
  pageSignals: {
    title: "Quality bookkeeping for independent professionals",
    description: "Helping small companies handle invoices and reporting.",
    h1: ["Quality bookkeeping for independent professionals"],
    h2: ["How bookkeeping works", "Comparing bookkeeping solutions"],
  },
  opportunities: [
    { checkId: "content.h1", status: "fail", category: "content", priority: "medium", points: 4, evidence: "Missing heading" },
    { checkId: "meta.canonical", status: "fail", category: "meta", priority: "critical", points: 0, evidence: "No canonical" },
  ],
};
const source = (p: string) => readFileSync(join(process.cwd(), "site", "console", p), "utf8");

describe("five-stage customer journey preview", () => {
  it("provides exactly five stages and explicit inferred provenance for every prompt", () => {
    const result = buildJourneyPreview({ ...sample, language: "fr" });
    expect(result.version).toBe(JOURNEY_VERSION);
    expect(JOURNEY_STAGES).toHaveLength(5);
    expect(result.stages.map((s: { id: string }) => s.id)).toEqual([
      "unaware", "problem-aware", "solution-aware", "product-aware", "most-aware",
    ]);
    for (const stage of result.stages) {
      expect(stage.prompts).toHaveLength(2);
      expect(stage.prompts.every((p: { sourceKind: string }) => p.sourceKind === "inferred")).toBe(true);
      expect(stage.targetUrl).toBe(sample.finalUrl);
    }
    expect(result.limitation).toMatch(/hypothétiques/i);
  });

  it("adapts to language, audience and business goal without fabricating observations", () => {
    const result = buildJourneyPreview({
      ...sample, language: "en", audience: "freelancers", goal: "organise invoices",
    });
    expect(result.language).toBe("en");
    expect(result.stages[2].prompts.some((p: { text: string }) => p.text.includes("freelancers"))).toBe(true);
    expect(result.stages[1].prompts.some((p: { text: string }) => p.text.includes("organise invoices"))).toBe(true);
    expect(result.stages.every((s: { coverage: string }) => s.coverage !== "measured-ai")).toBe(true);
    expect(result.limitation).toMatch(/Hypothetical/);
    expect(result.observed.headings).toHaveLength(3);
  });

  it("never treats a plausible heading as proof of customer search volume", () => {
    const result = buildJourneyPreview({
      ...sample,
      pageSignals: { h1: ["Services"], h2: ["How to compare bookkeeping solutions"] },
      language: "en",
    });
    expect(result.stages.every((s: { prompts: { sourceKind: string }[] }) => s.prompts.every((p) => p.sourceKind === "inferred"))).toBe(true);
    expect(result.stages.every((s: { coverage: string }) => ["possible-heading", "not-verified", "no-headings-observed"].includes(s.coverage))).toBe(true);
  });

  it("reuses observed failures and keeps critical blockers first in each ranking mode", () => {
    const result = buildJourneyPreview(sample);
    expect(result.stages.some((s: { observedControls: string[] }) => s.observedControls.includes("content.h1"))).toBe(true);
    for (const mode of ["quick", "blockers", "journey", "impact", "ai"]) {
      expect(rankRecommendations(sample.opportunities, mode)[0].checkId).toBe("meta.canonical");
    }
  });

  it("ships a shared FR/EN user interface and a tenant-only save path", () => {
    const publicUi = source("public-read.js");
    const workspace = source("customer-journey-workspace.js");
    const ui = source("customer-journey.js");
    expect(publicUi).toContain("renderJourneyPreview");
    expect(publicUi).toContain("public-top-fixes");
    expect(publicUi).toContain("rankRecommendations(opportunities, mode)");
    expect(ui).toContain("editable hypotheses");
    expect(ui).toContain("hypothèses modifiables");
    expect(ui).toContain("navigator.clipboard.writeText");
    expect(workspace).toContain("ownedUrl(state.me?.tenant, url)");
    expect(workspace).toContain('api("/visibility/prompts/add", prompt)');
    expect(source("app.js")).toContain('id: "journey"');
    expect(source("shell.css")).toContain(".journey-stages");
  });
});
