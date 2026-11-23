# Partner market-data bridge (R4/R5)

This document covers the operator-owned market-data bridge: keyword search
volumes, Google SERP positions, GBP local rank grids and backlink intelligence
(overview, competitor link gap, disavow export) from an external partner API.
Google.fr ships first; every other locale is delivered behind the same operator
flag. The platform itself stays free: the operator owns the partner account,
the API keys and every data cost. Nothing is billed to tenants, and no figure
is ever invented when the bridge is off.

## Activation

The bridge is **fail-closed**: every route degrades with an explicit French
error until the operator provides a complete configuration. Presence of
credentials alone never activates it.

| Variable | Role |
| --- | --- |
| `MARKET_DATA_ENABLED` | Must be exactly `true` to activate the bridge |
| `MARKET_DATA_API_URL` | Base URL of the partner bridge (HTTPS, normalised without a trailing slash) |
| `MARKET_DATA_API_LOGIN` | Partner login (Basic auth) |
| `MARKET_DATA_API_PASSWORD` | Partner password (Basic auth) |
| `MARKET_DATA_LOCALES` | Comma-separated uppercase two-letter country codes, default `FR`; duplicates and invalid entries are dropped, `FR` included when the list is empty |

A missing login, password or malformed base URL makes the whole configuration
invalid: the console status route keeps answering, every partner call refuses.

## Console routes

Routes live in [src/console/market.ts](../../src/console/market.ts) and mount
with the console API. The partner-facing calls are **tenant-admin only**,
following the `/rank/check` precedent: partner calls cost real money, so they
are gated on tenant administration and consume the tenant's request quota like
other metered reads. `/market/status` is available to all console members and
is a retained (quota-free) route: it reports `enabled`, the operator's locale
allowlist, the provider name and the grid depth.

| Route | Contract |
| --- | --- |
| `GET /market/status` | Enabled flag, locales, provider, provenance, local grid depth, cost note |
| `POST /market/volumes` | `{ keywords[≤20, ≤200 chars], locale?, device? }` → partner volumes, `null` when unknown, never zero |
| `POST /market/serp` | `{ keyword, locale?, device?, depth 1..100 (default 20) }` → organic rows with a URL, AI Overview citation subset |
| `POST /market/local-grid` | `{ keyword, latitude, longitude, columns, rows, distanceKm, device? (default mobile) }` → grid points with found/not-found ranks |
| `POST /market/backlinks/overview` | `{ domain, referrersLimit? (1..50, default 20), locale? }` → backlink profile (backlinks, referring domains) plus the top referring domains; admin-only partner call |
| `POST /market/backlinks/gap` | `{ domain, competitors[1..5], locale? }` → compared profiles plus the gap domains that cite a named competitor without citing the tenant domain; admin-only partner call |
| `POST /market/backlinks/disavow` | `{ domains[≤200] }` → a Google disavow text file from the tenant selection; admin-only, **no partner call**, works with the bridge off |

Rows without a URL are dropped from SERP results; ranks beyond
`LOCAL_GRID_DEPTH` (20) are reported as `not-found` with a `null` rank, never
as a high number and never as zero.

## Local grid geometry

`gridPoints()` in [src/market/provider.ts](../../src/market/provider.ts)
builds a bounded row-by-row grid around the requested centre: at most 7×7
points, a minimum usable distance, valid latitude/longitude. The
longitude step is divided by `cos(latitude)` so the grid stays physically
square at Paris latitudes and the point order matches the partner request and
answer order (`r0c0`, `r0c1`, …; response ids `p0`, `p1`, …).

## Partner contract

The bridge expects a DataForSEO-compatible HTTPS API answering `POST
{base}/volumes`, `POST {base}/serp` and `POST {base}/local-grid` with JSON
bodies and Basic auth. Requests carry the tenant-supplied bounds (`keywords`,
`keyword`, `locale`, `device`, `depth`, `grid`); answers may carry `observedAt`
and `costUsd`/`cost_usd`, which the bridge maps onto every result.

Every result carries `provider: "market-data"`, `provenance: "partner-api"`,
the locale, the device, `observedAt` and `costUsd`, so a partner figure is
never mistaken for a measurement made by this platform. Missing partner
observability falls back to the bridge's own `observedAt` timestamp; unknown
costs are `null`.

The partner calls are bounded before transmission: at most 20 keywords of at
most 200 characters per volumes call, one keyword per SERP call, a clamped
depth, and grid bounds validated before the partner is contacted. Calls time
out after 30 seconds.

