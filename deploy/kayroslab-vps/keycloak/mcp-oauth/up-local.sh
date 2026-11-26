#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pidfile="${KEYCLOAK_PID_FILE:-/tmp/keycloak-mcp-oauth.pid}"

wait_ready() {
  echo "Waiting for Keycloak on 127.0.0.1:8180..."
  for _ in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:8180/realms/master/.well-known/openid-configuration" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "Keycloak did not become ready on 127.0.0.1:8180" >&2
  return 1
}

if curl -sf "http://127.0.0.1:8180/realms/master/.well-known/openid-configuration" >/dev/null; then
  echo "Keycloak already running on 127.0.0.1:8180"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose -f "$here/docker-compose.yml" up -d
  wait_ready
else
  # Official Keycloak zip fallback when Docker is not installed.
  kc_home="${KEYCLOAK_HOME:-/tmp/keycloak-26.4.7}"
  if [[ ! -x "$kc_home/bin/kc.sh" ]]; then
    echo "Docker is not available. Unpack Keycloak 26.4.7 to $kc_home (https://github.com/keycloak/keycloak/releases/download/26.4.7/keycloak-26.4.7.zip) or install Docker, then retry." >&2
    exit 1
  fi
  export KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
  export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
  nohup "$kc_home/bin/kc.sh" start-dev --http-host=127.0.0.1 --http-port=8180 >/tmp/keycloak-mcp.log 2>&1 &
  echo $! > "$pidfile"
  wait_ready
fi

export KEYCLOAK_URL=http://127.0.0.1:8180
export KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
export REALM=gtm-growth-mcp-test
export MCP_RESOURCE=http://127.0.0.1:18790/mcp
node "$here/apply-mcp-oauth.mjs" --test
echo "Local realm gtm-growth-mcp-test is ready."
