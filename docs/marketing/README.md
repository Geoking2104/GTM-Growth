# Track 1 — Marketing

The console now uses five business areas: Cockpit & Priorities, Diagnosis &
Opportunities, Studio & Approvals, Impact & Revenue, and Sources & Workspace.
The [refit scope](../journey/CONSOLE-DECISION-REFIT.md) separates the delivered
shared inbox, synchronized product intent, dated GTM audit and member Portfolio
from the still-planned impact timeline and reminders. Open Studio to review
proposals, Diagnosis → Demand & Intent to connect evidence to a stage, and
Diagnosis → Tracking reliability to assess measurement coverage.

[Documentation hub](../README.md) · [Shared journey](../journey/README.md) · [Technical counterpart](../technical/README.md)

GTM Growth helps a team move from a finding to a reviewed action and a sourced
follow-up. Start with one page and one business decision. Add sources as the
question requires them; a connected workspace is not a promise of complete data.

## Who it serves

| User | First useful result | Typical next connection | Responsibility |
| --- | --- | --- | --- |
| Website owner | A visible page issue and a first fix | GSC or GA4 | Confirm business context and authorise the site scope |
| Marketing team | Reviewed buyer questions and content priorities | GSC, saved AI answers, optional Social accounts | Keep hypotheses, measurements and drafts distinguishable |
| Agency | Repeatable evidence review for each client | Separate tenant sources | Maintain client isolation and name the reviewer |
| Head office / local manager | Location registry, evidence coverage and scoped actions | Approved GBP access | Grant exact locations; use independent review for supported writes |
| Commerce / customer team | Store observations and a sourced contact timeline | Shopify/PrestaShop and optional client CRM adapter | Confirm identity proofs and source coverage |

These are usage profiles, not access roles or subscription tiers.

## 1. Diagnose — earn the next step with evidence

