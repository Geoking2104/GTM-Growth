# Landing site

The primary product site is **https://gtm.kayroslab.com/**; its French version is **https://gtm.kayroslab.com/fr/**. Nginx on the OVH VPS serves the static pages alongside the API and console. A push alone does not deploy.

## One layout, two languages

The English presentation is the shared visual reference. Both homepages retain the complete French homepage content: audit, workflow, tools, Ops loop, console, roadmap, toolkit, measurement, proof, pilot offers, contact and FAQ. English has a complete translation of that content.

| Source | Purpose |
| --- | --- |
| `landing/template.html` | Shared semantic structure and section order |
| `landing/en.json`, `landing/fr.json` | Complete locale dictionaries, including accessible labels and metadata |
| `landing.css` + `styles.css` | Shared English visual system, light content sections and responsive layouts |
| `landing.js` | Shared free-read and lead-form behavior, localized through the page language |
| `assets/screens/geo-board-en.svg`, `geo-board-fr.svg` | Same illustration with localized labels |
| `index.html`, `fr/index.html` | Generated, committed static output; do not edit directly |

After changing the template or a dictionary:

```bash
npm run site:render
npm run site:check
```

The renderer rejects missing, extra or empty translations. The site check rejects stale output, structural divergence, broken local asset references or fragments, missing sections and console links without the selected locale. It also checks canonical URLs and the EN/FR language switch. JSON-LD FAQ content is generated from the visible localized questions and answers.

The shared script preserves existing English section links such as `#plans` and `#talk`. Links to the console carry `?lang=en` or `?lang=fr`; privacy links remain localized. The console keeps its own styles and language shell.

## Forms and evidence

Both languages use the same form hooks and endpoints:

- `url-form`: ten immediate URL-shape checks from `preview.js`, followed by `POST /api/free-read` for a server page read. URL hygiene and the measured GEO score are distinct. If the server is unavailable, sample tables are explicitly labelled. French server rows are translated by `fr/server-tables.js`.
- `lead-form`: validates name, email and website, then sends JSON to `POST /api/lead`. Success is shown only after a successful HTTP response; errors preserve visitor input. This flow does not use Formspree, open a mail client or queue data offline.
- `sitemap-map.js`: renders declared sitemap data with localized labels; sitemap metrics are not traffic estimates.

See [Public API](../docs/PUBLIC_API.md) for endpoint operations. The free local presence checklist is shared with the public console through `local-seo-preview.js` and `local-seo.css`. The authenticated tenant-scoped workspace uses `console/local-seo-network.js`; see [Global and local SEO](../docs/product/GLOBAL-LOCAL-SEO.md) for its limits and connector prerequisites.

Solo €39/month and Agency €149/month remain indicative pilot offers. Mollie checkout is not active.

## Preview and verification

```bash
python3 -m http.server 8080 --directory site
# In another terminal:
node scripts/qa-landing.mjs
```

Browser QA requires Chromium (or `CHROMIUM_BIN`). CI installs it and verifies EN/FR desktop/mobile rendering, common structure/styles, privacy, lead success/failure with intercepted requests, sample/measured read flows, console navigation and the language switch. Screenshots are uploaded as `landing-fr-en-screenshots`.

## Deployment

Use `.github/workflows/deploy-kayroslab-vps.yml` on `main` with `confirmation: DEPLOY`. The protected OVH workflow updates the checkout and deploys the application with the existing SSH host verification. See [VPS operations](../deploy/kayroslab-vps/README.md).

The separate manual `pages.yml` workflow is a secondary static publication path. The primary canonical domain remains `gtm.kayroslab.com`; API-dependent features require the OVH backend.
