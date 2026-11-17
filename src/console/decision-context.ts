import { createHash } from "node:crypto";
import { TenantAccessError } from "../tenants/context.js";
import { tenantOwnsUrl, tenantOwnsGtmContainer, tenantOwnsGa4 } from "../tenants/store.js";
import type { HandlerContext } from "./util.js";
export const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function decisionPrincipal(ctx: HandlerContext, write = false) {
  const tenant = ctx.tenancy?.tenant, user = ctx.user;
  if (!tenant || tenant.status !== "active" || !user?.sub || user.preferred_username?.startsWith("service-account-") || user.realm_access?.roles?.includes("ai-agent")) throw new TenantAccessError("DECISION_ACCESS");
  const membership = ctx.tenancy?.memberships.find(m => m.id === tenant.id);
  // An agency portfolio is membership-based, never platform-admin enumeration.
  if (!membership || (write && membership.role !== "tenant-admin")) throw new TenantAccessError("DECISION_ACCESS");
  return { tenant, actor: user.sub, admin: membership.role === "tenant-admin" };
}
export function ownedPage(ctx: HandlerContext, url: string) {
  const { tenant } = decisionPrincipal(ctx); const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !tenantOwnsUrl(tenant, parsed.href)) throw new TenantAccessError("DECISION_PAGE_SCOPE");
  return parsed.href;
}
export function ownedMeasurement(ctx: HandlerContext, container: string, property?: string, workspace?: string) {
  const { tenant } = decisionPrincipal(ctx);
  if (!/^accounts\/\d+\/containers\/\d+$/.test(container) || !tenantOwnsGtmContainer(tenant, container)) throw new TenantAccessError("DECISION_CONTAINER_SCOPE");
  if (workspace && (!/^accounts\/\d+\/containers\/\d+\/workspaces\/\d+$/.test(workspace) || !workspace.startsWith(container + '/workspaces/'))) throw new TenantAccessError("DECISION_WORKSPACE_SCOPE");
  if (property && !tenantOwnsGa4(tenant, property)) throw new TenantAccessError("DECISION_PROPERTY_SCOPE");
}
