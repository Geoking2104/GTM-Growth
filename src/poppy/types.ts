import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
export const models = ["workspace", "search", "analytics", "visibility", "operations"] as const;
export const scopes = models.map(m => `gtm:${m}:read`);
export const resourcesSchema = z.object({ domains: z.array(z.string().max(2048)).max(100), search: z.array(z.string().max(2048)).max(100), analytics: z.array(z.string().max(2048)).max(100) }).strict();
export type Resources = z.infer<typeof resourcesSchema>;
export type Principal = {
    issuer: string;
    user: string;
    session: string;
};
export type Grant = Principal & {
    id: string;
    client: string;
    clientName: string;
    tenant: string;
    scopes: string[];
    resources: Resources;
    created: number;
    expires: number;
    lastUsed: number | null;
    revoked: number | null;
};
export type Client = {
    client_id: string;
    client_name: string;
    jwks_uri: string;
    redirect_uris: string[];
    keys: Record<string, unknown>[];
};
export type Token = {
    grant: string;
    client: string;
    scopes: string[];
    resource: string;
    expires: number;
};
export type Pending = {
    client: string;
    clientName: string;
    redirect: string;
    state?: string;
    challenge: string;
    scopes: string[];
    browser: string;
    expires: number;
};
export type Code = {
    grant: string;
    client: string;
    redirect: string;
    challenge: string;
    expires: number;
};
export const now = () => Math.floor(Date.now() / 1000);
export const random = () => randomBytes(32).toString("base64url");
export const hash = (v: string) => createHash("sha256").update(v).digest("base64url");
export class PapError extends Error {
    constructor(public status: number, public code: string) { super(code); }
}
export function demand(value: unknown, code = "invalid_request", status = 400): asserts value { if (!value)
    throw new PapError(status, code); }
export type PapConfig = {
    origin: string;
    issuer: string;
    clients: string[];
    path: string;
};
export function configFromEnv(): PapConfig | null {
    if (process.env.PAP_ENABLED !== "true")
        return null;
    for (const name of ["OIDC_ISSUER", "KEYCLOAK_INTERNAL_URL", "PAP_MEMBERSHIP_CLIENT_ID", "PAP_MEMBERSHIP_CLIENT_SECRET"]) {
        if (!process.env[name]) throw new Error(`PAP requires ${name} before activation`);
    }
    const raw = process.env.PAP_PUBLIC_ORIGIN ?? "";
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.origin !== raw || u.username || u.password)
        throw new Error("PAP_PUBLIC_ORIGIN must be an exact HTTPS origin without trailing slash");
    const clients = (process.env.PAP_ALLOWED_CLIENTS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    if (!clients.length)
        throw new Error("PAP_ALLOWED_CLIENTS is required");
    return { origin: raw, issuer: `${raw}/api/poppy/oauth`, clients, path: process.env.PAP_DB_PATH ?? "data/poppy.sqlite3" };
}
