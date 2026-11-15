/* Keycloak sign-in: OpenID Connect Authorization Code + PKCE (S256).
 * Tokens stay in sessionStorage and are removed when the tab closes. */
import { OIDC } from "./config.js";
import { LANG } from "./i18n.js";
import { featureHandoff } from "./workspace-context.js";

const KEY = "gtm-console-tokens";
const TENANT_KEY = "gtm-console-tenant";
/** The discovered tenant determines the issuer and organisation branding. */
export const currentTenant = () => { try { return JSON.parse(sessionStorage.getItem(TENANT_KEY) || "null"); } catch { return null; } };
export const setTenant = (t) => (t ? sessionStorage.setItem(TENANT_KEY, JSON.stringify(t)) : sessionStorage.removeItem(TENANT_KEY));
const issuer = () => currentTenant()?.issuer || OIDC.issuer;
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const endpoint = (path) => `${issuer()}/protocol/openid-connect/${path}`;
export const accountConsoleUrl = () => `${issuer()}/account/`;
const redirectUri = () => `${location.origin}${location.pathname}`;

function save(tokens) {
  const now = Date.now();
  const stored = { ...tokens, expires_at: now + (tokens.expires_in ?? 60) * 1000 };
  sessionStorage.setItem(KEY, JSON.stringify(stored));
  return stored;
}
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };

export async function login(loginHint) {
  featureHandoff(location, sessionStorage);
  const verifier = random(48);
  const state = random(16);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("gtm-console-pkce", JSON.stringify({ verifier, state }));
  const tenant = currentTenant();
  // organization:<alias> selects the tenant's identity provider and theme.
  const scope = tenant?.organization ? `${OIDC.scope} organization:${tenant.organization}` : `${OIDC.scope} organization`;
  const params = new URLSearchParams({ client_id: OIDC.clientId, response_type: "code", scope, redirect_uri: redirectUri(), state, code_challenge: challenge, code_challenge_method: "S256", ui_locales: LANG });
  if (loginHint) params.set("login_hint", loginHint);
  location.assign(`${endpoint("auth")}?${params}`);
}

async function tokenRequest(body) {
  const res = await fetch(endpoint("token"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: OIDC.clientId, ...body }) });
  if (!res.ok) throw new Error(`Keycloak ${res.status}`);
  return save(await res.json());
}

/** Complete the Keycloak callback when the console loads. */
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return load();
  const pkce = JSON.parse(sessionStorage.getItem("gtm-console-pkce") || "{}");
  sessionStorage.removeItem("gtm-console-pkce");
  history.replaceState(null, "", redirectUri());
  if (!pkce.state || pkce.state !== params.get("state")) throw new Error(LANG === "en" ? "Invalid OIDC state; please sign in again." : "État OIDC invalide, reconnectez-vous.");
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: pkce.verifier });
}

export async function accessToken() {
  const tokens = load();
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 20_000) return tokens.access_token;
  if (!tokens.refresh_token) return null;
  try { return (await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token })).access_token; }
  catch { sessionStorage.removeItem(KEY); return null; }
}

export function logout() {
  const tokens = load();
  sessionStorage.removeItem(KEY);
  const params = new URLSearchParams({ client_id: OIDC.clientId, post_logout_redirect_uri: redirectUri() });
  if (tokens?.id_token) params.set("id_token_hint", tokens.id_token);
  location.assign(`${endpoint("logout")}?${params}`);
}
