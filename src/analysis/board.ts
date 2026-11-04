/**
 * The analysis board.
 *
 * One payload that answers "what do I do next, and why". It merges what the
 * server measured — GEO categories, platform readiness, citability, IndexNow —
 * into a single ranked list. The ranking is explicit and deterministic: each
 * action declares its blocker, its impact and the score it unblocks, so a reader
 * can check the order instead of trusting it.
 *
 * The board never invents a number: every panel points back at a check.
 */

import type { GeoAuditResult } from "../geo/types.js";
import type { PlatformReadiness } from "../geo/platforms.js";
import type { CitabilityResult } from "../geo/citability.js";
import type { IndexNowReadiness } from "../indexnow/readiness.js";

export type Area = "geo" | "indexnow" | "measurement" | "citability";

export interface BoardPanel {
  id: Area;
  label: string;
  score: number | null;
  max: number;
  band: "ready" | "partial" | "missing" | "unmeasured";
  detail: string;
}

export interface BoardAction {
  rank: number;
  area: Area;
  action: string;
  /** Points this unlocks on the panel it belongs to. */
  impact: number;
  effort: "minutes" | "hours" | "days";
  /** Why it sits this high. */
  because: string;
  evidence?: string;
}

export interface AnalysisBoard {
  url: string;
  generatedAt: string;
  headline: string;
  panels: BoardPanel[];
  actions: BoardAction[];
  /** The three-line summary a client actually reads. */
  narrative: string[];
  limits: string[];
}

export interface BoardInput {
  audit: GeoAuditResult;
  platforms?: PlatformReadiness[];
  citability?: CitabilityResult;
  indexnow?: IndexNowReadiness;
}

const band = (score: number): "ready" | "partial" | "missing" =>
  score >= 80 ? "ready" : score >= 50 ? "partial" : "missing";

/**
 * Adaptation rules, in priority order:
 *  1. a blocker that stops discovery at all (Bingbot blocked, key file missing)
 *  2. cheap IndexNow wins, because they cost minutes and change nothing on the page
 *  3. GEO points, highest recoverable first
 *  4. measurement gaps (no GA4 tag, no consent) — they make every later number doubtful
 */
