import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TenantAccessError } from '../tenants/context.js';
import { socialRoutes } from './social.js';
import { localSeoRoutes } from './local-seo.js';
import { crmPrincipal } from './crm.js';
import { access as crmAccess, contact, keyForInput, bind, linkEvent } from '../crm/service.js';
import { getConnection } from '../ecommerce/store.js';
import { tenantOwnsUrl } from '../tenants/store.js';
import { idempotent } from '../crm/store.js';
import { identityInput, proofInput, assertProof } from '../crm/model.js';
import { gtmInventory, gtmWrite, gtmPublish } from './gtm-console.js';
import { createApplyPreviewRoutes } from './apply-routes.js';
import { qualityGates, publishToWordPress, wpConfigFromEnv } from './content-ops.js';
import { changeDecision, readDecision, logDecision, type Review } from './decision-store.js';
import { decisionPrincipal, fingerprint, ownedMeasurement, ownedPage } from './decision-context.js';
import { draftSchema, editorialReference, requireEditorialPin } from './decision-editorial.js';
import type { HandlerContext, ConsoleRoute } from './util.js';

const kinds = ['wordpress', 'diff', 'gtm', 'gtm-publish', 'crm-identity', 'crm-event'] as const;
const gtmSchema = z.object({ container: z.string(), workspace: z.string().optional(), path: z.string().optional(), kind: z.enum(['tags','triggers','variables']).optional(),
  op: z.enum(['create-workspace','delete-workspace','create','update','delete','create-version']), resource: z.union([z.string().max(50000),z.record(z.unknown())]).optional(), name: z.string().max(200).optional(), description: z.string().max(1000).optional(), notes: z.string().max(2000).optional() }).strict();
const proposalInput = z.object({ kind: z.enum(kinds), origin: z.string().max(500).default(''), payload: z.unknown(), editorial: editorialReference.optional() }).strict();
const nativeRoutes = [...socialRoutes, ...localSeoRoutes];
export const nativeCall = async (ctx: HandlerContext, route: string, body: Record<string, unknown> = {}) => {
  const definition = nativeRoutes.find(r => r.path === route); if (!definition) throw new Error('DECISION_ROUTE');
  return definition.handler({ ...ctx, body });
};
const baseline = (d: any) => fingerprint([d.revision, d.coverage, d.container, d.workspace, d.tags, d.triggers, d.variables, d.clients, d.live, d.pendingChanges]);
const dependencies = { inventory: gtmInventory, write: gtmWrite, publish: gtmPublish, wordpress: publishToWordPress,
  preview: (ctx: HandlerContext) => createApplyPreviewRoutes()[0].handler(ctx), native: nativeCall };
