import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeImport } from '../src/console/ai-visibility.js';
import { closeVisibilityStores, insertDataset } from '../src/console/ai-visibility-store.js';
import { closeDecisionStores } from '../src/console/decision-store.js';
import { pinVisibilityAnswer } from '../src/console/decision-intent.js';
import { decideReview, executeReview, proposeReview } from '../src/console/decision-inbox.js';
import { readEditorialBrief, readEditorialFollowUps, saveEditorialBrief, shareEditorialEvidence, verifyEditorialIntervention } from '../src/console/decision-editorial.js';
import type { HandlerContext } from '../src/console/util.js';
import { ReportAccessService, type ReportInvitation } from '../src/report-access/service.js';
import type { FreeReport360 } from '../src/freeread/report360.js';
import { parseHTML } from 'linkedom';

const targetUrl = 'https://example.com/shoes/';
const brand = 'Acme', source = 'Provider', prompt = 'What are the best shoes?';
const brands = [{ name: brand, website: 'https://example.com' }];
const citations = ['https://example.com/shoes/', 'https://news.example/shoes'];
const baseResponse = { source, prompt, citations, answer: 'Acme and its evidence.', observedAt: '2026-10-30T01:00:00Z', measurement: { model: 'v1', market: 'FR' } };
const draft = { title: 'Acme leather shoes for long daily walks', slug: 'shoes', metaDescription: 'm'.repeat(125),
  outline: [{ h2: 'Understand leather shoes', bullets: ['Fit', 'Leather', 'Maintenance'] }, { h2: 'FAQ', bullets: ['Sizing?'] }],
  body: 'Acme leather shoes '.repeat(300).trim() };
const ctx = (id = 'acme', sub = 'author', role = 'tenant-admin') => ({ body: {}, user: { sub },
  tenancy: { tenant: { id, domains: ['example.com'], status: 'active' }, role, memberships: [{ id, role }] } }) as HandlerContext;
