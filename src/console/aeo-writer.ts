/**
 * AEO Writer (R8): answer-grounded content scoring and local draft generation.
 * The tenant's stored AI-visibility panel (imported or collected answers, R1/R2)
 * provides the questions users actually asked; a tenant-supplied content text is
 * scored against those prompts with strict heuristics, on top of the existing
 * citability audit (src/geo/citability.ts). Everything is local: no network,
 * no partner call, nothing stored. Unknown stays null, never zero; a panel
 * without usable prompts leaves the score unevaluated.
 */
import { getDataset, latestDataset } from "./ai-visibility-store.js";
import type { Dataset } from "./ai-visibility.js";
import type { ConsoleRoute } from "./util.js";
import { str } from "./util.js";
import type { TenantContext } from "../tenants/context.js";
import { HtmlDoc } from "../geo/html.js";
import { auditCitability, type CitabilityResult } from "../geo/citability.js";
import { countWords, fold } from "../geo/text.js";
import { generateTitles, generateOutline } from "./generators.js";

export const AEO_CONTENT_MIN = 40;
export const AEO_CONTENT_MAX = 20000;
export const AEO_PROMPT_ROWS = 20;
export const AEO_DRAFT_ROWS = 5;

/** Words too common to carry intent, French and English. */
const STOPWORDS = new Set(["avec", "cette", "dans", "des", "dont", "elle", "elles", "est", "les", "leur", "mais", "nous", "pour", "plus", "quel", "quelle", "sans", "sont", "très", "vous", "avec", "comme", "d'un", "d'une", "est-ce", "peut", "faire", "what", "which", "when", "where", "does", "that", "this", "with", "from", "have", "been", "were", "should", "would", "could", "there", "their", "about", "best", "how", "why", "who"]);
const TERM_RE = /[\p{L}\p{N}]{4,}/gu;

export type AeoCoverageStatus = "covered" | "partial" | "absent" | "unevaluated";

export interface AeoPromptRow {
  prompt: string;
  observedAt: string | null;
  status: AeoCoverageStatus;
  matchedTerms: string[];
  missingTerms: string[];
  evidence: string | null;
}

export interface AeoContentScore {
  datasetId: string;
  brand: string | null;
  observedAt: string | null;
  provenance: { source: "stored-panel"; datasetId: string; content: "tenant-supplied" };
  promptCount: number;
  evaluated: number;
  covered: number;
  partial: number;
  absent: number;
  coverageScore: number | null;
  citabilityScore: number | null;
  citabilitySignals: { strengths: string[]; gaps: string[]; methods: CitabilityResult["methods"] } | null;
  score: number | null;
  rows: AeoPromptRow[];
  note: string;
}

