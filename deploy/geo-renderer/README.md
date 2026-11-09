# GEO v2 Playwright one-shot pilot (not deployed)

The implementation is a **separate Docker Compose project**. It does not edit or call
`deploy/kayroslab-vps/deploy.sh` and must never share its Compose project name.

## Components

- `renderer`: non-root Chromium/Playwright, one-shot. Reads an **existing verified grant** from the GTM Growth SQLite data volume mounted read-only. 1 CPU, 1 GiB RAM, 128 PIDs, no public ports and no direct outbound Docker network.
- `egress`: HTTPS CONNECT proxy for the **one exact verified hostname**. It checks DNS A responses, rejects all non-public/ambiguous IPv4 results, and connects to an inspected numeric address. No IPv6 or arbitrary proxy ports in the pilot. 0.25 CPU/128 MiB.
- `private`: internal bridge between the browser and proxy only. `outbound`: external network for the proxy alone.

The proxy **does not** grant a domain verification: grant issuance and revocation belong to the trusted registry. DNS TXT and HTTPS-file checks use the `createSafeVerificationTransport` Node client (pinned public IPv4 address, no redirect, TLS verification).

## Production gates — do not start before all are satisfied

1. **BLOCKED — host bridge gateway remains reachable from a Docker `internal` network on the CI runner.** `scripts/smoke-geo-network-boundary.sh` deliberately fails if the isolated container can open a connection to the bridge gateway. In CI run #258, direct Internet and cloud metadata attempts were blocked, **but the host gateway was reachable**. A Docker `internal` network and Playwright routing are not sufficient proof of confinement. Design and test a scoped host-level firewall restriction (including the host `INPUT` path for bridge-gateway destinations and `FORWARD`/`DOCKER-USER` paths for routed traffic) that denies renderer-to-host/private-network traffic while permitting only the egress gateway. Rules must not affect other Compose projects. Confirm all negative tests and unrelated service health on a disposable environment and then on the VPS before starting the renderer.
2. The renderer alone applies a locally adapted copy of the [upstream Playwright seccomp profile](https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json) at `deploy/geo-renderer/seccomp_profile.json` (Apache-2.0 upstream project). The local difference additionally allows the `chroot` syscall used inside Chromium-created user namespaces while retaining `cap_drop: ALL` (no added host capabilities). The egress service retains Docker default seccomp. CI must demonstrate `chromiumSandbox: true` with non-root Chromium before this gate can pass; additionally confirm the same on the VPS without weakening host AppArmor or the runtime sandbox. Verify the profile against the pinned Playwright version and pin the image digest after review. The official image is for test/development; untrusted browsing requires additional hardening.
3. Verify actual Docker volume name (`GEO_DATA_VOLUME_NAME`) and ensure the registry file already exists on the same app volume. Never mount the Docker socket, the whole host filesystem or private secrets into either container.
4. Confirm domain grant belongs to the tenant and is not expired/revoked; use a single job at a time. Operator CLI is only for trusted administrators, not HTTP clients. Capture approval, quotas and audit trail through the tenant-authenticated API in a follow-up integration.
5. Set environment values from approved inputs: `GEO_TENANT_ID`, `GEO_URL`, `GEO_TARGET_HOSTNAME` and `GEO_DATA_VOLUME_NAME`. Target hostname must equal the URL hostname; the egress proxy enforces the same host.

## Intended manual pilot (after gates)

```bash
# Run from the repository root, after verifying firewall and sandbox configuration.
docker compose -p gtm-geo-renderer -f deploy/geo-renderer/docker-compose.yml config
docker compose -p gtm-geo-renderer -f deploy/geo-renderer/docker-compose.yml up \
  --build --abort-on-container-exit --exit-code-from renderer --force-recreate
docker compose -p gtm-geo-renderer -f deploy/geo-renderer/docker-compose.yml down
```

Never run the last command against the KayrosLab production Compose project. The renderer emits bounded JSON proof (`complete` or `render_incomplete`) to stdout. A real end-to-end screenshot/report integration, queue, API authentication and retention implementation remain separate follow-up work. A blocked resource must not be silently scored as a successful render.
