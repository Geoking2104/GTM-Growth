#!/usr/bin/env bash
# Explicit maintenance: update only two public labels, without restarting SSO.
# Existing admin credentials stay inside the Keycloak container. Never trace them.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/gtm-growth}"
DEPLOY_DIR="${APP_DIR}/deploy/kayroslab-vps"
docker compose --env-file "${DEPLOY_DIR}/.env.local" \
  -f "${DEPLOY_DIR}/docker-compose.prod.yml" exec -T keycloak /bin/bash -s <<'KEYCLOAK'
set -euo pipefail
set +x
umask 077
: "${KC_BOOTSTRAP_ADMIN_USERNAME:?Existing admin username is required}"
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?Existing admin credential is required}"
session_dir="$(mktemp -d)"
trap 'rm -rf "$session_dir"' EXIT
kcadm=/opt/keycloak/bin/kcadm.sh
"$kcadm" config credentials --config "$session_dir/config" \
  --server http://127.0.0.1:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"

# Realm overrides can take precedence over the versioned theme message bundles.
# Only the login heading is synchronized; all access settings remain untouched.
for locale in en fr; do
  echo "Existing $locale login title override:"
  "$kcadm" get "localization/$locale" -r gtm-growth \
    --fields loginAccountTitle --config "$session_dir/config"
  if [ "$locale" = en ]; then
    title='Sign in to your GTM Growth workspace'
  else
    title='Connexion à votre espace GTM Growth'
  fi
  "$kcadm" create "localization/$locale" -r gtm-growth \
    -s "loginAccountTitle=$title" --config "$session_dir/config"
  echo "Saved $locale login title override:"
  "$kcadm" get "localization/$locale" -r gtm-growth \
    --fields loginAccountTitle --config "$session_dir/config"
done
KEYCLOAK
