import { describe, expect, it } from "vitest";
import { normalizeImport, summarize, type Dataset } from "../src/console/ai-visibility.js";
import { citationGaps, CITATION_CATEGORIES } from "../src/console/ai-citations.js";

const input = { brands: [
  { name: "Alpha", aliases: ["Alpha Inc"], website: "https://alpha.example" },
  { name: "Beta", aliases: [], website: "https://beta.example" },
], responses: [
  { prompt: "Quel service ?", answer: "Alpha est fiable.", source: "Import A", observedAt: "2026-11-01T12:00:00Z", citations: ["https://alpha.example/guide", "https://www.reddit.com/r/seo/thread"] },
  { prompt: "Prix ?", answer: "Beta est excellent.", source: "Import A", observedAt: "2026-11-02T12:00:00Z", citations: ["https://beta.example/prix", "https://fr.wikipedia.org/wiki/Marketing"] },
  { prompt: "Autre ?", answer: "Alpha est excellent.", source: "Import A", observedAt: "2026-11-03T12:00:00Z" },
  { prompt: "Avis ?", answer: "Alpha est excellent. Voir les comparatifs.", source: "Import A", observedAt: "2026-11-04T12:00:00Z", citations: ["https://www.youtube.com/watch?v=abc", "https://www.linkedin.com/company/alpha"] },
] };

describe("citation gap analysis", () => {
  it("classifies cited sources and counts own-site citations honestly", () => {
    const result = citationGaps(normalizeImport(input), "", "Alpha");
    expect(result.brand).toBe("Alpha"); expect(result.ownWebsite).toBe("https://alpha.example/"); expect(result.evaluated).toBe(true);
    expect(result.totals).toEqual({ observations: 4, withCitations: 3, citations: 6, promptsMentioningBrand: 3, promptsMentioningBrandWithOwnCitation: 1 });
    expect(result.competitorHosts).toEqual(["beta.example"]);
    const by = Object.fromEntries(result.categories.map((c) => [c.category, c]));
    expect(CITATION_CATEGORIES).toEqual(["own", "competitor", "reddit", "youtube", "linkedin", "wikipedia", "web"]);
    expect(by.own.citations).toBe(1); expect(by.own.citedPrompts).toBe(1); expect(by.own.shareOfCitations).toBeCloseTo(100 / 6, 10);
    expect(by.competitor.citations).toBe(1); expect(by.competitor.citedPrompts).toBe(1); expect(by.competitor.shareOfCitations).toBeCloseTo(100 / 6, 10);
    expect(by.reddit.citations).toBe(1); expect(by.youtube.citations).toBe(1); expect(by.linkedin.citations).toBe(1); expect(by.wikipedia.citations).toBe(1);
    expect(by.web).toEqual({ category: "web", citations: 0, citedPrompts: 0, shareOfCitations: 0 });
    expect(result.topHosts.map((h) => h.host)).toEqual(["alpha.example", "beta.example", "fr.wikipedia.org", "linkedin.com", "reddit.com", "youtube.com"]);
  });
  it("reports prompts that mention the brand while citing other sources", () => {
    const result = citationGaps(normalizeImport(input), "", "Alpha");
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].prompt).toBe("Avis ?"); expect(result.gaps[0].evidence).toBe("Alpha est excellent.");
    expect(result.gaps[0].citations).toEqual(["https://www.youtube.com/watch?v=abc", "https://www.linkedin.com/company/alpha"]);
    // A response without any citation is absent evidence, not a gap.
    expect(result.gaps.find((g) => g.prompt === "Autre ?")).toBeUndefined();
  });
  it("keeps an undeclared brand website unknown instead of counting zero", () => {
    const incomplete = normalizeImport({ brands: [{ name: "Alpha", aliases: [] }], responses: input.responses });
    const result = citationGaps(incomplete, "", "Alpha");
    expect(result.evaluated).toBe(false); expect(result.ownWebsite).toBeNull(); expect(result.gaps).toEqual([]);
    expect(result.note).toMatch(/website/i);
    expect(result.categories.find((c) => c.category === "own").citations).toBe(0);
  });
  it("filters by source and resolves the requested brand like summarize", () => {
    const dataset = normalizeImport(input);
    const scoped = citationGaps(dataset, "Import A".toUpperCase(), "Alpha");
    expect(scoped.totals.observations).toBe(0);
    const beta = citationGaps(dataset, "", "Beta");
    expect(beta.brand).toBe("Beta"); expect(beta.ownWebsite).toBe("https://beta.example/"); expect(beta.gaps).toEqual([]);
    expect(beta.totals.promptsMentioningBrand).toBe(1); expect(beta.totals.promptsMentioningBrandWithOwnCitation).toBe(1);
  });
  it("returns null shares for a panel without citations", () => {
    const empty: Dataset = { id: "panel", createdAt: "2026-11-18T10:00:00.000Z", brands: [{ name: "Alpha", aliases: [] }], observations: [
      { id: "r1", prompt: "A ?", answer: "Alpha est fiable.", source: "Import A", observedAt: "2026-11-01T12:00:00Z", citations: [], mentions: [{ brand: "Alpha", evidence: "x", sentiment: "unknown", method: "heuristic-v1-unvalidated" }] },
    ] };
    const result = citationGaps(empty, "", "Alpha");
    expect(result.totals.citations).toBe(0);
    expect(result.categories.every((c) => c.shareOfCitations === null)).toBe(true);
    expect(result.gaps).toEqual([]);
  });
});

describe("observation provenance", () => {
  it("tags imports and provider runs without breaking stored panels", () => {
    expect(normalizeImport(input).observations.every((o) => o.provenance === "imported")).toBe(true);
    expect(normalizeImport(input, "collected").observations.every((o) => o.provenance === "collected")).toBe(true);
    const mixed = { brands: input.brands, responses: [{ ...input.responses[0], provenance: "collected" }, input.responses[1]] };
    const dataset = normalizeImport(mixed);
    expect(dataset.observations[0].provenance).toBe("collected"); expect(dataset.observations[1].provenance).toBe("imported");
    // Re-normalizing stored observations (competition flow) preserves the origin.
    const reImported = normalizeImport({ brands: input.brands, responses: dataset.observations });
    expect(reImported.observations[0].provenance).toBe("collected"); expect(reImported.observations[1].provenance).toBe("imported");
  });
  it("summarizes provenance and keeps legacy panels as unverified", () => {
    const dataset = normalizeImport(input);
    const report = summarize(dataset, "", "Alpha");
    expect(report.visibility).toBe(75); expect(report.shareOfVoice).toBe(75);
    expect(report.provenance).toEqual({ imported: 4, collected: 0, unverified: 0 });
    for (const observation of dataset.observations) delete observation.provenance;
    expect(summarize(dataset, "", "Alpha").provenance).toEqual({ imported: 0, collected: 0, unverified: 4 });
  });
});
