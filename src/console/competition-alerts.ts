/** Read-only alerts across equally weighted cohorts common to all windows. */
import { aggregateWindows, matchedMetric, utcDayStart } from "./visibility-comparison.js";
import type { ComparisonObservation } from "./visibility-measurement.js";
export interface AlertConfig { datasetId: string; brand: string; windowDays: number; minPerWindow: number; threshold: number }
export function visibilityAlert(rows: Iterable<ComparisonObservation>, config: AlertConfig, now = new Date()) {
  const days = config.windowDays, end = utcDayStart(now), width = days * 86_400_000;
  const windows = [0, 1, 2].map((i) => ({ start: end - (3 - i) * width, end: end - (2 - i) * width }));
  const { shared } = aggregateWindows(rows, windows, config.brand, new Set([config.brand]));
  const { rates, included: counts, sharedCohorts: common } = matchedMetric(shared, windows.length, "responses", config.minPerWindow);
  if (!rates) return { state: "insufficient" as const, counts, common };
  const delta1 = rates[1] - rates[0], delta2 = rates[2] - rates[0];
  const direction = delta1 <= -config.threshold && delta2 <= -config.threshold ? "down" : delta1 >= config.threshold && delta2 >= config.threshold ? "up" : "stable";
  return { state: direction, counts, common, rates, delta1, delta2, end: new Date(end).toISOString(), windowDays: days };
}
