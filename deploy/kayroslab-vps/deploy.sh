#!/usr/bin/env bash
# Deploy GTM Growth alongside OpenDPE and KayrosLab on the shared OVH VPS.
# Run as root after the repository has been updated in /opt/gtm-growth.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gtm-growth}"
DEPLOY_DIR="${APP_DIR}/deploy/kayroslab-vps"
ENV_FILE="${DEPLOY_DIR}/.env.local"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.production.example to .env.local and set MCP_API_TOKEN first." >&2
  exit 1
fi

# Generate a stable, dedicated HMAC secret without exposing it in Actions logs.
# Existing values are never overwritten; disabling the feature still works.
if ! grep -q '^REPORT_ACCESS_SECRET=' "${ENV_FILE}"; then
  umask 077
  printf '\nREPORT_ACCESS_SECRET=%s\n' "$(openssl rand -hex 32)" >> "${ENV_FILE}"
  echo "Created persisted report-code signing secret."
fi

if [[ ! -f "${APP_DIR}/.secrets/service-account.json" ]]; then
  echo "Missing optional Google service account at ${APP_DIR}/.secrets/service-account.json." >&2
  echo "GA4, GSC and GTM connectors will not be available until it is installed." >&2
fi

cd "${APP_DIR}"
# A bind-mounted theme edit is invisible to Compose. Include its content digest
# in the service configuration so only theme changes recreate Keycloak and clear
# its production theme cache. The database and other applications are preserved.
GTM_THEME_REVISION="$(find deploy/kayroslab-vps/keycloak/themes -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d ' ' -f 1)"
export GTM_THEME_REVISION
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build --remove-orphans
# Wait for SSO after a changed theme, then check the public delivery rather than
# reporting success solely because Compose started the containers.
for attempt in $(seq 1 36); do
  if curl --max-time 5 -fsS http://127.0.0.1:8180/realms/gtm-growth/.well-known/openid-configuration >/dev/null; then break; fi
  if [ "$attempt" = 36 ]; then echo "Keycloak did not become ready." >&2; exit 1; fi
  sleep 5
done
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T gtm-growth node --input-type=module < scripts/check-keycloak-brand.mjs
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "GTM Growth containers updated. Verify: curl -fsS http://127.0.0.1:4300/health"
