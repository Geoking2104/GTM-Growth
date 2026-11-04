# IndexNow and Bing — architecture

IndexNow is the only indexation channel a site owner can wire in ten minutes and
that four engines share: **Bing, Yandex, Seznam, Naver**. Google does not
participate. This document covers the protocol, the implementation in this
repository, and how the analysis board consumes it.

Source: <https://www.indexnow.org/documentation> and
<https://www.bing.com/indexnow/getstarted>.

## 1. The protocol in four steps

```
   ┌──────────────┐    ┌─────────────────────┐    ┌──────────────────┐    ┌─────────────┐
   │ 1. generate  │ →  │ 2. host the key file │ →  │ 3. submit URLs   │ →  │ 4. verify   │
   │    a key     │    │ <host>/<key>.txt     │    │ POST /indexnow   │    │ BWT report  │
   └──────────────┘    └─────────────────────┘    └──────────────────┘    └─────────────┘
```

| Step | Rule | Where it lives in this repo |
| --- | --- | --- |
| Key | 8–128 characters of `a-z A-Z 0-9 -` | `generateKey()` — 32 hex characters from a UUID |
| Key file | UTF-8 text at `https://<host>/<key>.txt`, containing exactly the key | `keyMaterial()` |
| Submission | `POST /indexnow` JSON `{host, key, keyLocation?, urlList}`, ≤ 10 000 URLs | `submitUrls()` |
| Verification | `200`/`202` = received, **not indexed** | `explainStatus()` |

Ownership is the whole protocol: the key file is the only proof that the person
submitting URLs controls the host. Two hosting options exist — root (recommended)
or any path with `keyLocation`, which then restricts submissions to URLs under
that path.

### Response codes

| Code | Meaning | What the tool tells you |
| --- | --- | --- |
| 200 | Received | "accepted" — receipt, not indexing |
| 202 | Received, key validation pending | wait; validation is asynchronous |
| 400 | Malformed body | send `host`, `key`, `urlList` |
| 403 | Key not found or file does not contain it | publish the key file, then verify |
| 422 | URLs not on the host, or key outside the grammar | fix host/URLs/key |
| 429 | Too many submissions | back off — one batch per publish |

## 2. Why it is a separate panel, not a GEO category

The GEO rubric scores *how citable a page is*. IndexNow scores *whether a change
can reach an engine at all*. A page can score 90 on GEO and still wait days for a
re-crawl; conversely a site with perfect IndexNow plumbing can have unquotable
copy. Merging them would hide which problem you actually have.

So: `src/indexnow/readiness.ts` returns its own 0–100 score with its own weights.

| Check | Points |
| --- | --- |
| Key in the protocol grammar | 10 |
| Key file published at the host | 35 |
| Key file contains exactly the key | 10 |
| Bing Webmaster verification (`msvalidate.01`) | 10 |
| Bingbot allowed by robots.txt | 15 |
| Sitemap declared in robots.txt | 10 |
| HTTPS | 10 |

Bingbot and the sitemap are in there because announcing a URL is useless if the
crawler is blocked or if nothing ever told the engine the site exists.

## 3. Data flow into the analysis board

```
runGeoAudit ──┐
              ├─► buildAnalysisBoard ─► panels + ranked actions + narrative
citability ───┤            ▲
platforms ────┘            │
                           │
indexnow readiness ────────┘
  ├─ key grammar (local)
  ├─ key file fetch  ← verifyKeyFile()
  └─ robots.txt facts ← reused from the GEO audit (no second fetch)
```

`src/analysis/board.ts` ranks deterministically:

1. **IndexNow blockers** — a blocked Bingbot or a missing key file makes every
   other indexation fix worthless, and both cost minutes.
2. **Cheap IndexNow wins** — verification, sitemap line.
3. **GEO recoverable points**, highest first.
4. **Citability zeroes** — the passages an assistant would not quote.

Every action carries `impact` (the point value of one check), `effort` and
`because` (why it sits that high). Nothing is modelled: `impact` is the check's
own weight.

## 4. End-user customisation

Three entry points, from lightest to deepest.

### 4.1 In the browser, no key leaves the page

The landing page has a generator (`site/index.html`, `#indexnow`): it mints a key
with `crypto.randomUUID()`, shows the file name, offers the `.txt` download and
prints the exact `curl` to submit. Nothing is sent anywhere — the key is generated
locally, which is also the safest default.

### 4.2 Through the MCP tools

| Tool | Writes? | Use |
| --- | --- | --- |
| `indexnow_keygen` | no | key + file + steps |
| `indexnow_verify` | no | fetch the key file, name the fix |
| `indexnow_submit` | **yes** — needs `confirm=true` | announce 1–10 000 URLs |
| `indexnow_readiness` | no | the 0–100 panel |
| `indexnow_explain` | no | decode a status code |
| `analysis_board` | no | everything, ranked |

### 4.3 Through the CLI

```bash
npm run cli -- indexnow-keygen  --host example.com
npm run cli -- indexnow-verify  --host example.com --key <key>
npm run cli -- indexnow-submit  --host example.com --key <key> \
  --urls https://example.com/a,https://example.com/b --confirm=true
npm run cli -- analysis-board   --url https://example.com --indexnow-key <key>
```

`indexnow-verify` exits `1` when the key file is wrong, so it drops straight into
CI:

```yaml
- run: npm run cli -- indexnow-verify --host $HOST --key ${{ secrets.INDEXNOW_KEY }}
```

## 5. Operating rules

- **Submit changes, not the archive.** Only URLs added, updated or deleted since
  you wired IndexNow. Submitting a whole sitemap burns crawl quota for nothing.
- **One batch per publish**, not one request per page — 10 000 URLs per request.
- **Never delete the key file**: every later submission returns 403.
- **A 200 is not a ranking.** It says the engine was told. The FAQ on Bing is
  explicit: IndexNow does not guarantee crawling or indexing.
- **Rotating the key** means publishing the new file, waiting for it to be
  reachable, then submitting with the new key. Keep the old file for a while if
  you have scheduled jobs mid-flight.

## 6. Security notes

- The key is public by design — it sits in a text file. Treat it as an identifier,
  not a secret; `LEADS`-style secrets never go in the key file.
- `indexnow_submit` refuses to run without `confirm=true`, like every other write
  in this repository, because it notifies third parties and consumes quota.
- The Worker and the MCP server never accept a key from a URL parameter: the key
  is passed in the tool payload or the CLI argument, so it does not land in access
  logs.

## 7. What is deliberately missing

- **Google**: no IndexNow support. Google's equivalents are the Indexing API
  (job postings and livestreams only) and Search Console's URL Inspection.
- **Automatic submission on publish**: the repository has no hook into your CMS.
  Wiring one is a `curl` to `indexnow_submit` from your deploy pipeline — the CLI
  command above is already that hook.
- **Traffic attribution**: whether an IndexNow submission produced a visit is a
  Search Console question, not an IndexNow one.
