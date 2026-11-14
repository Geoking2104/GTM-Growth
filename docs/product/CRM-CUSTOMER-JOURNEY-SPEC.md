# CRM and deterministic customer timeline

Implementation specification for the user’s request on 15 November 2026 (Asia/Shanghai). Two supported modes: a lightweight CRM inside GTM Growth, or a client CRM connected through a server-side plugin. Both use the same tenant-scoped identity and timeline engine. This is an observed contact journey, separate from the existing editorial awareness-stage planner.

## User journey

1. Enable the native CRM, or select external CRM mode and configure an authorised plugin. Assign explicit CRM reader/editor roles; tenant administrators manage identities and access.
2. Create an internal contact or import the exact external CRM record ID through the plugin. A pseudonymous label is sufficient; no email, phone or name is required for matching.
3. Link exact web account/session, platform user or store customer identifiers with a recorded proof. A source token is restricted to one client, allowed identifier namespaces/scopes and operations. Two existing contacts are never merged automatically.
4. Read a chronological, clickable timeline covering web, social, manual, Shopify and PrestaShop. Filter channels/dates, inspect each event, its timestamp basis, origin and identity proof, and open its source record when available.
5. Review unlinked events explicitly. An administrator can bind the exact identifier on an event after checking the source record; a campaign, IP, referrer, name or aggregate metric is never an identity proof. Revoke a wrong link and the timeline is recomputed.
6. Add an explicitly declared call, meeting, note or other manual contact. Export the selected contact's scope, pause collection, or erase it and prevent routine re-import from resurrecting known identifiers.

## Identity contract

- Tenant boundary is the existing Keycloak/client selection. Global platform admins and shared MCP credentials do not bypass client CRM access. Non-admin users require an explicit CRM role; source plugins cannot access other tenants.
- Identifiers are scoped by kind and source/account/store. The same numeric customer ID in two stores is two different identities. Shopify GraphQL and REST customer IDs normalise to the same store-specific reference.
- Identity lookup uses a tenant-specific HMAC key stored only in the protected server database. Raw identifier inputs are not retained in identity records, events, receipts or audit entries. The index is pseudonymous, not anonymous; backup keys with the database.
- Stable authenticated account IDs and explicit CRM IDs may have durable links. A web session link requires a bounded source-declared interval (maximum 24 hours). Device fingerprints, IP matching, cross-client hashes, email similarity and inferred social identities are excluded.
- Conflicting bindings return an actionable conflict; no last-write-wins identity merge. Link and unlink operations are audited with actor, proof/source references and time; revocation records the supplied reason. Source assertions and human declarations are labelled separately from observed commerce records.
- A CRM contact ID or campaign UTM in a URL is not automatically trusted. Server plugins must derive authenticated account IDs and approved CRM associations on their own server, not trust arbitrary browser-supplied contact IDs.

## Event contract and UI

Each event has a source-scoped immutable event ID, one identity key or no identity, channel, type, source timestamp (or explicit observation time), received time, short summary, source/proof reference and bounded structured details. Repeating identical events is idempotent; changing content under an existing event ID is a conflict. Corrections use a new event with an explicit superseded-event reference. Timeline detail shows provenance and any correction; no fabricated historical step is inserted.

Supported channels: web, social, manual, Shopify, PrestaShop. A social click can be a first-party tracked click with a source assertion; it is not proof that an identified person viewed a social post. Aggregate Postiz impressions/likes and GA4 aggregate reports never become individual touchpoints. Supported platform interaction events require a platform-scoped user ID supplied by an authorised plugin or a source-labelled manual record.

The timeline shows events, not a causal attribution model or a complete browsing history. Missing identities, missing touchpoints and unsupported timestamps remain explicit. Order amounts keep their original currency; currencies and lifecycle snapshots are not added into a misleading revenue total.

Source links are HTTPS, carry no userinfo, and are displayed as external links with safe browser attributes. Web page query strings/fragments are removed before storage; no access tokens or full referrer strings are collected. The UI renders data as text. There is no hidden tracker on the public GTM website.

## Architecture and existing-stack integration

- Node 20 / TypeScript / Express, existing Keycloak and tenant registry, SQLite. No second CRM server or database platform is required for native mode.
- New CRM console APIs and protected SQLite tables for settings/roles, contacts, identity bindings, immutable events, blocked identifiers, idempotency receipts and audit.
- Server-side plugin API supports contact upsert, explicit identity assertions, event batches and scoped timeline reads. Credentials are operator-configured token hashes; browser code never receives a plugin token. The reference Node client is reusable by a customer's CRM adapter. This is a plugin contract, not a claim that every named commercial CRM already has a vendor-specific connector.
- Shopify/PrestaShop retain their existing connectors. Webhook and backfill orders share boundary normalisation and store-specific pseudonymisation. A durable commerce outbox bridges committed snapshots to CRM with idempotent replay. Reads can drain a bounded outbox after CRM is enabled; no new external service call is made merely by opening a timeline.
- Existing commerce code must be corrected where needed: store-scoped order IDs, store-scoped cursors, consistent Shopify GraphQL/REST customer references, pseudonymisation on backfill as well as webhook, raw-body webhook verification before Express JSON parsing, and source-update timestamps for out-of-order snapshots.
- Existing Social campaigns and provider publication URLs can provide context, but they never supply the identity of their audience. A source URL opens the supplied provider record; the CRM does not claim to have independently verified a platform interaction.
- Plugin implementation examples use synthetic contacts/events. Live client CRM credentials, commerce permissions and first-party instrumentation are separate activation prerequisites.

## Retention and collection controls

The client must explicitly enable CRM collection. Each plugin event carries a processing authorisation reference. Session collection belongs behind the client's consent/authorisation mechanism; the reference client does not read cookies, fingerprint a browser or create tracking IDs. Pausing a contact stops new matched events. Erasure removes the contact, bindings and associated events, retains only opaque blocked keys and a non-content audit receipt, and blocks routine source replay. Erasure from the source CRM/store is a separate source-system operation; GTM must not claim it performed that operation.

## Acceptance criteria

- A single contact can display sourced web → social → manual → Shopify → PrestaShop events after exact, explicit identity links.
- No cross-client/store joins; anonymous or aggregate signals never infer a contact; conflicts and revoked/session-expired links behave correctly.
- Webhook/backfill normalisation yields the same customer identity. Duplicate/reordered deliveries cannot duplicate an order or overwrite a newer snapshot. A crash between commerce commit and CRM delivery is recoverable without event duplication.
- Source-scoped token permissions, explicit CRM roles, collection pause/erasure, input bounds, safe URLs, idempotency conflicts and no raw identifier persistence are tested.
- FR/EN desktop/mobile browser QA covers contact selection, channel filters, chronological order, clickable event details, source links, unlinked-state handling and timezone display using labelled synthetic data.
- README and website explain both CRM modes, deterministic boundaries, source prerequisites and actual deployment status. Core source publication follows the existing CI/OVH environment gate; no live CRM connection is claimed without a verified configured source.

Primary contracts checked: [Shopify Order](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order), [Shopify Customer](https://shopify.dev/docs/api/admin-graphql/latest/objects/Customer), [PrestaShop Orders](https://devdocs.prestashop-project.org/9/webservice/resources/orders/). Current connector access limitations remain in force; unavailable protected customer data produces unlinked records rather than a guessed identity.
