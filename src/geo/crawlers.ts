/**
 * AI crawler access matrix.
 *
 * Same classification as the audit, exposed per bot and grouped by tier
 * (training / search / user) so a team can see *which* crawler is shut out,
 * not just whether robots.txt exists.
 */

import { AI_BOTS, BOT_TIERS, CITATION_BOTS } from "./config.js";
import { fetchQuiet, fetchText } from "./http.js";
import type { Fetcher } from "./http.js";
import { classifyBot, parseRobots } from "./robots.js";
import type { BotStatus } from "./robots.js";

export type BotTier = keyof typeof BOT_TIERS;

export interface CrawlerRow {
  bot: string;
  tier: BotTier;
  status: BotStatus;
  viaWildcard: boolean;
  matchedAgent: string | null;
}

export interface CrawlerMatrix {
  rows: CrawlerRow[];
  summary: {
    total: number;
    allowed: number;
    partial: number;
    blocked: number;
    missing: number;
    citationBotsOk: boolean;
    blockedCitationBots: string[];
    tierTotals: Record<BotTier, { allowed: number; blocked: number; missing: number }>;
  };
}

const TIER_OF = new Map<string, BotTier>();
for (const tier of Object.keys(BOT_TIERS) as BotTier[]) {
  for (const bot of BOT_TIERS[tier]) TIER_OF.set(bot, tier);
}

/** Build the per-bot matrix from robots.txt content (pure). */
export function buildCrawlerMatrix(robotsBody: string | null): CrawlerMatrix {
  const groups = robotsBody === null ? {} : parseRobots(robotsBody);
  const rows: CrawlerRow[] = Object.keys(AI_BOTS).map((bot) => {
    const classified = classifyBot(bot, groups);
    const tier = TIER_OF.get(bot) ?? "training";
    return {
      bot,
      tier,
      status: classified.status,
      viaWildcard: classified.viaWildcard,
      matchedAgent: classified.matchedAgent,
    };
  });

  const tierTotals = {
    training: { allowed: 0, blocked: 0, missing: 0 },
    search: { allowed: 0, blocked: 0, missing: 0 },
    user: { allowed: 0, blocked: 0, missing: 0 },
  } satisfies CrawlerMatrix["summary"]["tierTotals"];

  for (const row of rows) {
    if (row.status === "allowed" || row.status === "partial") tierTotals[row.tier].allowed += 1;
    else if (row.status === "blocked") tierTotals[row.tier].blocked += 1;
    else tierTotals[row.tier].missing += 1;
  }

  const blockedCitationBots = CITATION_BOTS.filter(
    (bot) => rows.find((row) => row.bot === bot)?.status === "blocked"
  );
  const citationBotsOk = CITATION_BOTS.every((bot) => {
    const status = rows.find((row) => row.bot === bot)?.status;
    return status === "allowed" || status === "partial";
  });

  return {
    rows,
    summary: {
      total: rows.length,
      allowed: rows.filter((row) => row.status === "allowed").length,
      partial: rows.filter((row) => row.status === "partial").length,
      blocked: rows.filter((row) => row.status === "blocked").length,
      missing: rows.filter((row) => row.status === "missing").length,
      citationBotsOk,
      blockedCitationBots,
      tierTotals,
    },
  };
}

export interface CrawlerAccessOptions {
  url: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

/** Fetch /robots.txt and return the matrix plus the raw status. */
export async function getCrawlerAccess(options: CrawlerAccessOptions) {
  const fetcher = options.fetcher ?? fetchText;
  const base = new URL(/^https?:\/\//i.test(options.url) ? options.url : `https://${options.url}`);
  const robotsUrl = new URL("/robots.txt", base.origin).toString();
  const response = await fetchQuiet(fetcher, robotsUrl, {
    timeoutMs: options.timeoutMs,
    accept: "text/plain,*/*",
  });

  const found = response?.status === 200;
  const matrix = buildCrawlerMatrix(found ? (response?.body ?? "") : null);

  return {
    url: base.origin,
    robotsUrl,
    robotsFound: found,
    robotsStatus: response?.status ?? 0,
    ...matrix,
  };
}
