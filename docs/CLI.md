# Google Growth CLI

Commands aligned with the GA4 / GTM / Search Console / performance workflows.

## Install / build

```bash
npm install
npm run build
npm run cli -- help
```

Environment: see `.env.example`.

---

## Discovery

```bash
npm run cli -- list-properties
npm run cli -- list-sgtm
npm run cli -- list-search-sites
```

## Search Console

```bash
npm run cli -- search-overview --site "https://example.com/"
npm run cli -- top-queries --site "https://example.com/" --limit 20
npm run cli -- inspect-url --site "https://example.com/" --url "https://example.com/page"
```

## Performance

```bash
npm run cli -- pagespeed --url "https://example.com/" --strategy mobile
npm run cli -- crux --origin "https://example.com" --form-factor PHONE
```

## GEO — AI search readiness

```bash
npm run cli -- geo-audit --url "https://example.com"
npm run cli -- geo-audit --url "https://example.com" --no-ai-discovery
npm run cli -- geo-sitemap --url "https://example.com" --max-urls 10
npm run cli -- geo-llms --url "https://example.com" --out ./public/llms.txt
npm run cli -- geo-schema --kind organization --name "Acme" --url "https://acme.com" --out ./schema.html
npm run cli -- geo-schema --kind faq --name "Acme" --url "https://acme.com/faq" --faq-file ./faqs.json
npm run cli -- geo-robots --url "https://example.com" --out ./public/robots.txt
```

`geo-audit` prints the score, per-category breakdown, every check with evidence, and the
recommendations ordered by recoverable points. The generators write the artifact when
`--out` is passed, otherwise they print it. `--faq-file` takes a JSON array of
`{"question": "...", "answer": "..."}`. Rubric: [GEO.md](GEO.md).

## Analytics and sGTM

```bash
npm run cli -- traffic --property 123456789 --start 7daysAgo
npm run cli -- analyze-ecommerce --property 123456789
npm run cli -- audit-web --account 111 --container 222 --property 123456789
npm run cli -- cutover-checklist ...
```

See `npm run cli -- help` for the full list.
