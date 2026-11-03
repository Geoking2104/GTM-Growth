/**
 * SEO tables for the free read.
 *
 * Everything here is measured on the HTML the server actually fetched: no
 * inference, no benchmark, no "industry average". A row is `pass`, `warn`,
 * `fail` or `info`, and the note says why — the same shape the paid report uses.
 */

import type { HtmlDoc, HtmlNode } from "../geo/html.js";
import { countWords } from "../geo/text.js";

export type RowStatus = "pass" | "warn" | "fail" | "info";

export interface TableRow {
  label: string;
  value: string;
  status: RowStatus;
  note?: string;
}

export interface DataTable {
  id: string;
  title: string;
  subtitle?: string;
  rows: TableRow[];
  /** True when the numbers are illustrative, not measured on the target. */
  sample?: boolean;
  /** True when the rows come from a live Google API rather than page signals. */
  connected?: boolean;
}

const clamp = (text: string, max = 90): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const status = (ok: boolean, warn = false): RowStatus => (ok ? "pass" : warn ? "warn" : "fail");

function lengthRow(label: string, value: string, min: number, max: number, hint: string): TableRow {
  const length = value.trim().length;
  if (!length) return { label, value: "missing", status: "fail", note: hint };
  const ok = length >= min && length <= max;
  return {
    label,
    value: `${length} chars`,
    status: status(ok, length > 0),
    note: ok ? clamp(value) : `${hint} Currently: “${clamp(value, 70)}”`,
  };
}

function headingOutline(doc: HtmlDoc): string {
  const levels = doc.all("h2").length;
  const threes = doc.all("h3").length;
  const first = doc.first("h2");
  const sample = first ? doc.textOf(first) : "";
  return `H1 ${doc.all("h1").length} · H2 ${levels} · H3 ${threes}${sample ? ` · first H2: “${clamp(sample, 48)}”` : ""}`;
}

function schemaTypes(doc: HtmlDoc): { types: string[]; blocks: number; errors: number } {
  const types = new Set<string>();
  let blocks = 0;
  let errors = 0;
  for (const node of doc.all("script")) {
    if ((node.attrs.type ?? "").toLowerCase() !== "application/ld+json") continue;
    blocks += 1;
    try {
      const parsed = JSON.parse(doc.textOf(node));
      const collect = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(collect);
          return;
        }
        if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          const type = record["@type"];
          if (typeof type === "string") types.add(type);
          if (Array.isArray(type)) type.filter((item) => typeof item === "string").forEach((item) => types.add(item));
          if (record["@graph"]) collect(record["@graph"]);
        }
      };
      collect(parsed);
    } catch {
      errors += 1;
    }
  }
  return { types: [...types], blocks, errors };
}

