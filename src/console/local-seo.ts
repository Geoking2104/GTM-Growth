/** Local SEO offline-first commands. No external provider calls or paid fallback. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TenantAccessError } from "../tenants/context.js";
import { tenantOwnsUrl } from "../tenants/store.js";
import { readState, updateState } from "../local-seo/store.js";
import { siteSchema, observationSchema, metrics, series, hash, approvalHash, type LocalState, type Action } from "../local-seo/model.js";
import type { ConsoleRoute, HandlerContext } from "./util.js";
function identity(ctx: HandlerContext) {
  if (ctx.user?.preferred_username?.startsWith("service-account-") || ctx.user?.realm_access?.roles?.includes("ai-agent") || !ctx.user?.sub || !ctx.tenancy?.tenant || ctx.tenancy.tenant.status !== "active" || ctx.tenancy.platformAdmin) throw new TenantAccessError("LOCAL_ACCESS");
  return { tenant: ctx.tenancy.tenant, actor: ctx.user.sub, admin: ctx.tenancy.role === "tenant-admin" };
}
function requireSite(ctx: HandlerContext, s: LocalState, siteId: string) {
  const who = identity(ctx); const site = s.sites.find(x => x.id === siteId);
  if (!site || (!who.admin && !(s.grants[who.actor] ?? []).includes(siteId))) throw new TenantAccessError("LOCAL_ACCESS");
  return site;
}
function audit(s: LocalState, actor: string, event: string, target: string) {
  if (s.audit.length >= 50000) throw new Error("LOCAL_CAPACITY");
  s.audit.push({ at: new Date().toISOString(), actor, event, target });
}
function admin(ctx: HandlerContext) { const who = identity(ctx); if (!who.admin) throw new TenantAccessError("LOCAL_ACCESS"); return who; }
function state(ctx: HandlerContext) {
  const who = identity(ctx), s = readState(who.tenant.id);
  const sites = s.sites.filter(x => who.admin || (s.grants[who.actor] ?? []).includes(x.id)); const ids = new Set(sites.map(x => x.id));
  const observations = s.observations.filter(x => ids.has(x.siteId));
  const enriched = observations.map(x => ({ ...x, metrics: metrics(x), comparableSeries: series(x) }));
  const previousBySeries = new Map<string, typeof enriched[number]>();
  const comparisons: Array<{ siteId: string; previousId: string; currentId: string; comparable: boolean; deltaTop3: number | null }> = [];
  for (const current of [...enriched].sort((a,b) => Date.parse(a.observedAt)-Date.parse(b.observedAt) || a.id.localeCompare(b.id, "en"))) {
    if (!current.comparableSeries) continue;
    const previous = previousBySeries.get(current.comparableSeries);
    if (previous && Date.parse(current.observedAt) > Date.parse(previous.observedAt)) comparisons.push({ siteId: current.siteId, previousId: previous.id, currentId: current.id,
      comparable: true, deltaTop3: previous.metrics.top3 !== null && current.metrics.top3 !== null ? current.metrics.top3-previous.metrics.top3 : null });
    previousBySeries.set(current.comparableSeries,current);
  }
  return { sites, comparisons, observations: enriched, actions: s.actions.filter(x => ids.has(x.siteId)),
    audit: s.audit.filter(x => who.admin || ids.has(x.target)).slice(-500), grants: who.admin ? s.grants : undefined,
    capabilities: { registry: "available", rankImport: "available", manualActions: "available", gbp: "unavailable", nodeRed: "unavailable", localModel: "unavailable", paidFallback: false } };
}
const actionSchema = z.object({ siteId: z.string().max(80), title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(5000), language: z.string().max(35), owner: z.string().trim().min(1).max(200), due: z.string().datetime({ offset: true }), evidence: z.array(z.string().max(100)).min(1).max(20) }).strict();
function route(path: string, handler: ConsoleRoute["handler"]): ConsoleRoute {
  return { path: `/local-seo/${path}`, needsUrl: false, handler: async ctx => {
    try { return await handler(ctx); } catch (e) { if (e instanceof z.ZodError) throw new TenantAccessError("LOCAL_INVALID", 400); throw e; }
  } };
}
export const localSeoRoutes: ConsoleRoute[] = [
  route("state", async ctx => state(ctx)),
  route("export", async ctx => state(ctx)),
  route("registry", async ctx => {
    const who = admin(ctx); const rows = z.array(z.unknown()).min(1).max(1000).parse(ctx.body.rows);
    const seen = new Set<string>(); const accepted: z.infer<typeof siteSchema>[] = []; const rejected: Array<{ row: number; code: string }> = [];
    rows.forEach((row, i) => {
      const parsed = siteSchema.safeParse(row);
      if (!parsed.success || !tenantOwnsUrl(who.tenant, parsed.data.page) || !/^https?:\/\//.test(parsed.data.page) || new URL(parsed.data.page).username || new URL(parsed.data.page).password || seen.has(parsed.data.id)) { rejected.push({ row: i+1, code: "LOCAL_INVALID" }); return; }
      seen.add(parsed.data.id); accepted.push(parsed.data);
    });
    const preview = { accepted, rejected, hash: hash(accepted) };
    if (ctx.body.confirm !== true) return preview;
    if (ctx.body.hash !== preview.hash) throw new TenantAccessError("LOCAL_CHANGED", 409);
    updateState(who.tenant.id, s => {
      for (const site of accepted) { const i = s.sites.findIndex(x => x.id === site.id); if (i < 0) s.sites.push(site); else s.sites[i] = site; }
      if (s.sites.length > 1000) throw new Error("LOCAL_CAPACITY");
      audit(s, who.actor, "registry-import", "registry");
    }); return { ...preview, saved: accepted.length };
  }),
  route("grant", async ctx => {
    const who = admin(ctx); const user = z.string().min(1).max(200).parse(ctx.body.user);
    const sites = z.array(z.string()).max(1000).parse(ctx.body.sites);
    updateState(who.tenant.id, s => { sites.forEach(id => requireSite(ctx,s,id)); s.grants[user] = [...new Set(sites)]; audit(s,who.actor,"grant",user); });
    return { saved: true };
  }),
  route("import", async ctx => {
    const who = identity(ctx); const input = observationSchema.parse(ctx.body.observation);
    return updateState(who.tenant.id, s => {
      const site = requireSite(ctx,s,input.siteId);
      if (site.kind === "web-only" && input.surface !== "organic") throw new TenantAccessError("LOCAL_NOT_APPLICABLE",400);
      if (input.language && !site.languages.includes(input.language)) throw new TenantAccessError("LOCAL_LANGUAGE",400);
      if (input.country && input.country !== site.country) throw new TenantAccessError("LOCAL_INVALID",400);
      const fingerprint = hash(input); const existing = s.observations.find(x => x.hash === fingerprint); if (existing) return { id: existing.id, duplicate: true };
      if (s.observations.length >= 1000) throw new Error("LOCAL_CAPACITY");
      const observation = { ...input, id: randomUUID(), hash: fingerprint, author: who.actor, importedAt: new Date().toISOString() };
      s.observations.push(observation); audit(s,who.actor,"observation-import",input.siteId);
      return { ...observation, metrics: metrics(observation), comparableSeries: series(observation) };
    });
  }),
  route("action", async ctx => {
    const who = identity(ctx); const input = actionSchema.parse(ctx.body.action);
    return updateState(who.tenant.id, s => {
      const site = requireSite(ctx,s,input.siteId);
      if (!site.languages.includes(input.language)) throw new TenantAccessError("LOCAL_LANGUAGE",400);
      if (input.evidence.some(id => !s.observations.some(x => x.id === id && x.siteId === input.siteId))) throw new TenantAccessError("LOCAL_EVIDENCE",400);
      let a: Action | undefined;
      if (ctx.body.id !== undefined) {
        a = s.actions.find(x => x.id === ctx.body.id); if (!a) throw new TenantAccessError("LOCAL_ACCESS"); requireSite(ctx,s,a.siteId);
        if (ctx.body.version !== a.version) throw new TenantAccessError("LOCAL_CHANGED",409);
        Object.assign(a, input, { version: a.version+1, status: "draft", author: who.actor }); delete a.approval;
      } else {
        if (s.actions.length >= 5000) throw new Error("LOCAL_CAPACITY");
        a = { ...input, id: randomUUID(), author: who.actor, version: 1, status: "draft" }; s.actions.push(a);
      }
      audit(s,who.actor,"action-draft",a.siteId); return a;
    });
  }),
  route("transition", async ctx => {
    const who = identity(ctx); const op = z.enum(["submit", "approve", "reject", "manual"]).parse(ctx.body.op);
    return updateState(who.tenant.id, s => {
      const a = s.actions.find(x => x.id === ctx.body.id); if (!a) throw new TenantAccessError("LOCAL_ACCESS"); requireSite(ctx,s,a.siteId);
      if (ctx.body.version !== a.version) throw new TenantAccessError("LOCAL_CHANGED",409);
      if (op === "submit" && a.status === "draft") a.status = "submitted";
      else if ((op === "approve" || op === "reject") && a.status === "submitted" && who.admin && who.actor !== a.author && !ctx.user?.azp?.startsWith("service-account")) {
        a.status = op === "approve" ? "approved" : "rejected";
        if (op === "approve") a.approval = { author: who.actor, at: new Date().toISOString(), hash: approvalHash(a) };
      } else if (op === "manual" && a.status === "approved" && a.approval?.hash === approvalHash(a)) a.status = "manual-pending";
      else throw new TenantAccessError("LOCAL_TRANSITION",409);
      audit(s,who.actor,`action-${op}`,a.siteId); return a;
    });
  }),
];
