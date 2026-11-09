#!/usr/bin/env bash
# Fail-closed Docker bridge boundary probe. Run on a disposable CI runner only.
set -euo pipefail
network="geo-boundary-ci-$"
proxy="geo-egress-ci-$"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  docker rm -f "$proxy" >/dev/null 2>&1 || true
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

# Positive path: the browser container must reach the exact-host CONNECT gateway
# on the same private isolated bridge. No public-domain request is made here.
docker run -d --name "$proxy" --network "$network" --read-only \
  --cap-drop ALL --security-opt=no-new-privileges \
  -e GEO_TARGET_HOSTNAME=example.com \
  gtm-geo-renderer-ci node dist/geo/rendering/geo-egress.js >/dev/null
sleep 1
if [[ "$(docker inspect -f "{{.State.Running}}" "$proxy")" != "true" ]]; then
  echo "CI egress gateway exited unexpectedly" >&2; docker logs "$proxy" >&2; exit 1
fi

docker run --rm --network "$network" --read-only --cap-drop ALL \
  --security-opt=no-new-privileges \
  -e GEO_CI_BRIDGE_GATEWAY="$gateway" \
  -e GEO_CI_PROXY_NAME="$proxy" \
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

// A deliberate off-host CONNECT must receive a 403 from the real proxy.
const rejectedByProxy = await new Promise(resolve => {
  const socket = net.connect({host: "geo-egress-ci-$", port: 3128, timeout: 3000});
  let response = "";
  socket.once("connect", () => socket.write("CONNECT unverified.example:443 HTTP/1.1\\r\\nHost: unverified.example:443\\r\\n\\r\\n"));
  socket.on("data", chunk => { response += chunk.toString("ascii"); if (response.includes("\\r\\n\\r\\n")) { socket.destroy(); resolve(response.startsWith("HTTP/1.1 403")); } });
  socket.once("error", () => resolve(false));
  socket.once("timeout", () => { socket.destroy(); resolve(false); });
  socket.once("close", () => resolve(response.startsWith("HTTP/1.1 403")));
});
console.log(`renderer -> private proxy with forbidden host: ${rejectedByProxy ? "rejected as expected" : "FAILED"}`);
if (!rejectedByProxy) process.exitCode = 1;
'
