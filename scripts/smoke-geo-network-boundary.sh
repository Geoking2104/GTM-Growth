#!/usr/bin/env bash
# Fail-closed Docker bridge boundary probe. Run on a disposable CI runner only.
set -euo pipefail
network="geo-boundary-ci-$$"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create --driver bridge --internal \
  --opt com.docker.network.bridge.gateway_mode_ipv4=isolated "$network" >/dev/null
gateway="$(docker network inspect -f '{{(index .IPAM.Config 0).Gateway}}' "$network")"
if [[ -z "$gateway" ]]; then echo "Missing bridge gateway" >&2; exit 1; fi
# Bind to all disposable CI host interfaces: in isolated gateway mode the
# private Docker bridge must not have an address on the host.
python3 -m http.server 18765 --bind 0.0.0.0 >/dev/null 2>&1 &
server_pid="$!"
sleep 1
if ! kill -0 "$server_pid" 2>/dev/null; then echo "CI probe listener failed" >&2; exit 1; fi

docker run --rm --network "$network" --read-only --cap-drop ALL \
  --security-opt=no-new-privileges \
  -e GEO_CI_BRIDGE_GATEWAY="$gateway" \
  --entrypoint node gtm-geo-renderer-ci --input-type=module -e '
import net from "node:net";
async function reachable(host, port) {
  return await new Promise(resolve => {
    const socket = net.connect({ host, port, timeout: 1500 });
    const done = allowed => { socket.destroy(); resolve(allowed); };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}
const targets = [
  [process.env.GEO_CI_BRIDGE_GATEWAY, 18765, "host bridge gateway"],
  ["1.1.1.1", 443, "direct external IPv4"],
  ["169.254.169.254", 80, "cloud metadata"],
];
let denied = true;
for (const [host, port, label] of targets) {
  const connected = await reachable(host, port);
  console.log(`${label}: ${connected ? "UNSAFE reachable" : "blocked"}`);
  if (connected) denied = false;
}
if (!denied) process.exitCode = 1;
'
