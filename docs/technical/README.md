# Track 2 — Technical

[Documentation hub](../README.md) · [Shared journey](../journey/README.md) · [Marketing counterpart](../marketing/README.md)

This track maps the same customer decisions to executable modules, configuration
and verification. For source/activation/release distinctions, use the
[capability register](../journey/CAPABILITIES.md). Package version is 0.22.0;
the source baseline for this review is `353e658`.

## Runtime and responsibility map

The [durable audit pipeline](AUDIT-PIPELINE.md) adds dedicated PostgreSQL request
storage, a BullMQ outbox dispatcher and separate Redis workers for public reads.
API and worker images now use Node 24. Other module stores remain on SQLite/files;
only audit workers are ready for independent replication in this increment.

The [console decision refit](../journey/CONSOLE-DECISION-REFIT.md) includes five
business areas plus a member Portfolio, a durable cross-module inbox, synchronized
intent evidence and a four-check GTM audit. `src/console/decision-*.ts` and
`measurement-audit.ts` reuse existing provider adapters, scoped credentials and
native approval rules. SQLite state belongs on the existing persistent data volume.
Approval and execution remain distinct; deployment receipts and impact reminders
are not implemented by this release.

| Layer | Implementation | Role |
| --- | --- | --- |
| Core | Node ≥24, TypeScript, Express, Zod | Public API, authenticated console API, MCP and CLI |
| UI | Static FR/EN HTML/CSS and JavaScript modules in `site/` | Shared landing generation, console navigation and source-aware states |
| Billing | Dedicated Mollie GTM profile; `src/billing/` and isolated SQLite | Verified payments, paid/grace/read-only policy, explicit enrollment and atomic quotas; disabled by default. [Activation runbook](../billing/MOLLIE-SUBSCRIPTIONS-IMPLEMENTATION.md) |
| Identity | Keycloak; PostgreSQL for Keycloak | OIDC/JWKS validation, tenant membership and resource scope |
| Application state | Module SQLite stores on the local persistent volume | Tenant registry, observations, approvals, CRM events and workflow state |
| Public audit jobs | Dedicated PostgreSQL + BullMQ + separate Redis | Durable admission/outbox, bounded workers and immutable completed snapshots |
| Cache | Optional Redis | Caching; not the durable workflow database |
| Hosting | Existing OVH stack: Docker Compose, Nginx, TLS | Primary product deployment |
| Local worker | Optional Node-RED | Poll queued GBP/LOC jobs |
| Social worker | Optional Python 3.11, pinned ZenML; Postiz provider | Short pipeline executions around durable GTM approvals |
| Slack | Separate Eve package, Node 26 | Approved Slack bindings and signed read bridge |

## Implementation by journey stage

| Stage | Main code | Handoff | Relevant validation |
| --- | --- | --- | --- |
| Diagnose | [Public read](../../src/freeread/index.ts), [360° contract](../../src/freeread/report360.ts), [fetch guard](../../src/http/public-fetch.ts), [GEO](../../src/geo/audit.ts), [email-code API](../../src/report-access/router.ts), [PDF/MD export](../../src/report-access/export.ts) | Source-labelled findings, five-pillar unknown-state contract, FR/EN guides, optional saved public snapshot behind single-use email code; live email depends on OVH TLS SMTP activation | `free-read`, `free-report360`, `report360-ui`, `report-access`, `report-access-router`, `public-fetch`, `geo` tests |
| Understand | [Context extraction](../../src/freeread/journey-context.ts), [journey model](../../site/console/customer-journey-model.js), [journey API](../../src/console/journey.ts) | Confirmed context → hypotheses → explicit prompt save | `customer-journey`, `customer-journey-ui`, `website-journey` tests |
| Prepare | [Apply preview](../../src/apply/preview.ts), [content ops](../../src/console/content-ops.ts), [Social service](../../src/social/service.ts), [GBP publication](../../src/local-seo/publication.ts) | Adapter-specific draft, approval and execution semantics | `apply-*`, `console-ops`, `social*`, `local-seo-publication` tests |
| Measure | [Google](../../src/google/), [AI collection](../../src/console/ai-visibility-providers.ts), [commerce](../../src/ecommerce/), [CRM](../../src/crm/) | Scoped observations; commerce outbox → CRM events | Analytics, provider, ecommerce and CRM tests |
| Coordinate | [Data agent](../../src/data-agent/), [local SEO](../../src/local-seo/), [reports](../../src/report/), [Ops](../../src/console/ops-routes.ts) | Curated reads, roles, scoped exports and next decisions | Data-agent, tenant-isolation, local network and PDF tests |

Names in the last column refer to files under [tests](../../tests/), not separate
production services. [Integration map](INTEGRATION-MAP.md) expands the boundaries.

