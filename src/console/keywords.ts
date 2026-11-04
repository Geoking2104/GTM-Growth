/**
 * Keyword opportunity score, clustering and SEO calculators — all computed
 * in-house from Search Console query/page rows (no paid keyword API).
 */

/** Approximate organic CTR by position (public industry averages, desktop+mobile blend). */
export const CTR_CURVE = [0.28, 0.155, 0.11, 0.08, 0.062, 0.048, 0.038, 0.031, 0.026, 0.022];

export function ctrForPosition(position: number): number {
  if (!Number.isFinite(position) || position < 1) return CTR_CURVE[0];
  if (position <= 10) {
    const lo = Math.floor(position);
    const hi = Math.min(lo + 1, 10);
    const frac = position - lo;
    return CTR_CURVE[lo - 1] * (1 - frac) + (hi === lo ? CTR_CURVE[lo - 1] : CTR_CURVE[hi - 1]) * frac;
  }
  if (position <= 20) return 0.012 - (position - 10) * 0.0008;
  return 0.003;
}

export interface GscRow { keys?: string[] | null; clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null; }

export interface Opportunity {
  query: string;
  page: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Extra monthly clicks if the query reached the target position. */
  potentialClicks: number;
  /** 0–100. */
  score: number;
  reason: string;
}

/**
 * Score = potential extra clicks (target position 3) weighted by how reachable the
 * target is: "striking distance" positions 4–15 weigh most, 16–30 less, 1–3 only
 * when the CTR is well below the curve (snippet problem).
 */
export function scoreOpportunities(rows: GscRow[], options: { targetPosition?: number; minImpressions?: number } = {}): Opportunity[] {
  const target = options.targetPosition ?? 3;
  const minImpr = options.minImpressions ?? 20;
  const best = new Map<string, Opportunity>();
  for (const row of rows) {
    const [query, page] = row.keys ?? [];
    if (!query) continue;
    const impressions = row.impressions ?? 0;
    if (impressions < minImpr) continue;
    const clicks = row.clicks ?? 0;
    const position = row.position ?? 100;
    const ctr = row.ctr ?? (impressions ? clicks / impressions : 0);
    let reach: number;
    let reason: string;
    let targetCtr = ctrForPosition(Math.min(target, position));
    if (position <= 3) {
      reach = ctr < ctrForPosition(position) * 0.6 ? 0.8 : 0.1;
      targetCtr = ctrForPosition(position);
      reason = reach > 0.5 ? "Top 3 mais CTR faible : retravailler title/meta" : "Déjà bien positionné";
    } else if (position <= 15) { reach = 1; reason = "À portée (positions 4–15) : renforcer la page"; }
    else if (position <= 30) { reach = 0.5; reason = "Pages 2–3 : contenu à approfondir"; }
    else { reach = 0.15; reason = "Loin : nouveau contenu dédié"; }
    const potentialClicks = Math.max(0, impressions * targetCtr - clicks);
    const raw = potentialClicks * reach;
    const opp: Opportunity = { query, page: page ?? null, clicks, impressions, ctr, position, potentialClicks: Math.round(potentialClicks), score: raw, reason };
    const prev = best.get(query);
    if (!prev || prev.score < raw) best.set(query, opp);
  }
  const list = [...best.values()];
  const max = Math.max(1, ...list.map((o) => Math.log1p(o.score)));
  for (const o of list) o.score = Math.round((Math.log1p(o.score) / max) * 100);
  return list.sort((a, b) => b.score - a.score || b.impressions - a.impressions);
}

const STOP = new Set("le la les un une des de du d l et ou en au aux a à pour par sur dans avec sans ce ces cet cette son sa ses mon ma mes qui que quoi comment est the a an of to for in on and or with how what is are by vs".split(" "));

export function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(es|s|x)$/, "") : t));
}

export interface Cluster { label: string; queries: string[]; pages: string[]; clicks: number; impressions: number; score: number; }

