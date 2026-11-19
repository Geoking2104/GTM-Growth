import { z } from 'zod';
import { planFollowUps } from '../impact/follow-ups.js';
import { ReportAccessService, ReportAccessError } from '../report-access/service.js';
import { decisionPrincipal, fingerprint, ownedPage } from './decision-context.js';
import { changeDecision, logDecision, readDecision, type DecisionState, type EditorialIntervention } from './decision-store.js';
import { qualityGates, wpConfigFromEnv, type WordPressConfig } from './content-ops.js';
import { getDataset } from './ai-visibility-store.js';
import type { Dataset } from './ai-visibility.js';
import { readVisibilityComparison, utcDayStart } from './visibility-comparison.js';
import type { ConsoleRoute, HandlerContext } from './util.js';

const pinInput = z.object({ pinId: z.string().uuid() });
export const editorialReference = pinInput.extend({ revision: z.number().int().positive() }).strict();
export const draftSchema = z.object({
  title: z.string().min(1).max(200), slug: z.string().min(1).max(200), body: z.string().min(1).max(100000),
  metaDescription: z.string().max(500), entities: z.array(z.string().min(1).max(200)).min(1).max(20).optional(),
  outline: z.array(z.object({ h2: z.string().max(500), bullets: z.array(z.string().max(1000)).max(30) })).max(30),
});

export function requireEditorialPin(ctx: HandlerContext, state: DecisionState, pinId: string) {
  const pin = state.pins.find(item => item.id === pinId);
  if (!pin?.evidence.ai) throw new Error('DECISION_EVIDENCE_EXPIRED');
  ownedPage(ctx, pin.targetUrl);
  return pin;
}

export function readEditorialBrief(ctx: HandlerContext, raw: unknown) {
  const who = decisionPrincipal(ctx), { pinId } = pinInput.strict().parse(raw);
  const state = readDecision(who.tenant.id), pin = requireEditorialPin(ctx, state, pinId);
  const brief = state.editorialBriefs?.find(item => item.pinId === pinId) ?? null;
  const reviews = state.reviews.filter(review => review.kind === 'wordpress' && review.payload.editorial?.pinId === pinId)
    .map(review => ({ id: review.id, revision: review.payload.editorial.revision as number, status: review.status, expiresAt: review.expiresAt,
      intervention: state.editorialInterventions?.find(item => item.reviewId === review.id) ?? null }));
  return { pin, brief, gates: brief ? qualityGates(brief.draft) : [], reviews };
}

export function saveEditorialBrief(ctx: HandlerContext, raw: unknown) {
  const who = decisionPrincipal(ctx, true);
  const input = pinInput.extend({ revision: z.number().int().nonnegative(), draft: draftSchema }).strict().parse(raw);
  if (JSON.stringify(input.draft).length > 140000) throw new Error('DECISION_CAPACITY');
  return changeDecision(who.tenant.id, state => {
    requireEditorialPin(ctx, state, input.pinId);
    const briefs = state.editorialBriefs ??= [];
    const index = briefs.findIndex(item => item.pinId === input.pinId);
    const current = briefs[index];
    if (current && fingerprint(current.draft) === fingerprint(input.draft)) return { brief: current, gates: qualityGates(current.draft) };
    if ((current?.revision ?? 0) !== input.revision) throw new Error('DECISION_CHANGED');
    const brief = { pinId: input.pinId, revision: input.revision + 1, draft: input.draft, savedAt: new Date().toISOString() };
    if (index < 0) briefs.push(brief);
    else briefs[index] = brief;
    logDecision(state, who.actor, 'editorial-brief-saved', input.pinId);
    return { brief, gates: qualityGates(brief.draft) };
  });
}

const wordpressPost = z.object({ id: z.number().int().positive(), status: z.string(), link: z.string().url(), password: z.literal(''),
  date_gmt: z.string(), modified_gmt: z.string(), title: z.object({ raw: z.string() }), content: z.object({ raw: z.string() }) });
