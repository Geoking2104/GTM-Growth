# AI-crawler analytics and access drafts (R6)

This document covers the AI-crawler analytics module: crawl-coverage analysis
of GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and the other registered AI
crawlers from operator-supplied access logs, plus the Apply-Mode dry-run drafts
of the AI-bot robots policy and the llms.txt skeleton. The analysis is free
and stays on the operator's server; no partner call, nothing stored. Every
result carries its provenance: tenant-supplied logs, parsed lines and dates.

## Log analysis

Paste (or POST) an extract of server/CDN access logs to
`/ai-crawlers/analyze` (tenant-admin only, request-quota like other metered
console reads). The parser expects the **nginx combined** log format:

```
IP - - [23/Nov/2026:10:00:00 +0100] "GET /blog/guide HTTP/1.1" 200 512 "-" "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)"
```

- Bounded payload: 5,000 lines / 512 KB maximum, French refusal errors beyond.
- Only parsable lines count; ignored lines are counted and reported, never guessed.
- Crawlers are classified by longest user-agent token against the platform
  registry (`AI_BOTS` in `src/geo/config.ts`), so "AI2Bot-Dolma" never
  classifies as "AI2Bot"; unknown agents are not AI crawlers.
- Coverage is reported per crawler (requests, distinct pages, 2xx served,
  4xx/5xx errors) and per first-level site section (root included), with the
  per-crawler split of each section, the covered period and honest notes:
  sections not crawled in the supplied period stay unknown, never zero.

`analyzeAiCrawlerLogs` (`src/ai-crawlers/logs.ts`) is pure: the logs are not
persisted, hashed or forwarded; re-running with different logs gives a fresh,
provenance-dated analysis.

## Apply-Mode dry-run drafts

`/apply/ai-crawlers/policy` (tenant-admin only) builds two text drafts from
per-crawler choices (`allow` / `disallow` per registry token):

- a **robots.txt draft**: explicit `User-agent` groups appended to the current
  file (fetched from the public site when not pasted). Existing explicit rules
  are never rewritten — they are kept and reported for manual review. When a
  crawler is only covered by the generic `*` group, a specific group is proposed
  in append-only mode with an explicit precedence note.
- an **llms.txt skeleton**: bounded access-policy summary (per-crawler
  choices, link to robots.txt) whose descriptions stay to be filled by the
  operator. No description is invented automatically.

The response is marked `mode: "dry-run"`, `writesEnabled: false` and
`requiresSeparateDomainVerificationAndApproval`: no writer is wired for these
drafts. Publishing robots.txt or llms.txt remains a manual operator act until
the Apply Mode write phase explicitly covers these targets; the existing
read-only `/apply/preview` robots-ai preview stays unchanged.

## Console panel

The bilingual FR/EN Operations tab "Crawlers IA / AI crawlers"
(`site/console/ai-crawlers.js`, `#ops/crawlers`) renders the provenance status
line and both coverage tables for the log analysis, and the per-crawler choice
form with draft diffs for the policy part, with the standing discipline note:
nothing is stored, nothing is invented, drafts are review-only. Both actions
are gated to tenant administrators.

## Validation

- `tests/ai-crawlers.test.ts`: parser, longest-token classification, sections,
  coverage aggregation, bounds and French refusals, choice validation,
  draft generation (existing rules kept, wildcard precedence note, llms
  skeleton, no-change case).
- `tests/ai-crawlers-routes.test.ts`: admin-only gating, tenant/domain
  validation, write-flag refusal, injected fetcher for the current
  robots.txt/llms.txt read.
- `tests/ai-crawlers-ui.test.ts`: linkedom UI coverage in FR/EN (gates,
  coverage tables, provenance line, policy draft choices, diff rendering,
  error surfacing).

CI runs the full 9-job pipeline; the suites above also run under the repo's
standard `pnpm test`.
