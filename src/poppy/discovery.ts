import { catalog } from "../data-agent/service.js";
import { scopes, type PapConfig } from "./types.js";
export const metadataPath = (issuer: string) => { const u = new URL(issuer); return `${u.origin}/.well-known/oauth-authorization-server${u.pathname === "/" ? "" : u.pathname}`; };
export function discovery(c: PapConfig) {
    return { protocol_version: "1.0", organization: { name: "GTM Growth", domain: new URL(c.origin).host }, auth: { issuer: c.issuer, scopes: Object.fromEntries(catalog.map(m => [`gtm:${m.id}:read`, m.description])) }, apis: [{ type: "openapi", url: `${c.origin}/api/poppy/openapi.json`, description: "Read-only, consent-bound aggregate workspace data. Allowlisted staging pilot; no writes or CRM identity resolution." }] };
}
export function authorizationMetadata(c: PapConfig) {
    return { issuer: c.issuer, protected_resources: [c.origin], authorization_endpoint: `${c.issuer}/authorize`, token_endpoint: `${c.issuer}/token`, revocation_endpoint: `${c.issuer}/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["private_key_jwt"], token_endpoint_auth_signing_alg_values_supported: ["ES256", "PS384"], revocation_endpoint_auth_methods_supported: ["private_key_jwt"], revocation_endpoint_auth_signing_alg_values_supported: ["ES256", "PS384"], authorization_response_iss_parameter_supported: true, client_id_metadata_document_supported: true, scopes_supported: scopes };
}
export function openapi(c: PapConfig) {
    const errors: Record<string, string> = { "400": "invalid_request, version_unsupported, invalid_session, session_ended", "401": "invalid_token; WWW-Authenticate includes resource_metadata", "403": "insufficient_scope or resource_denied", "413": "input_too_large", "429": "rate_limited; Retry-After", "503": "identity_unavailable or service_unavailable", "504": "read_timeout" };
    const requestSchema = {
        type: "object", additionalProperties: false, required: ["model"], properties: {
            model: { type: "string", enum: catalog.map(x => x.id) }, days: { type: "integer", enum: [7, 28, 90], default: 28 },
            source: { type: "string", maxLength: 2048 }, locale: { type: "string", enum: ["en", "fr"], default: "en" },
        },
    };
    return {
        openapi: "3.1.0", info: { title: "GTM Growth PAP read pilot", version: "1.0.0", description: "PAP 1.0. One workspace and selected sources per consent. Private reads require the gtm:{model}:read scope, OAuth and a delegated Poppy-Session. Allowlisted pilot; no writes." },
        servers: [{ url: c.origin }],
        paths: {
            "/api/poppy/capabilities": { get: { operationId: "capabilities", summary: "Public catalog without workspace or session state", responses: { "200": { description: "Five read models, metrics, grain, periods and limitations" } } } },
            "/api/poppy/read": { post: {
                    operationId: "readWorkspaceModel", security: [{ oauth: [] }],
                    parameters: [
                        { in: "header", name: "Poppy-Version", required: true, schema: { const: "1.0" } },
                        { in: "header", name: "Poppy-Session", required: true, schema: { type: "string" }, description: "Fresh ES256 JWT with a verified delegation; ath binds the bearer token" },
                    ],
                    requestBody: { required: true, content: { "application/json": { schema: requestSchema } } },
                    responses: {
                        "200": { description: "schemaVersion, requestId, workspaceId and data. Missing values stay null; data.state explains source availability.", content: { "application/json": { schema: { type: "object", required: ["schemaVersion", "requestId", "workspaceId", "data"], properties: {
                                            schemaVersion: { const: "1.0" }, requestId: { type: "string" }, workspaceId: { type: "string" },
                                            data: { type: "object", required: ["model", "state", "source", "readAt", "period", "metrics", "caveats", "href"], properties: {
                                                    model: { type: "string" }, state: { enum: ["ready", "empty", "not-configured", "choose-source", "unavailable"] }, summary: { type: "string" }, source: { type: "string" }, readAt: { type: "string", format: "date-time" },
                                                    period: { type: ["object", "null"], properties: { start: { type: "string" }, end: { type: "string" } } },
                                                    metrics: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, value: { type: ["number", "null"] }, unit: { enum: ["count", "percent"] } } } },
                                                    caveats: { type: "array", items: { type: "string" } }, href: { type: "string", format: "uri" }, sources: { type: "array", items: { type: "string" } },
                                                } },
                                        } } } } },
                        ...Object.fromEntries(Object.entries(errors).map(([status, description]) => [status, { description }])),
                    },
                } },
        },
        components: { securitySchemes: { oauth: { type: "oauth2", flows: { authorizationCode: { authorizationUrl: `${c.issuer}/authorize`, tokenUrl: `${c.issuer}/token`, scopes: Object.fromEntries(catalog.map(x => [`gtm:${x.id}:read`, x.description])) } } } } },
    };
}
