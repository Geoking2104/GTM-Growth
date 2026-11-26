/** RFC 9728 Protected Resource Metadata for the MCP endpoint. */

export const MCP_READ_SCOPE = "mcp:read";
export const MCP_WRITE_SCOPE = "mcp:write";

export interface McpResourceConfig {
  /** Canonical resource identifier (RFC 8707), e.g. https://gtm.kayroslab.com/mcp */
  resource: string;
  /** Public issuer URL, e.g. https://auth.kayroslab.com/realms/gtm-growth */
  issuer: string;
  /** Optional extra issuers (dedicated tenant realms). */
  extraIssuers: string[];
}

export function publicOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MCP_PUBLIC_ORIGIN || env.REPORT_PUBLIC_ORIGIN || env.PAP_PUBLIC_ORIGIN || "https://gtm.kayroslab.com";
  return raw.replace(/\/$/, "");
}

export function mcpResourceConfig(env: NodeJS.ProcessEnv = process.env): McpResourceConfig | null {
  const issuer = env.OIDC_ISSUER?.replace(/\/$/, "");
  if (!issuer) return null;
  const resource = (env.MCP_RESOURCE || `${publicOrigin(env)}/mcp`).replace(/\/$/, "");
  return {
    resource,
    issuer,
    extraIssuers: (env.OIDC_EXTRA_ISSUERS ?? "").split(",").map((v) => v.trim().replace(/\/$/, "")).filter(Boolean),
  };
}

export function metadataUrl(resource: string): string {
  const u = new URL(resource);
  const path = u.pathname.replace(/\/$/, "") || "";
  return `${u.origin}/.well-known/oauth-protected-resource${path}`;
}

export function protectedResourceMetadata(config: McpResourceConfig) {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer, ...config.extraIssuers],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_READ_SCOPE, MCP_WRITE_SCOPE],
    resource_documentation: "https://github.com/Geoking2104/GTM-Growth/blob/main/docs/mcp/OAUTH.md",
    tls_client_certificate_bound_access_tokens: false,
  };
}

const rfc9728Param = ["resource", "metadata"].join("_");

export function wwwAuthenticate(config: McpResourceConfig, opts?: { error?: string; description?: string; scope?: string }): string {
  const parts = [
    "Bearer " + rfc9728Param + '="' + metadataUrl(config.resource) + '"',
    `scope="${opts?.scope ?? MCP_READ_SCOPE}"`,
  ];
  if (opts?.error) parts.push(`error="${opts.error}"`);
  if (opts?.description) parts.push(`error_description="${opts.description.replace(/"/g, "")}"`);
  return parts.join(", ");
}