const secret = 'private-report-test-secret-more-than-32-characters';
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gtm-editorial-'));
  vi.stubEnv('DECISION_PATH', path.join(dir, 'decisions.sqlite'));
  vi.stubEnv('AI_VISIBILITY_PATH', path.join(dir, 'visibility'));
  vi.stubEnv('REPORT_ACCESS_ENABLED', 'true');
  vi.stubEnv('REPORT_ACCESS_SECRET', secret);
  vi.stubEnv('REPORT_ACCESS_DB_PATH', path.join(dir, 'report.sqlite'));
  vi.stubEnv('WP_SITE_URL_ACME', 'https://example.com');
  vi.stubEnv('WP_USERNAME_ACME', 'test');
  vi.stubEnv('WP_APP_PASSWORD_ACME', 'test');
});
afterEach(() => {
  closeDecisionStores(); closeVisibilityStores();
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

function pin() {
  const panel = normalizeImport({ brands, responses: [baseResponse] });
  insertDataset('acme', panel);
  const input = { datasetId: panel.id, responseId: panel.observations[0].id, stage: 'product-aware', targetUrl, brand };
  return { input, pin: pinVisibilityAnswer(ctx(), input).pin };
}

it('saves the exact AI proof and approved brief version, then measures only the verified publication and its matching cohort', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T12:00:00.500Z'));
  const { input, pin: proof } = pin(), pinId = proof.id;
  expect(pinVisibilityAnswer(ctx(), input).pin.id).toBe(pinId);
  expect(proof.evidence.ai).toMatchObject({ answer: baseResponse.answer, citations, brand, source });
  expect(() => pinVisibilityAnswer(ctx('other'), input)).toThrow('DECISION_EVIDENCE_EXPIRED');
  expect(() => pinVisibilityAnswer(ctx(), { ...input, targetUrl: 'https://other.example/' })).toThrow('DECISION_PAGE_SCOPE');
  expect(() => saveEditorialBrief(ctx('acme', 'viewer', 'tenant-user'), { pinId, revision: 0, draft })).toThrow('DECISION_ACCESS');

  const initial = saveEditorialBrief(ctx(), { pinId, revision: 0, draft });
  expect(initial.brief.revision).toBe(1);
  expect(readEditorialBrief(ctx(), { pinId }).brief?.draft).toEqual(draft);
  const proposal = { kind: 'wordpress', payload: { ...draft, title: 'Untrusted title' }, editorial: { pinId, revision: 1 } };
  const review = await proposeReview(ctx(), proposal);
  expect(review.payload).toMatchObject({ title: draft.title, editorial: { pinId, revision: 1, url: targetUrl } });
  expect((await proposeReview(ctx('acme', 'another'), proposal)).id).toBe(review.id);
  const next = saveEditorialBrief(ctx(), { pinId, revision: 1, draft: { ...draft, body: draft.body + ' New revision.' } });
  expect(next.brief.revision).toBe(2);
  expect(() => saveEditorialBrief(ctx(), { pinId, revision: 1, draft })).toThrow('DECISION_CHANGED');
  await expect(proposeReview(ctx(), proposal)).rejects.toThrow('DECISION_CHANGED');
  await expect(proposeReview(ctx('other'), proposal)).rejects.toThrow('DECISION_EVIDENCE_EXPIRED');

  const command = { id: review.id, digest: review.digest, confirmed: true };
  const verifyInput = { reviewId: review.id };
  const unreachable = vi.fn();
  await expect(verifyEditorialIntervention(ctx(), verifyInput, unreachable)).rejects.toThrow('DECISION_CHANGED');
  expect(unreachable).not.toHaveBeenCalled();
  await decideReview(ctx('acme', 'reviewer'), { ...command, source: 'decision', decision: 'approve', comment: 'Checked version 1' });
  const wp = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: 7, link: 'https://example.com/?p=7' }));
  vi.stubGlobal('fetch', wp);
  expect((await executeReview(ctx(), command)).result).toMatchObject({ postId: 7, publicationStatus: 'draft' });
  expect(JSON.parse(String(wp.mock.calls[0][1]?.body))).toMatchObject({ status: 'draft', content: draft.body });
  expect(() => readEditorialFollowUps(ctx(), verifyInput)).toThrow('DECISION_CHANGED');

  const published = { id: 7, status: 'publish', link: targetUrl, password: '', date_gmt: '2026-11-01T13:00:00', modified_gmt: '2026-11-01T13:00:00',
    title: { raw: draft.title }, content: { raw: draft.body } };
  const transport = vi.fn<typeof fetch>();
  for (const mismatch of [{ status: 'draft' }, { link: 'https://example.com/other/' }, { password: 'protected' }, { content: { raw: next.brief.draft.body } }]) {
    transport.mockResolvedValueOnce(Response.json({ ...published, ...mismatch }));
    await expect(verifyEditorialIntervention(ctx(), verifyInput, transport, new Date('2026-11-01T14:00:00Z'))).rejects.toThrow('WORDPRESS_PUBLICATION_UNVERIFIED');
  }
  transport.mockResolvedValueOnce(Response.json(published));
  const verified = await verifyEditorialIntervention(ctx(), verifyInput, transport, new Date('2026-11-01T14:00:00Z'));
  expect(verified).toMatchObject({ revision: 1, effectiveAt: '2026-11-01T13:00:00.000Z', postId: 7 });
  expect(transport.mock.calls.at(-1)).toEqual([expect.stringContaining('/wp-json/wp/v2/posts/7?context=edit'), expect.objectContaining({ redirect: 'error' })]);
  expect(await verifyEditorialIntervention(ctx(), verifyInput, unreachable)).toEqual(verified);

  const rows = (day: string, answer: string, model: string, count: number) => Array.from({ length: count }, (_, index) =>
    ({ ...baseResponse, answer: `${answer} ${index}`, observedAt: `${day}T12:00:00Z`, measurement: { ...baseResponse.measurement, model } }));
  insertDataset('acme', normalizeImport({ brands, responses: [
    ...rows('2026-10-31', 'Acme', 'v1', 4), ...rows('2026-11-01', 'Acme on intervention day', 'v1', 8),
    ...rows('2026-11-06', 'Different model', 'v2', 10),
  ] }));
  expect(readEditorialFollowUps(ctx(), verifyInput, new Date('2026-11-15T23:59:00Z')).followUps.map(item => item.state)).toEqual(['window_open', 'window_open']);
  const settled = new Date('2026-11-16T12:00:00Z');
  expect(readEditorialFollowUps(ctx(), verifyInput, settled).followUps[0].state).toBe('no_matching_cohort');
  insertDataset('acme', normalizeImport({ brands, responses: rows('2026-11-06', 'Competitor', 'v1', 1) }));
  expect(readEditorialFollowUps(ctx(), verifyInput, settled).followUps[0].state).toBe('insufficient');
  insertDataset('acme', normalizeImport({ brands, responses: rows('2026-11-07', 'Competitor', 'v1', 4) }));
  expect(readEditorialFollowUps(ctx(), verifyInput, new Date('2026-11-30T12:00:00Z')).followUps).toMatchObject([
    { label: 'J+14', state: 'comparable', comparison: { visibility: { previous: 100, current: 0, delta: -100, included: [5, 5] } } },
    { label: 'J+28', state: 'comparable', comparison: { visibility: { previous: 100, current: 0, delta: -100, included: [5, 5] } } },
  ]);
});

