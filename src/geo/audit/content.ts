import { CONTENT_MIN_WORDS, FRONT_LOADING_MIN_WORDS, WEIGHTS } from "../config.js";
import type { HtmlDoc } from "../html.js";
import { countWords } from "../text.js";
import type { CategoryResult, ContentAudit, GeoCheck } from "../types.js";

const NUMBER_RE = /\b\d+[%€$£]|\b\d+\.\d+|\b\d{3,}\b/g;

/**
 * Audit what AI engines can actually extract from the page: a single H1,
 * enough substance, concrete numbers, outbound citations, structured
 * subheadings, lists/tables and front-loaded answers.
 */
export function auditContent(
  doc: HtmlDoc,
  pageUrl: string
): CategoryResult<ContentAudit> {
  const h1 = doc.first("h1");
  const headings = ["h1", "h2", "h3", "h4"].flatMap((tag) => doc.all(tag));
  const bodyText = doc.bodyText().replace(/\s+/g, " ").trim();
  const words = bodyText.split(/\s+/).filter(Boolean);
  const numbers = bodyText.match(NUMBER_RE) ?? [];

  let baseHost = "";
  try {
    baseHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    baseHost = "";
  }
  const links = doc.all("a").filter((a) => a.attrs.href?.startsWith("http"));
  const externalLinks = links.filter((a) => {
    try {
      const host = new URL(a.attrs.href).hostname.replace(/^www\./, "");
      return baseHost ? host !== baseHost && !host.endsWith(`.${baseHost}`) : true;
    } catch {
      return false;
    }
  });

  const images = doc.all("img");
  const imagesWithAlt = images.filter((img) => (img.attrs.alt ?? "").trim().length > 0).length;

  const body = doc.first("body") ?? doc.root;
  const hasListsOrTables =
    doc.all("ul").length > 0 || doc.all("ol").length > 0 || doc.all("table").length > 0;
  void body;

  const hasHeadingHierarchy = doc.all("h2").length > 0 && doc.all("h3").length > 0;

  const wordCount = countWords(bodyText);
  const first30 = words.slice(0, Math.max(1, Math.floor(words.length * 0.3)));
  const hasFrontLoading =
    first30.length >= FRONT_LOADING_MIN_WORDS && first30.some((word) => /\d/.test(word));

  const data: ContentAudit = {
    h1: h1 ? doc.textOf(h1).trim() || null : null,
    headingCount: headings.length,
    wordCount,
    numbersCount: numbers.length,
    externalLinksCount: externalLinks.length,
    hasHeadingHierarchy,
    hasListsOrTables,
    hasFrontLoading,
    imagesTotal: images.length,
    imagesWithAlt,
  };

  const check = (
    id: string,
    label: string,
    earned: number,
    max: number,
    status: GeoCheck["status"],
    evidence: string,
    fix?: string
  ): GeoCheck => ({ id, category: "content", label, earned, max, status, evidence, fix });

  const checks: GeoCheck[] = [
    check(
      "content.h1",
      "Single H1 states the topic",
      data.h1 ? WEIGHTS.content_h1 : 0,
      WEIGHTS.content_h1,
      data.h1 ? "pass" : "fail",
      data.h1 ? `H1: "${data.h1.slice(0, 100)}"` : "No H1",
      data.h1 ? undefined : "Add one H1 that states what the page answers, not a slogan."
    ),
    check(
      "content.word_count",
      `At least ${CONTENT_MIN_WORDS} words`,
      wordCount >= CONTENT_MIN_WORDS ? WEIGHTS.content_word_count : 0,
      WEIGHTS.content_word_count,
      wordCount >= CONTENT_MIN_WORDS ? "pass" : "fail",
      `${wordCount} words`,
      wordCount >= CONTENT_MIN_WORDS
        ? undefined
        : `Expand to ${CONTENT_MIN_WORDS}+ words of substance — AI engines need extractable facts to cite a page.`
    ),
    check(
      "content.heading_hierarchy",
      "H2 + H3 hierarchy",
      hasHeadingHierarchy ? WEIGHTS.content_heading_hierarchy : 0,
      WEIGHTS.content_heading_hierarchy,
      hasHeadingHierarchy ? "pass" : "fail",
      `${doc.all("h2").length} H2 · ${doc.all("h3").length} H3`,
      hasHeadingHierarchy
        ? undefined
        : "Add H2 sections and H3 sub-points so an answer engine can lift the relevant passage."
    ),
    check(
      "content.lists_or_tables",
      "Lists or tables present",
      hasListsOrTables ? WEIGHTS.content_lists_or_tables : 0,
      WEIGHTS.content_lists_or_tables,
      hasListsOrTables ? "pass" : "fail",
      hasListsOrTables
        ? `${doc.all("ul").length + doc.all("ol").length} list(s), ${doc.all("table").length} table(s)`
        : "No <ul>, <ol> or <table>",
      hasListsOrTables
        ? undefined
        : "Structure comparisons and steps as lists or tables — the format AI answers quote most often."
    ),
    check(
      "content.front_loading",
      "Key facts in the first 30%",
      hasFrontLoading ? WEIGHTS.content_front_loading : 0,
      WEIGHTS.content_front_loading,
      hasFrontLoading ? "pass" : "fail",
      hasFrontLoading
        ? "First 30% of the copy contains concrete figures"
        : `First 30% (${first30.length} words) has no concrete figure`,
      hasFrontLoading
        ? undefined
        : "Put the direct answer, with a number or date, in the first 30% of the page — engines select snippets from there."
    ),
    check(
      "content.numbers",
      "Concrete statistics",
      numbers.length >= 3 ? WEIGHTS.content_numbers : 0,
      WEIGHTS.content_numbers,
      numbers.length >= 3 ? "pass" : "fail",
      `${numbers.length} numeric token(s)`,
      numbers.length >= 3 ? undefined : "Add concrete numbers (prices, percentages, dates) — quantified claims are cited more often."
    ),
    check(
      "content.links",
      "Outbound citations",
      externalLinks.length > 0 ? WEIGHTS.content_links : 0,
      WEIGHTS.content_links,
      externalLinks.length > 0 ? "pass" : "fail",
      `${externalLinks.length} external link(s)`,
      externalLinks.length > 0 ? undefined : "Cite authoritative external sources — it raises perceived credibility."
    ),
  ];

  if (images.length > 0 && imagesWithAlt / images.length < 0.9) {
    checks.push({
      id: "content.image_alt",
      category: "content",
      label: "Images have alt text",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `${images.length - imagesWithAlt}/${images.length} image(s) without alt`,
      fix: "Add descriptive alt text — multimodal engines read images through it.",
    });
  }

  return { data, checks };
}
