/** Transparent heuristic: opportunity, confidence and editable business/effort assumptions. */
export function opportunityScore(lost, total, importance, effort, hasPage = false) {
  if (!Number.isFinite(lost) || !Number.isFinite(total) || !Number.isFinite(importance) || !Number.isFinite(effort) || total <= 0 || lost < 0 || lost > total || importance < 1 || importance > 3 || effort < 1 || effort > 3) return null;
  const gap = lost / total, coverage = Math.min(total / 20, 1), pageFactor = hasPage ? 1 : 0.75;
  return { gap, coverage, pageFactor, importance, effort, score: Math.round(100 * gap * coverage * (importance / 3) * ((4 - effort) / 3) * pageFactor) };
}
