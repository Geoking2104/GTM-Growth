# Cloud subscriptions — implementation and release checklist

This document describes the proposed backend integration, not an authorized live payment service. The French [owner requirements and detailed T01–T20 / G1–G8 runbook](MOLLIE-SUBSCRIPTIONS-GO-LIVE.md) remains the operational acceptance criteria.

## Scope

| Product | Pilot monthly amount | Sales status |
|---|---:|---|
| Self-hosted GTM Growth (Apache-2.0) | Free | Never paywall the open-source engine |
| Cloud Solo | €39 | Hypothesis; tax treatment, quotas and CGV not approved |
| Cloud Agence | €149 | Hypothesis; tax treatment, quotas and CGV not approved |

The commercial model charges only for the operator-managed Cloud service. BYOK third-party AI/API costs are excluded. The same Mollie merchant **organization** used for openDPE may be reused only after confirming the legal entity, but **a new GTM website profile and separate GTM test/live keys are mandatory**. Do not copy openDPE credentials, customer records or webhook endpoints.

## What this branch includes

- `src/billing/config.ts`: immutable server-side plan catalogue, month prices, origin and URL validation, explicit tax/price/terms/live approvals.
- `src/billing/migrations.ts` and `store.ts`: isolated SQLite, numbered migrations, billing accounts per Keycloak tenant+Mollie mode, attempts, subscriptions, payments, audit events and usage ledger. Database file has restrictive creation permissions; its storage location must be persisted and backed up by ops.
- `src/billing/mollie.ts`: Mollie Payments/Customers/Subscriptions v2 adapter using server-side bearer credentials, idempotency headers and bounded HTTP timeouts.
- `src/billing/service.ts`: tenant-admin checkout with verified email, hosted first-payment flow (`sequenceType: first`), consent version, next-month recurring subscription after a valid/pending mandate, webhook validation via fresh Mollie GET, deferred plan updates, cancellations, reconciliation, seven-day billing grace information.
- `src/billing/api.ts`: protected `/status`, `/checkout`, `/change-plan`, `/cancel`; public URL-encoded webhook; internal token-protected reconciliation. All billing mutations derive the tenant from the validated Keycloak token (never from an untrusted client-supplied tenant ID).
- `site/console/billing.js`: authenticated plan/status view, explicit recurring-charge consent and cancellation; bilingual labels; no checkout when disabled.
- `tests/billing.test.ts`: offline-only gateway simulations for first charges, recurring charges, replay, failures, tampering, role/tenant boundaries and API route behavior.

The backend is intentionally **not coupled to the internal Keycloak DB**. It does not grant paid entitlements to unsupported features or restrict existing open-source functionality. Legal invoice generation, actual tax calculation, tenant quotas and compliant terms are separate prerequisites, not functionality claimed here.

## Endpoints

| Method | Path | Access / behavior |
|---|---|---|
| GET | `/api/billing/plans` | Public; pricing hypotheses and availability, even if disabled |
| GET | `/api/billing/status` | Verified Keycloak bearer + selected active tenant |
| POST | `/api/billing/checkout` | Tenant admin; `{planKey, acceptedRecurring:true, termsVersion}`; price never accepted from browser |
| POST | `/api/billing/mollie/webhook` | Public, URL-encoded `id=tr_...`; backend retrieves payment from Mollie and correlates account, profile, mode and amount |
| POST | `/api/billing/cancel` | Tenant admin; `{confirm:"CANCEL_SUBSCRIPTION"}`; calls Mollie cancellation and preserves paid-through period |
| POST | `/api/billing/change-plan` | Tenant admin; `{planKey}`; next renewal, no immediate proration |
| POST | `/api/billing/reconcile` | Separate operator bearer token only; never issue to browser |

`/api/billing/status` is the source of truth; the browser's Mollie redirect does not unlock access. Renewals may arrive with an unfamiliar payment ID; correlate by the verified Mollie subscription ID. On timeout or uncertainty, reconcile, never blindly initiate a new charge beyond the remote idempotency window.

