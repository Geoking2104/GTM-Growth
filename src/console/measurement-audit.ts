/** Orchestrates existing GTM engines. A partial/static check is never proof of live attribution. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auditGtmInstallation, type GtmInstallationResult } from "../google/gtm-installation.js";
import { auditGa4SetupV2 } from "../google/gtm-audit-v2.js";
import { detectDuplicateTags } from "../google/tagmanager-api.js";
import { fetchPublicPage } from "../http/public-fetch.js";
import { withFreshCache } from "../cache/redis.js";
import { gtmInventory } from "./gtm-console.js";
import { changeDecision, logDecision, readDecision } from "./decision-store.js";
import { decisionPrincipal, ownedMeasurement, ownedPage } from "./decision-context.js";
import type { HandlerContext, ConsoleRoute } from "./util.js";
export const measurementInput = z.object({
  container: z.string().max(200), workspace: z.string().max(240).optional(),
  ga4Property: z.string().regex(/^\d+$/).optional(), pages: z.array(z.string().url().max(2048)).min(1).max(5),
}).strict();
type Input = z.infer<typeof measurementInput>;
export type MeasurementCheck = { id: string; state: "pass" | "warning" | "critical" | "unknown"; evidence: unknown; complete: boolean };
export type MeasurementRun = { id: string; at: string; actor: string; scope: Input; liveVersion: string | null; state: "intact" | "warning" | "critical" | "unknown"; complete: boolean; checks: MeasurementCheck[] };
export function measurementState(checks: MeasurementCheck[]): MeasurementRun["state"] {
  if (checks.some(c => c.state === "critical")) return "critical";
  if (checks.some(c => !c.complete || c.state === "unknown") || checks.length !== 4) return "unknown";
  return checks.some(c => c.state === "warning") ? "warning" : "intact";
}
const deps = { installation: auditGtmInstallation, setup: auditGa4SetupV2, duplicates: detectDuplicateTags, inventory: gtmInventory };
const running = new Set<string>();
export async function runMeasurement(ctx: HandlerContext, raw: unknown, engines: typeof deps = deps): Promise<MeasurementRun> {
  const who = decisionPrincipal(ctx, true), input = measurementInput.parse(raw);
  ownedMeasurement(ctx, input.container, input.ga4Property, input.workspace);
  input.pages = [...new Set(input.pages.map(u => ownedPage(ctx, u)))];
  if (running.has(who.tenant.id)) throw new Error("MEASUREMENT_ALREADY_RUNNING");
  running.add(who.tenant.id);
  try { return await withFreshCache(async () => {
    const info: any = await engines.inventory({ container: input.container, workspace: input.workspace }, who.tenant);
    if (info.problem || !info.workspace) throw new Error("GTM_INVENTORY_UNAVAILABLE");
    const workspace = input.workspace || info.workspace;
    ownedMeasurement(ctx, input.container, input.ga4Property, workspace);
    const [, accountId, , containerId] = input.container.split('/'), workspaceId = workspace.split('/').at(-1)!;
    const pageResults = await Promise.all(input.pages.map(url => engines.installation({ url, timeoutMs: 12000,
      fetcher: async (target, options) => { ownedPage(ctx, target); const page = await fetchPublicPage(target, options); ownedPage(ctx, page.url); return page; },
    }).catch(() => ({ url, finalUrl: url, error: "Page unavailable", checks: [], containerIds: [], score: 0, passedRequired: 0, requiredTotal: 0, httpStatus: 0 } as GtmInstallationResult))));
    const [setup, duplicates] = await Promise.allSettled([
      engines.setup({ accountId, containerId, workspaceId, propertyId: input.ga4Property, startDate: "28daysAgo", endDate: "yesterday" }),
      engines.duplicates(accountId, containerId, workspaceId),
    ]);
    const pagesComplete = pageResults.every(p => !p.error && p.checks.length > 0);
    const installationBad = pageResults.some(p => !p.error && (!p.containerIds.includes(info.container.publicId) || p.checks.some(c => ['gtm.container', 'gtm.head_snippet', 'gtm.datalayer_order'].includes(c.id) && c.status === 'fail')));
    const installationWarnings = pageResults.some(p => p.checks.some(c => c.required && c.status !== 'pass'));
    const setupData = setup.status === 'fulfilled' ? setup.value : null;
    const setupComplete = !!input.ga4Property && !!setupData?.coverage?.complete;
    const setupCritical = setupData?.issues.some(i => ['critical', 'high'].includes(i.severity));
    const duplicateData = duplicates.status === 'fulfilled' ? duplicates.value : null;
    const consent = pageResults.map(p => ({ url: p.url, check: p.checks.find(c => c.id === 'gtm.consent_default') ?? null }));
    const checks: MeasurementCheck[] = [
      { id: 'installation', complete: pagesComplete, state: installationBad ? 'critical' : !pagesComplete ? 'unknown' : installationWarnings ? 'warning' : 'pass', evidence: pageResults },
      { id: 'ga4-setup', complete: setupComplete, state: setupCritical ? 'critical' : !setupComplete ? 'unknown' : setupData!.issues.some(i => i.severity !== 'info') ? 'warning' : 'pass', evidence: setupData ?? { error: 'GTM_GA4_AUDIT_UNAVAILABLE' } },
      { id: 'duplicates', complete: !!duplicateData, state: !duplicateData ? 'unknown' : duplicateData.hasDuplicates ? 'critical' : 'pass', evidence: duplicateData ?? { error: 'GTM_DUPLICATE_AUDIT_UNAVAILABLE' } },
      { id: 'consent-default', complete: pagesComplete && consent.every(c => c.check), state: !pagesComplete ? 'unknown' : consent.some(c => c.check?.status !== 'pass') ? 'warning' : 'pass', evidence: consent },
    ];
    // Draft workspace edits are not proof of the configuration currently serving users.
    if (info.pendingChanges > 0 || !info.coverage?.status || !info.coverage?.live) { checks[1].complete = false; if (checks[1].state !== 'critical') checks[1].state = 'unknown'; }
    const run: MeasurementRun = { id: randomUUID(), actor: who.actor, at: new Date().toISOString(), scope: { ...input, workspace }, liveVersion: info.live?.id ?? null, checks, complete: checks.every(c => c.complete), state: measurementState(checks) };
    if (!run.liveVersion) { run.complete = false; if (run.state !== 'critical') run.state = 'unknown'; }
    changeDecision(who.tenant.id, s => { s.audits.push(run); logDecision(s, who.actor, 'measurement-audit', run.id); });
    return run;
  }); } finally { running.delete(who.tenant.id); }
}
export function latestMeasurement(ctx: HandlerContext, raw: unknown) {
  const who = decisionPrincipal(ctx);
  const input = z.object({ container: z.string().optional(), ga4Property: z.string().optional(), url: z.string().url().optional() }).strict().parse(raw);
  if (input.container) ownedMeasurement(ctx, input.container, input.ga4Property);
  if (input.url) ownedPage(ctx, input.url);
  const run: MeasurementRun | undefined = [...readDecision(who.tenant.id).audits].reverse().find(r =>
    (!input.container || r.scope.container === input.container) && (!input.ga4Property || r.scope.ga4Property === input.ga4Property) && (!input.url || r.scope.pages.includes(input.url)) &&
    who.tenant.gtmContainers?.includes(r.scope.container) && (!r.scope.ga4Property || who.tenant.ga4Properties?.includes(r.scope.ga4Property)) && r.scope.pages.every((u: string) => { try { ownedPage(ctx, u); return true; } catch { return false; } }));
  return { run: run ?? null, stale: !!run && Date.now() - Date.parse(run.at) > 7 * 86400000 };
}
export const measurementRoutes: ConsoleRoute[] = [
  { path: '/decision/measurement/run', needsUrl: false, adminOnly: true, handler: ctx => runMeasurement(ctx, ctx.body) },
  { path: '/decision/measurement/latest', needsUrl: false, handler: async ctx => latestMeasurement(ctx, ctx.body) },
];
