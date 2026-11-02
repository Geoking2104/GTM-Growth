/**
 * Per-platform readiness.
 *
 * The 8-category GEO score says whether a page is well-formed. This maps the
 * same audit evidence onto the five engines buyers actually ask about, so a
 * report can say "ChatGPT 40/100 — llms.txt missing" instead of one number.
 *
 * Derived, not re-crawled: every signal comes from an existing GeoAuditResult.
 */

import type { GeoAuditResult } from "./types.js";

export type PlatformId = "google_aio" | "chatgpt" | "perplexity" | "gemini" | "copilot";

export interface PlatformSignal {
  id: string;
  label: string;
  points: number;
  max: number;
  evidence: string;
  fix?: string;
}

export interface PlatformReadiness {
  id: PlatformId;
  label: string;
  score: number;
  band: "ready" | "partial" | "weak" | "blocked";
  signals: PlatformSignal[];
  mainGap: string;
}

export const PLATFORM_LABEL: Record<PlatformId, string> = {
  google_aio: "Google AI Overviews",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  copilot: "Microsoft Copilot",
};

function band(score: number): PlatformReadiness["band"] {
  if (score >= 80) return "ready";
  if (score >= 60) return "partial";
  if (score >= 40) return "weak";
  return "blocked";
}

/** Pure derivation from a completed audit. */
export function buildPlatformReadiness(audit: GeoAuditResult): PlatformReadiness[] {
  const robots = audit.details.robots;
  const schema = audit.details.schema;
  const content = audit.details.content;
  const llms = audit.details.llms;
  const signals = audit.details.signals;
  const brand = audit.details.brand_entity;

  const allows = (bot: string) => robots.botsAllowed.includes(bot);
  const structured = schema.hasOrganization && schema.hasWebsite;
  const structure = content.hasHeadingHierarchy && content.hasListsOrTables;
  const answerFirst = content.hasFrontLoading && content.numbersCount >= 3;
  const freshness = Boolean(signals.freshnessDate);

  const build = (
    id: PlatformId,
    parts: Array<[string, string, number, boolean, string, string]>
  ): PlatformReadiness => {
    const items: PlatformSignal[] = parts.map(([signalId, label, max, ok, evidence, fix]) => ({
      id: signalId,
      label,
      points: ok ? max : 0,
      max,
      evidence,
      fix: ok ? undefined : fix,
    }));
    const total = items.reduce((sum, item) => sum + item.points, 0);
    const weakest = [...items].sort((a, b) => b.max - b.points - (a.max - a.points))[0];
    return {
      id,
      label: PLATFORM_LABEL[id],
      score: total,
      band: band(total),
      signals: items,
      mainGap: weakest.points === weakest.max ? "No blocking gap found" : weakest.label,
    };
  };

  return [
    build("google_aio", [
      [
        "googlebot",
        "Googlebot allowed in robots.txt",
        25,
        allows("Googlebot"),
        allows("Googlebot") ? "Googlebot is allowed" : "Googlebot is blocked or missing",
        "Allow Googlebot — Google AI Overviews is grounded in the same crawl.",
      ],
      [
        "schema_core",
        "Organization + WebSite schema",
        20,
        structured,
        structured ? "Both types present" : "Missing Organization and/or WebSite",
        "Add Organization and WebSite JSON-LD so the entity resolves.",
      ],
      [
        "schema_qa",
        "FAQ or Article schema",
        15,
        schema.hasFaq || schema.hasArticle,
        schema.hasFaq ? "FAQPage present" : schema.hasArticle ? "Article present" : "Neither present",
        "Add FAQPage (or Article) markup — Q&A pairs are the unit Overviews reuse.",
      ],
      [
        "structure",
        "Extractable structure (H2/H3 + lists)",
        20,
        structure,
        `${content.headingCount} headings, lists/tables: ${content.hasListsOrTables ? "yes" : "no"}`,
        "Use H2/H3 sections and lists so a passage can be lifted cleanly.",
      ],
      [
        "answer_first",
        "Answer-first with concrete figures",
        20,
        answerFirst,
        `${content.numbersCount} numeric token(s), front-loading: ${content.hasFrontLoading ? "yes" : "no"}`,
        "Lead with the direct answer and a number in the first 30% of the copy.",
      ],
    ]),

    build("chatgpt", [
      [
        "oai_search",
        "OAI-SearchBot allowed",
        25,
        allows("OAI-SearchBot"),
        allows("OAI-SearchBot") ? "Allowed" : "Blocked or missing",
        "Explicitly allow OAI-SearchBot in robots.txt.",
      ],
      [
        "llms",
        "llms.txt published",
        20,
        llms.found,
        llms.found ? `${llms.wordCount} words, ${llms.linksCount} links` : "No /llms.txt",
        "Publish /llms.txt with sections and links to the pages worth citing.",
      ],
      [
        "schema_core",
        "Organization schema",
        20,
        schema.hasOrganization,
        schema.hasOrganization ? "Present" : "Missing",
        "Add Organization JSON-LD with name, url, logo and sameAs.",
      ],
      [
        "answer_first",
        "Answer-first content",
        20,
        answerFirst,
        answerFirst ? "Figures in the first 30%" : "No quantified answer up front",
        "Put a quantified answer in the opening paragraph.",
      ],
      [
        "faq",
        "FAQ content",
        15,
        schema.hasFaq,
        schema.hasFaq ? "FAQPage present" : "No FAQPage",
        "Add 3+ real FAQ pairs; assistants lift them almost verbatim.",
      ],
    ]),

    build("perplexity", [
      [
        "perplexitybot",
        "PerplexityBot allowed",
        25,
        allows("PerplexityBot"),
        allows("PerplexityBot") ? "Allowed" : "Blocked or missing",
        "Explicitly allow PerplexityBot in robots.txt.",
      ],
      [
        "llms",
        "llms.txt published",
        20,
        llms.found,
        llms.found ? "Present" : "Missing",
        "Publish /llms.txt so Perplexity can route to the right pages.",
      ],
      [
        "citations",
        "Outbound citations",
        20,
        content.externalLinksCount >= 3,
        `${content.externalLinksCount} external link(s)`,
        "Cite at least three primary sources — Perplexity favours sourced pages.",
      ],
      [
        "structure",
        "Lists and tables",
        20,
        content.hasListsOrTables,
        content.hasListsOrTables ? "Present" : "None",
        "Turn comparisons and steps into lists or tables.",
      ],
      [
        "freshness",
        "Freshness date",
        15,
        freshness,
        signals.freshnessDate ?? "No dateModified",
        "Publish dateModified and keep it current.",
      ],
    ]),

    build("gemini", [
      [
        "googlebot",
        "Googlebot allowed",
        25,
        allows("Googlebot"),
        allows("Googlebot") ? "Allowed" : "Blocked or missing",
        "Allow Googlebot; Gemini grounding uses Google's index.",
      ],
      [
        "entity",
        "Knowledge Graph links (sameAs)",
        25,
        brand.kgPillarCount >= 2,
        `${brand.kgPillarCount}/4 pillars linked`,
        "Add sameAs to Wikipedia, Wikidata, LinkedIn and Crunchbase.",
      ],
      [
        "schema_core",
        "Organization schema",
        20,
        schema.hasOrganization,
        schema.hasOrganization ? "Present" : "Missing",
        "Add Organization JSON-LD so the entity can be disambiguated.",
      ],
      [
        "brand",
        "Consistent brand name",
        15,
        brand.brandNameConsistent,
        brand.brandNameConsistent ? "Consistent across title/H1/schema" : "Inconsistent naming",
        "Use one brand name across title, H1, og:title and schema.",
      ],
      [
        "structure",
        "Extractable structure",
        15,
        structure,
        structure ? "Present" : "Missing H2/H3 or lists",
        "Add H2/H3 sections and lists.",
      ],
    ]),

    build("copilot", [
      [
        "bingbot",
        "Bingbot allowed",
        25,
        allows("Bingbot"),
        allows("Bingbot") ? "Allowed" : "Blocked or missing",
        "Explicitly allow Bingbot in robots.txt.",
      ],
      [
        "schema_core",
        "Organization + WebSite schema",
        20,
        structured,
        structured ? "Both present" : "Missing one or both",
        "Add Organization and WebSite JSON-LD.",
      ],
      [
        "llms",
        "llms.txt published",
        15,
        llms.found,
        llms.found ? "Present" : "Missing",
        "Publish /llms.txt.",
      ],
      [
        "structure",
        "Lists and tables",
        20,
        content.hasListsOrTables,
        content.hasListsOrTables ? "Present" : "None",
        "Structure comparisons as lists or tables.",
      ],
      [
        "freshness",
        "Freshness date",
        20,
        freshness,
        signals.freshnessDate ?? "No dateModified",
        "Publish dateModified.",
      ],
    ]),
  ];
}
