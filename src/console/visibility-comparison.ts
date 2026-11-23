import type { Dataset } from "./ai-visibility.js";
import { recentDatasets } from "./ai-visibility-store.js";
import { cohortKey, panelSignature, type ComparisonObservation } from "./visibility-measurement.js";
import { readVisibilityScope } from "./visibility-scope.js";
import type { AlertConfig } from "./competition-alerts.js";

const DAY = 86_400_000;
export const VISIBILITY_COMPARISON_METHOD = "matched-cohorts-v1";
export const utcDayStart = (date: Date) => Math.floor(date.getTime() / DAY) * DAY;
const dateLabel = (time: number) => new Date(time).toISOString().split("T")[0];
type Window = { start: number; end: number };
type Counts = { responses: number; brandMentions: number; totalMentions: number; sourceOnly: number };

export function* compatiblePanels(tenantId: string, selected: Dataset, includeHistory: boolean): IterableIterator<Dataset> {
  yield selected;
  if (!includeHistory) return;
  const signature = panelSignature(selected.brands);
  for (const panel of recentDatasets<Dataset>(tenantId)) {
    if (panel.id !== selected.id && panelSignature(panel.brands) === signature) yield panel;
  }
}

function zero(): Counts {
  return { responses: 0, brandMentions: 0, totalMentions: 0, sourceOnly: 0 };
}

export function aggregateWindows(
  rows: Iterable<ComparisonObservation>,
  windows: Window[],
  brand: string,
  trackedBrands: Set<string>,
  latest = Infinity,
) {
  const cohorts = new Map<string, Counts[]>();
  const totals = windows.map(zero);
  const seen = new Set<string>();
  for (const row of rows) {
    const time = Date.parse(row.observedAt);
    if (time > latest) continue;
    const index = windows.findIndex((window) => time >= window.start && time < window.end);
    if (index < 0) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const key = cohortKey(row);
    const mentions = new Set(row.mentions.filter((mention) => mention.status !== "rejected" && trackedBrands.has(mention.brand)).map((mention) => mention.brand));
    const group = cohorts.get(key) ?? windows.map(zero);
    for (const count of [group[index], totals[index]]) {
      count.responses++;
      count.brandMentions += Number(mentions.has(brand));
      count.totalMentions += mentions.size;
      count.sourceOnly += Number(!row.measurement);
    }
    cohorts.set(key, group);
  }
  return { totals, shared: [...cohorts.values()].filter((group) => group.every((window) => window.responses > 0)) };
}

export function matchedMetric(
  groups: Counts[][],
  windowCount: number,
  denominator: "responses" | "totalMentions",
  minimum: number,
  complete = true,
) {
  const eligible = groups.filter((group) => group.every((window) => window[denominator] > 0));
  const included = Array<number>(windowCount).fill(0);
  const sums = Array<number>(windowCount).fill(0);
  for (const group of eligible) {
    group.forEach((window, index) => {
      included[index] += window.responses;
      sums[index] += window.brandMentions / window[denominator];
    });
  }
  const rates = complete && eligible.length && included.every((count) => count >= minimum)
    ? sums.map((sum) => sum / eligible.length * 100) : null;
  return { sharedCohorts: eligible.length, included, rates };
}

export function readVisibilityComparison(
  tenantId: string,
  body: Record<string, unknown>,
  options: { defaultBrand?: string; alert?: AlertConfig; now?: Date; action?: { id: string; completedAt: string; prompt: string; days?: 14 | 28; cohort?: string } } = {},
) {
  const now = options.now ?? new Date();
  const action = options.action;
  const actionDay = action ? utcDayStart(new Date(action.completedAt)) : null;
  if (actionDay !== null && !Number.isFinite(actionDay)) throw new Error("Invalid completion date");
  // Leave the UTC completion day out of both windows.
  const scope = actionDay === null ? body : { ...body, from: dateLabel(actionDay + DAY), to: dateLabel(actionDay + (action?.days ?? 30) * DAY) };
  const { panel, filters, group } = readVisibilityScope(tenantId, scope);
  const { from, to, source } = filters;
  if (!from || !to) throw new Error("A start and end date are required");
  if (body.includeHistory !== undefined && typeof body.includeHistory !== "boolean") throw new Error("Invalid history option");
  if (body.prompt !== undefined && (typeof body.prompt !== "string" || !body.prompt || body.prompt.length > 2000)) throw new Error("Invalid comparison prompt");
  const prompt = action?.prompt ?? (typeof body.prompt === "string" ? body.prompt : "");
  const includeHistory = body.includeHistory === true;
  const trackedBrands = new Set(panel.brands.map((brand) => brand.name));
  const brand = filters.brand || options.defaultBrand || panel.brands[0]?.name;
  if (!brand || !trackedBrands.has(brand)) throw new Error("Brand not found");
  const alert = options.alert;
  const minimum = alert?.datasetId === panel.id && alert.brand === brand ? alert.minPerWindow : 5;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`) + DAY;
  const previousEnd = actionDay ?? start;
  const windows = [{ start: previousEnd - (end - start), end: previousEnd }, { start, end }];
  const complete = end <= utcDayStart(now);
  const groupPrompts = group && new Set(group.prompts);
  let datasets = 0;
  function* scopedObservations() {
    for (const dataset of compatiblePanels(tenantId, panel, includeHistory)) {
      datasets++;
      for (const row of dataset.observations) {
        if ((!source || row.source === source) && (!prompt || row.prompt === prompt) && (!groupPrompts || groupPrompts.has(row.prompt))
          && (!action?.cohort || action.cohort === cohortKey(row))) yield row;
      }
    }
  }
  const { totals, shared } = aggregateWindows(scopedObservations(), windows, brand, trackedBrands, now.getTime());
  const visibility = matchedMetric(shared, windows.length, "responses", minimum, complete);
  const shareOfVoice = matchedMetric(shared, windows.length, "totalMentions", minimum, complete);
  const metric = ({ rates, ...support }: ReturnType<typeof matchedMetric>) => ({
    ...support, previous: rates?.[0] ?? null, current: rates?.[1] ?? null, delta: rates ? rates[1] - rates[0] : null,
  });
  return {
    method: VISIBILITY_COMPARISON_METHOD,
    state: !complete ? "incomplete" as const : visibility.rates ? "comparable" as const : "insufficient" as const,
    panel: panel.id,
    brand,
    filters: { ...filters, brand, prompt, includeHistory, actionId: action?.id ?? null },
    minimumPerWindow: minimum,
    datasets,
    windows: windows.map((window, index) => ({
      from: dateLabel(window.start), to: dateLabel(window.end - DAY), responses: totals[index].responses,
      withoutContext: totals[index].sourceOnly,
    })),
    visibility: metric(visibility),
    shareOfVoice: metric(shareOfVoice),
  };
}
