/**
 * Defensive content-risk scan.
 *
 * Looks for patterns that make an answer engine skip or distrust a page, or
 * that signal manipulation: hidden text, instructions aimed at an LLM,
 * invisible Unicode, CTA overload, thin copy and keyword stuffing.
 *
 * This audits the operator's own page — it is a hygiene check, not an attack
 * tool, and it never executes anything it finds.
 */

import { HtmlDoc } from "./html.js";
import type { HtmlNode } from "./html.js";
import { fetchQuiet, fetchText } from "./http.js";
import type { Fetcher } from "./http.js";
import { countWords, fold } from "./text.js";

export type RiskSeverity = "high" | "medium" | "low";

export interface RiskFinding {
  id: string;
  severity: RiskSeverity;
  evidence: string;
  fix: string;
}

export interface RiskScanResult {
  url: string;
  findings: RiskFinding[];
  counts: Record<RiskSeverity, number>;
  clean: boolean;
}

const INSTRUCTION_RE =
  /ignore (all )?(the )?(previous|prior|above) instructions|you are (an? )?(ai|assistant|language model)|system prompt|as an ai language model/i;
const CTA_RE = /\b(buy now|add to cart|sign up|get started|book a demo|request a demo|subscribe|start free|try free|contact sales)\b/i;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const STOPWORDS = new Set(
  "the a an and or of to in for on with is are was were be been being this that these those it its as at by from we you your our their they he she i not no but if then than so such can will would should could may might have has had do does did also more most other into over under about after before between during through during out up down only own same very just now new".split(
    " "
  )
);

function walk(node: HtmlNode, visit: (node: HtmlNode) => void): void {
  for (const child of node.children) {
    visit(child);
    walk(child, visit);
  }
}

function hiddenBy(css: string): boolean {
  const value = css.replace(/\s+/g, "").toLowerCase();
  return (
    value.includes("display:none") ||
    value.includes("visibility:hidden") ||
    value.includes("font-size:0") ||
    value.includes("text-indent:-999")
  );
}

function topTermFrequency(text: string): { term: string; share: number; count: number } {
  const terms = fold(text)
    .split(/[^a-zà-ÿ0-9']+/)
    .filter((term) => term.length >= 4 && !STOPWORDS.has(term));
  if (!terms.length) return { term: "", share: 0, count: 0 };
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  const [term, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { term, share: count / terms.length, count };
}

/** Pure scan over the raw HTML and its parsed tree. */
export function scanContentRisks(doc: HtmlDoc, html: string, url: string): RiskScanResult {
  const findings: RiskFinding[] = [];
  const bodyText = doc.bodyText().replace(/\s+/g, " ").trim();
  const wordCount = countWords(bodyText);

  // Hidden text with real content
  const hiddenSamples: string[] = [];
  walk(doc.root, (node) => {
    if (node.tag === "#text") return;
    const css = node.attrs.style ?? "";
    if (!css || !hiddenBy(css)) return;
    // Screen-reader-only classes are legitimate; only inline hiding is flagged.
    const className = (node.attrs.class ?? "").toLowerCase();
    if (/(sr-only|visually-hidden|screen-reader)/.test(className)) return;
    const text = doc.textOf(node).trim();
    if (text.length >= 40) hiddenSamples.push(`${node.tag}: "${text.slice(0, 60)}…"`);
  });
  if (hiddenSamples.length) {
    findings.push({
      id: "risk.hidden_text",
      severity: "high",
      evidence: `${hiddenSamples.length} hidden block(s) with content — ${hiddenSamples[0]}`,
      fix: "Remove hidden copy, or mark genuinely screen-reader-only text with an sr-only class instead of display:none.",
    });
  }

  // Instructions in HTML comments
  const commentHits: string[] = [];
  for (const match of html.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (INSTRUCTION_RE.test(match[1])) commentHits.push(match[1].trim().slice(0, 80));
  }
  if (commentHits.length) {
    findings.push({
      id: "risk.comment_instructions",
      severity: "high",
      evidence: `${commentHits.length} comment(s) containing LLM instructions — "${commentHits[0]}"`,
      fix: "Delete instructions from comments; crawlers read them and they are treated as manipulation.",
    });
  }

  // Visible instructions aimed at a model
  if (INSTRUCTION_RE.test(bodyText)) {
    findings.push({
      id: "risk.llm_instructions",
      severity: "high",
      evidence: "Visible copy contains phrases addressed to an AI model",
      fix: "Rewrite instructions to readers as normal copy — prompt-like text is penalised, not followed.",
    });
  }

  // Invisible Unicode used to smuggle text
  const invisible = bodyText.match(ZERO_WIDTH_RE)?.length ?? 0;
  if (invisible > 5) {
    findings.push({
      id: "risk.invisible_unicode",
      severity: "medium",
      evidence: `${invisible} zero-width character(s) in the visible copy`,
      fix: "Strip zero-width characters from CMS content; they are a common smuggling vector.",
    });
  }

  // CTA overload
  const ctaCount = doc
    .all("a")
    .filter((anchor) => CTA_RE.test(doc.textOf(anchor))).length;
  if (ctaCount >= 10) {
    findings.push({
      id: "risk.cta_overload",
      severity: "low",
      evidence: `${ctaCount} call-to-action links`,
      fix: "Reduce promotional CTAs — pages that read as ads are deprioritised for answers.",
    });
  }

  // Thin content
  if (wordCount < 300) {
    findings.push({
      id: "risk.thin_content",
      severity: "medium",
      evidence: `${wordCount} words of visible copy`,
      fix: "Add substance (300+ words) or mark the page noindex if it is a utility page.",
    });
  }

  // Keyword stuffing
  if (wordCount >= 150) {
    const { term, share, count } = topTermFrequency(bodyText);
    if (share > 0.04) {
      findings.push({
        id: "risk.keyword_stuffing",
        severity: "medium",
        evidence: `"${term}" appears ${count} times (${(share * 100).toFixed(1)}% of terms)`,
        fix: "Diversify the vocabulary; repetition above ~4% reads as stuffing.",
      });
    }
  }

  const counts = {
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
  };

  return { url, findings, counts, clean: findings.length === 0 };
}

export interface RiskScanOptions {
  url: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export async function runContentRiskScan(options: RiskScanOptions): Promise<RiskScanResult> {
  const fetcher = options.fetcher ?? fetchText;
  const url = /^https?:\/\//i.test(options.url) ? options.url : `https://${options.url}`;
  const page = await fetchQuiet(fetcher, url, { timeoutMs: options.timeoutMs });
  if (!page) throw new Error(`Unable to reach ${url}`);
  if (page.status !== 200 && page.status !== 203) {
    throw new Error(`HTTP ${page.status} for ${url} — fix the response before scanning content`);
  }
  return scanContentRisks(HtmlDoc.parse(page.body), page.body, page.url);
}
