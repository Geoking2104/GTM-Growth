# PAP authorization decision — 2026-11-15

Status: implementation decision for a disabled staging pilot; production qualification pending.

The existing console verifier accepts Keycloak console tokens. It does not implement PAP CIMD, PS384 client assertions, PAP refresh grants, consent resource bounds or synchronous revocation. Reusing it as resource authorization would incorrectly grant console privileges to an agent. No deployed Keycloak configuration or live agent interoperability has been verified in this change.

Use a bounded OAuth adapter in the existing Node service, with Keycloak remaining the user identity authority. Its issuer is the configured public origin followed by `/api/poppy/oauth`. The adapter owns and publishes its real endpoints; it does not invent endpoints for Keycloak. This is one GTM Growth Company, never a shared issuer for independent merchants. The first release supports Direct Sign-In, opaque bearer tokens, PKCE S256, CIMD and ES256/PS384 private_key_jwt. Browser Join, DPoP, Device/Mediated Sign-In, conversations, Operations and writes are not advertised.

Before consent, token issuance and every read, a dedicated read-only Keycloak service account checks the enabled user, current organization/group or realm role and the originating online Keycloak session. Check again before emitting a read. Missing membership or a revoked/expired Keycloak session invalidates the grant; an unavailable identity service fails closed. Consequently authorization lasts **at most** 30 days and ends sooner on Keycloak logout/session expiry. This deliberately avoids a second independent identity lifecycle and must be explained at consent. No offline Keycloak tokens are retained.

Each consent covers one workspace, selected scopes and selected resources. SQLite owns authorization codes, hashed tokens, grants, replay markers, session continuity, rate limits and audit events. Atomic transactions prevent code/refresh reuse and ensure revocation survives restart. Existing domain services provide five aggregate reads; neither arbitrary tools nor CRM identity linking is exposed.

Maintenance owner: GTM Growth maintainers. Cost: maintaining a security-sensitive OAuth profile, key validation, migration tests and quarterly dependency/protocol review. No new service or model subscription is required. The deployment gate is mandatory: provision least-privilege Keycloak access, test session removal and organization removal on the deployed version, run the upstream Company validator and an actual external agent flow on HTTPS staging, verify backup/restore and revocation. Local tests establish implementation behavior, not provider compatibility or production acceptance.

Rollback: disable `PAP_ENABLED` and restart all replicas; preserve the PAP database and revocation records. Restore a consistent backup only while disabled, revoke restored grants before re-enabling, and never restore an older authorization snapshot into an active service. All replicas must share the same local SQLite volume; multiple hosts require a transactional shared-store migration first.

References: [PAP 1.0](https://personalagentprotocol.org/docs/1.0/spec), [Company kit](https://personalagentprotocol.org/kit/company), [Keycloak Admin REST](https://www.keycloak.org/docs-api/latest/rest-api/), [specification](../PAP-SPECIFICATION.md).
