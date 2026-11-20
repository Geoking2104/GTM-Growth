/** Campaign planning data. This graph is never executable connector authority. */
import { z } from 'zod';

export const channels = ['seo', 'geo', 'content', 'local', 'social', 'email', 'paid', 'analytics', 'coordination'] as const;
export const nodeTypes = ['action', 'objective', 'evidence', 'content', 'decision', 'approval', 'milestone', 'observation', 'wait', 'group'] as const;
export const edgeTypes = ['finish_to_start', 'start_to_start', 'approval_gate', 'measurement_feedback'] as const;
export const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
const text = (max: number) => z.string().max(max);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a real calendar date (YYYY-MM-DD).');
const timezoneSchema = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Use an IANA time zone.');
const webUrl = z.string().url().max(2048).refine(value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, 'Only public HTTP(S) source references are accepted.');
export const evidenceSchema = z.object({
  id: identifier, source: z.enum(['audit', 'intent', 'manual']), sourceId: text(200),
  title: text(500), detail: text(6000).default(''), url: webUrl.optional(),
  observedAt: z.string().datetime({ offset: true }), kind: z.enum(['observed', 'declared', 'hypothesis']),
  sourceProvider: z.enum(['gsc', 'bing', 'ai', 'gtm']).optional(), sourceScope: text(2048).optional(),
  sourceGa4: text(100).optional(), sourcePages: z.array(webUrl).max(5).optional(),
}).strict();
export const nodeSchema = z.object({
  id: identifier, type: z.enum(nodeTypes).default('action'), title: z.string().trim().min(1).max(240),
  description: text(6000).default(''), channel: z.enum(channels).default('coordination'),
  startDate: dateSchema, endDate: dateSchema, owner: text(160).default(''), assigneeId: text(200).optional(),
  effortHours: z.number().finite().min(0).max(10000).default(0), budgetCents: z.number().int().min(0).max(100_000_000_000).default(0),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'), locked: z.boolean().default(false),
  evidenceIds: z.array(identifier).max(100).default([]),
  checklist: z.array(z.object({ id: identifier, label: text(500), done: z.boolean().default(false) }).strict()).max(100).default([]),
  kpi: z.object({
    name: text(200), baseline: z.number().finite().nullable().default(null), target: z.number().finite().nullable().default(null),
    actual: z.number().finite().nullable().default(null), unit: text(100).default(''), source: text(1000).default(''),
    observedAt: z.string().datetime({ offset: true }).optional(),
  }).strict().optional(),
  linkedResource: z.object({ type: z.enum(['social_campaign', 'wordpress_draft', 'local_change', 'manual']), id: text(200) }).strict().optional(),
}).strict();
export const edgeSchema = z.object({
  id: identifier, source: identifier, target: identifier, type: z.enum(edgeTypes).default('finish_to_start'),
  lagDays: z.number().int().min(0).max(3650).default(0),
}).strict();
export const draftSchema = z.object({
  name: z.string().trim().min(1).max(200), objective: text(3000).default(''),
  language: z.enum(['fr', 'en']).default('fr'), timezone: timezoneSchema.default('Europe/Paris'),
  startDate: dateSchema, endDate: dateSchema,
  budgetCents: z.number().int().min(0).max(100_000_000_000).default(0), currency: z.enum(['EUR', 'USD', 'GBP', 'CHF', 'CAD']).default('EUR'),
  channels: z.array(z.enum(channels)).max(channels.length).default([]),
  status: z.enum(['draft', 'active', 'completed', 'archived']).default('draft'),
  nodes: z.array(nodeSchema).max(300).default([]), edges: z.array(edgeSchema).max(1000).default([]),
  evidence: z.array(evidenceSchema).max(500).default([]),
  layout: z.object({ positions: z.record(identifier, z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000) }).strict()).default({}) }).strict().default({ positions: {} }),
}).strict();
export type Draft = z.infer<typeof draftSchema>;
export type PlanNode = z.infer<typeof nodeSchema>;
export type PlanEdge = z.infer<typeof edgeSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Node = PlanNode;
export type Edge = PlanEdge;
export interface Plan extends Draft {
  id: string; tenantId: string; version: number; createdBy: string; createdAt: string; updatedAt: string;
}
export interface ValidationIssue { severity: 'error' | 'warning'; code: string; path: string; message: string; }
export class ScenarioError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); this.name = 'ScenarioError'; }
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function safeObject(value: unknown, depth = 0): void {
  if (depth > 15) throw new ScenarioError(400, 'SCENARIO_INVALID', 'The plan is nested too deeply.');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new ScenarioError(400, 'SCENARIO_INVALID', 'Unsupported object key.');
    safeObject(child, depth + 1);
  }
}
export function draftOf(plan: Draft | Plan): Draft {
  return { name: plan.name, objective: plan.objective, language: plan.language, timezone: plan.timezone,
    startDate: plan.startDate, endDate: plan.endDate, budgetCents: plan.budgetCents, currency: plan.currency,
    channels: plan.channels, status: plan.status, nodes: plan.nodes, edges: plan.edges, evidence: plan.evidence, layout: plan.layout };
}
export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000); }
export function earliestStart(edge: PlanEdge, source: PlanNode): string {
  return addDays(edge.type === 'start_to_start' ? source.startDate : source.endDate, edge.lagDays + (edge.type === 'start_to_start' ? 0 : 1));
}
export function validatePlan(plan: Draft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (severity: ValidationIssue['severity'], code: string, path: string, message: string) => issues.push({ severity, code, path, message });
  if (plan.endDate < plan.startDate) issue('error', 'DATE_ORDER', 'endDate', 'The campaign end must not precede its start.');
  if (daysBetween(plan.startDate, plan.endDate) > 3650) issue('error', 'HORIZON', 'endDate', 'Campaigns may span at most ten years.');
  const nodeIds = new Set<string>(), edgeIds = new Set<string>(), evidenceIds = new Set<string>();
  plan.evidence.forEach((e, i) => { if (evidenceIds.has(e.id)) issue('error', 'DUPLICATE_ID', `evidence.${i}.id`, 'Evidence IDs must be unique.'); evidenceIds.add(e.id); });
  if (new Set(plan.channels).size !== plan.channels.length) issue('error', 'DUPLICATE_CHANNEL', 'channels', 'Channels must be unique.');
  plan.nodes.forEach((node, i) => {
    const p = `nodes.${i}`;
    if (nodeIds.has(node.id)) issue('error', 'DUPLICATE_ID', `${p}.id`, 'Node IDs must be unique.'); nodeIds.add(node.id);
    if (node.endDate < node.startDate) issue('error', 'DATE_ORDER', `${p}.endDate`, 'The action end must not precede its start.');
    if (node.startDate < plan.startDate || node.endDate > plan.endDate) issue('error', 'OUTSIDE_HORIZON', p, 'Action dates must fall inside the campaign.');
    if (new Set(node.evidenceIds).size !== node.evidenceIds.length || node.evidenceIds.some(id => !evidenceIds.has(id))) issue('error', 'EVIDENCE_REFERENCE', `${p}.evidenceIds`, 'Each evidence reference must identify one stored source.');
    if (new Set(node.checklist.map(c => c.id)).size !== node.checklist.length) issue('error', 'DUPLICATE_ID', `${p}.checklist`, 'Checklist IDs must be unique.');
    if (!node.owner.trim() && !node.assigneeId && ['action', 'content'].includes(node.type)) issue('warning', 'UNASSIGNED', `${p}.owner`, 'Assign an owner or a responsible role.');
    if (plan.channels.length && node.channel !== 'coordination' && !plan.channels.includes(node.channel)) issue('warning', 'CHANNEL_NOT_SELECTED', `${p}.channel`, 'This channel is outside the selected campaign channels.');
    if (node.kpi?.actual !== null && node.kpi?.actual !== undefined && (!node.kpi.source.trim() || !node.kpi.observedAt)) issue('error', 'OBSERVATION_SOURCE', `${p}.kpi`, 'An observed KPI requires a source and an observation time.');
  });
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, string[]>(), indegree = new Map([...nodeIds].map(id => [id, 0]));
  plan.edges.forEach((edge, i) => {
    if (edgeIds.has(edge.id) || nodeIds.has(edge.id)) issue('error', 'DUPLICATE_ID', `edges.${i}.id`, 'Node and edge IDs share one namespace and must be unique.'); edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) { issue('error', 'EDGE_REFERENCE', `edges.${i}`, 'A dependency references a missing action.'); return; }
    if (edge.source === edge.target) { issue('error', 'SELF_LINK', `edges.${i}`, 'An action cannot depend on itself.'); return; }
    if (edge.type === 'measurement_feedback') return;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]); indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    if (nodes.get(edge.target)!.startDate < earliestStart(edge, nodes.get(edge.source)!)) issue('warning', 'DEPENDENCY_DATES', `edges.${i}`, 'The successor is scheduled before its dependency is ready.');
  });
  const ready = [...indegree].filter(([, count]) => !count).map(([id]) => id); let visited = 0;
  while (ready.length) { const id = ready.shift()!; visited++; for (const target of outgoing.get(id) ?? []) { const count = indegree.get(target)! - 1; indegree.set(target, count); if (!count) ready.push(target); } }
  if (visited < nodeIds.size) issue('error', 'DEPENDENCY_CYCLE', 'edges', 'Scheduling dependencies must not contain a cycle; use a measurement feedback link for observations.');
  for (const id of Object.keys(plan.layout.positions)) if (!nodeIds.has(id)) issue('error', 'LAYOUT_REFERENCE', `layout.positions.${id}`, 'A visual position references a missing node.');
  if (plan.budgetCents > 0 && plan.nodes.reduce((sum, node) => sum + node.budgetCents, 0) > plan.budgetCents) issue('warning', 'BUDGET_EXCEEDED', 'budgetCents', 'The planned action costs exceed the campaign budget.');
  if (!plan.nodes.length) issue('warning', 'EMPTY_PLAN', 'nodes', 'Add an action to start planning.');
  return issues;
}
export function parseDraft(raw: unknown): Draft {
  safeObject(raw);
  if (Buffer.byteLength(JSON.stringify(raw) ?? '', 'utf8') > 2_000_000) throw new ScenarioError(413, 'SCENARIO_CAPACITY', 'The plan exceeds the 2 MB limit.');
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) throw new ScenarioError(400, 'SCENARIO_INVALID', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).slice(0, 8).join('; '));
  const errors = validatePlan(parsed.data).filter(i => i.severity === 'error');
  if (errors.length) throw new ScenarioError(400, 'SCENARIO_INVALID', errors.slice(0, 8).map(i => `${i.path}: ${i.message}`).join('; '));
  return parsed.data;
}