export async function proposeReview(ctx: HandlerContext, raw: unknown, io = dependencies) {
  const who = decisionPrincipal(ctx, true), input = proposalInput.parse(raw);
  if (input.editorial && input.kind !== 'wordpress') throw new Error('DECISION_CHANGED');
  let payload: any, title = '', target = '', before: string | undefined;
  if (input.kind === 'wordpress') {
    if (!input.editorial) {
      payload = draftSchema.parse(input.payload); payload.gates = qualityGates(payload);
      title = payload.title;
    }
    target = wpConfigFromEnv(who.tenant.id)?.siteUrl || 'WordPress';
  } else if (input.kind === 'diff') {
    const p = z.object({ url: z.string().url() }).strict().parse(input.payload); ownedPage(ctx, p.url);
    payload = await io.preview({ ...ctx, body: { url: p.url, fix: 'robots-ai', mode: 'dry-run' } });
    title = 'robots.txt · preview'; target = p.url;
  } else if (input.kind === 'gtm' || input.kind === 'gtm-publish') {
    payload = input.kind === 'gtm' ? gtmSchema.parse(input.payload) : z.object({ container: z.string(), version: z.string().regex(/^\d+$/) }).strict().parse(input.payload);
    ownedMeasurement(ctx, payload.container, undefined, payload.workspace);
    if (payload.path && (!payload.path.startsWith(payload.container + '/workspaces/') || !/^accounts\/\d+\/containers\/\d+\/workspaces\/\d+(\/(tags|triggers|variables)\/\d+)?$/.test(payload.path))) throw new TenantAccessError('DECISION_CONTAINER_SCOPE');
    if (payload.path && ['update','delete'].includes(payload.op)) {
      const resourceWorkspace = payload.path.split('/').slice(0,6).join('/');
      if (payload.workspace && payload.workspace !== resourceWorkspace) throw new TenantAccessError('DECISION_WORKSPACE_SCOPE');
      payload.workspace = resourceWorkspace;
    }
    if (payload.resource) {
      const resource = typeof payload.resource === 'string' ? JSON.parse(payload.resource) : payload.resource;
      if (resource.path && resource.path !== payload.path) throw new TenantAccessError('DECISION_CONTAINER_SCOPE');
    }
    const inventory: any = await io.inventory(payload, who.tenant); if (inventory.problem || !inventory.coverage?.versions || !inventory.coverage?.status || !inventory.coverage?.live || !inventory.coverage?.clients) throw new Error('GTM_INVENTORY_UNAVAILABLE');
    if (input.kind === 'gtm') {
      const preview: any = await io.write({ ...payload, dryRun: true }, who.tenant); if (!preview.dryRun) throw new Error('GTM_PREVIEW_INVALID');
      if (['create','update','delete'].includes(payload.op) && !payload.kind) throw new Error('GTM_KIND_REQUIRED');
      if (['create','delete-workspace','create-version'].includes(payload.op) && !payload.workspace) throw new Error('GTM_WORKSPACE_REQUIRED');
      if (['update','delete'].includes(payload.op) && (!payload.path || !payload.path.includes('/' + payload.kind + '/'))) throw new Error('GTM_RESOURCE_REQUIRED');
    } else {
      if (!inventory.versions?.some((v: any) => v.id === payload.version && !v.deleted)) throw new Error('GTM_VERSION_UNAVAILABLE');
      payload.publicId = inventory.container.publicId;
    }
    before = baseline(inventory); target = payload.container; title = input.kind === 'gtm' ? `${payload.op} · ${payload.kind || 'workspace'}` : `Publish GTM ${payload.version}`;
  } else {
    const p = crmPrincipal(ctx); crmAccess(p, true, true);
    if (input.kind === 'crm-identity') {
      const i = z.object({ profileId: z.string().uuid(), identity: identityInput, proof: proofInput }).strict().parse(input.payload);
      contact(p.tenant.id, i.profileId); assertProof(i.identity.kind, i.proof);
      payload = { profileId: i.profileId, identityKey: keyForInput(p.tenant, i.identity), kind: i.identity.kind, scope: i.identity.scope, proof: i.proof };
    } else {
      payload = z.object({ profileId: z.string().uuid(), eventId: z.string().uuid(), proof: proofInput }).strict().parse(input.payload);
      contact(p.tenant.id, payload.profileId);
    }
    target = payload.profileId; title = input.kind === 'crm-event' ? 'Link observed event' : 'Link verified identity';
  }
  const previewExpiry = input.kind === 'diff' ? payload.preview?.expiresAt : undefined;
  const at = new Date().toISOString();
  return changeDecision(who.tenant.id, s => {
    let origin = input.origin;
    if (input.editorial) {
      const { pinId, revision } = input.editorial;
      const pin = requireEditorialPin(ctx, s, pinId);
      const brief = s.editorialBriefs?.find(item => item.pinId === pinId);
      if (!brief || brief.revision !== revision) throw new Error('DECISION_CHANGED');
      if (target === 'WordPress') throw new Error('WORDPRESS_NOT_CONFIGURED');
      if (new URL(target).origin !== new URL(pin.targetUrl).origin) throw new TenantAccessError('DECISION_PAGE_SCOPE');
      const previous = s.reviews.find(item => item.kind === 'wordpress' && item.payload.editorial?.pinId === pinId && item.payload.editorial.revision === revision
        && item.status !== 'rejected' && (!['proposed', 'approved'].includes(item.status) || Date.parse(item.expiresAt) > Date.now()));
      if (previous) return previous;
      payload = { ...brief.draft, gates: qualityGates(brief.draft), editorial: { pinId, revision, url: pin.targetUrl } };
      title = brief.draft.title;
      origin = `AI · ${pin.targetUrl} · v${revision}`;
    }
    if (JSON.stringify(payload).length > 150000) throw new Error('DECISION_CAPACITY');
    const digest = fingerprint([input.kind, target, payload, before]);
    const prior = s.reviews.find(r => r.author === who.actor && r.digest === digest && ['proposed','approved'].includes(r.status) && Date.parse(r.expiresAt) > Date.now()); if (prior) return prior;
    const review: Review = { id: randomUUID(), kind: input.kind, title, target, origin, payload, baseline: before, author: who.actor, createdAt: at,
      expiresAt: previewExpiry || new Date(Date.now() + 7 * 86400000).toISOString(), digest, status: 'proposed' };
    s.reviews.push(review); logDecision(s, who.actor, 'review-proposed', review.id); return review;
  });
}
export interface InboxRow { id: string; source: string; type: string; title: string; target: string; origin: string; author: string; at: string; status: string; digest: string; expiresAt?: string; canApprove: boolean; canExecute: boolean; reason: string; details: unknown; href: string; }
export async function unifiedInbox(ctx: HandlerContext, io = dependencies) {
  const who = decisionPrincipal(ctx), results = await Promise.allSettled([io.native(ctx, '/social/state'), io.native(ctx, '/local-seo/state')]);
  const rows: InboxRow[] = [], sources = results.map((r, i) => ({ source: i ? 'gbp' : 'social', status: r.status === 'fulfilled' ? 'available' : 'unavailable' }));
  if (results[0].status === 'fulfilled') {
    const d: any = results[0].value;
    for (const a of d.approvals || []) {
      const expired = Date.parse(a.expiresAt) <= Date.now(), own = a.requestedBy === who.actor;
      rows.push({ id: a.id, source: 'social', type: a.type, title: a.type, target: a.entityId, origin: `Social ${a.entityId}`, author: a.requestedBy, at: a.requestedAt, status: expired && ['PENDING','APPROVED'].includes(a.status) ? 'EXPIRED' : a.status, digest: a.digest, expiresAt: a.expiresAt,
        canApprove: who.admin && !own && !expired && a.status === 'PENDING', canExecute: false, reason: own ? 'independent-approver' : !who.admin ? 'admin-required' : expired ? 'expired' : 'native-publication', details: a.context, href: '#social/approvals' });
    }
  }
  if (results[1].status === 'fulfilled') {
    const d: any = results[1].value;
    for (const p of d.publications || []) rows.push({ id: p.id, source: 'gbp', type: 'GBP', title: p.change.field, target: d.sites?.find((s: any) => s.id === p.siteId)?.name || p.siteId, origin: p.siteId, author: p.author, at: p.createdAt, status: p.status, digest: p.digest, expiresAt: p.approval?.expiresAt,
      canApprove: who.admin && p.author !== who.actor && p.status === 'draft', canExecute: false, reason: p.author === who.actor ? 'independent-approver' : !who.admin ? 'admin-required' : 'native-publication', details: { before: p.before, after: p.change.value, field: p.change.field, approval: p.approval }, href: '#local_seo/network' });
  }
  for (const r of readDecision(who.tenant.id).reviews.filter(r => who.admin || (r.author === who.actor && !r.kind.startsWith('crm')))) {
    const expired = Date.parse(r.expiresAt) <= Date.now(), blocked = r.kind === 'wordpress' && r.payload.gates.some((g: any) => !g.passed);
    rows.push({ id: r.id, source: 'decision', type: r.kind, title: r.title, target: r.target, origin: r.origin, author: r.author, at: r.createdAt,
      status: expired && ['proposed','approved'].includes(r.status) ? 'expired' : r.status, digest: r.digest, expiresAt: r.expiresAt,
      canApprove: who.admin && !expired && !blocked && r.status === 'proposed', canExecute: who.admin && r.status === 'approved' && !expired && r.kind !== 'diff', reason: !who.admin ? 'admin-required' : expired ? 'expired' : blocked ? 'quality-gates' : r.kind === 'diff' ? 'preview-only' : 'explicit-execution', details: { ...r.payload, result: r.result, error: r.error },
      href: r.kind.startsWith('gtm') ? '#gtm' : r.kind.startsWith('crm') ? '#crm' : r.kind === 'diff' ? '#apply_mode'
        : r.payload.editorial ? `#ops/articles/${r.payload.editorial.pinId}` : '#ops/articles' });
  }
  rows.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  return { rows, sources, partial: sources.some(s => s.status !== 'available'), pending: rows.filter(r => ['PENDING','draft','proposed'].includes(r.status)).length, at: new Date().toISOString() };
}
const decisionInput = z.object({ source: z.enum(['social','gbp','decision']), id: z.string().max(100), digest: z.string().length(64), decision: z.enum(['approve','reject']), comment: z.string().trim().min(1).max(2000), confirmed: z.literal(true) }).strict();
export async function decideReview(ctx: HandlerContext, raw: unknown, io = dependencies) {
  const who = decisionPrincipal(ctx, true), i = decisionInput.parse(raw);
  if (i.source === 'social') {
    const state: any = await io.native(ctx, '/social/state'), row = state.approvals?.find((a: any) => a.id === i.id);
    if (!row || row.digest !== i.digest || row.status !== 'PENDING' || Date.parse(row.expiresAt) <= Date.now() || row.requestedBy === who.actor) throw new Error('DECISION_CHANGED');
    return io.native(ctx, '/social/approval/decide', { key: `inbox-${randomUUID()}`, input: { id: i.id, digest: i.digest, decision: i.decision === 'approve' ? 'APPROVE' : 'REJECT', comment: i.comment } });
  }
  if (i.source === 'gbp') {
    const state: any = await io.native(ctx, '/local-seo/state'); const row = state.publications?.find((p: any) => p.id === i.id);
    if (!row || row.digest !== i.digest) throw new Error('DECISION_CHANGED');
    return io.native(ctx, i.decision === 'approve' ? '/local-seo/publication/approve' : '/local-seo/publication/cancel', { id: i.id, digest: i.digest });
  }
  return changeDecision(who.tenant.id, s => {
    const r = s.reviews.find(r => r.id === i.id);
    if (!r || r.status !== 'proposed' || r.digest !== i.digest || Date.parse(r.expiresAt) <= Date.now()) throw new Error('DECISION_CHANGED');
    if (r.payload.editorial) requireEditorialPin(ctx, s, r.payload.editorial.pinId);
    if (i.decision === 'approve' && r.kind === 'wordpress' && qualityGates(r.payload).some(g => !g.passed)) throw new Error('DECISION_QUALITY_GATES');
    r.status = i.decision === 'approve' ? 'approved' : 'rejected'; r.approval = { actor: who.actor, at: new Date().toISOString(), comment: i.comment };
    logDecision(s, who.actor, 'review-' + r.status, r.id); return r;
  });
}
export async function executeReview(ctx: HandlerContext, raw: unknown, io = dependencies) {
  const who = decisionPrincipal(ctx, true), i = z.object({ id: z.string().uuid(), digest: z.string().length(64), confirmed: z.literal(true), confirm: z.string().max(100).optional() }).strict().parse(raw);
  const state = readDecision(who.tenant.id);
  const review = state.reviews.find(r => r.id === i.id);
  if (!review || review.status !== 'approved' || review.digest !== i.digest || Date.parse(review.expiresAt) <= Date.now() || review.kind === 'diff') throw new Error('DECISION_CHANGED');
  if (review.kind.startsWith('gtm')) {
    ownedMeasurement(ctx, review.payload.container, undefined, review.payload.workspace);
    const current: any = await io.inventory(review.payload, who.tenant);
    if (current.problem || baseline(current) !== review.baseline) throw new Error('DECISION_CHANGED');
    if (review.kind === 'gtm-publish' && i.confirm !== review.payload.publicId) throw new Error('GTM_CONFIRM_PUBLIC_ID');
  }
  if (review.kind === 'wordpress') {
    if (review.payload.editorial) requireEditorialPin(ctx, state, review.payload.editorial.pinId);
    if (qualityGates(review.payload).some(g => !g.passed)) throw new Error('DECISION_QUALITY_GATES');
    const config = wpConfigFromEnv(who.tenant.id);
    if (!config) throw new Error('WORDPRESS_NOT_CONFIGURED');
    if (config.siteUrl !== review.target) throw new Error('DECISION_CHANGED');
  }
  if (review.kind.startsWith('crm')) { const p = crmPrincipal(ctx); crmAccess(p, true, true); contact(p.tenant.id, review.payload.profileId); }
  if (review.kind === 'crm-identity') {
    const v = review.payload;
    assertProof(v.kind, v.proof);
    if (['web_user','web_session'].includes(v.kind) && !tenantOwnsUrl(who.tenant, 'https://' + v.scope)) throw new Error('CRM_SOURCE_SCOPE');
    if (['shopify_customer','prestashop_customer'].includes(v.kind) && getConnection(who.tenant.id, v.scope)?.provider !== (v.kind === 'shopify_customer' ? 'shopify' : 'prestashop')) throw new Error('CRM_SOURCE_SCOPE');
  }
  // Reserve before any external write. Ambiguous dispatches are never retried automatically.
  changeDecision(who.tenant.id, s => { const r = s.reviews.find(r => r.id === i.id)!; if (r.status !== 'approved' || r.digest !== i.digest || Date.parse(r.expiresAt) <= Date.now()) throw new Error('DECISION_CHANGED'); r.status = 'executing'; r.dispatchedAt = new Date().toISOString(); logDecision(s, who.actor, 'review-dispatched', r.id); });
  try {
    let result: any;
    if (review.kind === 'wordpress') {
      const response = await io.wordpress(wpConfigFromEnv(who.tenant.id)!, review.payload); if (!response.ok) throw new Error('WORDPRESS_UNCERTAIN');
      result = { postId: response.postId, postUrl: response.link, publicationStatus: 'draft', published: false };
    } else if (review.kind === 'gtm') {
      result = await io.write({ ...review.payload, dryRun: false }, who.tenant); if (result.problem || !result.done || result.done.compilerError) throw new Error('GTM_WRITE_UNCERTAIN');
    } else if (review.kind === 'gtm-publish') {
      result = await io.publish({ container: review.payload.container, version: review.payload.version, confirm: i.confirm }, who.tenant); if (!result.published || result.compilerError) throw new Error('GTM_PUBLISH_UNCERTAIN');
    } else {
      const p = crmPrincipal(ctx), v = review.payload;
      result = review.kind === 'crm-event' ? linkEvent(p, 'inbox-' + review.id, v) : idempotent(p.tenant.id, p.actor, 'inbox-' + review.id, v,
        () => ({ bindingId: bind(p.tenant.id, v.profileId, v.identityKey, v.kind, v.scope, v.proof, p.actor, 'human_declared').id }));
    }
    return changeDecision(who.tenant.id, s => { const r = s.reviews.find(r => r.id === i.id)!; r.status = 'completed'; r.result = result; logDecision(s, who.actor, 'review-completed', r.id); return r; });
  } catch {
    return changeDecision(who.tenant.id, s => { const r = s.reviews.find(r => r.id === i.id)!; r.status = 'uncertain'; r.error = 'Check the native destination before preparing another action.'; logDecision(s, who.actor, 'review-uncertain', r.id); return r; });
  }
}
export const decisionInboxRoutes: ConsoleRoute[] = [
  { path: '/decision/inbox', needsUrl: false, handler: ctx => unifiedInbox(ctx) },
  { path: '/decision/propose', needsUrl: false, adminOnly: true, handler: ctx => proposeReview(ctx, ctx.body) },
  { path: '/decision/decide', needsUrl: false, adminOnly: true, handler: ctx => decideReview(ctx, ctx.body) },
  { path: '/decision/execute', needsUrl: false, adminOnly: true, handler: ctx => executeReview(ctx, ctx.body) },
];
