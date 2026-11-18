/** Citation gap analysis for one stored AI-visibility panel (benchmark R2).
 * Sources actually cited by collected or imported answers are classified per
 * host and diffed against the tracked brand's own declared website.
 * A brand without a declared website is unknown evidence: the own-source gap
 * stays unevaluated, it is never reported as zero. Cited URLs describe this
 * stored panel only; they do not measure engine market share or all sessions. */
import type { Dataset } from "./ai-visibility.js";

export type CitationCategory = "own" | "competitor" | "reddit" | "youtube" | "linkedin" | "wikipedia" | "web";
export const CITATION_CATEGORIES: CitationCategory[] = ["own", "competitor", "reddit", "youtube", "linkedin", "wikipedia", "web"];

const bare = (value: string) => { try { return new URL(value).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
function communityCategory(host: string): CitationCategory | null {
  if (host === "reddit.com" || host.endsWith(".reddit.com")) return "reddit";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be" || host === "m.youtube.com") return "youtube";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in") return "linkedin";
  if (host === "wikipedia.org" || host.endsWith(".wikipedia.org")) return "wikipedia";
  return null;
}
const MAX_GAPS = 50;
const MAX_HOSTS = 10;

export interface CitationCategoryRow { category: CitationCategory; citations: number; citedPrompts: number; shareOfCitations: number | null }
export interface CitationHostRow { host: string; category: CitationCategory; citations: number; example: string }
export interface CitationGapRow { id: string; prompt: string; observedAt: string; evidence: string; citations: string[] }
export interface CitationGaps {
  panel: string; createdAt: string; brand: string; source: string | null;
  ownWebsite: string | null; evaluated: boolean; note: string;
  totals: { observations: number; withCitations: number; citations: number; promptsMentioningBrand: number; promptsMentioningBrandWithOwnCitation: number };
  categories: CitationCategoryRow[];
  topHosts: CitationHostRow[];
  gaps: CitationGapRow[];
  competitorHosts: string[];
}

/** Gap analysis over one stored panel. No network access, no provider call. */
export function citationGaps(dataset: Dataset, source = "", brand = ""): CitationGaps {
  const brands = dataset.brands;
  const activeName = brands.some((b) => b.name === brand) ? brand : brands[0].name;
  const activeBrand = brands.find((b) => b.name === activeName)!;
  const observations = dataset.observations.filter((r) => !source || r.source === source);
  const ownHost = activeBrand.website ? bare(activeBrand.website) : "";
  const ownHosts = new Set(ownHost ? [ownHost] : []);
  const competitorHosts = [...new Set(brands.filter((b) => b.name !== activeName && b.website).map((b) => bare(b.website!)).filter(Boolean))].sort();
  const competitorSet = new Set(competitorHosts);
  const classify = (url: string): CitationCategory => {
    const host = bare(url); if (!host) return "web";
    if (ownHosts.has(host)) return "own";
    if (competitorSet.has(host)) return "competitor";
    return communityCategory(host) ?? "web";
  };

  const rows = new Map<CitationCategory, { citations: number; citedPrompts: number }>(CITATION_CATEGORIES.map((category) => [category, { citations: 0, citedPrompts: 0 }]));
  const hosts = new Map<string, { category: CitationCategory; citations: number; example: string }>();
  let totalCitations = 0, withCitations = 0, promptsMentioningBrand = 0, promptsMentioningBrandWithOwnCitation = 0;
  const gaps: CitationGapRow[] = [];
  const mentionsBrand = (r: Dataset["observations"][number]) => r.mentions.some((m) => m.brand === activeName && m.status !== "rejected");

  for (const observation of observations) {
    const citations = observation.citations ?? [];
    if (citations.length) withCitations++;
    const mentioned = mentionsBrand(observation);
    if (mentioned) promptsMentioningBrand++;
    let citesOwn = false;
    for (const url of citations) {
      totalCitations++;
      const category = classify(url), row = rows.get(category)!; row.citations++;
      if (!citesOwn && category === "own") citesOwn = true;
      const host = bare(url) || "invalid";
      const entry = hosts.get(host) ?? { category, citations: 0, example: url };
      entry.citations++; hosts.set(host, entry);
    }
    if (citesOwn && mentioned) promptsMentioningBrandWithOwnCitation++;
    // Unknown citation evidence (no cited URLs at all) is absent evidence, not a gap.
    if (ownHost && mentioned && citations.length && !citesOwn && gaps.length < MAX_GAPS) {
      const mention = observation.mentions.find((m) => m.brand === activeName && m.status !== "rejected")!;
      gaps.push({ id: observation.id, prompt: observation.prompt, observedAt: observation.observedAt, evidence: mention.evidence, citations });
    }
  }

  // citedPrompts counts observations that cite the category at least once.
  for (const observation of observations) {
    const seen = new Set<CitationCategory>();
    for (const url of observation.citations ?? []) { const category = classify(url); if (!seen.has(category)) { seen.add(category); rows.get(category)!.citedPrompts++; } }
  }
  const categories: CitationCategoryRow[] = CITATION_CATEGORIES.map((category) => {
    const row = rows.get(category)!;
    return { category, citations: row.citations, citedPrompts: row.citedPrompts, shareOfCitations: totalCitations ? row.citations / totalCitations * 100 : null };
  });
  const topHosts = [...hosts.entries()].map(([host, entry]) => ({ host, category: entry.category, citations: entry.citations, example: entry.example }))
    .sort((a, b) => b.citations - a.citations || a.host.localeCompare(b.host)).slice(0, MAX_HOSTS);
  const evaluated = Boolean(ownHost);
  return {
    panel: dataset.id, createdAt: dataset.createdAt, brand: activeName, source: source || null,
    ownWebsite: activeBrand.website ?? null, evaluated,
    note: evaluated
      ? "Gaps are computed from this panel's stored citation URLs only; they are not engine market share or all consumer sessions."
      : "The tracked brand has no declared website in this panel: own-source citation gaps stay unknown, never zero. Declare the brand website before interpreting own-category numbers.",
    totals: { observations: observations.length, withCitations, citations: totalCitations, promptsMentioningBrand, promptsMentioningBrandWithOwnCitation },
    categories, topHosts, gaps,
    competitorHosts,
  };
}
