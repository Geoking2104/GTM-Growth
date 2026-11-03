/**
 * robots.txt parsing with RFC 9309 semantics.
 *
 * Mirrors the model's parser: consecutive `User-agent` lines share one rule
 * block, matching is case-insensitive, the wildcard group is a fallback, and
 * `Disallow: /` with narrower `Allow` paths is a partial block rather than a
 * full one.
 */

import { ROBOTS_MAX_BYTES } from "./config.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

/** Byte length of a string — Buffer-free, so this runs on Workers too. */
function byteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

/** Truncate to a byte budget without splitting a code point. */
function sliceBytes(text: string, maxBytes: number): string {
  return decoder.decode(encoder.encode(text).subarray(0, maxBytes)).replace(/\uFFFD$/, "");
}

export interface AgentRules {
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
  /** True when the group was written with a literal bot name, not `*`. */
  explicit: boolean;
}

export type BotStatus = "allowed" | "blocked" | "partial" | "missing";

export interface BotClassification {
  bot: string;
  status: BotStatus;
  viaWildcard: boolean;
  matchedAgent: string | null;
}

export function parseRobots(content: string): Record<string, AgentRules> {
  let text = content.replace(/^\uFEFF/, "");
  if (byteLength(text) > ROBOTS_MAX_BYTES) {
    text = sliceBytes(text, ROBOTS_MAX_BYTES);
  }

  const groups: Record<string, AgentRules> = {};
  let currentAgents: string[] = [];
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colon = line.indexOf(":");
    if (colon === -1) {
      lastWasAgent = false;
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).split("#")[0].trim();

    if (key === "user-agent") {
      if (!lastWasAgent) currentAgents = [];
      const agent = value;
      if (agent) {
        if (!groups[agent]) {
          groups[agent] = { allow: [], disallow: [], crawlDelay: null, explicit: agent !== "*" };
        }
        currentAgents.push(agent);
      }
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!currentAgents.length) continue;

    for (const agent of currentAgents) {
      const rules = groups[agent];
      if (key === "disallow") rules.disallow.push(value);
      else if (key === "allow") rules.allow.push(value);
      else if (key === "crawl-delay") {
        const delay = Number.parseFloat(value);
        if (Number.isFinite(delay) && delay >= 0 && rules.crawlDelay === null) {
          rules.crawlDelay = delay;
        }
      }
    }
  }

  return groups;
}

function isPathAllowed(path: string, rules: AgentRules): boolean | null {
  let bestLength = -1;
  let decision: boolean | null = null;

  for (const disallow of rules.disallow) {
    if (!disallow) continue;
    if (path.startsWith(disallow) || disallow === "/") {
      if (disallow.length > bestLength) {
        bestLength = disallow.length;
        decision = false;
      }
    }
  }
  for (const allow of rules.allow) {
    if (!allow) continue;
    if (path.startsWith(allow) || allow === "/") {
      if (allow.length > bestLength) {
        bestLength = allow.length;
        decision = true;
      } else if (allow.length === bestLength) {
        decision = true;
      }
    }
  }
  return decision;
}

export function classifyBot(
  bot: string,
  groups: Record<string, AgentRules>
): BotClassification {
  const match = Object.keys(groups).find((a) => a.toLowerCase() === bot.toLowerCase());
  const viaWildcard = !match && Object.prototype.hasOwnProperty.call(groups, "*");
  const agent = match ?? (viaWildcard ? "*" : null);
  if (!agent) {
    return { bot, status: "missing", viaWildcard: false, matchedAgent: null };
  }

  const rules = groups[agent];
  const blockedAtRoot = rules.disallow.some((d) => d === "/" || d === "/*");
  const allowedAtRoot = rules.allow.some((a) => a === "/" || a === "/*");

  if (blockedAtRoot && !allowedAtRoot) {
    const specificAllows = rules.allow.filter((a) => a && a !== "/" && a !== "/*");
    return {
      bot,
      status: specificAllows.length ? "partial" : "blocked",
      viaWildcard,
      matchedAgent: agent,
    };
  }
  if (!rules.disallow.length || rules.disallow.every((d) => d === "")) {
    return { bot, status: "allowed", viaWildcard, matchedAgent: agent };
  }
  const decision = isPathAllowed("/", rules);
  return {
    bot,
    status: decision === false ? "blocked" : "allowed",
    viaWildcard,
    matchedAgent: agent,
  };
}

export function extractSitemaps(content: string): string[] {
  const out: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const colon = rawLine.indexOf(":");
    if (colon === -1) continue;
    const key = rawLine.slice(0, colon).trim().toLowerCase();
    const value = rawLine.slice(colon + 1).split("#")[0].trim();
    if (key === "sitemap" && /^https?:\/\//i.test(value)) out.push(value);
  }
  return out;
}
