/**
 * Shared completion donut + category pictogram for the GEO v2 category
 * breakdown (public read in the console, shared /report pages, any view that
 * renders `renderFreeReport360`). Values come only from the controls already
 * returned by the API: "unknown" is never counted as complete, "not applicable"
 * is shown as its own segment, and an empty group renders a neutral state.
 */
import { icon } from "./icons.js";

/** Language-independent pictogram per stable v2 category key. */
export const CATEGORY_ICONS = Object.freeze({
  robots: "robot", llms: "book", jsonld: "braces", meta: "tag",
  content: "text", brand: "badge", discovery: "compass", rendering: "window",
});
export const FALLBACK_CATEGORY_ICON = "checklist";
export const categoryIconName = key => (Object.hasOwn(CATEGORY_ICONS, key) ? CATEGORY_ICONS[key] : FALLBACK_CATEGORY_ICON);

/** Counts observed / unknown / not-applicable controls; percentages are rounded shares of the total. */
export function completionStats(controls) {
  const list = Array.isArray(controls) ? controls : [];
  const observed = list.filter(c => c?.status === "measured").length;
  const notApplicable = list.filter(c => c?.status === "not_applicable").length;
  const total = list.length;
  const unknown = total - observed - notApplicable;
  const pct = n => (total ? (100 * n) / total : 0);
  return {
    observed, unknown, notApplicable, total,
    percent: total ? Math.round(pct(observed)) : null,
    observedShare: pct(observed), notApplicableShare: pct(notApplicable),
  };
}

const fmtPercent = (value, lang) => (value === null ? "—" : lang === "fr" ? `${value}\u00a0%` : `${value}%`);

export function completionLabel(stats, lang) {
  const fr = lang === "fr";
  if (!stats.total) return fr ? "Aucun contrôle dans cette catégorie" : "No checks in this category";
  const base = fr
    ? `${stats.observed} sur ${stats.total} observé${stats.observed > 1 ? "s" : ""}, ${fmtPercent(stats.percent, lang)}`
    : `${stats.observed} of ${stats.total} observed, ${fmtPercent(stats.percent, lang)}`;
  const extra = [];
  if (stats.unknown) extra.push(fr ? `${stats.unknown} inconnu${stats.unknown > 1 ? "s" : ""}` : `${stats.unknown} unknown`);
  if (stats.notApplicable) extra.push(fr ? `${stats.notApplicable} non applicable${stats.notApplicable > 1 ? "s" : ""}` : `${stats.notApplicable} not applicable`);
  return extra.length ? `${base} (${extra.join(", ")})` : base;
}

/** Small donut (CSS conic-gradient) with the percentage as visible text. */
export function renderCompletionDonut(stats, lang, { size = "sm" } = {}) {
  const wrap = document.createElement("span");
  wrap.className = `gg-donut gg-donut-${size}${stats.total ? "" : " gg-donut-empty"}${stats.percent === 100 ? " gg-donut-full" : ""}`;
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", completionLabel(stats, lang));
  const a = stats.observedShare.toFixed(2), b = (stats.observedShare + stats.notApplicableShare).toFixed(2);
  // CSSOM, not a style attribute: the console CSP (style-src 'self') blocks the latter.
  wrap.style.setProperty("--gg-done", `${a}%`); wrap.style.setProperty("--gg-na", `${b}%`);
  const ring = document.createElement("span"); ring.className = "gg-donut-ring"; ring.setAttribute("aria-hidden", "true");
  const value = document.createElement("span"); value.className = "gg-donut-value"; value.setAttribute("aria-hidden", "true");
  value.textContent = fmtPercent(stats.percent, lang);
  wrap.append(ring, value);
  return wrap;
}

export function renderCategoryIcon(key) {
  const holder = document.createElement("span");
  holder.className = `gg-category-icon gg-category-icon-${categoryIconName(key)}`;
  holder.setAttribute("aria-hidden", "true");
  holder.dataset.icon = categoryIconName(key);
  holder.innerHTML = icon(categoryIconName(key));
  return holder;
}
