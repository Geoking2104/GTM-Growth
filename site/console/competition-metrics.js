/** Comparable observations are grouped by exact prompt and source. */
export function comparePeriods(rows, brand, from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`), day = 86400000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to || end < start) return null;
  const span = end - start + day, previousStart = start - span;
  const current = rows.filter((r) => { const t = Date.parse(r.observedAt); return t >= start && t < end + day; });
  const previous = rows.filter((r) => { const t = Date.parse(r.observedAt); return t >= previousStart && t < start; });
  const key = (r) => JSON.stringify([r.prompt, r.source]);
  const beforeKeys = new Set(previous.map(key)), afterKeys = new Set(current.map(key));
  const shared = [...afterKeys].filter((k) => beforeKeys.has(k));
  const count = (r) => r.mentions.some((m) => m.brand === brand && m.status !== "rejected");
  // Equal weight for each shared prompt/source stratum prevents changing collection counts from changing the mix.
  const rate = (data) => shared.reduce((sum, k) => { const group = data.filter((r) => key(r) === k); return sum + group.filter(count).length / group.length; }, 0) / shared.length * 100;
  if (!shared.length) return { shared: 0, previousCount: 0, currentCount: 0, previous: null, current: null, delta: null };
  const prev = previous.filter((r) => shared.includes(key(r))), cur = current.filter((r) => shared.includes(key(r)));
  const oldRate = rate(prev), newRate = rate(cur);
  return { shared: shared.length, previousCount: prev.length, currentCount: cur.length, previous: oldRate, current: newRate, delta: newRate - oldRate, previousStart: new Date(previousStart).toISOString().slice(0, 10), previousEnd: new Date(start - day).toISOString().slice(0, 10) };
}
/** Transparent heuristic: opportunity, confidence and editable business/effort assumptions. */
export function opportunityScore(lost, total, importance, effort, hasPage = false) {
  if (!Number.isFinite(lost) || !Number.isFinite(total) || !Number.isFinite(importance) || !Number.isFinite(effort) || total <= 0 || lost < 0 || lost > total || importance < 1 || importance > 3 || effort < 1 || effort > 3) return null;
  const gap = lost / total, coverage = Math.min(total / 20, 1), pageFactor = hasPage ? 1 : 0.75;
  return { gap, coverage, pageFactor, importance, effort, score: Math.round(100 * gap * coverage * (importance / 3) * ((4 - effort) / 3) * pageFactor) };
}
