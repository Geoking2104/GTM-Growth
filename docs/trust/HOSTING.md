# Hosting on OVH (R10)

The reference deployment is the OVH stack under `deploy/kayroslab-vps/`
(Docker Compose, Nginx, Keycloak 26.4), as documented in the deployment
readme. This page states the trust posture; it is the operator's runbook to
keep true.

- **Region.** The VPS, volumes and backups live in OVH datacentres in France
  (EU). No component of the primary stack is hosted outside the EU.
- **Isolation.** Every tenant's data (SQLite stores, TenantStore entries) sits
  on the persistent volume under `data/`, one store per tenant and per module;
  cross-tenant reads are refused by the console layer (tenant resolution +
  `TenantAccessError`).
- **TLS.** Nginx terminates TLS for the platform; all billing, PAP and console
  URLs must be HTTPS (enforced fail-closed by `src/billing/config.ts` and the
  PAP canonical-host middleware).
- **Secrets.** Env-based secrets on the host (`.env`), never in the image;
  SQLite ledgers are created `0600`; sealed report addresses are encrypted at
  rest by the report-access module.
- **Backups.** Operator act: nightly snapshot of the `data/` volume and the
  Keycloak realm database (OVH backup feature plus an off-box copy), restore
  documented in the deployment readme; the CI "Audit · PostgreSQL and Redis
  recovery" job exercises the durable-job recovery path on every build.
- **Updates.** Platform images rebuilt from `main` after CI (9/9 green);
  host-level security updates are the operator's routine; Keycloak follows the
  pinned 26.4 line.
