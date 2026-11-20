/** Tenant member campaign planning API. Saving a plan never dispatches a connector job. */
import { z } from 'zod';
import type { ConsoleRoute, HandlerContext } from './util.js';
import { listAIAccounts } from './ai-connections.js';
import { readDecision } from './decision-store.js';
import { wpConfigFromEnv } from './content-ops.js';
import { readState as readSocial } from '../social/store.js';
import { capabilities as socialCapabilities } from '../social/provider.js';
import { readState as readLocal } from '../local-seo/store.js';
import { gbpCapability } from '../local-seo/gbp.js';
import { tenantOwnsUrl, type Tenant } from '../tenants/store.js';
import { channels, dateSchema, draftOf, draftSchema, identifier, parseDraft, ScenarioError, validatePlan, type Draft, type Plan } from '../scenarios/model.js';
import * as plans from '../scenarios/service.js';
import { assertEvidenceScope, listAvailableEvidence, resolveDraftEvidence } from '../scenarios/evidence.js';
import { GENERATION_LIMITS, GENERATION_PROVIDERS, generateScenarioDraft, generationInputSchema, scenarioProviderConfig } from '../scenarios/generation.js';

export interface ScenarioPrincipal { tenant: Tenant; actor: string; admin: boolean; label: string; }
export function scenarioPrincipal(ctx: HandlerContext): ScenarioPrincipal {
  const tenant = ctx.tenancy?.tenant, user = ctx.user;
  const membership = tenant && ctx.tenancy?.memberships.find(item => item.id === tenant.id);
  if (!tenant || tenant.status !== 'active' || !user?.sub || !membership || user.preferred_username?.startsWith('service-account-') || user.realm_access?.roles?.includes('ai-agent')) throw new ScenarioError(403, 'SCENARIO_ACCESS', 'A current human workspace membership is required.');
  return { tenant, actor: user.sub, admin: membership.role === 'tenant-admin', label: user.preferred_username || user.sub };
}
function canEdit(who: ScenarioPrincipal, plan: Plan) { return plan.status !== 'archived' && (who.admin || plan.createdBy === who.actor); }
function requireEdit(who: ScenarioPrincipal, plan: Plan): void { if (!canEdit(who, plan)) throw new ScenarioError(403, 'SCENARIO_READ_ONLY', 'Only the author or a workspace administrator can edit this campaign. Archived campaigns can be duplicated.'); }
function canRead(who: ScenarioPrincipal, plan: Plan): boolean { try { assertEvidenceScope(who.tenant, plan); assertLinkedResources(who, plan); return true; } catch (error) { if (error instanceof ScenarioError && error.status === 403) return false; throw error; } }
function scopedPlan(who: ScenarioPrincipal, id: string): Plan {
  const plan = plans.getPlan(who.tenant.id, id);
  if (!canRead(who, plan)) throw new ScenarioError(403, 'SCENARIO_SOURCE_SCOPE', 'This campaign contains a source or linked resource outside your current permissions.');
  return plan;
}
function response(who: ScenarioPrincipal, plan: Plan) { return { plan, canEdit: canEdit(who, plan), canGenerate: who.admin && canEdit(who, plan), issues: validatePlan(plan) }; }
function assertLinkedResources(who: ScenarioPrincipal, draft: { nodes: Array<Pick<Draft['nodes'][number], 'linkedResource'>> }): void {
  for (const node of draft.nodes) {
    const reference = node.linkedResource; if (!reference || reference.type === 'manual') continue;
    if (reference.type === 'social_campaign') {
      const campaign = readSocial(who.tenant.id).campaigns.find(item => item.id === reference.id);
      if (!campaign || !tenantOwnsUrl(who.tenant, campaign.website)) throw new ScenarioError(403, 'SCENARIO_RESOURCE_SCOPE', 'Select a Social campaign from this workspace.');
    } else if (reference.type === 'wordpress_draft') {
      const review = readDecision(who.tenant.id).reviews.find(item => item.id === reference.id && item.kind === 'wordpress');
      if (!who.admin || !review) throw new ScenarioError(403, 'SCENARIO_RESOURCE_SCOPE', 'The WordPress review is not available to this account.');
    } else {
      const local = readLocal(who.tenant.id), action = local.actions.find(item => item.id === reference.id), site = action && local.sites.find(item => item.id === action.siteId);
      if (!site || !tenantOwnsUrl(who.tenant, site.page) || !who.admin && !local.grants[who.actor]?.includes(site.id)) throw new ScenarioError(403, 'SCENARIO_RESOURCE_SCOPE', 'The local action is not available to this account.');
    }
  }
}
function preparedDraft(who: ScenarioPrincipal, raw: unknown, ids: string[] = [], existing?: Draft): Draft {
  const input = draftSchema.parse(raw), resolved = resolveDraftEvidence(who.tenant, who.actor, input, ids, existing);
  assertAssignees(who, resolved, existing);
  assertLinkedResources(who, resolved);
  return parseDraft(resolved);
}
function assertAssignees(who: ScenarioPrincipal, resolved: Draft, existing?: Draft): void {
  for (const node of resolved.nodes) {
    const old = existing?.nodes.find(item => item.id === node.id);
    if (node.assigneeId && node.assigneeId !== who.actor && node.assigneeId !== old?.assigneeId) throw new ScenarioError(403, 'SCENARIO_ASSIGNEE_SCOPE', 'Assign yourself or use a responsible role label. Other user identities require a verified workspace directory.');
  }
}
const idInput = z.object({ id: identifier }).strict();
const versioned = z.object({ id: identifier, version: z.number().int().positive() });
const evidenceIds = z.array(identifier).max(100).optional();
const destinations: Record<typeof channels[number], string | null> = {
  seo: '#audit', geo: '#geo', content: '#ops/articles', local: '#local_seo/network', social: '#social/campaigns', email: '#crm', paid: null, analytics: '#ga4', coordination: '#ops',
};
export function scenarioCapabilities(ctx: HandlerContext) {
  const who = scenarioPrincipal(ctx), social = socialCapabilities(who.tenant.id), local = gbpCapability(who.tenant.id);
  const providers = GENERATION_PROVIDERS.map(id => {
    try {
      const config = scenarioProviderConfig(who.tenant.id, id), accounts = who.admin ? listAIAccounts(who.tenant.id, id).map(account => ({ id: account.id, label: account.label })) : [];
      return { id, label: config.label, model: config.model, configured: accounts.length > 0, accounts, available: who.admin && accounts.length > 0 };
    } catch {
      return { id, label: id === 'grok' ? 'Grok · xAI' : id, model: '', configured: false, accounts: [], available: false, reason: 'configuration-unavailable' };
    }
  });
  return { actor: who.actor, admin: who.admin, canCreate: true, canGenerate: who.admin, members: [{ id: who.actor, label: who.label }], providers, limits: GENERATION_LIMITS,
    channels: channels.map(id => ({ id, destination: destinations[id], mode: id === 'paid' || id === 'email' ? 'planning-only' : 'native-handoff', planningOnly: true,
      connected: id === 'social' ? social.postiz && social.accounts.length > 0 : id === 'local' ? local.state === 'configured' : id === 'content' ? Boolean(wpConfigFromEnv(who.tenant.id)) : id === 'analytics' ? Boolean(who.tenant.ga4Properties?.length) : null,
    })),
  };
}
export const scenarioRoutes: ConsoleRoute[] = [
  { path: '/scenarios/capabilities', needsUrl: false, handler: async ctx => { z.object({}).strict().parse(ctx.body); return scenarioCapabilities(ctx); } },
  { path: '/scenarios/evidence', needsUrl: false, handler: async ctx => { z.object({}).strict().parse(ctx.body); return listAvailableEvidence(scenarioPrincipal(ctx).tenant); } },
  { path: '/scenarios/list', needsUrl: false, handler: async ctx => {
    const input = z.object({ offset: z.number().int().min(0).max(500).optional(), limit: z.number().int().min(1).max(50).optional() }).strict().parse(ctx.body), who = scenarioPrincipal(ctx);
    const page = plans.listPlanSummaries(who.tenant.id, input);
    return { plans: page.plans.flatMap(plan => {
      try {
        assertEvidenceScope(who.tenant, { evidence: plan.scope.evidence });
        assertLinkedResources(who, { nodes: plan.scope.linkedResources.map(linkedResource => ({ linkedResource })) });
        const { scope: _scope, ...summary } = plan;
        const editable = plan.status !== 'archived' && (who.admin || plan.createdBy === who.actor);
        return [{ ...summary, canEdit: editable, canGenerate: who.admin && editable }];
      } catch (error) { if (error instanceof ScenarioError && error.status === 403) return []; throw error; }
    }), nextOffset: page.nextOffset };

  } },
  { path: '/scenarios/get', needsUrl: false, handler: async ctx => { const who = scenarioPrincipal(ctx), input = idInput.parse(ctx.body); return response(who, scopedPlan(who, input.id)); } },
  { path: '/scenarios/create', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = z.object({ draft: z.unknown(), evidenceIds }).strict().parse(ctx.body);
    return response(who, plans.createPlan(who.tenant.id, who.actor, preparedDraft(who, input.draft, input.evidenceIds)));
  } },
  { path: '/scenarios/update-draft', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = versioned.extend({ draft: z.unknown(), evidenceIds }).strict().parse(ctx.body), before = scopedPlan(who, input.id); requireEdit(who, before);
    return response(who, plans.updatePlan(who.tenant.id, who.actor, input.id, input.version, preparedDraft(who, input.draft, input.evidenceIds, before)));
  } },
  { path: '/scenarios/duplicate', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = idInput.extend({ name: z.string().trim().min(1).max(200).optional() }).strict().parse(ctx.body); scopedPlan(who, input.id);
    return response(who, plans.clonePlan(who.tenant.id, who.actor, input.id, input.name));
  } },
  { path: '/scenarios/archive', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = versioned.strict().parse(ctx.body), before = scopedPlan(who, input.id); requireEdit(who, before);
    return response(who, plans.archivePlan(who.tenant.id, who.actor, input.id, input.version));
  } },
  { path: '/scenarios/history', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = idInput.extend({ version: z.number().int().positive().optional() }).strict().parse(ctx.body); scopedPlan(who, input.id);
    if (input.version) { const plan = plans.getRevision(who.tenant.id, input.id, input.version); if (!canRead(who, plan)) throw new ScenarioError(403, 'SCENARIO_SOURCE_SCOPE'); return { plan }; }
    return { revisions: plans.listRevisions(who.tenant.id, input.id) };
  } },
  { path: '/scenarios/revision', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = versioned.strict().parse(ctx.body); scopedPlan(who, input.id);
    const plan = plans.getRevision(who.tenant.id, input.id, input.version); if (!canRead(who, plan)) throw new ScenarioError(403, 'SCENARIO_SOURCE_SCOPE'); return { plan };
  } },
  { path: '/scenarios/comments', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = idInput.parse(ctx.body); scopedPlan(who, input.id);
    return { comments: plans.listComments(who.tenant.id, input.id) };
  } },
  { path: '/scenarios/add-comment', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = idInput.extend({ body: z.string().trim().min(1).max(4000), nodeId: identifier.optional() }).strict().parse(ctx.body), plan = scopedPlan(who, input.id);
    if (plan.status === 'archived') throw new ScenarioError(409, 'SCENARIO_ARCHIVED', 'Archived campaigns are read only.');
    const comment = plans.addComment(who.tenant.id, who.actor, input.id, { body: input.body, ...(input.nodeId ? { nodeId: input.nodeId } : {}) });
    return { comment, comments: plans.listComments(who.tenant.id, input.id) };
  } },
  { path: '/scenarios/validate', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = z.object({ draft: z.unknown(), id: identifier.optional(), evidenceIds }).strict().parse(ctx.body);
    const existing = input.id ? scopedPlan(who, input.id) : undefined;
    const draft = resolveDraftEvidence(who.tenant, who.actor, draftSchema.parse(input.draft), input.evidenceIds, existing); assertLinkedResources(who, draft);
    return { issues: validatePlan(draft) };
  } },
  { path: '/scenarios/generate-preview', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = versioned.merge(generationInputSchema).strict().parse(ctx.body), before = scopedPlan(who, input.id); requireEdit(who, before);
    if (before.version !== input.version) throw new ScenarioError(409, 'SCENARIO_CHANGED', 'Reload the current campaign before generating a proposal.');
    if (input.mode === 'ai' && !who.admin) throw new ScenarioError(403, 'SCENARIO_AI_ACCESS', 'Only workspace administrators may use the shared metered AI account.');
    if (input.evidenceIds?.some(id => !before.evidence.some(item => item.id === id))) throw new ScenarioError(409, 'SCENARIO_EVIDENCE_UNSAVED', 'Save selected evidence in the campaign before generating.');
    const { id: _id, version: _version, ...request } = input;
    const result = await generateScenarioDraft(who.tenant.id, draftOf(before), request);
    const proposal = plans.createProposal(who.tenant.id, who.actor, before.id, input.version, result.draft, { kind: result.kind, provider: result.provider, summary: result.summary, nodeIds: result.nodeIds });
    return { proposal };
  } },
  { path: '/scenarios/preview-revision', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = versioned.extend({ draft: z.unknown().optional(), targetVersion: z.number().int().positive().optional(), nodeIds: z.array(identifier).max(300).optional() }).strict().parse(ctx.body), before = scopedPlan(who, input.id); requireEdit(who, before);
    if ((input.draft === undefined) === (input.targetVersion === undefined)) throw new ScenarioError(400, 'SCENARIO_REVISION', 'Choose one draft or one historical version.');
    let raw = input.draft;
    if (input.targetVersion !== undefined) {
      const previous = plans.getRevision(who.tenant.id, input.id, input.targetVersion);
      if (!canRead(who, previous)) throw new ScenarioError(403, 'SCENARIO_SOURCE_SCOPE');
      raw = { ...draftOf(previous), status: before.status, evidence: before.evidence };
    }
    const draft = preparedDraft(who, raw, [], before);
    return { proposal: plans.createProposal(who.tenant.id, who.actor, input.id, input.version, draft, { kind: 'revision', nodeIds: input.nodeIds, summary: input.targetVersion ? `Restore version ${input.targetVersion}; retain all evidence snapshots.` : 'Manual revision preview' }) };
  } },
  { path: '/scenarios/accept-revision', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = versioned.extend({ proposalId: identifier }).strict().parse(ctx.body), before = scopedPlan(who, input.id); requireEdit(who, before);
    const proposal = plans.getProposal(who.tenant.id, input.id, input.proposalId); assertEvidenceScope(who.tenant, proposal.draft); assertLinkedResources(who, proposal.draft); assertAssignees(who, proposal.draft, before);
    return response(who, plans.acceptProposal(who.tenant.id, who.actor, input.id, input.proposalId, input.version));
  } },
  { path: '/scenarios/reschedule-preview', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = versioned.extend({ nodeId: identifier, startDate: dateSchema }).strict().parse(ctx.body), before = scopedPlan(who, input.id); requireEdit(who, before);
    const draft = plans.previewReschedule(draftOf(before), input.nodeId, input.startDate);
    return { proposal: plans.createProposal(who.tenant.id, who.actor, input.id, input.version, draft, { kind: 'reschedule', summary: before.language === 'fr' ? 'Décalage des dates et des dépendances concernées.' : 'Shift dates and affected dependencies.' }) };
  } },
  { path: '/scenarios/export', needsUrl: false, handler: async ctx => {
    const who = scenarioPrincipal(ctx), input = idInput.extend({ format: z.enum(['json', 'csv', 'markdown']).default('json') }).strict().parse(ctx.body), plan = scopedPlan(who, input.id), exported = plans.exportPlan(plan, input.format);
    return { ...exported, mime: exported.mimeType };
  } },
];
