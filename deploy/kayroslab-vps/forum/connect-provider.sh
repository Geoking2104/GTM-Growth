#!/usr/bin/env bash
# The external TLS session terminates at id.discourse.com. Only the two forum
# containers share the internal DNS alias. No TCP listener is published.
set -euo pipefail
cd /opt/gtm-growth-forum
forum=gtmgrowth-forum
relay=gtmgrowth-forum-id
network=gtmgrowth-forum-identity
socket_dir=/var/lib/gtmgrowth-forum-id
provider=https://id.discourse.com/

probe=(curl --noproxy '*' --connect-timeout 5 --max-time 12 -fsS -o /dev/null)
if docker exec "$forum" "${probe[@]}" "$provider"; then exit 0; fi
"${probe[@]}" "$provider"
test -x /usr/lib/systemd/systemd-socket-proxyd
docker exec "$forum" test -x /usr/bin/socat
if ! getent group "$relay" >/dev/null; then groupadd --system "$relay"; fi
relay_gid=$(getent group "$relay" | cut -d: -f3)
install -d -o root -g "$relay" -m 0750 "$socket_dir"

for unit in "$relay.socket" "$relay.service"; do
    target="/etc/systemd/system/$unit"
    if [[ -e "$target" || -L "$target" ]]; then
        test ! -L "$target" && grep -Fxq '# Managed by the GTM Growth forum installer.' "$target"
    fi
    if ! cmp -s "$unit" "$target"; then install -m 0644 "$unit" "$target"; fi
done
systemctl daemon-reload
systemctl enable --now "$relay.socket"
"${probe[@]}" --unix-socket "$socket_dir/provider.sock" "$provider"

if ! docker network inspect "$network" >/dev/null 2>&1; then
    docker network create --internal --label "com.kayroslab.service=$relay" "$network"
fi
test "$(docker network inspect -f '{{.Internal}} {{index .Labels "com.kayroslab.service"}}' "$network")" = "true $relay"
if docker container inspect "$relay" >/dev/null 2>&1; then
    test "$(docker inspect -f '{{index .Config.Labels "com.kayroslab.service"}}' "$relay")" = "$relay"
    docker start "$relay"
else
    image=$(docker inspect -f '{{.Image}}' "$forum")
    docker run -d --name "$relay" --label "com.kayroslab.service=$relay" \
        --network "$network" --network-alias id.discourse.com --restart unless-stopped \
        --read-only --user "$(id -u nobody):$relay_gid" --cap-drop ALL \
        --security-opt no-new-privileges --sysctl net.ipv4.ip_unprivileged_port_start=0 \
        --cpus .20 --memory 48m --pids-limit 48 --log-opt max-size=1m --log-opt max-file=2 \
        --mount "type=bind,source=$socket_dir,target=/relay,readonly" \
        --entrypoint /usr/bin/socat "$image" TCP4-LISTEN:443,reuseaddr,fork UNIX-CONNECT:/relay/provider.sock
fi
if ! docker network inspect -f '{{range .Containers}}{{println .Name}}{{end}}' "$network" | grep -Fx "$forum" >/dev/null; then
    docker network connect "$network" "$forum"
fi
docker exec "$forum" "${probe[@]}" --retry 2 --retry-all-errors "$provider"
echo 'Forum verified the public TLS certificate of id.discourse.com over its private provider connection.'
