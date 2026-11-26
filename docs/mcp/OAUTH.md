# OAuth 2.1 pour le serveur MCP GTM Growth

Per-user OAuth login via Keycloak for the remote MCP server. English version below.

## FR

### Pourquoi

Le jeton statique `MCP_API_TOKEN` ouvre tout le serveur avec le compte de service Google de l'opérateur. Cela convient à un connecteur privé d'espace de travail, pas à l'annuaire public Mistral. Chaque utilisateur doit se connecter avec son compte Keycloak, et chaque appel d'outil reste dans son tenant, avec ses propres identifiants Google.

### Ce que Mistral prend en charge

D'après la documentation officielle ([MCP Connectors](https://docs.mistral.ai/vibe/work/web/connectors/mcp-connectors), [Manage connectors](https://docs.mistral.ai/studio/connectors/management)) :

- Détection automatique : pas d'authentification, Bearer / Basic, ou **OAuth 2.1 avec enregistrement dynamique de client (DCR, RFC 7591)**.
- Mistral n'accepte pas qu'on lui passe un jeton OAuth déjà obtenu par l'API ; le flux passe par Studio / Le Chat / Work.
- Il s'enregistre comme **client public**, puis enchaîne le code d'autorisation **avec PKCE S256**.
- L'URI de retour connue est `https://callback.mistral.ai/v1/integrations_auth/oauth2_callback` ([guide Pigment](https://kb.pigment.com/docs/connect-common-mcp-clients)).
- Un `GET` ou `POST` `/mcp` sans jeton doit répondre **401** (ou 403), avec un en-tête `WWW-Authenticate` qui pointe vers les métadonnées de la ressource. Un 405 ou un autre code fait échouer la détection.

Un identifiant / secret de client pré-enregistré n'est pas le chemin de Mistral Work (il existe pour le CLI Vibe). On dimensionne donc le realm pour le DCR, pas pour un client `gtm-mcp` figé.

### Comportement du serveur (`/mcp`)

Le serveur MCP est un **serveur de ressource OAuth 2.1** (spécification MCP [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), inchangée sur ces points depuis 2025-06-18) :

- `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728) : `resource` = `https://gtm.kayroslab.com/mcp`, `authorization_servers` = le realm `https://auth.kayroslab.com/realms/gtm-growth`, scopes `mcp:read` et `mcp:write`.
- La même page est aussi servie à `/.well-known/oauth-protected-resource` lorsque le pilote PAP est éteint, pour ne pas écraser le document PAP s'il est actif.
- Un 401 porte l'en-tête `WWW-Authenticate` (schema Bearer, RFC 9728) avec l'URL des métadonnées `https://gtm.kayroslab.com/.well-known/oauth-protected-resource/mcp` et `scope` égal à `mcp:read`.
- Les jetons d'accès sont des JWT Keycloak, vérifiés comme la console (JWKS, `iss`, `exp` / `nbf`, signature). L'audience exigée est **la ressource MCP** (RFC 8707), pas `gtm-console` : un jeton de la console est refusé.
- `mcp:read` est requis pour tous les appels authentifiés. `mcp:write` est requis pour les outils d'écriture (`confirm=true`). Un appel d'écriture sans ce droit répond **403** `insufficient_scope`.
- PKCE S256 est exigé côté Keycloak (les clients MCP le génèrent).

### Multi-tenant

Les revendications `organization` et `groups` (`/tenants/<id>/tenant-user` ou `tenant-admin`) sont résolues par le même `resolveTenant` que la console.

