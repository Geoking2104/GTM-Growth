#!/usr/bin/env node
/**
 * Idempotent Keycloak Admin API setup for MCP OAuth (DCR, scopes, audience, PKCE).
 * Never prints secrets. Does not create users unless --test is passed.
 *
 * Env: KEYCLOAK_URL, KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
 *      or KEYCLOAK_ADMIN_REALM + KEYCLOAK_ADMIN_CLIENT_ID + KEYCLOAK_ADMIN_CLIENT_SECRET
 *      REALM (default gtm-growth), MCP_RESOURCE
 */
const url = (process.env.KEYCLOAK_URL || "http://127.0.0.1:8180").replace(/\/$/, "");
const realm = process.env.REALM || "gtm-growth";
const resource = (process.env.MCP_RESOURCE || "https://gtm.kayroslab.com/mcp").replace(/\/$/, "");
const test = process.argv.includes("--test");
const trusted = (process.env.MCP_DCR_TRUSTED_HOSTS || (test
  ? "127.0.0.1,localhost"
  : "callback.mistral.ai,chat.mistral.ai,console.mistral.ai"))
  .split(",").map((s) => s.trim()).filter(Boolean);

const isProdTarget = url.includes("auth.kayroslab.com") || (realm === "gtm-growth" && !test);
if (isProdTarget && process.env.ALLOW_PROD_KEYCLOAK !== "yes") {
  console.error("Refusing to change the production realm. Re-run with ALLOW_PROD_KEYCLOAK=yes after review.");
  process.exit(2);
}

async function adminToken() {
  if (process.env.KEYCLOAK_ADMIN_CLIENT_ID && process.env.KEYCLOAK_ADMIN_CLIENT_SECRET) {
    const adminRealm = process.env.KEYCLOAK_ADMIN_REALM || realm;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID,
      client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
    });
    const r = await fetch(`${url}/realms/${adminRealm}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!r.ok) throw new Error(`admin token ${r.status}`);
    return (await r.json()).access_token;
  }
  const user = process.env.KEYCLOAK_ADMIN || "admin";
  const pass = process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!pass) throw new Error("KEYCLOAK_ADMIN_PASSWORD or service-account client is required");
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: user,
    password: pass,
  });
  const r = await fetch(`${url}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`admin token ${r.status}`);
  return (await r.json()).access_token;
}

