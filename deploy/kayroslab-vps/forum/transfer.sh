#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ${1:-} == local-admin ]]; then
    owner_password=${FORUM_BOOTSTRAP_PASSWORD:?The production bootstrap password has not been set}
    unset FORUM_BOOTSTRAP_PASSWORD
fi
ssh_dir=$(mktemp -d)
trap 'rm -rf "$ssh_dir"' EXIT
for attempt in 1 2 3; do
    if ssh-keyscan -T 15 -t ed25519 51.210.9.71 > "$ssh_dir/known_hosts"; then break; fi
    echo "SSH host-key scan timed out (attempt $attempt of 3)." >&2
    sleep 2
done
pin=$(ssh-keygen -lf "$ssh_dir/known_hosts" -E sha256 | awk '{print $2}')
test "$pin" = 'SHA256:iWJ+4asSlFAKA9UllEF2ZjYneUzm9OeRfZaUqQf9Ruc'
(umask 077; printf '%s\n' "$FORUM_SSH_KEY" > "$ssh_dir/key")
unset FORUM_SSH_KEY
remote() {
    ssh -T -i "$ssh_dir/key" -o BatchMode=yes -o IdentitiesOnly=yes -o HostKeyAlgorithms=ssh-ed25519 \
        -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$ssh_dir/known_hosts" -o GlobalKnownHostsFile=/dev/null \
        -o ConnectionAttempts=3 -o ConnectTimeout=25 -o ServerAliveInterval=30 "$FORUM_SSH_USER@51.210.9.71" "$@"
}
installer='sudo -n bash /opt/gtm-growth-forum/install.sh'
case "${1:?mode required}" in
    community)
        remote 'sudo -n docker inspect -f "{{index .Config.Labels \"com.kayroslab.service\"}}" gtmgrowth-forum | grep -Fxq gtmgrowth-forum && sudo -n docker exec gtmgrowth-forum mkdir -p /var/www/discourse/script/gtm-community'
        tar cf - -C community apply.rb localization.rb navigation.gjs community.scss -C "../../../../site/fr/assets" logo-rocket.png InterVariable.woff2 |
            remote 'sudo -n docker cp - gtmgrowth-forum:/var/www/discourse/script/gtm-community/'
        remote 'sudo -n docker exec --user discourse --workdir /var/www/discourse gtmgrowth-forum bundle exec rails runner /var/www/discourse/script/gtm-community/apply.rb'
        ;;
    local-admin)
        remote 'sudo -n docker inspect -f "{{index .Config.Labels \"com.kayroslab.service\"}}" gtmgrowth-forum | grep -Fxq gtmgrowth-forum'
        tar cf - bootstrap-local-admin.rb | remote 'sudo -n docker cp - gtmgrowth-forum:/var/www/discourse/script/'
        printf '%s' "$owner_password" | remote 'sudo -n docker exec -i --user discourse --workdir /var/www/discourse gtmgrowth-forum bundle exec rails runner /var/www/discourse/script/bootstrap-local-admin.rb && sudo -n touch /var/discourse/shared/gtmgrowth-forum/.gtmgrowth-local-admin'
        ;;
    mail-check)
        remote 'cd /opt/gtm-growth/deploy/kayroslab-vps && sudo -n docker compose --env-file .env.local -f docker-compose.prod.yml exec -T gtm-growth node --input-type=module' < check-mail.mjs
        remote 'sudo -n bash -s' < check-local-mail.sh
        ;;
    check)
        tar czf - install.sh dns-auth.py first-login.rb verify-registration.py connect-provider.sh run-id-proxy.sh gtmgrowth-forum-id.socket gtmgrowth-forum-id.service http.conf https.conf | remote 'set -e; sudo -n install -d -m 0755 /opt/gtm-growth-forum; sudo -n tar xzf - --no-same-owner -C /opt/gtm-growth-forum'
        result=$(remote "$installer check")
        printf '%s\n' "$result"
        case "$(tail -1 <<< "$result")" in
            FORUM_BUILD_REQUIRED) echo build=true >> "$GITHUB_OUTPUT" ;;
            FORUM_IMAGE_READY) echo build=false >> "$GITHUB_OUTPUT" ;;
            *) exit 1 ;;
        esac
        ;;
    install)
        [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]
        if [[ "$BUILD_REQUIRED" == true ]]; then
            docker save local_discourse/gtmgrowth-forum:965da71ac4a3 | gzip -1 | remote 'sudo -n docker load'
            sudo tar --numeric-owner -czf - -C /var/discourse/shared/gtmgrowth-forum . | remote "$installer seed"
        fi
        case "${DNS_VALIDATION:-false}" in
            true) mode=start-dns ;;
            false) mode=start ;;
            *) exit 2 ;;
        esac
        printf '%s\n' "$ADMIN_EMAIL" | remote "$installer $mode"
        ;;
    *) exit 2 ;;
esac