async function readWordPressPost(config: WordPressConfig, type: 'posts' | 'pages', id: number, transport: typeof fetch) {
  const auth = Buffer.from(`${config.username}:${config.appPassword}`).toString('base64');
  const endpoint = `${config.siteUrl}/wp-json/wp/v2/${type}/${id}?context=edit&_fields=id,status,link,password,date_gmt,modified_gmt,title.raw,content.raw`;
  const response = await transport(endpoint, { headers: { Authorization: `Basic ${auth}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  return response.ok ? wordpressPost.safeParse(await response.json()) : null;
}
const utcWordPressTime = (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value) ? Date.parse(`${value}Z`) : NaN;
const lineEndings = (value: string) => value.replace(/\r\n?/g, '\n');

export async function verifyEditorialIntervention(ctx: HandlerContext, raw: unknown, transport: typeof fetch = fetch, now = new Date()) {
  const who = decisionPrincipal(ctx, true);
  const input = z.object({ reviewId: z.string().uuid(), publishedPostId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    postType: z.enum(['posts', 'pages']).default('posts') }).strict().parse(raw);
  const state = readDecision(who.tenant.id);
  const review = state.reviews.find(item => item.id === input.reviewId && item.kind === 'wordpress' && item.status === 'completed');
  const reference = review?.payload.editorial;
  const receipt = review?.result as { postId?: number; publicationStatus?: string } | undefined;
  if (!review?.dispatchedAt || !reference || receipt?.publicationStatus !== 'draft' || !receipt.postId) throw new Error('DECISION_CHANGED');
  const pin = requireEditorialPin(ctx, state, reference.pinId);
  const previous = state.editorialInterventions?.find(item => item.reviewId === review.id);
  if (previous) return previous;
  const config = wpConfigFromEnv(who.tenant.id);
  if (!config || config.siteUrl !== review.target || !['https:', 'http:'].includes(new URL(config.siteUrl).protocol)) throw new Error('WORDPRESS_NOT_CONFIGURED');
  const id = input.publishedPostId ?? receipt.postId;
  if (!Number.isSafeInteger(id) || id < 1 || (!input.publishedPostId && input.postType !== 'posts')) throw new Error('DECISION_CHANGED');
  let result;
  try { result = await readWordPressPost(config, input.postType, id, transport); }
  catch { throw new Error('WORDPRESS_VERIFICATION_UNAVAILABLE'); }
  const post = result?.success ? result.data : null;
  if (!post || post.id !== id || post.status !== 'publish' || new URL(post.link).href !== pin.targetUrl
    || post.title.raw !== review.payload.title || lineEndings(post.content.raw) !== lineEndings(review.payload.body)) {
    throw new Error('WORDPRESS_PUBLICATION_UNVERIFIED');
  }
  const effective = Math.max(utcWordPressTime(post.date_gmt), utcWordPressTime(post.modified_gmt));
  // WordPress reports UTC seconds while the dispatch clock includes milliseconds.
  if (!Number.isFinite(effective) || effective < Math.floor(Date.parse(review.dispatchedAt) / 1000) * 1000 || effective > now.getTime()) {
    throw new Error('WORDPRESS_PUBLICATION_UNVERIFIED');
  }
  const intervention: EditorialIntervention = { reviewId: review.id, pinId: pin.id, revision: reference.revision,
    effectiveAt: new Date(effective).toISOString(), verifiedAt: now.toISOString(), postId: id };
  return changeDecision(who.tenant.id, current => {
    const interventions = current.editorialInterventions ??= [];
    const recorded = interventions.find(item => item.reviewId === review.id);
    if (recorded) return recorded;
    interventions.push(intervention);
    logDecision(current, who.actor, 'editorial-intervention-verified', review.id);
    return intervention;
  });
}

export function readEditorialFollowUps(ctx: HandlerContext, raw: unknown, now = new Date()) {
  const who = decisionPrincipal(ctx), { reviewId } = z.object({ reviewId: z.string().uuid() }).strict().parse(raw);
  const state = readDecision(who.tenant.id);
  const intervention = state.editorialInterventions?.find(item => item.reviewId === reviewId);
  if (!intervention) throw new Error('DECISION_CHANGED');
  const { evidence } = requireEditorialPin(ctx, state, intervention.pinId);
  const { source, brand, cohort } = evidence.ai!;
  const panel = getDataset<Dataset>(who.tenant.id, evidence.sourceScope);
  const followUps = planFollowUps(intervention.effectiveAt, now)!.map(({ label, dueAt }) => {
    if (Date.parse(dueAt) >= utcDayStart(now)) return { label, dueAt, state: 'window_open' };
    if (!panel?.brands.some(item => item.name === brand)) return { label, dueAt, state: 'panel_unavailable' };
    const comparison = readVisibilityComparison(who.tenant.id, { datasetId: panel.id, source, brand, includeHistory: true },
      { now, action: { id: reviewId, completedAt: intervention.effectiveAt, prompt: evidence.query, days: label === 'J+14' ? 14 : 28, cohort } });
    const state = comparison.state === 'insufficient' && !comparison.visibility.sharedCohorts ? 'no_matching_cohort' : comparison.state;
    return { label, dueAt, state, comparison };
  });
  return { intervention, source, brand, followUps };
}

function withReportAccess<T>(action: (service: ReportAccessService) => T): T {
  const secret = process.env.REPORT_ACCESS_SECRET ?? '';
  if (process.env.REPORT_ACCESS_ENABLED !== 'true' || secret.length < 32) throw new ReportAccessError(503, 'private_report_unavailable');
  const service = new ReportAccessService({ dbPath: process.env.REPORT_ACCESS_DB_PATH || 'data/report-access.sqlite3', secret });
  try { return action(service); } finally { service.close(); }
}

export function shareEditorialEvidence(ctx: HandlerContext, raw: unknown) {
  const who = decisionPrincipal(ctx, true);
  const input = pinInput.extend({ reportId: z.string().uuid(), email: z.string().email().max(254),
    includeExcerpt: z.boolean(), citations: z.array(z.number().int().nonnegative().max(99)).max(10) }).strict()
    .refine(value => value.includeExcerpt || value.citations.length > 0).parse(raw);
  const pin = requireEditorialPin(ctx, readDecision(who.tenant.id), input.pinId);
  const { ai, observedAt } = pin.evidence;
  const citations = [...new Set(input.citations)].map(index => ai!.citations[index]);
  if (citations.some(url => !url)) throw new Error('DECISION_EVIDENCE_EXPIRED');
  return withReportAccess(service => {
    service.shareVisibilityEvidence({ id: input.reportId, email: input.email, tenantId: who.tenant.id, pinId: pin.id, page: pin.targetUrl,
      evidence: { source: ai!.source, observedAt, citations, ...(input.includeExcerpt ? { excerpt: ai!.answer.slice(0, 2000) } : {}) } });
    return { ok: true };
  });
}

function revokeEditorialEvidence(ctx: HandlerContext, raw: unknown) {
  const who = decisionPrincipal(ctx, true), { reportId } = z.object({ reportId: z.string().uuid() }).strict().parse(raw);
  return withReportAccess(service => { service.revokeVisibilityEvidence(reportId, who.tenant.id); return { ok: true }; });
}

export const decisionEditorialRoutes: ConsoleRoute[] = [
  { path: '/decision/editorial/brief', needsUrl: false, handler: async ctx => readEditorialBrief(ctx, ctx.body) },
  { path: '/decision/editorial/save', needsUrl: false, adminOnly: true, handler: async ctx => saveEditorialBrief(ctx, ctx.body) },
  { path: '/decision/editorial/verify', needsUrl: false, adminOnly: true, handler: ctx => verifyEditorialIntervention(ctx, ctx.body) },
  { path: '/decision/editorial/follow-ups', needsUrl: false, handler: async ctx => readEditorialFollowUps(ctx, ctx.body) },
  { path: '/decision/editorial/share-evidence', needsUrl: false, adminOnly: true, handler: async ctx => shareEditorialEvidence(ctx, ctx.body) },
  { path: '/decision/editorial/revoke-evidence', needsUrl: false, adminOnly: true, handler: async ctx => revokeEditorialEvidence(ctx, ctx.body) },
];