const clipping = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/** Meaningful intent terms of a prompt, French or English. */
export function promptTerms(prompt: string): string[] {
  const seen = new Set<string>();
  for (const raw of fold(prompt).match(TERM_RE) ?? []) {
    if (STOPWORDS.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

const headingLike = (line: string): boolean => line.length <= 80 && !/[.!?…]$/.test(line) && countWords(line) <= 12;

/** Plain text is wrapped into a tolerant HTML shell so citability heuristics
 *  keep heading/list signals; existing HTML is parsed as supplied. */
export function contentToHtml(content: string): string {
  if (/<\/?[a-z][^>]*>/i.test(content)) return content;
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const tag = index === 0 ? "h1" : headingLike(line) ? "h2" : "p";
    return `<${tag}>${line}</${tag}>`;
  }).join("\n");
}

const evidenceSentence = (content: string, matched: string[]): string | null => {
  if (!matched.length) return null;
  for (const sentence of content.split(/(?<=[.!?…])\s+/)) {
    const folded = fold(sentence);
    if (matched.every((term) => folded.includes(term))) return clipping(sentence, 200);
  }
  for (const sentence of content.split(/(?<=[.!?…])\s+/)) {
    const folded = fold(sentence);
    const hits = matched.filter((term) => folded.includes(term)).length;
    if (hits >= 2) return clipping(sentence, 200);
  }
  return null;
};

/** Prompts actually asked across the stored panel, deduplicated, most recent
 *  first, bounded. Each row keeps the panel's observation date. */
export function panelPrompts(dataset: Dataset, limit = AEO_PROMPT_ROWS): { prompt: string; observedAt: string | null }[] {
  const sorted = [...dataset.observations].sort((a, b) => (a.observedAt < b.observedAt ? 1 : a.observedAt > b.observedAt ? -1 : 0));
  const seen = new Set<string>();
  const rows: { prompt: string; observedAt: string | null }[] = [];
  for (const observation of sorted) {
    const prompt = observation.prompt.trim();
    const key = fold(prompt);
    if (!prompt || seen.has(key)) continue;
    seen.add(key);
    rows.push({ prompt: clipping(prompt, 300), observedAt: observation.observedAt ?? null });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** Answer-grounded scoring of one content against one stored panel. Pure. */
export function scoreAeoContent(dataset: Dataset, content: string, brandName?: string): AeoContentScore {
  const body = clipping(content, AEO_CONTENT_MAX);
  const foldedContent = fold(body);
  const contentTerms = new Set(foldedContent.match(TERM_RE) ?? []);
  const prompts = panelPrompts(dataset);
  const rows: AeoPromptRow[] = prompts.map(({ prompt, observedAt }) => {
    const terms = promptTerms(prompt);
    if (!terms.length) return { prompt, observedAt, status: "unevaluated" as const, matchedTerms: [], missingTerms: [], evidence: null };
    const matched = terms.filter((t) => contentTerms.has(t));
    const missing = terms.filter((t) => !contentTerms.has(t));
    const ratio = matched.length / terms.length;
    const status: AeoCoverageStatus = ratio >= 0.6 ? "covered" : ratio >= 0.3 ? "partial" : "absent";
    return { prompt, observedAt, status, matchedTerms: matched, missingTerms: missing, evidence: evidenceSentence(body, matched) };
  });
  const evaluated = rows.filter((r) => r.status !== "unevaluated").length;
  const covered = rows.filter((r) => r.status === "covered").length;
  const partial = rows.filter((r) => r.status === "partial").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const coverageScore = evaluated ? Math.round(((covered + partial / 2) / evaluated) * 100) : null;

  const brand = (brandName ? dataset.brands.find((b) => b.name === brandName) : undefined) ?? dataset.brands[0] ?? null;
  const cit = auditCitability(HtmlDoc.parse(contentToHtml(body)), brand?.website ?? "https://content.local/");
  const score = coverageScore === null ? null : Math.round(0.6 * coverageScore + 0.4 * cit.score);
  const observedAt = dataset.observations.map((o) => o.observedAt ?? "").sort().pop() || null;
  return {
    datasetId: dataset.id,
    brand: brand?.name ?? null,
    observedAt,
    provenance: { source: "stored-panel", datasetId: dataset.id, content: "tenant-supplied" },
    promptCount: prompts.length,
    evaluated, covered, partial, absent,
    coverageScore,
    citabilityScore: cit.score,
    citabilitySignals: { strengths: cit.strengths, gaps: cit.gaps, methods: cit.methods },
    score,
    rows,
    note: `Analyse heuristique locale fondée sur le panneau stocké (${prompts.length} prompt(s)) et le texte fourni ; inconnu reste non évalué, jamais zéro. Un score élevé ne garantit pas une citation.`,
  };
}

export interface AeoDraftRow {
  prompt: string;
  status: AeoCoverageStatus;
  titles: { text: string; chars: number }[];
  outline: { h1: string; sections: { h2: string; h3: string[] }[]; faq: string[] };
  review: string;
}

export interface AeoDrafts {
  datasetId: string;
  brand: string | null;
  sourcePrompts: number;
  drafts: AeoDraftRow[];
  note: string;
}

/** AEO-Writer generator: local drafts (titles + outline) for the prompts the
 *  content does not answer well yet. Open-source generators only; a draft is
 *  never a publication and must be re-read by a human. */
export function aeoDrafts(dataset: Dataset, content: string | null, limit = AEO_DRAFT_ROWS, brandName?: string): AeoDrafts {
  const brand = (brandName ? dataset.brands.find((b) => b.name === brandName) : undefined) ?? dataset.brands[0] ?? null;
  let candidates: { prompt: string; status: AeoCoverageStatus }[];
  if (content && content.trim().length >= AEO_CONTENT_MIN) {
    const scored = scoreAeoContent(dataset, content, brandName);
    candidates = scored.rows.filter((r) => r.status === "absent" || r.status === "partial").map((r) => ({ prompt: r.prompt, status: r.status }));
  } else {
    candidates = panelPrompts(dataset, 50).map((p) => ({ prompt: p.prompt, status: "absent" as const }));
  }
  const rows: AeoDraftRow[] = [];
  for (const candidate of candidates) {
    if (rows.length >= Math.max(1, Math.min(limit, AEO_DRAFT_ROWS))) break;
    const input = { keyword: clipping(candidate.prompt, 120), ...(brand ? { brand: brand.name } : {}) };
    rows.push({
      prompt: candidate.prompt,
      status: candidate.status,
      titles: generateTitles(input).slice(0, 3),
      outline: generateOutline(input),
      review: "Brouillon généré localement par des générateurs open source : relisez, ajustez et validez avant tout usage ; rien n'est publié.",
    });
  }
  return {
    datasetId: dataset.id,
    brand: brand?.name ?? null,
    sourcePrompts: panelPrompts(dataset, 200).length,
    drafts: rows,
    note: rows.length
      ? "Brouillons heuristiques fondés sur les prompts du panneau stocké ; susceptibles d'être revus, jamais publiés sans relecture humaine."
      : "Aucun prompt du panneau stocké n'est non couvert par le texte fourni : aucun brouillon n'est nécessaire.",
  };
}

/* ------------------------------------------------------------------ routes */

export interface AeoWriterDeps {
  dataset?: (tenantId: string, datasetId: string | null) => Dataset | undefined;
}

const defaultDataset = (tenantId: string, datasetId: string | null): Dataset | undefined =>
  datasetId ? getDataset<Dataset>(tenantId, datasetId) : latestDataset<Dataset>(tenantId);

const tenantOf = (ctx: { tenancy?: TenantContext }) => {
  const tenant = ctx.tenancy?.tenant;
  if (!tenant || tenant.status !== "active") throw new Error("Un tenant actif est requis pour l'AEO Writer.");
  return tenant.id;
};

export function aeoWriterRoutes(deps: AeoWriterDeps = {}): ConsoleRoute[] {
  const datasetOf = deps.dataset ?? defaultDataset;
  return [
    { path: "/aeo-writer/score", needsUrl: false, handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const dataset = datasetOf(tenantId, str(ctx.body.datasetId) || null);
      if (!dataset) throw new Error("Panneau de visibilité IA introuvable pour ce tenant.");
      const content = typeof ctx.body.content === "string" ? ctx.body.content.trim() : "";
      if (content.length < AEO_CONTENT_MIN || content.length > AEO_CONTENT_MAX)
        throw new Error(`Contenu requis (${AEO_CONTENT_MIN} à ${AEO_CONTENT_MAX} caractères).`);
      const brand = str(ctx.body.brand) || undefined;
      return scoreAeoContent(dataset, content, brand);
    } },
    { path: "/aeo-writer/drafts", needsUrl: false, handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const dataset = datasetOf(tenantId, str(ctx.body.datasetId) || null);
      if (!dataset) throw new Error("Panneau de visibilité IA introuvable pour ce tenant.");
      const rawContent = typeof ctx.body.content === "string" ? ctx.body.content.trim() : "";
      const content = rawContent.length >= AEO_CONTENT_MIN ? rawContent : null;
      const brand = str(ctx.body.brand) || undefined;
      const limit = typeof ctx.body.limit === "number" && Number.isFinite(ctx.body.limit) ? ctx.body.limit : AEO_DRAFT_ROWS;
      return aeoDrafts(dataset, content, limit, brand);
    } },
  ];
}
