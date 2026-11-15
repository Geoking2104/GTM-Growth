#!/usr/bin/env bash
# Read-only operational report. Never print env values, tenant data or tokens.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/gtm-growth}"
DEPLOY_DIR="${APP_DIR}/deploy/kayroslab-vps"
docker compose --env-file "${DEPLOY_DIR}/.env.local" \
  -f "${DEPLOY_DIR}/docker-compose.prod.yml" exec -T gtm-growth node --input-type=module <<'REPORT'
import fs from 'node:fs';
import Database from 'better-sqlite3';
const present = name => Boolean(process.env[name]?.trim());
const configured = Object.fromEntries([
  'OIDC_ISSUER', 'KEYCLOAK_INTERNAL_URL', 'PAP_MEMBERSHIP_CLIENT_ID',
  'PAP_MEMBERSHIP_CLIENT_SECRET', 'KEYCLOAK_ADMIN_CLIENT_ID', 'KEYCLOAK_ADMIN_CLIENT_SECRET',
].map(name => [name, present(name)]));
console.log(JSON.stringify({
  enabled: process.env.PAP_ENABLED === 'true', configured,
  allowedClientCount: (process.env.PAP_ALLOWED_CLIENTS ?? '').split(',').filter(x => x.trim()).length,
  dedicatedIdentityReader: present('PAP_MEMBERSHIP_CLIENT_ID') &&
    process.env.PAP_MEMBERSHIP_CLIENT_ID !== process.env.KEYCLOAK_ADMIN_CLIENT_ID,
}, null, 2));
const file = `${process.env.TENANTS_PATH ?? '/data/tenants.json'}.sqlite3`;
if (fs.existsSync(file)) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  const rows = db.prepare('SELECT payload FROM tenants').all().map(row => JSON.parse(row.payload));
  console.log(JSON.stringify({ workspaces: rows.length, activeWorkspaces: rows.filter(t => t.status === 'active').length }));
  db.close();
}
for (const path of ['/health', '/api/poppy/capabilities', '/.well-known/poppy.json']) {
  const res = await fetch(`http://127.0.0.1:3000${path}`, {
    headers: { Host: 'gtm.kayroslab.com' }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  console.log(JSON.stringify({ internalPath: path, status: res.status }));
  await res.body?.cancel();
}
REPORT

# Probe HTTPS through this host's actual TLS vhost, without dumping its config.
for route in /health /console/agents.html /.well-known/poppy.json /.well-known/oauth-protected-resource /.well-known/oauth-authorization-server/api/poppy/oauth; do
  status="$(curl --silent --show-error --max-time 15 --resolve gtm.kayroslab.com:443:127.0.0.1 \
    --output /dev/null --write-out '%{http_code}' "https://gtm.kayroslab.com${route}")"
  printf 'HTTPS %s %s\n' "$status" "$route"
done
