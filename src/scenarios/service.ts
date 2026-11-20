/** Versioned planning only. No schedulers, providers or connector writes live here. */
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { scenarioDb, assertTenant, assertActor, assertScenarioCapacity } from './store.js';
import { ScenarioError, parseDraft, draftOf, addDays, daysBetween, earliestStart, identifier, dateSchema, type Draft, type Plan, type PlanNode, type Evidence } from './model.js';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
function id(value: string): void { if (!identifier.safeParse(value).success) throw new ScenarioError(400, 'SCENARIO_ID'); }
function version(value: number): void { if (!Number.isSafeInteger(value) || value < 1) throw new ScenarioError(400, 'SCENARIO_VERSION'); }
function scope(tenant: string, planId?: string, actor?: string): void { assertTenant(tenant); if (planId) id(planId); if (actor !== undefined) assertActor(actor); }
function current(tenant: string, planId: string): Plan {
  const row = scenarioDb().prepare('SELECT payload FROM scenario_plans WHERE tenant=? AND id=?').get(tenant, planId) as { payload: string } | undefined;
  if (!row) throw new ScenarioError(404, 'SCENARIO_NOT_FOUND');
  return JSON.parse(row.payload) as Plan;
}
function revision(plan: Plan, actor: string, action: string): void {
  const count = scenarioDb().prepare('SELECT COUNT(*) AS n FROM scenario_revisions WHERE tenant=? AND plan_id=?').get(plan.tenantId, plan.id) as { n: number };
  if (count.n >= 5000) throw new ScenarioError(413, 'SCENARIO_CAPACITY', 'This plan reached its revision limit. Duplicate it to continue.');
  scenarioDb().prepare('INSERT INTO scenario_revisions VALUES (?,?,?,?,?,?,?)').run(plan.tenantId, plan.id, plan.version, actor, action, plan.updatedAt, JSON.stringify(plan));
  assertScenarioCapacity(plan.tenantId);
}
function assertEvidenceUnchanged(before: Draft, after: Draft): void {
  const afterEvidence = new Map(after.evidence.map(item => [item.id, item]));
  for (const evidence of before.evidence) if (!same(evidence, afterEvidence.get(evidence.id))) throw new ScenarioError(409, 'SCENARIO_EVIDENCE_CHANGED', 'Evidence snapshots are immutable. Add a new observation instead.');
}
function save(tenant: string, actor: string, before: Plan, next: Draft, action: string): Plan {
  assertEvidenceUnchanged(before, next);
  const plan: Plan = { ...next, id: before.id, tenantId: tenant, version: before.version + 1, createdBy: before.createdBy, createdAt: before.createdAt, updatedAt: new Date().toISOString() };
  const changed = scenarioDb().prepare('UPDATE scenario_plans SET version=?,payload=?,updated_at=? WHERE tenant=? AND id=? AND version=?').run(plan.version, JSON.stringify(plan), plan.updatedAt, tenant, plan.id, before.version);
  if (changed.changes !== 1) throw new ScenarioError(409, 'SCENARIO_CHANGED', 'The plan changed. Reload it before applying your edits.');
  revision(plan, actor, action); return plan;
}
export function createPlan(tenant: string, actor: string, raw: unknown): Plan {
  scope(tenant, undefined, actor); const draft = parseDraft(raw);
  const at = new Date().toISOString(), plan: Plan = { ...draft, status: 'draft', id: randomUUID(), tenantId: tenant, version: 1, createdBy: actor, createdAt: at, updatedAt: at };
  return scenarioDb().transaction(() => {
    const count = scenarioDb().prepare('SELECT COUNT(*) AS n FROM scenario_plans WHERE tenant=?').get(tenant) as { n: number };
    if (count.n >= 500) throw new ScenarioError(413, 'SCENARIO_CAPACITY', 'This workspace reached its 500-plan limit.');
    scenarioDb().prepare('INSERT INTO scenario_plans VALUES (?,?,?,?,?)').run(tenant, plan.id, plan.version, JSON.stringify(plan), at);
    revision(plan, actor, 'created'); return plan;
  }).immediate();
}
export function listPlans(tenant: string): Plan[] {
  scope(tenant);
  return (scenarioDb().prepare('SELECT payload FROM scenario_plans WHERE tenant=? ORDER BY updated_at DESC,id LIMIT 500').all(tenant) as Array<{ payload: string }>).map(row => JSON.parse(row.payload));
}
export type EvidenceScope = Pick<Evidence, 'id' | 'source' | 'sourceId' | 'url' | 'sourceProvider' | 'sourceScope' | 'sourceGa4' | 'sourcePages'>;
export type PlanSummary = Omit<Plan, 'nodes' | 'edges' | 'evidence' | 'layout'> & {
  summary: { count: number; done: number; assigned: number; hours: number; budget: number };
  scope: { evidence: EvidenceScope[]; linkedResources: Array<NonNullable<PlanNode['linkedResource']>> };
};
/** Project only bounded metadata and scope references; never materialize graphs for a list. */
export function listPlanSummaries(tenant: string, options: { limit?: number; offset?: number } = {}): { plans: PlanSummary[]; nextOffset: number | null } {
  scope(tenant);
  const limit = options.limit ?? 30, offset = options.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 500) throw new ScenarioError(400, 'SCENARIO_PAGINATION');
  type Row = { metadata: string; evidence: string; references: string; count: number; done: number; assigned: number; hours: number; budget: number };
  const rows = scenarioDb().prepare(`SELECT
    json_object('id',id,'tenantId',tenant,'version',version,'updatedAt',updated_at,
      'name',json_extract(payload,'$.name'),'objective',json_extract(payload,'$.objective'),
      'language',json_extract(payload,'$.language'),'timezone',json_extract(payload,'$.timezone'),
      'startDate',json_extract(payload,'$.startDate'),'endDate',json_extract(payload,'$.endDate'),
      'budgetCents',json_extract(payload,'$.budgetCents'),'currency',json_extract(payload,'$.currency'),
      'status',json_extract(payload,'$.status'),'channels',json_extract(payload,'$.channels'),
      'createdBy',json_extract(payload,'$.createdBy'),'createdAt',json_extract(payload,'$.createdAt')) AS metadata,
    (SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'source',json_extract(value,'$.source'),
      'sourceId',json_extract(value,'$.sourceId'),'url',json_extract(value,'$.url'),
      'sourceProvider',json_extract(value,'$.sourceProvider'),'sourceScope',json_extract(value,'$.sourceScope'),
      'sourceGa4',json_extract(value,'$.sourceGa4'),'sourcePages',json_extract(value,'$.sourcePages')))
      FROM json_each(payload,'$.evidence')) AS evidence,
    (SELECT json_group_array(json_extract(value,'$.linkedResource')) FROM json_each(payload,'$.nodes') WHERE json_extract(value,'$.linkedResource') IS NOT NULL) AS "references",
    json_array_length(payload,'$.nodes') AS count,
    (SELECT COUNT(*) FROM json_each(payload,'$.nodes') WHERE json_extract(value,'$.status')='done') AS done,
    (SELECT COUNT(*) FROM json_each(payload,'$.nodes') WHERE length(trim(COALESCE(json_extract(value,'$.owner'),'')))>0 OR length(COALESCE(json_extract(value,'$.assigneeId'),''))>0) AS assigned,
    (SELECT COALESCE(SUM(json_extract(value,'$.effortHours')),0) FROM json_each(payload,'$.nodes')) AS hours,
    (SELECT COALESCE(SUM(json_extract(value,'$.budgetCents')),0) FROM json_each(payload,'$.nodes')) AS budget
    FROM scenario_plans WHERE tenant=? ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`).all(tenant, limit + 1, offset) as Row[];
  const plans: PlanSummary[] = rows.slice(0, limit).map(row => ({
    ...JSON.parse(row.metadata), summary: { count: row.count, done: row.done, assigned: row.assigned, hours: row.hours, budget: row.budget },
    scope: { evidence: (JSON.parse(row.evidence) as Array<Record<string, unknown>>).map(e => Object.fromEntries(Object.entries(e).filter(([, value]) => value !== null))) as EvidenceScope[], linkedResources: JSON.parse(row.references) },
  }));
  return { plans, nextOffset: rows.length > limit ? offset + limit : null };
}
export function getPlan(tenant: string, planId: string): Plan { scope(tenant, planId); return current(tenant, planId); }
export function updatePlan(tenant: string, actor: string, planId: string, expectedVersion: number, raw: unknown): Plan {
  scope(tenant, planId, actor); version(expectedVersion); const draft = parseDraft(raw);
  return scenarioDb().transaction(() => {
    const before = current(tenant, planId);
    if (before.version !== expectedVersion) throw new ScenarioError(409, 'SCENARIO_CHANGED', 'The plan changed. Reload it before saving.');
    return save(tenant, actor, before, draft, 'edited');
  }).immediate();
}
export function archivePlan(tenant: string, actor: string, planId: string, expectedVersion: number): Plan {
  const plan = getPlan(tenant, planId); return updatePlan(tenant, actor, planId, expectedVersion, { ...draftOf(plan), status: 'archived' });
}
export function clonePlan(tenant: string, actor: string, planId: string, name?: string): Plan {
  const source = getPlan(tenant, planId), draft = structuredClone(draftOf(source));
  draft.name = name?.trim() || `${source.name.slice(0, 190)} — copy`; draft.status = 'draft';
  // Copies are plans, not a second execution of a linked module operation.
  draft.nodes = draft.nodes.map(node => ({ ...node, status: 'todo', locked: false, linkedResource: undefined, checklist: node.checklist.map(item => ({ ...item, done: false })), ...(node.kpi ? { kpi: { ...node.kpi, actual: null, observedAt: undefined } } : {}) }));
  return createPlan(tenant, actor, draft);
}
export interface RevisionSummary { version: number; actor: string; action: string; at: string; }
export function listRevisions(tenant: string, planId: string): RevisionSummary[] {
  getPlan(tenant, planId);
  return scenarioDb().prepare('SELECT version,actor,action,at FROM scenario_revisions WHERE tenant=? AND plan_id=? ORDER BY version DESC LIMIT 100').all(tenant, planId) as RevisionSummary[];
}
export function getRevision(tenant: string, planId: string, requestedVersion: number): Plan {
  getPlan(tenant, planId); version(requestedVersion);
  const row = scenarioDb().prepare('SELECT payload FROM scenario_revisions WHERE tenant=? AND plan_id=? AND version=?').get(tenant, planId, requestedVersion) as { payload: string } | undefined;
  if (!row) throw new ScenarioError(404, 'SCENARIO_REVISION_NOT_FOUND'); return JSON.parse(row.payload) as Plan;
}
const commentSchema = z.object({ body: z.string().trim().min(1).max(4000), nodeId: identifier.optional() }).strict();
export interface ScenarioComment { id: string; planId: string; body: string; nodeId?: string; actor: string; createdAt: string; }
export function addComment(tenant: string, actor: string, planId: string, raw: unknown): ScenarioComment {
  scope(tenant, planId, actor); const input = commentSchema.parse(raw);
  return scenarioDb().transaction(() => {
    const plan = current(tenant, planId);
    if (input.nodeId && !plan.nodes.some(node => node.id === input.nodeId)) throw new ScenarioError(400, 'SCENARIO_NODE_NOT_FOUND');
    const count = scenarioDb().prepare('SELECT COUNT(*) AS n FROM scenario_comments WHERE tenant=? AND plan_id=?').get(tenant, planId) as { n: number };
    if (count.n >= 2000) throw new ScenarioError(413, 'SCENARIO_CAPACITY', 'This plan reached its comment limit.');
    const comment: ScenarioComment = { ...input, id: randomUUID(), planId, actor, createdAt: new Date().toISOString() };
    scenarioDb().prepare('INSERT INTO scenario_comments VALUES (?,?,?,?,?)').run(tenant, planId, comment.id, JSON.stringify(comment), comment.createdAt); assertScenarioCapacity(tenant); return comment;
  }).immediate();
}
export function listComments(tenant: string, planId: string): ScenarioComment[] {
  getPlan(tenant, planId);
  return (scenarioDb().prepare('SELECT payload FROM scenario_comments WHERE tenant=? AND plan_id=? ORDER BY created_at DESC,id DESC LIMIT 200').all(tenant, planId) as Array<{ payload: string }>).map(row => JSON.parse(row.payload)).reverse();
}
export interface PlanDiff {
  added: PlanNode[]; removed: PlanNode[]; changed: Array<{ id: string; before: PlanNode; after: PlanNode; fields: string[] }>;
  budgetDeltaCents: number; startDateChanged: boolean; endDateChanged: boolean; edgesChanged: boolean;
}
export function diffPlans(before: Draft, after: Draft): PlanDiff {
  const old = new Map(before.nodes.map(n => [n.id, n])), next = new Map(after.nodes.map(n => [n.id, n]));
  return {
    added: after.nodes.filter(n => !old.has(n.id)), removed: before.nodes.filter(n => !next.has(n.id)),
    changed: after.nodes.flatMap(node => {
      const previous = old.get(node.id); if (!previous || same(previous, node)) return [];
      const fields = [...new Set([...Object.keys(previous), ...Object.keys(node)])].filter(key => !same(previous[key as keyof PlanNode], node[key as keyof PlanNode]));
      return [{ id: node.id, before: previous, after: node, fields }];
    }),
    budgetDeltaCents: after.nodes.reduce((sum, n) => sum + n.budgetCents, 0) - before.nodes.reduce((sum, n) => sum + n.budgetCents, 0),
    startDateChanged: before.startDate !== after.startDate, endDateChanged: before.endDate !== after.endDate, edgesChanged: !same(before.edges, after.edges),
  };
}
const proposalMeta = z.object({
  kind: z.enum(['ai', 'template', 'reschedule', 'revision']).default('ai'),
  provider: z.string().max(100).optional(), summary: z.string().max(4000).default(''), nodeIds: z.array(identifier).max(300).optional(),
}).strict();
export type ProposalMetadata = z.input<typeof proposalMeta>;
export interface ScenarioProposal {
  id: string; planId: string; baseVersion: number; actor: string; createdAt: string; expiresAt: string;
  draft: Draft; diff: PlanDiff; kind: 'ai' | 'template' | 'reschedule' | 'revision'; provider?: string; summary: string; nodeIds?: string[];
}
function assertProposal(before: Draft, draft: Draft, metadata: z.infer<typeof proposalMeta>): void {
  assertEvidenceUnchanged(before, draft);
  const next = new Map(draft.nodes.map(node => [node.id, node]));
  const selected = metadata.nodeIds ? new Set(metadata.nodeIds) : null;
  if (selected && (selected.size !== metadata.nodeIds!.length || [...selected].some(id => !before.nodes.some(n => n.id === id)))) throw new ScenarioError(400, 'SCENARIO_NODE_NOT_FOUND');
  for (const node of before.nodes) {
    const changed = next.get(node.id);
    if ((node.locked || (selected && !selected.has(node.id))) && !same(node, changed)) throw new ScenarioError(409, 'SCENARIO_LOCKED', 'A proposal cannot change a locked action or an action outside the selected branch.');
    if (node.linkedResource && !same(node.linkedResource, changed?.linkedResource)) throw new ScenarioError(409, 'SCENARIO_LINKED_RESOURCE', 'Linked module references cannot be changed by a proposal.');
    if (node.kpi?.actual !== undefined && node.kpi.actual !== null && !same({ actual: node.kpi.actual, source: node.kpi.source, observedAt: node.kpi.observedAt }, { actual: changed?.kpi?.actual, source: changed?.kpi?.source, observedAt: changed?.kpi?.observedAt })) throw new ScenarioError(409, 'SCENARIO_OBSERVATION', 'A proposal cannot rewrite an observed KPI.');
  }
  if (selected) for (const edge of before.edges) if (!selected.has(edge.source) && !selected.has(edge.target) && !draft.edges.some(after => same(after, edge))) throw new ScenarioError(409, 'SCENARIO_BRANCH', 'A proposal cannot remove dependencies outside the selected branch.');
  if (draft.status !== before.status) throw new ScenarioError(400, 'SCENARIO_STATUS', 'A proposal cannot change campaign status.');
  if (draft.budgetCents > 0 && draft.nodes.reduce((sum, node) => sum + node.budgetCents, 0) > draft.budgetCents) throw new ScenarioError(400, 'SCENARIO_BUDGET', 'The proposal exceeds the campaign budget.');
  if (metadata.kind === 'ai' || metadata.kind === 'template') {
    for (const node of draft.nodes) {
      const old = before.nodes.find(item => item.id === node.id);
      if (old && (!same(old.linkedResource, node.linkedResource) || old.status !== node.status || (old.kpi?.actual ?? null) !== (node.kpi?.actual ?? null) || (old.kpi?.baseline ?? null) !== (node.kpi?.baseline ?? null))) throw new ScenarioError(400, 'SCENARIO_FABRICATED_OUTCOME', 'Generated revisions cannot claim linked executions, change completion status or fabricate measurements.');
    }
    for (const node of draft.nodes) if (!before.nodes.some(old => old.id === node.id) && (node.linkedResource || node.kpi?.actual !== undefined && node.kpi.actual !== null || node.kpi?.baseline !== undefined && node.kpi.baseline !== null || node.status !== 'todo')) throw new ScenarioError(400, 'SCENARIO_FABRICATED_OUTCOME', 'Generated actions cannot claim linked executions, completed work or measured outcomes.');
    if (draft.evidence.length !== before.evidence.length) throw new ScenarioError(400, 'SCENARIO_EVIDENCE_CHANGED', 'Generation may reference existing evidence but cannot invent observations.');
  }
}
export function createProposal(tenant: string, actor: string, planId: string, expectedVersion: number, raw: unknown, meta: ProposalMetadata = {}): ScenarioProposal {
  scope(tenant, planId, actor); version(expectedVersion); const draft = parseDraft(raw), metadata = proposalMeta.parse(meta);
  return scenarioDb().transaction(() => {
    const before = current(tenant, planId);
    if (before.version !== expectedVersion) throw new ScenarioError(409, 'SCENARIO_CHANGED', 'The plan changed during generation. Please generate a fresh preview.');
    assertProposal(before, draft, metadata);
    const at = new Date().toISOString();
    scenarioDb().prepare('DELETE FROM scenario_proposals WHERE tenant=? AND expires_at<? AND accepted_version IS NULL').run(tenant, at);
    const count = scenarioDb().prepare('SELECT COUNT(*) AS n FROM scenario_proposals WHERE tenant=? AND plan_id=? AND accepted_version IS NULL').get(tenant, planId) as { n: number };
    if (count.n >= 50) throw new ScenarioError(429, 'SCENARIO_CAPACITY', 'This campaign has too many pending previews.');
    const proposal: ScenarioProposal = { ...metadata, id: randomUUID(), planId, baseVersion: expectedVersion, actor, createdAt: at, expiresAt: new Date(Date.now() + 86400000).toISOString(), draft, diff: diffPlans(before, draft) };
    scenarioDb().prepare('INSERT INTO scenario_proposals VALUES (?,?,?,?,?,?,?,NULL)').run(tenant, planId, proposal.id, expectedVersion, JSON.stringify(proposal), digest(proposal), proposal.expiresAt);
    assertScenarioCapacity(tenant);
    return proposal;
  }).immediate();
}
export function getProposal(tenant: string, planId: string, proposalId: string): ScenarioProposal {
  getPlan(tenant, planId); id(proposalId);
  const row = scenarioDb().prepare('SELECT payload,digest,expires_at FROM scenario_proposals WHERE tenant=? AND plan_id=? AND id=?').get(tenant, planId, proposalId) as { payload: string; digest: string; expires_at: string } | undefined;
  if (!row) throw new ScenarioError(404, 'SCENARIO_PREVIEW_NOT_FOUND');
  if (row.expires_at <= new Date().toISOString()) throw new ScenarioError(409, 'SCENARIO_PREVIEW_EXPIRED');
  const proposal = JSON.parse(row.payload) as ScenarioProposal;
  if (digest(proposal) !== row.digest) throw new ScenarioError(409, 'SCENARIO_PREVIEW_CHANGED'); return proposal;
}
export function acceptProposal(tenant: string, actor: string, planId: string, proposalId: string, expectedVersion: number): Plan {
  scope(tenant, planId, actor); version(expectedVersion); id(proposalId);
  return scenarioDb().transaction(() => {
    const before = current(tenant, planId), proposal = getProposal(tenant, planId, proposalId);
    if (before.version !== expectedVersion || proposal.baseVersion !== expectedVersion) throw new ScenarioError(409, 'SCENARIO_CHANGED', 'This preview is based on an older plan. Generate a new preview.');
    const row = scenarioDb().prepare('SELECT accepted_version FROM scenario_proposals WHERE tenant=? AND plan_id=? AND id=?').get(tenant, planId, proposalId) as { accepted_version: number | null };
    if (row.accepted_version !== null) throw new ScenarioError(409, 'SCENARIO_PREVIEW_ACCEPTED');
    const draft = parseDraft(proposal.draft);
    assertProposal(before, draft, proposalMeta.parse({ kind: proposal.kind, provider: proposal.provider, summary: proposal.summary, nodeIds: proposal.nodeIds }));
    const plan = save(tenant, actor, before, draft, `accepted-${proposal.kind}`);
    scenarioDb().prepare('UPDATE scenario_proposals SET accepted_version=? WHERE tenant=? AND id=? AND accepted_version IS NULL').run(plan.version, tenant, proposalId);
    return plan;
  }).immediate();
}
/** UTC date-only arithmetic keeps day durations stable across DST changes. */
export function previewReschedule(input: Draft, nodeId: string, startDate: string): Draft {
  const draft = parseDraft(draftOf(input)); id(nodeId); dateSchema.parse(startDate);
  const nodes = new Map(draft.nodes.map(node => [node.id, node])), node = nodes.get(nodeId);
  if (!node) throw new ScenarioError(404, 'SCENARIO_NODE_NOT_FOUND');
  if (node.locked) throw new ScenarioError(409, 'SCENARIO_LOCKED', 'Unlock the action before rescheduling it.');
  const duration = daysBetween(node.startDate, node.endDate); node.startDate = startDate; node.endDate = addDays(startDate, duration);
  const dependencies = draft.edges.filter(edge => edge.type !== 'measurement_feedback');
  const pending = new Map(draft.nodes.map(n => [n.id, 0]));
  for (const edge of dependencies) pending.set(edge.target, pending.get(edge.target)! + 1);
  const queue = [...pending].filter(([, count]) => !count).map(([id]) => id), affected = new Set([nodeId]);
  while (queue.length) {
    const currentId = queue.shift()!;
    for (const edge of dependencies.filter(e => e.source === currentId)) {
      const target = nodes.get(edge.target)!;
      if (affected.has(currentId)) {
        affected.add(target.id);
        const earliest = earliestStart(edge, nodes.get(currentId)!);
        if (target.startDate < earliest) {
          if (target.locked) throw new ScenarioError(409, 'SCENARIO_LOCKED', `The shift conflicts with locked action ${target.title}.`);
          const length = daysBetween(target.startDate, target.endDate); target.startDate = earliest; target.endDate = addDays(earliest, length);
        }
      }
      const left = pending.get(target.id)! - 1; pending.set(target.id, left); if (!left) queue.push(target.id);
    }
  }
  draft.startDate = draft.nodes.reduce((date, n) => n.startDate < date ? n.startDate : date, draft.startDate);
  draft.endDate = draft.nodes.reduce((date, n) => n.endDate > date ? n.endDate : date, draft.endDate);
  return parseDraft(draft);
}

