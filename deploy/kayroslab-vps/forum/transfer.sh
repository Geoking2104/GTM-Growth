#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
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
    check)
        tar czf - install.sh dns-auth.py http.conf https.conf | remote 'set -e; sudo -n install -d -m 0755 /opt/gtm-growth-forum; sudo -n tar xzf - --no-same-owner -C /opt/gtm-growth-forum'
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
