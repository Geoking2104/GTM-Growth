#!/usr/bin/env bash
# Called by the forum workflow as root. No host services are rebuilt.
set -euo pipefail
cd /opt/gtm-growth-forum
exec 9>/run/lock/gtmgrowth-forum.lock
flock -w 15 9
host=forum.gtmgrowth.kayroslab.com
name=gtmgrowth-forum
share=/var/discourse/shared/gtmgrowth-forum
image=local_discourse/gtmgrowth-forum:965da71ac4a3
site=/etc/nginx/sites-enabled/gtmgrowth-forum.conf
acme=/var/www/gtmgrowth-forum-acme
cert=/etc/letsencrypt/live/$host/fullchain.pem
socket=$share/nginx.http.sock

preflight() {
    for tool in docker certbot nginx curl flock; do command -v "$tool" >/dev/null; done
    nginx -t
    systemctl is-active --quiet nginx
    getent ahostsv4 "$host" | awk '$1 == "51.210.9.71" { found=1 } END { exit !found }'
    if [[ -e "$site" || -L "$site" ]]; then
        [[ -f "$site" && ! -L "$site" ]] && grep -Fxq '# Managed by the GTM Growth forum installer.' "$site" || {
            echo "Existing unmanaged nginx site at $site" >&2; exit 1;
        }
    elif nginx -T 2>/dev/null | grep -E '^\s*server_name\s' | grep -Fw "$host" >/dev/null; then
        echo "An existing nginx site already serves $host" >&2; exit 1
    fi
    if docker container inspect "$name" >/dev/null 2>&1; then
        test "$(docker inspect -f '{{index .Config.Labels "com.kayroslab.service"}}' "$name")" = "$name"
    fi
    if [[ -e "$share" ]]; then test -f "$share/.gtmgrowth-forum-managed"; fi
}

publish_nginx() {
    local candidate backup
    candidate=$(mktemp)
    backup=$(mktemp)
    cat "$@" > "$candidate"
    if cmp -s "$candidate" "$site"; then rm -f "$candidate" "$backup"; return; fi
    local had_site=false
    if [[ -f "$site" ]]; then cp "$site" "$backup"; had_site=true; fi
    install -m 0644 "$candidate" "/etc/nginx/.gtmgrowth-forum-new"
    mv -T /etc/nginx/.gtmgrowth-forum-new "$site"
    if ! nginx -t || ! systemctl reload nginx; then
        if "$had_site"; then install -m 0644 "$backup" "$site"; else rm -f "$site"; fi
        nginx -t && systemctl reload nginx
        rm -f "$candidate" "$backup"; return 1
    fi
    rm -f "$candidate" "$backup"
}

