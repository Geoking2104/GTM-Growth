import { z } from "zod";
import type { ConsoleRoute, HandlerContext } from "./util.js";
import { TenantAccessError } from "../tenants/context.js";
import { readProfile, saveProfile } from "../data-agent/profile.js";
import { catalog, nextActions, readModel } from "../data-agent/service.js";
import { loadBindings } from "../data-agent/bridge.js";

function identity(ctx: HandlerContext) {
  if (!ctx.tenancy?.tenant || ctx.tenancy.tenant.status !== "active" || !ctx.user?.sub || !ctx.user.iss) throw new TenantAccessError("Active workspace and user required");
  return { tenant: ctx.tenancy.tenant, principal: `${ctx.user.iss}:${ctx.user.sub}` };
}
export const dataAgentRoutes: ConsoleRoute[] = [
  { path: "/data-agent/context", needsUrl: false, handler: async ctx => {
    const { tenant, principal } = identity(ctx);
    const input = z.object({ locale: z.enum(["fr", "en"]).default("en"), section: z.string().max(80).default("overview") }).strict().parse(ctx.body);
    const profile = readProfile(tenant.id, principal);
    let slack: "configured" | "not-configured" | "unavailable" = "not-configured";
    try { if (loadBindings().some(b => b.tenantId === tenant.id)) slack = "configured"; } catch { slack = "unavailable"; }
    return { profile, actions: nextActions(profile, input.locale, input.section), models: catalog, slack };
  } },
  { path: "/data-agent/profile", needsUrl: false, handler: async ctx => {
    const { tenant, principal } = identity(ctx); return { profile: saveProfile(tenant.id, principal, ctx.body) };
  } },
  { path: "/data-agent/query", needsUrl: false, handler: async ctx => {
    const { tenant } = identity(ctx); return readModel(tenant, ctx.body);
  } },
];
