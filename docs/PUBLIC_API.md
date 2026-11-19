# Public API — free read, lead capture and optional report delivery

The two original endpoints are served either by the Express app (Node, same process as the MCP
transports) or by a Cloudflare Worker — same routes, same shared modules:

- **Node server:** `pnpm run cli serve-http` (below)
- **Cloudflare Worker:** `pnpm run worker:deploy` — see [WORKER.md](WORKER.md)

They exist so the landing page can do two things a static site cannot do alone:
read a page server-side, and send a contact request without opening a mail client.

```bash
pnpm run build
PORT=3111 LEADS_PATH=./data/leads.jsonl SITE_ORIGINS=https://example.com \
  pnpm run cli serve-http
```

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/free-read` | `POST` | GEO v2 42-control evidence ledger + source preview, SEO tables, GA4/GSC readiness and five-pillar `report360` (deprecated GEO v1 root fields remain for old clients) |
| `/api/lead` | `POST` | Contact request, stored as JSONL, optionally forwarded |
| `/api/report-access/status` | `GET` | `{ "enabled": false }` until Node SMTP, secret and opt-in are configured |
| `/api/report-access/invite` | `POST` | Request email OTP and persist one public `report360` snapshot (Node only) |
| `/api/report-access/verify` | `POST` | Validate recipient email + six-digit code and set report-scoped session cookie (Node only) |
| `/api/report-access/report` | `GET` | Protected saved report JSON (Node only) |
| `/api/report-access/download` | `GET` | Protected saved A4 `.pdf` or `.md` (Node only) |

Both answer `OPTIONS` with the CORS headers the browser needs, so a static site on
another origin can call them directly.

## `POST /api/free-read`

```json
{ "url": "example.com" }
```

```json
{
  "score": 71,
  "band": "good",
  "projectedScore": 100,
  "recoverablePoints": 29,
  "headline": [{ "label": "GEO v1 legacy (deprecated)", "value": "71/100" }],
  "topFixes": [{ "checkId": "robots.citation_bots", "points": 3, "action": "…" }],
  "tables": [
    { "id": "seo.meta", "title": "SEO — metadata", "rows": [{ "label": "Title", "value": "48 chars", "status": "pass" }] },
    { "id": "seo.content", "title": "SEO — content structure", "rows": [] },
    { "id": "seo.technical", "title": "SEO — links, media and structured data", "rows": [] },
    { "id": "ga4.readiness", "title": "GA4 — measurement readiness", "rows": [] },
    { "id": "gsc.readiness", "title": "Search Console — indexation readiness", "rows": [] },
    { "id": "ga4.traffic", "title": "GA4 — traffic report", "sample": true, "rows": [] },
    { "id": "gsc.traffic", "title": "Search Console — performance report", "sample": true, "rows": [] }
  ],
  "report360": {
    "schemaVersion": 1,
    "method": "geo-v2-public-evidence",
    "scope": "single_public_url",
    "observedAt": "2026-11-16T12:25:00Z",
    "sourceUrl": "https://example.com/",
    "pillars": [
      { "id": "seo", "coverage": "measured", "score": null, "observedChecks": 18, "needsAttention": 3 },
      { "id": "geo", "coverage": "partial", "score": null, "observedChecks": 19 },
      { "id": "ai", "coverage": "partial", "score": null },
      { "id": "crm", "coverage": "not_measured", "score": null },
      { "id": "social", "coverage": "partial", "score": null, "observedCount": 1 }
    ],
    "actions": [
      { "id": "seo.title", "kind": "observed_fix", "pillar": "seo", "code": "title", "proof": { "id": "seo.meta:Title", "sourceUrl": "https://example.com/", "observedAt": "2026-11-16T12:25:00Z" } },
      { "id": "crm.connect_conversions", "kind": "next_step", "pillar": "crm", "proof": null, "points": null }
    ],
    "geoV2": {
      "gridVersion": "2.0.0",
      "status": "incomplete",
      "score": null,
      "controls": [
        { "controlId": "M01", "title": "Descriptive title", "category": "meta", "status": "measured", "outcome": "pass", "proof": { "type": "extract", "value": "HTML title: …", "url": "https://example.com/" }, "reason": null },
        { "controlId": "P02", "title": "…", "category": "rendering", "status": "unknown", "outcome": "unknown", "proof": null, "reason": "Requires verified render" }
      ]
    },
    "sourcePreview": { "kind": "observed_html_reconstruction", "title": "Example page", "description": "…", "heading": "Example", "subheadings": [], "screenshotUrl": null },
    "comparison": null,
    "unmeasured": ["ai_citations", "crm_conversions", "social_inbound_backlinks"]
  },
  "geoV2": { "gridVersion": "2.0.0", "status": "incomplete", "score": null, "controls": ["42 redacted public control records"], "unmeasuredControls": ["P02"] },
  "limitations": ["…"]
}
```

The `report360` block is an **illustrative abbreviated shape**, not a valid
captured snapshot. Additional fields, including owner, priority, effort, risk,
measurement gaps, `httpStatus` and the full source-proof value, are present in
real responses. `geoV2.controls` always includes all 42 unique approved IDs;
the example shows just two. Public and emailed snapshots omit per-control
points, earned totals, score ranges and any publishable score until owner
consent. The *deprecated* top-level `score`, `band`, `projectedScore`,
`recoverablePoints`, `topFixes`, and `opportunities` are **GEO v1 only** and must
not be used for a v2 score or action plan. The [source contract](product/FREE-REPORT-360.md) defines each
status. Browser printing is an A4 Save as PDF route independent of SMTP;
the optional report delivery routes below generate a direct server-side PDF.

## Optional report delivery (Node server only)

The static `/report/` page and the optional invitation form are same-origin
clients of this API; the Cloudflare Worker does **not** implement these routes.
Anonymous free-read results remain public. Email verification protects a **saved
copy and its downloads**, not private tenant/CRM data or every public finding.

1. `GET /api/report-access/status` returns `{ "enabled": true|false }`.
2. `POST /api/report-access/invite` accepts:

   ```json
   { "url": "https://example.com/", "email": "owner@example.com", "language": "fr" }
   ```

   `201` returns `{ "ok": true, "id": "<UUID>", "expiresIn": 900 }`.
   A TLS SMTP email separately contains a one-time six-digit code and the
   return link `/report/?id=<UUID>&lang=fr`. No code or token appears in JSON or URL.
3. `POST /api/report-access/verify` accepts:

   ```json
   { "id": "<UUID>", "email": "owner@example.com", "code": "123456" }
   ```

   On success, `200 { "ok": true, "expiresIn": 3600 }` plus an opaque
   HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/report-access`.
