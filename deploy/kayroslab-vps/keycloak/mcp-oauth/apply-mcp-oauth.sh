#!/usr/bin/env bash
# Apply MCP OAuth client scopes, audience, PKCE and DCR policies to a Keycloak realm.
# Never prints secrets. Refuses to run against auth.kayroslab.com unless ALLOW_PROD_KEYCLOAK=yes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
url="${KEYCLOAK_URL:-http://127.0.0.1:8180}"
if [[ "$url" == *auth.kayroslab.com* && "${ALLOW_PROD_KEYCLOAK:-}" != "yes" ]]; then
  echo "Refusing to change the production realm. Re-run with ALLOW_PROD_KEYCLOAK=yes after review." >&2
  exit 2
fi
exec node "$here/apply-mcp-oauth.mjs" "$@"
