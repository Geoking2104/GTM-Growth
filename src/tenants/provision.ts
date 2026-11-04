/**
 * Client tenant provisioning through the Keycloak Admin REST API.
 *
 * Default mode `organization` (shared realm `gtm-growth`, Keycloak 26 Organizations):
 *   organization + email domains → groups /tenants/<id>/{tenant-admin,tenant-user}
 *   → console redirect URI for <id>.gtm.kayroslab.com → optional brokered IdP linked
 *   to the organization (redirect by email domain) → first admin user invited by
 *   email (set password + TOTP) → tenant record.
 * Mode `realm` (dedicated realm, for clients needing their own login theme,
 * password policy or full isolation): realm + client gtm-console + roles, same invite.
 */

import { KeycloakAdmin } from "./keycloak-admin.js";
import { TenantStore, validTenantId, type Tenant, type TenantBranding, type TenantMode } from "./store.js";

export type IdpKind = "oidc" | "saml" | "google" | "microsoft";
export interface IdpInput {
  kind: IdpKind;
  alias?: string;
  displayName?: string;
  /** oidc: issuer/discovery-based endpoints; google/microsoft/oidc: client credentials. */
  issuer?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  jwksUrl?: string;
  clientId?: string;
  clientSecret?: string;
  /** microsoft: Entra tenant id. google: hosted domain. */
  tenant?: string;
  hostedDomain?: string;
  /** saml */
  ssoUrl?: string;
  entityId?: string;
  signingCertificate?: string;
}

export interface ProvisionInput {
  id: string;
  name: string;
  mode?: TenantMode;
  emailDomains: string[];
  domains?: string[];
  gscProperties?: string[];
  branding?: TenantBranding;
  admin: { email: string; firstName?: string; lastName?: string };
  identityProvider?: IdpInput;
}

export interface ProvisionOptions {
  admin: KeycloakAdmin;
  store: TenantStore;
  /** Shared realm name, default gtm-growth. */
  realm?: string;
  /** Public Keycloak URL, used to compute issuers. */
  publicKeycloakUrl: string;
  /** Console base domain, default gtm.kayroslab.com. */
  consoleDomain?: string;
  clientId?: string;
}

export interface ProvisionResult { tenant: Tenant; steps: string[]; adminUserId: string; }

