# Free report 360° — source contract, customer experience and release plan

**Date:** 16 November 2026 · **Status:** five-pillar report and optional email-gated exports are on `main`. This follow-up integrates the approved 42-control GEO v2 ledger into the public report and exports. **The domain-verified Playwright screenshot path, authenticated AI/CRM/inbound-social collection, and production SMTP end-to-end delivery remain separate verification/activation gates.**

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
   browser as A4 PDF, and optionally delivered behind a one-time email-code
   gate with a secure HTML link and direct PDF/Markdown downloads.

## Existing foundation and new changes

| Part | Existing foundation reused | Change in this branch | Reality boundary |
| --- | --- | --- | --- |
| Public read | `runFreeRead`, `POST /api/free-read`, Worker and Node routes | Adds `report360` in the same JSON response | Public URL only; no additional requests or accounts |
| SEO | Actual `seo.*` HTML table rows | Counts eligible checks and identifies relevant observed fixes | No fabricated overall SEO score; heuristics are review prompts |
| GEO | Approved 42-control GEO v2 rubric and HTTP evidence collectors from PR #30; legacy v1 API fields | 42-control categorized evidence ledger, applicability/unknown states, measured-failure actions | Numeric v2 score and control points withheld in public snapshots until complete proof and owner consent; the deprecated v1 score is never substituted |
| AI engines | Existing readiness/disclaimer and separate connected collectors | Conditional collection guidance with `null` observed metrics | No model is queried by the free read |
| CRM | Existing authenticated CRM and Google connectors | Conditional, approval-led connection guide | No conversion/lead/customer data from public HTML |
| Social | `socialProfiles` from visible links and `sameAs` | Observed outbound-link count and manual follow-up | No inbound backlinks, engagement or referral claims |
| Web | Public FR/EN console, existing login and explanations | M1 5-card executive view, M2 filterable plan, M3 source-vs-proposal tutorials, M4 visual search snippet and heading outline reconstructed only from observed HTML | **Not a screenshot**; verified domain and consent are required for a real Playwright visual proof |
| Existing export | Browser print pipeline | A4 CSS; all action cards and instructions included when printing | Browser Save as PDF works without email setup |
| Optional invitation | New `src/report-access/service.ts`, `mailer.ts`, `router.ts`, `site/console/report-invite.js` | TLS SMTP sends a six-digit code, then email + code unlock a saved report at `/report/` | New Node-only feature, disabled until a sender is configured; no cloud tenant permission is granted |
| Optional downloads | `src/report-access/export.ts`, `site/report/` | Same saved `report360` snapshot rendered as HTML, illustrated vector A4 PDF and `.md`; complete 42-control ledger and explicit unknowns | No new facts or private connected measurements inferred; score points are redacted from the public contract |

The existing full technical panels, customer journey, diagnostic proofs and
recommendation assistant remain available below the new 360° summary. This
release does not activate a connection, write to a customer's website or change
account/billing privileges.

### Visitor flow — report by email

1. A visitor runs the ordinary free URL read. The anonymous five-pillar summary
   stays visible without an email or account.
2. If `GET /api/report-access/status` returns `enabled: true`, a labelled
   invitation form accepts an email and requests a fresh read of the same
   validated public URL. SMTP sends a six-digit single-use code separately
   from an `/report/?id=...&lang=fr|en` return link; the code never enters a URL.
3. The report page asks for the recipient email and the code. Successful
   verification stores an opaque, 1-hour, HttpOnly/Secure/SameSite-Strict
   report-scoped cookie. No account or tenant session is created.
4. The user reads the saved snapshot as HTML and downloads A4 PDF or Markdown;
   both formats use the *same source, date, five pillars, evidence and actions*.
   An expired or consumed code requires a new request.

The service limits codes to 15 minutes, 5 attempts, 4 invitations per email/day
and 8 per source IP/hour. Email and IP are stored as keyed digests in a dedicated
SQLite file; it retains snapshots for at most seven days by lazy cleanup.
The active report session expires after one hour. These controls reduce abuse,
but cannot establish identity beyond control of the receiving email inbox.

