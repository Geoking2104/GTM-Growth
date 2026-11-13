# Website customer journey

Updated: 14 November 2026. English-first source documentation; equivalent English and French interfaces.

## Purpose

Help a visitor choose a useful action before asking them to connect data. The website and console share a capability catalog so a function means the same thing during discovery, sign-in and daily work.

| Stage | Customer question | Useful output | Main functions |
| --- | --- | --- | --- |
| Diagnose | What needs attention? | Observed page findings and a first fix | Free analysis, GEO, technical audit, sitemap, performance |
| Understand | What do customers need? | Questions and evidence to prioritise content | Customer journey, products/pages, citability, search, keywords |
| Prepare | What can we improve next? | An editable draft or preview | Title/meta/outline generators, fix preview, article drafts, IndexNow readiness |
| Measure | What changed? | Period- and source-specific observations | Source setup, GSC, GA4, GTM, Bing, AI answers, competition, tracked questions/rankings, Shopify/PrestaShop commerce |
| Coordinate | How do we repeat this together? | Scoped priorities, evidence and reviewed work | Overview, local SEO, reports, calculators, operations, data assistant, optional Slack |

Review, approval, verification and remeasurement form the feedback loop. A generated draft, readiness score or preview does not prove business impact or publish a remote website.

## Entry and navigation

- The primary CTA accepts a public page URL without signup. Measured recommendations are ranked using the existing deterministic recommendation model, then link to the free customer-question explorer with the URL retained in session storage.
- The four starting paths (website owner, marketing team, agency, locations/head office) suggest existing tools. They neither persist business roles nor change permissions.
- The feature explorer filters by stage and searches all 31 functions. A visible reset recovers from empty results. Without JavaScript, all catalog content and links remain in the generated HTML.
- Each feature describes its benefit, output, prerequisites and availability. Workspace access does not imply connected data or paid entitlements.
- Customer console sections show immediate orientation while source data loads, expandable prerequisites and a next-action link. Existing recovery states remain intact.
- Feature links survive OIDC through a ten-minute, allowlisted destination in session storage. They do not select a tenant. Explicit tenant handoffs keep precedence and the existing server authorisation checks.
- Secondary examples, technical explanations and roadmap use native disclosure elements. Existing section anchors expand the relevant disclosure automatically. FR/EN pages share the same DOM structure and behaviour.

## Availability language

Public page analysis uses GEO v1; the 42-control GEO v2 and isolated rendering work remains separate. Content questions are hypotheses, not observed demand. Search and analytics data require authorised sources.

AI-answer imports do not require a paid API. Optional OpenAI, Claude, Mistral and Grok collections require API accounts and may incur provider charges. Gemini collection is disabled. Consumer chat subscriptions are not API access.

Apply Mode previews the supported robots change and cannot write a remote website. WordPress receives explicitly approved drafts. Supported GBP phone/website changes require separate approval and API readback. Slack requires a separate Eve installation, approved bindings and credentials.

Self-hosting stays free. Solo €39/month and Agency €149/month remain pilot hypotheses. Checkout and subscription entitlements are inactive; plan inquiries lead to the contact form.

## Maintenance and checks

- `site/journey-content.js`: shared bilingual stages, profiles, feature descriptions and destinations.
- `scripts/journey-markup.mjs`: static semantic journey/explorer/hero rendering.
- `site/journey.js`: progressive stage/profile/search/disclosure interaction; no remote calls.
- `site/console/feature-guide.js`: contextual console orientation.
- `site/landing/template.html` and locale dictionaries: shared editorial content. Run `npm run site:render` after changes.
- `npm run site:check`: translation completeness, generated-file parity, identical FR/EN structure, IDs, assets and anchors.
- Vitest covers destination completeness, filters/reset, bilingual recommendations, optional storage, unsafe/expired handoffs and all existing console navigation/tenant-isolation checks.
- The existing CI browser workflow checks desktop/mobile FR/EN, stage controls, search/reset, pilot CTAs, disclosures, forms and the public analysis. Screenshots are uploaded as CI artifacts. Real tenant analytics, external publication, payment and Slack activation are outside this presentation change.
