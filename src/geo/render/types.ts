export type RenderVerdict = "ssr" | "hybrid" | "client-only" | "not-measured";

export interface RenderDiff {
  rawWords: number;
  renderedWords: number;
  wordDelta: number;
  /** Rendered words divided by raw words; null when raw text is empty. */
  renderedToRawTextRatio: number | null;
  visibleContentPercent: number | null;
  headingsAdded: string[];
  jsonLdAdded: number;
  linksAdded: string[];
  imagesAdded: string[];
  rawOpeningText: string;
}

export interface RenderReport {
  verdict: RenderVerdict;
  diff: RenderDiff | null;
  reason?: string;
}
