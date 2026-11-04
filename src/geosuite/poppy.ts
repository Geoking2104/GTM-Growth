/**
 * poppy.json — the Personal Agent Protocol discovery file (draft 0.3).
 *
 * Ported from GeoSuite's MIT-licensed `@geosuite/poppy-json`
 * (https://github.com/TryGeoSuite/poppy-json, © 2026 Matteo Perino and GeoSuite),
 * which documents the protocol's shape, its issue codes and the OAuth discovery
 * chain. The codes below are theirs; the implementation is ours, so the checks
 * can run inside this server without a dependency.
 *
 * What it answers: can a person's own agent find this company, read how to talk
 * to it, and know where to sign in on the customer's behalf?
 */

export const POPPY_PATH = "/.well-known/poppy.json";
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
export const ISSUER_METADATA_PATH = "/.well-known/oauth-authorization-server";
export const SUPPORTED_POPPY_VERSION = "0.3";

export type PoppyIssue =
  | "not_an_object"
  | "missing_protocol_version"
  | "unsupported_version"
  | "missing_organization"
  | "domain_mismatch"
  | "invalid_agent_protocol"
  | "invalid_api_entry"
  | "invalid_browser_session_endpoint"
  | "no_channels"
  | "invalid_auth_issuer"
  | "sign_in_conflict"
  | "not_https"
  | "wrong_final_path"
  | "missing_auth_issuer"
  | "sign_in_without_issuer"
  | "issuer_metadata_unreachable"
  | "issuer_mismatch"
  | "domain_not_in_issuer"
  | "missing_token_endpoint"
  | "missing_revocation_endpoint"
  | "invalid_grant_types";

const EXPLANATIONS: Record<PoppyIssue, string> = {
  not_an_object: "the file is not a JSON object",
  missing_protocol_version: "the protocol version is missing",
  unsupported_version: `the protocol version is not ${SUPPORTED_POPPY_VERSION}, the draft agents follow today`,
  missing_organization: "the organization name or domain is missing",
  domain_mismatch: "the declared domain is not the host that serves the file",
  invalid_agent_protocol: "a conversation channel has no type or no https address",
  invalid_api_entry: "an API has no type, address or description",
  invalid_browser_session_endpoint: "the browser session address is not https",
  no_channels: "it declares no channel (conversation, API or website)",
  invalid_auth_issuer: "auth.issuer is not an https address",
  sign_in_conflict: "sign-in is turned off (auth.disabled), but the file still offers it",
  not_https: "the file goes through a non-https address",
  wrong_final_path: "the redirects end on an address other than /.well-known/poppy.json",
  missing_auth_issuer: "the domain declares more than one authorization server and auth.issuer does not say which one agents use",
  sign_in_without_issuer: "the file offers sign-in, but the domain names no sign-in server",
  issuer_metadata_unreachable: "the sign-in server metadata does not respond",
  issuer_mismatch: "the sign-in server declares a different issuer",
  domain_not_in_issuer: "the sign-in server does not list this domain in protected_resources",
  missing_token_endpoint: "the sign-in server does not say where agents get their tokens",
  missing_revocation_endpoint: "the sign-in server does not say where access is revoked",
  invalid_grant_types: "the sign-in server does not list grant_types_supported with refresh_token",
};

export const explainPoppyIssue = (issue: PoppyIssue): string => EXPLANATIONS[issue] ?? issue;

const isHttps = (value: unknown): boolean => typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value);
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function versionOf(doc: Record<string, unknown>): string | null {
  const raw = doc.protocol_version ?? doc.protocolVersion ?? doc.version;
  return typeof raw === "string" ? raw : null;
}

/**
 * Shape checks, no network. `host` is the host that serves the file: agents
 * compare it with `organization.domain`.
 */
