import { HtmlDoc } from "../html.js";
import type { RenderDiff, RenderReport } from "./types.js";

const normalized = (s: string) => s.replace(/\s+/g, " ").trim();
const words = (s: string) => normalized(s).split(/\s+/).filter(Boolean);

/** Multiset difference preserves repeated elements, in document order. */
function added(raw: string[], rendered: string[]): string[] {
  const counts = new Map<string, number>();
  for (const item of raw) counts.set(item, (counts.get(item) ?? 0) + 1);
  return rendered.filter((item) => {
    const count = counts.get(item) ?? 0;
    if (count) { counts.set(item, count - 1); return false; }
    return true;
  });
}

function headings(doc: HtmlDoc): string[] {
  const result: string[] = [];
  const visit = (node: typeof doc.root) => {
    if (/^h[1-6]$/.test(node.tag)) {
      const value = normalized(doc.textOf(node));
      if (value) result.push(`${node.tag}: ${value}`);
    }
    node.children.forEach(visit);
  };
  visit(doc.root);
  return result;
}

function attributes(doc: HtmlDoc, tag: string, attr: string): string[] {
  return doc.all(tag).map((node) => node.attrs[attr]?.trim()).filter((v): v is string => Boolean(v));
}

function jsonLd(doc: HtmlDoc): string[] {
  return doc.all("script").filter((node) => (node.attrs.type ?? "").toLowerCase().split(";")[0].trim() === "application/ld+json")
    .map((node) => normalized(doc.textOf(node)));
}

/** Compare HTML snapshots without a browser or network access. */
export function diffRenderedHtml(rawHtml: string, renderedHtml: string): RenderDiff {
  const raw = HtmlDoc.parse(rawHtml);
  const rendered = HtmlDoc.parse(renderedHtml);
  const rawText = normalized(raw.bodyText());
  const renderedText = normalized(rendered.bodyText());
  const rawWords = words(rawText).length;
  const renderedWords = words(renderedText).length;
  return {
    rawWords, renderedWords, wordDelta: renderedWords - rawWords,
    renderedToRawTextRatio: rawWords ? Math.round(renderedWords / rawWords * 100) / 100 : null,
    visibleContentPercent: renderedWords ? Math.min(100, Math.round(rawWords / renderedWords * 100)) : null,
    headingsAdded: added(headings(raw), headings(rendered)),
    jsonLdAdded: added(jsonLd(raw), jsonLd(rendered)).length,
    linksAdded: added(attributes(raw, "a", "href"), attributes(rendered, "a", "href")),
    imagesAdded: added(attributes(raw, "img", "src"), attributes(rendered, "img", "src")),
    rawOpeningText: words(rawText).slice(0, 60).join(" "),
  };
}

/** Word-count ratio is an estimate, not a measurement of crawler visibility. */
export function compareRenderSnapshots(rawHtml: string, renderedHtml: string): RenderReport {
  const diff = diffRenderedHtml(rawHtml, renderedHtml);
  if (diff.visibleContentPercent === null) return { verdict: "not-measured", diff, reason: "Rendered page has no extractable text." };
  const verdict = diff.visibleContentPercent < 20 ? "client-only" : diff.visibleContentPercent < 80 ? "hybrid" : "ssr";
  return { verdict, diff };
}
