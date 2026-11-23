# Mollie activation and final quotas (R10, operator runbook)

The billing stack is delivered fail-closed: nothing is charged until the
operator explicitly completes every gate below. The code enforces the gates
(`src/billing/config.ts`); this runbook is the operator's checklist.

1. **Test mode.** Set `BILLING_MODE=test`, `MOLLIE_GTM_API_KEY=test_...`,
   `MOLLIE_GTM_PROFILE_ID=pfl_...`; verify checkout, webhook and
   reconciliation in the UX checks (CI job "Mollie · Offline subscription UX").
2. **Final quotas.** Publish `BILLING_LIMITS_JSON` with the pilot quotas —
   `{version, solo, agency}` each `{monthlyOperations, maxDomains}` — and enroll
   the cloud tenants via `BILLING_CLOUD_TENANTS`. Domain and monthly-operation
   limits then apply per plan; quota-free calls stay the documented free
   surfaces (e.g. `/market/status`).
3. **Legal and tax artifacts.** Host the terms at the configured HTTPS URLs,
   set `BILLING_TERMS_VERSION`, `BILLING_PRICE_INCLUDES_TAX=true` with the
   decided amounts (`BILLING_SOLO_AMOUNT_CENTS`, `BILLING_AGENCY_AMOUNT_CENTS`,
   defaults: Solo 39,00€, Agence 149,00€ monthly pilot prices).
4. **Live mode.** Set `BILLING_PRICES_APPROVED=true`, `BILLING_LIVE_APPROVED=true`,
   `BILLING_RECONCILE_ENABLED=true` with a `BILLING_RECONCILE_TOKEN`, then
   switch `BILLING_MODE=live` with the `live_` Mollie key. Any missing gate
   throws at startup: live billing cannot start half-approved.
5. **Partner costs.** Market-data calls carry `costUsd` on every partner
   answer (R4/R5, provenance `partner-api`); the operator pays them. Since the
   R10 second increment they are metered: each successful partner call records
   its partner-reported cost into the billing usage ledger (`billing_usage`
   metric `partner-data-usd-micros`, integer micro-USD accumulated per UTC
   month) for cloud-enrolled tenants with a billing account. Measurement only:
   nothing is invoiced to tenants from it, and the pricing decision stays a
   human one. A non-enrolled tenant, a missing account or an invalid cost is
   never metered, and a metering failure never breaks a partner answer.

Cards are collected by Mollie only; the platform stores mandate ids and
webhook events, never card data.
