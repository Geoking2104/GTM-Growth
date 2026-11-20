import { describe, expect, it } from 'vitest';
import { DECISION_AREAS, DECISION_VIEWS } from '../site/console/decision-navigation.js';
import { COACH_GOALS, getCoachGuide, getElementGuide, buildCoachPlan } from '../site/console/coach-model.js';

const me = { tenant: { id: 'acme', status: 'active', domains: ['example.com'], gscProperties: ['sc-domain:example.com'], ga4Properties: ['123'] } };
const source = (plan: any) => plan.steps.find((step: any) => step.id === 'source');
const evidence = (plan: any) => plan.steps.find((step: any) => step.id === 'evidence');
const internal = /^#[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/;

describe('coach route explanations', () => {
  it('explains origin, relationships and consequences for every business view and bookmarked route in both languages', () => {
    const routes = new Set<string>(['#overview', '#portfolio', '#platform/setup', '#billing', '#ga4/realtime', '#social/calendar', '#ops/alerts', '#overview/plan']);
    for (const area of DECISION_AREAS) routes.add(`#${area.id}`);
    for (const [area, views] of Object.entries(DECISION_VIEWS)) for (const view of views) {
      routes.add(`#${area}/${view.id}`);
      for (const item of view.items) routes.add(item.route);
    }
    expect(routes.size).toBeGreaterThan(60);
    for (const route of routes) for (const language of ['fr', 'en']) {
      const [section, tab] = route.slice(1).split('/');
      const guide = getCoachGuide(section, tab, language);
      for (const key of ['title', 'summary', 'origin', 'consequence', 'freshness']) expect(guide[key].length, `${route}/${language}/${key}`).toBeGreaterThan(key === 'title' ? 2 : 12);
      expect(guide.relations.length).toBeGreaterThan(0);
      expect(guide.next.href).toMatch(internal);
      expect(guide.next.label.length).toBeGreaterThan(6);
      for (const relation of guide.relations) { expect(relation.href).toMatch(internal); expect(relation.label.length).toBeGreaterThan(4); }
      expect(DECISION_AREAS.some(area => area.id === guide.tone)).toBe(true);
      expect(guide.illustration).toBe(guide.tone);
    }
  });

  it('keeps observation freshness distinct from refresh time and planning dates', () => {
    expect(getCoachGuide('ga4', 'realtime', 'en').freshness).toContain('not a new observation');
    expect(getCoachGuide('ai_visibility', '', 'en').freshness).toContain('does not make it newer');
    expect(getCoachGuide('gsc', '', 'fr').freshness).toContain('délai');
    expect(getCoachGuide('studio', 'campaigns', 'en').consequence).toContain('does not publish');
    expect(getCoachGuide('calculators', 'roi', 'en').origin).toContain('not observed results');
    expect(getCoachGuide('report', '', 'fr').freshness).toContain('instantané');
  });

  it('does not interpret inherited object names or untrusted route text as catalog entries or links', () => {
    for (const section of ['constructor', '__proto__', 'toString', 'javascript:alert(1)', '<svg onload=alert(1)>']) {
      const guide = getCoachGuide(section, 'constructor', 'en');
      expect(guide.title).toBe('Your starting point');
      expect(guide.next.href).toMatch(internal);
      expect(guide.relations.every((relation: any) => internal.test(relation.href))).toBe(true);
    }
  });
});

