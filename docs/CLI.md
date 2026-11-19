# GTM Growth CLI

Commands aligned with the GA4 / GTM / Search Console / performance workflows.

## Install / build

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm run build
node dist/bin.js doctor
node dist/bin.js help
```

Environment: see `.env.example`.

`doctor` prints the installed version, Node compatibility, dependency and SQLite
binding status, configuration presence, and bounded PostgreSQL and Redis probes.
It prints statuses without exposing configuration secrets. Use
`doctor --require-services` to require the durable audit database and queue in CI.

### Audit exit codes

| Code | Meaning | Conditions |
| --- | --- | --- |
| `0` | Audit completed and selected gates passed | A GEO page can be read and its score meets the threshold when provided |
| `1` | A gate failed | `geo-audit`, `geo-sitemap` or `geo-report` falls below `--min-score 0…100`, `geo-drift` is out of sync, a tracking audit finds a critical issue, a reachable health endpoint is unhealthy, or `doctor --require-services` finds a missing or unreachable audit service |
| `2` | Audit could not run | Invalid commands or options, an exception, no usable page in a GEO audit, all health probes unreachable, or an unsupported or incomplete installation reported by `doctor` |

GEO scores and findings remain part of the JSON result when a gate fails. For
`geo-sitemap`, the score gate applies to successfully read pages. The report
also includes the number of unreadable pages.

---

## Discovery

```bash
pnpm run cli list-properties
pnpm run cli list-sgtm
pnpm run cli list-search-sites
```

## Search Console

```bash
pnpm run cli search-overview --site "https://example.com/"
pnpm run cli top-queries --site "https://example.com/" --limit 20
pnpm run cli inspect-url --site "https://example.com/" --url "https://example.com/page"
```

## Performance

```bash
pnpm run cli pagespeed --url "https://example.com/" --strategy mobile
pnpm run cli crux --origin "https://example.com" --form-factor PHONE
```

## GEO — AI search readiness

```bash
pnpm run cli geo-audit --url "https://example.com"
pnpm run cli geo-audit --url "https://example.com" --no-ai-discovery
pnpm run cli geo-sitemap --url "https://example.com" --max-urls 10
pnpm run cli geo-llms --url "https://example.com" --out ./public/llms.txt
pnpm run cli geo-schema --kind organization --name "Acme" --url "https://acme.com" --out ./schema.html
pnpm run cli geo-schema --kind faq --name "Acme" --url "https://acme.com/faq" --faq-file ./faqs.json
pnpm run cli geo-robots --url "https://example.com" --out ./public/robots.txt
pnpm run cli geo-apply --url "https://example.com" --fix robots-ai --dry-run
pnpm run cli geo-apply --url "https://example.com" --fix robots-ai --diff
pnpm run cli geo-citability --url "https://example.com"
pnpm run cli geo-crawlers --url "https://example.com"
pnpm run cli geo-drift --url "https://example.com"        # exits 1 when llms.txt is stale
pnpm run cli geo-risks --url "https://example.com"
pnpm run cli geo-positioning --url "https://acme.com" --competitors "https://a.com,https://b.com"
```

`geo-audit` prints the score, per-category breakdown, every check with evidence, and the
recommendations ordered by recoverable points. The generators write the artifact when
`--out` is passed, otherwise they print it. `--faq-file` takes a JSON array of
`{"question": "...", "answer": "..."}`. Rubric: [GEO.md](GEO.md).

`geo-apply` is the first **read-only Apply Mode milestone**. It fetches the
public `robots.txt` with DNS pinning/SSRF protections, refuses ambiguous
responses or redirects, and returns a bounded before/after diff with SHA-256
proofs and manual-conflict notices. It does **not** modify the remote site.
`--confirm`, `--apply` and `--mode apply` deliberately fail closed until the
authenticated approval, backup, verification and rollback adapters exist.
See [Apply Mode architecture](architecture/APPLY-MODE-MVP.md).

## Analytics and sGTM

```bash
pnpm run cli traffic --property 123456789 --start 7daysAgo
pnpm run cli analyze-ecommerce --property 123456789
pnpm run cli audit-web --account 111 --container 222 --property 123456789
pnpm run cli cutover-checklist ...
```

See `pnpm run cli help` for the full list.
