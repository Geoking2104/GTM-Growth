import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalisePublicUrl, rankRecommendations, explainRecommendation } from "../site/console/public-read-model.js";

const file = (path: string): string => readFileSync(join(process.cwd(), "site", path), "utf8");

const fixes = [
  { checkId: "content.word_count", category: "content", priority: "medium", points: 8, status: "fail", action: "Add words", evidence: "120 words" },
  { checkId: "robots.citation_bots", category: "robots", priority: "high", points: 3, status: "fail", action: "Add agents", evidence: "5 missing bots" },
  { checkId: "llms.h1", category: "llms", priority: "high", points: 3, status: "fail", action: "Add H1", evidence: "No heading" },
  { checkId: "meta.x_robots_noindex", category: "meta", priority: "critical", points: 0, status: "fail", action: "Remove noindex", evidence: "noindex" },
  { checkId: "content.links", category: "content", priority: "low", points: 3, status: "fail", action: "Add sources", evidence: "0 external links" },
];

describe("public recommendation assistant", () => {
  it("validates domain inputs and removes URL fragments", () => {
    expect(normalisePublicUrl("example.com/path#section")).toBe("https://example.com/path");
    expect(normalisePublicUrl("http://localhost:8000/")).toBeNull();
    expect(normalisePublicUrl("javascript:alert(1)")).toBeNull();
    expect(normalisePublicUrl("https://user:pass@example.com/")).toBeNull();
  });

  it("ranks only failing controls, with critical blockers first", () => {
    const quick = rankRecommendations([...fixes, { ...fixes[0], status: "pass" }], "quick");
    const impact = rankRecommendations(fixes, "impact");
    const ai = rankRecommendations(fixes, "ai");
    expect(quick[0].checkId).toBe("meta.x_robots_noindex");
    expect(impact[0].checkId).toBe("meta.x_robots_noindex");
    expect(ai[0].checkId).toBe("meta.x_robots_noindex");
    expect(new Set(quick.map((fix) => fix.checkId)).size).toBe(quick.length);
    expect(quick.slice(1).map((fix) => fix.checkId)).not.toEqual(impact.slice(1).map((fix) => fix.checkId));
  });

  it("localises every observed GEO v1 recommendation, including three real opendpe examples", () => {
    for (const fix of fixes) {
      const fr = explainRecommendation(fix, "fr");
      const en = explainRecommendation(fix, "en");
      expect(fr.title).not.toBe("Améliorer ce signal mesuré");
      expect(fr.steps.length).toBeGreaterThan(20);
      expect(fr.effect).not.toBe(en.effect);
    }
    expect(explainRecommendation({ checkId: "schema.article", category: "schema" }, "fr").title).toMatch(/éditoriaux/);
    expect(explainRecommendation({ checkId: "brand.kg_readiness", category: "brand_entity" }, "fr").steps).toContain("sameAs");
  });

  it("keeps a fully bilingual public shell and the same dark CSS", () => {
    const html = file("console/index.html");
    expect(html).toContain('id="c-public-url-form"');
    expect(html).toContain('id="c-public-read"');
    expect(html).toContain('href="../brand.css"');
    const locale = file("console/locale-shell.js");
    expect(locale).toContain('urlButton: "Run free analysis');
    expect(locale).toContain('urlButton: "Analyser gratuitement');
    const render = file("console/public-read.js");
    expect(render).toContain('"../assets/ai-engines/google.svg"');
    expect(render).toContain('"../assets/ai-engines/bing.svg"');
    expect(render).toContain('"../assets/ai-engines/openai.svg"');
    expect(render).toContain("rankRecommendations(opportunities, mode)");
    expect(render).toContain("copy.consent");
    expect(file("console/shell.css")).toContain(".public-recommend-button");
  });
});
