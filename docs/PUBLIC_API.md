# Public API — free read and lead capture

Two endpoints, served by the same Express app as the MCP transports. They exist so
the landing page can do two things a static site cannot do alone: read a page
server-side, and send a contact request without opening a mail client.

```bash
npm run build
PORT=3111 LEADS_PATH=./data/leads.jsonl SITE_ORIGINS=https://example.com \
  npm run cli -- serve-http
```

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/free-read` | `POST` | GEO score, SEO tables, GA4 / Search Console blocks |
| `/api/lead` | `POST` | Contact request, stored as JSONL, optionally forwarded |

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
  "headline": [{ "label": "GEO score", "value": "71/100" }],
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
  "limitations": ["…"]
}
```

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
npm run cli -- geo-free-read --url https://example.com   # the same payload, in the terminal
LEADS_PATH=./data/leads.jsonl npm run cli -- leads        # read captured leads
```
