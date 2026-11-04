import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { GoogleAuth, JWT } from "google-auth-library";

/**
 * Identifiant Google propre à un client (tenant) : nom de fichier de clé posé à côté de
 * GOOGLE_APPLICATION_CREDENTIALS (même dossier, monté en lecture seule). Permet de
 * réutiliser un compte de service qui a déjà les accès d'un client sans en créer un autre.
 */
const credentialScope = new AsyncLocalStorage<string | undefined>();
export const CREDENTIAL_FILE_RE = /^[a-z0-9][a-z0-9._-]{0,80}\.json$/;
export function withCredential<T>(file: string | undefined, fn: () => T): T { return credentialScope.run(file, fn); }
export function currentKeyFile(): string | undefined {
  const base = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const scoped = credentialScope.getStore();
  if (scoped && CREDENTIAL_FILE_RE.test(scoped) && base) return path.join(path.dirname(base), scoped);
  return base;
}
const authCache = new Map<string, GoogleAuth>();

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  // Required to create Measurement Protocol API secrets
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  // Console GTM : suppression d'espaces de travail, création et publication de versions
  "https://www.googleapis.com/auth/tagmanager.delete.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
  // Search Console read (sites, sitemaps, URL inspection)
  "https://www.googleapis.com/auth/webmasters.readonly",
  // Search Console write (submit sitemap) — gated by SEARCH_CONSOLE_WRITE_ENABLED
  "https://www.googleapis.com/auth/webmasters",
  // Google Indexing API (URL_UPDATED / URL_DELETED) — gated by INDEXING_WRITE_ENABLED
  "https://www.googleapis.com/auth/indexing",
];

export async function getAuthClient(): Promise<JWT | GoogleAuth> {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      const client = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: SCOPES,
      });
      await client.authorize();
      return client;
    } catch (err: any) {
      throw new Error(`Invalid GOOGLE_CREDENTIALS_JSON: ${err.message}`);
    }
  }

  const keyFile = currentKeyFile();
  const k = keyFile ?? "";
  if (!authCache.has(k)) authCache.set(k, new GoogleAuth({ scopes: SCOPES, keyFile }));
  return authCache.get(k)!;
}

export function resolvePropertyId(propertyId?: string): string {
  const id = propertyId || process.env.GA4_PROPERTY_ID;
  if (!id) {
    throw new Error(
      "No propertyId provided and GA4_PROPERTY_ID environment variable is not set."
    );
  }
  return id.replace(/^properties\//, "");
}

export function assertWriteEnabled() {
  // Writes are disabled by default and must be explicitly enabled via
  // GTM_WRITE_ENABLED=true / GA4_WRITE_ENABLED=true. Any other value
  // (including unset) keeps writes blocked.
  if (process.env.GTM_WRITE_ENABLED !== "true") {
    throw new Error(
      "Write operations are disabled by default. Set GTM_WRITE_ENABLED=true to allow GTM writes."
    );
  }
  if (process.env.GA4_WRITE_ENABLED !== "true") {
    throw new Error(
      "GA4 write operations are disabled by default. Set GA4_WRITE_ENABLED=true to allow secret creation."
    );
  }
}
