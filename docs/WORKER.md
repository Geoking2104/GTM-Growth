# Cloudflare Worker — the public API

The Worker serves the same two routes as the Node server, from the same modules:
the GEO audit, the SEO/GA4/GSC tables and the lead validator are shared code, not
a second implementation.

```
src/worker/index.ts   route handlers, CORS, guards
src/freeread/*        SEO tables + GA4/GSC blocks   ← shared
src/geo/*             GEO audit                     ← shared
src/leads/validate.ts lead validation               ← shared
wrangler.toml         config, bindings, vars
```

Bundle size is about 96 KiB (26 KiB gzipped), well under the 1 MiB free-plan
limit, and there is no Node built-in in the graph — the audit runs unchanged on
`workerd`.

## Three ways to deploy — pick one

### 1. One click, from the repository

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Geoking2104/GTM-Growth)

Cloudflare clones the repo, reads `wrangler.toml`, builds and publishes. No CLI,
no token in a terminal. At the end it shows the `*.workers.dev` URL.

### 2. From GitHub Actions (no CLI, deploys on every push)

`.github/workflows/worker.yml` is ready. Add two repository secrets once:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → *Edit Cloudflare Workers* template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → right-hand sidebar |

Then every push that touches `src/worker`, `src/freeread`, `src/geo` or
`wrangler.toml` redeploys, runs a health check and a CORS preflight, and commits the
published URL to `.github/worker-url.txt`. Without the secrets the job skips
instead of failing.

### 3. From your machine

```bash
npx wrangler login
npm run worker:deploy
```

## Deploy (one command, your account)

```bash
npx wrangler login        # opens the browser once
npm run worker:deploy
```

Wrangler prints the URL it published to, e.g.

```
https://google-growth-api.<your-subdomain>.workers.dev
```

Then point the site at it:

```bash
npm run site:api -- https://google-growth-api.<your-subdomain>.workers.dev
```

That writes the `gg-api` meta tag in `site/index.html` and `site/fr/index.html`.
Commit and push: the free-read tables switch from sample rows to measured ones,
and the form posts to the Worker, which forwards to Formspree.

## Local development

```bash
npm run worker:dev      # http://127.0.0.1:8787, real workerd runtime
```

```bash
curl -s http://127.0.0.1:8787/health
curl -s -X POST http://127.0.0.1:8787/api/free-read \
  -H 'content-type: application/json' -d '{"url":"example.com"}'
curl -s -X POST http://127.0.0.1:8787/api/lead \
  -H 'content-type: application/json' \
  -d '{"name":"Geoff","email":"g@example.com","website":"acme.fr","elapsedMs":4000}'
```

## Configuration

`wrangler.toml` holds the non-secret values:

| Name | Meaning |
| --- | --- |
| `SITE_ORIGINS` | Comma-separated CORS allowlist. Only these origins get an `Access-Control-Allow-Origin` echo. |
| `LEAD_FORWARD_URL` | Where a validated lead is forwarded. Formspree today. |
| `LEADS` (KV, optional) | Keeps a copy of every lead for 180 days. |
| `RATE` (KV, optional) | Per-IP, per-minute counters. |

Secrets belong in `wrangler secret put <NAME>`, not in the file:

```bash
npx wrangler secret put LEAD_FORWARD_URL
```

### Optional: keep a copy of leads in KV

```bash
npx wrangler kv namespace create LEADS
# copy the id into wrangler.toml under [[kv_namespaces]]
```

Without the binding the Worker still forwards every lead; it just keeps no copy.

### Optional: rate limiting

The `RATE` binding gives a best-effort per-minute counter (KV is eventually
consistent, so it is a speed bump, not a wall). The real backstop is a Cloudflare
rate-limiting rule:

> **Security → WAF → Rate limiting rules** → `http.request.uri.path eq "/api/free-read"`,
> 20 requests per minute per IP, action *Block*.

## Guards

| Risk | Handling |
| --- | --- |
| SSRF | `http`/`https` only, no credentials in the URL, block `localhost`, `*.local`, `*.internal`, RFC1918, link-local, CGNAT, `::1`, `fc00::/7`, `fe80::/10`, `224.0.0.0/4` |
| Body abuse | 8 KiB cap, JSON object required, `content-length` checked before reading |
| CORS | allowlist from `SITE_ORIGINS`; a foreign origin is answered with the canonical one, never echoed |
| Cost abuse | 10-minute cache on `/api/free-read` via the Cache API, per-IP counters when `RATE` is bound |
| Silent bots | honeypot field + 1.2 s minimum → `202` and nothing stored |

**What is different from the Node server:** Workers cannot do a DNS lookup before
fetching, so the SSRF check is syntactic (host literal). Cloudflare's egress
cannot reach RFC1918 space anyway, and the guard still blocks the obvious
metadata and loopback tricks. The Node server resolves DNS first and is stricter.

## Limits to know

- Free plan: 100 000 requests/day, 10 ms CPU per request. This Worker is I/O-bound
  (one outbound fetch per resource), so CPU is not the constraint.
- Subrequests: 50 per request on the free plan — the audit uses under 10.
- `/api/free-read` costs one outbound request per resource of the target site
  (page, robots.txt, one sitemap, llms.txt, AI discovery probes). It is cached for
  10 minutes per URL.

## Verify after deploy

```bash
curl -s https://<worker>.workers.dev/health
curl -s -X POST https://<worker>.workers.dev/api/free-read \
  -H 'content-type: application/json' -d '{"url":"https://www.opendpe.net"}' | head -c 400
curl -si -X OPTIONS https://<worker>.workers.dev/api/lead \
  -H 'Origin: https://geoking2104.github.io' | grep -i access-control
```

The last one must echo `access-control-allow-origin: https://geoking2104.github.io`.
If it does not, `SITE_ORIGINS` does not match the site origin exactly.
