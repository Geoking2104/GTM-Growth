# Status page policy (R10)

The public status page is an operator act to publish at
{{status origin}}; the policy below is the reference content.

**Components.** Console and public pages; PAP pilot endpoints; report-access
(report invitations and follow-ups); billing (Mollie checkout when activated);
durable visibility jobs (PostgreSQL + Redis, only when
`VISIBILITY_JOBS_ENABLED=true`).

**Incidents.** An incident is posted when a component is degraded for more
than one operational hour or when data integrity is suspected (priority:
integrity over availability). Post-incident reviews are published with the
root cause, duration, and the checks now in place; no customer data is ever
included in a post.

**Uptime claims.** The platform publishes measured availability only; no
aspirational SLA. Timings and acceptance targets from the pilot assessment
(PAP-SPECIFICATION §14) are labelled as targets, not results.

**Custom checks wiring (operator act).** The CI jobs already exercise the
recovery paths on every build (PostgreSQL/Redis recovery, Keycloak dashboard,
Node-RED and ZenML smokes); publishing their latest status to the page is a
deployment configuration choice, not a code claim of this repository.
