import type { Tenant } from "../tenants/store.js";
import { PapError, type Principal } from "./types.js";
export type MemberReader = (p: Principal, tenant: Tenant) => Promise<"tenant-admin" | "tenant-user" | null>;
/** Operator-owned endpoint only. Never use an agent-provided URL for identity. */
export function membershipReader(): MemberReader {
    const base = process.env.KEYCLOAK_INTERNAL_URL?.replace(/\/$/, "");
    const id = process.env.PAP_MEMBERSHIP_CLIENT_ID, secret = process.env.PAP_MEMBERSHIP_CLIENT_SECRET;
    const authRealm = process.env.PAP_MEMBERSHIP_AUTH_REALM ?? "gtm-growth";
    let token = "", expiry = 0;
    async function json(url: string, init: RequestInit) {
        const r = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(4000) });
        if (r.status === 404)
            return null;
        if (!r.ok) {
            if (r.status === 401)
                expiry = 0;
            throw new PapError(503, "identity_unavailable");
        }
        const reader = r.body?.getReader();
        if (!reader)
            throw new PapError(503, "identity_unavailable");
        let size = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > 512 * 1024) {
                await reader.cancel();
                throw new PapError(503, "identity_unavailable");
            }
            chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    return async (p, tenant) => {
        if (tenant.status !== "active" || p.issuer !== tenant.issuer || !p.session)
            return null;
        if (!base || !id || !secret)
            throw new PapError(503, "identity_unavailable");
        try {
            const realm = /^\/realms\/([^/]+)$/.exec(new URL(p.issuer).pathname)?.[1];
            if (!realm)
                return null;
            if (Date.now() >= expiry) {
                const data = await json(`${base}/realms/${encodeURIComponent(authRealm)}/protocol/openid-connect/token`, { method: "POST", body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }) });
                if (!data || typeof data.access_token !== "string")
                    throw new Error("No identity token");
                token = data.access_token;
                expiry = Date.now() + Math.max(0, Number(data.expires_in) - 20) * 1000;
            }
            const prefix = `${base}/admin/realms/${realm}`;
            const userPath = `/users/${encodeURIComponent(p.user)}`;
            const get = (path: string) => json(prefix + path, { headers: { Authorization: `Bearer ${token}` } });
            const [user, sessions] = await Promise.all([get(userPath), get(`${userPath}/sessions`)]);
            if (!user?.enabled || !Array.isArray(sessions) || !sessions.some(s => s.id === p.session))
                return null;
            if (tenant.mode === "realm") {
                const roles = await get(`${userPath}/role-mappings/realm/composite`);
                return Array.isArray(roles) && roles.some(r => r.name === "tenant-admin") ? "tenant-admin" : Array.isArray(roles) && roles.some(r => r.name === "tenant-user") ? "tenant-user" : null;
            }
            if (!tenant.organizationId)
                return null;
            const member = await get(`/organizations/${encodeURIComponent(tenant.organizationId)}/members/${encodeURIComponent(p.user)}`);
            if (!member || member.id !== p.user)
                return null;
            // Pagination is explicit; a very large membership list fails closed instead of guessing.
            const groups: {
                path?: string;
            }[] = [];
            for (let first = 0; first < 1000; first += 100) {
                const page = await get(`${userPath}/groups?first=${first}&max=100&briefRepresentation=false`);
                if (!Array.isArray(page))
                    return null;
                groups.push(...page);
                if (page.length < 100)
                    break;
                if (first === 900)
                    throw new PapError(503, "identity_unavailable");
            }
            return groups.some(g => g.path === `/tenants/${tenant.id}/tenant-admin`) ? "tenant-admin" : groups.some(g => g.path === `/tenants/${tenant.id}/tenant-user`) ? "tenant-user" : null;
        }
        catch {
            throw new PapError(503, "identity_unavailable");
        }
    };
}
