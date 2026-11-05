/** Read-only alerts. Each window uses the same prompt/source pairs and equal weighting. */
type Mention = { brand: string; status?: string };
type Observation = { id: string; prompt: string; source: string; observedAt: string; mentions: Mention[] };
export interface AlertConfig { datasetId: string; brand: string; windowDays: number; minPerWindow: number; threshold: number }
export function visibilityAlert(rows: Observation[], config: AlertConfig, now = new Date()) {
  const days = config.windowDays, end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()), width = days * 86400000;
  const windows = [0, 1, 2].map((i) => rows.filter((r) => { const t = Date.parse(r.observedAt); return t >= end - (3 - i) * width && t < end - (2 - i) * width; }));
  const key = (r: Observation) => JSON.stringify([r.prompt, r.source]);
  const sets = windows.map((items) => new Set(items.map(key)));
  const common = [...sets[0]].filter((k) => sets[1].has(k) && sets[2].has(k));
  const groups = windows.map((items) => items.filter((r) => common.includes(key(r))));
  const counts = groups.map((g) => g.length);
  if (!common.length || counts.some((n) => n < config.minPerWindow)) return { state: "insufficient" as const, counts, common: common.length };
  const rates = groups.map((g) => common.reduce((sum, k) => { const group = g.filter((r) => key(r) === k); return sum + group.filter((r) => r.mentions.some((m) => m.brand === config.brand && m.status !== "rejected")).length / group.length; }, 0) / common.length * 100);
  const delta1 = rates[1] - rates[0], delta2 = rates[2] - rates[0];
  const direction = delta1 <= -config.threshold && delta2 <= -config.threshold ? "down" : delta1 >= config.threshold && delta2 >= config.threshold ? "up" : "stable";
  return { state: direction, counts, common: common.length, rates, delta1, delta2, end: new Date(end).toISOString(), windowDays: days };
}
