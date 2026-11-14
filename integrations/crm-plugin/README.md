# Client CRM plugin contract

GTM Growth supports two modes on the same tenant-isolated timeline: a small native contact CRM, or the customer's CRM connected by a server adapter. The native module is not a sales pipeline, email inbox or replacement for a full CRM. The reference client implements the GTM API contract; vendor-specific adapters are not included. No paid CRM dependency is required for native mode.

## Activate

1. Deploy the code through the existing production gate. Keep the existing persistent data volume. `CRM_PATH` defaults to `crm.sqlite3` beside `TENANTS_PATH`; back up this database and its tenant HMAC keys together, with protected access. Do not delete/rotate keys independently.
2. A tenant administrator opens **CRM → Connections and access**, chooses the primary mode and enables collection. Non-admin human users need an explicit CRM reader/editor grant. Editors can create contacts/manual activities; only administrators can link/revoke identities, change access, pause or erase contacts. Global platform-admin and AI/service console sessions are rejected.
3. For a client CRM, install `client.mjs` in its server adapter. Generate a cryptographically random base64url token of at least 32 characters. Store the raw token in the adapter's secret store, and only its SHA-256 hex digest as the key in a protected JSON configuration based on `config.example.json`. Set `CRM_PLUGINS_FILE` to that file on GTM. On the existing OVH Compose stack, place it under `/opt/gtm-growth/.secrets`, set `CRM_PLUGINS_FILE=/secrets/crm-plugins.json` in `deploy/kayroslab-vps/.env.local`, and recreate the GTM service to load the environment change. The secrets mount is already read-only. The all-zero example hash is a placeholder, not a usable credential. Rotate by replacing the configured digest and the adapter secret.
4. Configure one tenant/source ID, permissions, event channels, allowed identity kinds/scopes and HTTPS record hosts per token. Web scopes must also be domains authorised in that tenant. Scope platform IDs by the actual social account/application; scope commerce IDs by the existing GTM store ID. Multiple tokens for one source share its quota and event namespace. Configuration is read on requests; removing a token revokes it.
5. Run synthetic tests, then implement each real source's authorisation/consent checks. The reference client never reads cookies, fingerprints visitors or creates tracking IDs. Do not expose bearer tokens or accept arbitrary browser-supplied CRM IDs. GA4/Postiz aggregate metrics cannot identify a contact.

## API

All operations use `POST /api/integrations/crm/{operation}` with `Authorization: Bearer …` and JSON. No tenant ID is accepted from the request body: the token determines the tenant. Batches are atomic, at most 100 events and 256 kB. Default quota: 300 requests/hour per tenant/source. Responses are `Cache-Control: no-store`. Retry with the same operation key/event IDs; respect quota errors. The client does not automatically retry or silently drop rejected events.

| Operation | Permission | Request | Result |
| --- | --- | --- | --- |
| `contacts` | `contacts:write` | `{key, externalId, contact:{label, externalUrl?}}` | Native `profileId`, upserted by exact source-scoped external ID |
| `identify` | `identities:write` | `{key, externalId, identity:{kind,scope,value}, proof:{reference,url?,validFrom?,validUntil?}}` | `bindingId`; a conflicting contact returns 409 |
| `events` | `events:write` | `{authorization, events:[…]}` | Per-event `accepted`, ID and duplicate state; paused/erased identifiers return `accepted:false` |
| `timeline` | `timeline:read` | `{externalId, channel?, from?, to?, cursor?}` | Only that exact source CRM contact's events, with a stable `nextCursor` |

Operation keys are 8–120 URL-safe characters. Identifiers are opaque IDs (letters, digits, `_ : . / -`), not email/phone/name matching. Raw identity inputs are HMAC indexed; returned timeline records omit the identity key. Labels, notes, proof references and explicitly supplied record URLs are retained as contact content, so keep them minimal. URL query strings/fragments are stripped. Record URLs must belong to configured hosts; URLs are not fetched by this API.

`authorization` is a source-declared processing reference persisted on plugin events, not an independent consent verification by GTM. Identity proofs are labelled **source assertion** or **human declaration**. A web session needs an explicit interval of no more than 24 hours; events outside it remain unlinked. A durable web account ID requires the adapter's authenticated server association. Shopify's customer relationship is a store record association, not proof of a logged-in web session.