/** Greedy clustering: token Jaccard ≥ threshold, or same landing page with ≥ 1 shared token. */
export function clusterQueries(opps: Opportunity[], threshold = 0.5): Cluster[] {
  const clusters: { tokens: Set<string>; pages: Set<string>; members: Opportunity[] }[] = [];
  for (const o of [...opps].sort((a, b) => b.impressions - a.impressions)) {
    const t = new Set(tokens(o.query));
    let home: (typeof clusters)[number] | undefined;
    for (const c of clusters) {
      const inter = [...t].filter((x) => c.tokens.has(x)).length;
      const union = new Set([...t, ...c.tokens]).size || 1;
      if (inter / union >= threshold || (o.page && c.pages.has(o.page) && inter >= 1)) { home = c; break; }
    }
    if (!home) { home = { tokens: new Set(t), pages: new Set(), members: [] }; clusters.push(home); }
    home.members.push(o);
    if (o.page) home.pages.add(o.page);
  }
  return clusters
    .map((c) => ({
      label: c.members[0].query,
      queries: c.members.map((m) => m.query),
      pages: [...c.pages],
      clicks: c.members.reduce((s, m) => s + m.clicks, 0),
      impressions: c.members.reduce((s, m) => s + m.impressions, 0),
      score: Math.max(...c.members.map((m) => m.score)),
    }))
    .sort((a, b) => b.score - a.score || b.impressions - a.impressions);
}

/** Pages losing clicks between two periods (rows keyed by page). */
export function losingPages(current: GscRow[], previous: GscRow[], limit = 50) {
  const prev = new Map(previous.map((r) => [r.keys?.[0] ?? "", r]));
  const cur = new Map(current.map((r) => [r.keys?.[0] ?? "", r]));
  const pages = new Set([...prev.keys(), ...cur.keys()]);
  const out = [];
  for (const page of pages) {
    if (!page) continue;
    const a = prev.get(page);
    const b = cur.get(page);
    const before = a?.clicks ?? 0;
    const after = b?.clicks ?? 0;
    if (after >= before) continue;
    out.push({ page, clicksBefore: before, clicksAfter: after, delta: after - before, deltaPercent: before ? Math.round(((after - before) / before) * 100) : null, positionBefore: a?.position ?? null, positionAfter: b?.position ?? null });
  }
  return out.sort((x, y) => x.delta - y.delta).slice(0, limit);
}

// ── Calculators ──────────────────────────────────────────────────────────

export function ctrTable() {
  return Array.from({ length: 20 }, (_, i) => ({ position: i + 1, ctr: Math.round(ctrForPosition(i + 1) * 1000) / 10 }));
}

/** Monthly organic traffic value = clicks × CPC equivalent (CPC supplied by the user). */
export function trafficValue(input: { searchVolume?: number; position?: number; clicks?: number; cpc: number }) {
  const clicks = input.clicks ?? Math.round((input.searchVolume ?? 0) * ctrForPosition(input.position ?? 1));
  return { clicks, cpc: input.cpc, monthlyValue: round(clicks * input.cpc), yearlyValue: round(clicks * input.cpc * 12) };
}

export function seoRoi(input: { monthlyTraffic: number; conversionRate: number; averageOrderValue: number; margin?: number; monthlyCost: number }) {
  const conversions = input.monthlyTraffic * (input.conversionRate / 100);
  const revenue = conversions * input.averageOrderValue;
  const gross = revenue * ((input.margin ?? 100) / 100);
  return { conversions: round(conversions), revenue: round(revenue), grossProfit: round(gross), cost: input.monthlyCost, roiPercent: input.monthlyCost ? round(((gross - input.monthlyCost) / input.monthlyCost) * 100) : null, breakEvenTraffic: input.averageOrderValue && input.conversionRate ? Math.ceil(input.monthlyCost / ((input.conversionRate / 100) * input.averageOrderValue * ((input.margin ?? 100) / 100))) : null };
}

/** Budget needed to reach a revenue goal, given a cost per acquired organic visit. */
export function seoBudget(input: { targetRevenue: number; conversionRate: number; averageOrderValue: number; costPerVisit: number }) {
  const conversions = input.averageOrderValue ? input.targetRevenue / input.averageOrderValue : 0;
  const traffic = input.conversionRate ? conversions / (input.conversionRate / 100) : 0;
  return { conversionsNeeded: Math.ceil(conversions), trafficNeeded: Math.ceil(traffic), monthlyBudget: round(traffic * input.costPerVisit) };
}

const round = (n: number) => Math.round(n * 100) / 100;