function linkCounts(doc: HtmlDoc, finalUrl: string): { internal: number; external: number; empty: number } {
  let host = "";
  try {
    host = new URL(finalUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  let internal = 0;
  let external = 0;
  let empty = 0;
  for (const node of doc.all("a")) {
    const href = (node.attrs.href ?? "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      empty += 1;
      continue;
    }
    try {
      const resolved = new URL(href, finalUrl);
      if (resolved.hostname.replace(/^www\./, "") === host) internal += 1;
      else external += 1;
    } catch {
      empty += 1;
    }
  }
  return { internal, external, empty };
}

function imageStats(doc: HtmlDoc): { total: number; missingAlt: number } {
  const images = doc.all("img");
  return {
    total: images.length,
    missingAlt: images.filter((node: HtmlNode) => !(node.attrs.alt ?? "").trim()).length,
  };
}

/** Meta and content tables — the "SEO" half of the free read. */
export function seoTables(doc: HtmlDoc, finalUrl: string, headers: Record<string, string>): DataTable[] {
  const title = doc.title() ?? "";
  const description = (doc.metaByName("description")?.attrs.content ?? "").trim();
  const canonicalNode = doc.linkByRel("canonical");
  const canonical = canonicalNode?.attrs.href ?? "";
  const robotsMeta = (doc.metaByName("robots")?.attrs.content ?? "").toLowerCase();
  const lang = doc.htmlLang() ?? "";
  const bodyText = doc.bodyText();
  const words = countWords(bodyText);
  const h1s = doc.all("h1");
  const outline = headingOutline(doc);
  const schema = schemaTypes(doc);
  const links = linkCounts(doc, finalUrl);
  const images = imageStats(doc);
  const hreflang = doc.all("link").filter((node) => (node.attrs.rel ?? "").toLowerCase() === "alternate" && node.attrs.hreflang);
  const ogTitle = (doc.metaByProperty("og:title")?.attrs.content ?? "").trim();
  const ogImage = (doc.metaByProperty("og:image")?.attrs.content ?? "").trim();
  const xRobots = headers["x-robots-tag"] ?? "";

  let canonicalStatus: RowStatus = "fail";
  let canonicalNote = "No canonical link: the page has no declared identity.";
  if (canonical) {
    try {
      const resolved = new URL(canonical, finalUrl);
      const self = resolved.href.replace(/\/$/, "") === finalUrl.replace(/\/$/, "");
      canonicalStatus = self ? "pass" : "warn";
      canonicalNote = self ? clamp(canonical) : `Points elsewhere: ${clamp(canonical)}`;
    } catch {
      canonicalStatus = "fail";
      canonicalNote = "Canonical is not a valid URL.";
    }
  }

  return [
    {
      id: "seo.meta",
      title: "SEO — metadata",
      subtitle: "Measured on the HTML returned by the server.",
      rows: [
        lengthRow("Title", title, 20, 60, "Aim for 20–60 characters so the title survives a snippet."),
        lengthRow("Meta description", description, 70, 160, "Aim for 70–160 characters: engines reuse it verbatim."),
        { label: "Canonical", value: canonical ? clamp(canonical, 60) : "missing", status: canonicalStatus, note: canonicalNote },
        {
          label: "Robots meta",
          value: robotsMeta || "index, follow (default)",
          status: robotsMeta.includes("noindex") ? "fail" : "pass",
          note: robotsMeta.includes("noindex") ? "The page asks not to be indexed." : "Indexable.",
        },
        {
          label: "X-Robots-Tag",
          value: xRobots || "none",
          status: xRobots.toLowerCase().includes("noindex") ? "fail" : "pass",
        },
        { label: "html lang", value: lang || "missing", status: lang ? "pass" : "fail", note: lang ? "" : "Declare the language: engines use it for language targeting." },
        { label: "Open Graph", value: ogTitle ? "og:title present" : "missing", status: ogTitle ? "pass" : "warn", note: ogImage ? "og:image present" : "No og:image: link previews render empty." },
        { label: "hreflang", value: `${hreflang.length} alternate(s)`, status: hreflang.length ? "pass" : "info", note: hreflang.length ? "Declared language variants." : "Single-language page." },
      ],
    },
    {
      id: "seo.content",
      title: "SEO — content structure",
      subtitle: "Word counts and headings as an engine parses them.",
      rows: [
        {
          label: "H1",
          value: h1s.length === 0 ? "missing" : `${h1s.length} · “${clamp(doc.textOf(h1s[0]), 60)}”`,
          status: h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn",
          note: h1s.length > 1 ? "Several H1s: the page states more than one main topic." : "",
        },
        { label: "Outline", value: outline, status: doc.all("h2").length >= 2 ? "pass" : "warn", note: doc.all("h2").length >= 2 ? "" : "Fewer than two H2s: the structure is hard to excerpt." },
        { label: "Words", value: `${words}`, status: words >= 300 ? "pass" : words >= 120 ? "warn" : "fail", note: words >= 300 ? "" : "Thin page: little to quote." },
        { label: "Tables", value: `${doc.all("table").length}`, status: doc.all("table").length ? "pass" : "info", note: doc.all("table").length ? "" : "No table: comparisons stay unquotable." },
        { label: "Lists", value: `${doc.all("li").length} item(s)`, status: doc.all("li").length >= 3 ? "pass" : "info" },
        { label: "Blockquotes", value: `${doc.all("blockquote").length}`, status: doc.all("blockquote").length ? "pass" : "info", note: doc.all("blockquote").length ? "" : "No quotation: assistants rarely quote what is not already a quote." },
      ],
    },
    {
      id: "seo.technical",
      title: "SEO — links, media and structured data",
      rows: [
        { label: "Internal links", value: `${links.internal}`, status: links.internal >= 3 ? "pass" : "warn", note: links.internal >= 3 ? "" : "Few internal links: weak crawl paths." },
        { label: "External links", value: `${links.external}`, status: links.external >= 1 ? "pass" : "warn", note: links.external >= 1 ? "" : "No outbound citation: claims are unsourced." },
        { label: "Empty or anchor links", value: `${links.empty}`, status: links.empty > links.internal + links.external ? "warn" : "pass" },
        { label: "Images", value: `${images.total}`, status: "info" },
        {
          label: "Images without alt",
          value: `${images.missingAlt}`,
          status: images.missingAlt === 0 ? "pass" : images.missingAlt === images.total ? "fail" : "warn",
          note: images.missingAlt ? `${images.missingAlt} of ${images.total} carry no alt text.` : "",
        },
        {
          label: "JSON-LD blocks",
          value: `${schema.blocks}${schema.errors ? ` · ${schema.errors} parse error(s)` : ""}`,
          status: schema.blocks === 0 ? "fail" : schema.errors ? "warn" : "pass",
        },
        {
          label: "Schema types",
          value: schema.types.length ? schema.types.join(", ") : "none",
          status: schema.types.length ? "pass" : "fail",
          note: schema.types.includes("Article") ? "" : "No Article: editorial pages cannot carry authors or dates.",
        },
      ],
    },
  ];
}
