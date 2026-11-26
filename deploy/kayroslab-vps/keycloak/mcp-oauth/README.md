# Keycloak MCP OAuth (not applied to production by the PR)

- `apply-mcp-oauth.sh` — idempotent Admin API script. It refuses `auth.kayroslab.com` unless `ALLOW_PROD_KEYCLOAK=yes`.
- `up-local.sh` / `down-local.sh` / `docker-compose.yml` — Keycloak **26.4.7** on `127.0.0.1:8180`, test realm `gtm-growth-mcp-test`.
- If Docker is missing, `up-local.sh` can start an official Keycloak zip unpacked at `KEYCLOAK_HOME` (default `/tmp/keycloak-26.4.7`) with `start-dev` on localhost:8180.

See [docs/mcp/OAUTH.md](../../../../docs/mcp/OAUTH.md) for the exact production change list.
