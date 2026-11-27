#!/usr/bin/env bash
# The GTM realm uses a passwordless, host-local SMTP listener. Check its exact
# endpoint and the actual forum namespace without submitting a message.
set -euo pipefail
if ! ip -4 route get 172.22.0.1 | grep -q '^local 172\.22\.0\.1 '; then
    echo 'The configured SMTP address does not belong to this VPS.'
    exit 0
fi
echo 'The configured SMTP address belongs to this VPS.'
ss -Hltn 'sport = :25' | awk '{print "VPS listening for SMTP at", $4}'
systemctl is-active postfix || true
service_dir=/opt/gtm-growth/deploy/kayroslab-vps
sender=$(docker compose --env-file "$service_dir/.env.local" -f "$service_dir/docker-compose.prod.yml" exec -T gtm-growth node --input-type=module <<'JS'
import { KeycloakAdmin, keycloakAdminFromEnv } from './dist/tenants/keycloak-admin.js';
try {
  const config = keycloakAdminFromEnv();
  const admin = new KeycloakAdmin({ ...config, fetch: (u,o) => fetch(u,{...o,signal:AbortSignal.timeout(10000)}) });
  const { data } = await admin.call('GET','/gtm-growth');
  const s = data.smtpServer;
  if (s?.host === '172.22.0.1' && Number(s.port || 25) === 25 && s.auth !== 'true' &&
      s.ssl !== 'true' && s.starttls !== 'true' && /^[a-z0-9._+-]+@(?:[a-z0-9-]+\.)*kayroslab\.com$/i.test(s.from)) {
    process.stdout.write(s.from);
  }
} catch { process.exitCode = 1; }
JS
)
if [[ -z "$sender" ]]; then echo 'Local relay profile does not match the GTM realm.'; exit 0; fi
probe=$(cat <<'PY'
import smtplib, sys
label, sender = sys.argv[1:]
try:
    with smtplib.SMTP('172.22.0.1', 25, local_hostname='forum.gtmgrowth.kayroslab.com', timeout=7) as client:
        client.ehlo_or_helo_if_needed()
        code, _ = client.mail(sender)
        if code != 250:
            print(f'{label}: sender rejected, SMTP {code}')
        else:
            code, _ = client.rcpt('contact@kayroslab.com')
            print(f'{label}: recipient envelope SMTP {code}')
        client.rset()
except (smtplib.SMTPException, OSError) as error:
    print(f'{label}: {type(error).__name__}')
PY
)
python3 - VPS "$sender" <<< "$probe"
docker exec -i gtmgrowth-forum python3 - Discourse "$sender" <<< "$probe"
