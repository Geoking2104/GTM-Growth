/**
 * Minimal Keycloak Admin REST client (Keycloak 26) used to provision client
 * tenants. Authenticates with a confidential service-account client
 * (client_credentials) — never with a user password.
 */

export interface KeycloakAdminConfig {
  /** Keycloak base URL reachable from the API, e.g. http://keycloak:8080 */
  baseUrl: string;
  /** Realm holding the provisioner client (usually `master` so it can create realms). */
  authRealm: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export function keycloakAdminFromEnv(env: NodeJS.ProcessEnv = process.env): KeycloakAdminConfig | null {
  const baseUrl = env.KEYCLOAK_INTERNAL_URL;
  const clientId = env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), authRealm: env.KEYCLOAK_ADMIN_REALM || "master", clientId, clientSecret };
}

export class KeycloakAdmin {
  private token: { value: string; exp: number } | null = null;
  private f: typeof fetch;
  constructor(private cfg: KeycloakAdminConfig) { this.f = cfg.fetch ?? fetch; }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.exp) return this.token.value;
    const res = await this.f(`${this.cfg.baseUrl}/realms/${this.cfg.authRealm}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret }),
    });
    if (!res.ok) throw new Error(`Keycloak token ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, exp: Date.now() + (data.expires_in - 20) * 1000 };
    return data.access_token;
  }

  async call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null; location: string | null }> {
    const res = await this.f(`${this.cfg.baseUrl}/admin/realms${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status >= 400) throw new Error(`Keycloak ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
    const text = res.status === 204 ? "" : await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as T) : null, location: res.headers.get("location") };
  }

  /** POST that returns the created id (from the Location header). */
  async create(path: string, body: unknown): Promise<string> {
    const { location } = await this.call("POST", path, body);
    const id = location?.split("/").pop();
    if (!id) throw new Error(`Keycloak POST ${path} : pas d'identifiant retourné`);
    return id;
  }
}
