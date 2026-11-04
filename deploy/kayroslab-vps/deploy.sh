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

if [[ ! -f "${APP_DIR}/.secrets/service-account.json" ]]; then
  echo "Missing optional Google service account at ${APP_DIR}/.secrets/service-account.json." >&2
  echo "GA4, GSC and GTM connectors will not be available until it is installed." >&2
fi

cd "${APP_DIR}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build --remove-orphans
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "GTM Growth containers updated. Verify: curl -fsS http://127.0.0.1:4300/health"
