#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pidfile="${KEYCLOAK_PID_FILE:-/tmp/keycloak-mcp-oauth.pid}"
if command -v docker >/dev/null 2>&1 && docker compose -f "$here/docker-compose.yml" ps --status running -q 2>/dev/null | grep -q .; then
  docker compose -f "$here/docker-compose.yml" down
fi
if [[ -f "$pidfile" ]]; then
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" || true
  fi
  rm -f "$pidfile"
fi