- Un seul tenant : il est sélectionné automatiquement.
- Plusieurs tenants : `tools/list` fonctionne ; un outil ciblé demande l'en-tête `X-Tenant` (ou `MCP-Tenant`). Mistral ne l'envoie pas aujourd'hui : l'utilisateur doit n'avoir qu'un tenant, ou Keycloak doit n'en mettre qu'un dans le jeton (sélection d'organisation à la connexion).
- Les URL, propriétés GA4 / GSC et conteneurs GTM sont limitées au tenant.
- Les appels Google passent par `tenant.googleCredential`. **Le compte de service de l'opérateur n'est jamais utilisé pour un utilisateur OAuth.**

### Jeton statique (rétrocompatibilité)

Si `MCP_API_TOKEN` est défini et que `MCP_STATIC_TOKEN_ENABLED` n'est pas `false`, le jeton statique reste accepté. Il est traité comme un accès **opérateur** (les deux droits, pas de filtrage tenant, compte Google de l'opérateur). C'est le mode de l'actuel connecteur d'espace de travail Mistral. À désactiver (`MCP_STATIC_TOKEN_ENABLED=false`) une fois le connecteur public passé en OAuth.

### Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `OIDC_ISSUER` | Déjà utilisée par la console, ex. `https://auth.kayroslab.com/realms/gtm-growth` |
| `MCP_RESOURCE` | Identifiant de ressource, défaut `https://gtm.kayroslab.com/mcp` |
| `MCP_PUBLIC_ORIGIN` | Origine publique (métadonnées), défaut `REPORT_PUBLIC_ORIGIN` ou le site |
| `MCP_STATIC_TOKEN_ENABLED` | `true` par défaut dès que `MCP_API_TOKEN` est défini |

### Changements Keycloak en production (à appliquer seulement après accord)

Rien n'est appliqué au realm de production par cette PR. Le script idempotent `deploy/kayroslab-vps/keycloak/mcp-oauth/apply-mcp-oauth.sh` prépare :

1. Activer les organisations si besoin (déjà le cas).
2. Créer les portées clientes optionnelles `mcp:read` et `mcp:write`. Elles ne sont **pas** des portées par défaut du realm, pour ne pas modifier les jetons de la console (`gtm-console`).
3. Sur `mcp:read` (et la portée auxiliaire `mcp-audience`) : mapper d'audience personnalisée égale à `MCP_RESOURCE`. Sur `mcp:read` (et `mcp-groups`) : mapper `groups` (chemin complet `/tenants/<id>/rôle`).
4. Mistral doit demander `mcp:read` (annoncé dans `scopes_supported` des métadonnées). Ce n'est qu'avec cette portée que l'audience MCP et les groupes sont ajoutés au jeton. La portée Keycloak `organization` reste telle qu'elle est déjà configurée ; ne pas l'imposer à tout le realm.
5. Autoriser le DCR anonyme, limité par :
   - **Trusted Hosts** : `callback.mistral.ai`, `chat.mistral.ai`, `console.mistral.ai` (pas `localhost` en prod). Le contrôle porte sur les URI du client (`client-uris-must-match`), pas sur l'hôte source de la requête (l'enregistrement Mistral part souvent d'une IP interne).
   - Portées clientes autorisées : `openid`, `profile`, `email`, `roles`, `organization`, `offline_access`, `mcp:read`, `mcp:write`, `mcp-audience`, `mcp-groups`.
   - Consentement demandé (politique intégrée, conservée en prod).
   - Mistral s'enregistre comme client **public** (`token_endpoint_auth_method=none`). Les clients confidentiels / comptes de service ne sont pas le flux attendu ; à surveiller après le premier enregistrement réel.
6. Politique cliente : PKCE S256 obligatoire, flux implicite et *direct access grants* interdits.
7. Ne pas créer d'utilisateur ni faire tourner le script contre la prod sans validation.
8. Côté serveur MCP, les jetons dont `azp` est un client interne (`gtm-console`, `account`, `admin-cli`, …) sont refusés, même s'ils portent l'audience MCP.

Nginx (déjà prévu dans cette PR, pas rechargé en prod) : proxifier aussi `/.well-known/oauth-protected-resource/mcp`.

### Brancher un connecteur Mistral en OAuth

