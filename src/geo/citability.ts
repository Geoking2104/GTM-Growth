/**
 * Citability score — a second, content-only score.
 *
 * The 8-category GEO score asks "is the site discoverable and well-formed?".
 * This one asks "would an answer engine quote this passage?": statistics,
 * quotations, structure, question headings, answer-first writing, sentence and
 * paragraph length, outbound citations, authorship, freshness, FAQ depth and
 * entity clarity.
 *
 * It is a 12-method subset of the citability work in the source model, not the
 * full 47-method engine — each method states its own evidence so the number is
 * auditable.
 */

import { auditSchema } from "./audit/schema.js";
import { HtmlDoc } from "./html.js";
import { fetchQuiet, fetchText } from "./http.js";
import type { Fetcher } from "./http.js";
import { countWords, cutAtFirstSeparator, fold } from "./text.js";

export interface CitabilityMethod {
  id: string;
  label: string;
  points: number;
  max: number;
  evidence: string;
  fix?: string;
}

export interface CitabilityResult {
  url: string;
  score: number;
  points: number;
  max: number;
  methods: CitabilityMethod[];
  strengths: string[];
  gaps: string[];
}

const NUMBER_RE = /\b\d+[%€$£]|\b\d+\.\d+|\b\d{3,}\b/g;

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/** Pure analysis of one parsed page. */
export function auditCitability(doc: HtmlDoc, url: string): CitabilityResult {
  const bodyText = doc.bodyText().replace(/\s+/g, " ").trim();
  const words = bodyText.split(/\s+/).filter(Boolean);
  const wordCount = countWords(bodyText);
  const numbers = bodyText.match(NUMBER_RE) ?? [];
  const schema = auditSchema(doc).data;

  const paragraphs = doc
    .all("p")
    .map((node) => doc.textOf(node).trim())
    .filter((text) => text.split(/\s+/).length > 3);
  const sentences = bodyText.split(/[.!?]+\s+/).filter((sentence) => sentence.trim().length > 0);
  const headings = [...doc.all("h2"), ...doc.all("h3")].map((node) => doc.textOf(node).trim());
  const questionHeadings = headings.filter((heading) => heading.endsWith("?"));
  const blockquotes = doc.all("blockquote").filter((node) => doc.textOf(node).trim().length > 20);
  const bulletItems = [...doc.all("ul"), ...doc.all("ol")].reduce(
    (sum, list) => sum + list.children.filter((child) => child.tag === "li").length,
    0
  );
  const tables = doc.all("table").length;

  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const externalLinks = doc.all("a").filter((anchor) => {
    const href = anchor.attrs.href ?? "";
    if (!href.startsWith("http")) return false;
    try {
      const target = new URL(href).hostname.replace(/^www\./, "");
      return host ? target !== host && !target.endsWith(`.${host}`) : true;
    } catch {
      return false;
    }
  });

  const title = doc.title() ?? "";
  const brand = cutAtFirstSeparator(title);
  const h1 = doc.first("h1");
  const h1Text = h1 ? doc.textOf(h1) : "";
  const firstHundred = words.slice(0, 100).join(" ");
  const brandInH1 = brand ? fold(h1Text).includes(fold(brand)) : false;
  const brandInOpening = brand ? fold(firstHundred).includes(fold(brand)) : false;

  const dateModified = schema.objects
    .map((object) => object["dateModified"] ?? object["datePublished"])
    .find((value): value is string => typeof value === "string" && value.length > 0);
  const modifiedAt = dateModified ? Date.parse(dateModified) : Number.NaN;
  const ageDays = Number.isFinite(modifiedAt)
    ? Math.floor((Date.now() - modifiedAt) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const hasAuthor =
    schema.objects.some((object) => Boolean(object["author"])) ||
    Boolean(doc.metaByName("author")?.attrs.content);
  const faqItems = schema.objects
    .filter((object) => {
      const type = object["@type"];
      return type === "FAQPage" || (Array.isArray(type) && type.includes("FAQPage"));
    })
    .reduce((sum, object) => sum + (Array.isArray(object["mainEntity"]) ? object["mainEntity"].length : 0), 0);

  const perHundred = wordCount ? (numbers.length / wordCount) * 100 : 0;
  const paragraphAverage = average(paragraphs.map((text) => text.split(/\s+/).length));
  const sentenceAverage = average(sentences.map((sentence) => sentence.split(/\s+/).length));
  const firstThird = words.slice(0, Math.max(1, Math.floor(words.length * 0.3)));
  const answerFirst = firstThird.length >= 50 && firstThird.some((word) => /\d/.test(word));

  const methods: CitabilityMethod[] = [
    {
      id: "citability.statistics",
      label: "Concrete statistics",
      points: perHundred >= 1 ? 3 : perHundred >= 0.5 ? 2 : numbers.length ? 1 : 0,
      max: 3,
      evidence: `${numbers.length} numeric token(s), ${perHundred.toFixed(2)} per 100 words`,
      fix: "Quantify claims (prices, percentages, dates) — numbers are what an answer engine can quote as fact.",
    },
    {
      id: "citability.quotations",
      label: "Quotable passages",
      points: blockquotes.length >= 2 ? 3 : blockquotes.length === 1 ? 2 : 0,
      max: 3,
      evidence: `${blockquotes.length} blockquote(s) over 20 characters`,
      fix: "Add a pull-quote or a sourced statement — extractable sentences travel further than paraphrases.",
    },
    {
      id: "citability.structure",
      label: "Lists and tables",
      points: tables > 0 ? 3 : bulletItems >= 5 ? 2 : bulletItems > 0 ? 1 : 0,
      max: 3,
      evidence: `${tables} table(s), ${bulletItems} list item(s)`,
      fix: "Turn comparisons and steps into a table or list — the format answers are assembled from.",
    },
    {
      id: "citability.question_headings",
      label: "Question-shaped headings",
      points: questionHeadings.length >= 2 ? 3 : questionHeadings.length === 1 ? 2 : 0,
      max: 3,
      evidence: `${questionHeadings.length} heading(s) ending in "?"`,
      fix: 'Phrase H2s as the questions buyers ask ("How much does X cost?") so the passage maps to a query.',
    },
    {
      id: "citability.answer_first",
      label: "Answer in the first 30%",
      points: answerFirst ? 3 : firstThird.some((word) => /\d/.test(word)) ? 2 : 0,
      max: 3,
      evidence: answerFirst
        ? "First 30% carries a figure in 50+ words"
        : `First 30% is ${firstThird.length} words with ${firstThird.some((word) => /\d/.test(word)) ? "a figure" : "no figure"}`,
      fix: "Lead with the direct answer and one figure before the background.",
    },
    {
      id: "citability.paragraph_brevity",
      label: "Short paragraphs",
      points: paragraphAverage <= 60 ? 3 : paragraphAverage <= 90 ? 2 : paragraphAverage <= 120 ? 1 : 0,
      max: 3,
      evidence: `${paragraphs.length} paragraph(s), ${paragraphAverage.toFixed(0)} words on average`,
      fix: "Split paragraphs over 60 words — dense blocks are skipped when a passage is selected.",
    },
    {
      id: "citability.sentence_brevity",
      label: "Short sentences",
      points: sentenceAverage <= 20 ? 3 : sentenceAverage <= 25 ? 2 : sentenceAverage <= 30 ? 1 : 0,
      max: 3,
      evidence: `${sentences.length} sentence(s), ${sentenceAverage.toFixed(1)} words on average`,
      fix: "Keep sentences under ~20 words; long clauses lose the subject an engine needs to attribute.",
    },
    {
      id: "citability.outbound_citations",
      label: "Outbound citations",
      points: externalLinks.length >= 3 ? 3 : externalLinks.length >= 1 ? 2 : 0,
      max: 3,
      evidence: `${externalLinks.length} external link(s)`,
      fix: "Cite primary sources; pages that reference others are cited more often themselves.",
    },
    {
      id: "citability.author",
      label: "Named authorship",
      points: hasAuthor ? 3 : 0,
      max: 3,
      evidence: hasAuthor ? "Author present in schema or meta" : "No author in schema or meta",
      fix: "Add an author (Person in Article schema or meta author) — unattributed pages are harder to trust.",
    },
    {
      id: "citability.freshness",
      label: "Freshness",
      points: ageDays <= 180 ? 3 : ageDays <= 365 ? 2 : Number.isFinite(ageDays) ? 1 : 0,
      max: 3,
      evidence: Number.isFinite(ageDays) ? `Updated ${ageDays} day(s) ago` : "No dateModified/datePublished",
      fix: "Publish dateModified and keep it current — stale pages lose selection to fresher ones.",
    },
    {
      id: "citability.faq",
      label: "FAQ depth",
      points: faqItems >= 3 ? 3 : faqItems >= 1 ? 2 : questionHeadings.length >= 2 ? 1 : 0,
      max: 3,
      evidence: `${faqItems} FAQ item(s) in schema, ${questionHeadings.length} question heading(s)`,
      fix: "Mark up 3+ real FAQs; question/answer pairs are the easiest unit for an assistant to lift.",
    },
    {
      id: "citability.entity_clarity",
      label: "Entity clarity",
      points: brandInH1 && brandInOpening ? 3 : brandInH1 || brandInOpening ? 2 : 0,
      max: 3,
      evidence: `Brand "${brand || "(none)"}" ${brandInH1 ? "in H1" : "not in H1"}, ${
        brandInOpening ? "in opening" : "not in opening"
      }`,
      fix: "Name the entity in the H1 and again in the first 100 words — ambiguity costs the citation.",
    },
  ];

  const points = methods.reduce((sum, method) => sum + method.points, 0);
  const max = methods.reduce((sum, method) => sum + method.max, 0);
  const score = max ? Math.round((points / max) * 100) : 0;

  return {
    url,
    score,
    points,
    max,
    methods,
    strengths: methods.filter((method) => method.points === method.max).map((method) => method.label),
    gaps: methods.filter((method) => method.points < method.max).map((method) => method.label),
  };
}

export interface CitabilityOptions {
  url: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

/** Fetch a page and score its citability. */
export async function runCitability(options: CitabilityOptions): Promise<CitabilityResult> {
  const fetcher = options.fetcher ?? fetchText;
  const url = /^https?:\/\//i.test(options.url) ? options.url : `https://${options.url}`;
  const page = await fetchQuiet(fetcher, url, { timeoutMs: options.timeoutMs });
  if (!page) throw new Error(`Unable to reach ${url}`);
  if (page.status !== 200 && page.status !== 203) {
    throw new Error(`HTTP ${page.status} for ${url} — fix the response before scoring content`);
  }
  return auditCitability(HtmlDoc.parse(page.body), page.url);
}
