import { describe, expect, it } from "vitest";
import { buildAnalysisBoard } from "../src/analysis/board.js";
import { scoreIndexNowReadiness as score } from "../src/indexnow/readiness.js";
import type { GeoAuditResult } from "../src/geo/types.js";

function audit(overrides: Partial<GeoAuditResult> = {}): GeoAuditResult {
  return {
    url: "https://example.com",
    finalUrl: "https://example.com/",
    score: 71,
    recoverablePoints: 29,
    projectedScore: 100,
    recommendations: [
      { priority: "high", category: "robots", checkId: "robots.citation_bots", points: 3, action: "Add explicit citation-bot rules" },
      { priority: "medium", category: "schema", checkId: "schema.article", points: 3, action: "Add Article schema" },
    ],
    details: { robots: { found: true, botsBlocked: [], sitemaps: ["https://example.com/sitemap.xml"] } },
    ...overrides,
  } as unknown as GeoAuditResult;
}

const verifiedKey = {
  ok: true,
  keyFileUrl: "https://example.com/abcd1234efgh5678.txt",
  status: 200,
  found: "abcd1234efgh5678",
  problems: [],
  nextStep: "",
};

describe("IndexNow readiness", () => {
  it("scores 100 when every check passes", () => {
    const readiness = score({
      host: "example.com",
      https: true,
      audit: audit(),
      key: "abcd1234efgh5678",
      keyVerification: verifiedKey,
      bingVerification: "ABC123",
    });
    expect(readiness.score).toBe(100);
    expect(readiness.band).toBe("ready");
    expect(readiness.recoverable).toBe(0);
  });

  it("drops to a missing band when there is no key at all", () => {
    const readiness = score({ host: "example.com", https: true, audit: audit(), key: null });
    expect(readiness.score).toBeLessThan(50);
    expect(readiness.band).toBe("missing");
    expect(readiness.checks.find((check) => check.id === "indexnow.keyfile")?.status).toBe("warn");
  });

  it("fails the key-file check when verification returns 404", () => {
    const readiness = score({
      host: "example.com",
      https: true,
      audit: audit(),
      key: "abcd1234efgh5678",
      keyVerification: { ...verifiedKey, ok: false, status: 404, found: null, problems: ["404"] },
    });
    const check = readiness.checks.find((item) => item.id === "indexnow.keyfile");
    expect(check?.status).toBe("fail");
    expect(check?.points).toBe(0);
    expect(check?.evidence).toContain("404");
  });

  it("blames Bingbot when robots.txt blocks it", () => {
    const blocked = audit({ details: { robots: { found: true, botsBlocked: ["Bingbot"], sitemaps: [] } } } as never);
    const readiness = score({
      host: "example.com",
      https: true,
      audit: blocked,
      key: "abcd1234efgh5678",
      keyVerification: verifiedKey,
    });
    const check = readiness.checks.find((item) => item.id === "indexnow.bingbot");
    expect(check?.status).toBe("fail");
    expect(check?.fix).toContain("Bingbot");
  });

  it("counts every point exactly once", () => {
    const readiness = score({ host: "example.com", https: true, audit: audit(), key: null });
    const max = readiness.checks.reduce((sum, check) => sum + check.max, 0);
    expect(max).toBe(100);
  });
});

describe("analysis board", () => {
  const indexnowBroken = score({
    host: "example.com",
    https: true,
    audit: audit(),
    key: "abcd1234efgh5678",
    keyVerification: { ...verifiedKey, ok: false, status: 404, found: null, problems: ["404"] },
  });

  it("puts the IndexNow blocker before GEO points", () => {
    const board = buildAnalysisBoard({ audit: audit(), indexnow: indexnowBroken });
    expect(board.actions[0].area).toBe("indexnow");
    expect(board.actions[0].action).toContain("key file");
    expect(board.actions.some((action) => action.area === "geo")).toBe(true);
  });

  it("does not invent an action when everything passes", () => {
    const perfect = score({
      host: "example.com",
      https: true,
      audit: audit({ recommendations: [] } as never),
      key: "abcd1234efgh5678",
      keyVerification: verifiedKey,
      bingVerification: "ABC123",
    });
    const board = buildAnalysisBoard({ audit: audit({ recommendations: [] } as never), indexnow: perfect });
    expect(board.actions).toHaveLength(0);
    expect(board.narrative[2]).toContain("Nothing actionable");
  });

  it("keeps the ranking deterministic", () => {
    const first = buildAnalysisBoard({ audit: audit(), indexnow: indexnowBroken });
    const second = buildAnalysisBoard({ audit: audit(), indexnow: indexnowBroken });
    expect(first.actions.map((action) => action.action)).toEqual(second.actions.map((action) => action.action));
    expect(first.actions.map((action) => action.rank)).toEqual([1, 2, 3, 4].slice(0, first.actions.length));
  });

  it("never reports more than eight actions", () => {
    const many = audit({
      recommendations: Array.from({ length: 20 }, (_, i) => ({
        priority: "medium",
        category: "meta",
        checkId: `c.${i}`,
        points: 1,
        action: `fix ${i}`,
      })),
    } as never);
    const board = buildAnalysisBoard({ audit: many, indexnow: indexnowBroken });
    expect(board.actions.length).toBeLessThanOrEqual(8);
  });

  it("carries its limits so the numbers cannot be over-read", () => {
    const board = buildAnalysisBoard({ audit: audit(), indexnow: indexnowBroken });
    expect(board.limits.join(" ")).toContain("receipt, not indexing");
  });
});