## Local setup

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd GTM-Growth
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run build
pnpm run cli help
pnpm run cli geo-audit --url https://example.com
```

Public audit tools do not need Google credentials. For connected Google tools,
configure a service account through the supported environment settings, enable
the relevant APIs and grant access to the exact GA4 property/GTM container/GSC
property. Start with read permissions. GBP uses its own listing-manager OAuth
configuration, not the analytics service account.

```bash
pnpm run start:stdio
# Alternatively, after configuring access:
HOST=127.0.0.1 pnpm run start:http
```

The HTTP backend defaults to port 3000; it is not the complete Nginx/static-site/SSO
stack. `/health` is public. `/mcp` and legacy `/sse` use `MCP_API_TOKEN` when set;
without it those transports are open. Configure a token before any network exposure.
The console API requires a configured OIDC issuer and a valid authorised token;
without `OIDC_ISSUER` it fails closed. See [OVH setup](../../deploy/kayroslab-vps/README.md)
for the integrated console and Keycloak deployment.

Client-specific instructions: [Claude](../CLAUDE_SETUP.md), [Codex](../CODEX_SETUP.md),
[Grok](../GROK_SETUP.md), [canonical agent setup](../../skills/gtm-growth/references/setup.md).
Full command reference: [CLI](../CLI.md). The canonical agent package is
`skills/gtm-growth`; `skills/ga-to-grok` is retained as legacy material.

## Access boundaries

1. Console identity is verified server-side against the configured issuer/JWKS.
   The requested `X-Tenant` must match membership; it is not authority by itself.
2. Tenant domain/property/container checks remain server-side. A user's business
   profile and a saved navigation destination cannot expand access.
3. CRM and Social add explicit module roles. Local SEO/CRM/Social reject global
   platform-admin or machine sessions where their module contract requires a
   client human account. Do not generalise platform administration into all data access.
4. The general MCP registry is an **operator interface**. Its bearer token is shared
   server access; tools such as commerce accept a `tenantId` argument. It is not an
   authenticated client-membership boundary. Do not distribute that token to
   untrusted tenants or expose arbitrary tools through the Slack bridge.
5. The separately scoped Social/Competition MCP routes, CRM plugin tokens, local
   worker tokens and Slack HMAC bindings each have their own permission contract.
   A configured secret does not authorise an unrelated module.

See [server mounts](../../src/server.ts), [console auth](../../src/console/auth.ts),
[tenant context](../../src/tenants/context.ts), [CRM plugin contract](../../integrations/crm-plugin/README.md)
and [Slack runbook](../../integrations/eve-data-agent/README.md).

## External writes are adapter-specific

| Adapter | Current gate | Result |
| --- | --- | --- |
| Google/GTM tools | Documented write flag, scopes and explicit confirmation | Supported tool-specific mutation; not governed by Apply Mode |
| IndexNow | Verified key/host conditions and `confirm=true` | Submission receipt, not indexing proof |
| WordPress article | Tenant admin, credentials, explicit approval and quality gates | Draft only; no IndexNow submission of draft URL |
| GBP | Global/tenant enablement, exact location, different admin approval, current diff, explicit execution | Phone/website change and independent API readback |
| Social | Exact reviewed payload/schedule, separate admin, valid context/accounts, explicit queue, scoped worker | Dispatch followed by provider readback; ambiguous results require reconciliation |
| Apply Mode | Authenticated preview; registry remains library-only | No production writer or rollback transport |

Do not replace these distinct rules with a blanket “all writes require confirm=true”.

## Source layout

| Path | What belongs here |
| --- | --- |
| [src/console](../../src/console/) | Console API adapters and orchestration |
| [src/google](../../src/google/), [src/geo](../../src/geo/), [src/indexnow](../../src/indexnow/) | Source adapters, audits and protocol-specific operations |
| [src/ecommerce](../../src/ecommerce/), [src/crm](../../src/crm/), [src/social](../../src/social/), [src/local-seo](../../src/local-seo/) | Domain services, stores, permissions and workflows |
| [src/tools](../../src/tools/), [src/cli.ts](../../src/cli.ts), [src/server.ts](../../src/server.ts) | MCP catalog, CLI and transport mounting |
| [site](../../site/) | Generated FR/EN pages, shared dictionaries/catalog and console modules |
| [integrations](../../integrations/) | CRM reference client and optional Eve/ZenML services |
| [deploy](../../deploy/) | Primary OVH stack and separately operated optional runtimes |
| [tests](../../tests/), [scripts](../../scripts/) | Unit/integration tests, static generation, browser and runtime smoke checks |
| [docs](../README.md) | Journey → reading tracks → contracts → operations → audit/history |

Executable paths remain stable: no source/package move is needed to make the
reading order logical. Deep guides retain their existing URLs.

## Verify and operate

```bash
pnpm run docs:check
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run site:check
```

Run the checks appropriate to a change. Site source edits require `pnpm run
site:render` before `site:check`; generated EN/FR pages must match their sources.
CI also runs the production image, bilingual browser flows and optional runtime
smoke tests. [Operations](OPERATIONS.md) covers activation, release evidence and
recovery; [CI/CD](../CI_CD.md) maps the workflows. Live provider acceptance is
separate from fixture/CI success.

## PAP 1.0 read pilot

[PAP authorization, activation and rollback](PAP-RUNBOOK.md). Implemented behind a disabled feature flag; production and real-agent interoperability require staging evidence.
