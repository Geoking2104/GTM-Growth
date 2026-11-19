import type { Dataset } from "./ai-visibility.js";
import { getDataset, readCompetitionState } from "./ai-visibility-store.js";

type QuestionGroup = { id: string; datasetId: string; name: string; prompts: string[] };
type Filters = { source: string; brand: string; groupId: string; from: string; to: string };
type VisibilityScope = { dataset: Dataset; filters: Filters; group?: QuestionGroup; groups: QuestionGroup[]; sources: string[] };

function field(value: unknown, max: number) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid visibility filter");
  return value;
}

function day(value: unknown) {
  const date = field(value, 10);
  if (!date) return date;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid date");
  return date;
}

export function readVisibilityScope(tenantId: string, body: Record<string, unknown>): VisibilityScope {
  const datasetId = field(body.datasetId, 100);
  const dataset = getDataset<Dataset>(tenantId, datasetId);
  if (!dataset) throw new Error("Dataset not found");
  const filters = { source: field(body.source, 100), brand: field(body.brand, 100), groupId: field(body.groupId, 100), from: day(body.from), to: day(body.to) };
  if (filters.from && filters.to && filters.from > filters.to) throw new Error("Invalid date range");
  const { groups: allGroups = [] } = readCompetitionState<{ groups?: QuestionGroup[] }>(tenantId, {});
  const groups = allGroups.filter((group) => group.datasetId === dataset.id);
  const group = groups.find((candidate) => candidate.id === filters.groupId);
  if (filters.groupId && !group) throw new Error("Group not found");
  const prompts = group && new Set(group.prompts);
  const observations = dataset.observations.filter((row) => {
    const date = row.observedAt.slice(0, 10);
    return (!prompts || prompts.has(row.prompt)) && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  });
  return { dataset: { ...dataset, observations }, filters, group, groups, sources: [...new Set(dataset.observations.map((row) => row.source))].sort() };
}
