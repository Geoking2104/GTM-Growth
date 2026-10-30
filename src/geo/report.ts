import type { GeoAuditResult } from "./types.js";

/**
 * Compact a full audit for an agent or a CLI reader: the score, the evidence
 * behind every check, the prioritized fixes, and the few facts an LLM needs to
 * explain the result. Raw HTML and full JSON-LD objects stay out of the payload.
 */
export function summarizeAudit(result: GeoAuditResult) {
  return {
    url: result.url,
    finalUrl: result.finalUrl,
    httpStatus: result.httpStatus,
    durationMs: result.durationMs,
    score: result.score,
    band: result.band,
    scoreBreakdown: result.scoreBreakdown,
    scoreMax: result.scoreMax,
    error: result.error,
    facts: {
      title: result.details.meta.title,
      descriptionLength: result.details.meta.descriptionLength,
      h1: result.details.content.h1,
      wordCount: result.details.content.wordCount,
      schemaTypes: result.details.schema.foundTypes,
      robots: {
        found: result.details.robots.found,
        blocked: result.details.robots.botsBlocked,
        missing: result.details.robots.botsMissing,
        citationBotsExplicit: result.details.robots.citationBotsExplicit,
      },
      llms: {
        found: result.details.llms.found,
        wordCount: result.details.llms.wordCount,
        links: result.details.llms.linksCount,
      },
      aiDiscovery: {
        wellKnownAi: result.details.ai_discovery.hasWellKnownAi,
        summary: result.details.ai_discovery.summaryValid,
        faq: result.details.ai_discovery.hasFaq,
        service: result.details.ai_discovery.hasService,
      },
    },
    checks: result.checks.map((check) => ({
      id: check.id,
      status: check.status,
      points: `${check.earned}/${check.max}`,
      evidence: check.evidence,
    })),
    recommendations: result.recommendations.slice(0, 12),
  };
}