export function exportPlan(plan: Plan, format: 'json' | 'csv' | 'markdown' = 'json'): { content: string; mimeType: string; filename: string } {
  const filename = `campaign-${plan.id}-v${plan.version}`;
  if (format === 'json') return { content: JSON.stringify(plan, null, 2), mimeType: 'application/json', filename: `${filename}.json` };
  const safeCell = (value: unknown) => { const raw = String(value ?? ''); return /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw; };
  if (format === 'csv') {
    const rows: unknown[][] = [['id', 'title', 'channel', 'owner', 'assignee', 'start_date', 'end_date', 'status', 'effort_hours', 'budget_minor_units', 'currency', 'evidence_ids'], ...plan.nodes.map(n => [n.id, n.title, n.channel, n.owner, n.assigneeId, n.startDate, n.endDate, n.status, n.effortHours, n.budgetCents, plan.currency, n.evidenceIds.join(';')])];
    return { content: rows.map(row => row.map(value => `"${safeCell(value).replace(/"/g, '""')}"`).join(',')).join('\r\n'), mimeType: 'text/csv;charset=utf-8', filename: `${filename}.csv` };
  }
  const md = (value: string) => value.replace(/[\\`*_{}\[\]()#+!<>|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const rows = plan.nodes.map(n => `| ${md(n.title)} | ${n.channel} | ${md(n.owner || n.assigneeId || 'Unassigned')} | ${n.startDate} | ${n.endDate} | ${n.status} | ${n.effortHours} | ${(n.budgetCents / 100).toFixed(2)} ${plan.currency} |`);
  return { content: `# ${md(plan.name)}\n\n${md(plan.objective)}\n\nVersion ${plan.version} · ${plan.startDate} – ${plan.endDate} · ${md(plan.timezone)}\n\n| Action | Channel | Owner | Start | End | Status | Hours | Planned cost |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Evidence\n\n${plan.evidence.map(e => `- ${md(e.title)} — ${e.source} / ${e.kind}, ${e.observedAt}${e.url ? `, ${md(e.url)}` : ''}`).join('\n')}\n`, mimeType: 'text/markdown;charset=utf-8', filename: `${filename}.md` };
}
