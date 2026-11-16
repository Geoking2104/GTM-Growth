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
`npm run site:render` after content changes and `npm run site:check` before release.
The browser QA checks the six scenes, keyboard controls, reduced motion, mobile
layout and existing free-audit journey. Source changes require a separate verified
OVH deployment; Cloud merchant activation remains a separate operation.

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

- **Public entry:** single-page GEO v1/SEO evidence and product-grounded question hypotheses; no Google or model credentials required.
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

Node.js **20 or newer**; package version **0.22.0**. Public audits work without Google credentials.

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd GTM-Growth
npm ci
cp .env.example .env
npm run build
npm run cli -- geo-audit --url https://example.com
```

Use `npm run start:stdio` for a local MCP client. For HTTP development, configure
access first and use `HOST=127.0.0.1 npm run start:http`. Console SSO and connected
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
