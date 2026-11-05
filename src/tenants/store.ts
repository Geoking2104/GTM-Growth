/**
 * Tenant registry (GTM Growth clients). One record per client tenant; the
 * Keycloak side (organization or dedicated realm) is the identity source, this
 * file holds what the API scopes data with: domains, GSC properties, branding.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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
  /** GTM containers (accounts/<id>/containers/<id>) the tenant may read/write. */
  gtmContainers?: string[];
  /** Microsoft Clarity project ids (free) used by the tenant sites. */
  clarityProjects?: string[];
  /** Google key file name (same folder as GOOGLE_APPLICATION_CREDENTIALS) to use for this tenant. Never sent to the browser. */
  googleCredential?: string;
  /** Business segmentation does not grant access to other tenants. */
  usageType?: "company" | "agency";
  /** GSC queries selected by an administrator, keyed by authorized property. */
  watchedQueries?: Record<string, string[]>;
  /** Human-reviewed profiles keyed by an authorized domain. */
  siteProfiles?: Record<string, { name: string; description: string; industry: string }>;
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

const connections = new Map<string, Database.Database>();

/** A local SQLite database coordinates writers on the same host. */
export class TenantStore {
  constructor(private file: string = process.env.TENANTS_PATH ?? "data/tenants.json") {}

  private database(): Database.Database {
    const legacy = path.resolve(this.file);
    const file = `${legacy}.sqlite3`;
    const cached = connections.get(file);
    if (cached) return cached;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try { const fd = fs.openSync(file, "wx", 0o600); fs.closeSync(fd); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const db = new Database(file, { timeout: 10000 });
    try {
      db.pragma("busy_timeout = 10000"); db.pragma("journal_mode = DELETE"); db.pragma("synchronous = FULL");
      db.exec("CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)");
      const migrate = db.transaction(() => {
        if (db.prepare("SELECT 1 FROM migrations WHERE name = ?").get("legacy-json")) return;
        if (fs.existsSync(legacy)) {
          const data: unknown = JSON.parse(fs.readFileSync(legacy, "utf8"));
          if (!Array.isArray(data)) throw new Error("Invalid tenant registry");
          const insert = db.prepare("INSERT INTO tenants (id, payload) VALUES (?, ?)");
          for (const tenant of data) {
            if (!tenant || typeof tenant !== "object" || typeof tenant.id !== "string" || !validTenantId(tenant.id) || !Array.isArray(tenant.domains) || !Array.isArray(tenant.emailDomains) || !Array.isArray(tenant.gscProperties)) throw new Error("Invalid tenant registry entry");
            insert.run(tenant.id, JSON.stringify(tenant));
          }
        }
        db.prepare("INSERT INTO migrations (name) VALUES (?)").run("legacy-json");
      });
      migrate.immediate();
      connections.set(file, db);
      return db;
    } catch (error) { db.close(); throw error; }
  }

  list(): Tenant[] {
    return (this.database().prepare("SELECT payload FROM tenants ORDER BY rowid").all() as { payload: string }[]).map((row) => JSON.parse(row.payload) as Tenant);
  }
  get(id: string): Tenant | undefined {
    const row = this.database().prepare("SELECT payload FROM tenants WHERE id = ?").get(id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as Tenant : undefined;
  }
  byIssuer(issuer: string): Tenant | undefined { return this.list().find((t) => t.mode === "realm" && t.issuer === issuer); }
  byEmailDomain(email: string): Tenant | undefined {
    const domain = email.split("@").pop()?.trim().toLowerCase();
    return domain ? this.list().find((t) => t.status === "active" && t.emailDomains.includes(domain)) : undefined;
  }
  upsert(tenant: Tenant, expected?: Tenant): Tenant {
    if (!validTenantId(tenant.id)) throw new Error(`identifiant de tenant invalide : ${tenant.id}`);
    const clean: Tenant = { ...tenant, domains: [...new Set(tenant.domains.map(normalizeHost))], emailDomains: [...new Set(tenant.emailDomains.map((d) => d.toLowerCase()))] };
    const db = this.database();
    const write = db.transaction(() => {
      if (expected) {
        const row = db.prepare("SELECT payload FROM tenants WHERE id = ?").get(tenant.id) as { payload: string } | undefined;
        if (!row || row.payload !== JSON.stringify(expected)) throw new TenantConflictError();
      }
      db.prepare("INSERT INTO tenants (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload").run(clean.id, JSON.stringify(clean));
    });
    write.immediate();
    return clean;
  }
}

export class TenantConflictError extends Error {
  constructor() { super("Le tenant a été modifié simultanément. Actualisez et réessayez."); }
}

export function closeTenantStores() { for (const db of connections.values()) db.close(); connections.clear(); }

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

export function tenantOwnsGtmContainer(tenant: Tenant, container: string): boolean {
  return (tenant.gtmContainers ?? []).some((c) => container === c || container.startsWith(`${c}/`));
}
