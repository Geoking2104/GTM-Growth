/** PAP 1.0 discovery auditing. Historical issue vocabulary derives from GeoSuite's
 * MIT poppy-json checker (© 2026 Matteo Perino / GeoSuite); rules here follow 1.0. */
import { fetchMetadataResponse } from "../poppy/client.js";
import { metadataPath } from "../poppy/discovery.js";
export const POPPY_PATH = "/.well-known/poppy.json";
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
export const ISSUER_METADATA_PATH = "/.well-known/oauth-authorization-server";
export const SUPPORTED_POPPY_VERSION = "1.0";
const messages = {
    not_an_object: "The discovery document is not a JSON object.", missing_protocol_version: "Use the canonical protocol_version field.", unsupported_version: "This checker evaluates PAP 1.0; older results remain historical.", missing_organization: "Organization name and valid domain are required.", domain_mismatch: "Organization domain must equal the final serving host.", invalid_agent_protocol: "A conversation entry requires type, HTTPS endpoint and description.", invalid_api_entry: "An API entry requires type, HTTPS url and description.", invalid_browser_session_endpoint: "Invalid browser channel or browser endpoint.", no_channels: "At least one actual supported channel is required.", invalid_auth_issuer: "The issuer must be an HTTPS URL without query or fragment.", sign_in_conflict: "Disabled sign-in conflicts with a browser sign-in endpoint.", legacy_sign_in: "auth.sign_in/signIn is legacy; sign-in capabilities come from issuer metadata.", not_https: "Every discovery destination must use HTTPS.", wrong_final_path: "Final manifest URL must end at /.well-known/poppy.json without query or fragment.", missing_auth_issuer: "Multiple authorization servers require auth.issuer selection.", sign_in_without_issuer: "The declared issuer is absent from protected-resource metadata.", invalid_resource: "Protected-resource resource must equal the origin exactly.", issuer_metadata_unreachable: "Issuer metadata could not be read.", issuer_mismatch: "Issuer does not match exactly.", domain_not_in_issuer: "protected_resources must include the exact domain origin.", missing_token_endpoint: "A real HTTPS token endpoint is required.", missing_revocation_endpoint: "A real HTTPS revocation endpoint is required.", invalid_grant_types: "Refresh tokens and an advertised sign-in grant are required.", invalid_oauth_profile: "Direct sign-in requires S256, code responses, private_key_jwt, ES256 and PS384.", fetch_failed: "The document could not be fetched within HTTPS, DNS, size and timeout constraints.", invalid_supported_versions: "Other version documents must use the same host.",
} as const;
export type PoppyIssue = keyof typeof messages;
export const explainPoppyIssue = (issue: PoppyIssue) => messages[issue];
type Obj = Record<string, unknown>;
const record = (v: unknown): Obj | null => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null;
const string = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const https = (v: unknown): v is string => { try {
    const u = new URL(String(v));
    return string(v) && u.protocol === "https:" && !!u.hostname && !u.username && !u.password && !u.hash;
}
catch {
    return false;
} };
const values = (v: unknown): string[] => Array.isArray(v) ? v.filter(string) : [];
const includes = (v: unknown, x: string) => values(v).includes(x);
export function validatePoppyDocument(input: unknown, host: string): {
    valid: boolean;
    issues: PoppyIssue[];
} {
    const issues: PoppyIssue[] = [], doc = record(input);
    if (!doc)
        return { valid: false, issues: ["not_an_object"] };
    if (!string(doc.protocol_version))
        issues.push("missing_protocol_version");
    else if (doc.protocol_version !== SUPPORTED_POPPY_VERSION)
        issues.push("unsupported_version");
    const org = record(doc.organization);
    if (!string(org?.name) || !string(org?.domain) || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(String(org?.domain)))
        issues.push("missing_organization");
    if (string(org?.domain) && org.domain.toLowerCase() !== host.toLowerCase())
        issues.push("domain_mismatch");
    const agent = record(doc.agent), web = record(doc.web), auth = record(doc.auth);
    const protocols = Array.isArray(agent?.protocols) ? agent.protocols : [], apis = Array.isArray(doc.apis) ? doc.apis : [];
    if (doc.agent !== undefined && (!agent || !protocols.length))
        issues.push("invalid_agent_protocol");
    if (protocols.some(p => { const r = record(p); return !r || !string(r.type) || !https(r.endpoint) || !string(r.description); }))
        issues.push("invalid_agent_protocol");
    if (doc.apis !== undefined && (!Array.isArray(doc.apis) || apis.some(p => { const r = record(p); return !r || !string(r.type) || !https(r.url) || !string(r.description); })))
        issues.push("invalid_api_entry");
    if (doc.web !== undefined && (!web || (web.browser_session_endpoint !== undefined && !https(web.browser_session_endpoint)) || (web.disabled === true && web.browser_session_endpoint !== undefined)))
        issues.push("invalid_browser_session_endpoint");
    if (!protocols.length && !apis.length && !(web && web.disabled !== true))
        issues.push("no_channels");
    if (auth?.issuer !== undefined && (!https(auth.issuer) || new URL(String(auth.issuer)).search))
        issues.push("invalid_auth_issuer");
    if (auth?.sign_in !== undefined || auth?.signIn !== undefined)
        issues.push("legacy_sign_in");
    if (auth?.disabled === true && web?.browser_session_endpoint)
        issues.push("sign_in_conflict");
    if (doc.supported_versions !== undefined) {
        const versions = record(doc.supported_versions);
        if (!versions || Object.entries(versions).some(([v, u]) => !/^\d+\.\d+$/.test(v) || !https(u) || new URL(u).host.toLowerCase() !== host.toLowerCase()))
            issues.push("invalid_supported_versions");
    }
    return { valid: !issues.length, issues: [...new Set(issues)] };
}
export interface PoppyReport {
    host: string;
    url: string;
    present: boolean;
    valid: boolean;
    status: number | null;
    protocolVersion: string | null;
    organization: {
        name: string | null;
        domain: string | null;
    };
    issuer: string | null;
    signInTypes: string[];
    signInDisabled: boolean;
    channels: string[];
    issues: PoppyIssue[];
    issueDetails: {
        code: PoppyIssue;
        message: string;
    }[];
    verdict: string;
    checkedAt: string;
    validatorVersion: string;
    verification: {
        discovery: string;
        authentication: "not-tested";
        authorization: "not-tested";
        journey: "not-tested";
    };
}
async function getJson(raw: string, fetcher?: typeof fetch, redirects = false): Promise<{
    status: number;
    body: unknown;
    finalUrl: string;
} | null> {
    try {
        let url = raw;
        for (let step = 0; step <= 3; step++) {
            if (!https(url))
                return null;
            let r: {
                status: number;
                body: unknown;
                location?: string;
            };
            if (fetcher) {
                const response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
                const text = await response.text();
                if (Buffer.byteLength(text) > 256 * 1024)
                    return null;
                let body: unknown = null;
                try {
                    body = JSON.parse(text);
                }
                catch { /* invalid JSON is a shape failure */ }
                r = { status: response.status, body, location: response.headers.get("location") ?? undefined };
            }
            else
                r = await fetchMetadataResponse(url);
            if ([301, 302, 303, 307, 308].includes(r.status)) {
                if (!redirects || !r.location || step === 3)
                    return null;
                url = new URL(r.location, url).href;
                continue;
            }
            return { status: r.status, body: r.body, finalUrl: url };
        }
    }
    catch { /* Includes SSRF/timeout/oversized metadata: never infer absence. */ }
    return null;
}
export async function probePoppy(host: string, options: {
    fetcher?: typeof fetch;
} = {}): Promise<PoppyReport> {
    const cleanHost = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`).host.toLowerCase(), url = `https://${cleanHost}${POPPY_PATH}`;
    const file = await getJson(url, options.fetcher, true);
    const issues: PoppyIssue[] = [];
    const doc = record(file?.body), auth = record(doc?.auth), org = record(doc?.organization), web = record(doc?.web), agent = record(doc?.agent);
    let issuer: string | null = null;
    const signInTypes: string[] = [], channels: string[] = [];
    if (!file)
        issues.push("fetch_failed");
    else if (file.status !== 404) {
        const final = new URL(file.finalUrl);
        if (final.pathname !== POPPY_PATH || final.search || final.hash)
            issues.push("wrong_final_path");
        issues.push(...validatePoppyDocument(file.body, final.host).issues);
        if (Array.isArray(agent?.protocols) && agent.protocols.length)
            channels.push("conversation");
        for (const api of Array.isArray(doc?.apis) ? doc.apis : []) {
            const a = record(api);
            if (a?.type === "mcp")
                channels.push("MCP server");
            else if (a?.type === "openapi")
                channels.push("OpenAPI");
            else if (string(a?.type))
                channels.push(a.type);
        }
        if (web && web.disabled !== true)
            channels.push(web.browser_session_endpoint ? "browser session" : "public website");
        const resource = await getJson(`${final.origin}${PROTECTED_RESOURCE_PATH}`, options.fetcher);
        const rm = record(resource?.body);
        const servers = values(rm?.authorization_servers);
        if (https(auth?.issuer))
            issuer = auth.issuer;
        else if (servers.length === 1)
            issuer = servers[0];
        if (servers.length > 1 && !issuer)
            issues.push("missing_auth_issuer");
        if (issuer && !servers.includes(issuer))
            issues.push("sign_in_without_issuer");
        if (issuer) {
            if (rm?.resource !== final.origin)
                issues.push("invalid_resource");
            const metadata = await getJson(metadataPath(issuer), options.fetcher), m = record(metadata?.body);
            if (!m || metadata?.status !== 200)
                issues.push("issuer_metadata_unreachable");
            else {
                if (m.issuer !== issuer)
                    issues.push("issuer_mismatch");
                if (!includes(m.protected_resources, final.origin))
                    issues.push("domain_not_in_issuer");
                if (auth?.disabled !== true) {
                    if (!https(m.token_endpoint))
                        issues.push("missing_token_endpoint");
                    if (!https(m.revocation_endpoint))
                        issues.push("missing_revocation_endpoint");
                    if (!includes(m.grant_types_supported, "refresh_token"))
                        issues.push("invalid_grant_types");
                    if (includes(m.grant_types_supported, "authorization_code")) {
                        signInTypes.push("direct");
                        if (!https(m.authorization_endpoint) || !includes(m.code_challenge_methods_supported, "S256") || !includes(m.response_types_supported, "code"))
                            issues.push("invalid_oauth_profile");
                    }
                    if (includes(m.grant_types_supported, "urn:ietf:params:oauth:grant-type:device_code"))
                        signInTypes.push("device");
                    if (includes(m.grant_types_supported, "https://personalagentprotocol.org/grant/mediated-sign-in"))
                        signInTypes.push("mediated");
                    if (!signInTypes.length)
                        issues.push("invalid_grant_types");
                    if (!includes(m.token_endpoint_auth_methods_supported, "private_key_jwt") || !["ES256", "PS384"].every(a => includes(m.token_endpoint_auth_signing_alg_values_supported, a)))
                        issues.push("invalid_oauth_profile");
                }
            }
        }
    }
    const unique = [...new Set(issues)], present = !!file && file.status !== 404, valid = present && file?.status === 200 && !unique.length;
    return { host: cleanHost, url, present, valid, status: file?.status ?? null, protocolVersion: string(doc?.protocol_version) ? doc.protocol_version : null, organization: { name: string(org?.name) ? org.name : null, domain: string(org?.domain) ? org.domain : null }, issuer, signInTypes, signInDisabled: auth?.disabled === true, channels: [...new Set(channels)], issues: unique, issueDetails: unique.map(code => ({ code, message: explainPoppyIssue(code) })), checkedAt: new Date().toISOString(), validatorVersion: "pap-1.0-2026-11-15", verification: { discovery: valid ? "passed" : file?.status === 404 ? "absent" : "failed", authentication: "not-tested", authorization: "not-tested", journey: "not-tested" }, verdict: valid ? "Discovery passed. Authentication, authorization and a real agent journey have not been tested." : file?.status === 404 ? "No poppy.json: discovery is not configured." : "Discovery failed; inspect issues. This is not a compliance or security certification." };
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
    issuerMetadata?: Record<string, unknown>;
}
export function generatePoppy(input: PoppyGenerateInput) {
    const domain = new URL(/^https?:\/\//i.test(input.domain) ? input.domain : `https://${input.domain}`).host.toLowerCase();
    const json: Record<string, unknown> = { protocol_version: "1.0", organization: { name: input.name, domain } };
    if (input.agent)
        json.agent = { protocols: [{ type: "poppy", endpoint: input.agent, description: "Company conversation channel — verify implementation before publishing" }] };
    const apis = [...(input.mcp ?? []).map(url => ({ type: "mcp", url, description: "MCP server" })), ...(input.openapi ?? []).map(url => ({ type: "openapi", url, description: "OpenAPI description" }))];
    if (apis.length)
        json.apis = apis;
    if (input.browser)
        json.web = { browser_session_endpoint: input.browser };
    else if (!apis.length && !input.agent)
        json.web = {};
    if (input.issuer)
        json.auth = { issuer: input.issuer };
    const result = validatePoppyDocument(json, domain);
    if (!result.valid)
        throw new Error(result.issues.join(", "));
    if (input.issuerMetadata && input.issuerMetadata.issuer !== input.issuer)
        throw new Error("Issuer metadata does not match issuer");
    return { json, protectedResource: input.issuer ? { url: `https://${domain}${PROTECTED_RESOURCE_PATH}`, json: { resource: `https://${domain}`, authorization_servers: [input.issuer] } } : null, issuerMetadata: input.issuer && input.issuerMetadata ? { url: metadataPath(input.issuer), json: input.issuerMetadata } : null, prerequisites: input.issuer ? ["Retrieve and verify the issuer's real metadata at " + metadataPath(input.issuer), "Confirm protected_resources contains the exact domain origin; configure CIMD, ES256/PS384 private_key_jwt, PKCE, refresh and revocation.", "No issuer endpoints are fabricated. Metadata is a proposal until the deployed journey is tested."] : ["Publish only channels that are actually implemented; a manifest alone provides no account access."] };
}
