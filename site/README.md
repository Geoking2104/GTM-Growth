# Landing site

Static page for `google-growth`, published with GitHub Pages from this folder.
No build step: HTML, CSS, four ES modules.

```
site/
  index.html      marketing page + JSON-LD
  styles.css      all styles, no external fonts
  app.js          free read, lead form, copy buttons
  preview.js      pure URL checks (imported by tests)
  robots.txt      allow all + sitemap
  sitemap.xml     one canonical URL
  llms.txt        dogfooding: the site describes itself for AI agents
  404.html
  assets/logo.png
  assets/logo-128.png
  assets/logo-64.png
```

## Publish

1. Push to `main` — `.github/workflows/pages.yml` uploads `site/` and deploys.
2. **Settings → Pages → Build and deployment → Source** must be **GitHub Actions**.
   If it is set to *Deploy from a branch*, the workflow stops at **Configure Pages**
   and the URL keeps serving the repository README through the default theme.
3. Expected URL: `https://geoking2104.github.io/Google-Growth/` — if the
   repository is renamed, update the canonical URL, `og:url`, `sitemap.xml`,
   `robots.txt` and `llms.txt`.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Workflow fails at **Configure Pages** | Pages is disabled, or set to *Deploy from a branch* | Set Source to **GitHub Actions**, then re-run the workflow |
| URL shows the README with the default theme | Same as above — the branch build wins | Same fix; the Actions deploy replaces it |
| Page loads unstyled | Assets 404 because a branch build is serving the repo root | Same fix |

## Languages

The site ships as two static pages, not a runtime toggle:

| URL | File | `lang` | Canonical |
|---|---|---|---|
| `/` | `index.html` | `en` | `/Google-Growth/` |
| `/fr/` | `fr/index.html` | `fr` | `/Google-Growth/fr/` |

Both pages cross-link with `hreflang` (en, fr, x-default) and share
`styles.css`, `app.js`, `preview.js`. The header has an EN/FR switch that points
at the other page, so the choice survives without JavaScript or storage.

Static copy lives in each HTML file. Strings the browser generates after a
submit — the 10 URL checks, verdicts, errors and lead-form messages — live in
`i18n.js`, keyed by language. `app.js` reads `<html lang>` and picks the
dictionary; `preview.js` takes it as an argument, so it stays testable.

To add a language: copy `fr/index.html` to the new locale folder, translate it,
add a `translations.<lang>` entry in `i18n.js`, add the `hreflang` links on every
page, and list the URL in `sitemap.xml` and `llms.txt`. `node
scripts/check-site.mjs` fails if the pair is incomplete.

## Lead capture — in the page, no mail client

The form POSTs JSON. It never opens a mail client and never claims success it did
not get: "sent" appears only after a 2xx from the endpoint.

Two meta tags in `index.html` and `fr/index.html` configure it:

```html
<meta name="gg-api" content="https://api.example.com">   <!-- free read + lead -->
<meta name="gg-form" content="https://formspree.io/f/xxxx">  <!-- lead only -->
```

| Configured | Free read tables | Lead form |
| --- | --- | --- |
| `gg-api` | measured on the page, robots.txt and sitemap | POST `/api/lead` |
| `gg-form` only | sample rows, badged | POST to that endpoint |

**Current deployment:** `gg-form` is set to `https://formspree.io/f/meaavjpa`, so the form
sends through Formspree and no mail client opens. `gg-api` is empty, so the free-read
tables stay badged as samples until the read API is hosted.
| neither | sample rows, badged | request kept on the device, nothing pretends to be sent |

The API itself ships in this repository — see [`docs/PUBLIC_API.md`](../docs/PUBLIC_API.md):

```bash
npm run build
PORT=3111 LEADS_PATH=./data/leads.jsonl SITE_ORIGINS=https://geoking2104.github.io \
  npm run cli -- serve-http
```

Leads land in `data/leads.jsonl`, one JSON object per line, readable with
`npm run cli -- leads`. Set `LEAD_WEBHOOK_URL` to forward them to a CRM or a
Slack webhook.

**Offline behaviour.** If the POST fails, the payload is queued in
`localStorage` (`gg.lead.queue.v1`) and flushed on the next visit. The visitor
sees "saved on this device", not a fake confirmation.

**Anti-abuse.** Honeypot field (`company`), a 1.2 s minimum on the form, 5 posts
per minute per IP, and URL normalisation before storage.

## Can I keep the site fully static?

Yes, with one trade-off:

- **Lead form:** set `gg-form` to any JSON endpoint (Formspree, Basin, your own
  worker). No server needed.
- **Free read tables:** they need a server that can fetch the visitor's page —
  browsers cannot, because most sites do not send CORS headers. Without `gg-api`
  the page shows clearly-badged sample rows and the exact CLI command to produce
  the real ones.

## Local preview

```bash
npx serve site
# or
python -m http.server 8080 --directory site
```

## Sample report

`reports/opendpe.html` is a real audit of www.opendpe.net (71/100), with the raw
snapshot in `reports/opendpe.json`. It is the page linked from the hero as a
worked example.

Regenerate after engine changes:

```bash
npm run build
node scripts/collect-sample.mjs https://www.opendpe.net site/reports/opendpe.json
```

The HTML is written by hand from that JSON; update the numbers and the snapshot
date together, otherwise the report lies.

## What the free read measures

Two layers, and the page says which one ran:

1. **In the browser, always** — ten checks on the URL itself (`preview.js`):
   protocol, hostname shape, path depth, tracking parameters, fragments, length,
   file extensions. No fetch, so it works for every visitor and cannot be wrong
   about a page it never saw.
2. **On the server, when `gg-api` is set** — one request each for the page,
   `robots.txt` and the sitemap, then three things:
   - **SEO tables**: title and description lengths, canonical, robots meta,
     `lang`, H1/H2/H3 outline, word count, links, images without alt, JSON-LD
     blocks and types;
   - **GA4 table**: measurement IDs, dead UA tags, container count, loader
     duplication, `dataLayer`, consent mode — all read from the HTML;
   - **Search Console table**: verification meta, robots.txt directives, sitemap
     coverage, lastmod share, indexability, canonical host.

The two traffic reports (sessions, clicks, impressions) need a Google credential
the visitor never shares. They are returned with `sample: true` and rendered with
a **sample** badge. The moment a property is connected server-side, the same
tables carry **measured** instead — the code path is identical.

## Check before publishing

```bash
node scripts/check-site.mjs
```

Validates that the required files exist, the page keeps its hooks (`check-form`,
`lead-form`, JSON-LD), local asset references resolve, and no placeholder text
ships.

