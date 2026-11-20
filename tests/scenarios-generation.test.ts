import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyGeneratedNodes, generateScenarioDraft, generateTemplate, generationInputSchema, GENERATION_LIMITS, type GenerationProvider } from '../src/scenarios/generation.js';
import { parseDraft } from '../src/scenarios/model.js';
import { closeScenarioStores } from '../src/scenarios/store.js';
let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scenarios-ai-')); vi.stubEnv('SCENARIOS_PATH', path.join(directory, 'plans.sqlite3')); });
afterEach(() => { closeScenarioStores(); vi.unstubAllEnvs(); vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });
const base = () => parseDraft({ name: 'Evidence-led plan', language: 'en', startDate: '2026-12-01', endDate: '2026-12-31', budgetCents: 100000, channels: ['seo', 'content', 'analytics'], evidence: [{ id: 'proof', source: 'manual', sourceId: 'declared:owner', title: 'Review mobile checkout', detail: 'A hypothesis, not an observed conversion uplift', kind: 'hypothesis', observedAt: '2026-11-20T10:00:00Z' }] });
const request = () => generationInputSchema.parse({ mode: 'ai', provider: 'openai', accountId: 'selected', confirmed: true });
function output(overrides = {}) { return { summary: 'Prepare an evidence-led action', nodes: [{ key: 'first', title: 'Review mobile checkout', description: 'Confirm the hypothesis against authorised data', channel: 'analytics', type: 'action', startDate: '2026-12-01', endDate: '2026-12-05', owner: 'Analyst', effortHours: 2, budgetCents: 0, evidenceIds: ['proof'], checklist: ['Verify the baseline'], ...overrides }], edges: [] }; }
function providerResponse(provider: GenerationProvider, value = output()) { return provider === 'claude' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }] } : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }; }

it('creates six dated actions across three selected channels without claiming measurements', () => {
  const draft = generateTemplate(base(), generationInputSchema.parse({ mode: 'rules' }));
  expect(draft.nodes).toHaveLength(6); expect(draft.edges).toHaveLength(3);
  expect(new Set(draft.nodes.map(node => node.channel)).size).toBe(3);
  expect(draft.nodes.every(node => node.evidenceIds[0] === 'proof')).toBe(true);
  expect(draft.nodes.filter(node => node.kpi).every(node => node.kpi?.actual === null && node.kpi?.baseline === null)).toBe(true);
  expect(draft.nodes.every(node => node.startDate >= draft.startDate && node.endDate <= draft.endDate)).toBe(true);
});

it('preserves locked and unselected manual edits in a local branch revision', () => {
  const draft = generateTemplate(base(), generationInputSchema.parse({})); draft.nodes[0].locked = true;
  const selected = draft.nodes[1].id;
  const result = generateTemplate(draft, generationInputSchema.parse({ mode: 'rules', nodeIds: [selected], instruction: 'Review with legal' }));
  expect(result.nodes[1].description).toContain('Review with legal');
  expect(result.nodes[0]).toEqual(draft.nodes[0]); expect(result.nodes[2]).toEqual(draft.nodes[2]);
});

it('assigns IDs on the server and rejects invented sources, locked IDs and malformed graphs', () => {
  const draft = base(), result = applyGeneratedNodes(draft, request(), output());
  expect(result.draft.nodes[0].id).not.toBe('first');
  expect(result.draft.nodes[0].status).toBe('todo'); expect(result.draft.nodes[0].linkedResource).toBeUndefined();
  expect(() => applyGeneratedNodes(draft, request(), output({ evidenceIds: ['invented'] }))).toThrow('unavailable');
  expect(() => applyGeneratedNodes(draft, request(), output({ id: 'fake-server-id' }))).toThrow('unavailable');
  expect(() => applyGeneratedNodes(draft, request(), { ...output(), execute: true })).toThrow('schema');
  expect(() => applyGeneratedNodes(draft, request(), output({ budgetCents: 200000 }))).toThrow('budget');
  expect(() => applyGeneratedNodes(draft, request(), output({ endDate: '2026-02-31' }))).toThrow();
  expect(() => applyGeneratedNodes(draft, request(), { ...output(), edges: [{ source: 'first', target: 'missing', type: 'finish_to_start', lagDays: 0 }] })).toThrow('missing');
});

