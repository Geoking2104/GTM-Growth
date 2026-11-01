/**
 * Competitive positioning — on-page only.
 *
 * Compares the vocabulary and entity signals of your page against 2–5
 * competitor pages: what all of you say (undifferentiated), what only you say
 * (differentiation), and what only they say (themes you are absent from).
 *
 * Limits, stated up front: this reads public page copy, titles and schema. It
 * does not use rankings, traffic, ad spend or SERP data, so treat it as a
 * positioning mirror, not a market-share measurement.
 */

import { HtmlDoc } from "./html.js";
import { fetchQuiet, fetchText } from "./http.js";
import type { Fetcher } from "./http.js";
import { auditSchema } from "./audit/schema.js";
import { countWords, cutAtFirstSeparator, fold } from "./text.js";

const STOPWORDS = new Set(
  "the and for with that this from your our their they will have has had are was were you can not but all any each more most other into over under about after before between during through out off only own same very just now new how what when where which who whom why does did doing done make makes made get gets got use uses used using learn read more here there we our us it its".split(
    " "
  )
);

const TERM_RE = /[a-zà-ÿ][a-zà-ÿ0-9'-]{3,}/g;

export interface SiteProfile {
  url: string;
  /** URL as supplied, before redirects — used as the report key. */
  requestedUrl?: string;
  name: string;
  title: string;
  h1: string;
  description: string;
  wordCount: number;
  schemaTypes: string[];
  hasLlms: boolean;
  faqQuestions: number;
  terms: Record<string, number>;
}

export interface PositioningComparison {
  overlapScore: number;
  interpretation: "high overlap" | "partial overlap" | "differentiated";
  sharedTerms: Array<{ term: string; primary: number; competitors: number }>;
  uniqueToPrimary: string[];
  competitorOnly: Record<string, string[]>;
  summary: string;
}

export interface PositioningReport extends PositioningComparison {
  primary: Omit<SiteProfile, "terms">;
  competitors: Array<Omit<SiteProfile, "terms">>;
  warnings: string[];
}

/**
 * Prefer the page's main content so navigation and footer labels do not read
 * as positioning. Falls back to the whole body when neither exists.
 */
function mainText(doc: HtmlDoc): string {
  const main = doc.first("main") ?? doc.first("article");
  return main ? doc.textOf(main) : doc.bodyText();
}

/** Weighted term counts: page copy + 3× title/H1/description. */
export function extractTerms(doc: HtmlDoc): Record<string, number> {
  const terms: Record<string, number> = {};
  const add = (text: string, weight: number) => {
    for (const match of fold(text).matchAll(TERM_RE)) {
      const term = match[0];
      if (STOPWORDS.has(term)) continue;
      terms[term] = (terms[term] ?? 0) + weight;
    }
  };

  add(mainText(doc), 1);
  add(doc.title() ?? "", 3);
  const h1 = doc.first("h1");
  if (h1) add(doc.textOf(h1), 3);
  add(doc.metaByName("description")?.attrs.content ?? "", 3);
  return terms;
}

export function profileSite(
  doc: HtmlDoc,
  url: string,
  hasLlms: boolean,
  requestedUrl?: string
): SiteProfile {
  const title = doc.title() ?? "";
  const h1 = doc.first("h1");
  const schema = auditSchema(doc).data;
  const faqQuestions = schema.objects.reduce((sum, object) => {
    const type = object["@type"];
    const isFaq = type === "FAQPage" || (Array.isArray(type) && type.includes("FAQPage"));
    return isFaq && Array.isArray(object["mainEntity"]) ? sum + object["mainEntity"].length : sum;
  }, 0);

  return {
    url,
    requestedUrl,
    name: cutAtFirstSeparator(title) || new URL(url).hostname,
    title,
    h1: h1 ? doc.textOf(h1) : "",
    description: doc.metaByName("description")?.attrs.content ?? "",
    wordCount: countWords(mainText(doc)),
    schemaTypes: schema.foundTypes,
    hasLlms,
    faqQuestions,
    terms: extractTerms(doc),
  };
}

/** Compare profiles without any network access. */
export function comparePositioning(
  primary: SiteProfile,
  competitors: SiteProfile[],
  maxTerms = 10
): PositioningComparison {
  const competitorTerms = competitors.map((competitor) => new Set(Object.keys(competitor.terms)));
  const primaryTerms = Object.keys(primary.terms);

  const shared = primaryTerms.filter((term) => competitorTerms.every((set) => set.has(term)));
  const uniqueToPrimary = primaryTerms
    .filter((term) => competitorTerms.every((set) => !set.has(term)))
    .sort((a, b) => primary.terms[b] - primary.terms[a])
    .slice(0, maxTerms);

  const competitorOnly: Record<string, string[]> = {};
  for (const competitor of competitors) {
    competitorOnly[(competitor.requestedUrl ?? competitor.url).replace(/\/$/, "")] = Object.keys(competitor.terms)
      .filter((term) => !(term in primary.terms))
      .sort((a, b) => competitor.terms[b] - competitor.terms[a])
      .slice(0, maxTerms);
  }

  const union = new Set([...primaryTerms, ...competitors.flatMap((competitor) => Object.keys(competitor.terms))]);
  const overlapScore = union.size ? Math.round((shared.length / union.size) * 100) : 0;
  const interpretation =
    overlapScore >= 40 ? "high overlap" : overlapScore >= 20 ? "partial overlap" : "differentiated";

  const summaryParts = [
    `${overlapScore}% of the combined vocabulary appears on every site audited (${interpretation}).`,
    uniqueToPrimary.length
      ? `You own ${uniqueToPrimary.length} theme(s) no competitor uses: ${uniqueToPrimary.slice(0, 5).join(", ")}.`
      : "No theme is unique to you — the copy is interchangeable with the competitors sampled.",
  ];
  if (competitors.length) {
    const missing = Object.entries(competitorOnly)
      .flatMap(([, terms]) => terms)
      .slice(0, 5);
    if (missing.length) summaryParts.push(`Competitors cover themes you do not: ${missing.join(", ")}.`);
  }

  return {
    overlapScore,
    interpretation,
    sharedTerms: shared.slice(0, 15).map((term) => ({
      term,
      primary: primary.terms[term],
      competitors: competitorTerms.filter((set) => set.has(term)).length,
    })),
    uniqueToPrimary,
    competitorOnly,
    summary: summaryParts.join(" "),
  };
}

export interface PositioningOptions {
  url: string;
  competitors: string[];
  maxTerms?: number;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

async function loadProfile(url: string, fetcher: Fetcher, timeoutMs?: number): Promise<SiteProfile> {
  const target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  const [page, llms] = await Promise.all([
    fetchQuiet(fetcher, target.toString(), { timeoutMs }),
    fetchQuiet(fetcher, new URL("/llms.txt", target).toString(), {
      timeoutMs,
      accept: "text/plain,*/*",
    }),
  ]);
  if (!page || (page.status !== 200 && page.status !== 203)) {
    throw new Error(`Unable to read ${target.toString()} (HTTP ${page?.status ?? 0})`);
  }
  return profileSite(HtmlDoc.parse(page.body), page.url, llms?.status === 200, target.toString());
}

/** Fetch the primary site plus 1–5 competitors and compare positioning. */
export async function analyzePositioning(options: PositioningOptions): Promise<PositioningReport> {
  if (!options.competitors?.length) throw new Error("Provide at least one competitor URL");
  if (options.competitors.length > 5) throw new Error("Provide at most 5 competitors");

  const fetcher = options.fetcher ?? fetchText;
  const primary = await loadProfile(options.url, fetcher, options.timeoutMs);
  const competitors: SiteProfile[] = [];
  for (const competitor of options.competitors) {
    competitors.push(await loadProfile(competitor, fetcher, options.timeoutMs));
  }

  const comparison = comparePositioning(primary, competitors, options.maxTerms ?? 10);
  const warnings: string[] = [];
  for (const profile of [primary, ...competitors]) {
    if (profile.wordCount < 100) {
      warnings.push(
        `${profile.url} returned only ${profile.wordCount} words — likely JS-rendered or bot-blocked, so the comparison may be incomplete.`
      );
    }
  }
  const strip = (profile: SiteProfile): Omit<SiteProfile, "terms"> => {
    const { terms: _terms, ...rest } = profile;
    return rest;
  };

  return {
    ...comparison,
    primary: strip(primary),
    competitors: competitors.map(strip),
    warnings,
  };
}
