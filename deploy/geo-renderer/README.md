# GEO v2 Playwright one-shot pilot (not deployed)

The implementation is a **separate Docker Compose project**. It does not edit or call
`deploy/kayroslab-vps/deploy.sh` and must never share its Compose project name.

## Components

- `renderer`: non-root Chromium/Playwright, one-shot. Reads an **existing verified grant** from the GTM Growth SQLite data volume mounted read-only. 1 CPU, 1 GiB RAM, 128 PIDs, no public ports and no direct outbound Docker network.
- `egress`: HTTPS CONNECT proxy for the **one exact verified hostname**. It checks DNS A responses, rejects all non-public/ambiguous IPv4 results, and connects to an inspected numeric address. No IPv6 or arbitrary proxy ports in the pilot. 0.25 CPU/128 MiB.
- `private`: internal bridge between the browser and proxy only. `outbound`: external network for the proxy alone.

The proxy **does not** grant a domain verification: grant issuance and revocation belong to the trusted registry. DNS TXT and HTTPS-file checks use the `createSafeVerificationTransport` Node client (pinned public IPv4 address, no redirect, TLS verification).

## Production gates — do not start before all are satisfied

1. **CI regression gate:** Ordinary Docker `internal` networking was shown to permit direct access to the Docker host bridge in CI run #258. The private bridge now requests Docker Engine >=28 `gateway_mode_ipv4=isolated`, which deliberately assigns no host address to that bridge. `scripts/smoke-geo-network-boundary.sh` must confirm host-bridge, public IPv4 and metadata connections are all blocked on the disposable runner. The production VPS must independently pass these negative probes, a positive renderer-to-egress connectivity test, IPv6 checks and unrelated-service health checks before any run. Do not assume this CI probe proves general host isolation or safe cross-network routing.
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
