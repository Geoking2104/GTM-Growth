#!/usr/bin/env bash
# Production helper for MCP OAuth (#103): env keys, nginx well-known path, Keycloak script.
# Never prints secret values. Intended to run on the VPS after git ff-only to main.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gtm-growth}"
DEPLOY_DIR="${APP_DIR}/deploy/kayroslab-vps"
ENV_FILE="${DEPLOY_DIR}/.env.local"
NGINX_LIVE="${NGINX_LIVE:-/etc/nginx/sites-available/gtm.kayroslab.com}"
APPLY_KEYCLOAK=false
RELOAD_NGINX=false
ENSURE_ENV=true

for arg in "$@"; do
  case "$arg" in
    --apply-keycloak=true|--apply-keycloak) APPLY_KEYCLOAK=true ;;
    --apply-keycloak=false) APPLY_KEYCLOAK=false ;;
    --nginx=true|--nginx) RELOAD_NGINX=true ;;
    --nginx=false) RELOAD_NGINX=false ;;
    --ensure-env=false) ENSURE_ENV=false ;;
    --ensure-env=true|--ensure-env) ENSURE_ENV=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

S=()
if [[ "$(id -u)" -ne 0 ]]; then
  S=(sudo -n)
fi

present() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] && grep -q "^${key}=" "$ENV_FILE"
}

# Read a value from .env.local without printing it. Supports optional quotes.
read_env() {
  local key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
import sys
from pathlib import Path
path, key = Path(sys.argv[1]), sys.argv[2]
if not path.is_file():
    raise SystemExit(0)
for raw in path.read_text().splitlines():
    if raw.startswith(key + "="):
        value = raw[len(key) + 1:]
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        sys.stdout.write(value)
        break
PY
}

set_env_line() {
  local key="$1" value="$2"
  umask 077
  python3 - "$ENV_FILE" "$key" "$value" <<'PY'
import sys
from pathlib import Path
path, key, value = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text() if path.is_file() else ""
lines = text.splitlines()
out, found = [], False
for line in lines:
    if line.startswith(key + "="):
        out.append(f"{key}={value}")
        found = True
    else:
        out.append(line)
if not found:
    if out and out[-1] != "":
        out.append("")
    out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
path.chmod(0o600)
PY
}

