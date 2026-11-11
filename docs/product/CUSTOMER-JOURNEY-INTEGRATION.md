# Customer Journey — first integration increment (L1 / short L2)

Status: implemented in branch for CI/review, **not production deployed**. This is an adapted workflow based on the external Agent Skills methodology, not an imported or executable third-party agent.

## Scope

- Public \`/console/?lang=fr#c-public-read\` and EN: after the existing one-page \`POST /api/free-read\` check, show five awareness stages with two editable, explicitly **inferred** questions per stage, optional audience / objective, tentative heading coverage, and a locally copied Markdown plan. No registration or paid LLM API required.
- The existing public recommendation assistant still shows up to **six observed opportunities**; the first **three** are immediately visible. Ranking modes now include \`quick\`, \`blockers\`, \`journey\`, \`impact\`, and \`ai\`. Critical failures take precedence in all modes. The \`journey\` mode only reorders real measured checks; it does **not** fabricate content audit failures.
- Authenticated console: **Customer journey / Parcours client** entry with an on-demand read of the selected authorised public page. An administrator can choose an inferred or manually edited prompt and add it to the existing tenant-scoped prompt pool, with source kind, source reference, locale, target URL, and group.
- Back-end \`runFreeRead\` now returns bounded factual page signals (\`title\`, \`description\`, \`htmlLang\`, top 4 H1, top 8 H2), measured from its existing HTML fetch; there is no extra crawl.
- Reuse \`site/console/shell.css\` and the current console shell; French and English are intentionally matched.

## Source attribution

- [Illyism / customer-journey](https://github.com/Illyism/seo-skills/blob/main/marketing/customer-journey/SKILL.md) — five awareness stages and conversational prompts.
- [Illyism / seo-autopilot](https://github.com/Illyism/seo-skills/blob/main/seo/seo-autopilot/SKILL.md) — inspiration for the action-plan handoff, **not** an autonomous publishing agent.
- [RomeoSEO / seo-skills](https://github.com/RomeoSEO/seo-skills) — guidance for prompt provenance, page/intent mapping, QA and safe handoffs. This increment does not invoke DataForSEO or copy their skills into runtime code.

Source repositories advertise MIT; no untrusted installer or third-party agent instructions are run on the VPS.

## Evidence and constraints

- Prompts shown by the new module are **generated hypotheses**, never claimed to be observed Search Console queries, actual ChatGPT searches, search volume, citations, positions, customer demand or conversion forecasts. Editing a prompt preserves \`provided:user\` provenance, not \`observed\`.
- Possible H1/H2 matches are labelled exploratory and are not evidence of SERP coverage.
- The existing deterministic technical GEO v1 score remains separate from GEO v2; public scans remain single-page. Verified-only Playwright and the 42-control v2 rubric are untouched.
- Tracking a prompt does **not** run an AI provider: the separate visibility run is still gated by the existing admin route and the tenant's configured keys.
- No automatic publication, redirects, email, outreach, backlinks purchasing, score disclosure or unapproved site writes.
- Selected target URLs for journey-sourced tracked prompts must belong to the authenticated tenant, verified at the API route.
- No subscription/Mollie entitlements or numeric Solo/Agency quotas are asserted as implemented. Self-hosted functionality remains free.
- After merging, production release still requires a safe, verified \`VPS_SSH_FINGERPRINT\` configured in the protected deployment environment; never remove the SSH pinning guard.

## Next increments (not included)

1. Persist a versioned site/segment journey with human approval, multi-page inventory and coverage verification on verified domains.
2. Unify journey opportunities with an actionable 30/60/90-day tenant backlog and server-side authorization.
3. Extend read-only Autopilot to durable scheduled checks, release regression snapshots and source-labelled impact.
4. Improve content briefs: actual sector, current year, FR/EN, citations, QA and WordPress draft-only integration through the reviewed Apply Mode.
5. Introduce contractual Cloud entitlements, Mollie lifecycle, budget caps and provider integrations only after separate review.

## Review checklist

- Vitest: \`tests/customer-journey.test.ts\`, \`tests/console-public-read.test.ts\`, \`tests/free-read.test.ts\`, \`tests/console-ops.test.ts\`
- \`npm run lint\`, \`npm run typecheck\`, \`npm run build\`, \`npm test\`
- FR/EN authenticated and public flows; keyboard navigation, mobile 375/390px, desktop 1440px
- Confirm no dummy measured metrics, no account needed to copy, and each edit is explicitly user-initiated
- Verify that production was updated **only after** an authorised, successful deployment and live HTTP readback
