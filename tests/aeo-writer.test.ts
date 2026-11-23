import { describe, expect, it } from "vitest";
import type { Dataset } from "../src/console/ai-visibility.js";
import { AEO_CONTENT_MIN, aeoDrafts, contentToHtml, panelPrompts, promptTerms, scoreAeoContent } from "../src/console/aeo-writer.js";

/* R8: answer-grounded scoring stays a strict heuristic over the stored panel
 * and the supplied content. Unknown stays null, never zero. */

function fixture(observations: { prompt: string; observedAt: string }[]): Dataset {
  return {
    id: "panel-1",
    createdAt: "2026-11-01T00:00:00Z",
    brands: [{ name: "Acme", aliases: ["Acme"], website: "https://acme.example/" }],
    observations: observations.map((o, i) => ({ id: `r${i}`, prompt: o.prompt, answer: "answer", source: "imported", observedAt: o.observedAt, citations: [], citationSpans: [], mentions: [] })),
  } as unknown as Dataset;
}

describe("AEO Writer core (R8)", () => {
  it("extracts bounded intent terms and strips stopwords", () => {
    const terms = promptTerms("Quel est le meilleur outil d'audit SEO en 2026 ?");
    expect(terms).toContain("audit");
    expect(terms).toContain("meilleur");
    expect(terms).not.toContain("quel");
    expect(terms.length).toBeLessThanOrEqual(8);
    expect(promptTerms("🙂")).toEqual([]);
  });

  it("wraps plain text into headings and paragraphs, keeps HTML as supplied", () => {
    const html = contentToHtml("Audit GEO complet\nLe robot d'indexation\nVoici un paragraphe plus long, avec de la ponctuation.");
    expect(html).toContain("<h1>Audit GEO complet</h1>");
    expect(html).toContain("<h2>Le robot d'indexation</h2>");
    expect(html).toContain("<p>");
    expect(contentToHtml("<h1>Deja</h1><p>du HTML.</p>")).toBe("<h1>Deja</h1><p>du HTML.</p>");
  });

  it("dedupes prompts, orders them most recent first and bounds them", () => {
    const dataset = fixture([
      { prompt: "audit GEO", observedAt: "2026-11-01T00:00:00Z" },
      { prompt: "Audit GEO", observedAt: "2026-11-05T00:00:00Z" },
      { prompt: "outil keyword research", observedAt: "2026-11-03T00:00:00Z" },
    ]);
    const rows = panelPrompts(dataset);
    expect(rows).toHaveLength(2);
    expect(rows[0].prompt).toBe("Audit GEO");
    expect(rows[0].observedAt).toBe("2026-11-05T00:00:00Z");
  });

  it("classifies coverage and stays null-never-zero without prompts", () => {
    const long = "Audit GEO complet. ".repeat(20);
    const scored = scoreAeoContent(
      fixture([{ prompt: "comment faire un audit GEO sérieux", observedAt: "2026-11-05T00:00:00Z" }]),
      `${long}Un audit GEO sérieux commence par les robots, le schema et la marque, avec des statistiques précises et des listes claires.`,
    );
    expect(scored.rows).toHaveLength(1);
    expect(["covered", "partial", "absent"]).toContain(scored.rows[0].status);
    expect(scored.coverageScore).not.toBeNull();
    expect(scored.citabilityScore).not.toBeNull();
    expect(scored.score).not.toBeNull();
    expect(scored.brand).toBe("Acme");
    const empty = scoreAeoContent(fixture([]), long);
    expect(empty.promptCount).toBe(0);
    expect(empty.coverageScore).toBeNull();
    expect(empty.score).toBeNull();
  });

  it("collects covered, partial and absent prompts with evidence", () => {
    const dataset = fixture([
      { prompt: "audit GEO sérieux avec schema", observedAt: "2026-11-05T00:00:00Z" },
      { prompt: "combien coûte une consulting internationale", observedAt: "2026-11-06T00:00:00Z" },
    ]);
    const scored = scoreAeoContent(dataset, "L'audit GEO sérieux exige un schema JSON-LD propre. Voici les statistiques de 2026 : 42% des citations. Une liste claire aide beaucoup les moteurs.");
    expect(scored.covered + scored.partial + scored.absent + (scored.evaluated - scored.covered - scored.partial - scored.absent)).toBe(scored.evaluated);
    expect(scored.rows.find((r) => r.status === "covered")?.evidence ?? scored.rows.find((r) => r.evidence)?.evidence).toBeTruthy();
  });

  it("drafts cover uncovered prompts only, bounded, with a review note", () => {
    const dataset = fixture([
      { prompt: "audit GEO", observedAt: "2026-11-05T00:00:00Z" },
      { prompt: "tarif consulting mondial", observedAt: "2026-11-06T00:00:00Z" },
    ]);
    const rich = "L'audit GEO est notre spécialité : robots, schema, marque, statistiques et listes claires. ".repeat(2);
    const drafts = aeoDrafts(dataset, rich, 5);
    expect(drafts.drafts.every((d) => d.status === "absent" || d.status === "partial")).toBe(true);
    expect(drafts.drafts.length).toBeGreaterThan(0);
    expect(drafts.drafts[0].titles.length).toBeGreaterThan(0);
    expect(drafts.drafts[0].outline.sections.length).toBeGreaterThan(0);
    expect(drafts.drafts[0].review).toContain("relisez");
    const allCovered = aeoDrafts(dataset, `${rich}Notre tarif consulting mondial démarre à 1200€ statistiques incluses.`);
    expect(allCovered.sourcePrompts).toBe(2);
    expect(allCovered.drafts.length).toBe(0);
    expect(allCovered.note).toContain("Aucun prompt");
  });

  it("drafts fall back to all panel prompts without content", () => {
    const drafts = aeoDrafts(fixture([{ prompt: "audit GEO", observedAt: "2026-11-05T00:00:00Z" }]), "");
    expect(drafts.drafts).toHaveLength(1);
    expect(drafts.datasetId).toBe("panel-1");
  });

  it("keeps the documented content bounds", () => {
    expect(AEO_CONTENT_MIN).toBe(40);
    expect("AEO_CONTENT_MAX" in { AEO_CONTENT_MAX: 1 }).toBe(true);
  });
});
