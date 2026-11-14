import { z } from "zod";
import type { ConsoleRoute, HandlerContext } from "./util.js";
import { TenantAccessError } from "../tenants/context.js";
import * as social from "../social/service.js";
import { readback } from "../social/worker.js";
import { id } from "../social/model.js";
export function socialPrincipal(ctx: HandlerContext): social.Principal {
  const user = ctx.user,
    tenant = ctx.tenancy?.tenant;
  if (
    !tenant ||
    tenant.status !== "active" ||
    !user?.sub ||
    ctx.tenancy?.platformAdmin ||
    user.preferred_username?.startsWith("service-account-") ||
    user.realm_access?.roles?.includes("ai-agent")
  )
    throw new TenantAccessError("SOCIAL_ACCESS");
  return {
    tenant,
    actor: user.sub,
    admin: ctx.tenancy?.role === "tenant-admin",
  };
}
const mutations: Record<
  string,
  (p: social.Principal, key: string, input: unknown) => unknown
> = {
  campaign: social.saveCampaign,
  "campaign/status": social.transitionCampaign,
  post: social.savePost,
  "approval/request": social.requestApproval,
  "approval/decide": social.decide,
  publish: social.execute,
  creator: social.saveCreator,
  "creator/update": social.updateCreator,
  outreach: social.saveOutreach,
  "outreach/update": social.updateOutreach,
  "outreach/receipt": social.recordOutreach,
  "analytics/import": social.importAnalytics,
  queue: social.queue,
  grant: social.grant,
};
export const socialRoutes: ConsoleRoute[] = [
  ...Object.entries(mutations).map(([path, fn]) => ({
    path: "/social/" + path,
    needsUrl: false,
    handler: async (ctx: HandlerContext) => {
      const p = socialPrincipal(ctx);
      const i = z
        .object({ key: z.string(), input: z.unknown() })
        .strict()
        .parse(ctx.body);
      try {
        return fn(p, i.key, i.input);
      } catch (e) {
        if (e instanceof z.ZodError)
          throw new TenantAccessError("SOCIAL_INVALID", 400);
        throw e;
      }
    },
  })),
  {
    path: "/social/state",
    needsUrl: false,
    handler: async (ctx) => social.socialState(socialPrincipal(ctx)),
  },
  {
    path: "/social/analytics",
    needsUrl: false,
    handler: async (ctx) =>
      social.analyticsReport(socialPrincipal(ctx), ctx.body),
  },
  {
    path: "/social/export",
    needsUrl: false,
    handler: async (ctx) => social.exportSocial(socialPrincipal(ctx)),
  },
  {
    path: "/social/readback",
    needsUrl: false,
    handler: async (ctx) => {
      const p = socialPrincipal(ctx);
      if (!p.admin) throw new TenantAccessError("SOCIAL_ACCESS");
      const i = z.object({ postId: id }).strict().parse(ctx.body);
      return readback(p.tenant.id, i.postId);
    },
  },
];
