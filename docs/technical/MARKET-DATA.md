# Partner market-data bridge (R4)

This document covers the operator-owned market-data bridge: keyword search
volumes, Google SERP positions and GBP local rank grids from an external
partner API. Google.fr ships first; every other locale is delivered behind the
same operator flag. The platform itself stays free: the operator owns the
partner account, the API keys and every data cost. Nothing is billed to
tenants, and no figure is ever invented when the bridge is off.

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

## Validation

- `tests/market-data.test.ts`: configuration fail-closed behaviour, locale
  normalisation, volumes/SERP/grid mapping, grid geometry bounds.
- `tests/market-routes.test.ts`: route gating (admin-only partner calls,
  status for all), request bounds, disabled-bridge refusals, partner payload
  mapping.
- `tests/market-ui.test.ts`: linkedom UI coverage of the panel states, gates,
  bounded requests and the provenance line in FR/EN.
- CI runs both suites with the full toolchain (`pnpm test`).

## Console panel

The bilingual FR/EN Operations panel `site/console/market.js` renders the
status line (enabled flag, locales, grid depth), the three partner forms and
every answer with its provenance line. Partner buttons are disabled for
members and while the bridge is off. Unknown values render "—", never zero.

## Not in this increment

- No caching tier and no scheduled collection of market data: each call is a
  live, bounded, operator-costed request.
- R5 (backlinks on the same partner) is a later increment; this bridge only
  covers volumes, SERP and the local rank grid.
