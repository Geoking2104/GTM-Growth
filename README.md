# GTM Growth

**Turn public-page evidence and authorised customer data into reviewed growth actions.**
GTM Growth is an open-source growth workspace for SEO, GEO (generative-engine
optimisation) and AI visibility, local presence, social campaigns, commerce and
observed CRM journeys. Start from a free single-page analysis, grow into a
connected bilingual workspace, and keep every external change behind explicit
human approval.

[Website](https://gtm.kayroslab.com/) · [Site français](https://gtm.kayroslab.com/fr/) ·
[Console EN](https://gtm.kayroslab.com/console/?lang=en#c-public-read) ·
[Console FR](https://gtm.kayroslab.com/console/?lang=fr#c-public-read) ·
[GitHub](https://github.com/Geoking2104/GTM-Growth)

## At a glance

| | |
| --- | --- |
| License | Open source, **Apache-2.0**; self-hosting is free and unlimited |
| Languages | Bilingual **FR/EN** console, public site, reports and guides |
| Interfaces | Web console, public CLI (`gtm-growth`), MCP server with **100 documented tool contracts** |
| Journey | One 5-stage loop: **Diagnose → Understand → Prepare → Measure → Coordinate** |
| Public audit | Free single-page read plus the **GEO v2 42-control evidence ledger** and a five-pillar 360° report |
| Catalogue | **35 documented functions** with outputs, prerequisites and validation status |
| Evidence rule | Every figure carries its source and date; unknown stays unknown, never zero |
| Data custody | Self-hosted on your infrastructure; no third-party analytics, no external CDN scripts |
| Release | Package **0.23.0**, Node.js 24+, pnpm 11.25.0, CI-validated |

## Why teams choose it

- **One workspace instead of a tool stack.** Acquisition, content, local,
  social and customer evidence live in the same place, speak the same evidence
  vocabulary and feed the same next-action list.
- **Evidence before opinion.** Every answer names its provenance
  (`partner-api`, `imported`, `collected`, `tenant-selection`), its observation
  date and its scope. Missing data stays explicitly unknown; a readiness score
  is never presented as AI visibility or revenue.
- **Human approval everywhere it matters.** External writes (WordPress
  publication, GBP changes, robots/meta files, CRM, social) always keep their
  confirmation. Only a small governed catalog of low-risk actions
  (IndexNow submission, local draft generation, dispatch of an already-due
  report follow-up) is eligible for reviewed one-click execution, with an
  audit trail per gesture.
- **Fail-closed options.** Partner bridges, scheduled collections, agent
  writes and billing all ship **off by default** and activate only through
  explicit operator configuration and credentials.
- **Yours to run and inspect.** Apache-2.0 code, local-first deployment
  materials for an OVH VPS, GDPR posture with a per-module data map and a
  customer DPA template ready for procurement review (`docs/trust/`).

## What GTM Growth does

The five stages below are the product's spine; every module documents its
stage, output and prerequisites in the [capability register](docs/journey/CAPABILITIES.md).

| Stage | What you get | Modules |
| --- | --- | --- |
| **1. Diagnose** | Free public page read (title, canonicals, robots directives, sitemaps, sources), GEO v2 42-control ledger, five-pillar 360° report (SEO, GEO, AI, CRM, Social), technical and performance audits, optional email-code delivery of the exact public snapshot (HTML, A4 PDF, Markdown) | Free read, GEO v1/v2, 360° report, technical audit, report access |
| **2. Understand** | Keyword volumes, Google SERP positions and a 7×7 GBP local rank grid through the operator's DataForSEO-compatible bridge; domain backlink overview, link gap vs named competitors and disavow export; per-crawler crawl coverage from your server logs; buyer questions with confirmed product context | Market data, backlinks, AI-crawler analytics, customer journey context |
| **3. Prepare** | Corrective drafts and Apply Mode previews (robots/meta policy, llms.txt skeleton), answer-grounded content scoring and local AEO drafts, visual cross-channel campaign planning, social campaign preparation with product facts | Generators, Apply Mode previews, AEO writer, Campaign Studio, social |
| **4. Measure** | GA4, Search Console and GTM views; AI-answer imports (Meteoria, Peec AI, Qwairy, Profound) and optional API collection (OpenAI, Claude, Mistral, Grok); share-of-voice and citation-gap views; matched-cohort period comparisons; commerce sync (Shopify, PrestaShop) and CRM timelines; durable scheduled collections behind an opt-in flag | Analytics, AI visibility, visibility jobs, commerce, CRM |
| **5. Coordinate** | A unified cross-module inbox for approvals and proposals, product-grounded intent planning, one-dated-record GTM audit, member portfolio across workspaces, reports and a source-citing data assistant | Decision workflows, portfolio, reports, data agent |

Any third party can verify each claim: the
[capability register](docs/journey/CAPABILITIES.md) separates implemented
behavior, configuration requirements, incomplete work and release evidence.

## Interfaces

- **Bilingual console** (`/console/?lang=fr|en`): five business areas, 30+
  specialist screens, an on-entry GTM coach that proposes the next action from
  your actual sources, contextual **?** explanations for every figure
  (origin, relationships, consequences, freshness).
- **Public CLI** (`gtm-growth`): audits and GEO checks from the command line,
  `gtm-growth doctor` for configuration health.
- **MCP server**: the same engine exposed to MCP clients through
  [100 stable tool contracts](docs/mcp/TOOLS.md) with read/write
  classification, `confirm` gates and env flags on every write; the reference
  is generated from the tool sources, so it cannot drift.
- **Personal agents (PAP)**: an opt-in, read-only agent facade with
  per-user, per-workspace authorisation sources, durable revocation, plus a
  propose-only operations surface behind `PAP_OPERATIONS_ENABLED` (off by
  default). Agents can propose governed catalog operations; only the tenant
  administrator approves and executes.

## Honesty and evidence rules

GTM Growth refuses the industry's habitual shortcuts. These rules are enforced
in the code and asserted in CI:

- `null` never becomes zero and unknown is displayed as such.
- No score is invented from missing data; shared or non-consented evidence is
  not published on the public report.
- Readiness (a technical preparation score) is not measured AI visibility; a
  question hypothesis is not observed demand; referrer attribution is not
  causal revenue proof. The
  [measurement guide](docs/marketing/MEASUREMENT.md) states the current limits.
- Partner calls carry their cost and observation date on every answer.
- Talk to the [trust pack](docs/trust/README.md) for the GDPR posture with a
  per-module data map and retention rules, the customer DPA template, the OVH
  hosting page, the security page with responsible disclosure and the
  status-page policy (measured availability only).

## Run locally

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd GTM-Growth
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm run build
node dist/cli.js doctor
node dist/cli.js geo-audit --url https://example.com
```

Node.js 24 or newer and pnpm 11.25.0. The 0.23.0 CLI runs public audits
without Google credentials. For a local MCP client use `pnpm run start:stdio`;
for HTTP development configure access first and use
`HOST=127.0.0.1 pnpm run start:http`. See
[technical setup](docs/technical/README.md#local-setup) and the
[integration map](docs/technical/INTEGRATION-MAP.md).

## Deployment and optional services

The repository ships a complete, tested OVH VPS deployment kit
([deploy/kayroslab-vps](deploy/kayroslab-vps/README.md)): Compose services,
Keycloak 26.4 with a matching console theme, a strict-CSP site and console,
and an isolated GEO renderer with a fail-closed egress gateway. Optional
services (Node-RED local jobs, ZenML/Postiz social worker, Eve Slack agent,
PostgreSQL/Redis visibility jobs, Mollie billing) install only if you enable
them; installing the core activates none of them. Publishing to production
remains a verified operator act, documented step by step.

## Choose your reading track

| Reader | Start here | Result |
| --- | --- | --- |
| Marketing, growth, agency, head office | [Track 1, Marketing](docs/marketing/README.md) | Customer needs, useful outputs, handoffs, measurement and honest product claims |
| Developer, integrator, operator | [Track 2, Technical](docs/technical/README.md) | Runtime, code map, access boundaries, connector setup, tests and operations |
| Both teams | [Shared customer journey](docs/journey/README.md) | The same five stages, responsibilities and acceptance criteria |
| Looking for a specific guide | [Documentation hub](docs/README.md) | Current guides, detailed contracts, operations and historical material |

Public reading guides: [Marketing](https://gtm.kayroslab.com/guides/marketing/) ·
[Technical](https://gtm.kayroslab.com/guides/technical/) (each available in EN/FR).
The documentation is English-first; the product and the public site are fully
bilingual. A product workflow, a buyer-awareness hypothesis and an observed
contact timeline carry different kinds of evidence:
[how they fit together](docs/journey/README.md#three-journeys-three-kinds-of-evidence).

## The customer journey

| Stage | Customer outcome | First destination |
| --- | --- | --- |
| **1. Diagnose** | Identify a concrete issue on one public page | Free read, GEO, technical audit, performance |
| **2. Understand** | Confirm the offer, audience and questions worth investigating | Products and pages, customer journey, Search Console |
| **3. Prepare** | Review a draft, correction preview or social campaign | Generators, GEO fixes, social, content operations |
| **4. Measure** | Inspect sourced results and documented contact events | GA4/GSC, AI answers, commerce, CRM timeline |
| **5. Coordinate** | Assign the next action and repeat with evidence | Overview, local network, reports, data assistant |

Start without signup by reading a public page. Connect only the sources needed
for the next decision. Review findings before external changes, then remeasure
using the same scope and period. The [journey blueprint](docs/journey/README.md)
contains the visual feedback loop and the handoff contract for each stage.

## Status, evidence and honest limits

The [capability register](docs/journey/CAPABILITIES.md) is the single source
of truth for what is implemented, what ships behind a flag and what is not
built. In short:

- **Implemented and CI-validated**: everything listed above, including the
  pre-approved action catalog with its governed ledger and bilingual console
  panel, the answer-grounded AEO writer, partner market data with metered
  costs, backlink intelligence, AI-crawler analytics, the trust documentation
  pack and the billing usage ledger.
- **Ships off by default** (fail-closed, operator-activated): partner bridge
  (`MARKET_DATA_ENABLED`), agent operation proposals
  (`PAP_OPERATIONS_ENABLED`), durable scheduled collections
  (`VISIBILITY_JOBS_ENABLED`, requires PostgreSQL and Redis), scheduled report
  follow-ups (`REPORT_FOLLOW_UPS_ENABLED`), Apply Mode writes, cloud billing
  (Solo and Agency plans; no live Mollie merchant connection is claimed).
- **Not yet implemented / outside the code**: live deployment of the public
  GEO v2 renderer service, production Apply Mode writers deployment, named
  vendor CRM adapters, autonomous outreach.

Never infer a live capability from source availability: check the
[dated release evidence](docs/journey/CAPABILITIES.md#release-evidence) before
making a live-capability claim.

## Offer and pricing

Self-hosted GTM Growth is **free** under Apache-2.0: run it, inspect it, adapt
it. The optional KayrosLAB-hosted cloud pilot proposes **Solo €39/month** and
**Agency €149/month** as pilot hypotheses; checkout, quotas, VAT treatment
(HT/TTC) and terms are configured and announced before any activation, and
partner data costs are metered transparently but never re-billed to tenants.
Optional hosting and model/provider usage can incur costs. The commercial
positioning and claims per audience are maintained in the
[marketing track](docs/marketing/README.md).

## Marketing site and how to maintain it

The [English homepage](https://gtm.kayroslab.com/) and
[French homepage](https://gtm.kayroslab.com/fr/) lead with a free page
analysis, six original interactive product illustrations (SEO/GEO, AI
visibility, local presence, social, CRM journeys, data-assisted decisions)
and a trust band covering the open-source, evidence-first, bilingual and
compliance posture. Figures on the marketing pages are explicitly fictional
demo data; no customer result is implied.

The site is generated from one shared layout: edit
`site/landing/template.html`, the EN/FR dictionaries (`site/landing/{en,fr}.json`),
`scripts/visual-home-markup.mjs` and `site/visual-home.{css,js}`; then run
`pnpm run site:render` and `pnpm run site:check` before release. The CI
browser QA exercises the six scenes, keyboard controls, reduced motion,
mobile layout, the pricing contract and the free-audit journey in both
languages.

## Maintain and contribute

[Contribution and documentation rules](CONTRIBUTING.md) ·
[Repository audit and integration priorities](docs/maintenance/REPOSITORY-AUDIT.md) ·
[Changelog](CHANGELOG.md) · [License](LICENSE)

Built by [Geoking2104](https://github.com/Geoking2104) / **KayrosLAB**.

<!-- Preserve the former README track anchors for existing links. -->
<a id="track-1--marketing--what-gtm-growth-does-for-you"></a>
Track 1 now lives in the [Marketing guide](docs/marketing/README.md).

<a id="track-2--technical--how-it-works-and-how-to-run-it"></a>
Track 2 now lives in the [Technical guide](docs/technical/README.md).
