import { decisionPrincipal } from './decision-context.js';
import { unifiedInbox } from './decision-inbox.js';
import { latestMeasurement } from './measurement-audit.js';
import { listAlerts } from './ops-store.js';
import { listTenantReports } from '../tenants/data.js';
import { tenantOwnsUrl } from '../tenants/store.js';
import { readDecision } from './decision-store.js';
import type { ConsoleRoute } from './util.js';
/** One authorised member workspace per request, with its own credential context. */
export const decisionPortfolioRoutes: ConsoleRoute[] = [{ path: '/decision/portfolio/card', needsUrl: false, handler: async ctx => {
  const who = decisionPrincipal(ctx), inbox = await unifiedInbox(ctx);
  const s = readDecision(who.tenant.id), overview = [...(s.overviews || [])].reverse().find(o => tenantOwnsUrl(who.tenant, o.url)) ?? null;
  return { tenant: { id: who.tenant.id, name: who.tenant.name, domains: who.tenant.domains, branding: who.tenant.branding },
    overview, measurement: latestMeasurement(ctx, {}), pending: inbox.pending, partial: inbox.partial, sources: inbox.sources,
    alerts: listAlerts(who.tenant.id, false).length, reports: listTenantReports(who.tenant.id).slice(0, 6),
    connections: { gsc: who.tenant.gscProperties.length, ga4: who.tenant.ga4Properties?.length ?? 0, gtm: who.tenant.gtmContainers?.length ?? 0, bing: who.tenant.bingSites?.length ?? 0 },
    at: new Date().toISOString() };
} }];