case "${1:?mode required}" in
    check)
        preflight
        free -m
        df -h "$(docker info --format '{{.DockerRootDir}}')" /
        if docker image inspect "$image" >/dev/null 2>&1 && [[ -f "$share/.gtmgrowth-forum-managed" ]]; then
            echo FORUM_IMAGE_READY
        else
            root=$(docker info --format '{{.DockerRootDir}}')
            test "$(df -Pm "$root" | awk 'END{print $4}')" -ge 10240 || { echo 'Insufficient space to import Discourse'; exit 1; }
            echo FORUM_BUILD_REQUIRED
        fi
        ;;
    seed)
        if [[ -f "$share/.gtmgrowth-forum-managed" ]]; then cat >/dev/null; exit; fi
        test ! -e "$share"
        install -d -m 0755 "$(dirname "$share")"
        stage=$(mktemp -d "${share}.seed.XXXXXX")
        trap 'rm -rf "$stage"' EXIT
        tar --numeric-owner -xzpf - -C "$stage"
        test -s "$stage/postgres_data/PG_VERSION"
        test ! -e "$stage/postgres_data/postmaster.pid"
        touch "$stage/.gtmgrowth-forum-managed"
        chmod 0755 "$stage"
        mv -T "$stage" "$share"
        ;;
    start|start-dns)
        preflight
        IFS= read -r admin
        [[ "$admin" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]
        test -s "$share/postgres_data/PG_VERSION"
        if ! docker container inspect "$name" >/dev/null 2>&1; then
            awk '/MemAvailable:/ { exit ($2 < 2359296) }' /proc/meminfo || { echo 'Less than 2.25 GiB RAM available to start the forum'; exit 1; }
            docker run -d --name "$name" --label "com.kayroslab.service=$name" \
                --restart unless-stopped --memory=2g --memory-swap=2g --cpus=1.5 --shm-size=256m \
                --log-opt max-size=10m --log-opt max-file=3 \
                -v "$share:/shared" -v "$share/log/var-log:/var/log" \
                -e "DISCOURSE_DEVELOPER_EMAILS=$admin" \
                "$image" /sbin/boot
        else
            docker start "$name"
        fi
        ready=false
        for attempt in $(seq 1 100); do
            if [[ "$(curl -fsS --max-time 4 --unix-socket "$socket" -H "Host: $host" -H 'X-Forwarded-Proto: https' http://localhost/srv/status 2>/dev/null || true)" == ok ]]; then ready=true; break; fi
            sleep 3
        done
        if ! "$ready"; then docker inspect -f 'state={{.State.Status}} oom={{.State.OOMKilled}} restarts={{.RestartCount}}' "$name"; exit 1; fi
        install -d -m 0755 "$acme"
        if [[ ! -s "$cert" ]]; then publish_nginx http.conf; fi
        if [[ "$1" == start-dns ]]; then
            install -d -m 0700 /run/gtmgrowth-forum-acme
            proof=/run/gtmgrowth-forum-acme/proof
            rm -f "$proof"
            trap 'rm -f "$proof"' EXIT
            FORUM_DNS_SESSION=1 certbot certonly --manual --preferred-challenges dns \
                --manual-auth-hook 'python3 /opt/gtm-growth-forum/dns-auth.py' \
                --cert-name "$host" -d "$host" --non-interactive --keep-until-expiring \
                --deploy-hook 'systemctl reload nginx' &
            certbot_pid=$!
            while kill -0 "$certbot_pid" 2>/dev/null && [[ ! -s "$proof" ]]; do sleep 2; done
            if [[ -s "$proof" ]]; then printf 'DNS TXT _acme-challenge.%s = %s\n' "$host" "$(cat "$proof")"; fi
            wait "$certbot_pid"
        elif [[ ! -s "$cert" ]]; then
            certbot certonly --webroot -w "$acme" --cert-name "$host" -d "$host" --non-interactive --keep-until-expiring --deploy-hook 'systemctl reload nginx'
        fi
        publish_nginx http.conf https.conf
        test "$(curl --retry 6 --retry-all-errors --retry-delay 2 --max-time 10 -fsS --resolve "$host:443:127.0.0.1" "https://$host/srv/status")" = ok
        if [[ "$1" == start-dns ]]; then
            if certbot reconfigure --non-interactive --cert-name "$host" --authenticator webroot --preferred-challenges http --webroot-path "$acme"; then
                echo 'Unattended webroot renewal verified with the staging CA.'
            else
                echo 'Certificate is installed. Renew through the DNS mode until unattended HTTP validation is available.'
            fi
        fi
        # A healthy status endpoint can coexist with a broken first-login wizard.
        bash connect-provider.sh
        if ! timeout 100 docker exec -i --user discourse --workdir /var/www/discourse "$name" bundle exec rails runner - < first-login.rb; then
            curl --max-time 10 -sS -o /dev/null -w 'Host to Discourse ID: HTTP %{http_code}\n' https://id.discourse.com/ || true
            docker exec "$name" curl --max-time 10 -sS -o /dev/null -w 'Container to Discourse ID: HTTP %{http_code}\n' https://id.discourse.com/ || true
            # Print a limited classification, never arbitrary log lines or provider responses.
            python3 - "$share/log/rails/production.log" <<'PYLOG'
import re, sys
from pathlib import Path
with Path(sys.argv[1]).open('rb') as log:
    log.seek(0, 2)
    log.seek(max(0, log.tell() - 262144))
    entries = log.read().decode(errors='replace').split('Discourse ID register failed at step')
if len(entries) > 1:
    entry = entries[-1][:700]
    codes = re.findall(r"(?:/challenge|/register)' failed: ([0-9]{3})", entry)
    reasons = re.findall(r"Redirect URI must use HTTPS|failed to connect|timed? ?out|connection refused|SSL_connect|certificate verify failed|getaddrinfo|invalid_parameters|challenge verification failed|already registered|Net::[A-Za-z]+Timeout|rate limit|domain verification|domain mismatch|invalid_redirect_uri|challenge_token|too many requests|Forbidden|Name or service not known|Network is unreachable|end of file reached", entry, re.I)
    print("Provider response status:", codes, "diagnostics:", reasons)
PYLOG
            exit 1
        fi
        ;;
    *) exit 2 ;;
esac
