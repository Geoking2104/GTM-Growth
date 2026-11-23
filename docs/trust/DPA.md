# Data-processing agreement template (R10)

This template is the DPA KayrosLAB signs with each customer of GTM Growth.
Placeholders in `{{brackets}}` are filled per customer. It follows the EU
standard clauses logic (Art. 28 GDPR): filled, signed and archived with the
customer's contract copy.

**Between** KayrosLAB (processor), and **{{customer legal name}}** (controller).

## 1. Purpose

The processor hosts and operates the GTM Growth platform (GEO/AEO measurement,
console, reporting) for the controller, per the subscribed plan.

## 2. Categories of data

Workspace configuration, marketing content, measurement panels (search, AI
answers, SERP, GBP, backlinks), report recipient addresses (sealed), commerce
data synchronized from the controller's store platforms, and the controller's
tenant credentials (Keycloak realm). No payment card data is processed by the
processor; Mollie collects payments.

## 3. Roles

The controller remains the controller of its end-customers' data and of its
marketing content. The processor acts on documented instructions (the console
and its configuration) only.

## 4. Sub-processors

The current list (OVH SAS, Mollie B.V., the operator's market-data partner,
Google and the AI providers the controller connects with its own credentials)
is published in [GDPR.md](GDPR.md). The controller is notified of any change
at least 30 days in advance.

## 5. Security measures

Hosting in France (OVH), TLS everywhere, sealed report addresses, per-tenant
data isolation, fail-closed write gates with human confirmation (see
[SECURITY.md](SECURITY.md)), audit trails (PAP audit, action ledger), access
restricted to named operators with per-tenant credentials.

## 6. Transfers

No transfer outside the EU is performed by the processor. Sub-processors
listed above operate under their EU terms; any change of hosting region
requires an amendment.

## 7. Incidents

Confirmed incidents affecting the controller's data are notified within 72
hours of confirmation, with scope, measures and follow-up.

## 8. Retention and deletion

Per [GDPR.md](GDPR.md); on termination the controller's per-tenant stores are
deleted as an explicit act, accounting records retained per legal obligation.

## 9. Audits

The controller may request the platform's audit extracts (PAP audit, action
ledger, billing webhook history) for its own tenants. On-site audits require
the standard notice period of the hosting provider.

**Signature** — KayrosLAB: {{name, date}}; {{customer}}: {{name, date}}.