Open [the public read](https://gtm.kayroslab.com/console/?lang=en#c-public-read), enter
one public URL and inspect the source-backed recommendations. The proposed
five-pillar report explains SEO, GEO, AI engines, CRM and Social separately;
source-linked action cards include a non-technical tutorial, owner, effort,
risk and the same FR/EN A4 print view. The report schema and presentation are
merged into `main`; production visibility still requires a live smoke test.
The optional email invitation sends a one-time six-digit code, then returns
the visitor to `/report/` to enter email and code, read the saved HTML report
and download PDF/Markdown. Email delivery is **not active** until the OVH SMTP
runbook is completed. Review the [acceptance plan](../product/FREE-REPORT-360.md). GEO v1 describes
technical readiness. Citability is a heuristic for editing. Neither proves that
an AI engine cited the business. Any sample analytics in a public response are
examples, not that website's private traffic.

**Deliverable:** one issue, its evidence, the affected page and a proposed owner.
**Next step:** use a specific product/service page to understand the offer.
**Technical handoff:** [public fetch and evidence](../technical/INTEGRATION-MAP.md#integration-contracts).

## 2. Understand — ground the buyer questions

Select a Product/Service extracted from actual structured data or microdata.
Confirm the brand, category, target buyer and need. The planner then proposes
questions across five awareness stages; unsupported stages may be empty. To
compare offers, select up to two actual competitor products and confirm that
they are comparable. A heading or hostname alone is insufficient.

Use Search Console to investigate observed queries and pages. Keep these records
separate from the proposed questions. An administrator can save a selected
question to tracked prompts; that action does not run a model or measure a mention.

**Deliverable:** reviewed questions with source references and an explicit content
priority. **Next step:** prepare the smallest useful improvement.
[Detailed behavior](../product/CUSTOMER-JOURNEY-INTEGRATION.md).

## 3. Prepare — choose the action and its reviewer

| Work | Reviewable result | Actual execution boundary |
| --- | --- | --- |
| Titles, metadata, outlines, schema or robots | Editable draft/file | Generation does not install it on the website |
| Apply Mode | Supported robots.txt diff and evidence digest | Preview only; remote execution and rollback are not wired |
| Article operations | Brief, draft and quality gates | Approved WordPress creation produces a draft, not a published article |
| Social | Product-based variants, calendar, approvals | A separate administrator reviews the exact content/accounts/time; explicit schedule confirmation and configured worker/provider are required |
| Local profile | Bounded phone or website change | Independent administrator approval, execution and official API readback |
| IndexNow | Key verification and changed-URL submission | Explicit submission; a receipt does not prove indexing |

Social results preserve provider/source/date distinctions. Creator vetting is
human and evidence-based. Outreach is an approved draft sent manually outside
GTM, with a receipt recorded afterward. Do not describe it as an autonomous
outreach sequence. [Social implementation contract](../product/SOCIAL-TOOLKIT-SPEC-REVIEW.md).

**Deliverable:** exact reviewed change, target, owner and remaining prerequisites.
**Next step:** execute only through the supported path and record what happened.

## 4. Measure — inspect observations, not a promise of ROI

| Question | Appropriate evidence | Interpretation boundary |
| --- | --- | --- |
| Are search clicks changing? | GSC property, dimensions, dates | Compare like-for-like periods; clicks are not people |
| Are visitors taking the intended action? | GA4 sessions/key events with configured tracking | Event configuration and coverage determine what can be concluded |
| Does an AI response mention the brand? | Dated saved answers or an explicit supported API run | API observations are not all consumer chat sessions or market share |
| Which order has a channel signal? | Store order, UTM/referrer, attribution method/confidence | Correlation only; current aggregate limitations must be checked |
| What happened for this contact? | Exact scoped identity link plus sourced CRM events | No automatic identity from GA4, Postiz, campaigns or IP addresses |
| Is a local correction accepted? | Official GBP API readback | Acceptance is not proof of public Maps visibility or ranking |

The CRM can be used natively or through a server plugin for a client's CRM.
It provides contacts, identity links, manual activities and clickable timelines;
it is not a full sales-pipeline CRM. Live web/social events require a real
instrumented source. Shopify/PrestaShop observations can feed the timeline through
the existing commerce bridge after CRM is enabled. Missing identities stay unlinked.

**Deliverable:** a sourced comparison, its coverage, limitations and decision.
Use the [measurement contract](MEASUREMENT.md) before publishing business claims.

## 5. Coordinate — make the next review repeatable

Use the overview, scoped location workflows, reports and guided data assistant
to assign priorities. The assistant can retain a user's role, goal, audience,
lifecycle stage and optional 28-day target. These preferences do not grant access.
Console guided answers do not require a model key. The optional Eve Slack service
requires a separate installation, exact channel/user bindings and model credentials.

A practical review agenda is: inspect source availability, compare a stable period,
select three priorities, name an owner and reviewer, and record the next checkpoint.
This is an operating recommendation, not an implemented automatic 30/60/90-day planner.

## Offer and claims

- Self-hosted software remains free under Apache-2.0. Operators still supply hosting and any optional provider access.
- Solo €39/month and Agency €149/month are pilot hypotheses. Mollie checkout, configured quotas and subscription controls are implemented but disabled by default. Live payments remain pending merchant setup, approved gross prices, quota values, terms and real sandbox acceptance. See the [billing rollout guide](../billing/MOLLIE-SUBSCRIPTIONS-IMPLEMENTATION.md).
- Public analysis, manual answer imports and guided console answers need no paid model API. Optional API collections and Slack may incur costs.
- GEO v2, live isolated rendering, Apply Mode writers and named vendor CRM connectors must not be sold as activated features.

Use the [capability register](../journey/CAPABILITIES.md) for availability and the
[operations guide](../technical/OPERATIONS.md) for release evidence. A merged feature,
a successful deployment and a working customer connection are separate facts.

## Example customer engagement

For an illustrative store, first inspect a product page. Confirm the buyer and
need, review two useful questions, then inspect GSC evidence or a sourced answer
sample. Prepare one content change and have the appropriate owner review it.
After implementation, compare the same query/page scope over an agreed period.
If a known contact has an authorised exact store identity, review their documented
order and manual follow-up in CRM. Missing touchpoints remain missing.

The example contains no claimed customer result or revenue uplift. Agree targets
after a baseline exists. [Technical acceptance sequence](../technical/OPERATIONS.md#qualification-by-customer-handoff).

## PAP 1.0 read pilot

[Personal agent journey and customer benefits](../PAP.md). Implemented behind a disabled feature flag; production and real-agent interoperability require staging evidence.