describe('element context', () => {
  it('explains derived metrics and their limits without asserting a business outcome', () => {
    const ctr = getElementGuide({ section: 'gsc', label: 'CTR', kind: 'metric' }, 'en');
    expect(ctr.elementId).toBe('ctr');
    expect(ctr.origin).toContain('clicks to impressions');
    expect(ctr.consequence).toContain('does not guarantee');
    const revenue = getElementGuide({ section: 'commerce', label: 'Revenus', kind: 'metric' }, 'fr');
    expect(revenue.elementId).toBe('revenue');
    expect(revenue.consequence).toContain('effet causal');
    expect(getElementGuide({ section: 'ga4', label: 'Key events' }, 'en').consequence).toContain('definition');
  });

  it('separates a technical readiness score from an observed AI presence score', () => {
    expect(getElementGuide({ section: 'geo', label: 'Score' }, 'en').elementId).toBe('readiness');
    const visibility = getElementGuide({ section: 'ai_visibility', label: 'Score de présence IA' }, 'fr');
    expect(visibility.elementId).toBe('mentions');
    expect(visibility.origin).toContain('réponses datées');
    expect(visibility.consequence).toContain('dénominateur');
  });

  it('gives actions their own consequences even when their labels mention sites or metrics', () => {
    const publish = getElementGuide({ section: 'ops', tab: 'articles', label: 'Publier mon site', kind: 'action' }, 'fr');
    expect(publish.elementId).toBe('approval');
    expect(publish.consequence).toContain('destination');
    expect(publish.consequence).toContain('n’exécute pas');
    const remove = getElementGuide({ section: 'agents', label: 'Remove workspace access', kind: 'button' }, 'en');
    expect(remove.elementId).toBe('delete');
    expect(remove.consequence).toContain('without undoing completed actions');
    expect(getElementGuide({ section: 'studio', label: 'Enregistrer le budget', kind: 'button' }, 'fr').elementId).toBe('save');
  });

  it('distinguishes user preferences and editable plan fields from observed measurements', () => {
    const audience = getElementGuide({ section: 'journey', label: 'Audience cible', kind: 'field' }, 'fr');
    expect(audience.elementId).toBe('goal');
    expect(audience.origin).toContain('utilisateur');
    expect(getElementGuide({ section: 'studio', label: 'Responsable', kind: 'field' }, 'fr').consequence).toContain('n’accorde pas de nouveaux droits');
    expect(getElementGuide({ section: 'studio', label: 'Date de début', kind: 'field' }, 'fr').consequence).toContain('ne programme pas une publication');
    expect(getElementGuide({ section: 'studio', label: 'Budget', kind: 'field' }, 'en').consequence).toContain('does not spend');
  });

  it('keeps unknown elements attached to route provenance, and never needs a field value', () => {
    const input = { section: 'tracking', label: 'API key', kind: 'field', value: 'secret-must-not-appear' };
    const secret = getElementGuide(input, 'en');
    expect(secret.elementId).toBe('credentials');
    expect(JSON.stringify(secret)).not.toContain(input.value);
    const unknown = getElementGuide({ section: 'crm', label: 'Unregistered visual card', kind: 'card' }, 'en');
    expect(unknown.elementId).toBe('context');
    expect(unknown.origin).toBe(getCoachGuide('crm', '', 'en').origin);
    expect(unknown.relations.some((relation: any) => relation.href === '#commerce')).toBe(true);
  });
});

