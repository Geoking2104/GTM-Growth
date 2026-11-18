# Reliable public audit pilot

This release implements the first scaling increment: durable public audits and
an email-gated copy of the exact completed snapshot. It keeps Express and the
existing OVH deployment. It does not introduce Kubernetes or a paid enrichment provider.

## Customer workflow

The EN/FR landing page, public console, guided setup and journey planner request
asynchronous reads. The browser keeps a random request capability in session storage,
shows waiting/running/reconnecting states and resumes the same request after reload
or navigation to the console. The capability is sent in headers, never URL parameters.
If the request takes over two minutes, the next submission resumes it. A completed
snapshot is reused for up to 24 hours; the observation time remains visible. A failed
request can be explicitly submitted again, subject to admission quotas.

PostgreSQL atomically records the request and reserves capacity before execution.
Its pending records are the outbox. A dispatcher reconciles them with BullMQ every
five seconds using stable job IDs. Redis holds only job IDs, not URLs, email addresses
or report content. A separate worker uses the existing DNS-pinned public fetcher;
there is no Playwright execution, AI collection, private-source access or paid call.

Once completed, the console's invitation includes the audit ID and capability.
The server retrieves that immutable result and copies its report into the existing
email-code store. HTML, PDF and Markdown use this copy, without another site read.
Invitations reserve their email/IP limits before reading and sending. Replaying a
successful invitation request returns its existing ID. An interrupted or ambiguous
SMTP dispatch is not resent automatically with the same key. Check delivery before
making an explicit new request. Existing email-code sessions keep working.

Legacy clients retain the synchronous free-read JSON contract, with a maximum of
two distinct in-flight reads per API process and coalescing of identical requests.
Legacy invitation callers without an audit reference still perform a fresh read;
the unchanged stateless Cloudflare Worker does not provide durable audit jobs.

## Limits and configuration

| Setting / limit | Behavior |
| --- | --- |
| `AUDIT_JOBS_ENABLED` | Off for generic installs; on in the OVH Compose configuration |
| `AUDIT_DATABASE_URL` | Dedicated PostgreSQL database; never Keycloak's schema |
| `AUDIT_REDIS_URL` | Dedicated Redis with AOF and `maxmemory-policy=noeviction` |
| `AUDIT_JOBS_SECRET` | At least 32 characters; HMAC for anonymous admission keys |
| `METRICS_TOKEN` | Bearer token required for API metrics; unset means unavailable |
| `TRUST_EDGE_IP` | Enable only behind a private proxy overwriting `X-Real-IP` |
| Anonymous admission | Eight new audits/IP/hour; replays do not reserve twice |
| Outstanding requests | Maximum 100 pending/queued/running jobs globally |
| Worker execution | Two concurrent jobs/worker; 20 starts/minute globally per queue |
| Attempts | Maximum three ledger executions; bounded exponential retry delays |
| Retention | Audit access expires after 24 hours; admission removes expired ledger rows |
| Result size | Maximum 1.5 MB JSON per audit |
| Existing invitation limits | Four requests/email/day, eight/IP/hour; failed/uncertain attempts count |

These are operational pilot limits, not commercial plan entitlements. Public reads
remain free. Existing Mollie approval, checkout, entitlement and atomic usage rules
are unchanged. Production payments require the separate [billing acceptance](../billing/MOLLIE-SUBSCRIPTIONS-IMPLEMENTATION.md).

## Operation and observation

Run `npm run build`, then `npm run start:http` and `npm run start:audit-worker`
with the same audit database, Redis and secret. The OVH deployment script generates
independent persisted secrets if absent. It starts dedicated PostgreSQL, Redis and
worker services with bounded resources. It preserves the old `/data` volume and
Keycloak database; it does not import, replace or drop existing SQLite records.
Allow up to 1.2 GB additional container memory limits and measure actual use on the
shared VPS before release. The Compose worker allows 180 seconds for graceful stop.

- `/api/health/liveness`: API process available.
- `/api/health/readiness`: PostgreSQL, queue Redis and registered worker available
  when durable audits are enabled. This does not certify every optional connector.
- `/api/metrics`: protected Prometheus metrics for HTTP latency, retained job states
  and Node process resource use. Scrape the worker's internal port `3001/metrics`
  separately for attempts, completions, execution duration and first-start wait.
  Never expose the worker port publicly. No URL, email, tenant or campaign label.

Monitor failed jobs, pending age, readiness, memory and PostgreSQL connections.
Readiness's registered-worker check is a presence signal; monitor actual completion
and waiting time to detect a worker that remains connected but stops making progress.
The metrics do not estimate provider savings or make throughput promises.

## Backup, recovery and next migration

Back up `gtm_growth_audit_db` with PostgreSQL's supported dump tooling, the existing
application SQLite databases consistently, and the protected environment secrets.
Restore acceptance must recover both a pending audit and a saved verified report.
The PostgreSQL ledger can republish pending/queued work after Redis loss; completed
results are never reconstructed from Redis. An execution token fences stale worker
completion writes. Repeated read attempts can repeat public HTTP requests.

For rollback, set `AUDIT_JOBS_ENABLED=false` on the API and retain the new database
and volumes. Browser clients accept the legacy JSON response. Completed invitation
copies remain accessible in the original report database. Restore prior code/image
only with the corresponding protected configuration and backups; do not delete volumes.

Keep **one API replica** for this increment: billing, approvals, tenant registry,
report sessions and other module stores still use local SQLite/files; legacy MCP
SSE sessions remain process-local. Independent audit workers can be replicated.
Before multiple API hosts, migrate those stores through explicit per-module adapters,
move report/capture artifacts to shared object storage, and qualify session routing,
tenant isolation, quota transactions and rollback. This release makes no claim of
a complete PostgreSQL migration or high availability.

## Verification

`tests/audit-jobs.test.ts` runs against real PostgreSQL and Redis when
`TEST_AUDIT_DATABASE_URL` / `TEST_AUDIT_REDIS_URL` point to disposable test services.
It truncates **only the dedicated test ledger**. CI runs it using PostgreSQL 16 and
Redis 7 services. It checks concurrent admission across connections, quota reservation,
outbox recovery, stale completion fencing, protected monitoring and the entire
queued audit → email verification → HTML/PDF/MD workflow using synthetic page/mail fixtures.
Other tests cover browser resumability and invitation deduplication/SMTP ambiguity.

These checks establish source behavior. OVH capacity, real SMTP delivery, live
customer acceptance and Mollie payments require their own release evidence.
