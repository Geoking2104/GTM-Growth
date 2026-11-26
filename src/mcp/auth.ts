/**
 * MCP HTTP authentication: OAuth 2.1 access tokens (Keycloak JWTs) and the
 * optional operator-only static bearer (MCP_API_TOKEN).
 */
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { IssuerKeys, oidcConfigFromEnv, verifyAccessToken, type OidcConfig, type JwksLoader } from "../console/auth.js";
import { listOrganizationMemberships, resolveTenant, TenantAccessError } from "../tenants/context.js";
import { TenantStore } from "../tenants/store.js";
import {
  hasScope,
  isWriteToolCall,
  MCP_READ_SCOPES,
  MCP_WRITE_SCOPES,
  parseScopes,
  runWithMcpAuth,
  type McpAuthContext,
} from "./context.js";
import { mcpResourceConfig, wwwAuthenticate, type McpResourceConfig } from "./resource.js";

export interface McpAuthOptions {
  env?: NodeJS.ProcessEnv;
  store?: TenantStore;
  oidc?: OidcConfig | null;
  resource?: McpResourceConfig | null;
  jwksLoader?: JwksLoader;
}

export function staticTokenEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.MCP_API_TOKEN) return false;
  const flag = env.MCP_STATIC_TOKEN_ENABLED;
  if (flag === "false" || flag === "0") return false;
  return true;
}

function bearer(req: Request): string {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function sameToken(incoming: string, expected: string): boolean {
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function mcpOidcConfig(resource: McpResourceConfig, base?: OidcConfig | null, env: NodeJS.ProcessEnv = process.env): OidcConfig {
  const fallback = base ?? oidcConfigFromEnv(env);
  if (!fallback) {
    return {
      issuer: resource.issuer,
      extraIssuers: resource.extraIssuers,
      clientId: resource.resource,
      audiences: [resource.resource],
      jwksUrl: env.OIDC_JWKS_URL || `${resource.issuer}/protocol/openid-connect/certs`,
      internalBaseUrl: env.KEYCLOAK_INTERNAL_URL?.replace(/\/$/, "") || undefined,
    };
  }
  return {
    ...fallback,
    // Console tokens (aud/azp = gtm-console) must not be accepted here.
    clientId: resource.resource,
    audiences: [resource.resource],
    requiredRole: undefined,
  };
}

function requestedTenant(req: Request): string | undefined {
  const raw = req.headers["x-tenant"] ?? req.headers["mcp-tenant"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

export function requireMcpAuth(options: McpAuthOptions = {}) {
  const env = options.env ?? process.env;
  const resource = options.resource === undefined ? mcpResourceConfig(env) : options.resource;
  const store = options.store ?? new TenantStore();
  const oidc = resource ? mcpOidcConfig(resource, options.oidc === undefined ? oidcConfigFromEnv(env) : options.oidc, env) : null;
  const keys = oidc ? new IssuerKeys(oidc, options.jwksLoader) : null;
  const staticEnabled = staticTokenEnabled(env);
  const staticValue = staticEnabled ? env.MCP_API_TOKEN : undefined;

  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearer(req);
    const challenge = (status: number, error?: string, description?: string, scope?: string) => {
      if (resource) res.setHeader("WWW-Authenticate", wwwAuthenticate(resource, { error, description, scope }));
      return res.status(status).json({ error: description || "Unauthorized: invalid or missing bearer token" });
    };

    if (!token) {
      if (!resource && !staticValue) return next();
      return challenge(401, "invalid_token", "Authentification requise.");
    }

    if (staticValue && sameToken(token, staticValue)) {
      const ctx: McpAuthContext = {
        mode: "static",
        sub: "operator:static",
        scopes: ["mcp:read", "mcp:write"],
        tenant: null,
        role: "operator",
        platformAdmin: true,
        memberships: [],
      };
      res.locals.mcpAuth = ctx;
      return runWithMcpAuth(ctx, () => next());
    }

    if (!oidc || !keys || !resource) {
      return challenge(401, "invalid_token", "Jeton refusé.");
    }

    try {
      const claims = await verifyAccessToken(token, oidc, keys);
      const azp = claims.azp ?? "";
      // Tokens issued to first-party realm clients (console, account) must not
      // unlock MCP even if a shared audience mapper later appears on them.
      if (["gtm-console", "account", "admin-cli", "security-admin-console", "broker"].includes(azp)) {
        throw new Error("bad audience");
      }
      const scopes = parseScopes(claims.scope ?? claims.scp);
      let tenancy;
      try {
        tenancy = resolveTenant(claims, store, oidc.issuer, requestedTenant(req));
      } catch (error) {
        if (!(error instanceof TenantAccessError) || error.status !== 409) throw error;
        const memberships = listOrganizationMemberships(claims, store, oidc.issuer);
        tenancy = { tenant: null, role: "tenant-user" as const, platformAdmin: false, memberships };
      }
      const ctx: McpAuthContext = {
        mode: "oauth",
        sub: String(claims.sub ?? ""),
        email: claims.email,
        scopes,
        tenant: tenancy.tenant,
        role: tenancy.role,
        platformAdmin: tenancy.platformAdmin,
        memberships: tenancy.memberships,
      };
      if (!hasScope(ctx, MCP_READ_SCOPES)) {
        return challenge(403, "insufficient_scope", "Le jeton n'a pas le droit mcp:read.", "mcp:read");
      }
      res.locals.mcpAuth = ctx;
      return runWithMcpAuth(ctx, () => next());
    } catch (error) {
      if (error instanceof TenantAccessError) {
        return res.status(error.status).json({ error: error.message });
      }
      return challenge(401, "invalid_token", `Jeton refusé : ${(error as Error).message}`);
    }
  };
}

/** After auth: reject write tool calls that lack mcp:write. */
export function requireMcpWriteScope(req: Request, res: Response, next: NextFunction) {
  const ctx = (res.locals.mcpAuth ?? null) as McpAuthContext | null;
  if (!ctx) return next();
  const body = req.body as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } | undefined;
  if (body?.method !== "tools/call") return next();
  const name = body.params?.name;
  if (!name || !isWriteToolCall(name, body.params?.arguments)) return next();
  if (hasScope(ctx, MCP_WRITE_SCOPES)) return next();
  const resource = mcpResourceConfig();
  if (resource) {
    res.setHeader("WWW-Authenticate", wwwAuthenticate(resource, { error: "insufficient_scope", description: "mcp:write required", scope: "mcp:write" }));
  }
  return res.status(403).json({ error: "Ce changement demande le droit mcp:write." });
}
