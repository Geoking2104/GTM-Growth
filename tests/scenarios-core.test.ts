import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseDraft, draftOf, validatePlan, ScenarioError, type Draft, type Evidence } from '../src/scenarios/model.js';
import { closeScenarioStores, scenarioDb, storeScenarioEvidence, listScenarioEvidence } from '../src/scenarios/store.js';
import { createPlan, getPlan, listPlans, listPlanSummaries, updatePlan, clonePlan, archivePlan, listRevisions, getRevision, addComment, listComments, createProposal, getProposal, acceptProposal, previewReschedule, diffPlans, exportPlan } from '../src/scenarios/service.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'scenarios-')); vi.stubEnv('SCENARIOS_PATH', path.join(dir, 'plans.sqlite3')); });
afterEach(() => { closeScenarioStores(); rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.useRealTimers(); });
const proof = (id = 'source1'): Evidence => ({ id, source: 'audit', sourceId: 'snapshot1', title: 'Structured data missing', detail: 'The sampled page has no Organization object.', url: 'https://example.com', observedAt: '2026-11-20T12:00:00Z', kind: 'observed' });
const basic = (): Draft => parseDraft({ name: 'Better discovery', objective: 'Improve documented discoverability', startDate: '2026-12-01', endDate: '2026-12-31', channels: ['seo', 'content'], budgetCents: 10000, evidence: [proof()], nodes: [
  { id: 'audit', title: 'Review findings', startDate: '2026-12-01', endDate: '2026-12-02', channel: 'seo', owner: 'Analyst', effortHours: 2, evidenceIds: ['source1'] },
  { id: 'content', title: 'Prepare content', startDate: '2026-12-03', endDate: '2026-12-04', channel: 'content', owner: 'Editor', effortHours: 3, budgetCents: 5000 },
], edges: [{ id: 'depends', source: 'audit', target: 'content', type: 'finish_to_start' }], layout: { positions: { audit: { x: 0, y: 0 }, content: { x: 300, y: 0 } } } });
const errorCode = (fn: () => unknown, code: string, status?: number) => { try { fn(); throw new Error('Expected failure'); } catch (e) { expect(e).toBeInstanceOf(ScenarioError); expect((e as ScenarioError).code).toBe(code); if (status) expect((e as ScenarioError).status).toBe(status); } };

