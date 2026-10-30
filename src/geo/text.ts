import { BRAND_LEGAL_SUFFIXES, TITLE_SEPARATORS } from "./config.js";

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;

/** Word count that treats each CJK character as one word-like unit. */
export function countWords(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  const cjk = normalized.match(CJK_RE)?.length ?? 0;
  const nonCjk = normalized.replace(CJK_RE, " ").trim();
  const latin = nonCjk ? nonCjk.split(/\s+/).filter(Boolean).length : 0;
  return cjk + latin;
}

/** Cut a title/H1 at the first brand separator: "Acme — Tools" → "Acme". */
export function cutAtFirstSeparator(text: string): string {
  const hits = TITLE_SEPARATORS.map((sep) => text.indexOf(sep)).filter((i) => i > 0);
  return hits.length ? text.slice(0, Math.min(...hits)).trim() : text.trim();
}

/** Lowercase and strip a trailing legal suffix so "Acme Inc." matches "Acme". */
export function normalizeBrandName(name: string): string {
  let normalized = name.trim().toLowerCase().replace(/,$/, "");
  for (const suffix of BRAND_LEGAL_SUFFIXES) {
    if (normalized.endsWith(` ${suffix}`)) {
      normalized = normalized.slice(0, -(suffix.length + 1)).trim();
      break;
    }
  }
  return normalized;
}

/** Collapse whitespace and casefold, for loose containment checks. */
export function fold(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
