/**
 * Provisionne un client GTM Growth dans Keycloak (organisation ou realm dédié).
 *
 *   npm run tenant:provision -- --id acme --name "Acme" --email-domain acme.fr \
 *     --domain acme.fr --property sc-domain:acme.fr --admin jean@acme.fr [--mode realm] \
 *     [--idp google|microsoft|oidc|saml --idp-client-id … --idp-client-secret-env VAR --idp-tenant …]
 *
 * Variables : KEYCLOAK_INTERNAL_URL, KEYCLOAK_ADMIN_REALM, KEYCLOAK_ADMIN_CLIENT_ID,
 * KEYCLOAK_ADMIN_CLIENT_SECRET, OIDC_ISSUER (URL publique), TENANTS_PATH, CONSOLE_DOMAIN.
 * Le secret de l'IdP est lu dans une variable d'environnement, jamais en argument.
 */
import { parseArgs } from "node:util";
import { KeycloakAdmin, keycloakAdminFromEnv } from "../src/tenants/keycloak-admin.js";
import { provisionTenant, type IdpKind } from "../src/tenants/provision.js";
import { TenantStore } from "../src/tenants/store.js";

const { values: v } = parseArgs({ options: {
  id: { type: "string" }, name: { type: "string" }, mode: { type: "string", default: "organization" },
  "email-domain": { type: "string", multiple: true }, domain: { type: "string", multiple: true }, property: { type: "string", multiple: true },
  admin: { type: "string" }, idp: { type: "string" }, "idp-client-id": { type: "string" }, "idp-client-secret-env": { type: "string" },
  "idp-tenant": { type: "string" }, "idp-issuer": { type: "string" }, "idp-sso-url": { type: "string" }, "idp-entity-id": { type: "string" },
} });

const cfg = keycloakAdminFromEnv();
const issuer = process.env.OIDC_ISSUER;
if (!cfg || !issuer) { console.error("KEYCLOAK_INTERNAL_URL, KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET et OIDC_ISSUER sont requis."); process.exit(2); }
if (!v.id || !v.name || !v.admin || !v["email-domain"]?.length) { console.error("--id, --name, --email-domain et --admin sont requis."); process.exit(2); }

const result = await provisionTenant({
  id: v.id, name: v.name, mode: v.mode === "realm" ? "realm" : "organization",
  emailDomains: v["email-domain"], domains: v.domain ?? [], gscProperties: v.property ?? [], admin: { email: v.admin },
  identityProvider: v.idp ? { kind: v.idp as IdpKind, clientId: v["idp-client-id"], clientSecret: v["idp-client-secret-env"] ? process.env[v["idp-client-secret-env"]] : undefined, tenant: v["idp-tenant"], issuer: v["idp-issuer"], ssoUrl: v["idp-sso-url"], entityId: v["idp-entity-id"] } : undefined,
}, { admin: new KeycloakAdmin(cfg), store: new TenantStore(), publicKeycloakUrl: new URL(issuer).origin, realm: new URL(issuer).pathname.split("/").pop(), consoleDomain: process.env.CONSOLE_DOMAIN });

for (const s of result.steps) console.log(`✔ ${s}`);
console.log(`\nEspace client : https://${result.tenant.id}.${process.env.CONSOLE_DOMAIN ?? "gtm.kayroslab.com"}/console/`);