## Versioned `report360` contract

`FreeReadResult.report360` has schema version `1`, method
`geo-v2-public-evidence`, scope `single_public_url`, `sourceUrl`, `observedAt`,
`httpStatus`, `pillars`, `actions`, `comparison: null`, `unmeasured`,
`geoV2` and `sourcePreview`. The root `geoV2` is the same consent-safe ledger.

For every pillar:

- `coverage` is `measured`, `partial` or `not_measured`.
- All five public pillar `score` fields return **`null`**. The v2 collector may
  calculate a score internally, but the public `geoV2` ledger redacts earned
  points, score ranges and numeric totals. It exposes the control ID, category,
  title, `status` (measured/unknown/N/A), `outcome` (pass/review/unknown/N/A),
  observed proof/reason and version, so readers can act without inferring a
  fabricated score. Owner consent is required before any future score release.
- The **deprecated** top-level `score`, `projectedScore`, `recoverablePoints`,
  `topFixes` and `opportunities` fields belong only to the legacy GEO v1 API
  contract for older clients. The landing, console report and new exports use
  v2 evidence instead; the response headline labels historical values `v1`.
- SEO provides the number of observed eligible HTML checks and issues needing
  review, not an unvalidated synthetic percentage or rank.
- Social exposes the observed number of outgoing/declared profile links; zero
  means *none on this page*, not *the business has no social presence*.
- AI and CRM metrics requiring private access remain `null`.

Every observed action includes a stable action ID, channel, priority, effort,
change risk, owner and a proof object with control ID, source URL, observation
timestamp, measured value/note and `html_observation`/`geo_v2_control` format.
Conditional next steps have `kind: next_step`, `proof: null`, `points: null`.
These are **not** marked as failed checks.

No traffic, positions, before/after gains, backlink counts, citations, customer
IDs, sales or competitive keyword gaps are inferred from the public page.
Model-generated claims and private provider results are excluded from this
anonymous report.

## Phased acceptance and remaining scope

| Phase | Acceptance criterion | Source state |
| --- | --- | --- |
| A · Truth contract | 42 approved v2 controls; incomplete vs failed vs N/A; owner-consent score redaction; five pillar objects; unknown metrics `null`; dated source proofs | **Implemented in this change; automated tests** |
| B · Bilingual experience | FR and EN parity, distinct pillar symbols, observed-HTML visual reconstruction, categorized 42-check ledger, filterable actions and direct connections to existing AI/CRM/Social modules | **Implemented in this change; automated UI tests**; human visual QA pending |
| C · PDF | Browser A4 print and server-side illustrated vector PDF plus Markdown with evidence ledger; no fake screenshot/improvement claim | **Implemented in this change**; actual cross-browser print-output visual QA pending |
| C2 · Email-code downloads | Optional SMTP invite, no code in URL, single-use/expiry/attempt limits, protected HTML/PDF/Markdown, FR/EN parity | **Implemented and unit/API-tested**; **SMTP credentials, live mail delivery and production browser QA pending** |
| D · Enriched evidence | First-party screenshot after DNS TXT or HTTPS file verification, isolated Playwright resources, redaction and retention limits | **Not implemented in public free flow** |
| E · Measured integrations | Consent-based GSC/GA4, AI-answer collection, CRM and Social imported from exact authorised tenant sources | **Links to existing private modules provided**; no provider data fetched anonymously, connectors and data provenance still require activation/verification |
| F · Follow-up | Persist plan and real before/after snapshot comparisons with matching method and URL | **Plan already persisted in the audit snapshot**; before/after comparison implemented at the audit API level (matching method, scope and URL, public outcomes only), UI display of the comparison pending |
| G · Release | CI, staging, security, responsive, FR/EN, accessibility and real Save as PDF validation | **Pending approval and deployment** |

### Security checks

- [x] Reuses existing public URL validation, DNS/IP/redirect SSRF guards,
  response limits, rate limiter and response cache; no new target fetch.
- [x] No HTML from customer pages is executed; text is escaped by DOM
  `textContent`, and source links accept HTTP(S) only.