it('exposes only selected evidence to one recipient session and supports workspace-scoped revocation', async () => {
  const { pin: proof } = pin();
  const service = new ReportAccessService({ dbPath: process.env.REPORT_ACCESS_DB_PATH!, secret });
  const invite = async (email: string, sourceUrl = targetUrl) => {
    let mail!: ReportInvitation;
    const { id } = await service.invite({ email, url: sourceUrl, language: 'en', ip: 'local' },
      async () => ({ sourceUrl, schemaVersion: 1, scope: 'single_public_url' } as FreeReport360), async details => { mail = details; });
    return { id, ...service.verify({ id, email, code: mail.code }) };
  };
  try {
    const addressed = await invite('recipient@example.com');
    const samePage = await invite('other@example.com');
    const sameRecipient = await invite('recipient@example.com');
    const otherPage = await invite('recipient@example.com', 'https://example.com/elsewhere/');
    const permission = { pinId: proof.id, reportId: addressed.id, email: 'recipient@example.com', includeExcerpt: false, citations: [1] };
    expect(() => shareEditorialEvidence(ctx(), { ...permission, email: 'wrong@example.com' })).toThrow('report_scope_unavailable');
    expect(() => shareEditorialEvidence(ctx(), { ...permission, reportId: otherPage.id })).toThrow('report_scope_unavailable');
    expect(() => shareEditorialEvidence(ctx('other'), permission)).toThrow('DECISION_EVIDENCE_EXPIRED');
    expect(shareEditorialEvidence(ctx(), permission)).toEqual({ ok: true });
    expect(service.authorisedReport(addressed.id, addressed.token, true).visibilityEvidence).toEqual([
      { source, observedAt: '2026-10-30T01:00:00.000Z', citations: [citations[1]] },
    ]);
    expect(service.authorisedReport(addressed.id, addressed.token).visibilityEvidence).toBeUndefined();
    expect(service.authorisedReport(samePage.id, samePage.token, true).visibilityEvidence).toBeUndefined();
    expect(service.authorisedReport(sameRecipient.id, sameRecipient.token, true).visibilityEvidence).toBeUndefined();
    expect(() => service.authorisedReport(addressed.id, samePage.token, true)).toThrow('verification_required');
    service.revokeVisibilityEvidence(addressed.id, 'other');
    expect(service.authorisedReport(addressed.id, addressed.token, true).visibilityEvidence).toHaveLength(1);
    service.revokeVisibilityEvidence(addressed.id, 'acme');
    expect(service.authorisedReport(addressed.id, addressed.token, true).visibilityEvidence).toBeUndefined();
  } finally { service.close(); }
});

it('renders the saved revision and explains unavailable follow-up windows in the linked editor', async () => {
  const { pin: proof } = pin(), pinId = proof.id;
  const { document } = parseHTML('<html lang="en"><body></body></html>');
  vi.stubGlobal('document', document);
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', { getItem: () => 'en' });
  const api = vi.fn(async (route: string) => {
    if (route === '/decision/editorial/brief') return { pin: proof, brief: { revision: 2, draft }, gates: [], reviews: [
      { id: 'review', revision: 1, status: 'completed', intervention: { effectiveAt: '2026-11-01T00:00:00Z' } },
    ] };
    if (route === '/decision/editorial/follow-ups') return { brand, source, followUps: [
      { label: 'J+14', dueAt: '2026-11-15T00:00:00Z', state: 'no_matching_cohort' },
      { label: 'J+28', dueAt: '2026-11-29T00:00:00Z', state: 'window_open' },
    ] };
    throw new Error(`Unexpected route ${route}`);
  });
  const { renderVisibilityEditorial } = await import('../site/console/editorial.js');
  const editor = renderVisibilityEditorial({ api, pinId, admin: true, onExit: () => {} });
  await vi.waitFor(() => expect(editor.textContent).toContain('Saved version v2'));
  expect(editor.querySelector('a')?.getAttribute('href')).toBe(targetUrl);
  expect(editor.textContent).toContain('Submit for review');
  const measure = [...editor.querySelectorAll('button')].find(item => item.textContent?.includes('Calculate day'));
  expect(measure).toBeDefined();
  await measure!.onclick();
  expect(editor.textContent).toContain('No cohort with the same context exists in both windows.');
  expect(editor.textContent).toContain('The UTC window is open or upcoming.');
  expect(api.mock.calls).toEqual([['/decision/editorial/brief', { pinId }], ['/decision/editorial/follow-ups', { reviewId: 'review' }]]);
});
