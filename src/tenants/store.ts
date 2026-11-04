/**
 * Tenant registry (GTM Growth clients). One record per client tenant; the
 * Keycloak side (organization or dedicated realm) is the identity source, this
 * file holds what the API scopes data with: domains, GSC properties, branding.
 */

import fs from "node:fs";
import path from "node:path";

export type TenantMode = "organization" | "realm";
export interface TenantBranding { displayName?: string; logoUrl?: string; primaryColor?: string; }
export interface Tenant {
  /** Stable slug: Keycloak organization alias (or realm name), subdomain `<id>.gtm.kayroslab.com`. */
  id: string;
  name: string;
  mode: TenantMode;
  /** Token issuer of the tenant (shared realm for organizations, own realm otherwise). */
  issuer: string;
  /** Keycloak organization id (mode organization). */
  organizationId?: string;
  /** Websites the tenant may analyse (host names; subdomains included). */
  domains: string[];
  /** Email domains used for login discovery and organization membership. */
  emailDomains: string[];
  /** Search Console properties the tenant may query. */
  gscProperties: string[];
  /** GA4 property ids (numeric) the tenant may query. */
  ga4Properties?: string[];
  /** Bing Webmaster Tools site URLs (https://…/) the tenant may query. */
  bingSites?: string[];
  /** Bing Webmaster API key of the tenant (free). Server-side only, never returned to the browser. */
  bingApiKey?: string;
  branding: TenantBranding;
  /** Identity providers brokered for this tenant (aliases only, never secrets). */
  identityProviders: string[];
  status: "active" | "suspended";
  createdAt: string;
}

export const TENANT_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const RESERVED_IDS = new Set(["www", "api", "auth", "admin", "gtm", "console", "master", "gtm-growth", "platform", "static"]);

export function validTenantId(id: string): boolean {
  return TENANT_ID_RE.test(id) && !RESERVED_IDS.has(id);
}

export const normalizeHost = (value: string): string => {
  const v = value.trim().toLowerCase();
  try { return new URL(/^https?:\/\//.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, ""); } catch { return v; }
};

export class TenantStore {
  private cache: { mtime: number; tenants: Tenant[] } | null = null;
  constructor(private file: string = process.env.TENANTS_PATH ?? "data/tenants.json") {}

  list(): Tenant[] {
    if (!fs.existsSync(this.file)) return [];
    const mtime = fs.statSync(this.file).mtimeMs;
    if (this.cache?.mtime === mtime) return this.cache.tenants;
    const tenants = JSON.parse(fs.readFileSync(this.file, "utf8")) as Tenant[];
    this.cache = { mtime, tenants };
    return tenants;
  }

  get(id: string): Tenant | undefined { return this.list().find((t) => t.id === id); }

  byIssuer(issuer: string): Tenant | undefined { return this.list().find((t) => t.mode === "realm" && t.issuer === issuer); }

  byEmailDomain(email: string): Tenant | undefined {
    const domain = email.split("@").pop()?.trim().toLowerCase();
    return domain ? this.list().find((t) => t.status === "active" && t.emailDomains.includes(domain)) : undefined;
  }

  upsert(tenant: Tenant): Tenant {
    if (!validTenantId(tenant.id)) throw new Error(`identifiant de tenant invalide : ${tenant.id}`);
    const all = this.list().filter((t) => t.id !== tenant.id);
    const clean: Tenant = { ...tenant, domains: [...new Set(tenant.domains.map(normalizeHost))], emailDomains: [...new Set(tenant.emailDomains.map((d) => d.toLowerCase()))] };
    all.push(clean);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.cache = null;
    return clean;
  }
}

/** True when `url` belongs to one of the tenant's domains (exact host or subdomain). */
export function tenantOwnsUrl(tenant: Tenant, url: string): boolean {
  const host = normalizeHost(url);
  return tenant.domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function tenantOwnsProperty(tenant: Tenant, property: string): boolean {
  return tenant.gscProperties.includes(property.trim());
}

export function tenantOwnsGa4(tenant: Tenant, propertyId: string): boolean {
  return (tenant.ga4Properties ?? []).includes(propertyId.trim().replace(/^properties\//, ""));
}

/** Bing site: explicitly listed, or on one of the tenant's domains. */
export function tenantOwnsBingSite(tenant: Tenant, site: string): boolean {
  return (tenant.bingSites ?? []).includes(site.trim()) || tenantOwnsUrl(tenant, site);
}
