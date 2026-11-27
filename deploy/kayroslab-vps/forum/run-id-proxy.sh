#!/usr/bin/env bash
set -euo pipefail
# Select the IP for which the host successfully negotiated TLS. Refresh it
# on every socket activation, so DNS and the provider's address family can change.
peer=$(curl --noproxy '*' -fsS --connect-timeout 5 --max-time 10 --output /dev/null \
    --write-out '%{remote_ip}' https://id.discourse.com/)
case "$peer" in
    *:*) peer="[$peer]" ;;
    '') exit 1 ;;
esac
exec /usr/lib/systemd/systemd-socket-proxyd --connections-max=32 --exit-idle-time=3min "$peer:443"