describe('durable campaign revisions', () => {
  it('persists across connection close, keeps tenants isolated and enforces stale version conflicts atomically', () => {
    const plan = createPlan('acme', 'author', basic());
    expect(plan.status).toBe('draft'); expect(plan.version).toBe(1);
    closeScenarioStores(); expect(getPlan('acme', plan.id)).toEqual(plan); expect(listPlans('other')).toEqual([]);
    errorCode(() => getPlan('other', plan.id), 'SCENARIO_NOT_FOUND', 404);
    const updated = updatePlan('acme', 'author', plan.id, 1, { ...draftOf(plan), name: 'Reviewed plan' });
    expect(updated.version).toBe(2); expect(updated.createdAt).toBe(plan.createdAt); expect(updated.createdBy).toBe('author');
    errorCode(() => updatePlan('acme', 'other-editor', plan.id, 1, { ...draftOf(plan), name: 'Stale replacement' }), 'SCENARIO_CHANGED', 409);
    expect(getPlan('acme', plan.id).name).toBe('Reviewed plan'); expect(listRevisions('acme', plan.id)).toHaveLength(2);
    expect(getRevision('acme', plan.id, 1).name).toBe('Better discovery');
    errorCode(() => listRevisions('other', plan.id), 'SCENARIO_NOT_FOUND');
  });
  it('retains immutable source evidence while accepting later observations and layout edits', () => {
    const plan = createPlan('acme', 'author', basic());
    const changed = draftOf(plan); changed.evidence[0].detail = 'Rewritten result';
    errorCode(() => updatePlan('acme', 'author', plan.id, 1, changed), 'SCENARIO_EVIDENCE_CHANGED');
    errorCode(() => updatePlan('acme', 'author', plan.id, 1, { ...draftOf(getPlan('acme', plan.id)), evidence: [], nodes: [] , edges: [], layout: { positions: {} } }), 'SCENARIO_EVIDENCE_CHANGED');
    const clean = draftOf(getPlan('acme', plan.id)); clean.evidence.push(proof('source2')); clean.layout.positions.audit = { x: 100, y: 200 };
    const next = updatePlan('acme', 'author', plan.id, 1, clean); expect(next.evidence).toHaveLength(2); expect(next.nodes).toEqual(getRevision('acme', plan.id, 1).nodes);
    expect(listRevisions('acme', plan.id)).toHaveLength(2);
  });
  it('retains comments with author and node references and prevents foreign-plan reads', () => {
    const plan = createPlan('acme', 'author', basic());
    const comment = addComment('acme', 'reviewer', plan.id, { nodeId: 'audit', body: ' Please verify the source. ' });
    expect(comment).toMatchObject({ actor: 'reviewer', body: 'Please verify the source.', nodeId: 'audit' });
    expect(listComments('acme', plan.id)).toEqual([comment]);
    errorCode(() => addComment('acme', 'reviewer', plan.id, { nodeId: 'absent', body: 'Comment' }), 'SCENARIO_NODE_NOT_FOUND');
    errorCode(() => listComments('other', plan.id), 'SCENARIO_NOT_FOUND');
    expect(getPlan('acme', plan.id).version).toBe(1);
  });
  it('duplicates a plan without duplicating execution references or claimed measurements', () => {
    const draft = basic(); draft.nodes[0].status = 'done'; draft.nodes[0].locked = true;
    draft.nodes[0].linkedResource = { type: 'social_campaign', id: 'real-campaign' };
    draft.nodes[0].kpi = { name: 'Clicks', actual: 3, baseline: 1, target: 5, unit: 'clicks', source: 'GA4', observedAt: '2026-12-01T12:00:00Z' };
    const plan = createPlan('acme', 'author', draft), copy = clonePlan('acme', 'new-owner', plan.id);
    expect(copy.id).not.toBe(plan.id); expect(copy.createdBy).toBe('new-owner'); expect(copy.evidence).toEqual(plan.evidence);
    expect(copy.nodes[0]).toMatchObject({ status: 'todo', locked: false, kpi: { actual: null, baseline: 1, target: 5 } }); expect(copy.nodes[0].linkedResource).toBeUndefined();
    expect(archivePlan('acme', 'author', plan.id, 1).status).toBe('archived'); expect(getPlan('acme', copy.id).status).toBe('draft');
  });
  it('validates tenant IDs and actors before creating any state', () => {
    errorCode(() => createPlan('../other', 'author', basic()), 'SCENARIO_ACCESS', 403);
    errorCode(() => createPlan('acme', '', basic()), 'SCENARIO_ACCESS', 403);
    expect(listPlans('acme')).toHaveLength(0);
  });
  it('captures immutable audit evidence with tenant-scoped retrieval', () => {
    storeScenarioEvidence('acme', [proof()]); storeScenarioEvidence('acme', [proof()]);
    expect(listScenarioEvidence('acme')).toEqual([proof()]); expect(listScenarioEvidence('other')).toEqual([]);
    errorCode(() => storeScenarioEvidence('acme', [{ ...proof(), detail: 'Rewritten' }]), 'SCENARIO_EVIDENCE_CHANGED');
    expect(listScenarioEvidence('acme')[0].detail).toBe(proof().detail);
  });
  it('lists bounded metadata and permission references without exposing graph or evidence bodies', () => {
    const first = basic(); first.nodes[0].status = 'done'; first.evidence[0].sourceProvider = 'gsc'; first.evidence[0].sourceScope = 'sc-domain:example.com';
    const a = createPlan('acme', 'author', first), b = createPlan('acme', 'author', basic()); createPlan('other', 'author', basic());
    const page = listPlanSummaries('acme', { limit: 1 }); expect(page.plans).toHaveLength(1); expect(page.nextOffset).toBe(1);
    const next = listPlanSummaries('acme', { limit: 1, offset: page.nextOffset! }); expect(next.nextOffset).toBeNull();
    expect(new Set([...page.plans, ...next.plans].map(p => p.id))).toEqual(new Set([a.id, b.id]));
    const summary = [...page.plans, ...next.plans].find(p => p.id === a.id)!;
    expect(summary.summary).toEqual({ count: 2, done: 1, assigned: 2, hours: 5, budget: 5000 });
    expect(summary.scope.evidence[0]).toMatchObject({ sourceProvider: 'gsc', sourceScope: 'sc-domain:example.com', url: 'https://example.com' });
    expect(summary).not.toHaveProperty('nodes'); expect(summary.scope.evidence[0]).not.toHaveProperty('detail'); expect(summary.scope.evidence[0]).not.toHaveProperty('title');
    errorCode(() => listPlanSummaries('acme', { limit: 500 }), 'SCENARIO_PAGINATION');
  });
});