- [x] Public/email snapshots redact GEO v2 earned points, numeric ranges and
  scores; review/pass outcomes are kept separate from unknown controls.
- [x] No API tokens, personal contacts or private telemetry added to JSON/export.
- [x] No automatic mutations; all sample data remain outside action extraction.
- [x] A separate SQLite-backed report-code boundary: one-time HMAC-peppered
  codes, attempts/rate quotas, report-scoped opaque session cookie, origin checks,
  no-store response headers and secret-free errors.
- [x] TLS-required SMTP, disabled by default when `REPORT_SMTP_*` settings are
  incomplete. No email is sent or simulated without valid mail credentials.
- [ ] Revalidate public API abuse/SSRF/WAF settings in staging, including
  concurrency and encoded redirect edge cases.
- [ ] Test a real SMTP sandbox message (delivery, bounce/failure, missing inbox,
  code expiry, resend throttling) using non-customer addresses. Never log codes.
- [ ] Confirm SQLite data erasure/backup retention, WAF rate limits, and mail
  provider credentials in a private deployment configuration.
- [ ] Check print privacy, cross-origin asset handling, keyboard navigation,
  screen-reader labels, color contrast and 320px/768px/1440px layouts.
- [ ] Test print rendering in Chrome/Firefox and verify at least one genuinely
  captured PDF page, page breaks, readable source URLs and page count.

### Deployment sequence and gates

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
6. Merge and deploy the Node server plus `/report/` static pages together on
   the existing OVH deployment; do not modify the Cloudflare Worker routes.
7. Configure `REPORT_SMTP_HOST`, `PORT`, `USER`, `PASSWORD`, `FROM`,
   `REPORT_ACCESS_ENABLED=true` and `REPORT_PUBLIC_ORIGIN` privately in the
   persistent OVH `.env.local`. `deploy.sh` generates the permanent HMAC secret
   when absent. Restart/recreate the app container; never print SMTP values.
8. Verify `/api/report-access/status` is enabled, request a report on a test
   page and non-customer inbox, enter the received code at `/report/`, open HTML,
   download and inspect PDF and `.md` in both languages. Verify wrong/expired
   codes, one-time use, cookie expiry and cross-origin rejection.
9. Monitor timeouts, throttled requests, 4xx/5xx, mail failures and report
   completion. To disable delivery, set `REPORT_ACCESS_ENABLED=false` and
   recreate the app; the original public report remains available.

## Known product limitations

Browser *Print / Save as PDF* remains usable without any email configuration.
The optional email-code feature adds a server-generated PDF and Markdown,
but the return link alone is insufficient for access, and the snapshot is not
a permanent share link. These exports do not generate images or capture the
target site. A verified-domain screenshot
pipeline, report history, real AI citations, CRM events, social inbound signals,
multi-page crawling and advanced competitive analysis are separate planned
features subject to authorization and evidence coverage.

### Verifying the three customer-reported gaps

1. **GEO v1 shown as v2:** submit a public test URL. The landing must show
   `GEO v2 · X/42 controls observed` and no legacy percentage. Open the report,
   confirm all 42 unique control IDs and the source-linked measured findings.
   Direct root API `score` must be documented/labeled as **deprecated v1**, not
   reused by the report. Assert no public `earned` or `scoreRange` fields.
2. **Technical snippets without illustration:** verify the visual search
   snippet/title/description and H1/H2 map from the *observed* HTML in FR/EN,
   HTML/PDF/Markdown. The reconstruction must always say **not a screenshot**.
   Real screenshots remain gated on DNS TXT / HTTPS verification and explicit
   owner permission for resource-limited Playwright.
3. **Missing AI/CRM/inbound social data:** verify the three action cards open
   the respective authenticated workspace modules; no artificial ranking,
   conversion, backlink count or absent=zero is shown. Confirm the connector
   scopes and tenant identity before any actual collection.

For this version, a good free report is one that **proves what it claims and
teaches the next action**. It must not reproduce an attractive but unsupported
global score, traffic impact forecast or after-correction score.
