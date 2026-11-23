# Trust pack (R10): RGPD, DPA, hosting, security and status

This folder carries the trust deliverables of R10. Each page states what is
true for this platform revision — what exists, what the operator configures,
and what stays an explicit human act. Nothing here is legal advice; the
operator (KayrosLAB) remains the data controller for its own platform data and
its customers sign the DPA as processors/controller-to-controller where
applicable.

- [GDPR.md](GDPR.md) — data map by module, roles, retention, sub-processors.
- [DPA.md](DPA.md) — the data-processing agreement template to sign with customers.
- [HOSTING.md](HOSTING.md) — OVH hosting: zones, volumes, backups, updates.
- [SECURITY.md](SECURITY.md) — the security page content and disclosure policy.
- [STATUS.md](STATUS.md) — the status page policy and component list.
- [MOLLIE-ACTIVATION.md](MOLLIE-ACTIVATION.md) — the Mollie activation and final-quota runbook (operator acts).

The activation of live billing, the TLS/SMTP enablement and the public
publication of the security and status pages are operator acts on the OVH
stack; the software gates stay fail-closed (see `src/billing/config.ts`:
`live` is blocked until legal, tax, price and owner approvals are set).
Partner-data metering into the billing ledger is the remaining R10 code item
and is not claimed as delivered by this increment.
