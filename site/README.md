# Landing site

Static page for `google-growth`, published with GitHub Pages from this folder.
No build step: HTML, CSS, two ES modules.

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

## Lead capture

`app.js` has one config block:

```js
const CONFIG = {
  leadEndpoint: "",                     // JSON POST target
  contactEmail: "geoffroydelatournelle@gmail.com",
};
```

- **With a backend:** set `leadEndpoint` to a Formspree/Basin/Worker URL that
  accepts `{ name, email, website, goal, source }` and answers 2xx.
- **Without one:** the form opens a prefilled `mailto:` draft. It is honest but
  depends on the visitor having a mail client; swap in an endpoint before
  running paid traffic.

The page collects only what the form asks for. No analytics script is bundled;
add one deliberately if you need it.

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

## The free read is URL-only by design

`preview.js` never fetches the visitor's site. GitHub Pages is static and most
sites do not send CORS headers, so a browser-side fetch would fail for most
visitors — and inventing a score would be worse than a smaller true one. The
free read inspects the address; the full audit runs server-side through the MCP
server or the CLI.

If you add a real backend later, keep the same contract: a number that came from
a check, with the evidence attached.

## Check before publishing

```bash
node scripts/check-site.mjs
```

Validates that the required files exist, the page keeps its hooks (`check-form`,
`lead-form`, JSON-LD), local asset references resolve, and no placeholder text
ships.