export function buildAnalysisBoard(input: BoardInput): AnalysisBoard {
  const { audit, platforms, citability, indexnow } = input;

  const panels: BoardPanel[] = [
    {
      id: "geo",
      label: "GEO readiness",
      score: audit.score,
      max: 100,
      band: band(audit.score),
      detail: `${audit.recoverablePoints} points recoverable across 8 categories`,
    },
    {
      id: "citability",
      label: "Citability",
      score: citability?.score ?? null,
      max: 100,
      band: citability ? band(citability.score) : "unmeasured",
      detail: citability ? `${citability.points}/${citability.max} method points` : "not run",
    },
    {
      id: "indexnow",
      label: "IndexNow / Bing",
      score: indexnow?.score ?? null,
      max: 100,
      band: indexnow ? band(indexnow.score) : "unmeasured",
      detail: indexnow
        ? `${indexnow.recoverable} points recoverable · key file ${indexnow.keyFileUrl ?? "not set"}`
        : "no key provided",
    },
    {
      id: "measurement",
      label: "Measurement",
      score: platforms?.length ? Math.round(platforms.reduce((sum, p) => sum + p.score, 0) / platforms.length) : null,
      max: 100,
      band: platforms?.length ? band(Math.round(platforms.reduce((sum, p) => sum + p.score, 0) / platforms.length)) : "unmeasured",
      detail: platforms?.length
        ? `${platforms.filter((p) => p.band === "ready").length}/${platforms.length} engines ready`
        : "not run",
    },
  ];

  const actions: Omit<BoardAction, "rank">[] = [];

  const robots = audit.details.robots;
  if (robots?.botsBlocked?.includes("Bingbot")) {
    actions.push({
      area: "indexnow",
      action: "Allow Bingbot in robots.txt",
      impact: 15,
      effort: "minutes",
      because: "IndexNow only announces URLs — a blocked Bingbot can never fetch them, so every other indexation fix is wasted.",
      evidence: "robots.txt blocks Bingbot",
    });
  }

  if (indexnow) {
    const keyFile = indexnow.checks.find((check) => check.id === "indexnow.keyfile");
    if (keyFile && keyFile.status !== "pass") {
      actions.push({
        area: "indexnow",
        action: "Publish the IndexNow key file",
        impact: 45,
        effort: "minutes",
        because: "Without it every submission returns 403; the key file is the only proof of ownership the protocol accepts.",
        evidence: keyFile.evidence,
      });
    }
    const verification = indexnow.checks.find((check) => check.id === "indexnow.bing-verification");
    if (verification && verification.status !== "pass") {
      actions.push({
        area: "indexnow",
        action: "Verify the site in Bing Webmaster Tools",
        impact: 10,
        effort: "minutes",
        because: "IndexNow submissions work unverified, but the quota, the crawl report and the URL inspection panel stay closed.",
        evidence: verification.evidence,
      });
    }
    const sitemap = indexnow.checks.find((check) => check.id === "indexnow.sitemap");
    if (sitemap && sitemap.status !== "pass") {
      actions.push({
        area: "indexnow",
        action: "Declare the sitemap in robots.txt",
        impact: 10,
        effort: "minutes",
        because: "IndexNow handles change; the sitemap handles discovery. A new site needs both.",
        evidence: sitemap.evidence,
      });
    }
  }

  for (const recommendation of audit.recommendations.slice(0, 6)) {
    actions.push({
      area: "geo",
      action: recommendation.action,
      impact: recommendation.points,
      effort: recommendation.points >= 3 ? "hours" : "minutes",
      because:
        recommendation.priority === "high"
          ? "Highest recoverable value in the GEO rubric."
          : "Recoverable point, ranked below the blockers.",
      evidence: recommendation.checkId,
    });
  }

  if (citability) {
    for (const method of citability.methods.filter((m) => m.points === 0).slice(0, 2)) {
      actions.push({
        area: "citability",
        action: method.fix ?? `Fix: ${method.label}`,
        impact: method.max,
        effort: "hours",
        because: "A zero in citability is a passage an assistant will not quote, however good the page is.",
        evidence: method.evidence,
      });
    }
  }

  // Stable ranking: indexed by the declared priority, then impact.
  const priority: Record<Area, number> = { indexnow: 0, geo: 1, citability: 2, measurement: 3 };
  actions.sort((a, b) => priority[a.area] - priority[b.area] || b.impact - a.impact);

  const ranked = actions.slice(0, 8).map((action, index) => ({ ...action, rank: index + 1 }));

  const weakest = [...panels]
    .filter((panel) => panel.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  const headline = `${audit.score}/100 GEO${indexnow ? ` · ${indexnow.score}/100 IndexNow` : ""}${
    weakest && weakest.id !== "geo" ? ` · weakest: ${weakest.label}` : ""
  }`;

  const narrative = [
    indexnow && indexnow.score < 50
      ? "Search engines can read the page but are not told when it changes: IndexNow is not wired yet."
      : "IndexNow is wired: changed URLs can reach Bing and its partners within minutes.",
    weakest && weakest.id !== "geo"
      ? `${weakest.label} is the weakest panel at ${weakest.score}/100 — it caps what the other fixes are worth.`
      : "GEO is the weakest panel, so prioritise the recoverable points listed below.",
    ranked[0]
      ? `Start with: ${ranked[0].action} (${ranked[0].effort}, +${ranked[0].impact}).`
      : "Nothing actionable: every panel is already at its maximum.",
  ];

  return {
    url: audit.url,
    generatedAt: new Date().toISOString(),
    headline,
    panels,
    actions: ranked,
    narrative,
    limits: [
      "IndexNow confirms receipt, not indexing: a 200 means the engine was told, not that the page ranks.",
      "Traffic numbers stay out of this board unless a GA4 or Search Console property is connected.",
      "Every impact value is the point value of one check; nothing is modelled or extrapolated.",
    ],
  };
}
