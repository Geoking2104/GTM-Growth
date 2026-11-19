# PAP pilot operator runbook

[Overview](../PAP.md) · [Authorization decision](../architecture/PAP-AUTHORIZATION.md)

## Configuration and gates

The deployment workflow offers `pap_readiness_only`: after updating the checkout,
it inspects the running container and HTTPS routes without rebuilding, restarting,
or editing configuration. The report contains presence flags, counts and HTTP
statuses only; credentials, tenant records and tokens never enter workflow logs.

The code is shipped with `PAP_ENABLED=false`. The production Compose template persists the PAP database in the existing `/data` volume. No new containers or cloud services are required. Do not expose the existing `/mcp` endpoint as a PAP channel.

| Variable | Meaning |
| --- | --- |
| `PAP_ENABLED` | Exact `true` enables the facade and discovery; otherwise private routes return `503 pilot_disabled` and no PAP manifest is published |
| `PAP_PUBLIC_ORIGIN` | Exact HTTPS origin, no trailing slash; e.g. `https://gtm.kayroslab.com` |
| `PAP_ALLOWED_CLIENTS` | Comma-separated exact HTTPS client-metadata URLs qualified by the operator; no wildcard trust |
| `PAP_DB_PATH` | Durable SQLite path; production `/data/poppy.sqlite3` |
| `PAP_MEMBERSHIP_AUTH_REALM` | Realm authenticating the read-only Keycloak service account |
| `PAP_MEMBERSHIP_CLIENT_ID` / `PAP_MEMBERSHIP_CLIENT_SECRET` | Dedicated identity-reader credentials; use the deployment secret store, never the repository |
| `KEYCLOAK_INTERNAL_URL` | Existing operator-controlled Keycloak endpoint; agent metadata never chooses it |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_JWKS_URL` | Existing console sign-in; authenticated access token must contain `sid` |

Provision a **separate read-only** Keycloak client. Grant only the permissions required for GET user, online sessions, groups, effective realm roles and organization membership in the relevant realm. Do not reuse the tenant-provisioner secret or grant manage-users/manage-realm. The exact fine-grained permissions must be tested against the deployed Keycloak version. For dedicated tenant realms, explicitly grant the reader access to those realms and confirm that tenant issuer mapping is exact; lack of access fails closed.

The adapter owns the PAP issuer `${PAP_PUBLIC_ORIGIN}/api/poppy/oauth`. Keycloak owns user identity and the originating online session. This is a **new authorization component**, documented in the decision record; the existing Keycloak console client is not claimed to implement the PAP OAuth profile. Logout/session expiry ends agent access earlier than the maximum 30-day consent. Offline/background grants beyond that session are deliberately not implemented.

## Staging qualification before enabling customers

1. Back up tenant and PAP stores consistently. Build and run the checks below. Mount the Nginx configuration so the three well-known paths reach the API. The actual Host must match the configured origin, including its port. Keep the API port private; Nginx terminates HTTPS. Never derive Company identity from `X-Forwarded-Host`.
2. Configure one dedicated test user, workspace, selected sources and test agent. Fetch the agent's public metadata and JWKS through the production network path; verify ownership, algorithms, redirects and successful key rotation. Metadata fetches only accept public IPv4 destinations, HTTPS default port and JSON; IPv6-only agents need a separately reviewed network extension.
3. Verify Keycloak enabled-user, organization, group, role and online-session reads with the least-privilege account. Remove the user from the organization, remove their role, disable the user, revoke the online session and log out in turn. Every subsequent private read/refresh must fail. Simulate Keycloak outage: no cached membership may authorize a read.
4. Enable the environment flag, then **Act → Connected agents** as a current tenant administrator. Enable that workspace and agent. A platform administrator without actual membership cannot consent on someone else's behalf.
5. From the real agent, exercise Direct Sign-In with S256, unchecked consent, denial, issuer/state checking, one-time code exchange, ES256 and PS384 assertions, a signed delegated read, refresh rotation, and narrower scopes. Read all five models with available fixtures and unavailable sources. Record actual agent name/version/access mode and test time; do not infer support from a model API subscription.
6. Run the upstream [Company validator](https://personalagentprotocol.org/kit/company) on HTTPS staging following its current instructions, in a separate Node **22.18+** environment if required by that kit. Pin the upstream commit/version in the evidence. Do not alter the core Node 20 runtime merely to run the validator. This repository's tests do not replace upstream interoperability checks.
7. Prove replay rejection, two simultaneous workspaces, removed properties, administrator suspension, console revoke and refresh-token revoke. Start a read and revoke before it returns: it must not emit the result. Confirm already-transmitted data is outside the reach of revocation.
8. Run the 20-scenario customer corpus below, capture source traces and measure p95 including real identity/metadata overhead. Targets: at least 90% successful reads when sources are available, 100% source traces, 100% revocation rejection and zero cross-workspace disclosure. The proposed local p95 ≤200 ms at 10 requests/s is a qualification target, not a measured result of this change. If unmet, retain the staging gate and optimize without caching authorization decisions.
9. Test restore while disabled, revoke restored authorizations, then verify no previous access or refresh token works. Confirm no credentials, authorization headers, Session JWTs, raw result content or sensitive OAuth query strings reach application, proxy or monitoring logs. Nginx disables access logging for authorization and console callbacks.
10. Activate one customer workspace only after recording all outcomes. No activation, merge, deployment or real-agent success is implied by the presence of source code.

## Endpoints and responses

| Endpoint | Contract |
| --- | --- |
| `/.well-known/poppy.json` | PAP 1.0; only the implemented OpenAPI read channel |
| `/.well-known/oauth-protected-resource` | Exact resource origin and selected issuer |
| `/.well-known/oauth-authorization-server/api/poppy/oauth` | RFC 8414 metadata for the issuer with a path |
| `/api/poppy/openapi.json` | Five models, input/output contract, permissions, headers and errors |
| `/api/poppy/capabilities` | Generic public catalog; no account or session identity |
| `/api/poppy/oauth/authorize`, `/token`, `/revoke` | Authorization code + S256; form-encoded token/revoke with private-key assertions |
| `/api/poppy/read` | POST strict JSON; OAuth Bearer, `Poppy-Version: 1.0`, delegated `Poppy-Session`; no query parameters or tenant override |
| `/api/poppy/console/context`, `/policy`, `/consent`, `/revoke`, `/metrics` | Existing console OIDC token, current membership, same Origin; POST only; mutations use explicit scope/resource input |

Private results include `schemaVersion`, `requestId`, `workspaceId`, and `data` with state, source, read time, actual period, metrics/units, caveats and a fixed-origin console link. `ready`, `empty`, `not-configured`, `choose-source` and `unavailable` retain their existing meanings. Unknown source properties are rejected, not fetched. Missing values are never synthesized into zero.

Errors include a request ID and a stable code: 400 invalid request/version/Session; 401 invalid token with resource metadata challenge; 403 scope/resource denial; 413 oversized input; 429 with Retry-After; 503 identity/service unavailable; 504 read timeout. A Session error never silently switches the account. New delegated keys do not revoke grants. There is no session-state carry-over or CRM identity merging.

## Verification corpus

| Cases | Expected evidence |
| --- | --- |
| 1–5 | Successful workspace/search/analytics/visibility/operations read; each has source, effective period, units, caveats and console link |
| 6–10 | Each model with missing/unavailable inputs; no fabricated data; correct actionable state |
| 11–12 | GSC and GA4 multiple-source selection shows only consented properties |
| 13–14 | Explicit cross-workspace and unconsented-property requests rejected before provider dispatch |
| 15–16 | Revoked grant and removed IdP membership/session rejected, including in-flight read |
| 17–18 | Invalid/replayed delegated proof and wrong token audience rejected |
| 19–20 | French and English consent → read → disconnect, keyboard navigation and narrow viewport |

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run docs:check
pnpm run site:check
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/qa-poppy.mjs
```

