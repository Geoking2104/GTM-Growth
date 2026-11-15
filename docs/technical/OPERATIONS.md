# Activation, validation and operations

[Technical track](README.md) · [Integration map](INTEGRATION-MAP.md) · [CI/CD](../CI_CD.md)

Use [the capability register](../journey/CAPABILITIES.md#release-evidence) for dated
release observations. The primary website is `gtm.kayroslab.com`; the primary
runbook is [deploy/kayroslab-vps](../../deploy/kayroslab-vps/README.md).
Generic Docker/Caddy, Fly/Railway, Pages and Worker guides are alternative targets,
not the current production topology.

## Activation checklist by connection

| Connection | Operator setup | Client acceptance |
| --- | --- | --- |
| Console | OIDC issuer, Keycloak client/groups, tenant registry, persistent volume | Sign in in FR/EN; select tenant; verify an out-of-scope request is rejected |
| GA4/GSC/GTM | Service account, API enablement, property/container permissions | Read a known period/resource; compare a source value; disclose missing access |
| AI collection | Encryption master key and tenant account, or tenant-specific provider key | Explicit account selection and charge confirmation; one bounded supported run; missing/disabled provider recovery |
| Commerce | Sealing key, store scopes, HTTPS webhook route and store secret | Sync then replay a signed event; check stable store/customer IDs, duplicate rejection and timestamps |
| CRM native/plugin | `CRM_PATH`; for plugin, protected `CRM_PLUGINS_FILE` and adapter token | Explicit enablement, roles, exact identity, unknown event, pause/erase and source replay behavior |
| GBP | Approved Google access, manager OAuth, location binding and quota | Profile/dashboard read; separately qualify supported writes with independent approval |
| Node-RED | Protected worker-token configuration and optional isolated runtime | Queued job execution with actual receipt; polling is not recurring collection scheduling |
| Social | Postiz config/allowlist, worker token, ZenML volume/resources | Draft → independent review → explicit schedule → exact provider readback; ambiguity/recovery |
| Slack | Separate Eve deployment, model credentials, HMAC and exact audience binding | Approved and rejected channel/user cases; sourced answer and tenant-preserving console link |

Detailed secret formats belong in each [integration runbook](../README.md#operations-and-integration-runbooks).
Do not commit credentials. Preserve application databases and the keys required to
read encrypted/pseudonymous records together in a protected backup procedure.

## Qualification by customer handoff

| Handoff | Repository checks | What still requires a real environment |
| --- | --- | --- |
| Public page → first finding | Public-fetch/free-read tests; landing QA | Reachable target and live API response |
| Product facts → questions → prompt | Customer-journey tests and FR/EN QA | Correct client context and administrator decision |
| Draft → approved action | Apply/Social/local publication tests | Actual adapter credentials and explicit authorised execution |
| Store → contact timeline | Ecommerce, CRM, plugin-client/HTTP tests; CRM browser QA | Real source permissions, identity proof and collection authorisation |
| Observations → report/team review | Analytics, data-agent, PDF and tenant tests | Source comparison, source coverage and audience review |

Fixtures are labelled synthetic. A fixture pass validates behavior under controlled
conditions; it is not evidence of a real store, live Slack installation or paid account.

## Release sequence

1. Review the source diff and associated capability/marketing changes. Run relevant
   local checks and inspect CI for the exact revision.
2. Merge through the repository review process. This does not deploy the primary
   website: the OVH workflow is manually dispatched on `main`, requires `DEPLOY`
   and uses the `production` environment.
3. Use the existing [OVH release workflow](../../.github/workflows/deploy-kayroslab-vps.yml)
   and pinned SSH host verification. Resolve a waiting environment approval through
   the authorised process; do not describe a waiting run as successful.
4. Inspect the executed steps and deployed revision. The workflow updates source
   with a fast-forward; the dispatch head alone is insufficient to identify a later
   checkout. Record the actual deployed SHA from logs/server evidence.
5. Check `/health`, the EN/FR pages, representative asset hashes and relevant public
   flows. Verify authenticated paths with an authorised client session. Record exact
   endpoints, revision, time and outcome, with no secrets in artifacts.
6. Qualify optional sources independently. Core deployment does not configure
   Postiz, Google consent, Slack, store webhooks, CRM adapters or billing.

Do not use package version `0.22.0` as a deployment identifier: multiple changes
are still under Unreleased. A successful Actions run is workflow evidence, not a
permanent guarantee of production health or feature activation.

## Persistence and recovery

- Application SQLite stores are local to one host/volume; Keycloak uses its own
  PostgreSQL volume. Redis is optional cache, not the recovery source.
- Follow the module runbook for consistent SQLite backups (backup API, or stop
  writers before copying the database and any journal). Include tenant data,
  historical imports, CRM HMAC keys and required encryption keys in restore planning.
- Do not delete/rotate CRM identity keys independently of their database. Restore
  tests must check identities, tenant scope and idempotency, not just process startup.
- On provider timeouts after a dispatch, reconcile existing state before retrying.
  Social and GBP explicitly represent uncertain outcomes.
- Pausing CRM collection is distinct from erasure. GTM erasure does not delete the
  source CRM/store record. Source cleanup remains a separate operation.
- Restoring old application code after a state migration may require an export or
  compatible database restore. Reverting a commit alone is not a data rollback.
- Keep optional renderer/Social projects isolated. Do not stop the shared OVH stack
  to recover a single optional worker.

## Maintenance routing

A broken navigation description belongs in the shared catalog and both generated
languages. An API contract belongs in its domain guide and tests. A capability
change updates the central register and both reading tracks. A release observation
updates only the dated evidence section. See [contribution rules](../../CONTRIBUTING.md).
