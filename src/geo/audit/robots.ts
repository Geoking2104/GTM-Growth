import {
  AI_BOTS,
  CITATION_BOTS,
  CITATION_BOTS_DISPLAY,
  ROBOTS_PARTIAL_SCORE,
  WEIGHTS,
} from "../config.js";
import { classifyBot, extractSitemaps, parseRobots } from "../robots.js";
import type { CategoryResult, GeoCheck, RobotsAudit } from "../types.js";

/**
 * Audit /robots.txt for AI-crawler access.
 *
 * A robots.txt that exists but blocks the search-tier crawlers is worse than a
 * missing one: points are only awarded when the citation bots can reach the
 * page, either explicitly or through the wildcard group.
 */
export function auditRobots(
  body: string | null,
  status: number
): CategoryResult<RobotsAudit> {
  const found = status === 200 && body !== null;
  const content = found ? (body as string) : "";
  const groups = found ? parseRobots(content) : {};

  const data: RobotsAudit = {
    found,
    status,
    crawlDelay: groups["*"]?.crawlDelay ?? null,
    sitemaps: found ? extractSitemaps(content) : [],
    botsAllowed: [],
    botsBlocked: [],
    botsMissing: [],
    botsPartial: [],
    citationBotsOk: false,
    citationBotsExplicit: false,
    groups,
  };

  if (found) {
    for (const bot of Object.keys(AI_BOTS)) {
      const result = classifyBot(bot, groups);
      if (result.status === "allowed") data.botsAllowed.push(bot);
      else if (result.status === "blocked") data.botsBlocked.push(bot);
      else if (result.status === "partial") {
        data.botsAllowed.push(bot);
        data.botsPartial.push(bot);
      } else data.botsMissing.push(bot);
    }

    data.citationBotsOk = CITATION_BOTS.every((bot) => data.botsAllowed.includes(bot));
    data.citationBotsExplicit = CITATION_BOTS.every((bot) => {
      const result = classifyBot(bot, groups);
      return (result.status === "allowed" || result.status === "partial") && !result.viaWildcard;
    });
  }

  const checks: GeoCheck[] = [
    {
      id: "robots.found",
      category: "robots",
      label: "robots.txt is reachable",
      earned: found ? WEIGHTS.robots_found : 0,
      max: WEIGHTS.robots_found,
      status: found ? "pass" : "fail",
      evidence: found
        ? `HTTP 200, ${Object.keys(groups).length} user-agent group(s) parsed`
        : `No usable robots.txt (HTTP ${status})`,
      fix: found
        ? undefined
        : "Publish /robots.txt with explicit Allow rules for AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot).",
    },
  ];

  let citationPoints = 0;
  let citationStatus: GeoCheck["status"] = "fail";
  let citationEvidence = "robots.txt unavailable, so AI citation bots are unverified";
  let citationFix: string | undefined =
    "Create robots.txt and explicitly allow OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot and Applebot.";

  if (found && data.citationBotsOk && data.citationBotsExplicit) {
    citationPoints = WEIGHTS.robots_citation_ok;
    citationStatus = "pass";
    citationEvidence = `All citation bots explicitly allowed (${CITATION_BOTS_DISPLAY})`;
    citationFix = undefined;
  } else if (found && data.citationBotsOk) {
    citationPoints = ROBOTS_PARTIAL_SCORE;
    citationStatus = "partial";
    citationEvidence =
      "Citation bots are allowed only through the wildcard group — an explicit rule is safer";
    citationFix = `Add explicit User-agent rules for ${CITATION_BOTS_DISPLAY} instead of relying on "*".`;
  } else if (found && data.botsAllowed.length) {
    citationPoints = ROBOTS_PARTIAL_SCORE;
    citationStatus = "partial";
    citationEvidence = `Allowed: ${data.botsAllowed.join(", ") || "none"} · blocked: ${
      data.botsBlocked.join(", ") || "none"
    } · missing: ${data.botsMissing.join(", ") || "none"}`;
    citationFix = `Allow the missing citation bots: ${CITATION_BOTS.filter(
      (bot) => !data.botsAllowed.includes(bot)
    ).join(", ")}.`;
  } else if (found) {
    citationEvidence = `No AI crawler group found. Blocked: ${
      data.botsBlocked.join(", ") || "none"
    }`;
  }

  checks.push({
    id: "robots.citation_bots",
    category: "robots",
    label: "AI citation crawlers are allowed",
    earned: citationPoints,
    max: WEIGHTS.robots_citation_ok,
    status: citationStatus,
    evidence: citationEvidence,
    fix: citationFix,
  });

  if (data.crawlDelay !== null && data.crawlDelay > 10) {
    checks.push({
      id: "robots.crawl_delay",
      category: "robots",
      label: "Crawl-delay is not throttling AI crawlers",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `Crawl-delay: ${data.crawlDelay}s applies to all agents`,
      fix: "Reduce robots.txt Crawl-delay to 5s or less, or remove it — AI crawlers may skip re-indexing.",
    });
  }

  return { data, checks };
}
