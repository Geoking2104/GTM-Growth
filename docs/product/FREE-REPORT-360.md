# Free report 360° — source contract, customer experience and release plan

**Date:** 16 November 2026 · **Status:** implemented on a feature branch, **not merged or deployed**.

This plan implements the accepted free-report redesign against the existing public
read, inspired by the competitor's short executive report and multi-page action
plan. It is also the review checklist for product, design, security and release.
The prototype and competitive specification were approved separately; the public
HTML/PDF experience must still pass staging and customer acceptance.

## Customer outcome

A non-technical owner should be able to answer, in one session:

1. **What was seen?** The exact URL, read timestamp, source link and measured scope.
2. **What matters?** Five clearly separate lenses: SEO, GEO, AI engines, CRM, Social.
3. **What can we do?** An ordered action card with owner, effort, change risk,
   observed proof, explanation, three steps and a follow-up check.
4. **What is not known?** Unknown private metrics are visibly labelled rather
   than displayed as zero, failed controls or imaginary AI citations.
5. **What can we share?** The same web snapshot is printable/savable from the
   browser as an A4 PDF, with all filters removed and instructions expanded.

## What is implemented in this branch

| Part | Existing foundation reused | Change in this branch | Reality boundary |
| --- | --- | --- | --- |
| Public read | `runFreeRead`, `POST /api/free-read`, Worker and Node routes | Adds `report360` in the same JSON response | Public URL only; no additional requests or accounts |
| SEO | Actual `seo.*` HTML table rows | Counts eligible checks and identifies relevant observed fixes | No fabricated overall SEO score; heuristics are review prompts |
| GEO | GEO v1 controls and opportunities | Readiness score, top observed fixes, raw control proof | GEO v2 and actual AI citations are not substituted |
| AI engines | Existing readiness/disclaimer and separate connected collectors | Conditional collection guidance with `null` observed metrics | No model is queried by the free read |
| CRM | Existing authenticated CRM and Google connectors | Conditional, approval-led connection guide | No conversion/lead/customer data from public HTML |
| Social | `socialProfiles` from visible links and `sameAs` | Observed outbound-link count and manual follow-up | No inbound backlinks, engagement or referral claims |
| Web | Public FR/EN console, existing login and explanations | M1 5-card executive view, M2 filterable plan, M3 source-vs-proposal tutorials | Reconstructed textual excerpts, never synthetic screenshots |
| Export | Browser print pipeline | A4 CSS; all action cards and instructions included when printing | Browser Save as PDF; no new server-side PDF endpoint |

The existing full technical panels, customer journey, diagnostic proofs and
recommendation assistant remain available below the new 360° summary. This
branch does not activate a connection, write to a customer's website or change
account/billing privileges.

## Versioned `report360` contract

`FreeReadResult.report360` has schema version `1`, method
`geo-v1-public-page`, scope `single_public_url`, `sourceUrl`, `observedAt`,
`httpStatus`, `pillars`, `actions`, `comparison: null` and `unmeasured`.

For every pillar:

- `coverage` is `measured`, `partial` or `not_measured`.
- `score` is a number **only** for GEO v1; other pillars return `null`.
- SEO provides the number of observed eligible HTML checks and issues needing
  review, not an unvalidated synthetic percentage or rank.
- Social exposes the observed number of outgoing/declared profile links; zero
  means *none on this page*, not *the business has no social presence*.
- AI and CRM metrics requiring private access remain `null`.

Every observed action includes a stable action ID, channel, priority, effort,
change risk, owner and a proof object with control ID, source URL, observation
timestamp, measured value/note and `html_observation`/`geo_check` format.
Conditional next steps have `kind: next_step`, `proof: null`, `points: null`.
These are **not** marked as failed checks.

No traffic, positions, before/after gains, backlink counts, citations, customer
IDs, sales or competitive keyword gaps are inferred from the public page.
Model-generated claims and private provider results are excluded from this
anonymous report.

## Phased acceptance and remaining scope

| Phase | Acceptance criterion | Source state |
| --- | --- | --- |
| A · Truth contract | Five pillar objects; unknown metrics `null`; observable proofs are dated and source-linked; illustrative GA4/GSC rows excluded | **Implemented / tests added** |
| B · Bilingual experience | FR and EN feature parity, distinct pillar symbols, source excerpts inserted as text, 3-step guidance, filters, CTA to existing login, mobile CSS | **Implemented / automated UI tests**; human design QA pending |
| C · PDF | Functional browser print/Save as PDF, A4 layout, all actions visible, no fake screenshot or improvement claim | **Implemented in CSS/JS**; print-output visual QA pending |
| D · Enriched evidence | First-party screenshot after DNS TXT or HTTPS file verification, isolated Playwright resources, redaction and retention limits | **Not implemented in public free flow** |
| E · Measured integrations | Consent-based GSC/GA4, AI-answer collection, CRM and Social imported from exact authorised tenant sources | **Not implemented in anonymous free report**; underlying private connectors require separate activation |
| F · Follow-up | Persist plan and real before/after snapshot comparisons with matching method and URL | **Not implemented**; current comparison intentionally `null` |
| G · Release | CI, staging, security, responsive, FR/EN, accessibility and real Save as PDF validation | **Pending approval and deployment** |

### Security checks

- [x] Reuses existing public URL validation, DNS/IP/redirect SSRF guards,
  response limits, rate limiter and response cache; no new target fetch.
- [x] No HTML from customer pages is executed; text is escaped by DOM
  `textContent`, and source links accept HTTP(S) only.
- [x] No API tokens, personal contacts or private telemetry added to JSON/export.
- [x] No automatic mutations; all sample data remain outside action extraction.
- [ ] Revalidate public API abuse/SSRF/WAF settings in staging, including
  concurrency and encoded redirect edge cases.
- [ ] Check print privacy, cross-origin asset handling, keyboard navigation,
  screen-reader labels, color contrast and 320px/768px/1440px layouts.
- [ ] Test print rendering in Chrome/Firefox and verify at least one genuinely
  captured PDF page, page breaks, readable source URLs and page count.

### Deployment sequence (not executed by this branch)

1. Review the feature PR and the output for at least one public test fixture
   and one permitted site. Confirm editorial guidelines with a non-technical
   French and English reviewer.
2. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run lint`,
   `npm run build`, `npm run docs:check`, `npm run site:check` and Worker dry run.
3. Verify the actual front-end bundle loads `report360.js` in staging; deploy
   the corresponding server/Worker revision atomically with the site, or accept
   the supported missing-field fallback during rollout.
4. Verify `POST /api/free-read` behavior on Node and Worker, including rate
   limit, DNS rebinding/redirect protection and cache semantics. Record the
   deployed commit SHA and run IDs.
5. Smoke-test FR and EN on mobile/desktop, simulate a missing private-data
   source, save the A4 PDF and check a source link and login handoff.
6. Deploy on OVH only after separate merge/release approval. Monitor timeouts,
   HTTP 4xx/5xx, report completion and user understanding; keep rollback ready.

## Known product limitations

The browser's *Print / Save as PDF* action is the initial A4 export, not a
direct server-generated binary PDF or a persistent saved share link. It does
not generate images or capture the target site. A verified-domain screenshot
pipeline, report history, real AI citations, CRM events, social inbound signals,
multi-page crawling and advanced competitive analysis are separate planned
features subject to authorization and evidence coverage.

For this version, a good free report is one that **proves what it claims and
teaches the next action**. It must not reproduce an attractive but unsupported
global score, traffic impact forecast or after-correction score.
