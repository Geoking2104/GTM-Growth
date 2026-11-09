import { LLMS_DEPTH_HIGH_WORDS, LLMS_DEPTH_WORDS, WEIGHTS } from "../config.js";
import { countWords } from "../text.js";
import type { CategoryResult, GeoCheck, LlmsAudit } from "../types.js";

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

function documentLinkValid(href: string): boolean {
  if (!href || href.startsWith("#") || /[\u0000-\u001f<>\s]/.test(href)) return false;
  try {
    const url = new URL(href, "https://geo-v2.invalid/llms.txt");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Audit /llms.txt against the llmstxt.org shape the model scores: H1 first,
 * a `>` summary, H2 sections, markdown links, depth, and the optional
 * /llms-full.txt companion.
 */
export function auditLlms(
  body: string | null,
  status: number,
  fullBody: string | null
): CategoryResult<LlmsAudit> {
  const text = (body ?? "").replace(/^\uFEFF/, "");
  const found = status === 200 && body !== null && text.trim().length > 0;
  const lines = found ? text.split(/\r?\n/) : [];

  const hasH1 = lines.some((line) => line.startsWith("# "));
  const hasBlockquote = lines.some((line) => line.startsWith("> "));
  const sections = lines.filter((line) => line.startsWith("## "));
  const links = [...(found ? text.matchAll(LINK_RE) : [])];
  const siteHeading = lines.find((line) => line.startsWith("# "))?.slice(2).trim() ?? "";
  const summary = lines.filter((line) => line.startsWith("> "))
    .map((line) => line.slice(2).trim()).join(" ").slice(0, 600);
  const linkDetails = links.map((match) => ({
    label: match[1].trim().slice(0, 120),
    href: match[2].trim().slice(0, 300),
    valid: documentLinkValid(match[2].trim()),
  }));
  const wordCount = found ? countWords(text) : 0;
  const hasFull = (fullBody ?? "").trim().length > 0;

  const warnings: string[] = [];
  if (found) {
    if (!hasBlockquote) warnings.push("llms.txt should have a > blockquote description after the H1");
    const firstNonEmpty = lines.find((line) => line.trim());
    if (firstNonEmpty && !firstNonEmpty.startsWith("# ")) {
      warnings.push("llms.txt should start with an H1 (# Site name)");
    }
    if (!links.length) warnings.push("llms.txt should contain markdown links to site pages");
    if (wordCount < 100) warnings.push("llms.txt is very short — add topics and links");
  }

  const data: LlmsAudit = {
    found,
    status,
    hasH1,
    hasBlockquote,
    hasSections: sections.length > 0,
    sectionsCount: sections.length,
    hasLinks: links.length > 0,
    linksCount: links.length,
    wordCount,
    hasFull,
    warnings,
    excerpt: found ? text.slice(0, 400) : "",
    siteHeading,
    summary,
    validLinkCount: linkDetails.filter((item) => item.valid).length,
    invalidLinkCount: linkDetails.filter((item) => !item.valid).length,
    linkSamples: linkDetails.slice(0, 6),
  };

  const check = (
    id: string,
    label: string,
    earned: number,
    max: number,
    status: GeoCheck["status"],
    evidence: string,
    fix?: string
  ): GeoCheck => ({ id, category: "llms", label, earned, max, status, evidence, fix });

  const checks: GeoCheck[] = [
    check(
      "llms.found",
      "/llms.txt exists",
      found ? WEIGHTS.llms_found : 0,
      WEIGHTS.llms_found,
      found ? "pass" : "fail",
      found ? `HTTP 200, ${wordCount} words` : `No usable /llms.txt (HTTP ${status})`,
      found ? undefined : "Generate /llms.txt from your sitemap (geo_generate_llms_txt) and deploy it at the site root."
    ),
    check(
      "llms.h1",
      "H1 title present",
      hasH1 ? WEIGHTS.llms_h1 : 0,
      WEIGHTS.llms_h1,
      hasH1 ? "pass" : "fail",
      hasH1 ? "File starts with an H1 heading" : "No `# Site name` heading found",
      hasH1 ? undefined : "Start llms.txt with `# <Site name>` so agents can identify the source."
    ),
    check(
      "llms.blockquote",
      "Blockquote summary present",
      hasBlockquote ? WEIGHTS.llms_blockquote : 0,
      WEIGHTS.llms_blockquote,
      hasBlockquote ? "pass" : "fail",
      hasBlockquote ? "A `>` summary line was found" : "No `> description` line found",
      hasBlockquote ? undefined : "Add a one-line `> What this site offers` blockquote directly under the H1."
    ),
    check(
      "llms.sections",
      "H2 topic sections",
      sections.length ? WEIGHTS.llms_sections : 0,
      WEIGHTS.llms_sections,
      sections.length ? "pass" : "fail",
      `${sections.length} H2 section(s)`,
      sections.length
        ? undefined
        : "Organize links under H2 sections (## Docs, ## Product, ## Company) so agents can route by topic."
    ),
    check(
      "llms.links",
      "Markdown links to key pages",
      links.length ? WEIGHTS.llms_links : 0,
      WEIGHTS.llms_links,
      links.length ? "pass" : "fail",
      `${links.length} markdown link(s)`,
      links.length
        ? undefined
        : "Add markdown links to the pages AI engines should cite, with a short description per link."
    ),
    check(
      "llms.depth",
      `Content depth ≥ ${LLMS_DEPTH_WORDS} words`,
      wordCount >= LLMS_DEPTH_WORDS ? WEIGHTS.llms_depth : 0,
      WEIGHTS.llms_depth,
      wordCount >= LLMS_DEPTH_WORDS ? "pass" : "fail",
      `${wordCount} words`,
      wordCount >= LLMS_DEPTH_WORDS
        ? undefined
        : "Expand llms.txt with product, documentation and company sections — thin files carry little signal."
    ),
    check(
      "llms.depth_high",
      `Content depth ≥ ${LLMS_DEPTH_HIGH_WORDS} words`,
      wordCount >= LLMS_DEPTH_HIGH_WORDS ? WEIGHTS.llms_depth_high : 0,
      WEIGHTS.llms_depth_high,
      wordCount >= LLMS_DEPTH_HIGH_WORDS ? "pass" : "fail",
      `${wordCount} words`,
      wordCount >= LLMS_DEPTH_HIGH_WORDS
        ? undefined
        : "For a full reference, ship /llms-full.txt and link it from llms.txt."
    ),
    check(
      "llms.full",
      "/llms-full.txt companion",
      hasFull ? WEIGHTS.llms_full : 0,
      WEIGHTS.llms_full,
      hasFull ? "pass" : "fail",
      hasFull ? "Companion file found" : "No /llms-full.txt",
      hasFull ? undefined : "Publish /llms-full.txt with the expanded corpus and link it from llms.txt."
    ),
  ];

  return { data, checks };
}
