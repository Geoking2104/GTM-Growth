/**
 * Tenant resolution from a verified Keycloak token.
 *
 * - Shared realm (`gtm-growth`, Keycloak Organizations): membership = the
 *   `organization` claim AND a group `/tenants/<id>/<role>`; both must agree.
 * - Dedicated realm: the token issuer identifies the tenant; roles are realm roles.
 * - Platform super-admin (KayrosLab): realm role `platform-admin` in the shared
 *   realm; may act on any tenant by selecting it explicitly.
 */

import type { TokenClaims } from "../console/auth.js";
import type { Tenant, TenantStore } from "./store.js";

export type TenantRole = "tenant-admin" | "tenant-user";
export interface TenantContext {
  tenant: Tenant | null;
  role: TenantRole | "platform-admin";
  platformAdmin: boolean;
  /** Tenants this user may switch to. */
  memberships: { id: string; role: TenantRole }[];
}

export class TenantAccessError extends Error {
  constructor(message: string, readonly status = 403) { super(message); }
}

export function organizationsOf(claims: TokenClaims): string[] {
  const org = claims.organization;
  if (!org) return [];
  return Array.isArray(org) ? org.filter((v): v is string => typeof v === "string") : Object.keys(org);
}

const rank = (r: string) => (r === "tenant-admin" ? 2 : r === "tenant-user" ? 1 : 0);

export function resolveTenant(claims: TokenClaims, store: TenantStore, primaryIssuer: string, requested?: string): TenantContext {
  const realmRoles = claims.realm_access?.roles ?? [];

  // Dedicated realm tenant: the issuer is the tenant boundary.
  if (claims.iss !== primaryIssuer) {
    const tenant = claims.iss ? store.byIssuer(claims.iss) : undefined;
    if (!tenant || tenant.status !== "active") throw new TenantAccessError("Tenant inconnu ou suspendu pour cet émetteur.");
    if (requested && requested !== tenant.id) throw new TenantAccessError("Ce compte n'appartient pas à ce tenant.");
    const role = realmRoles.includes("tenant-admin") ? "tenant-admin" : realmRoles.includes("tenant-user") ? "tenant-user" : null;
    if (!role) throw new TenantAccessError("Aucun rôle tenant-admin ou tenant-user.");
    return { tenant, role, platformAdmin: false, memberships: [{ id: tenant.id, role }] };
  }

  const platformAdmin = realmRoles.includes("platform-admin");
  const orgs = new Set(organizationsOf(claims));
  const byTenant = new Map<string, TenantRole>();
  for (const g of claims.groups ?? []) {
    const m = /^\/tenants\/([a-z0-9-]+)\/(tenant-admin|tenant-user)$/.exec(g);
    if (!m || !orgs.has(m[1])) continue; // group without organization membership is ignored
    const t = store.get(m[1]);
    if (!t || t.mode !== "organization" || t.status !== "active") continue;
    if (rank(m[2]) > rank(byTenant.get(m[1]) ?? "")) byTenant.set(m[1], m[2] as TenantRole);
  }
  const memberships = [...byTenant].map(([id, role]) => ({ id, role }));

  if (platformAdmin) {
    if (!requested) return { tenant: null, role: "platform-admin", platformAdmin, memberships };
    const tenant = store.get(requested);
    if (!tenant) throw new TenantAccessError("Tenant inconnu.", 404);
    return { tenant, role: "platform-admin", platformAdmin, memberships };
  }

  if (!memberships.length) throw new TenantAccessError("Ce compte n'est rattaché à aucun tenant actif.");
  const pick = requested ?? (memberships.length === 1 ? memberships[0].id : undefined);
  if (!pick) throw new TenantAccessError("Plusieurs tenants : précisez l'en-tête X-Tenant.", 409);
  const role = byTenant.get(pick);
  if (!role) throw new TenantAccessError("Ce compte n'appartient pas à ce tenant.");
  return { tenant: store.get(pick)!, role, platformAdmin, memberships };
}