if [[ "$ENSURE_ENV" == true ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing ${ENV_FILE}; refusing to continue." >&2
    exit 1
  fi
  if present MCP_RESOURCE; then
    echo "MCP_RESOURCE: already set"
  else
    set_env_line MCP_RESOURCE "https://gtm.kayroslab.com/mcp"
    echo "MCP_RESOURCE: added default public resource URL"
  fi
  if present MCP_PUBLIC_ORIGIN; then
    echo "MCP_PUBLIC_ORIGIN: already set"
  else
    set_env_line MCP_PUBLIC_ORIGIN "https://gtm.kayroslab.com"
    echo "MCP_PUBLIC_ORIGIN: added default public origin"
  fi
  # Keep the operator static bearer enabled (existing Mistral workspace connector).
  set_env_line MCP_STATIC_TOKEN_ENABLED true
  echo "MCP_STATIC_TOKEN_ENABLED: true"
fi

if [[ "$RELOAD_NGINX" == true ]]; then
  if [[ ! -f "$NGINX_LIVE" ]]; then
    echo "Nginx vhost not found at ${NGINX_LIVE}" >&2
    exit 1
  fi
  stamp="$(date +%Y%m%d-%H%M%S)"
  backup="/root/nginx-gtm.kayroslab.com.${stamp}"
  "${S[@]}" cp -a "$NGINX_LIVE" "$backup"
  echo "Nginx backup: ${backup}"
  tmp="$(mktemp)"
  "${S[@]}" cat "$NGINX_LIVE" > "$tmp"
  python3 - "$tmp" <<'PY'
import re, sys
from pathlib import Path
path = Path(sys.argv[1])
text = path.read_text()
if "oauth-protected-resource(/mcp)?" in text:
    print("nginx well-known already includes /mcp")
    raise SystemExit(0)
pattern = re.compile(r"location\s+~\s+\^/\\?\.well-known/[^\n{]+")
matches = list(pattern.finditer(text))
if not matches:
    print("NO_WELLKNOWN_LOCATION: no .well-known location found in the live vhost", file=sys.stderr)
    raise SystemExit(3)
def repl(match: re.Match[str]) -> str:
    line = match.group(0)
    if "oauth-protected-resource(/mcp)?" in line:
        return line
    if "oauth-protected-resource" not in line:
        return line
    return line.replace("oauth-protected-resource", "oauth-protected-resource(/mcp)?", 1)
updated, count = pattern.subn(repl, text)
if "oauth-protected-resource(/mcp)?" not in updated:
    print("LIVE_WELLKNOWN_UNRECOGNIZED: could not patch the live well-known location safely", file=sys.stderr)
    raise SystemExit(3)
path.write_text(updated)
print(f"nginx well-known location updated ({count} match(es))")
PY
  "${S[@]}" cp "$tmp" "$NGINX_LIVE"
  rm -f "$tmp"
  if ! "${S[@]}" nginx -t; then
    echo "nginx -t failed; restoring ${backup}" >&2
    "${S[@]}" cp -a "$backup" "$NGINX_LIVE"
    "${S[@]}" nginx -t
    exit 1
  fi
  "${S[@]}" systemctl reload nginx
  echo "nginx reloaded"
fi

if [[ "$APPLY_KEYCLOAK" == true ]]; then
  export ALLOW_PROD_KEYCLOAK=yes
  export REALM="${REALM:-gtm-growth}"
  export MCP_RESOURCE="${MCP_RESOURCE:-https://gtm.kayroslab.com/mcp}"
  export KEYCLOAK_URL="${KEYCLOAK_URL:-http://127.0.0.1:8180}"
  export MCP_DCR_TRUSTED_HOSTS="${MCP_DCR_TRUSTED_HOSTS:-callback.mistral.ai,chat.mistral.ai,console.mistral.ai}"

  if present KEYCLOAK_ADMIN_CLIENT_ID && present KEYCLOAK_ADMIN_CLIENT_SECRET; then
    export KEYCLOAK_ADMIN_CLIENT_ID="$(read_env KEYCLOAK_ADMIN_CLIENT_ID)"
    export KEYCLOAK_ADMIN_CLIENT_SECRET="$(read_env KEYCLOAK_ADMIN_CLIENT_SECRET)"
    if present KEYCLOAK_ADMIN_REALM; then
      export KEYCLOAK_ADMIN_REALM="$(read_env KEYCLOAK_ADMIN_REALM)"
    else
      export KEYCLOAK_ADMIN_REALM="${REALM}"
    fi
    echo "Keycloak auth: service account client id is present (value not printed)"
  elif present KEYCLOAK_ADMIN && present KEYCLOAK_ADMIN_PASSWORD; then
    export KEYCLOAK_ADMIN="$(read_env KEYCLOAK_ADMIN)"
    export KEYCLOAK_ADMIN_PASSWORD="$(read_env KEYCLOAK_ADMIN_PASSWORD)"
    echo "Keycloak auth: admin username is present (value not printed)"
  elif present KC_BOOTSTRAP_ADMIN_USERNAME && present KC_BOOTSTRAP_ADMIN_PASSWORD; then
    export KEYCLOAK_ADMIN="$(read_env KC_BOOTSTRAP_ADMIN_USERNAME)"
    export KEYCLOAK_ADMIN_PASSWORD="$(read_env KC_BOOTSTRAP_ADMIN_PASSWORD)"
    echo "Keycloak auth: bootstrap admin username is present (value not printed)"
  else
    echo "KEYCLOAK_CREDENTIALS_MISSING" >&2
    echo "Needed in ${ENV_FILE} (one of):" >&2
    echo "  - KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CLIENT_SECRET (recommended: gtm-provisioner, with manage-realm and manage-clients)" >&2
    echo "  - or KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD (master admin)" >&2
    echo "No Keycloak secret was printed or changed." >&2
    exit 4
  fi

  # Do not pass --test: that would create local fixture users.
  bash "${DEPLOY_DIR}/keycloak/mcp-oauth/apply-mcp-oauth.sh"
  echo "Keycloak MCP OAuth script applied to realm ${REALM}"
fi