1. Appliquer le script Keycloak et recharger Nginx, après accord.
2. Dans [Connectors](https://console.mistral.ai/connectors) → **Add Connector** → **Custom MCP Connector**.
3. Nom : `gtm_growth`. URL : `https://gtm.kayroslab.com/mcp`.
4. Mistral détecte OAuth, s'enregistre, ouvre la page Keycloak. L'utilisateur se connecte (thème GTM Growth).
5. Vérifier `tools/list` (100 outils) puis un outil en lecture seule (`geo_crawler_access`).
6. Le connecteur d'espace actuel, lui, peut garder le jeton statique tant que le drapeau n'est pas coupé.

### Tests locaux

```bash
# Unitaire (JWKS fictif, sans Docker)
pnpm test tests/mcp-oauth.test.ts

# Keycloak 26.4.7 en local, puis le test d'intégration
bash deploy/kayroslab-vps/keycloak/mcp-oauth/up-local.sh
pnpm test tests/mcp-oauth-keycloak.integration.test.ts
bash deploy/kayroslab-vps/keycloak/mcp-oauth/down-local.sh
```

Le realm de test (`gtm-growth-mcp-test`) est distinct du realm de production. Mot de passe d'administration Keycloak : uniquement en local, via les variables du script, jamais journalisé par les tests. Sans Docker, `up-local.sh` peut démarrer l'archive officielle Keycloak 26.4.7 (`KEYCLOAK_HOME`, défaut `/tmp/keycloak-26.4.7`).

---

## EN

### Why

The static `MCP_API_TOKEN` bearer opens the whole MCP server with the operator's Google service account. That is fine for a private workspace connector, not for Mistral's public directory. Each user must sign in with their Keycloak account, and every tool call stays inside their tenant, with their own Google credentials.

### What Mistral supports

Official docs ([MCP Connectors](https://docs.mistral.ai/vibe/work/web/connectors/mcp-connectors), [Manage connectors](https://docs.mistral.ai/studio/connectors/management)):

- Auto-detection of no auth, Bearer / Basic, or **OAuth 2.1 with Dynamic Client Registration (RFC 7591)**.
- You cannot push a pre-obtained OAuth token through the API; Studio / Le Chat / Work run the flow.
- Mistral registers as a **public client**, then uses the authorization-code flow **with PKCE S256**.
- Known redirect URI: `https://callback.mistral.ai/v1/integrations_auth/oauth2_callback`.
- An unauthenticated `GET` or `POST` to `/mcp` must return **401** (or 403) with a `WWW-Authenticate` header pointing at the protected-resource metadata.

A pre-registered confidential client is not the Work path (the Vibe CLI can use a public client id). The realm is therefore designed for DCR.

### Server behaviour

The MCP endpoint is an OAuth 2.1 resource server (MCP authorization spec [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)):

- `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728) advertises `resource=https://gtm.kayroslab.com/mcp` and the Keycloak issuer, with scopes `mcp:read` and `mcp:write`.
- 401 responses include `WWW-Authenticate` with `resource_metadata` and `scope="mcp:read"`.
- Access tokens are Keycloak JWTs, validated like the console (JWKS, issuer, expiry, signature). The required audience is the **MCP resource URL** (RFC 8707), not `gtm-console`.
- `mcp:read` is required on every authenticated call. Write tools (`confirm=true`) also need `mcp:write` or the server answers **403** `insufficient_scope`.

### Multi-tenant

`organization` and `groups` claims are resolved with the same `resolveTenant` helper as the console. Google calls use `tenant.googleCredential` only — never the operator service account — for an OAuth caller. URLs and GA4 / GSC / GTM identifiers are restricted to the tenant.

### Static token

When `MCP_API_TOKEN` is set and `MCP_STATIC_TOKEN_ENABLED` is not `false`, the static bearer still works as an **operator** credential (both scopes, no tenant filter). Disable it once the public connector uses OAuth.

### Production Keycloak changes (not applied by this PR)

See the French list above and `deploy/kayroslab-vps/keycloak/mcp-oauth/apply-mcp-oauth.sh`. Nginx must also proxy `/.well-known/oauth-protected-resource/mcp`. Do not run the script against production without an explicit go-ahead.

### Mistral setup

Add a Custom MCP Connector pointing at `https://gtm.kayroslab.com/mcp`, complete the Keycloak sign-in, then try a read-only tool such as `geo_crawler_access`.
