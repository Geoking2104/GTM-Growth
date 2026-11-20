import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scenarioRoutes } from '../src/console/scenarios.js';
import type { HandlerContext } from '../src/console/util.js';
import type { Tenant } from '../src/tenants/store.js';
import { draftOf, parseDraft, type Plan } from '../src/scenarios/model.js';
import { captureOverviewEvidence } from '../src/scenarios/evidence.js';
import { closeScenarioStores } from '../src/scenarios/store.js';
import { changeDecision, closeDecisionStores } from '../src/console/decision-store.js';
import { closeSocialStores } from '../src/social/store.js';
import { closeLocalStores } from '../src/local-seo/store.js';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scenarios-api-'));
  vi.stubEnv('SCENARIOS_PATH', path.join(directory, 'scenarios.sqlite3'));
  vi.stubEnv('DECISION_PATH', path.join(directory, 'decision.sqlite3'));
  vi.stubEnv('SOCIAL_PATH', path.join(directory, 'social.sqlite3'));
  vi.stubEnv('LOCAL_SEO_PATH', path.join(directory, 'local.sqlite3'));
  vi.stubEnv('AI_VISIBILITY_PATH', path.join(directory, 'ai'));
});
afterEach(() => { closeScenarioStores(); closeDecisionStores(); closeSocialStores(); closeLocalStores(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });
function tenant(id = 'client-one'): Tenant { return { id, name: id, mode: 'organization', issuer: 'https://auth.example/realms/workspace', domains: ['example.com'], emailDomains: ['example.com'], gscProperties: ['sc-domain:example.com'], ga4Properties: ['123'], bingSites: ['https://example.com/'], gtmContainers: ['accounts/1/containers/2'], branding: {}, identityProviders: [], status: 'active', createdAt: '2026-01-01T00:00:00Z' }; }
function context(actor = 'owner', admin = false, selected = tenant()): HandlerContext { return { url: '', body: {}, user: { sub: actor, preferred_username: actor }, tenancy: { tenant: selected, role: admin ? 'tenant-admin' : 'tenant-user', platformAdmin: false, memberships: [{ id: selected.id, role: admin ? 'tenant-admin' : 'tenant-user' }] } }; }
const draft = () => parseDraft({ name: 'Marketing optimisation', objective: 'Improve the observed gaps', language: 'en', startDate: '2026-12-01', endDate: '2027-01-31', channels: ['seo', 'content', 'analytics'] });
async function call(name: string, body: Record<string, unknown>, ctx = context()): Promise<any> { const route = scenarioRoutes.find(item => item.path === `/scenarios/${name}`)!; return route.handler({ ...ctx, body }); }
async function create(ctx = context()): Promise<Plan> { return (await call('create', { draft: draft() }, ctx)).plan; }

it('persists own editable plans while denying outsiders and cross-tenant references', async () => {
  const plan = await create();
  expect((await call('get', { id: plan.id })).canEdit).toBe(true);
  expect((await call('get', { id: plan.id }, context('colleague'))).canEdit).toBe(false);
  await expect(call('update-draft', { id: plan.id, version: 1, draft: { ...draftOf(plan), name: 'Hijack' } }, context('colleague'))).rejects.toMatchObject({ status: 403 });
  await expect(call('get', { id: plan.id }, context('owner', false, tenant('another-client')))).rejects.toMatchObject({ status: 404 });
  const outsider = context('platform', true); outsider.tenancy!.platformAdmin = true; outsider.tenancy!.memberships = [];
  await expect(call('list', {}, outsider)).rejects.toMatchObject({ status: 403 });
  const robot = context(); robot.user!.preferred_username = 'service-account-automation';
  await expect(call('create', { draft: draft() }, robot)).rejects.toMatchObject({ status: 403 });
  await expect(call('create', { draft: draft(), tenantId: 'another-client' })).rejects.toThrow();
});

it('turns stored audit evidence into a preview and saves only after explicit acceptance', async () => {
  captureOverviewEvidence('client-one', { url: 'https://example.com/', generatedAt: '2026-11-20T12:00:00Z', geo: { recommendations: [
    { action: 'Add a missing page description', checkId: 'meta', category: 'content', priority: 'high', points: 4 },
    { action: 'Clarify source citations', checkId: 'source', category: 'structure', priority: 'medium', points: 3 },
  ] } });
  const sources = (await call('evidence', {})).evidence;
  const plan = (await call('create', { draft: draft(), evidenceIds: sources.map((e: any) => e.id) })).plan;
  expect(plan.evidence).toHaveLength(2);
  const transport = vi.fn(); vi.stubGlobal('fetch', transport);
  const { proposal } = await call('generate-preview', { id: plan.id, version: 1, mode: 'template' });
  expect(proposal.draft.nodes).toHaveLength(6);
  expect(new Set(proposal.draft.nodes.map((node: any) => node.channel)).size).toBe(3);
  expect(proposal.draft.nodes.every((node: any) => node.evidenceIds.length > 0)).toBe(true);
  expect((await call('get', { id: plan.id })).plan.nodes).toHaveLength(0);
  const accepted = await call('accept-revision', { id: plan.id, version: 1, proposalId: proposal.id });
  expect(accepted.plan.version).toBe(2); expect(accepted.plan.nodes).toHaveLength(6);
  expect(transport).not.toHaveBeenCalled();
  await expect(call('accept-revision', { id: plan.id, version: 1, proposalId: proposal.id })).rejects.toMatchObject({ status: 409 });
});

it('does not trust client-written observed evidence or permit retained-source alteration', async () => {
  const fake = { id: 'fake', source: 'audit', sourceId: 'overview_fake', title: 'Invented', detail: '', url: 'https://example.com/', observedAt: '2026-11-20T00:00:00Z', kind: 'observed' };
  await expect(call('create', { draft: { ...draft(), evidence: [fake] } })).rejects.toMatchObject({ status: 403 });
  const declared = { ...fake, source: 'manual', kind: 'declared' };
  const plan = (await call('create', { draft: { ...draft(), evidence: [declared] } })).plan;
  expect(plan.evidence[0].sourceId).toBe('declared:owner');
  await expect(call('update-draft', { id: plan.id, version: 1, draft: { ...draftOf(plan), evidence: [{ ...plan.evidence[0], title: 'Changed past source' }] } })).rejects.toMatchObject({ status: 400 });
  await expect(call('create', { draft: { ...draft(), evidence: [{ ...declared, url: 'https://foreign.example/' }] } })).rejects.toMatchObject({ status: 403 });
  await expect(call('create', { draft: { ...draft(), evidence: [{ ...declared, sourceProvider: 'gsc', sourceScope: 'sc-domain:example.com' }] } })).rejects.toMatchObject({ status: 403 });
});

it('retains authorised historical evidence after source rotation and denies revoked scopes', async () => {
  changeDecision('client-one', state => { state.evidence.push({ id: 'a'.repeat(64), source: 'gsc', sourceScope: 'sc-domain:example.com', query: 'Audit query', page: 'https://example.com/page', clicks: 2, impressions: 20, ctr: .1, position: 3, observedAt: '2026-11-20T12:00:00Z', period: '2026-11' }); });
  const source = (await call('evidence', {})).evidence[0];
  const plan = (await call('create', { draft: draft(), evidenceIds: [source.id] })).plan;
  changeDecision('client-one', state => { state.evidence = []; });
  expect((await call('get', { id: plan.id })).plan.evidence[0].sourceScope).toBe('sc-domain:example.com');
  const revoked = tenant(); revoked.gscProperties = [];
  await expect(call('get', { id: plan.id }, context('owner', false, revoked))).rejects.toMatchObject({ status: 403 });
  expect((await call('list', {}, context('owner', false, revoked))).plans).toHaveLength(0);
  const revokedDomain = tenant(); revokedDomain.domains = ['another.example'];
  await expect(call('get', { id: plan.id }, context('owner', false, revokedDomain))).rejects.toMatchObject({ status: 403 });
});

it('requires explicit AI permission and rejects stale versions before any provider call', async () => {
  const plan = await create(), transport = vi.fn(); vi.stubGlobal('fetch', transport);
  await expect(call('generate-preview', { id: plan.id, version: 1, mode: 'ai', provider: 'grok', accountId: 'server', confirmed: true })).rejects.toMatchObject({ status: 403 });
  await expect(call('generate-preview', { id: plan.id, version: 9, mode: 'ai', provider: 'grok', accountId: 'server', confirmed: true }, context('admin', true))).rejects.toMatchObject({ status: 409 });
  await expect(call('generate-preview', { id: plan.id, version: 1, mode: 'ai', provider: 'grok', accountId: 'server' }, context('admin', true))).rejects.toMatchObject({ status: 400 });
  expect(transport).not.toHaveBeenCalled();
});

it('keeps comment reads side-effect free and supports versioned restoration previews', async () => {
  const plan = await create();
  await expect(call('comments', { id: plan.id, body: 'Do not write through read route' })).rejects.toThrow();
  expect((await call('comments', { id: plan.id })).comments).toEqual([]);
  await call('add-comment', { id: plan.id, body: '<script>not executable</script>' }, context('colleague'));
  expect((await call('comments', { id: plan.id })).comments[0].body).toBe('<script>not executable</script>');
  await call('update-draft', { id: plan.id, version: 1, draft: { ...draftOf(plan), name: 'Adjusted plan' } });
  const { proposal } = await call('preview-revision', { id: plan.id, version: 2, targetVersion: 1 });
  expect(proposal.draft.name).toBe(plan.name);
  expect((await call('get', { id: plan.id })).plan.name).toBe('Adjusted plan');
  const restored = await call('accept-revision', { id: plan.id, version: 2, proposalId: proposal.id });
  expect(restored.plan.name).toBe(plan.name); expect(restored.plan.version).toBe(3);
  expect((await call('history', { id: plan.id })).revisions).toHaveLength(3);
  expect((await call('revision', { id: plan.id, version: 2 })).plan.name).toBe('Adjusted plan');
});

it('rejects invented user assignments and module references', async () => {
  const node = { id: 'action', title: 'Act', channel: 'social', startDate: '2026-12-02', endDate: '2026-12-03' };
  await expect(call('create', { draft: { ...draft(), nodes: [{ ...node, assigneeId: 'invented-person' }] } })).rejects.toMatchObject({ status: 403 });
  await expect(call('create', { draft: { ...draft(), nodes: [{ ...node, linkedResource: { type: 'social_campaign', id: 'foreign-resource' } }] } })).rejects.toMatchObject({ status: 403 });
  const saved = await call('create', { draft: { ...draft(), nodes: [{ ...node, owner: 'Social lead', assigneeId: 'owner' }] } });
  expect(saved.plan.nodes[0].owner).toBe('Social lead');
});

it('exports only scoped plans, archives read only and duplicates into an editable draft', async () => {
  const plan = await create();
  const exported = await call('export', { id: plan.id, format: 'json' });
  expect(JSON.parse(exported.content).name).toBe(plan.name); expect(exported.mime).toContain('json');
  await call('archive', { id: plan.id, version: 1 });
  await expect(call('update-draft', { id: plan.id, version: 2, draft: draft() })).rejects.toMatchObject({ status: 403 });
  const copied = await call('duplicate', { id: plan.id });
  expect(copied.plan.status).toBe('draft'); expect(copied.plan.id).not.toBe(plan.id);
});

it('paginates safe summaries without returning full graphs or evidence in the list', async () => {
  for (let i = 0; i < 3; i++) await call('create', { draft: { ...draft(), name: `Plan ${i}` } });
  const page = await call('list', { limit: 2 });
  expect(page.plans).toHaveLength(2); expect(page.nextOffset).toBe(2);
  expect(page.plans[0].summary).toMatchObject({ count: 0, done: 0 });
  expect(page.plans[0]).not.toHaveProperty('nodes'); expect(page.plans[0]).not.toHaveProperty('evidence'); expect(page.plans[0]).not.toHaveProperty('scope');
  const next = await call('list', { limit: 2, offset: page.nextOffset });
  expect(next.plans).toHaveLength(1); expect(next.nextOffset).toBeNull();
});
