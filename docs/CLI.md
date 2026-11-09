# GTM Growth CLI

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
npm run cli -- geo-citability --url "https://example.com"
npm run cli -- geo-crawlers --url "https://example.com"
npm run cli -- geo-drift --url "https://example.com"        # exits 1 when llms.txt is stale
npm run cli -- geo-risks --url "https://example.com"
npm run cli -- geo-positioning --url "https://acme.com" --competitors "https://a.com,https://b.com"
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


## GEO Score v2 — deterministic evidence replay (pilot)

The v2 replay command accepts a JSON envelope with `grid`, `snapshot` and
`observations` fields, then calculates the approved eight-category 100-point
score with reproducible snapshot/grid hashes:

```bash
npm run cli -- geo-score-v2 --in evidence.json --out score-v2.json
```

The `grid` must use version `v2.0.0` and the approved category weights
(robots 14, llms 14, JSON-LD 14, metadata 10, content 18, brand 10,
AI discovery 8, rendering 12). Each control must have exactly one observation
with earned integer points and a nonempty proof. The exported report contains
`score`, `scoreByCategory`, `topActions`, `snapshotHash`, `auditHash`
and `evidenceStatus: "user_supplied_unverified"`.

**Important:** This command replays supplied evidence; it does not inspect the
live site, verify domain ownership, attest the proofs, or publish a score.
The published v2 production grid and automated evidence collection are separate
follow-up deliverables. The existing `geo-audit` (v1) remains unchanged.

## GEO social cross-links — website and profile references

```bash
npm run cli -- geo-social-links --url https://example.com
npm run cli -- geo-social-links --url https://example.com --social-evidence profile-html.json
```

The command discovers website-to-profile links from page anchors and Organization
`sameAs` JSON-LD for Instagram, X/Twitter, Reddit, Discord, TikTok, LinkedIn,
Facebook, YouTube, Threads, Pinterest, Mastodon and Bluesky. It reports the
exact URLs and their source. It never guesses that a social profile links back.

Optionally, `profile-html.json` can be an array of owner-supplied observations:

```json
[
  {
    "profileUrl": "https://www.instagram.com/example/",
    "html": "<a href=\"https://example.com\">Official website</a>"
  }
]
```

An inbound match is reported as `observed_in_supplied_html`, not as an
independently authenticated backlink. Profiles requiring login or blocked by
platform anti-bot controls remain `not_checked`. This inventory does not
assign GEO v2 points until the corresponding controls and evidence policy have
been published. No social-platform API is called.

## Versioned GEO v2 grid change history

The pure `diffScoreGrids(previous, next, reasons)` function in
`src/geo/score/v2/changelog.ts` returns per-control additions, removals,
reweightings and definition changes, including old/new points. Each changed
control requires an explicit human-authored reason; profile or category-budget
changes require a `$grid` reason. This is an internal library contract for
the future `/methodology` changelog; no score is published automatically.

## GEO v2 applicability evaluation

The pure `evaluateApplicability(rule, facts)` helper supports explicit boolean
facts, `all`, `any` and `not` rules. Its three outcomes are
`applicable`, `not_applicable` and `unknown`. Missing evidence always
returns `unknown` unless another clause decisively resolves the condition;
it cannot silently become a failed check or a zero score. This is the
**generic evaluation mechanism**, not a publication of the final 42 approved
control-specific applicability rules. It does not redistribute points.

## Owner-approved GEO v2.0.0 grid (42 controls)

`approvedV2Grid("general")` in `src/geo/score/v2/approved-grid.ts`
provides the approved stable controls R01–R05, L01–L06, J01–J06,
M01–M05, C01–C08, B01–B05, D01–D03 and P01–P04.
All 42 have measurement descriptions, proof requirements, max points and effort.
Category budgets: robots 14, llms 14, JSON-LD 14, metadata 10,
content 18, brand 10, discovery 8, rendering 12. L05 and L06
require strict documentation depth above 1,000 words.

`calculateV2Coverage(grid, snapshot, observations, auditFailed?)` is the
strict applicability-aware scoring gate:

- `measured`: integer earned points and valid proof required.
- `not_applicable`: explicit justification and proof required; points removed
  from the denominator, then normalized to 100.
- `unknown` or absent: never scored as a failure. Final `score` remains
  `null`; a conservative `scoreRange` is reported.
- `auditFailed`: `status: "failed"`, `score: null`.

Full automatic scoring is gated on actual observations for all applicable
controls. The older evidence inventory is still `not_scored` and must not
be naively converted from v1 points. The profile-specific category reweighting
policy remains separate from the approved general 100-point grid.
