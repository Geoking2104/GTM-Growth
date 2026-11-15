import { afterEach, expect, it, vi } from "vitest";
import { membershipReader } from "../src/poppy/membership.js";
import type { Tenant } from "../src/tenants/store.js";
const tenant: Tenant = { id: "acme", mode: "organization", name: "Acme", issuer: "https://auth.example/realms/gtm", organizationId: "org", status: "active", domains: [], emailDomains: [], gscProperties: [], branding: {}, identityProviders: [], createdAt: "2026-01-01" };
const principal = { issuer: tenant.issuer, user: "user", session: "session" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function setup(change: Record<string, unknown> = {}) {
    vi.stubEnv("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080");
    vi.stubEnv("PAP_MEMBERSHIP_CLIENT_ID", "reader");
    vi.stubEnv("PAP_MEMBERSHIP_CLIENT_SECRET", "secret");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        calls.push(url);
        let value: unknown = null;
        if (url.endsWith("/token"))
            value = { access_token: "reader-token", expires_in: 60 };
        else if (url.endsWith("/users/user"))
            value = change.user ?? { enabled: true };
        else if (url.endsWith("/sessions"))
            value = change.sessions ?? [{ id: "session" }];
        else if (url.includes("/organizations/")) {
            if (change.organization === false)
                return new Response("{}", { status: 404 });
            value = { id: "user" };
        }
        else if (url.includes("/groups?"))
            value = change.groups ?? [{ path: "/tenants/acme/tenant-admin" }];
        else if (url.includes("/role-mappings/"))
            value = change.roles ?? [{ name: "tenant-user" }];
        return new Response(JSON.stringify(value), { status: change.outage && !url.endsWith("/token") ? 503 : 200 });
    }));
    return { member: membershipReader(), calls };
}
it("requires a real organization and role, reads again on every call", async () => { const { member, calls } = setup(); expect(await member(principal, tenant)).toBe("tenant-admin"); expect(await member(principal, tenant)).toBe("tenant-admin"); expect(calls.filter(x => x.endsWith("/sessions"))).toHaveLength(2); expect(calls.filter(x => x.includes("/organizations/org/members/user"))).toHaveLength(2); });
it.each([{ user: { enabled: false } }, { sessions: [] }, { organization: false }, { groups: [{ path: "/tenants/other/tenant-admin" }] }, { groups: [{ path: "/platform-admin" }] }])("denies disabled, logged-out or removed members %j", async (change) => { const { member } = setup(change); expect(await member(principal, tenant)).toBeNull(); });
it("rejects an issuer mismatch without requesting identity data", async () => { const { member, calls } = setup(); expect(await member({ ...principal, issuer: "https://evil.example/realms/gtm" }, tenant)).toBeNull(); expect(calls).toHaveLength(0); });
it("checks effective roles for an explicitly mapped dedicated realm", async () => { const { member } = setup(); expect(await member(principal, { ...tenant, mode: "realm" })).toBe("tenant-user"); });
it("fails closed without returning upstream errors or credentials", async () => { const { member } = setup({ outage: true }); await expect(member(principal, tenant)).rejects.toThrow("identity_unavailable"); });
