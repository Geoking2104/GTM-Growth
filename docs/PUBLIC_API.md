# Public API — free read and lead capture

Two endpoints, served either by the Express app (Node, same process as the MCP
transports) or by a Cloudflare Worker — same routes, same shared modules:

- **Node server:** `npm run cli -- serve-http` (below)
- **Cloudflare Worker:** `npm run worker:deploy` — see [WORKER.md](WORKER.md)

They exist so the landing page can do two things a static site cannot do alone:
read a page server-side, and send a contact request without opening a mail client.

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

## Social cross-links in the automatic free read

`POST /api/free-read` now includes `scoreVersion: "v1"` and a `socialLinks`
object with `outboundProfiles`, `inboundObservationCount` and a limitations
notice. The `geo.social` data table appears in the existing landing-page
results. Outbound profile URLs are collected from page anchors and Organization
JSON-LD `sameAs` entries, without extra social-network requests. Supported
platforms include Instagram, X/Twitter, Reddit, Discord, TikTok, LinkedIn,
Facebook, YouTube, Threads, Pinterest, Mastodon and Bluesky.

`not_checked` means a link from that social profile back to the audited site has
**not** been verified; it must not be interpreted as backlink attribution. The
public score is still v1. The versioned v2 evidence-replay CLI is separate and
is never populated with guessed points from this inventory.

## GEO v2 evidence inventory (unscored)

The same `POST /api/free-read` response now also carries `v2Evidence`:

- `gridVersion: "v2.0.0"`, `scoringStatus: "not_scored"`, `source: "geo_v1_audit"`;
- `categories`: approved v2 point **budgets** plus counts of observed and unavailable source checks, **not earned points**;
- `findings`: original source-check IDs, category, evidence string and status;
- `rendering`: explicitly unavailable until a verified-domain Playwright run produces trusted evidence.

Do not display `v2Evidence.categories.*.budget` as earned points or derive a v2
score from the number of observations. The approved 42-control applicability and
weight allocations are a separate contract.

## Automatically measured GEO v2 controls (partial)

The URL free-read API includes `v2Measurement` alongside the existing
`scoreVersion: "v1"` response. This is a separate, **partial** v2 evaluation,
not a replacement for the public v1 score.

The base collectors cover **17 controls**: R01/R02/R04, L01/L05/L06,
J01/J02/J06, M01–M04, C03, B01/B02 and D01. The additional collectors
can measure **18 further controls** when their inputs are conclusive:

| Controls | Reused evidence and deterministic rule |
|---|---|
| R03/R05 | Robots rules evaluated on the audited URL, including the citation-bot groups, the wildcard fallback and indexing directives. Complex patterns or scoped headers remain `unknown`. |
| L02/L03/L04 | Parsed llms.txt heading, substantive summary, Markdown section count and safe HTTP(S) document-link syntax. Links are **not** claimed reachable from syntax alone. |
| J03/J04/J05 | Coherent JSON-LD entity @id/url pairs; WebSite↔WebPage relationships; matching schema for a page type inferred unambiguously. |
| M05 | Explicitly consistent indexing directives. Intentional noindex or crawler-specific directives require an owner policy and remain `unknown`. |
| C01/C02/C06/C07/C08 | Extractable H1/introduction, visible FAQ Q/A, paragraph plus list/table, visible updated date matching structured `dateModified`, and contextual internal anchors. C02 needs declared questions. |
| B03/B05 | Identical social profiles declared in both site links and `sameAs`; attributed expert author on an editorial page with a matching visible Person declaration. No social backlink is inferred. |
| D02/D03 | Trusted owner-declared key URLs compared to a fetched **page** sitemap; navigable, already-verified AI FAQ/service documentation endpoints. Sitemap indexes are not silently assumed complete. |

These are **maximum instrumentable counts**, not an assertion that every URL
passes or can be measured. `pageHtml` comes from the existing page fetch, and
`sitemap.xml` from the existing sitemap fetch. The optional
`ownerImportantUrls` list must be set **server-side by the verified domain
owner** and constrained to the audited origin; the public free-read request
cannot submit one. No new requests,
external backlink crawling, or LLM judgments are introduced.

**Still requiring additional independent evidence:** C04 (checkable cited
claims), C05 (verified reference relevance/reachability), B04 (external entity
references), P01/P02 (verified Playwright snapshot; an offline adapter already
exists), P03 (isolated crawler-identity network logs), and P04 (real-browser
stability/timing/error logs). Each unresolved control carries its own
`unknown` reason. None receives zero or full points by guesswork.

`v2Measurement.score` is `null` unless all applicable v2 controls are
resolved. `scoreRange` is a conservative interval, not a publication-ready
score. `status: "failed"` applies when the audited page is inaccessible.
The `v2Measurement` object carries measured/unknown/excluded budgets by
category, snapshot and audit hashes and the list of unmeasured control IDs.

## Auditable GEO v2 per-control results

`v2Measurement.controls` returns one record for each approved control, in
canonical rubric order. Each includes its ID, category, title, maximum points,
status, awarded points (or null), proof (type, value, source URL), and unknown or
N/A reason. Unknown observations expose no invented proof.
`v2Measurement.observationHash` is a SHA-256 digest of that complete ordered
trace; it changes when the measurements or proof change even if the snapshot
and grid hashes remain the same. Proof URLs identify where evidence was
observed; an extract from an HTTP response does not by itself certify any
external claim or social backlink.

### Sitemap and AI discovery v2 evidence

R04 reuses the already-fetched sitemap from the public free read, verifying
that its URL is declared in `robots.txt` and that the parsed XML includes
same-domain pages. No extra network request is issued for v2 scoring.
If a sitemap is declared but its content could not be verified, R04 remains
`unknown`; an absent declaration in successfully fetched `robots.txt`
is a measured failure.

D01 uses the observed HTTP status of each AI-discovery endpoint. A missing
HTTP response (status 0) makes the control `unknown`, not a measured zero.
With complete responses, full points require a usable well-known AI document
and a valid AI summary; the status and validation signals are included in proof.
