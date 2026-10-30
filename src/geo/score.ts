import { CATEGORY_MAX, SCORE_BANDS } from "./config.js";
import type { GeoCategory } from "./config.js";
import type { GeoCheck, Recommendation } from "./types.js";

const CRITICAL_CHECKS = new Set(["meta.x_robots_noindex", "meta.noai"]);

const HIGH_CHECKS = new Set([
  "robots.found",
  "robots.citation_bots",
  "llms.found",
  "meta.title",
]);

const LOW_CHECKS = new Set([
  "signals.lang",
  "signals.rss",
  "signals.freshness",
  "ai_discovery.well_known",
  "ai_discovery.summary",
  "ai_discovery.faq",
  "ai_discovery.service",
  "content.numbers",
  "content.links",
  "content.image_alt",
]);

/** Priority buckets mirror the model: blockers → high → medium → low. */
export function priorityOf(check: GeoCheck): Recommendation["priority"] {
  if (CRITICAL_CHECKS.has(check.id)) return "critical";
  if (HIGH_CHECKS.has(check.id)) return "high";
  if (LOW_CHECKS.has(check.id)) return "low";
  if (check.category === "content") return "medium";
  return "medium";
}

export function computeBreakdown(
  checks: GeoCheck[]
): Record<GeoCategory, number> {
  const breakdown = Object.fromEntries(
    Object.keys(CATEGORY_MAX).map((category) => [category, 0])
  ) as Record<GeoCategory, number>;

  for (const check of checks) {
    breakdown[check.category] += check.earned;
  }

  for (const category of Object.keys(breakdown) as GeoCategory[]) {
    breakdown[category] = Math.max(0, Math.min(breakdown[category], CATEGORY_MAX[category]));
  }
  return breakdown;
}

export function scoreOf(breakdown: Record<GeoCategory, number>): number {
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return Math.max(0, Math.min(100, total));
}

export function bandOf(score: number): keyof typeof SCORE_BANDS {
  for (const [band, [low, high]] of Object.entries(SCORE_BANDS)) {
    if (score >= low && score <= high) return band as keyof typeof SCORE_BANDS;
  }
  return "critical";
}

/**
 * Turn failing checks into a prioritized action list. Within a bucket, the
 * items that recover the most points come first, so "what to fix first" is
 * derived from the rubric rather than from editorial guesswork.
 */
export function buildRecommendations(checks: GeoCheck[]): Recommendation[] {
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return checks
    .filter((check) => check.status !== "pass" && check.status !== "info" && check.fix)
    .map((check) => ({
      priority: priorityOf(check),
      category: check.category as Recommendation["category"],
      checkId: check.id,
      points: Math.max(0, check.max - check.earned),
      action: check.fix as string,
    }))
    .sort((a, b) => order[a.priority] - order[b.priority] || b.points - a.points);
}