`tests/poppy.test.ts` exercises cryptography, exact client metadata validation, OAuth, tenant/resource intersection, live access checks, revocation, replay, rate limits and HTTP body limits. `tests/poppy-ui.test.ts` verifies consent defaults and revocation in both languages; `tests/data-agent.test.ts` verifies the shared read semantics. Browser fixtures verify UI behavior, not a real customer/provider connection.

## Operations, privacy and rollback

SQLite uses synchronous FULL, DELETE journaling, atomic transactions and file mode 0600. Restrict its parent directory and backup access. All same-host replicas must share this exact database; multiple hosts need a shared transactional-store design before rollout. Never use an in-memory SQLite database in production.

Grants remain for 90 days after their maximum expiry for revocation/audit linkage. Access tokens expire in five minutes; codes in 60 seconds; browser requests in ten minutes; refresh records at grant expiry. Session continuity is retained for 30 days after use, replay records only for their verification window, audit events for 90 days. Lazy pruning occurs on incoming requests at most once/minute. An idle disabled service retains its files until an operator runs the same prune method; document that in retention operations. Backups have a separate operator-managed retention policy. Identity data already transmitted to an agent cannot be deleted by this service.

An administrator can POST `{"tenant":"workspace-id"}` to `/api/poppy/console/metrics` through their console session to inspect 30-day event counts by action/model/outcome, mean and maximum durations. Raw read events are correlated by request ID. Monitor failures, 429s, 504s and identity outages without capturing payloads. Active provider calls retain durable concurrency leases after a response timeout; crashed workers' leases expire after five minutes. Capacity is two per workspace, with a 30-second heartbeat while work remains active.

Emergency disable: set `PAP_ENABLED=false`, restart **every** replica and verify no manifest/private read is served. To suspend a workspace or remove an agent, save its policy in the console; that atomically revokes affected grants. Disconnect revokes all grants for the selected user/agent/workspace. OAuth revocation of a current refresh token revokes that grant; an old rotated refresh token is a no-op, so it cannot accidentally cancel a newer grant.

Rollback preserves the PAP database. Restore only while disabled; revoke every restored grant before re-enabling. Reverting application code must never restore an earlier active authorization snapshot. Keep the protocol evidence and deployment commit with the release record.