function api(token) {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const base = `${url}/admin/realms/${realm}`;
  return {
    async get(path) {
      const r = await fetch(base + path, { headers: h });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GET ${path} ${r.status} ${await r.text()}`);
      return r.json();
    },
    async send(method, path, body, ok = [200, 201, 204]) {
      const r = await fetch(base + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
      if (!ok.includes(r.status)) throw new Error(`${method} ${path} ${r.status} ${await r.text()}`);
      const loc = r.headers.get("location");
      if (r.status === 201 && loc) return loc.split("/").pop();
      if ((r.headers.get("content-type") || "").includes("json")) return r.json();
      return null;
    },
  };
}

async function ensureClientScope(kc, name, { optional = false, includeInToken = true } = {}) {
  const all = (await kc.get("/client-scopes")) || [];
  let scope = all.find((s) => s.name === name);
  if (!scope) {
    const id = await kc.send("POST", "/client-scopes", {
      name,
      protocol: "openid-connect",
      description: `GTM Growth MCP scope ${name}`,
      attributes: {
        "include.in.token.scope": includeInToken ? "true" : "false",
        "display.on.consent.screen": "true",
        "consent.screen.text": name,
      },
    });
    scope = { id, name };
  }
  return { ...scope, optional };
}

async function ensureAudienceMapper(kc, scopeId) {
  const mappers = (await kc.get(`/client-scopes/${scopeId}/protocol-mappers/models`)) || [];
  const config = {
    "included.custom.audience": resource,
    "access.token.claim": "true",
    "id.token.claim": "false",
    "lightweight.claim": "false",
    "introspection.token.claim": "true",
  };
  const existing = mappers.find((m) => m.name === "aud-mcp-resource");
  if (existing) {
    if (existing.config?.["included.custom.audience"] === resource && existing.config?.["access.token.claim"] === "true") return;
    await kc.send("PUT", `/client-scopes/${scopeId}/protocol-mappers/models/${existing.id}`, {
      ...existing,
      config: { ...existing.config, ...config },
    });
    return;
  }
  await kc.send("POST", `/client-scopes/${scopeId}/protocol-mappers/models`, {
    name: "aud-mcp-resource",
    protocol: "openid-connect",
    protocolMapper: "oidc-audience-mapper",
    config,
  });
}

async function ensureClaimMapper(kc, scopeId, name, protocolMapper, config) {
  const mappers = (await kc.get(`/client-scopes/${scopeId}/protocol-mappers/models`)) || [];
  if (mappers.some((m) => m.name === name)) return;
  await kc.send("POST", `/client-scopes/${scopeId}/protocol-mappers/models`, {
    name,
    protocol: "openid-connect",
    protocolMapper,
    config,
  });
}

async function attachDefault(kc, scope, optional) {
  const def = optional ? "/default-optional-client-scopes" : "/default-default-client-scopes";
  const current = (await kc.get(def)) || [];
  if (current.some((s) => s.name === scope.name || s.id === scope.id)) return;
  try { await kc.send("PUT", `${def}/${scope.id}`, undefined, [200, 201, 204, 409]); }
  catch (error) { if (!String(error.message).includes(" 409 ")) throw error; }
}

async function detachDefault(kc, scope) {
  try { await kc.send("DELETE", `/default-default-client-scopes/${scope.id}`, undefined, [200, 204, 404]); }
  catch (error) { if (!String(error.message).includes(" 404 ")) throw error; }
}

async function ensurePkcePolicy(kc) {
  // Client policies are stored as realm attributes in recent Keycloak versions.
  const realmRep = await kc.get("");
  const profiles = JSON.parse(realmRep.attributes?.["client-policies.profiles"] || '{"profiles":[]}');
  const policies = JSON.parse(realmRep.attributes?.["client-policies.policies"] || '{"policies":[]}');
  if (!profiles.profiles.some((p) => p.name === "gtm-mcp-oauth")) {
    profiles.profiles.push({
      name: "gtm-mcp-oauth",
      description: "PKCE S256 and no implicit/direct grants for MCP clients",
      executors: [
        { executor: "pkce-enforcer", configuration: { "auto-configure": true } },
        { executor: "secure-session", configuration: {} },
      ],
    });
  }
  if (!policies.policies.some((p) => p.name === "gtm-mcp-oauth")) {
    policies.policies.push({
      name: "gtm-mcp-oauth",
      enabled: true,
      profiles: ["gtm-mcp-oauth"],
      conditions: [{ condition: "client-updater-source-host", configuration: { trusted: trusted } }],
    });
  }
  realmRep.attributes = {
    ...(realmRep.attributes || {}),
    "client-policies.profiles": JSON.stringify(profiles),
    "client-policies.policies": JSON.stringify(policies),
  };
  realmRep.registrationAllowed = realmRep.registrationAllowed ?? false;
  realmRep.organizationsEnabled = true;
  await kc.send("PUT", "", realmRep);
}

async function ensureRegistrationPolicies(kc, realmId) {
  const type = "org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy";
  const res = await fetch(`${url}/admin/realms/${realm}/components?type=${encodeURIComponent(type)}`, {
    headers: { Authorization: `Bearer ${kc._token}`, "Content-Type": "application/json" },
  });
  const all = res.ok ? await res.json() : [];
  const anon = all.filter((c) => (c.subType || c.subtype) === "anonymous");
  const put = async (component) => {
    const r = await fetch(`${url}/admin/realms/${realm}/components/${component.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${kc._token}`, "Content-Type": "application/json" },
      body: JSON.stringify(component),
    });
    if (![200, 201, 204].includes(r.status)) throw new Error(`component PUT ${component.name} ${r.status} ${await r.text()}`);
  };
  for (const extra of anon.filter((c) => c.providerId === "trusted-hosts" && c.name !== "Trusted Hosts")) {
    await fetch(`${url}/admin/realms/${realm}/components/${extra.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${kc._token}` },
    });
  }
  const trustedPolicy = anon.find((c) => c.providerId === "trusted-hosts" && c.name === "Trusted Hosts");
  if (trustedPolicy) {
    trustedPolicy.config = {
      "host-sending-registration-request-must-match": ["false"],
      "client-uris-must-match": ["true"],
      "trusted-hosts": trusted,
    };
    await put(trustedPolicy);
  }
  // Keycloak 26 still uses the provider id "allowed-client-templates" for "Allowed Client Scopes".
  const allowedScopes = [
    "openid", "profile", "email", "roles", "organization", "offline_access",
    "mcp:read", "mcp:write", "mcp-audience", "mcp-groups",
  ];
  for (const extra of anon.filter((c) => c.providerId === "allowed-client-templates" && c.name !== "Allowed Client Scopes")) {
    await fetch(`${url}/admin/realms/${realm}/components/${extra.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${kc._token}` },
    });
  }
  const scopePolicy = anon.find((c) => c.providerId === "allowed-client-templates" && c.name === "Allowed Client Scopes");
  if (scopePolicy) {
    scopePolicy.config = {
      ...(scopePolicy.config || {}),
      "allowed-client-scopes": allowedScopes,
      "allow-default-scopes": ["true"],
    };
    await put(scopePolicy);
  }
  if (test) {
    const consent = anon.find((c) => c.providerId === "consent-required");
    if (consent) {
      await fetch(`${url}/admin/realms/${realm}/components/${consent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${kc._token}` },
      });
    }
  }
}

async function findGroupByPath(kc, path) {
  const walk = async (id) => {
    const kids = (await kc.get((id ? `/groups/${id}/children` : "/groups") + "?briefRepresentation=true")) || [];
    for (const g of kids) {
      if (g.path === path) return g;
      const hit = await walk(g.id);
      if (hit) return hit;
    }
    return null;
  };
  return walk(null);
}

async function addOrgMember(kc, orgId, userId) {
  const r = await fetch(`${url}/admin/realms/${realm}/organizations/${orgId}/members`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kc._token}`, "Content-Type": "application/json" },
    body: JSON.stringify(userId),
  });
  if (![200, 201, 204, 409].includes(r.status)) {
    const text = await r.text();
    throw new Error(`org member ${r.status} ${text}`);
  }
}

async function ensureTestFixtures(kc) {
  if (!test) return;
  const groups = (await kc.get("/groups?briefRepresentation=true")) || [];
  let tenants = groups.find((g) => g.name === "tenants");
  if (!tenants) {
    const id = await kc.send("POST", "/groups", { name: "tenants" });
    tenants = { id };
  }
  const children = (await kc.get(`/groups/${tenants.id}/children`)) || [];
  let acmeGroup = children.find((g) => g.name === "acme");
  if (!acmeGroup) {
    const id = await kc.send("POST", `/groups/${tenants.id}/children`, { name: "acme" });
    acmeGroup = { id };
  }
  const acmeChildren = (await kc.get(`/groups/${acmeGroup.id}/children`)) || [];
  for (const name of ["tenant-user", "tenant-admin"]) {
    if (!acmeChildren.some((g) => g.name === name)) {
      await kc.send("POST", `/groups/${acmeGroup.id}/children`, { name });
    }
  }
  const password = process.env.MCP_TEST_USER_PASSWORD || "ChangeMe_test_only_12";
  async function ensureUser(username, groupPath) {
    const found = (await kc.get(`/users?username=${encodeURIComponent(username)}&exact=true`)) || [];
    let id = found[0]?.id;
    if (!id) {
      id = await kc.send("POST", "/users", {
        username,
        enabled: true,
        email: `${username}@acme.fr`,
        emailVerified: true,
        firstName: username,
        lastName: "Test",
      });
    }
    await kc.send("PUT", `/users/${id}/reset-password`, { type: "password", value: password, temporary: false });
    const group = await findGroupByPath(kc, groupPath);
    if (!group) throw new Error(`group ${groupPath} missing`);
    try { await kc.send("PUT", `/users/${id}/groups/${group.id}`, undefined, [200, 201, 204, 409]); }
    catch (error) { if (!String(error.message).includes(" 409 ")) throw error; }
    return id;
  }
  const reader = await ensureUser("mcp-reader", "/tenants/acme/tenant-user");
  const writer = await ensureUser("mcp-writer", "/tenants/acme/tenant-admin");

  const orgsRes = (await kc.get("/organizations")) || [];
  const list = Array.isArray(orgsRes) ? orgsRes : orgsRes.organizations || [];
  let org = list.find((o) => o.alias === "acme");
  if (!org) {
    const id = await kc.send("POST", "/organizations", {
      name: "Acme",
      alias: "acme",
      enabled: true,
      domains: [{ name: "acme.fr", verified: true }],
    });
    org = { id };
  }
  await addOrgMember(kc, org.id, reader);
  await addOrgMember(kc, org.id, writer);
}

async function main() {
  const token = await adminToken();
  const kc = api(token);
  kc._token = token;
  let realmRep = await kc.get("");
  if (!realmRep) {
    const master = { ...api(token), get: undefined };
    const r = await fetch(`${url}/admin/realms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        realm,
        enabled: true,
        organizationsEnabled: true,
        registrationAllowed: false,
        resetPasswordAllowed: true,
        loginWithEmailAllowed: true,
        accessTokenLifespan: 300,
        sslRequired: test ? "none" : "external",
        internationalizationEnabled: true,
        supportedLocales: ["fr", "en"],
        defaultLocale: "fr",
        bruteForceProtected: !test,
        verifyEmail: !test,
      }),
    });
    if (!r.ok && r.status !== 409) throw new Error(`create realm ${r.status} ${await r.text()}`);
    realmRep = await api(token).get("");
  }

  const groupMapper = {
    "full.path": "true",
    "access.token.claim": "true",
    "id.token.claim": "false",
    "userinfo.token.claim": "true",
    "claim.name": "groups",
  };
  const read = await ensureClientScope(kc, "mcp:read", { optional: true });
  const write = await ensureClientScope(kc, "mcp:write", { optional: true });
  const aud = await ensureClientScope(kc, "mcp-audience", { includeInToken: false, optional: true });
  const groups = await ensureClientScope(kc, "mcp-groups", { includeInToken: false, optional: true });
  // Audience and groups live on mcp:read so they are issued only when that scope is requested,
  // not on every realm client (including gtm-console).
  await ensureAudienceMapper(kc, read.id);
  await ensureAudienceMapper(kc, aud.id);
  await ensureClaimMapper(kc, read.id, "groups", "oidc-group-membership-mapper", groupMapper);
  await ensureClaimMapper(kc, groups.id, "groups", "oidc-group-membership-mapper", groupMapper);
  await detachDefault(kc, read);
  await detachDefault(kc, aud);
  await detachDefault(kc, groups);
  await attachDefault(kc, read, true);
  await attachDefault(kc, aud, true);
  await attachDefault(kc, groups, true);
  await attachDefault(kc, write, true);

  await ensurePkcePolicy(kc);
  const latest = await kc.get("");
  await ensureRegistrationPolicies(kc, latest.id);
  await ensureTestFixtures(kc);
  console.log(`MCP OAuth configuration applied on realm '${realm}' (resource audience set, DCR policy, PKCE).`);
  if (test) console.log("Test fixtures ensured (users mcp-reader / mcp-writer on tenant acme).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
