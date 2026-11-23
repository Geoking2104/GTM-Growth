# GDPR posture (R10)

Scope: GTM Growth as operated by KayrosLAB on its OVH stack. KayrosLAB is the
processor (sous-traitant) for its customers' workspace data; each customer
remains the controller of its own end-customers' data (commerce orders, CRM,
report recipients).

## Data map by module

| Module | Data | Where | Retention | Notes |
| --- | --- | --- | --- | --- |
| Tenants/members | Tenant records, member roles | `data/tenants.json` (OVH volume) | Life of the contract + legally required archiving | Identity handled by the tenant's Keycloak realm or the platform realm |
| AI visibility | Imported/collected panels: prompts, answers, citations, declared brands | Per-tenant SQLite (`data/ai-visibility/*`) | Life of the panel; deletion available per panel | Never resold, never shared across tenants |
| PAP | Grants, consent records, audit trail | `data/poppy.sqlite3` | Audit 90 days (per PAP spec); grants purged on revocation | No raw PII: an agent gets opaque user references |
| Actions (R11) | Operation ledger + `action_events` audit | `data/actions.sqlite3` | Audit capped 200 events per operation; operations until terminal state + archiving | No content data stored beyond the exact terms |
| Report access | Sealed recipient addresses, single-use email codes | Per-tenant store | Sealed (encrypted) until the scheduled dispatch, then proof of dispatch | Removal honoured on request |
| Market data (R4/R5) | Cached keyword/SERP/GBP/backlink answers | In-memory / response only | Nothing durable is stored by the console routes | Operator pays partner costs; no tenant card is billed |
| Billing | Customer record, mandate id, invoices, webhook events | `data/billing.sqlite3` | Legally required accounting retention | Mollie is the payment processor; no card data ever touches the platform |
| Logs | Nginx access logs on OVH | VPS | Rotated (see HOSTING.md) | The AI-crawler analytics (R6) parse tenant-supplied log extracts transiently |

## Sub-processors

| Sub-processor | Role | Location |
| --- | --- | --- |
| OVH SAS | Hosting, volumes, backups (see HOSTING.md) | France (EU) |
| Mollie B.V. | Payment collection (when billing is activated) | Netherlands (EU) |
| DataForSEO-compatible partner bridge | Market data (keywords, SERP, GBP, backlinks), billed to the operator | Per operator contract |
| Google (OAuth/GA4/GSC/GTM APIs) and selected AI API providers | Data collection initiated by the tenant with its own credentials | Per provider terms |

DPA: see [DPA.md](DPA.md). Exports and deletion: per-module exports exist
(CSV/PDF/JSON where documented); end-to-end deletion of a tenant drops its
SQLite stores and TenantStore entry — the operator runs it as an explicit act.

This page is a posture statement for the customer documentation, not legal
advice; the signed DPA prevails.