## Costs and provenance discipline

- The operator pays the partner; nothing is billed to tenants. Each answer
  surfaces the partner-reported `costUsd` when available.
- `provenance: "partner-api"` marks every figure: search volumes, SERP
  positions and local ranks are partner observations, not measurements made by
  this platform on the tenant's behalf.
- Other locales than the operator allowlist are refused with an explicit
  French error; the platform never silently samples another market.
- The self-hosted platform without the bridge stays free: no degraded or
  estimated data is produced by default.

## Partner-cost metering (R10)

The partner-reported cost of every successful partner call is metered into
the billing usage ledger: `CloudAccess.meterPartnerCost` (R10 second
increment) accumulates the integer micro-USD of each answer into the
`billing_usage` metric `partner-data-usd-micros`, one row per account and UTC
calendar month — the same period the operations quota uses. Measurement only:

- Only cloud-enrolled tenants with an existing billing account are metered; a
  self-hosted operator pays its own partner costs and appears nowhere in the
  ledger. Tenants are never billed from this metric; the pricing decision
  stays a human one (open question 3).
- An unknown (`null`), invalid or non-positive cost is never metered, and the
  partner-free disavow export never meters anything.
- A metering failure is swallowed on purpose: the partner answer wins over
  the measurement (a lost metering row is strictly less bad than a lost
  answer), and the console wiring in `src/console/api.ts` passes the meter
  only when billing is configured.

## Validation

- `tests/market-data.test.ts`: configuration fail-closed behaviour, locale
  normalisation, volumes/SERP/grid mapping, grid geometry bounds.
- `tests/market-routes.test.ts`: route gating (admin-only partner calls,
  status for all), request bounds, disabled-bridge refusals, partner payload
  mapping, and the R10 metering contract: exact-tenant cost metering per
  partner call, no metering for unknown costs or the partner-free disavow
  export, and a swallowed metering failure.
- `tests/market-ui.test.ts`: linkedom UI coverage of the panel states, gates,
  bounded requests and the provenance line in FR/EN.
- `tests/market-backlinks.test.ts`: domain normalisation, overview/gap
  partner contracts and mapping, competitor bounds and dedupe, disavow file
  format and refusal paths.
- `tests/market-backlinks-ui.test.ts`: linkedom UI coverage of the backlinks
  boxes, the disavow export with the bridge off and the per-language gating
  note.
- CI runs every suite with the full toolchain (`pnpm test`).

## Console panel

The bilingual FR/EN Operations panel `site/console/market.js` renders the
status line (enabled flag, locales, grid depth), the partner forms (volumes,
SERP, local grid, backlink overview, link gap), the disavow export and
every answer with its provenance line. Partner buttons are disabled for
members and while the bridge is off; the disavow export stays available to
tenant administrators even with the bridge off because it makes no partner
call. Unknown values render "—", never zero.

## Backlink intelligence (R5)

The same bridge serves the netlinking module. `marketBacklinkOverview` asks
`POST {base}/backlinks/overview` with `{ domain, locale, limit }` and maps the
answer into a profile (`backlinks`, `refDomains`, both `null` when unknown)
plus a bounded referring-domain list. `marketBacklinkGap` asks
`POST {base}/backlinks/gap` with `{ domain, competitors, locale }` after
normalising every domain through `normaliseMarketDomain` (schemes tolerated,
`www.` stripped, strict hostname label rules): one to five named competitors,
deduplicated, the tenant domain refused as its own competitor. Gap domains
are limited to those citing at least one declared competitor and not the
tenant domain, capped at 50 and sorted by competitor coverage; each row
carries only the citations that belong to the declared competitor list. Both
answers keep the full partner provenance (`partner-api`, observation date,
locale, device, partner cost).

`backlinkDisavowFile` is the exception to the partner rule: a **pure, free**
generation from a tenant-supplied selection of domains (one per line,
≤200 after deduplication, every domain validated the same way). The file
carries a French header stating the provenance `sélection client` and warning
that Google recommends disavowing only what cannot be removed by hand; the
route answers provenance `tenant-selection`. No partner call, nothing stored,
no automatic import: pushing the file to Search Console remains a manual
operator act, and the console panel says so on every render.

## Not in this increment

- No caching tier and no scheduled collection of market data: each call is a
  live, bounded, operator-costed request.