An event contains `eventId`, `channel`, `type`, ISO-8601 `occurredAt` with timezone, `summary`, `proof:{reference,url?}`, optional `identity`, `sourceUrl`, `timeBasis` (`source` or `observed`), and bounded `details`. Supported types:

| Channel | Types | Useful details |
| --- | --- | --- |
| `web` | `page_view`, `form_submitted`, `login` | `pageUrl`, `productUrl`, `campaignId` |
| `social` | `social_click`, `social_comment`, `social_message` | `socialPostId`, `campaignId`, source record URL |
| `manual` | `call`, `meeting`, `note`, `crm_update` | `note` |
| `shopify`, `prestashop` | `order_created`, `order_status` | `orderNumber`, `orderStatus`, `amount`, `currency` |

Use platform-authorised API data for social interactions; a tracked first-party link is only a click observation. It does not prove a social impression. Unknown identities remain in the unlinked queue. Administrators can associate a reviewed event identifier, or a single event when it has no identity. There is no fuzzy matching or automatic contact merge.

Events are immutable within `(tenant, source, eventId)`. Identical replay is a duplicate; a changed payload or authorisation reference returns 409. To correct, send a new event ID with `supersedes` pointing to the prior **source event ID** and the same identity. Both records remain visible. Current contact links determine the timeline; revocation immediately removes the association. Replacing a binding proof or time interval requires revoking the old binding first; a different proof on the same bound identity is a conflict.

Errors contain a bounded code, not the submitted payload. Common codes: `CRM_ACCESS`, `CRM_DISABLED`, `CRM_SOURCE_SCOPE`, `CRM_PLUGIN_PERMISSION`, `CRM_IDENTITY_CONFLICT`, `CRM_EVENT_CONFLICT`, `CRM_COLLECTION_BLOCKED`, `CRM_RATE_LIMIT`, `CRM_CAPACITY`. Limit: 10,000 contacts and 100,000 events per tenant. Export returns the complete selected contact's linked timeline as JSON.

## Existing Shopify / PrestaShop connectors

Use **E-commerce** to connect and synchronise stores. Both signed webhooks and order backfill now apply the same store-scoped customer pseudonymisation, canonical order keys and per-store cursors. A durable outbox projects committed order snapshots when the enabled CRM timeline is opened (250 snapshots per read); no provider request is made by the timeline itself. Opening the console does not create an always-on background sync service.

**Import received orders** seeds at most the latest 100 orders from each of the first 20 connected stores. It is a bounded recovery/import action, not a full historical-store import. Older raw customer references are skipped and need a normal E-commerce resync. Previously pseudonymised legacy customer references may remain unlinked until resync or explicit reviewed linkage. A backfill can only recover the current snapshot the provider returns; it cannot recreate missing historical status transitions.

A source timestamp without timezone (for example an unconfigured PrestaShop date) is displayed using the observation timestamp with an explicit label. Missing currency stays unknown. Order-created and status observations are separate events, not additive revenue. The console never adds currencies or lifecycle snapshots into a customer revenue total. PrestaShop admin URLs are not guessed.

Pause blocks new events for currently linked identifiers. Erasure removes the contact, its current bindings and their events, retains opaque blocked identity keys to reject routine re-import, and records a minimal audit receipt. Events detached by an earlier revocation remain unlinked and are outside that contact's erasure scope. These controls do not erase the source CRM, commerce store, backups or unrelated datasets. Source retention/deletion policies remain operator responsibilities.

## Example

```js
import {createCrmPlugin} from './client.mjs';
const crm = createCrmPlugin({baseUrl: process.env.GTM_URL, token: process.env.GTM_CRM_TOKEN});
await crm.upsertContact({key: 'contact-001-v1', externalId: 'customer-001', contact: {label: 'Contact 001'}});
await crm.identify({key: 'identity-001-v1', externalId: 'customer-001',
  identity: {kind:'web_user', scope:'example.com', value:'account-001'},
  proof: {reference:'Reviewed authenticated account mapping in CRM'}});
const page = await crm.timeline({externalId:'customer-001'});
// Use page.nextCursor to request the next page for this same externalId.
```

`example.mjs` exports an explicit synthetic integration exercise; importing it sends nothing. Adapt the authorised tenant domain and source configuration before using it. Keep the same keys when retrying logical operations. Do not claim a vendor CRM connection is operational until contact upsert, identity assertion, event ingestion and tenant-scoped readback have all been verified against that source.
