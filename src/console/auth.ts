/**
 * OIDC protection for the console API (Keycloak).
 *
 * Bearer access tokens issued by the Keycloak realm are validated locally:
 * signature against the realm JWKS (RS256/PS256/ES256), issuer, expiry,
 * not-before and audience/azp. No third-party JWT library — node:crypto only.
 *
 * Config (env):
 *   OIDC_ISSUER     e.g. https://auth.kayroslab.com/realms/gtm-growth (required)
 *   OIDC_CLIENT_ID  default "gtm-console" (checked against aud or azp)
 *   OIDC_JWKS_URL   default `${OIDC_ISSUER}/protocol/openid-connect/certs`
 *   OIDC_REQUIRED_ROLE optional realm role (e.g. "console-user")
 */

import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface OidcConfig {
  /** Primary issuer (shared realm `gtm-growth`, tenants = Keycloak Organizations). */
  issuer: string;
  /** Extra trusted issuers: dedicated realms for tenants that need full isolation/branding. */
  extraIssuers?: string[];
  clientId: string;
  /** JWKS of the primary issuer (may point at the internal Keycloak URL). */
  jwksUrl: string;
  /** Internal Keycloak base (e.g. http://keycloak:8080) used to fetch JWKS of any trusted issuer. */
  internalBaseUrl?: string;
  requiredRole?: string;
  /** Dynamic trust (e.g. dedicated realms of registered tenants). */
  trustIssuer?: (issuer: string) => boolean;
  /** Clock tolerance in seconds. */
  leeway?: number;
}

export interface TokenClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  azp?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  /** Keycloak 26 Organizations: aliases (or alias → attributes map) of the user's organizations. */
  organization?: string[] | Record<string, unknown>;
  /** Group full paths, e.g. /tenants/acme/tenant-admin. */
  groups?: string[];
  [key: string]: unknown;
}

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
export type JwksLoader = (url: string) => Promise<{ keys: Jwk[] }>;

const b64url = (value: string): Buffer => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function oidcConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OidcConfig | null {
  const issuer = env.OIDC_ISSUER?.replace(/\/$/, "");
  if (!issuer) return null;
  return {
    issuer,
    extraIssuers: (env.OIDC_EXTRA_ISSUERS ?? "").split(",").map((v) => v.trim().replace(/\/$/, "")).filter(Boolean),
    clientId: env.OIDC_CLIENT_ID || "gtm-console",
    jwksUrl: env.OIDC_JWKS_URL || `${issuer}/protocol/openid-connect/certs`,
    internalBaseUrl: env.KEYCLOAK_INTERNAL_URL?.replace(/\/$/, "") || undefined,
    requiredRole: env.OIDC_REQUIRED_ROLE || undefined,
  };
}

export function trustedIssuers(config: OidcConfig): string[] {
  return [config.issuer, ...(config.extraIssuers ?? [])];
}

/** JWKS URL for a trusted issuer, rewritten to the internal Keycloak URL when configured. */
export function jwksUrlFor(config: OidcConfig, issuer: string): string {
  if (issuer === config.issuer) return config.jwksUrl;
  const certs = `${issuer}/protocol/openid-connect/certs`;
  if (!config.internalBaseUrl) return certs;
  const u = new URL(certs);
  return `${config.internalBaseUrl}${u.pathname}`;
}

/** One JWKS cache per trusted issuer. */
export class IssuerKeys {
  private caches = new Map<string, JwksCache>();
  constructor(private config: OidcConfig, private loader?: JwksLoader) {}
  for(issuer: string): JwksCache {
    let c = this.caches.get(issuer);
    if (!c) { c = new JwksCache(jwksUrlFor(this.config, issuer), this.loader); this.caches.set(issuer, c); }
    return c;
  }
}

const defaultLoader: JwksLoader = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  return (await res.json()) as { keys: Jwk[] };
};

export class JwksCache {
  private keys = new Map<string, Jwk>();
  private fetchedAt = 0;
  constructor(private url: string, private loader: JwksLoader = defaultLoader, private ttlMs = 10 * 60_000) {}