it('preserves observed KPI values and forbids changing their metric or unit', () => {
  const draft = parseDraft({ ...base(), nodes: [{ id: 'measured', title: 'Review', channel: 'analytics', startDate: '2026-12-01', endDate: '2026-12-05', kpi: { name: 'Clicks', baseline: 20, actual: 22, target: 25, unit: 'clicks', source: 'GSC report', observedAt: '2026-11-20T10:00:00Z' } }] });
  const result = applyGeneratedNodes(draft, request(), output({ id: 'measured', kpi: { name: 'Clicks', target: 30, unit: 'clicks' } }));
  expect(result.draft.nodes[0].kpi).toMatchObject({ actual: 22, baseline: 20, target: 30, source: 'GSC report' });
  expect(() => applyGeneratedNodes(draft, request(), output({ id: 'measured', kpi: { name: 'Revenue', target: 30, unit: 'EUR' } }))).toThrow('meaning');
  draft.nodes[0].locked = true;
  expect(() => applyGeneratedNodes(draft, request(), output({ id: 'measured' }))).toThrow('unavailable');
});

it.each(['openai', 'claude', 'mistral', 'grok'] as GenerationProvider[])('uses the selected %s API account with a bounded no-tools request', async provider => {
  const resolveAccount = vi.fn(() => ({ key: 'test-secret', organization: 'organisation', project: 'project' }));
  const transport = vi.fn(async (_url, _init) => new Response(JSON.stringify(providerResponse(provider)), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
  const result = await generateScenarioDraft('workspace-one', base(), { ...request(), provider }, { transport, resolveAccount });
  expect(resolveAccount).toHaveBeenCalledWith('workspace-one', provider, 'selected');
  const [, init] = vi.mocked(transport).mock.calls[0], payload = JSON.parse(init!.body as string);
  expect(payload.tools).toBeUndefined(); expect(payload.max_tokens ?? payload.max_completion_tokens).toBe(GENERATION_LIMITS.outputTokens);
  expect(init!.redirect).toBe('error'); expect(init!.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.stringify(payload)).not.toContain('test-secret'); expect(JSON.stringify(result)).not.toContain('test-secret');
  expect(result.kind).toBe('ai'); expect(result.draft.nodes).toHaveLength(1);
});

it('does not call an AI provider without explicit confirmation or selected account', async () => {
  const transport = vi.fn() as unknown as typeof fetch, resolveAccount = vi.fn(() => ({ key: 'secret' }));
  await expect(generateScenarioDraft('workspace-one', base(), { mode: 'ai', provider: 'openai', accountId: 'selected' }, { transport, resolveAccount })).rejects.toMatchObject({ status: 400 });
  await expect(generateScenarioDraft('workspace-one', base(), { mode: 'ai', provider: 'openai', confirmed: true }, { transport, resolveAccount })).rejects.toMatchObject({ status: 400 });
  expect(transport).not.toHaveBeenCalled(); expect(resolveAccount).not.toHaveBeenCalled();
  await generateScenarioDraft('workspace-one', base(), { mode: 'template' }, { transport, resolveAccount });
  expect(transport).not.toHaveBeenCalled();
});

it('returns a safe error for provider failures and never retries automatically', async () => {
  const transport = vi.fn(async () => new Response('secret provider debug value', { status: 401 })) as unknown as typeof fetch;
  const resolveAccount = () => ({ key: 'secret' });
  await expect(generateScenarioDraft('workspace-one', base(), request(), { transport, resolveAccount })).rejects.toThrow('HTTP 401');
  expect(transport).toHaveBeenCalledTimes(1);
  const truncated = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(output()) } }] }))) as unknown as typeof fetch;
  await expect(generateScenarioDraft('workspace-one', base(), request(), { transport: truncated, resolveAccount })).rejects.toMatchObject({ status: 502, code: 'SCENARIO_AI_UNAVAILABLE' });
  expect(truncated).toHaveBeenCalledTimes(1);
});

it('rejects response overflow, concurrent calls and durable per-workspace rate overruns', async () => {
  const resolveAccount = () => ({ key: 'secret' });
  const large = vi.fn(async () => new Response('x'.repeat(GENERATION_LIMITS.responseBytes + 1))) as unknown as typeof fetch;
  await expect(generateScenarioDraft('workspace-one', base(), request(), { transport: large, resolveAccount })).rejects.toMatchObject({ status: 502 });
  const transport = vi.fn(async () => new Response(JSON.stringify(providerResponse('openai')))) as unknown as typeof fetch;
  for (let i = 0; i < 9; i++) await generateScenarioDraft('workspace-one', base(), request(), { transport, resolveAccount });
  await expect(generateScenarioDraft('workspace-one', base(), request(), { transport, resolveAccount })).rejects.toMatchObject({ status: 429 });
  expect(transport).toHaveBeenCalledTimes(9);
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const blocked = vi.fn(() => pending) as unknown as typeof fetch;
  const first = generateScenarioDraft('workspace-two', base(), request(), { transport: blocked, resolveAccount });
  await expect(generateScenarioDraft('workspace-two', base(), request(), { transport: blocked, resolveAccount })).rejects.toMatchObject({ status: 409 });
  release(new Response(JSON.stringify(providerResponse('openai')))); await first;
});
