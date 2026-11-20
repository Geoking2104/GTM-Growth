/** Evidence adapters only read already-authorised observations; they never fetch a supplied URL. */
import { createHash } from 'node:crypto';
import { readDecision } from '../console/decision-store.js';
import { tenantOwnsUrl, tenantOwnsGtmContainer, tenantOwnsGa4, type Tenant } from '../tenants/store.js';
import { evidenceSchema, ScenarioError, type Draft, type Evidence } from './model.js';
import { listScenarioEvidence, storeScenarioEvidence } from './store.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit) : '';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function safeUrl(tenant: Tenant, value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && tenantOwnsUrl(tenant, url.href); } catch { return false; }
}

/** Called only by the server after a successful /overview audit, never a public write route. */
export function captureOverviewEvidence(tenantId: string, raw: unknown): void {
  const report = object(raw), geo = object(report.geo);
  if (typeof report.url !== 'string' || !Array.isArray(geo.recommendations)) return;
  const at = clean(report.generatedAt, 40) || new Date().toISOString();
  const sourceId = `overview_${digest([report.url, at]).slice(0, 48)}`;
  const evidence = geo.recommendations.slice(0, 80).flatMap((item, index): Evidence[] => {
    const row = object(item), action = clean(row.action ?? row.title, 500);
    if (!action) return [];
    const detail = [clean(row.category, 100), clean(row.priority, 40), clean(row.checkId, 100),
      typeof row.points === 'number' && Number.isFinite(row.points) ? `Recoverable readiness points: ${row.points}. This is an audit estimate, not measured traffic or revenue.` : '',
    ].filter(Boolean).join(' · ');
    const candidate = evidenceSchema.safeParse({ id: `audit_${digest([sourceId, index, action, detail]).slice(0, 56)}`, source: 'audit', sourceId, title: action, detail, url: report.url, observedAt: at, kind: 'observed' });
    return candidate.success ? [candidate.data] : [];
  });
  if (evidence.length) storeScenarioEvidence(tenantId, evidence);
}

export function listAvailableEvidence(tenant: Tenant): { evidence: Evidence[]; sources: Array<{ id: string; status: string; count: number }> } {
  const state = readDecision(tenant.id);
  const captured = listScenarioEvidence(tenant.id).filter(e => e.source === 'audit' && e.url && safeUrl(tenant, e.url));
  const intent = state.evidence.flatMap((row): Evidence[] => {
    if (row.source === 'gsc' && !tenant.gscProperties.includes(row.sourceScope) || row.source === 'bing' && !tenant.bingSites?.includes(row.sourceScope) || row.page && !safeUrl(tenant, row.page)) return [];
    const candidate = evidenceSchema.safeParse({
      id: `intent_${digest([row.id, row.observedAt, row.detail, row.clicks, row.impressions]).slice(0, 55)}`, source: 'intent', sourceId: row.id,
      title: clean(row.query, 500), detail: `${row.source.toUpperCase()} · ${clean(row.period, 100)}\n${clean(row.detail, 4500)}${row.clicks !== null ? `\nClicks: ${row.clicks}` : ''}${row.impressions !== null ? ` · Impressions: ${row.impressions}` : ''}`,
      ...(row.page ? { url: row.page } : {}), observedAt: row.observedAt, kind: 'observed', sourceProvider: row.source, sourceScope: row.sourceScope,
    }); return candidate.success ? [candidate.data] : [];
  });
  const audits = state.audits.slice(-20).flatMap((raw): Evidence[] => {
    const run = object(raw), scope = object(run.scope);
    if (typeof scope.container !== 'string' || !tenantOwnsGtmContainer(tenant, scope.container) || typeof scope.ga4Property === 'string' && !tenantOwnsGa4(tenant, scope.ga4Property) || !Array.isArray(scope.pages) || !scope.pages.length || scope.pages.some(page => typeof page !== 'string' || !safeUrl(tenant, page)) || !Array.isArray(run.checks)) return [];
    const pages = scope.pages as string[];
    return run.checks.flatMap((value): Evidence[] => {
      const check = object(value); if (check.state === 'pass') return [];
      const candidate = evidenceSchema.safeParse({ id: `measure_${digest([run.id, check.id]).slice(0, 55)}`, source: 'audit', sourceId: `measurement_${clean(run.id, 80)}`, title: `GTM ${clean(check.id, 80)}: ${clean(check.state, 30)}`, detail: `${scope.container} · ${clean(scope.ga4Property, 30)} · ${check.complete === true ? 'Complete check' : 'Incomplete check; verify missing evidence'}. A static check is not proof of runtime consent or causal attribution.`, url: pages[0], observedAt: run.at, kind: 'observed', sourceProvider: 'gtm', sourceScope: scope.container, ...(scope.ga4Property ? { sourceGa4: scope.ga4Property } : {}), sourcePages: pages });
      return candidate.success ? [candidate.data] : [];
    });
  });
  const evidence = [...new Map([...captured, ...intent, ...audits].map(item => [item.id, item])).values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, 500);
  return { evidence, sources: [
    { id: 'overview', status: captured.length ? 'available' : 'no-stored-audit', count: captured.length },
    { id: 'intent', status: intent.length ? 'available' : 'no-stored-evidence', count: intent.length },
    { id: 'measurement', status: audits.length ? 'available' : 'no-stored-findings', count: audits.length },
  ] };
}

