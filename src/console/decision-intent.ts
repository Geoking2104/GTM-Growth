import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { searchQueryPages, bingPerformance } from './analytics.js';
import { latestDataset } from './ai-visibility-store.js';
import type { Dataset } from './ai-visibility.js';
import { decisionPrincipal, fingerprint, ownedPage } from './decision-context.js';
import { changeDecision, readDecision, logDecision, type IntentEvidence } from './decision-store.js';
import type { ConsoleRoute, HandlerContext } from './util.js';
export const stages = ['unaware','problem-aware','solution-aware','product-aware','most-aware'] as const;
const evidenceInput = z.object({ property: z.string().max(2048).optional(), bingSite: z.string().max(2048).optional(), days: z.number().int().min(7).max(90).default(28) }).strict();
const number = (n: unknown): number | null => n !== null && n !== undefined && Number.isFinite(Number(n)) ? Number(n) : null;
const engines = { gsc: searchQueryPages, bing: bingPerformance, ai: latestDataset<Dataset> };
export async function readIntentEvidence(ctx: HandlerContext, raw: unknown, io = engines) {
  const who = decisionPrincipal(ctx), input = evidenceInput.parse(raw);
  const property = input.property ?? who.tenant.gscProperties[0], bingSite = input.bingSite ?? who.tenant.bingSites?.[0];
  if (property && !who.tenant.gscProperties.includes(property)) throw new Error('DECISION_PROPERTY_SCOPE');
  if (bingSite && !who.tenant.bingSites?.includes(bingSite)) throw new Error('DECISION_PROPERTY_SCOPE');
  const result = await Promise.allSettled([property ? io.gsc({ property, days: input.days, rowLimit: 180 }) : Promise.resolve(null), bingSite ? io.bing({ bingSite, days: input.days, rowLimit: 180 }, who.tenant) : Promise.resolve(null), Promise.resolve().then(() => io.ai(who.tenant.id))]);
  const evidence: IntentEvidence[] = [], sources: Array<{ source: string; status: string }> = [], at = new Date().toISOString();
  for (const [index, source] of (['gsc','bing','ai'] as const).entries()) {
    const r = result[index], data: any = r.status === 'fulfilled' ? r.value : null;
    const status = r.status === 'rejected' || data?.problem ? 'unavailable' : !data ? 'not-configured' : 'available'; sources.push({ source, status });
    if (status !== 'available') continue;
    if (source === 'ai') {
      for (const row of data.observations.slice(-100)) {
        const mentions = row.mentions.filter((m: any) => m.status !== 'rejected').map((m: any) => `${m.brand} (${m.status || 'unreviewed'})`).join(' · ');
        evidence.push({ id: fingerprint([source, data.id, row.id]), source, sourceScope: data.id, query: row.prompt.slice(0, 2000), page: null, clicks: null, impressions: null, ctr: null, position: null, observedAt: row.observedAt, period: row.observedAt.slice(0,10), detail: `${row.source} · ${mentions}\n${row.answer.slice(0,2000)}` });
      }
    } else {
      const period = `${data.period.start} → ${data.period.end}`, sourceScope = (source === 'gsc' ? property : bingSite)!;
      for (const row of (source === 'gsc' ? data.rows : data.queries).slice(0, 180)) {
        if (!row.query) continue;
        let page = row.page || null;
        if (page) { try { page = ownedPage(ctx, page); } catch { continue; } }
        evidence.push({ id: fingerprint([source, sourceScope, row.query, page, period]), source, sourceScope, query: String(row.query).slice(0,2000), page, clicks: number(row.clicks), impressions: number(row.impressions), ctr: number(row.ctr), position: number(row.position), period, observedAt: at });
      }
    }
  }
  // Persist only retrieved observations. Pin commands reference these immutable IDs.
  const version = changeDecision(who.tenant.id, s => {
    const byId = new Map([...s.evidence, ...evidence].map(e => [e.id, e])); s.evidence = [...byId.values()].slice(-500); return s.version + 1;
  });
  return { evidence, sources, at, version };
}
export function intentState(ctx: HandlerContext) {
  const who = decisionPrincipal(ctx), state = readDecision(who.tenant.id);
  return { version: state.version, pins: state.pins.filter(p => { try { ownedPage(ctx, p.targetUrl); return p.evidence.source === 'gsc' ? who.tenant.gscProperties.includes(p.evidence.sourceScope) : p.evidence.source === 'bing' ? !!who.tenant.bingSites?.includes(p.evidence.sourceScope) : true; } catch { return false; } }) };
}
export function pinIntent(ctx: HandlerContext, raw: unknown) {
  const who = decisionPrincipal(ctx, true), i = z.object({ evidenceId: z.string().length(64), stage: z.enum(stages), targetUrl: z.string().url(), version: z.number().int().nonnegative() }).strict().parse(raw);
  i.targetUrl = ownedPage(ctx, i.targetUrl);
  return changeDecision(who.tenant.id, s => {
    if (s.version !== i.version) throw new Error('DECISION_CHANGED');
    const evidence = s.evidence.find(e => e.id === i.evidenceId); if (!evidence) throw new Error('DECISION_EVIDENCE_EXPIRED');
    if (evidence.source === 'gsc' && !who.tenant.gscProperties.includes(evidence.sourceScope) || evidence.source === 'bing' && !who.tenant.bingSites?.includes(evidence.sourceScope)) throw new Error('DECISION_PROPERTY_SCOPE');
    if (!s.pins.some(p => p.evidence.id === evidence.id && p.stage === i.stage && p.targetUrl === i.targetUrl)) {
      const pin = { id: randomUUID(), stage: i.stage, targetUrl: i.targetUrl, evidence, actor: who.actor, at: new Date().toISOString() }; s.pins.push(pin); logDecision(s, who.actor, 'intent-pinned', pin.id);
    }
    return { pins: s.pins, version: s.version + 1 };
  });
}
export const decisionIntentRoutes: ConsoleRoute[] = [
  { path: '/decision/intent', needsUrl: false, handler: async ctx => intentState(ctx) },
  { path: '/decision/intent/evidence', needsUrl: false, handler: ctx => readIntentEvidence(ctx, ctx.body) },
  { path: '/decision/intent/pin', needsUrl: false, adminOnly: true, handler: async ctx => pinIntent(ctx, ctx.body) },
  { path: '/decision/intent/remove', needsUrl: false, adminOnly: true, handler: async ctx => {
    const who = decisionPrincipal(ctx, true), i = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() }).strict().parse(ctx.body);
    return changeDecision(who.tenant.id, s => { if (s.version !== i.version || !s.pins.some(p => p.id === i.id)) throw new Error('DECISION_CHANGED'); s.pins = s.pins.filter(p => p.id !== i.id); logDecision(s, who.actor, 'intent-removed', i.id); return { pins: s.pins, version: s.version + 1 }; });
  } },
];
