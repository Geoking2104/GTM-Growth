# GEO v2 — Playwright pilot on the shared OVH VPS (ADR, Sprint 0.1-B)

Status: **proposal / not deployable yet**. Applies only to ownership-verified domains.

## Context and non-negotiable boundaries

- Existing host: `vps-088d27a3` (4 vCPU, 7.6 GiB RAM, ~3.1 GiB available and 39 GiB free at the diagnostic snapshot).
- 12 existing containers were healthy. No swap was configured. The host is shared with OpenDPE and KayrosLab.
- Production Docker Compose is in `deploy/kayroslab-vps/docker-compose.prod.yml`. `deploy.sh` runs `up -d --build --remove-orphans`; do **not** append a worker to this project or invoke that deployment script for the renderer.
- GitHub Actions deployment must remain `workflow_dispatch` only, guarded by the `production` environment reviewer and explicit `DEPLOY` input. No workflow in this PR starts the renderer.
- Scores are not made public without the owner's explicit consent (separate from domain verification).

## Proposed architecture

1. A trusted ownership-verification registry issues a short-lived `VerifiedDomainGrant`. The untrusted audit request cannot supply or alter its status or dates. The exact host is authorized by `authorizeVerifiedAuditTarget`; no wildcard or subdomain inheritance.
2. A bounded FIFO queue admits at most one rendering job globally. Reject rather than queue indefinitely; a worker is started on demand, never exposed over a public port.
3. The launcher uses a **separate Compose project name** (for example `gtm-geo-renderer`) or an isolated `docker run`, never the live GTM application project's `up --remove-orphans` path.
4. Playwright/Chromium runs without root, with dropped capabilities, `no-new-privileges`, a read-only root filesystem where browser cache constraints permit, dedicated writable tmpfs, PID limit, no host Docker socket, no host mounts, and resource limits. Proposed initial ceilings: 1 CPU, 1 GiB RAM, one browser/context, 45-second job timeout, no automatic retry. Verify actual browser requirements in staging before enforcing read-only filesystem.
5. **Network egress policy is mandatory and must be enforced outside the browser process.** Allow HTTPS only to the current verified host's resolved public address(es); deny RFC1918, loopback, link-local, metadata endpoints, IPv6 ULA, host, bridge, and all internal/private destinations. DNS answers must be checked and destination IP pinned or inspected at the network boundary so DNS rebinding and redirects cannot escape the allowlist. Browser route handlers alone do not constitute SSRF protection.
6. Check every top-level navigation, redirect, iframe, worker, script, stylesheet, font, XHR/fetch, WebSocket and service worker request against the same policy. Block third-party requests during the pilot and disable downloads and service workers. On blocked/failed resources, record `render_incomplete` rather than assuming a full render.
7. Discard browser profile, cookies and temporary files after each job. Cap screenshot dimensions, artifacts and log bytes; never persist authentication secrets, cookies or page-injected tokens. Store evidence privately with retention/deletion rules. The scoring core remains deterministic; failures produce evidence/status rather than invented points.

## Domain ownership protocol (approved: DNS TXT or HTTPS file)

- A tenant administrator requests verification for an **exact** canonical public hostname. The backend creates a random 32-byte challenge, scoped to the tenant, hostname and selected method, with a 30-minute expiry. Store challenge state securely; never let the caller submit a pre-verified grant.
- **DNS TXT**: publish the exact value `gtm-growth-verification=<64 hexadecimal characters>` at `_gtm-growth-verify.<hostname>`. The resolver must return precisely one matching TXT record at that name. Flatten DNS TXT chunks within each record before handing records to the evaluator.
- **HTTPS file**: serve that exact value with optional single trailing newline and `Content-Type: text/plain` at `https://<hostname>/.well-known/gtm-growth-verification.txt`. Require a direct HTTP 200 response: **no redirect**, no credentialed URL and at most 128 response characters.
- The verification service uses an injected **trusted network transport**; the evaluator itself performs no outbound I/O. The transport must restrict DNS, validate every resolved public IP, enforce address pinning/egress filtering and deny internal targets, TLS bypass, redirects, oversized HTTP bodies and unsafe ports. Merely checking the returned `finalUrl` does not mitigate SSRF if the transport follows redirects.
- On verification success, atomically mark the challenge consumed and write an owner/tenant-bound grant (the sample domain grant expires after seven days). Prevent concurrent requests from consuming the same challenge twice. On grant expiry, domain transfer, tenant deletion or revocation, block new jobs; cancel queued jobs. Reverification is mandatory. A DNS or file proof is **not** consent to publish a score.
- The Node-only SQLite registry (`DomainVerificationRegistry`) stores SHA-256 token hashes, not raw challenge tokens, and an event log without proof contents. Default database path is `/data/domain-verifications.sqlite3`, on the existing GTM Growth data volume. Operations use `BEGIN IMMEDIATE`/FULL synchronous commits. The frontend must not access the SQLite file or set `tenantId`/`actorId`; the authenticated console/API layer must derive both from Keycloak claims and enforce tenant-admin or platform-admin role.
- The registry methods do not constitute an exposed API route, and the transport is still injected. Do **not** expose `/verify` or enable actual outbound checks until the secure network transport, rate limiting, CSRF protection, request authentication, and tenant ownership transfer protocol have been reviewed.
- Do not treat a successful challenge as authorization for subdomains, other ports, HTTP, non-public addresses, or future redirects. Multi-tenant ownership conflicts and a public-suffix/eTLD+1 policy require a separate registry decision.

## Gate before implementing a runnable container or deployment

- [x] Implement isolated SQLite registry primitives with atomic single-use challenge consumption, tenant scoping and revocation.
- [ ] Wire only through authenticated tenant-admin API handlers; define cross-tenant domain transfer, queued-job cancellation, rate limiting and seven-day re-verification policy.
- [ ] VPS-specific egress enforcement demonstrated with DNS rebinding, redirects, IPv4/IPv6 private/metadata and subdomain tests.
- [ ] Reproducible Playwright/Chromium image digest selected and smoke-tested without affecting current containers.
- [ ] CPU/RAM/PIDs/time limits load-tested under concurrent production traffic; no OOM or service degradation.
- [ ] Private evidence storage, retention and error semantics approved.
- [ ] GitHub `VPS_SSH_FINGERPRINT` configured as `SHA256:iWJ+4asSlFAKA9UllEF2ZjYneUzm9OeRfZaUqQf9Ruc` and a pinned connection succeeds. This ED25519 public-host fingerprint was read from the operator's successful strict SSH session on 2026-11-08; the earlier documentation omitted one lowercase `l` after `9U`. The SHA-256 digest has 43 unpadded Base64 characters. If it does not match, verify `/etc/ssh/ssh_host_ed25519_key.pub` through the authenticated OVH KVM before changing the pin; never disable verification or put an SSH private key in source control.
- [ ] `VPS_SSH_USER` and `VPS_SSH_KEY` checked against current authorized deploy credentials; the working local `root` key is not to be copied into GitHub without a separate least-privilege key decision.

## Rollout and rollback

1. Merge the guard and ADR only after review; no deployment side effect.
2. Add a dedicated renderer implementation in a subsequent PR after the network gate is verified.
3. Run synthetic and allowlisted customer-domain smoke tests, one at a time. Monitor memory, CPU, failures and shared service health.
4. To roll back, stop **only** the renderer project/job. Never run `docker compose down` against the shared production project.
