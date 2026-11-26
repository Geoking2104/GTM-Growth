/**
 * Auth context for an MCP HTTP request (OAuth user or operator static token).
 * Stored in AsyncLocalStorage so tool handlers and getAuthClient() can read it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Tenant } from "../tenants/store.js";
import type { TenantRole } from "../tenants/context.js";
import {
  tenantOwnsBingSite,
  tenantOwnsGa4,
  tenantOwnsGtmContainer,
  tenantOwnsProperty,
  tenantOwnsUrl,
} from "../tenants/store.js";
import { TenantAccessError } from "../tenants/context.js";

export const MCP_READ_SCOPE = "mcp:read";
export const MCP_WRITE_SCOPE = "mcp:write";
/** Keycloak scope names may use a hyphen if a colon is rejected. */
export const MCP_READ_SCOPES = [MCP_READ_SCOPE, "mcp-read"];
export const MCP_WRITE_SCOPES = [MCP_WRITE_SCOPE, "mcp-write"];

/** Tools that write to Google or a third party and require confirm=true. */
export const MCP_WRITE_TOOLS = new Set([
  "create_custom_event_trigger",
  "create_ga4_event_tag",
  "create_ga4_event_setup",
  "submit_sitemap",
  "create_measurement_protocol_secret",
  "configure_measurement_protocol",
  "publish_url_notification",
  "publish_url_notifications",
  "indexnow_submit",
]);

export interface McpAuthContext {
  mode: "oauth" | "static";
  sub: string;
  email?: string;
  scopes: string[];
  tenant: Tenant | null;
  role: TenantRole | "platform-admin" | "operator";
  platformAdmin: boolean;
  memberships: { id: string; role: TenantRole }[];
}

const store = new AsyncLocalStorage<McpAuthContext>();

export function currentMcpAuth(): McpAuthContext | undefined {
  return store.getStore();
}

export function runWithMcpAuth<T>(ctx: McpAuthContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function hasScope(ctx: McpAuthContext, aliases: string[]): boolean {
  return ctx.scopes.some((s) => aliases.includes(s));
}

export function parseScopes(raw: unknown): string[] {
  if (typeof raw === "string") return raw.split(/[\s,]+/).filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  return [];
}

export function isWriteToolCall(name: string, args: Record<string, unknown> | undefined): boolean {
  if (name === "configure_measurement_protocol") {
    return args?.confirm === true || Boolean(args?.createSecretName);
  }
  return MCP_WRITE_TOOLS.has(name);
}

/** Restrict tool arguments to the caller's tenant. No-op for the operator static token. */
export function assertTenantScope(ctx: McpAuthContext, args: Record<string, unknown>): void {
  if (ctx.mode === "static" || ctx.platformAdmin) return;
  const tenant = ctx.tenant;
  if (!tenant) throw new TenantAccessError("Aucun tenant sélectionné pour cet appel MCP.");

  const urls = [
    ...stringValues(args, ["url", "page", "homepage", "origin", "startUrl", "siteUrl", "site"]),
    ...stringList(args.urls),
    ...stringList(args.competitors),
  ];
  for (const url of urls) {
    if (looksLikeUrlOrHost(url) && !tenantOwnsUrl(tenant, url) && !tenantOwnsProperty(tenant, url) && !tenantOwnsBingSite(tenant, url)) {
      throw new TenantAccessError(`Cette adresse n'appartient pas au tenant ${tenant.id}.`);
    }
  }

  for (const id of stringValues(args, ["propertyId", "property"])) {
    if (id && (tenant.ga4Properties?.length || tenant.gscProperties.length) && !tenantOwnsGa4(tenant, id) && !tenantOwnsProperty(tenant, id)) {
      throw new TenantAccessError(`Cette propriété n'appartient pas au tenant ${tenant.id}.`);
    }
  }
  if (typeof args.siteUrl === "string" && tenant.gscProperties.length && !tenantOwnsProperty(tenant, args.siteUrl) && !tenantOwnsUrl(tenant, args.siteUrl)) {
    throw new TenantAccessError(`Cette propriété Search Console n'appartient pas au tenant ${tenant.id}.`);
  }

  const container = gtmPath(args);
  if (container && (tenant.gtmContainers?.length ?? 0) && !tenantOwnsGtmContainer(tenant, container)) {
    throw new TenantAccessError(`Ce conteneur GTM n'appartient pas au tenant ${tenant.id}.`);
  }
}

function stringValues(args: Record<string, unknown>, keys: string[]): string[] {
  return keys.map((k) => args[k]).filter((v): v is string => typeof v === "string" && v.length > 0);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function looksLikeUrlOrHost(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^sc-domain:/i.test(value) || value.includes(".");
}

function gtmPath(args: Record<string, unknown>): string | undefined {
  if (typeof args.containerPath === "string") return args.containerPath;
  const account = args.accountId;
  const container = args.containerId;
  if (typeof account === "string" && typeof container === "string") {
    return `accounts/${account}/containers/${container}`;
  }
  return undefined;
}
