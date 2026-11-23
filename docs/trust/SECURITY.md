# Security page (R10)

Content for the public security page of the platform.

**Posture.** Fail-closed by design: every external write keeps a module-level
human confirmation (GTM, GBP, CRM, robots, WordPress); agent operations can
only propose governed catalog operations (R11). Consent is per workspace,
revocable, and re-checked on every read (PAP). Payments never touch the
platform (Mollie). Tenant data is isolated per module store. Sealed report
addresses, per-tenant credentials, audit trails on every governed action.

**Deployment.** Hosted in France (OVH), TLS everywhere, per the
[hosting page](HOSTING.md). The repository builds in CI with typecheck, lint,
full tests, build and smoke jobs; releases are cut only from green builds.

**Responsible disclosure.** Report a suspected vulnerability to
{{security email}} (PGP optional). Please include reproduction steps and
affected components; we commit to acknowledging reports within {{N}} business
days and to coordinating public disclosure after a fix ships.

**Scope.** In scope: the platform code (this repository), its console and
public pages as operated by KayrosLAB, and the PAP pilot endpoints. Out of
scope: the customer's own store platforms, Google accounts, or third-party
agents unless connected through the PAP pilot.

All security gates claims above are enforced in code: `src/console/*`
(adminOnly flags and `TenantAccessError`), `src/poppy/*` (consent, DPoP
sessions, rate limits), `src/actions/*` (catalog governance),
`src/billing/config.ts` (fail-closed activation).
