import { z } from "zod";
import type { ConsoleRoute, HandlerContext } from "./util.js";
import { TenantAccessError } from "../tenants/context.js";
import * as crm from "../crm/service.js";
import { capabilities } from "../crm/plugins.js";
import { drainCommerce } from "../crm/commerce.js";
export function crmPrincipal(ctx: HandlerContext): crm.Principal {
  const tenant = ctx.tenancy?.tenant,
    user = ctx.user;
  if (
    !tenant ||
    tenant.status !== "active" ||
    ctx.tenancy?.platformAdmin ||
    !user?.sub ||
    user.preferred_username?.startsWith("service-account-") ||
    user.realm_access?.roles?.includes("ai-agent")
  )
    throw new TenantAccessError("CRM_ACCESS");
  return {
    tenant,
    actor: user.sub,
    admin: ctx.tenancy?.role === "tenant-admin",
  };
}
const writes: Record<
  string,
  (p: crm.Principal, key: string, input: unknown) => unknown
> = {
  configure: crm.configure,
  contact: crm.createNative,
  "identity/link": crm.linkIdentity,
  "event/link": crm.linkEvent,
  "identity/unlink": crm.unlink,
  manual: crm.addManual,
  grant: crm.grant,
  "contact/status": crm.setContactStatus,
  "contact/erase": crm.erase,
};
const reads: Record<string, (p: crm.Principal, input: unknown) => unknown> = {
  overview: (p, input) => ({
    ...crm.overview(p, input),
    capabilities: capabilities(p.tenant.id),
  }),
  timeline: (p, input) => {
    crm.access(p);
    const sync = drainCommerce(p.tenant);
    return { ...crm.timeline(p, input), sync };
  },
  contact: crm.detail,
  export: crm.exportContact,
  sync: (p, input) => {
    crm.access(p, true);
    z.object({}).strict().parse(input);
    return drainCommerce(p.tenant, true);
  },
};
export const crmRoutes: ConsoleRoute[] = [
  ...Object.entries(writes).map(([path, fn]) => ({
    path: "/crm/" + path,
    needsUrl: false,
    handler: async (ctx: HandlerContext) => {
      const i = z
        .object({ key: z.string(), input: z.unknown() })
        .strict()
        .parse(ctx.body);
      return fn(crmPrincipal(ctx), i.key, i.input);
    },
  })),
  ...Object.entries(reads).map(([path, fn]) => ({
    path: "/crm/" + (path === "contact" ? "contact/detail" : path),
    needsUrl: false,
    handler: async (ctx: HandlerContext) => fn(crmPrincipal(ctx), ctx.body),
  })),
].map((route) => ({
  ...route,
  handler: async (ctx: HandlerContext) => {
    try {
      return await route.handler(ctx);
    } catch (e) {
      if (e instanceof TenantAccessError) throw e;
      const code =
        e instanceof Error && /^CRM_[A-Z_]+$/.test(e.message)
          ? e.message
          : "CRM_INVALID";
      throw new TenantAccessError(
        code,
        code === "CRM_ACCESS" ? 403 : code.includes("CONFLICT") ? 409 : 400,
      );
    }
  },
}));
