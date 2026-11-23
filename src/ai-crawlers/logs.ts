/**
 * AI-crawler log analytics (R6): parse operator-supplied server/CDN access
 * logs (nginx combined format) and report the crawl coverage of AI crawlers
 * (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot,
 * PerplexityBot, …) per site section. Evidence-first: the analysis covers only
 * the supplied log lines, unknown or unparsable lines are counted as ignored,
 * never guessed, and every result carries the tenant-supplied provenance with
 * its parse date. No partner call and no stored state: self-hosted stays free.
 */
import { AI_BOTS } from "../geo/config.js";

export const AI_CRAWLER_LOGS_VERSION = "ai-crawler-logs-v1";
export const AI_CRAWLER_LOGS_MAX_BYTES = 512 * 1024;
export const AI_CRAWLER_LOGS_MAX_LINES = 5_000;
/** Sections are first-level path segments; coverage tables stay bounded. */
export const AI_CRAWLER_SECTIONS_LIMIT = 50;

export interface AiCrawlerCoverageRow {
  bot: string;
  owner: string;
  requests: number;
  pages: number;
  served: number;
  errors: number;
}

export interface AiCrawlerSectionRow {
  section: string;
  requests: number;
  pages: number;
  byCrawler: Record<string, number>;
}

export interface AiCrawlerStats {
  version: typeof AI_CRAWLER_LOGS_VERSION;
  provenance: { source: "tenant-supplied-access-logs"; parsedAt: string; logFormat: "nginx-combined" };
  totals: { lines: number; parsed: number; ignored: number; crawlerRequests: number; otherRequests: number };
  crawlers: AiCrawlerCoverageRow[];
  sections: AiCrawlerSectionRow[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  note: string;
}

const COMBINED = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)(?:\s+[^"]*)?"\s+(\d{3})\s+(?:\d+|-)\s+"[^"]*"\s+"([^"]*)"$/;
// Common log format without referer: still carries a quoted user agent.
const COMMON_WITH_AGENT = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)(?:\s+[^"]*)?"\s+(\d{3})\s+(?:\d+|-)\s+"([^"]*)"$/;

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** nginx timestamps are "23/Nov/2026:10:00:00 +0100"; the Date constructor cannot parse them. */
function parseAccessDate(raw: string): string | null {
  const match = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?$/.exec(raw);
  if (!match) return null;
  const [, day, monthName, year, hh, mm, ss, sign, oh, om] = match;
  const month = MONTHS[monthName];
  if (month === undefined) return null;
  const date = Date.UTC(Number(year), month, Number(day), Number(hh), Number(mm), Number(ss));
  if (!Number.isFinite(date)) return null;
  let offsetMinutes = 0;
  if (sign && oh !== undefined && om !== undefined) {
    offsetMinutes = Number(oh) * 60 + Number(om);
    if (sign === "+") offsetMinutes = -offsetMinutes; // convert to UTC by removing the local offset
  }
  return new Date(date + offsetMinutes * 60_000).toISOString();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BOUNDARY_BEFORE = "(^|[^A-Za-z0-9-])";
const BOUNDARY_AFTER = "([^A-Za-z0-9-]|$)";
const matches: Array<{ bot: string; pattern: RegExp }> = Object.keys(AI_BOTS).map((bot) => ({
  bot,
  pattern: new RegExp(`${BOUNDARY_BEFORE}${escapeRegExp(bot)}${BOUNDARY_AFTER}`),
}));

/** Longest-token match, so "AI2Bot-Dolma" never classifies as "AI2Bot". */
export function classifyCrawler(userAgent: string): string | null {
  let found: string | null = null;
  for (const { bot, pattern } of matches) {
    if (pattern.test(userAgent) && (found === null || bot.length > found.length)) found = bot;
  }
  return found;
}

/** First path segment is the site section; the root is its own section. */
export function sectionOf(rawPath: string): string {
  let pathname = rawPath;
  const query = pathname.indexOf("?");
  if (query !== -1) pathname = pathname.slice(0, query);
  const hash = pathname.indexOf("#");
  if (hash !== -1) pathname = pathname.slice(0, hash);
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  const segments = pathname.split("/").filter(Boolean);
  return segments.length ? `/${segments[0]}` : "/";
}

export function analyzeAiCrawlerLogs(input: { logs: string; now?: Date }): AiCrawlerStats {
  const logs = input.logs ?? "";
  if (Buffer.byteLength(logs, "utf8") > AI_CRAWLER_LOGS_MAX_BYTES)
    throw new Error(`Journaux trop volumineux (limite ${AI_CRAWLER_LOGS_MAX_BYTES} octets) ; fournissez un extrait plus court.`);
  const lines = logs.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  if (lines.length > AI_CRAWLER_LOGS_MAX_LINES)
    throw new Error(`Trop de lignes de journaux (limite ${AI_CRAWLER_LOGS_MAX_LINES}) ; fournissez un extrait plus court.`);
  if (!lines.length) throw new Error("Aucune ligne de journal fournie (format nginx combiné attendu).");
  const now = input.now ?? new Date();

  const crawlerRows = new Map<string, { requests: number; pages: Set<string>; served: number; errors: number }>();
  const sectionRows = new Map<string, { requests: number; pages: Set<string>; byCrawler: Map<string, number> }>();
  let parsed = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;

  for (const line of lines) {
    const match = COMBINED.exec(line) ?? COMMON_WITH_AGENT.exec(line);
    if (!match) continue;
    parsed++;
    const [, , dateRaw, , rawPath, statusRaw, userAgent] = match;
    const status = Number(statusRaw);
    const observedAt = parseAccessDate(dateRaw);
    if (observedAt) {
      if (firstSeen === null || observedAt < firstSeen) firstSeen = observedAt;
      if (lastSeen === null || observedAt > lastSeen) lastSeen = observedAt;
    }
    const section = sectionOf(rawPath);
    const bot = classifyCrawler(userAgent);
    if (!bot) continue;
    let row = crawlerRows.get(bot);
    if (!row) { row = { requests: 0, pages: new Set(), served: 0, errors: 0 }; crawlerRows.set(bot, row); }
    row.requests++;
    row.pages.add(rawPath);
    if (status >= 200 && status < 300) row.served++;
    else if (status >= 400) row.errors++;
    let sectionRow = sectionRows.get(section);
    if (!sectionRow) { sectionRow = { requests: 0, pages: new Set(), byCrawler: new Map() }; sectionRows.set(section, sectionRow); }
    sectionRow.requests++;
    sectionRow.pages.add(rawPath);
    sectionRow.byCrawler.set(bot, (sectionRow.byCrawler.get(bot) ?? 0) + 1);
  }

  const crawlerRequests = [...crawlerRows.values()].reduce((sum, row) => sum + row.requests, 0);
  const crawlers: AiCrawlerCoverageRow[] = [...crawlerRows.entries()]
    .map(([bot, row]) => ({ bot, owner: AI_BOTS[bot], requests: row.requests, pages: row.pages.size, served: row.served, errors: row.errors }))
    .sort((a, b) => b.requests - a.requests || a.bot.localeCompare(b.bot));
  const sections: AiCrawlerSectionRow[] = [...sectionRows.entries()]
    .map(([section, row]) => ({ section, requests: row.requests, pages: row.pages.size, byCrawler: Object.fromEntries([...row.byCrawler.entries()].sort()) }))
    .sort((a, b) => b.requests - a.requests || a.section.localeCompare(b.section))
    .slice(0, AI_CRAWLER_SECTIONS_LIMIT);

  return {
    version: AI_CRAWLER_LOGS_VERSION,
    provenance: { source: "tenant-supplied-access-logs", parsedAt: now.toISOString(), logFormat: "nginx-combined" },
    totals: { lines: lines.length, parsed, ignored: lines.length - parsed, crawlerRequests, otherRequests: parsed - crawlerRequests },
    crawlers,
    sections,
    firstSeenAt: firstSeen,
    lastSeenAt: lastSeen,
    note: `Analyse fondée uniquement sur les ${parsed} lignes analysables des journaux fournis (format nginx combiné) ; ${lines.length - parsed} ligne(s) ignorée(s). Aucune donnée n'est inventée hors de ces journaux, et les sections non crawlées dans la période restent inconnues.`,
  };
}