  async get(kid: string): Promise<Jwk | undefined> {
    const fresh = Date.now() - this.fetchedAt < this.ttlMs;
    if (!fresh || !this.keys.has(kid)) {
      // Refetch on unknown kid (key rotation), but at most every 30 s.
      if (!fresh || Date.now() - this.fetchedAt > 30_000) await this.refresh();
    }
    return this.keys.get(kid);
  }

  private async refresh(): Promise<void> {
    const { keys } = await this.loader(this.url);
    this.keys = new Map(keys.filter((k) => k.kid && k.use !== "enc").map((k) => [k.kid as string, k]));
    this.fetchedAt = Date.now();
  }
}

const ALGS: Record<string, { hash: string; opts?: object }> = {
  RS256: { hash: "sha256" },
  RS384: { hash: "sha384" },
  RS512: { hash: "sha512" },
  PS256: { hash: "sha256", opts: { padding: 6, saltLength: 32 } },
  ES256: { hash: "sha256", opts: { dsaEncoding: "ieee-p1363" } },
};

export async function verifyAccessToken(token: string, config: OidcConfig, keys: JwksCache | IssuerKeys, now = Date.now() / 1000): Promise<TokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  // The issuer is read before verification only to pick the JWKS; it must be in the allow-list.
  let unverifiedIss: unknown;
  try { unverifiedIss = (JSON.parse(b64url(parts[1]).toString("utf8")) as TokenClaims).iss; } catch { throw new Error("malformed token"); }
  if (typeof unverifiedIss !== "string" || !(trustedIssuers(config).includes(unverifiedIss) || config.trustIssuer?.(unverifiedIss))) throw new Error("bad issuer");
  const jwks = keys instanceof IssuerKeys ? keys.for(unverifiedIss) : keys;
  const header = JSON.parse(b64url(parts[0]).toString("utf8")) as { alg?: string; kid?: string };
  const alg = header.alg ? ALGS[header.alg] : undefined;
  if (!alg) throw new Error(`unsupported alg ${header.alg}`);
  if (!header.kid) throw new Error("missing kid");
  const jwk = await jwks.get(header.kid);
  if (!jwk) throw new Error("unknown signing key");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const ok = cryptoVerify(alg.hash, Buffer.from(`${parts[0]}.${parts[1]}`), { key, ...(alg.opts ?? {}) } as never, b64url(parts[2]));
  if (!ok) throw new Error("bad signature");

  const claims = JSON.parse(b64url(parts[1]).toString("utf8")) as TokenClaims;
  const leeway = config.leeway ?? 30;
  if (claims.iss !== unverifiedIss) throw new Error("bad issuer");
  if (typeof claims.exp !== "number" || claims.exp + leeway < now) throw new Error("token expired");
  if (typeof claims.nbf === "number" && claims.nbf - leeway > now) throw new Error("token not yet valid");
  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!aud.includes(config.clientId) && claims.azp !== config.clientId) throw new Error("bad audience");
  if (config.requiredRole && !(claims.realm_access?.roles ?? []).includes(config.requiredRole)) throw new Error("missing role");
  return claims;
}

/** Express middleware: 401 without a valid Keycloak token, 503 if OIDC is not configured. */
export function requireOidc(config: OidcConfig | null, loader?: JwksLoader) {
  const jwks = config ? new IssuerKeys(config, loader) : null;
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!config || !jwks) return res.status(503).json({ error: "Console SSO non configurée (OIDC_ISSUER manquant)." });
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="gtm-console"').json({ error: "Authentification requise." });
    try {
      (res.locals as { user?: TokenClaims }).user = await verifyAccessToken(token, config, jwks);
      return next();
    } catch (error) {
      return res.status(401).setHeader("WWW-Authenticate", 'Bearer error="invalid_token"').json({ error: `Jeton refusé : ${(error as Error).message}` });
    }
  };
}