4. With that same-origin cookie, `GET /api/report-access/report?id=<UUID>`
   returns `{ "report360": {...}, "language": "fr" }`.
   `GET /api/report-access/download?id=<UUID>&format=pdf|md` returns a
   downloadable snapshot in the report's language. Any other report ID or
   missing/expired session returns `401`.

The code lasts 15 minutes, is single-use and permits at most five guesses;
invites are limited to 4/email/day and 8/IP/hour. Email/IP and session
tokens are HMAC digests in a dedicated persistent local SQLite database; raw
source HTML, credentials and private account details are not saved. Records
are lazily cleared after seven days. All report endpoints send no-store and
no-referrer headers. SMTP failures return a generic `503`; disabled delivery
returns `503 mail_not_configured`. Same-origin checks apply to POSTs.

Configuration is in the [OVH runbook](../deploy/kayroslab-vps/README.md#optional-report-delivery).

**What is measured, what is sampled.** The SEO, GA4-readiness and GSC-readiness
tables are measured on the HTML, `robots.txt` and `sitemap.xml` the server fetched.
The two traffic tables need a Google credential: without one they return
`"sample": true` and illustrative rows, and the UI must label them. Nothing in this
response is estimated silently.

**What it costs the target.** One request per resource: the page, `robots.txt`, one
sitemap candidate, and whatever the GEO audit needs (`llms.txt`, AI discovery
endpoints). The already-fetched homepage and `robots.txt` are injected into the
audit, so they are never requested twice.

**Guards.** `http`/`https` only, no credentials in the URL, no private or link-local
addresses (IPv4 and IPv6, including `::ffff:` mappings), DNS checked before the
fetch, 12 s timeout, 5 MB body cap, 10-minute response cache, 8 reads per minute per
IP.

## `POST /api/lead`

```json
{
  "name": "Geoff",
  "email": "geoff@example.com",
  "website": "acme.fr",
  "goal": "Full GEO audit",
  "source": "landing",
  "company": "",
  "elapsedMs": 5000
}
```

`201 {"ok":true,"id":"…"}` on success. The record is appended to `LEADS_PATH`
(default `data/leads.jsonl`), one JSON object per line.

Anti-abuse without a captcha:

- `company` is a honeypot — filling it returns `202 {"ok":true}` and stores nothing;
- `elapsedMs` under 1.2 s is treated the same way;
- 5 submissions per minute per IP;
- the website field is normalised (`https://` added, tracking parameters dropped).

When `LEAD_WEBHOOK_URL` is set, the lead is also forwarded there as JSON (Slack
incoming webhooks, a CRM, your own worker).

## Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `SITE_ORIGINS` | unrestricted | Comma-separated CORS allowlist, e.g. `https://geoking2104.github.io` |
| `LEADS_PATH` | `data/leads.jsonl` | Where leads are appended |
| `LEAD_WEBHOOK_URL` | unset | Optional forward of every lead |
| `MCP_API_TOKEN` | unset | Bearer token for `/mcp`, `/sse`, `/messages` (not the public routes) |
| `REPORT_ACCESS_ENABLED` | `false` | Enables Node report access when all required SMTP/secret fields also exist |
| `REPORT_ACCESS_SECRET` | unset | HMAC secret at least 32 characters; OVH deploy script generates a stable value if absent |
| `REPORT_ACCESS_DB_PATH` | `data/report-access.sqlite3` | Persistent SQLite for saved public snapshots, OTP digests and one-hour session digests |
| `REPORT_PUBLIC_ORIGIN` | `https://gtm.kayroslab.com` | Secure, canonical origin for email links and write origin checks |
| `REPORT_SMTP_HOST`, `REPORT_SMTP_PORT` | unset, `587` | DNS host and 587 STARTTLS or 465 TLS; no plaintext transport |
| `REPORT_SMTP_USER`, `REPORT_SMTP_PASSWORD`, `REPORT_SMTP_FROM` | unset | SMTP account and sending identity; store only in protected OVH `.env.local` |

## Connecting the static site

Two meta tags in `site/index.html` and `site/fr/index.html`:

```html
<meta name="gg-api" content="https://api.example.com">  <!-- free read + lead -->
<meta name="gg-form" content="https://formspree.io/f/xxxx">  <!-- lead only -->
```

`gg-api` enables the real tables and the lead POST. `gg-form` is the fallback for a
deploy that has no server: any endpoint that accepts `POST` with JSON works
(Formspree, Basin, your own worker). When neither is set, the free read shows
clearly-badged sample tables and the form keeps the request on the device instead of
pretending it was sent.

## CLI equivalents

```bash
pnpm run cli geo-free-read --url https://example.com   # the same payload, in the terminal
LEADS_PATH=./data/leads.jsonl pnpm run cli leads        # read captured leads
```
