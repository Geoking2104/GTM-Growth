# Customer Journey — product-grounded question planner

[Documentation hub](../README.md) · [Shared journey](../journey/README.md) · [Capability status](../journey/CAPABILITIES.md)

Current source contract, reviewed 15 November 2026 against `353e658`.
The earlier heading-based L1 planner has been superseded by the shared
`JOURNEY_VERSION = "2.0.0"` model. This is an editorial planner, separate from
[observed CRM contact timelines](CRM-CUSTOMER-JOURNEY-SPEC.md).
Production evidence is maintained in the capability register, not inferred here.

## Input and evidence contract

1. Read a specific public product/service page. The public free read and the
   authenticated journey route use the same structured context extraction.
2. Select an actual Product/Service identified in JSON-LD or product microdata.
   A title, H1/H2, hostname or featured heading alone is not a product or brand.
3. Confirm the brand, category, target buyer and customer need. Changing relevant
   context invalidates the earlier proposals; incomplete context has explicit next steps.
4. Optionally read up to two competitor product pages, select an identified offer
   from each and explicitly confirm comparability. No competitor, price, share or
   product advantage is invented.
5. Review the proposed questions and their sources. The five stages remain Unaware,
   Problem aware, Solution aware, Product aware and Most aware. Empty unsupported
   stages remain empty; an observed delivery/return link does not verify its terms.
6. Copy the plan, or explicitly save a selected question to the existing tenant
   prompt pool as an administrator. Saving is not a provider collection or publication.

## Boundaries

| Surface | Behavior |
| --- | --- |
| Public console | One-page evidence and grounded hypotheses without account/model key |
| Authenticated `POST /api/console/journey/read` | Primary URL and final redirect must belong to the selected active tenant |
| Competitor read | Public-only evidence; no rival private analytics or customer credentials |
| Question model | Deterministic proposals using read facts and explicit user context; no paid LLM call |
| Eve `get_customer_journey` | Same extraction/model through the configured signed tenant bridge; Slack activation remains separate |
| Tracked prompts | Source-labelled admin save; actual AI observation/import is a separate deliberate step |

Questions are hypotheses, not observed searches, demand, positions, citations or
conversion forecasts. Content coverage remains unverified. Public GEO remains v1;
this planner does not enable the 42-control GEO v2 or a live Playwright crawler.
No automatic publishing, score disclosure, outreach or Mollie entitlement is added.

## Source and validation map

| Responsibility | Source | Checks |
| --- | --- | --- |
| Extract products/services, facts and links | [Context extractor](../../src/freeread/journey-context.ts) | [Customer journey](../../tests/customer-journey.test.ts), [free read](../../tests/free-read.test.ts) |
| Ground proposals and missing-state behavior | [Shared model](../../site/console/customer-journey-model.js) | [Journey UI](../../tests/customer-journey-ui.test.ts) |
| Enforce page scope | [Journey API](../../src/console/journey.ts) | [Customer journey](../../tests/customer-journey.test.ts) |
| Public/site handoff | [Shared catalog](../../site/journey-content.js) | [Website journey](../../tests/website-journey.test.ts), FR/EN browser QA |
| Optional Slack bridge | [Bridge](../../src/data-agent/bridge.ts) | [Data agent](../../tests/data-agent.test.ts), separate Eve checks |

## Methodology and remaining work

The original five-awareness-stage framing was adapted from
[Illyism customer-journey](https://github.com/Illyism/seo-skills/blob/main/marketing/customer-journey/SKILL.md),
with action-planning inspiration from
[seo-autopilot](https://github.com/Illyism/seo-skills/blob/main/seo/seo-autopilot/SKILL.md)
and [RomeoSEO](https://github.com/RomeoSEO/seo-skills).
These are methodology references, not executable third-party agents on the VPS.

Versioned multi-page journeys, a unified owner-assigned 30/60/90-day backlog,
durable SEO Autopilot scheduling and contractual Cloud quotas remain future work.
The current prompt, content and CRM modules should be integrated through explicit
source links and permissions, not inferred identity or automatic publication.
