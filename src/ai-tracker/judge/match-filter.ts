/** Native AI tracker — deterministic match filter. Whole words, case-insensitive.
 * A match only means "candidate mention": the local judge confirms brand vs homonym. */
import type { TrackedCompany } from "./types.js";

export interface MatchCandidate { companyId: string; companyType: "brand" | "competitor"; matchedTerms: string[] }

function escapeRegExp(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function hasWordMatch(text: string, term: string): boolean {
  const value = term.trim().toLowerCase();
  if (!value) return false;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(value)}([^\\p{L}\\p{N}]|$)`, "iu");
  return pattern.test(text);
}

export function deterministicMatch(rawText: string, companies: TrackedCompany[]): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (const company of companies) {
    const terms = [company.name, ...company.aliases, ...company.domains].filter((t): t is string => typeof t === "string" && t.trim().length > 1);
    const matchedTerms = terms.filter(term => hasWordMatch(rawText, term));
    if (matchedTerms.length) candidates.push({ companyId: company.companyId, companyType: company.type, matchedTerms });
  }
  return candidates;
}