/** Resolve source IDs on the server. Browser text cannot manufacture an observed audit. */
export function resolveDraftEvidence(tenant: Tenant, actor: string, draft: Draft, evidenceIds: string[] = [], existing?: Draft): Draft {
  const available = new Map(listAvailableEvidence(tenant).evidence.map(e => [e.id, e]));
  const retained = new Map((existing?.evidence ?? []).map(e => [e.id, e]));
  const next = new Map<string, Evidence>();
  for (const item of draft.evidence) {
    const previous = retained.get(item.id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(item)) throw new ScenarioError(400, 'SCENARIO_EVIDENCE_IMMUTABLE', 'An evidence snapshot cannot be edited. Add a new declared source.');
      next.set(item.id, previous); continue;
    }
    const source = available.get(item.id);
    if (source) { next.set(source.id, source); continue; }
    if (item.source !== 'manual' || item.kind === 'observed' || item.sourceProvider || item.sourceScope || item.sourceGa4 || item.sourcePages) throw new ScenarioError(403, 'SCENARIO_EVIDENCE_SCOPE', 'Select an authorised stored source or add a declared finding.');
    next.set(item.id, { ...item, sourceId: `declared:${actor}`.slice(0, 200) });
  }
  for (const id of evidenceIds) {
    const source = available.get(id) ?? retained.get(id);
    if (!source) throw new ScenarioError(403, 'SCENARIO_EVIDENCE_SCOPE', 'This source is unavailable in the selected workspace.');
    next.set(id, source);
  }
  const result = { ...draft, evidence: [...next.values()] };
  assertEvidenceScope(tenant, result);
  return result;
}

export type EvidenceScope = Pick<Evidence, 'id' | 'source' | 'sourceId' | 'url' | 'sourceProvider' | 'sourceScope' | 'sourceGa4' | 'sourcePages'>;
export function assertEvidenceScope(tenant: Tenant, draft: { evidence: EvidenceScope[] }): void {
  let available: Set<string> | undefined;
  for (const evidence of draft.evidence) {
    if (evidence.url && !safeUrl(tenant, evidence.url)) throw new ScenarioError(403, 'SCENARIO_EVIDENCE_SCOPE', 'A source domain is no longer authorised in this workspace.');
    if (evidence.source === 'manual') continue;
    let allowed = true;
    if (evidence.sourceProvider === 'gsc') allowed = !!evidence.sourceScope && tenant.gscProperties.includes(evidence.sourceScope);
    else if (evidence.sourceProvider === 'bing') allowed = !!evidence.sourceScope && !!tenant.bingSites?.includes(evidence.sourceScope);
    else if (evidence.sourceProvider === 'gtm') allowed = !!evidence.sourceScope && tenantOwnsGtmContainer(tenant, evidence.sourceScope) && (!evidence.sourceGa4 || tenantOwnsGa4(tenant, evidence.sourceGa4)) && !!evidence.sourcePages?.length && evidence.sourcePages.every(page => safeUrl(tenant, page));
    else if (evidence.sourceProvider === 'ai') allowed = !!evidence.sourceScope;
    else if (evidence.sourceId.startsWith('overview_')) allowed = !!evidence.url;
    else { available ??= new Set(listAvailableEvidence(tenant).evidence.map(e => e.id)); allowed = available.has(evidence.id); }
    if (!allowed) throw new ScenarioError(403, 'SCENARIO_EVIDENCE_SCOPE', 'A source property, container or page is no longer authorised.');
  }
}