## Safe initial environment

The complete names-only example is in [`deploy/kayroslab-vps/.env.production.example`](../../deploy/kayroslab-vps/.env.production.example):

```dotenv
BILLING_MODE=disabled
BILLING_CHECKOUT_ENABLED=false
BILLING_PRICES_APPROVED=false
BILLING_RECONCILE_ENABLED=false
MOLLIE_GTM_WEBHOOK_URL=https://gtm.kayroslab.com/api/billing/mollie/webhook
MOLLIE_GTM_RETURN_URL=https://gtm.kayroslab.com/console/?checkout=return
```

For an **explicitly authorized sandbox test** only: set `BILLING_MODE=test`, inject a new GTM Mollie `test_...` key and matching `pfl_...` profile ID using the secret store, publish/review terms, set `BILLING_TERMS_VERSION`, then enable `BILLING_CHECKOUT_ENABLED=true` when ready for manual test payments. Use *test* payment methods. Ensure Nginx forwards the public `/api/billing/mollie/webhook` route to GTM's Node app without Keycloak interactive login. Only the first payment creates a recurring mandate; the recurring subscription is scheduled for the subsequent month, not charged twice on setup.

`BILLING_MODE=live` fails to initialize unless a live key/profile, `BILLING_LIVE_APPROVED=true`, `BILLING_PRICES_APPROVED=true`, an approved `BILLING_PRICE_INCLUDES_TAX` value, explicitly configured final cent amounts for both plans, and a legal `BILLING_TERMS_VERSION` are set. **Configuration gates do not replace human approval or a formal production change process.**

Optional: `BILLING_GRACE_DAYS=7`; `BILLING_DATA_PATH` on durable backed-up storage; `BILLING_RECONCILE_ENABLED=true` only after supplying a distinct `BILLING_RECONCILE_TOKEN` and installing monitoring. Configure a scheduler to POST to `/api/billing/reconcile`, or enable the application daily timer, and alert on `errors>0`. Never print secrets, card details or full customer metadata.

## Validation

```bash
npm ci
npm run typecheck
npm run lint
npx vitest run tests/billing.test.ts
npm test
npm run build
node scripts/check-site.mjs
```

Mocked tests cannot establish that the merchant profile, mandate lifecycle, live tax calculations, recurring methods, Nginx ingress or a bank settlement works. Run the documented T01–T20 acceptance matrix against the actual GTM *test* profile after approval. Verify unrelated openDPE and KayrosLab services before and after any shared-VPS operation.

## Release gates (currently outstanding)

1. **G1** — Confirm merchant/legal entity, approve dedicated GTM Mollie website profile.
2. **G2** — Finalize VAT/HT/TTC treatment and exact *chargeable* Solo and Agence prices.
3. **G3** — Approve versioned entitlements, quotas, and fair usage per plan before public price publication or entitlement enforcement.
4. **G4–G5** — Finish real sandbox tests, monitor webhook/reconciliation, tenant isolation, backups and restoration.
5. **G6** — Publish legal CGV/subscription terms, privacy policy, invoicing/receipts, right-to-cancel conditions and support contacts. Frontend currently references `/fr/conditions-abonnement.html` and `/subscription-terms.html`, intentionally **not** fabricated or published before legal review.
6. **G7** — Pass CI, sandbox acceptance T01–T20 and shared-VPS non-regression, then obtain a specific deployment window.
7. **G8** — Obtain explicit owner authorization to merge/deploy, and *separate* explicit authorization for any live debit.

**Rollback:** Set `BILLING_CHECKOUT_ENABLED=false` immediately to block *new* checkouts. Keep the webhook, reconciliation and ledger operating for charges already in progress. Do not bulk-cancel existing subscriptions or automatically refund customers because of a software rollback. Audit and resolve each case individually.
