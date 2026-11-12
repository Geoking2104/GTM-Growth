#!/usr/bin/env bash
# Explicit maintenance: update only two public labels, without restarting SSO.
# Existing service-account credentials stay inside the application container.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/gtm-growth}"
DEPLOY_DIR="${APP_DIR}/deploy/kayroslab-vps"
docker compose --env-file "${DEPLOY_DIR}/.env.local" \
  -f "${DEPLOY_DIR}/docker-compose.prod.yml" exec -T gtm-growth node --input-type=module <<'KEYCLOAK'
import { KeycloakAdmin, keycloakAdminFromEnv } from './dist/tenants/keycloak-admin.js';

const config = keycloakAdminFromEnv();
if (!config) throw new Error('Existing Keycloak provisioner credentials are not configured.');
const admin = new KeycloakAdmin({
  ...config,
  fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
});
// Realm overrides can take precedence over the versioned theme message bundles.
// Update only the two headings through the existing authorized service account.
for (const [locale, title] of Object.entries({
  en: 'Sign in to your GTM Growth workspace',
  fr: 'Connexion à votre espace GTM Growth',
})) {
  const path = `/gtm-growth/localization/${locale}`;
  const before = await admin.call('GET', path);
  console.log(`${locale} previous title: ${before.data?.loginAccountTitle ?? '(theme default)'}`);
  if (before.data?.loginAccountTitle !== title) {
    await admin.call('POST', path, { loginAccountTitle: title });
  }
  const after = await admin.call('GET', path);
  if (after.data?.loginAccountTitle !== title) throw new Error(`${locale} title verification failed`);
  console.log(`${locale} verified title: ${title}`);
}
KEYCLOAK