describe('validated planning semantics', () => {
  it('rejects impossible dates, invalid zones, reversed dates and actions outside the horizon', () => {
    for (const change of [{ startDate: '2026-02-30' }, { timezone: 'Mars/Paris' }, { endDate: '2026-11-01' }]) errorCode(() => parseDraft({ ...basic(), ...change }), 'SCENARIO_INVALID', 400);
    const draft = basic(); draft.nodes[0].endDate = '2027-01-02'; errorCode(() => parseDraft(draft), 'SCENARIO_INVALID');
    errorCode(() => parseDraft(undefined), 'SCENARIO_INVALID');
  });
  it('requires unique IDs, existing references and an acyclic scheduling graph', () => {
    const draft = basic(); draft.nodes.push({ ...draft.nodes[0] }); errorCode(() => parseDraft(draft), 'SCENARIO_INVALID');
    const dangling = basic(); dangling.edges[0].source = 'missing'; errorCode(() => parseDraft(dangling), 'SCENARIO_INVALID');
    const collision = basic(); collision.edges[0].id = collision.nodes[0].id; errorCode(() => parseDraft(collision), 'SCENARIO_INVALID');
    const cycle = basic(); cycle.edges.push({ id: 'return', source: 'content', target: 'audit', type: 'start_to_start', lagDays: 0 }); errorCode(() => parseDraft(cycle), 'SCENARIO_INVALID');
    cycle.edges[1].type = 'measurement_feedback'; expect(parseDraft(cycle).edges).toHaveLength(2);
    const missing = basic(); missing.nodes[0].evidenceIds.push('invented'); errorCode(() => parseDraft(missing), 'SCENARIO_INVALID');
  });
  it('bounds graphs and excludes prototype keys and executable arbitrary node fields', () => {
    const draft = basic(); draft.nodes = Array.from({ length: 301 }, (_, i) => ({ ...draft.nodes[0], id: `n${i}` }));
    errorCode(() => parseDraft(draft), 'SCENARIO_INVALID');
    const dangerous = JSON.parse(JSON.stringify(basic())); dangerous.nodes[0].webhook = 'https://external.invalid'; errorCode(() => parseDraft(dangerous), 'SCENARIO_INVALID');
    const proto = JSON.parse('{"__proto__":{"polluted":true}}'); errorCode(() => parseDraft(proto), 'SCENARIO_INVALID');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('keeps editable budget and dependency warnings visible and requires sources for observed KPI values', () => {
    const draft = basic(); draft.budgetCents = 1; draft.nodes[1].startDate = '2026-12-01'; draft.nodes[1].owner = '';
    const issues = validatePlan(parseDraft(draft)); expect(issues.map(i => i.code)).toEqual(expect.arrayContaining(['BUDGET_EXCEEDED', 'DEPENDENCY_DATES', 'UNASSIGNED']));
    draft.nodes[0].kpi = { name: 'Leads', baseline: null, target: 10, actual: null, unit: 'leads', source: '' }; expect(parseDraft(draft).nodes[0].kpi?.actual).toBeNull();
    draft.nodes[0].kpi.actual = 0; errorCode(() => parseDraft(draft), 'SCENARIO_INVALID');
    draft.nodes[0].kpi.source = 'CRM imported record'; draft.nodes[0].kpi.observedAt = '2026-11-20T12:00:00Z'; expect(parseDraft(draft).nodes[0].kpi?.actual).toBe(0);
  });
});

describe('reviewable proposals', () => {
  it('keeps generation separate from saving and accepts the exact persisted preview once', () => {
    const plan = createPlan('acme', 'author', basic()), next = draftOf(plan); next.nodes[1].title = 'Reviewed content brief';
    const proposal = createProposal('acme', 'author', plan.id, 1, next, { kind: 'ai', provider: 'openai', summary: 'Clarify deliverable.' });
    expect(proposal.diff.changed[0]).toMatchObject({ id: 'content', fields: ['title'] });
    expect(getPlan('acme', plan.id).nodes[1].title).toBe('Prepare content'); expect(listRevisions('acme', plan.id)).toHaveLength(1);
    const accepted = acceptProposal('acme', 'author', plan.id, proposal.id, 1); expect(accepted.version).toBe(2); expect(accepted.nodes[1].title).toBe('Reviewed content brief');
    errorCode(() => acceptProposal('acme', 'author', plan.id, proposal.id, 1), 'SCENARIO_CHANGED');
    expect(listRevisions('acme', plan.id)[0].action).toBe('accepted-ai');
  });
  it('roundtrips optional undefined metadata through persisted JSON without changing its digest', () => {
    const plan = createPlan('acme', 'author', basic());
    const proposal = createProposal('acme', 'author', plan.id, 1, draftOf(plan), { kind: 'template', provider: undefined, summary: 'Local template', nodeIds: undefined });
    expect(getProposal('acme', plan.id, proposal.id).summary).toBe('Local template');
    expect(acceptProposal('acme', 'author', plan.id, proposal.id, 1).version).toBe(2);
  });
  it('rejects stale generation after a human edit without overwriting that edit', () => {
    const plan = createPlan('acme', 'author', basic()), next = structuredClone(draftOf(plan)); next.nodes[1].title = 'AI suggestion';
    const proposal = createProposal('acme', 'author', plan.id, 1, next);
    const human = draftOf(plan); human.nodes[1].description = 'Important human correction'; updatePlan('acme', 'author', plan.id, 1, human);
    errorCode(() => acceptProposal('acme', 'author', plan.id, proposal.id, 1), 'SCENARIO_CHANGED');
    errorCode(() => createProposal('acme', 'author', plan.id, 1, next), 'SCENARIO_CHANGED');
    expect(getPlan('acme', plan.id).nodes[1].description).toBe('Important human correction');
  });
  it('preserves locked actions and all actions outside a selected branch, while allowing an explicit manual unlock', () => {
    const draft = basic(); draft.nodes[0].locked = true; const plan = createPlan('acme', 'author', draft);
    const bad = structuredClone(draftOf(plan)); bad.nodes[0].title = 'Changed'; errorCode(() => createProposal('acme', 'author', plan.id, 1, bad), 'SCENARIO_LOCKED');
    const good = structuredClone(draftOf(plan)); good.nodes[1].title = 'Specific edit'; expect(createProposal('acme', 'author', plan.id, 1, good, { nodeIds: ['content'] }).diff.changed).toHaveLength(1);
    errorCode(() => createProposal('acme', 'author', plan.id, 1, good, { nodeIds: ['audit'] }), 'SCENARIO_LOCKED');
    const unlock = structuredClone(draftOf(plan)); unlock.nodes[0].locked = false; expect(updatePlan('acme', 'author', plan.id, 1, unlock).nodes[0].locked).toBe(false);
  });
  it('rejects changed proposal storage, expiry and cross-tenant access', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    const plan = createPlan('acme', 'author', basic()), proposal = createProposal('acme', 'author', plan.id, 1, draftOf(plan));
    errorCode(() => getProposal('other', plan.id, proposal.id), 'SCENARIO_NOT_FOUND');
    const altered = { ...proposal, summary: 'Modified after preview' };
    scenarioDb().prepare('UPDATE scenario_proposals SET payload=? WHERE tenant=? AND id=?').run(JSON.stringify(altered), 'acme', proposal.id);
    errorCode(() => acceptProposal('acme', 'author', plan.id, proposal.id, 1), 'SCENARIO_PREVIEW_CHANGED'); expect(getPlan('acme', plan.id).version).toBe(1);
    const fresh = createProposal('acme', 'author', plan.id, 1, draftOf(plan)); vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
    errorCode(() => acceptProposal('acme', 'author', plan.id, fresh.id, 1), 'SCENARIO_PREVIEW_EXPIRED');
  });
  it('rejects AI budget overrun, invented observations, fake completed tasks and changes to existing module references', () => {
    const plan = createPlan('acme', 'author', basic());
    const over = structuredClone(draftOf(plan)); over.nodes[1].budgetCents = 20000; errorCode(() => createProposal('acme', 'author', plan.id, 1, over), 'SCENARIO_BUDGET');
    const invented = structuredClone(draftOf(plan)); invented.evidence.push(proof('fake')); errorCode(() => createProposal('acme', 'author', plan.id, 1, invented), 'SCENARIO_EVIDENCE_CHANGED');
    const completed = structuredClone(draftOf(plan)); completed.nodes.push({ ...completed.nodes[0], id: 'new', status: 'done' }); errorCode(() => createProposal('acme', 'author', plan.id, 1, completed), 'SCENARIO_FABRICATED_OUTCOME');
    const linked = basic(); linked.nodes[0].linkedResource = { type: 'social_campaign', id: 'campaign1' }; const linkedPlan = createPlan('acme', 'author', linked);
    const changed = draftOf(linkedPlan); changed.nodes[0].linkedResource!.id = 'campaign2'; errorCode(() => createProposal('acme', 'author', linkedPlan.id, 1, changed), 'SCENARIO_LINKED_RESOURCE');
    const fakeExisting = structuredClone(draftOf(plan)); fakeExisting.nodes[0].status = 'done'; errorCode(() => createProposal('acme', 'author', plan.id, 1, fakeExisting), 'SCENARIO_FABRICATED_OUTCOME');
    const fakeKpi = structuredClone(draftOf(plan)); fakeKpi.nodes[0].kpi = { name: 'Leads', baseline: 50, actual: null, target: 100, unit: 'leads', source: '' }; errorCode(() => createProposal('acme', 'author', plan.id, 1, fakeKpi), 'SCENARIO_FABRICATED_OUTCOME');
  });
  it('treats a zero campaign cap as unspecified and retains planned costs separately', () => {
    const draft = basic(); draft.budgetCents = 0;
    expect(validatePlan(draft).some(i => i.code === 'BUDGET_EXCEEDED')).toBe(false);
    const plan = createPlan('acme', 'author', draft);
    expect(createProposal('acme', 'author', plan.id, 1, draftOf(plan)).draft.nodes[1].budgetCents).toBe(5000);
  });
});

describe('schedule and exports', () => {
  it('previews date-only downstream rescheduling across DST, extending horizon without saving', () => {
    const draft = basic(); draft.startDate = '2026-03-20'; draft.endDate = '2026-04-01'; draft.nodes[0].startDate = '2026-03-27'; draft.nodes[0].endDate = '2026-03-28'; draft.nodes[1].startDate = '2026-03-29'; draft.nodes[1].endDate = '2026-03-30';
    const plan = createPlan('acme', 'author', draft), shifted = previewReschedule(draftOf(plan), 'audit', '2026-03-31');
    expect(shifted.nodes[0].endDate).toBe('2026-04-01'); expect(shifted.nodes[1]).toMatchObject({ startDate: '2026-04-02', endDate: '2026-04-03' }); expect(shifted.endDate).toBe('2026-04-03');
    expect(getPlan('acme', plan.id).nodes[0].startDate).toBe('2026-03-27');
    const preview = createProposal('acme', 'author', plan.id, 1, shifted, { kind: 'reschedule' }); expect(preview.diff.changed).toHaveLength(2);
    expect(acceptProposal('acme', 'author', plan.id, preview.id, 1).nodes).toEqual(shifted.nodes);
  });
  it('does not move a locked dependent and ignores conceptual measurement feedback for scheduling', () => {
    const draft = basic(); draft.nodes[1].locked = true; errorCode(() => previewReschedule(draft, 'audit', '2026-12-05'), 'SCENARIO_LOCKED');
    draft.nodes[1].locked = false; draft.edges.push({ id: 'feedback', source: 'content', target: 'audit', type: 'measurement_feedback', lagDays: 0 });
    const shifted = previewReschedule(draft, 'audit', '2026-12-05'); expect(shifted.nodes[1].startDate).toBe('2026-12-07'); expect(draft.nodes[0].startDate).toBe('2026-12-01');
  });
  it('reports meaningful diffs and exports sourced data without spreadsheet formula execution', () => {
    const draft = basic(); draft.nodes[0].title = '=HYPERLINK("bad")'; draft.nodes[0].owner = '@external'; const plan = createPlan('acme', 'author', draft);
    const csv = exportPlan(plan, 'csv'); expect(csv.content).toContain('"\'=HYPERLINK(""bad"")"'); expect(csv.content).toContain('"\'@external"');
    expect(JSON.parse(exportPlan(plan).content).tenantId).toBe('acme'); expect(exportPlan(plan, 'markdown').content).toContain('## Evidence');
    const next = structuredClone(draftOf(plan)); next.nodes[1].budgetCents += 100; next.nodes[1].owner = 'Strategist';
    expect(diffPlans(plan, next)).toMatchObject({ budgetDeltaCents: 100, changed: [{ id: 'content', fields: ['owner', 'budgetCents'] }] });
  });
});
