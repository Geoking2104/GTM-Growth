import { randomUUID } from "node:crypto";
import { tenantOwnsUrl } from "../tenants/store.js";
import { discoverCandidates } from "./competition-discovery.js";
import { visibilityAlert, type AlertConfig } from "./competition-alerts.js";
import type { ConsoleRoute } from "./util.js";
import { getDataset, listDatasets, insertDataset, readCompetitionState, updateCompetitionState } from "./ai-visibility-store.js";

type Action = { id: string; title: string; owner: string; status: "todo" | "doing" | "done"; datasetId: string; prompt: string; createdAt: string; completedAt?: string; page?: string };
type Priority = { datasetId: string; prompt: string; importance: number; effort: number; page: string };
type State = { panels: Record<string, string>; actions: Action[]; priorities?: Priority[]; alert?: AlertConfig; groups?: Array<{ id: string; datasetId: string; name: string; prompts: string[] }> };
const initial = (): State => ({ panels: {}, actions: [] });
const clean = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const tenant = (ctx: { tenancy?: { tenant: { id: string } | null } }) => { if (!ctx.tenancy?.tenant) throw new Error("Select a tenant"); return ctx.tenancy.tenant.id; };
export const competitionRoutes: ConsoleRoute[] = [
  { path: "/competition/state", needsUrl: false, handler: async (ctx) => readCompetitionState(tenant(ctx), initial()) },
  { path: "/competition/panel", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const datasetId = clean(ctx.body.datasetId, 100), brand = clean(ctx.body.brand, 100);
    if (!datasetId || !brand) throw new Error("Dataset and brand required");
    // A panel points to an existing, tenant-owned dataset and one of its brands.
    const dataset = getDataset<{ id: string; createdAt: string; brands: Array<{ name: string }>; observations: unknown[] }>(tenant(ctx), datasetId);
    if (!dataset || !dataset.brands.some((b) => b.name === brand)) throw new Error("Dataset or brand not found");
    return updateCompetitionState(tenant(ctx), initial(), (s) => { s.panels[datasetId] = brand; });
  } },
  { path: "/competition/revise-panel", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const datasetId = clean(ctx.body.datasetId, 100);
    const dataset = getDataset<{ id: string; createdAt: string; brands: unknown[]; observations: Array<{ prompt: string; answer: string; source: string; observedAt: string; citations?: string[]; citationSpans?: Array<{ start: number; end: number; url: string }> }> }>(tenant(ctx), datasetId);
    if (!dataset) throw new Error("Dataset not found");
    const { normalizeImport } = await import("./ai-visibility.js");
    const revised = normalizeImport({ brands: ctx.body.brands, responses: dataset.observations });
    insertDataset(tenant(ctx), revised);
    return { id: revised.id, count: revised.observations.length };
  } },
  { path: "/competition/discovery", needsUrl: false, handler: async (ctx) => {
    type Data = { id: string; createdAt: string; brands: Array<{ name: string; aliases: string[] }>; observations: Array<{ id: string; answer: string; prompt: string; source: string }> };
    const dataset = getDataset<Data>(tenant(ctx), clean(ctx.body.datasetId, 100)); if (!dataset) throw new Error("Dataset not found");
    return { candidates: discoverCandidates(dataset.observations, dataset.brands.flatMap((b) => b.aliases)), notice: "Heuristic text fragments; not verified competitors. Review evidence before adding." };
  } },
  { path: "/competition/group", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const datasetId = clean(ctx.body.datasetId, 100), id = clean(ctx.body.id, 100), name = clean(ctx.body.name, 100), prompts = ctx.body.prompts;
    const data = getDataset<{ id: string; createdAt: string; brands: unknown[]; observations: Array<{ prompt: string }> }>(tenant(ctx), datasetId);
    if (!data || !name || !Array.isArray(prompts) || prompts.length < 1 || prompts.length > 100 || prompts.some((p) => typeof p !== "string" || !data.observations.some((r) => r.prompt === p)) || new Set(prompts).size !== prompts.length) throw new Error("Invalid group");
    return updateCompetitionState(tenant(ctx), initial(), (s) => { const groups = s.groups ??= []; if (id) { const group = groups.find((g) => g.id === id && g.datasetId === datasetId); if (!group) throw new Error("Group not found"); Object.assign(group, { name, prompts }); } else { if (groups.length >= 100) throw new Error("Group limit reached"); groups.push({ id: randomUUID(), datasetId, name, prompts }); } });
  } },
  { path: "/competition/report", needsUrl: false, handler: async (ctx) => {
    const datasetId = clean(ctx.body.datasetId, 100), source = clean(ctx.body.source, 100), brand = clean(ctx.body.brand, 100);
    const dataset = getDataset<Parameters<typeof import("./ai-visibility.js").summarize>[0]>(tenant(ctx), datasetId); if (!dataset) throw new Error("Dataset not found");
    const state = readCompetitionState(tenant(ctx), initial()), groupId = clean(ctx.body.groupId, 100), from = clean(ctx.body.from, 10), to = clean(ctx.body.to, 10);
    const group = groupId ? (state.groups ?? []).find((g) => g.id === groupId && g.datasetId === datasetId) : undefined;
    if (groupId && !group) throw new Error("Group not found");
    for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error("Invalid date");
    if (from && to && from > to) throw new Error("Invalid date range");
    const filtered = { ...dataset, observations: dataset.observations.filter((r) => (!group || group.prompts.includes(r.prompt)) && (!from || r.observedAt.slice(0, 10) >= from) && (!to || r.observedAt.slice(0, 10) <= to)) };
    const { summarize } = await import("./ai-visibility.js"); const report = summarize(filtered, source, brand);
    return { generatedAt: new Date().toISOString(), filters: { source, groupId, from, to }, methodology: "Visibility is responses mentioning a brand divided by valid responses. Unreviewed detections are provisional.", ...report, groups: (state.groups ?? []).filter((g) => g.datasetId === datasetId), actions: state.actions.filter((a) => a.datasetId === datasetId && (!group || group.prompts.includes(a.prompt))), priorities: (state.priorities ?? []).filter((p) => p.datasetId === datasetId && (!group || group.prompts.includes(p.prompt))) };
  } },
  { path: "/competition/alert-config", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    if (ctx.body.disabled === true) return updateCompetitionState(tenant(ctx), initial(), (s) => { delete s.alert; });
    const datasetId = clean(ctx.body.datasetId, 100), brand = clean(ctx.body.brand, 100), windowDays = Number(ctx.body.windowDays), minPerWindow = Number(ctx.body.minPerWindow), threshold = Number(ctx.body.threshold);
    const dataset = getDataset<{ id: string; createdAt: string; brands: Array<{ name: string }>; observations: unknown[] }>(tenant(ctx), datasetId);
    if (!dataset || !dataset.brands.some((b) => b.name === brand) || !Number.isInteger(windowDays) || windowDays < 1 || windowDays > 30 || !Number.isInteger(minPerWindow) || minPerWindow < 5 || minPerWindow > 100 || !Number.isFinite(threshold) || threshold < 1 || threshold > 100) throw new Error("Invalid alert configuration");
    return updateCompetitionState(tenant(ctx), initial(), (s) => { s.alert = { datasetId, brand, windowDays, minPerWindow, threshold }; });
  } },
  { path: "/competition/alert", needsUrl: false, handler: async (ctx) => {
    type Observation = { id: string; prompt: string; source: string; observedAt: string; mentions: Array<{ brand: string; status?: string }> };
    type Data = { id: string; createdAt: string; brands: Array<{ name: string; aliases: string[] }>; observations: Observation[] };
    const id = tenant(ctx), state = readCompetitionState(id, initial()), config = state.alert;
    if (!config) return { state: "not-configured" };
    const selected = getDataset<Data>(id, config.datasetId); if (!selected) return { state: "not-configured" };
    const signature = (d: Data) => JSON.stringify(d.brands.map((b) => [b.name, [...b.aliases].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    const compatible = listDatasets<Data>(id).filter((d) => d.id !== selected.id && signature(d) === signature(selected));
    const unique = new Map<string, Observation>(); for (const r of [ ...selected.observations, ...compatible.flatMap((d) => d.observations) ]) if (!unique.has(r.id)) unique.set(r.id, r);
    return { ...visibilityAlert([...unique.values()], config), config, datasets: compatible.length + 1 };
  } },
  { path: "/competition/priority", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const datasetId = clean(ctx.body.datasetId, 100), prompt = clean(ctx.body.prompt, 2000), page = clean(ctx.body.page, 2048), importance = ctx.body.importance, effort = ctx.body.effort;
    const dataset = getDataset<{ id: string; createdAt: string; brands: unknown[]; observations: Array<{ prompt: string }> }>(tenant(ctx), datasetId);
    if (!dataset || !dataset.observations.some((r) => r.prompt === prompt) || ![1, 2, 3].includes(Number(importance)) || ![1, 2, 3].includes(Number(effort))) throw new Error("Invalid priority");
    if (page) { let parsed: URL; try { parsed = new URL(page); } catch { throw new Error("Invalid page"); } if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !ctx.tenancy?.tenant || !tenantOwnsUrl(ctx.tenancy.tenant, page)) throw new Error("Page outside tenant domain"); }
    return updateCompetitionState(tenant(ctx), initial(), (s) => { const priorities = s.priorities ??= []; const existing = priorities.find((p) => p.datasetId === datasetId && p.prompt === prompt); const value = { datasetId, prompt, page, importance: Number(importance), effort: Number(effort) }; if (existing) Object.assign(existing, value); else { if (priorities.length >= 10000) throw new Error("Priority limit reached"); priorities.push(value); } });
  } },
  { path: "/competition/action", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const id = clean(ctx.body.id, 100), title = clean(ctx.body.title, 300), owner = clean(ctx.body.owner, 100), datasetId = clean(ctx.body.datasetId, 100), prompt = clean(ctx.body.prompt, 2000), page = clean(ctx.body.page, 2048), status = ctx.body.status;
    if (!title || !datasetId || !["todo", "doing", "done"].includes(String(status))) throw new Error("Invalid action");
    if (page) { let parsed: URL; try { parsed = new URL(page); } catch { throw new Error("Invalid page"); } if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !ctx.tenancy?.tenant || !tenantOwnsUrl(ctx.tenancy.tenant, page)) throw new Error("Page outside tenant domain"); }
    if (!getDataset(tenant(ctx), datasetId)) throw new Error("Dataset not found");
    return updateCompetitionState(tenant(ctx), initial(), (s) => {
      if (id) { const action = s.actions.find((a) => a.id === id); if (!action) throw new Error("Action not found"); if (status === "done" && action.status !== "done") action.completedAt = new Date().toISOString();
        if (status !== "done") delete action.completedAt;
        Object.assign(action, { title, owner, status, datasetId, prompt, page }); }
      else { if (s.actions.length >= 500) throw new Error("Action limit reached"); s.actions.push({ id: randomUUID(), title, owner, status: status as Action["status"], datasetId, prompt, page, createdAt: new Date().toISOString(), ...(status === "done" ? { completedAt: new Date().toISOString() } : {}) }); }
    });
  } },
];
