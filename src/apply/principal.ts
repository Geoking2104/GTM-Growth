/** Map trusted Keycloak + tenant middleware output to the four Apply Mode roles. */
import type { TokenClaims } from "../console/auth.js";
import type { TenantContext } from "../tenants/context.js";
import type { ApplyRole } from "./approval.js";

export interface ApplyPrincipal {
  tenantId: string;
  actorId: string;
  role: ApplyRole;
}

/** Never accept actor, tenant or role from the HTTP request body. */
export function applyPrincipalFromSession(
  claims: TokenClaims | undefined,
  tenancy: TenantContext | undefined,
): ApplyPrincipal {
  const tenant = tenancy?.tenant;
  const actorId = claims?.sub;
  if (!tenant || tenant.status !== "active" || !actorId ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(actorId)) {
    throw new Error("Apply Mode requires an authenticated principal in an active tenant");
  }

  let role: ApplyRole = "reader";
  if (tenancy.platformAdmin || tenancy.role === "tenant-admin") role = "admin";
  else if (tenancy.role === "tenant-user") {
    // Shared realm: verified tenant membership is already established by
    // resolveTenant; only an EXACT tenant-scoped Apply group adds privileges.
    const groups = claims?.groups ?? [];
    const realmRoles = claims?.realm_access?.roles ?? [];
    const approver = tenant.mode === "realm" ? realmRoles.includes("apply-approver")
      : groups.includes(`/tenants/${tenant.id}/apply-approver`);
    const editor = tenant.mode === "realm" ? realmRoles.includes("apply-editor")
      : groups.includes(`/tenants/${tenant.id}/apply-editor`);
    role = approver ? "approver" : editor ? "editor" : "reader";
  }
  return { tenantId: tenant.id, actorId, role };
}
