# GTM Growth

**Turn public-page evidence and authorised customer data into reviewed growth actions.**
GTM Growth is an open-source workspace for SEO/GEO, analytics, local presence,
social campaigns, commerce and observed CRM journeys. Use the bilingual console,
the CLI or a configured MCP client.

[Website](https://gtm.kayroslab.com/) · [Site français](https://gtm.kayroslab.com/fr/) ·
[Console EN](https://gtm.kayroslab.com/console/?lang=en#c-public-read) ·
[Console FR](https://gtm.kayroslab.com/console/?lang=fr#c-public-read)

## Explore the platform visually

The [English homepage](https://gtm.kayroslab.com/) and
[French homepage](https://gtm.kayroslab.com/fr/) now lead with a free page analysis
and six original interactive product illustrations: SEO/GEO, AI visibility, local
presence, Social, CRM journeys, and data-assisted decisions. Each scene links to
its real console destination. Figures are explicitly fictional demo data; the
showcase does not call providers or imply customer results.

The full 35-function catalogue, local planner, clickable CRM example and technical
guides remain available through progressive disclosure and direct links. Motion
can be paused, stops during keyboard interaction, and respects reduced-motion
preferences. Both locales share the same layout and behavior; no external video
player or third-party tracking is added.

Maintain the experience in `site/landing/template.html`, its EN/FR dictionaries,
`scripts/visual-home-markup.mjs`, and `site/visual-home.{css,js}`. Run
`pnpm run site:render` after content changes and `pnpm run site:check` before release.
The browser QA checks the six scenes, keyboard controls, reduced motion, mobile
layout and existing free-audit journey. Source changes require a separate verified
OVH deployment; Cloud merchant activation remains a separate operation.

## Console organised around customer decisions

The console now groups the existing tools into **Cockpit & Priorities**,
**Diagnosis & Opportunities**, **Studio & Approvals**, **Impact & Revenue** and
**Sources & Workspace**. All 30 specialist screens and existing deep links remain
available, including through tool search. The cockpit highlights the top three
recommendations from the existing audit; these are readiness opportunities, not
promised revenue. Unconfirmed data sources move to a closed **Enrich my evidence**
drawer with their benefit and actual connection state.

Four connected decision workflows now extend this foundation:

- **Unified inbox** (`#ops`): Social and GBP approvals plus durable WordPress,
  GTM, technical-preview and CRM-link proposals. Review the exact version, then
  explicitly approve and execute. Native independent-review rules remain intact.
  WordPress creates drafts; technical diffs remain manual previews.
- **Synchronized intent** (`#diagnose/intent`): a product-grounded planner beside
  GSC/Bing query observations and collected AI answers. Pin a retrieved proof to
  a stage/page, then open an editable brief with the confirmed client context.
  An editorial association is not an observed individual customer journey.
- **Complete GTM audit workflow** (`#diagnose/tracking`): page installation,
  GTM/GA4 setup, duplicate tags and static consent-default checks in one dated
  record. Unknown, warning, critical and passed states are separate; unavailable
  permissions and unpublished workspace changes cannot produce a passed audit.
  The latest scoped status also appears above GA4 and CRM views.
- **Member Portfolio** (`#portfolio`): bounded reads of each explicitly authorised
  workspace, its latest stored GEO audit, GTM status, pending reviews, alerts and
  report links. Client metrics/currencies are not summed. The navigation entry
  appears for multi-workspace accounts; an agency workspace defaults to it.

State is persisted in `data/decision.sqlite3` by default (`DECISION_PATH` override).
The deployment must preserve the existing `data` volume. No new service, paid
provider or frontend framework is required. Provider writes require an active
member administrator, fresh approval and a separate execution confirmation.
An ambiguous write is retained for manual destination verification, never retried
automatically. See [contracts, limits and acceptance](docs/journey/CONSOLE-DECISION-REFIT.md).

Deployment milestones, chart overlays and J+14/J+28 reminders remain outside this
release. A static GTM audit is not proof of runtime consent or causal revenue
attribution. Browser regression uses synthetic fixtures; live integrations still
require each client's configured credentials and permissions.

## Visual marketing campaigns — Campaign Studio

**Studio & Approvals → Campaign scenarios** turns stored analysis findings into
an editable cross-channel plan. Use the JointJS visual graph, channel schedule or
keyboard-accessible table to organise actions, dates, responsible roles,
dependencies, effort, costs, checklists and sourced KPIs. The cockpit links its
audit priorities directly to the studio; each action can retain the findings
that explain it.

Create a plan manually, use the local guided generator, or request a proposal
from a configured **OpenAI, Claude, Mistral or Grok** account. Review its changes
before applying them. Selected-step revisions preserve protected work. Draft
saves, conflict handling, undo/redo, comments, immutable versions, restoration,
duplication and JSON/CSV/Markdown/print exports support ongoing adaptation.

The same workflow is available in FR/EN, with the table as the mobile default.
State lives in `data/scenarios.sqlite3` by default (`SCENARIOS_PATH` override), on
the existing persistent data volume. JointJS Community is pinned and served
locally; no commercial editor package or CDN is required. AI requests require
explicit account use and have bounded call/token limits. Saving or accepting a
scenario only updates the plan; delivery continues through native module approvals.

See the [user workflow, permissions, limits and operating guide](docs/product/CAMPAIGN-STUDIO.md)
and [target specification](docs/product/CAMPAIGN-STUDIO-JOINTJS-SPEC-2026-11-20.md).
Run `pnpm run vendor:check` and `pnpm run qa:scenarios` alongside the normal
validation suite. Source delivery does not activate a production deployment.

## Consistent forms, sign-in and dashboard visuals

The public contact form uses labelled, 52px controls, Inter, rounded borders and
violet focus states in both languages. Keycloak's native sign-in and password
reset screens share the public website's rocket logo and violet/lavender identity;
authentication, password visibility controls and organisation flows remain native.
The Keycloak **My account** console now shares the same local rocket wordmark,
violet controls, Inter and light navigation. Console/referrer links preserve the
selected language and provide a return to GTM Growth. The release smoke verifies
actual public CSS, logo, favicon and font delivery after a theme update.

Every console horizontal navigation destination has a distinct semantic icon
within its section. Dashboards identify known providers with locally served logos,
show engine readiness as labelled progress bars, and retain the existing gauges
and analytics charts. Missing measurements leave gaps in charts; zero stays zero.
Disconnected sources show an explicit waiting state rather than fabricated data.
Provider marks identify sources, not connection status or endorsement.

CI checks all 30 specialist screens and the five business areas in FR/EN, and exercises the actual Keycloak 26.4
theme, password toggle and reset form at desktop/mobile widths. Screenshot artifacts
are available in **Brand · Keycloak 26.4 and dashboard FR/EN**. Deployment uses a
theme content digest to recreate Keycloak only when its theme changes, refreshing
the production theme cache. This can briefly interrupt new sign-ins; the database
is preserved. See the [theme runbook](deploy/kayroslab-vps/keycloak/themes/gtm-growth/README.md).

## Inspect public evidence and continue to GBP

The free read now displays the extracted title, declared canonical targets,
robots/googlebot meta directives and X-Robots-Tag, plus each tested sitemap URL
and its HTTP result. Source links and the observation time accompany the findings.
A timeout is unavailable evidence, not proof of absence; a 200 HTML response is
not counted as a sitemap. These checks do not confirm actual Google indexation.
Older responses without detailed evidence request a new analysis.

In the public console, **Open my local dashboard** brings the sign-in form into
view, focuses the email field and preserves the GBP destination through sign-in.
The same link on the homepage still opens the console. Workspace access and
Google authorisation remain required. Both paths are available in EN and FR.

## Choose your reading track

| Reader | Start here | Result |
| --- | --- | --- |
| Marketing, growth, agency, head office | [Track 1 — Marketing](docs/marketing/README.md) | Customer needs, useful outputs, handoffs, measurement and honest product claims |
| Developer, integrator, operator | [Track 2 — Technical](docs/technical/README.md) | Runtime, code map, access boundaries, connector setup, tests and operations |
| Both teams | [Shared customer journey](docs/journey/README.md) | The same five stages, responsibilities and acceptance criteria |
| Looking for a specific guide | [Documentation hub](docs/README.md) | Current guides, detailed contracts, operations and historical material |

Public reading guides: [Marketing](https://gtm.kayroslab.com/guides/marketing/) ·
[Technical](https://gtm.kayroslab.com/guides/technical/) (each available in EN/FR).

The documentation is English-first. Both tracks use the same stages as the FR/EN
website. A product workflow, a buyer-awareness hypothesis and an observed contact
timeline have different evidence: [how they fit together](docs/journey/README.md#three-journeys-three-kinds-of-evidence).

## The customer journey

| Stage | Customer outcome | First destination |
| --- | --- | --- |
| **1. Diagnose** | Identify a concrete issue on one public page | Free read, GEO, technical audit, performance |
| **2. Understand** | Confirm the offer, audience and questions worth investigating | Products & pages, Customer journey, Search Console |
| **3. Prepare** | Review a draft, correction preview or social campaign | Generators, GEO fixes, Social, content operations |
| **4. Measure** | Inspect sourced results and documented contact events | GA4/GSC, AI answers, Commerce, CRM timeline |
| **5. Coordinate** | Assign the next action and repeat with evidence | Overview, local network, reports, data assistant |

Start without signup by reading a public page. Connect only the sources needed
for the next decision. Review findings before external changes, then remeasure
using the same scope and period. The [journey blueprint](docs/journey/README.md)
contains the visual feedback loop and the handoff contract for each stage.

## What is available

The [capability register](docs/journey/CAPABILITIES.md) is the shared reference for
implemented behavior, configuration requirements, incomplete work and release evidence.

- **Public entry:** single-page SEO evidence and the approved **GEO v2 42-control ledger** (observed, unknown or justified N/A), five-pillar 360° summary (SEO, GEO, AI, CRM and Social), source-linked corrective guides, a clearly labelled *HTML-based visual reconstruction* and bilingual A4 print/Save as PDF. The public report does **not** publish incomplete or non-consented GEO scores; the old top-level GEO v1 API metrics are retained as explicitly deprecated compatibility fields. An **optional email-code report delivery** saves that exact public snapshot, requires email + a six-digit single-use code on `/report/`, then unlocks HTML, illustrated vector A4 PDF and Markdown downloads. It requires separately configured TLS SMTP on Node/OVH, disabled by default and not available in the stateless Worker. Authentic Playwright screenshots require a verified domain and owner approval. AI citations, CRM conversions, inbound social links and before/after comparisons are **not** inferred; authenticated module handoffs show how to connect real sources. See the [free report contract and rollout gates](docs/product/FREE-REPORT-360.md).
- **Connected workspace:** tenant-scoped analytics, AI-answer imports and optional API collection, local SEO, Shopify/PrestaShop, Social and native/client-plugin CRM. Each source has separate activation requirements.
- **Reviewed action:** generators and Apply Mode previews; WordPress drafts, supervised GBP phone/website changes and Social publication have different approval contracts.
- **Optional services:** Node-RED for local jobs, ZenML/Postiz for Social, Eve for approved Slack channels. Installing the core does not activate these services.
- **Still incomplete:** public live Playwright/GEO v2 execution, Apply Mode production writers, named vendor CRM adapters, autonomous outreach and live Mollie merchant activation.

Readiness is not measured AI visibility. A question hypothesis is not observed
demand. Referrer/UTM attribution is not causal revenue proof. The
[measurement guide](docs/marketing/MEASUREMENT.md) explains the current limitations,
including commerce aggregation and unknown signals.

## Personal agents: PAP 1.0 read pilot

The repository now includes an opt-in, read-only Personal Agent Protocol facade for
workspace configuration, Search Console, GA4, imported AI visibility and recorded
operations. Each authorization binds one user, agent, workspace and selected sources;
current Keycloak access and durable revocation are checked before returning data.
**Act → Connected agents** provides consent and disconnect in English and French.

The pilot is disabled by default. Production activation, deployed Keycloak qualification
and real-agent compatibility remain gated on staging acceptance. No writes, general
MCP access, CRM identity linking or paid model account is introduced.

See the [customer and technical guide](docs/PAP.md),
[authorization decision](docs/architecture/PAP-AUTHORIZATION.md),
[operator runbook](docs/technical/PAP-RUNBOOK.md) and
[functional/technical specification](docs/PAP-SPECIFICATION.md).

## Run locally

Node.js **24 or newer** and pnpm **11.25.0**. The **0.23.0** CLI runs public audits without Google credentials.

The [reliable audit pilot](docs/technical/AUDIT-PIPELINE.md) adds PostgreSQL-backed
requests, dedicated BullMQ/Redis workers, resumable EN/FR browser progress and
server-side reuse of the completed snapshot for email-gated HTML/PDF/Markdown.
Admission and invitation limits are checked before work. Protected metrics and
dependency readiness support capacity measurement. OVH Compose provides the new
services; generic installations opt in. Keep one API replica while the remaining
module stores use SQLite/files. Source validation does not certify live deployment,
SMTP delivery or Mollie activation.

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd GTM-Growth
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm run build
node dist/bin.js doctor
node dist/bin.js geo-audit --url https://example.com
```

See the [upgrade guide](docs/UPGRADING.md) for the existing-installation migration,
package release checklist and single-command usage after publication.

Use `pnpm run start:stdio` for a local MCP client. For HTTP development, configure
access first and use `HOST=127.0.0.1 pnpm run start:http`. Console SSO and connected
Google tools need their own configuration; see [technical setup](docs/technical/README.md#local-setup)
and the [integration map](docs/technical/INTEGRATION-MAP.md). Shared MCP credentials
are an operator trust boundary, not end-user tenant isolation.

## Delivery and offer

Repository review: **15 November 2026 (Asia/Shanghai)**, source baseline
[`353e658`](https://github.com/Geoking2104/GTM-Growth/commit/353e65878f8142627430549968ecce31d43cc9a2).
[CI for that revision passed](https://github.com/Geoking2104/GTM-Growth/actions/runs/43620735464).
Source availability does not certify a production release or a configured customer
connection. See the [dated release evidence](docs/journey/CAPABILITIES.md#release-evidence)
before making a live-capability claim.

Self-hosted software is **Apache-2.0**. Solo **€39/month** and Agency **€149/month**
are pilot pricing hypotheses; checkout and subscription entitlements are inactive.
Optional hosting and model/provider use can incur costs.

## Maintain and contribute

[Contribution and documentation rules](CONTRIBUTING.md) ·
[Repository audit and integration priorities](docs/maintenance/REPOSITORY-AUDIT.md) ·
[Changelog](CHANGELOG.md) · [License](LICENSE)

Built by [Geoking2104](https://github.com/Geoking2104) / **KayrosLab**.

<!-- Preserve the former README track anchors for existing links. -->
<a id="track-1--marketing--what-gtm-growth-does-for-you"></a>
Track 1 now lives in the [Marketing guide](docs/marketing/README.md).

<a id="track-2--technical--how-it-works-and-how-to-run-it"></a>
Track 2 now lives in the [Technical guide](docs/technical/README.md).

## Cloud subscriptions — Mollie

The console now includes an English/French **Cloud subscription** view (`/console/#billing`):
explicit monthly consent, payment status, usage, cancellation and next-renewal plan changes.
Self-hosted GTM Growth remains free. Solo €39 and Agency €149 are pilot hypotheses;
final gross prices, commercial quotas and subscription terms must be configured before launch.

Only workspaces listed in `BILLING_CLOUD_TENANTS` are subject to subscription controls.
Verified Mollie payments unlock operations; expiry or refund review blocks new cloud work
while existing reports and selected exports remain available. A shared SQLite ledger
atomically enforces configured monthly operation and domain limits across the console,
PAP, Slack bridge, tenant MCP, CRM plugins and worker endpoints.

**Default: billing disabled; no live merchant connection is claimed.** A platform administrator
can use the read-only connection check to verify the dedicated GTM profile and recurring
methods. This does not replace a real Mollie test-mode payment and webhook acceptance run.
See [implementation, access policy and activation checklist](docs/billing/MOLLIE-SUBSCRIPTIONS-IMPLEMENTATION.md).
