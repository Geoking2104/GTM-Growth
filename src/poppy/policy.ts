import type { Tenant, TenantStore } from "../tenants/store.js";
import type { MemberReader } from "./membership.js";
import { demand, now, type Grant, type PapConfig, type Resources } from "./types.js";
import type { PapStore } from "./store.js";
export type Policy = {
    enabled: boolean;
    clients: string[];
};
export const availableResources = (t: Tenant): Resources => ({ domains: t.domains, search: t.gscProperties, analytics: t.ga4Properties ?? [] });
export function restrict(t: Tenant, r: Resources): Tenant {
    return { ...t, domains: t.domains.filter(x => r.domains.includes(x)), gscProperties: t.gscProperties.filter(x => r.search.includes(x)), ga4Properties: (t.ga4Properties ?? []).filter(x => r.analytics.includes(x)) };
}
export function resourceSubset(selected: Resources, available: Resources) { return (Object.keys(selected) as (keyof Resources)[]).every(k => selected[k].every(x => available[k].includes(x))); }
export async function authorized(id: string, store: PapStore, tenants: TenantStore, config: PapConfig, member: MemberReader): Promise<{
    grant: Grant;
    tenant: Tenant;
}> {
    const grant = store.active(id);
    const tenant = tenants.get(grant.tenant);
    const policy = store.get<Policy>("policy", grant.tenant);
    demand(tenant && tenant.status === "active" && policy?.enabled && policy.clients.includes(grant.client) && config.clients.includes(grant.client), "invalid_token", 401);
    if (!await member(grant, tenant)) {
        store.revoke(id);
        demand(false, "invalid_token", 401);
    }
    // Identity I/O yields: refresh ALL local policy/resource state afterwards.
    // A source removal during that I/O must not use the earlier tenant snapshot.
    const latestGrant = store.active(id);
    const latestTenant = tenants.get(grant.tenant);
    const latestPolicy = store.get<Policy>("policy", grant.tenant);
    demand(latestTenant && latestTenant.status === "active" && latestPolicy?.enabled && latestPolicy.clients.includes(grant.client) && config.clients.includes(grant.client), "invalid_token", 401);
    demand(latestTenant.issuer === tenant.issuer && latestTenant.organizationId === tenant.organizationId && latestTenant.mode === tenant.mode, "invalid_token", 401);
    demand(latestGrant.expires > now(), "invalid_token", 401);
    return { grant: latestGrant, tenant: restrict(latestTenant, latestGrant.resources) };
}