export function idpRepresentation(input: IdpInput, tenantId: string, emailDomain: string) {
  const alias = input.alias ?? `${tenantId}-${input.kind}`;
  const base = { alias, displayName: input.displayName ?? alias, enabled: true, trustEmail: true, firstBrokerLoginFlowAlias: "first broker login" };
  // Organization link: route users whose email matches the domain straight to their IdP.
  const org = { "kc.org.domain": emailDomain, "kc.org.broker.redirect.mode.email-matches": "true" };
  const need = (v: string | undefined, name: string) => { if (!v) throw new Error(`IdP ${input.kind} : champ ${name} requis`); return v; };
  switch (input.kind) {
    case "google":
      return { ...base, providerId: "google", config: { clientId: need(input.clientId, "clientId"), clientSecret: need(input.clientSecret, "clientSecret"), hostedDomain: input.hostedDomain ?? emailDomain, syncMode: "IMPORT", ...org } };
    case "microsoft":
      return { ...base, providerId: "microsoft", config: { clientId: need(input.clientId, "clientId"), clientSecret: need(input.clientSecret, "clientSecret"), tenantId: need(input.tenant, "tenant"), syncMode: "IMPORT", ...org } };
    case "saml":
      return { ...base, providerId: "saml", config: { singleSignOnServiceUrl: need(input.ssoUrl, "ssoUrl"), idpEntityId: need(input.entityId, "entityId"), signingCertificate: input.signingCertificate ?? "", validateSignature: input.signingCertificate ? "true" : "false", nameIDPolicyFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress", principalType: "SUBJECT", postBindingResponse: "true", postBindingAuthnRequest: "true", wantAssertionsSigned: "true", syncMode: "IMPORT", ...org } };
    case "oidc": {
      const iss = need(input.issuer, "issuer").replace(/\/$/, "");
      return { ...base, providerId: "oidc", config: { issuer: iss, authorizationUrl: input.authorizationUrl ?? `${iss}/authorize`, tokenUrl: input.tokenUrl ?? `${iss}/token`, jwksUrl: input.jwksUrl ?? "", useJwksUrl: input.jwksUrl ? "true" : "false", validateSignature: input.jwksUrl ? "true" : "false", clientId: need(input.clientId, "clientId"), clientSecret: need(input.clientSecret, "clientSecret"), clientAuthMethod: "client_secret_post", defaultScope: "openid email profile", pkceEnabled: "true", pkceMethod: "S256", syncMode: "IMPORT", ...org } };
    }
  }
}

/** Realm template for a dedicated-realm tenant (mode `realm`). */
export function dedicatedRealm(id: string, name: string, consoleOrigin: string, clientId: string) {
  return {
    realm: `tenant-${id}`,
    displayName: name,
    enabled: true,
    sslRequired: "external",
    registrationAllowed: false,
    loginWithEmailAllowed: true,
    resetPasswordAllowed: true,
    bruteForceProtected: true,
    internationalizationEnabled: true,
    supportedLocales: ["fr", "en"],
    defaultLocale: "fr",
    loginTheme: "gtm-growth",
    accountTheme: "keycloak.v3",
    passwordPolicy: "length(12) and notUsername and notEmail",
    otpPolicyType: "totp",
    roles: { realm: [{ name: "tenant-admin" }, { name: "tenant-user" }] },
    clients: [{ clientId, publicClient: true, standardFlowEnabled: true, directAccessGrantsEnabled: false, redirectUris: [`${consoleOrigin}/console/*`], webOrigins: [consoleOrigin], attributes: { "pkce.code.challenge.method": "S256", "post.logout.redirect.uris": `${consoleOrigin}/console/*` }, protocolMappers: [{ name: "audience", protocol: "openid-connect", protocolMapper: "oidc-audience-mapper", config: { "included.client.audience": clientId, "access.token.claim": "true" } }] }],
  };
}

async function ensureGroup(admin: KeycloakAdmin, realm: string, path: string[]): Promise<string> {
  let parentId: string | null = null;
  for (const name of path) {
    const list: { id: string; name: string }[] = parentId
      ? (await admin.call<{ id: string; name: string }[]>("GET", `/${realm}/groups/${parentId}/children?search=${encodeURIComponent(name)}&exact=true`)).data ?? []
      : (await admin.call<{ id: string; name: string }[]>("GET", `/${realm}/groups?search=${encodeURIComponent(name)}&exact=true`)).data ?? [];
    const found: { id: string; name: string } | undefined = list.find((g) => g.name === name);
    parentId = found ? found.id : await admin.create(parentId ? `/${realm}/groups/${parentId}/children` : `/${realm}/groups`, { name });
  }
  return parentId as string;
}

export async function provisionTenant(input: ProvisionInput, options: ProvisionOptions): Promise<ProvisionResult> {
  const { admin, store } = options;
  const steps: string[] = [];
  const mode: TenantMode = input.mode ?? "organization";
  const sharedRealm = options.realm ?? "gtm-growth";
  const clientId = options.clientId ?? "gtm-console";
  const consoleOrigin = `https://${input.id}.${options.consoleDomain ?? "gtm.kayroslab.com"}`;
  const kc = options.publicKeycloakUrl.replace(/\/$/, "");

  if (!validTenantId(input.id)) throw new Error("Identifiant invalide (a-z, 0-9, tirets ; noms réservés exclus).");
  if (store.get(input.id)) throw new Error(`Le tenant ${input.id} existe déjà.`);
  if (!input.emailDomains.length) throw new Error("Au moins un domaine e-mail est requis.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.admin.email)) throw new Error("E-mail administrateur invalide.");

  let realm = sharedRealm;
  let organizationId: string | undefined;
  let adminGroup: string | undefined;

  if (mode === "organization") {
    organizationId = await admin.create(`/${realm}/organizations`, { name: input.name, alias: input.id, enabled: true, redirectUrl: `${consoleOrigin}/console/`, domains: input.emailDomains.map((name) => ({ name, verified: false })), attributes: { tenantId: [input.id] } });
    steps.push(`Organisation Keycloak « ${input.id} » créée`);
    adminGroup = await ensureGroup(admin, realm, ["tenants", input.id, "tenant-admin"]);
    await ensureGroup(admin, realm, ["tenants", input.id, "tenant-user"]);
    steps.push(`Groupes /tenants/${input.id}/tenant-admin et tenant-user créés`);
    // Subdomain login: add the tenant console origin to the shared public client.
    const clients = (await admin.call<{ id: string; redirectUris?: string[]; webOrigins?: string[]; attributes?: Record<string, string> }[]>("GET", `/${realm}/clients?clientId=${clientId}`)).data ?? [];
    const client = clients[0];
    if (!client) throw new Error(`Client ${clientId} introuvable dans le realm ${realm}`);
    const redirect = `${consoleOrigin}/console/*`;
    const logout = (client.attributes?.["post.logout.redirect.uris"] ?? "").split("##").filter(Boolean);
    await admin.call("PUT", `/${realm}/clients/${client.id}`, { ...client, redirectUris: [...new Set([...(client.redirectUris ?? []), redirect])], webOrigins: [...new Set([...(client.webOrigins ?? []), consoleOrigin])], attributes: { ...client.attributes, "post.logout.redirect.uris": [...new Set([...logout, redirect])].join("##") } });
    steps.push(`Redirection ${consoleOrigin} ajoutée au client ${clientId}`);
  } else {
    const rep = dedicatedRealm(input.id, input.name, consoleOrigin, clientId);
    realm = rep.realm;
    await admin.call("POST", "", rep);
    steps.push(`Realm dédié « ${realm} » créé (client ${clientId}, rôles tenant-admin/tenant-user)`);
  }

  const idps: string[] = [];
  if (input.identityProvider) {
    const rep = idpRepresentation(input.identityProvider, input.id, input.emailDomains[0]);
    await admin.call("POST", `/${realm}/identity-provider/instances`, rep);
    if (organizationId) await admin.call("POST", `/${realm}/organizations/${organizationId}/identity-providers`, rep.alias);
    idps.push(rep.alias);
    steps.push(`Fournisseur d'identité ${input.identityProvider.kind} « ${rep.alias} » ajouté${organizationId ? " et lié à l'organisation" : ""}`);
  }

  const userId = await admin.create(`/${realm}/users`, { username: input.admin.email.toLowerCase(), email: input.admin.email.toLowerCase(), firstName: input.admin.firstName, lastName: input.admin.lastName, enabled: true, emailVerified: false, requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD", "CONFIGURE_TOTP"] });
  if (organizationId && adminGroup) {
    await admin.call("POST", `/${realm}/organizations/${organizationId}/members`, userId);
    await admin.call("PUT", `/${realm}/users/${userId}/groups/${adminGroup}`);
  } else {
    const role = (await admin.call<{ id: string; name: string }>("GET", `/${realm}/roles/tenant-admin`)).data;
    await admin.call("POST", `/${realm}/users/${userId}/role-mappings/realm`, [role]);
  }
  await admin.call("PUT", `/${realm}/users/${userId}/execute-actions-email?client_id=${clientId}&redirect_uri=${encodeURIComponent(`${consoleOrigin}/console/`)}&lifespan=259200`, ["VERIFY_EMAIL", "UPDATE_PASSWORD", "CONFIGURE_TOTP"]);
  steps.push(`Premier administrateur ${input.admin.email} invité par e-mail (mot de passe + TOTP, lien valable 72 h)`);

  const tenant = store.upsert({
    id: input.id, name: input.name, mode, issuer: `${kc}/realms/${realm}`, organizationId,
    domains: input.domains ?? [], emailDomains: input.emailDomains, gscProperties: input.gscProperties ?? [],
    branding: { displayName: input.name, ...input.branding }, identityProviders: idps, status: "active", createdAt: new Date().toISOString(),
  });
  steps.push("Tenant enregistré dans le registre GTM Growth");
  return { tenant, steps, adminUserId: userId };
}

/** Invite another user into an existing organization tenant. */
export async function inviteUser(tenant: Tenant, user: { email: string; role: "tenant-admin" | "tenant-user" }, options: { admin: KeycloakAdmin; realm?: string; clientId?: string; consoleDomain?: string }): Promise<string> {
  const { admin } = options;
  const clientId = options.clientId ?? "gtm-console";
  const consoleOrigin = `https://${tenant.id}.${options.consoleDomain ?? "gtm.kayroslab.com"}`;
  const realm = tenant.mode === "organization" ? options.realm ?? "gtm-growth" : `tenant-${tenant.id}`;
  const email = user.email.toLowerCase();
  if (!tenant.emailDomains.includes(email.split("@")[1] ?? "") && tenant.mode === "organization") throw new Error("L'e-mail doit appartenir à un domaine du tenant.");
  const userId = await admin.create(`/${realm}/users`, { username: email, email, enabled: true, requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD", "CONFIGURE_TOTP"] });
  if (tenant.mode === "organization") {
    if (!tenant.organizationId) throw new Error("organizationId manquant");
    await admin.call("POST", `/${realm}/organizations/${tenant.organizationId}/members`, userId);
    const group = await ensureGroup(admin, realm, ["tenants", tenant.id, user.role]);
    await admin.call("PUT", `/${realm}/users/${userId}/groups/${group}`);
  } else {
    const role = (await admin.call<{ id: string; name: string }>("GET", `/${realm}/roles/${user.role}`)).data;
    await admin.call("POST", `/${realm}/users/${userId}/role-mappings/realm`, [role]);
  }
  await admin.call("PUT", `/${realm}/users/${userId}/execute-actions-email?client_id=${clientId}&redirect_uri=${encodeURIComponent(`${consoleOrigin}/console/`)}&lifespan=259200`, ["VERIFY_EMAIL", "UPDATE_PASSWORD", "CONFIGURE_TOTP"]);
  return userId;
}