describe('contextual next actions', () => {
  it('never promotes configured or failed sources to verified access', () => {
    const configured = buildCoachPlan({ me }, 'en');
    expect(source(configured).state).toBe('todo');
    expect(source(configured).href).toBe('#tracking/status');
    expect(source(configured).reason).toContain('no successful access');
    expect(source(buildCoachPlan({ me, status: { gsc: { hasAccess: false } } }, 'en')).state).toBe('blocked');
    expect(source(buildCoachPlan({ me, status: { gsc: { hasAccess: 'true' } } }, 'en')).state).toBe('todo');
    expect(source(buildCoachPlan({ me, status: { gsc: { hasAccess: true, error: 'failed' } } }, 'en')).state).toBe('todo');
    expect(source(buildCoachPlan({ me, status: { loadError: 'failed', gsc: { hasAccess: true } } }, 'en')).state).toBe('todo');
    const available = buildCoachPlan({ me, status: { gsc: { configured: 'sc-domain:example.com', hasAccess: true } } }, 'en');
    expect(source(available).state).toBe('ready');
    expect(source(available).href).toBe('#gsc/query-pages');
    expect(available.next).toBe(source(available));
    expect(available.summary).toContain('not actions already completed');
  });

  it('rejects stale status from another property and old findings from another domain', () => {
    const status = { gsc: { configured: 'sc-domain:another.test', hasAccess: true } };
    expect(source(buildCoachPlan({ me, status }, 'en')).state).toBe('todo');
    const stale = buildCoachPlan({ me, overview: { url: 'https://another.test', geo: { recommendations: [{ action: 'Other customer recommendation', points: 8 }] } } }, 'en');
    expect(evidence(stale).state).toBe('todo');
    expect(JSON.stringify(stale)).not.toContain('Other customer recommendation');
    const authorised = buildCoachPlan({ me, overview: { url: 'https://shop.example.com/products', geo: { recommendations: [{ action: 'Review structured product data', points: 8 }] } } }, 'en');
    expect(evidence(authorised).state).toBe('ready');
    expect(evidence(authorised).detail).toBe('Review structured product data');
  });

  it('begins with scope setup and blocks data-dependent advice for an inactive or absent workspace', () => {
    for (const context of [undefined, { tenant: { ...me.tenant, status: 'suspended' } }, { tenant: { ...me.tenant, status: 'unexpected' } }]) {
      const plan = buildCoachPlan({ me: context, overview: { geo: { recommendations: [{ action: 'Old tenant recommendation', points: 10 }] } } }, 'fr');
      expect(plan.next.id).toBe('workspace');
      expect(plan.steps.every((step: any) => step.state === 'blocked')).toBe(true);
      expect(JSON.stringify(plan)).not.toContain('Old tenant recommendation');
    }
    const noDomain = buildCoachPlan({ me: { tenant: { ...me.tenant, domains: [] } } }, 'fr');
    expect(noDomain.next.id).toBe('domain');
    expect(evidence(noDomain).state).toBe('blocked');
    const noProperty = buildCoachPlan({ me: { tenant: { ...me.tenant, gscProperties: [] } }, status: { gsc: { hasAccess: true } } }, 'fr');
    expect(source(noProperty).state).toBe('todo');
    expect(source(noProperty).href).toBe('#tracking/settings');
  });

  it('adapts to each supported personal goal while retaining evidence and planning', () => {
    for (const goal of COACH_GOALS) {
      const profile = { goal: goal.id };
      const plan = buildCoachPlan({ me, profile, status: { gsc: { hasAccess: true }, ga4: { hasAccess: true } } }, 'en');
      expect(plan.goal).toBe(goal.id);
      expect(plan.title).toBe(goal.en);
      expect(source(plan).href).toBe(goal.href);
      expect(plan.steps.map((step: any) => step.id)).toEqual(['source', 'evidence', 'plan']);
      expect(plan.steps.every((step: any) => internal.test(step.href) && step.reason && step.impact)).toBe(true);
    }
    const sales = source(buildCoachPlan({ me, profile: { goal: 'sales' }, status: { ga4: { hasAccess: true } } }, 'en'));
    expect(sales.impact).toContain('not automatically a sale');
  });

  it('prioritises actual audit recommendations for a technical role without mutating inputs or making forecasts', () => {
    const input = { me, profile: { role: 'technical', goal: 'traffic' }, overview: { geo: { recommendations: [
      { action: 'Low-priority proof', points: 2 }, { action: 'No evidence', points: null },
      { action: 'Top proof', points: 8 }, { action: 'Invalid numeric string', points: '99' },
      { action: 'Invalid infinity', points: Infinity }, { action: 'Negative priority', points: -3 },
    ] } } };
    const before = JSON.stringify(input);
    const plan = buildCoachPlan(input, 'en');
    expect(plan.next.id).toBe('evidence');
    expect(plan.next.detail).toBe('Top proof');
    expect(plan.next.impact).toContain('no traffic gain is assumed');
    expect(JSON.stringify(input)).toBe(before);
    const failed = buildCoachPlan({ ...input, overview: { ...input.overview, problem: 'unavailable' } }, 'en');
    expect(evidence(failed).state).toBe('todo');
  });

  it('adds a bounded monitoring or agency follow-up without changing permissions', () => {
    const monitoring = buildCoachPlan({ me, profile: { goal: 'local', stage: 'retain' } }, 'fr');
    expect(monitoring.steps.at(-1).href).toBe('#ops/alerts');
    const agency = buildCoachPlan({ me, profile: { role: 'agency' } }, 'en');
    expect(agency.steps.at(-1).href).toBe('#report');
    expect(agency.steps.at(-1).impact).toContain('each customer');
    expect(buildCoachPlan({ me, profile: { goal: 'constructor' } }, 'en').goal).toBe('traffic');
  });
});