export function validatePoppyDocument(input: unknown, host: string): { valid: boolean; issues: PoppyIssue[] } {
  const issues: PoppyIssue[] = [];
  const doc = asRecord(input);
  if (!doc) return { valid: false, issues: ["not_an_object"] };

  const version = versionOf(doc);
  if (!version) issues.push("missing_protocol_version");
  else if (version !== SUPPORTED_POPPY_VERSION) issues.push("unsupported_version");

  const organization = asRecord(doc.organization);
  const name = typeof organization?.name === "string" ? organization.name.trim() : "";
  const domain = typeof organization?.domain === "string" ? organization.domain.trim().toLowerCase() : "";
  if (!name || !domain) issues.push("missing_organization");
  if (domain && domain !== host.toLowerCase()) issues.push("domain_mismatch");

  const agent = asRecord(doc.agent);
  const protocols = Array.isArray(agent?.protocols) ? agent.protocols : [];
  for (const entry of protocols) {
    const record = asRecord(entry);
    if (!record || typeof record.type !== "string" || !isHttps(record.url)) {
      issues.push("invalid_agent_protocol");
      break;
    }
  }

  const apis = Array.isArray(doc.apis) ? doc.apis : [];
  for (const entry of apis) {
    const record = asRecord(entry);
    if (!record || typeof record.type !== "string" || !isHttps(record.url) || typeof record.description !== "string") {
      issues.push("invalid_api_entry");
      break;
    }
  }

  const web = asRecord(doc.web);
  if (web?.browser_session_endpoint !== undefined && !isHttps(web.browser_session_endpoint)) {
    issues.push("invalid_browser_session_endpoint");
  }

  const hasChannel = protocols.length > 0 || apis.length > 0 || isHttps(web?.browser_session_endpoint);
  if (!hasChannel) issues.push("no_channels");

  const auth = asRecord(doc.auth);
  const issuer = auth?.issuer;
  if (issuer !== undefined && !isHttps(issuer)) issues.push("invalid_auth_issuer");

  const signInDisabled = auth?.disabled === true;
  const offersSignIn = issuer !== undefined || auth?.sign_in !== undefined || auth?.signIn !== undefined;
  if (signInDisabled && offersSignIn) issues.push("sign_in_conflict");
  if (!signInDisabled && offersSignIn && issuer === undefined) issues.push("sign_in_without_issuer");

  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export interface PoppyReport {
  host: string;
  url: string;
  present: boolean;
  valid: boolean;
  status: number | null;
  protocolVersion: string | null;
  organization: { name: string | null; domain: string | null };
  issuer: string | null;
  signInTypes: string[];
  signInDisabled: boolean;
  channels: string[];
  issues: PoppyIssue[];
  issueDetails: { code: PoppyIssue; message: string }[];
  /** What an agent would do next, in one line. */
  verdict: string;
}

const FETCH_TIMEOUT = 8_000;

async function getJson(url: string, fetcher: typeof fetch): Promise<{ status: number; body: unknown; finalUrl: string } | null> {
  try {
    const response = await fetcher(url, {
      headers: { "User-Agent": "GTMGrowthGEO/1.0 (+https://github.com/Geoking2104/GTM-Growth)", Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, body, finalUrl: response.url || url };
  } catch {
    return null;
  }
}

/** Live check, the way an agent does it: file, then the OAuth chain. */
export async function probePoppy(
  host: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<PoppyReport> {
  const fetcher = options.fetcher ?? fetch;
  const cleanHost = host.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  const url = `https://${cleanHost}${POPPY_PATH}`;
  const issues: PoppyIssue[] = [];

  const file = await getJson(url, fetcher);
  if (!file || file.status === 404) {
    return {
      host: cleanHost,
      url,
      present: false,
      valid: false,
      status: file?.status ?? null,
      protocolVersion: null,
      organization: { name: null, domain: null },
      issuer: null,
      signInTypes: [],
      signInDisabled: false,
      channels: [],
      issues: [],
      issueDetails: [],
      verdict: "No poppy.json: an agent can read the site, but cannot act in it for a customer.",
    };
  }

  if (!url.startsWith("https://")) issues.push("not_https");
  if (file.finalUrl && !file.finalUrl.replace(/\/$/, "").endsWith(POPPY_PATH)) issues.push("wrong_final_path");

  const shape = validatePoppyDocument(file.body, cleanHost);
  issues.push(...shape.issues);

  const doc = asRecord(file.body) ?? {};
  const organization = asRecord(doc.organization);
  const auth = asRecord(doc.auth);
  const agent = asRecord(doc.agent);
  const web = asRecord(doc.web);
  const issuer = typeof auth?.issuer === "string" ? auth.issuer : null;

  const signInRaw = auth?.sign_in ?? auth?.signIn;
  const signInTypes = Array.isArray(signInRaw) ? signInRaw.filter((value): value is string => typeof value === "string") : [];
  const channels: string[] = [];
  if (Array.isArray(agent?.protocols) && agent.protocols.length) channels.push("conversation");
  if (Array.isArray(doc.apis) && doc.apis.length) channels.push("MCP server", "OpenAPI");
  if (isHttps(web?.browser_session_endpoint)) channels.push("browser session");

  // The OAuth chain: only when the site offers sign-in.
  if (issuer) {
    const resource = await getJson(`https://${cleanHost}${PROTECTED_RESOURCE_PATH}`, fetcher);
    const servers = Array.isArray(asRecord(resource?.body)?.authorization_servers)
      ? (asRecord(resource?.body)?.authorization_servers as unknown[]).filter((value): value is string => typeof value === "string") : [];
    if (servers.length > 1 && !issuer) issues.push("missing_auth_issuer");
    if (servers.length && !servers.includes(issuer)) issues.push("issuer_mismatch");

    const base = issuer.replace(/\/$/, "");
    const metadata = await getJson(`${base}${ISSUER_METADATA_PATH}`, fetcher);
    const meta = asRecord(metadata?.body);
    if (!metadata || !meta) issues.push("issuer_metadata_unreachable");
    else {
      if (meta.issuer !== issuer) issues.push("issuer_mismatch");
      const protectedResources = Array.isArray(meta.protected_resources) ? meta.protected_resources : [];
      if (!protectedResources.some((value) => typeof value === "string" && value.replace(/\/$/, "").endsWith(cleanHost))) {
        issues.push("domain_not_in_issuer");
      }
      if (!isHttps(meta.token_endpoint)) issues.push("missing_token_endpoint");
      if (!isHttps(meta.revocation_endpoint)) issues.push("missing_revocation_endpoint");
      const grants = Array.isArray(meta.grant_types_supported) ? meta.grant_types_supported : [];
      if (!grants.includes("refresh_token")) issues.push("invalid_grant_types");
    }
  }

  const uniqueIssues = [...new Set(issues)];
  const valid = uniqueIssues.length === 0;

  return {
    host: cleanHost,
    url,
    present: true,
    valid,
    status: file.status,
    protocolVersion: versionOf(doc),
    organization: {
      name: typeof organization?.name === "string" ? organization.name : null,
      domain: typeof organization?.domain === "string" ? organization.domain : null,
    },
    issuer,
    signInTypes,
    signInDisabled: auth?.disabled === true,
    channels,
    issues: uniqueIssues,
    issueDetails: uniqueIssues.map((code) => ({ code, message: explainPoppyIssue(code) })),
    verdict: valid
      ? "Valid: an agent can find the company, read its channels and use the documented sign-in."
      : `${uniqueIssues.length} issue(s): an agent would stop at the first one it cannot resolve.`,
  };
}

export interface PoppyGenerateInput {
  name: string;
  domain: string;
  issuer?: string;
  signIn?: ("direct" | "device" | "mediated")[];
  mcp?: string[];
  openapi?: string[];
  agent?: string;
  browser?: string;
}

/** Build a minimal, valid document (and the two OAuth documents when an issuer is given). */
export function generatePoppy(input: PoppyGenerateInput): {
  json: Record<string, unknown>;
  protectedResource: { url: string; json: Record<string, unknown> } | null;
  issuerMetadata: { url: string; json: Record<string, unknown> } | null;
} {
  const domain = input.domain.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  const doc: Record<string, unknown> = {
    protocol_version: SUPPORTED_POPPY_VERSION,
    organization: { name: input.name, domain },
  };

  if (input.agent) doc.agent = { protocols: [{ type: "poppy", url: input.agent }] };

  const apis = [
    ...(input.mcp ?? []).map((url) => ({ type: "mcp", url, description: "MCP server" })),
    ...(input.openapi ?? []).map((url) => ({ type: "openapi", url, description: "OpenAPI description" })),
  ];
  if (apis.length) doc.apis = apis;

  if (input.browser) doc.web = { browser_session_endpoint: input.browser };

  if (input.issuer) {
    doc.auth = { issuer: input.issuer, sign_in: input.signIn?.length ? input.signIn : ["direct"] };
  }

  return {
    json: doc,
    protectedResource: input.issuer
      ? {
          url: `https://${domain}${PROTECTED_RESOURCE_PATH}`,
          json: { resource: `https://${domain}`, authorization_servers: [input.issuer] },
        }
      : null,
    issuerMetadata: input.issuer
      ? {
          url: `${input.issuer.replace(/\/$/, "")}${ISSUER_METADATA_PATH}`,
          json: {
            issuer: input.issuer,
            protected_resources: [`https://${domain}`],
            grant_types_supported: ["refresh_token", "authorization_code"],
            token_endpoint: `${input.issuer.replace(/\/$/, "")}/token`,
            revocation_endpoint: `${input.issuer.replace(/\/$/, "")}/revoke`,
          },
        }
      : null,
  };
}
