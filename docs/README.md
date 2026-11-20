# Documentation hub

[Project README](../README.md) · [Shared journey](journey/README.md) · [Capability register](journey/CAPABILITIES.md) · [Upgrade guide](UPGRADING.md)

Read from customer decision to implementation. Marketing and technical guides use
the same five stages: **Diagnose → Understand → Prepare → Measure → Coordinate**.
English is the reference language; existing French specifications remain available.

## Start by role

| Reading path | Recommended order |
| --- | --- |
| Marketing / growth / client lead | [Marketing](marketing/README.md) → [shared journey](journey/README.md) → [measurement](marketing/MEASUREMENT.md) → [capabilities](journey/CAPABILITIES.md) |
| Developer / integrator | [Technical](technical/README.md) → [integration map](technical/INTEGRATION-MAP.md) → the domain contract below → [operations](technical/OPERATIONS.md) |
| Operator | [Operations](technical/OPERATIONS.md) → [OVH runbook](../deploy/kayroslab-vps/README.md) → [CI/CD](CI_CD.md) → [release evidence](journey/CAPABILITIES.md#release-evidence) |
| Maintainer / reviewer | [Repository audit](maintenance/REPOSITORY-AUDIT.md) → [contribution rules](../CONTRIBUTING.md) → [changelog](../CHANGELOG.md) |

## Visual reading guide

| Visual | What it explains |
| --- | --- |
| [Operating loop](journey/README.md#the-operating-loop) | Evidence/authority gate and feedback into the next decision |
| [Record relationships](journey/README.md#how-records-relate) | Hypotheses and aggregate observations versus exact contact events |
| [Timeline identity gate](marketing/MEASUREMENT.md#read-an-observed-contact-timeline) | Why an event is linked or left unlinked |
| [Runtime boundaries](technical/INTEGRATION-MAP.md#console-and-source-boundaries) | Console identity, tenant scope, adapters and persistence |
| [Commerce delivery sequence](technical/INTEGRATION-MAP.md#commerce-to-crm-durable-delivery) | Normalisation, outbox, idempotent CRM delivery and timeline reads |
| [Social publication flow](technical/INTEGRATION-MAP.md#optional-workers-and-human-approval) | Human approval, queued work, provider readback and uncertain outcomes |

Diagrams use repository-native Mermaid and are readable directly on GitHub. Tables
beside them provide exact mappings and limitations; the diagrams do not imply new runtime features.

## Product and integration contracts

| Stage | Guide | Use / status |
| --- | --- | --- |
| Diagnose | [Public API](PUBLIC_API.md), [GEO](GEO.md), [IndexNow](INDEXNOW.md) | Detailed audit and protocol references |
| Diagnose | [GEO v2 pilot](architecture/GEO-V2-PLAYWRIGHT-PILOT.md) | Foundations and proposed live-rendering gates |
| Understand | [Customer Journey integration](product/CUSTOMER-JOURNEY-INTEGRATION.md) | Current product-grounded question contract |
| Understand | [Console readiness](product/CONSOLE-READINESS.md) | Navigation, scoped data loading and visual catalog |
| Prepare | [Apply architecture](architecture/APPLY-MODE-MVP.md), [owner scope](specs/APPLY-MODE-v1-2026-11-09.md) | Preview/foundation versus target execution scope |
| Prepare | [Social review](product/SOCIAL-TOOLKIT-SPEC-REVIEW.md) | Adapted implementation contract; governs reading of the original supplied spec |
| Prepare / Coordinate | [Campaign Studio](product/CAMPAIGN-STUDIO.md), [target specification](product/CAMPAIGN-STUDIO-JOINTJS-SPEC-2026-11-20.md) | Visual cross-channel planning, dates, owners, sourced actions and reviewable AI proposals |
| Measure | [AI provider setup](product/AI-VISIBILITY-PROVIDERS.md) | Account selection, encrypted keys, collection and imports |
| Measure | [Commerce specification](specs/ECOMMERCE-CONNECTORS-v1-2026-11-13.md) | Functional/technical intent; use current register and audit for gaps |
| Measure | [CRM specification](product/CRM-CUSTOMER-JOURNEY-SPEC.md) | Native/external modes, identity and event contracts |
| Measure | [GTM integration](GTM_INTEGRATION.md), [installation](GTM_IMPLEMENTATION.md) | Tracking capabilities and installation checks |
| Measure | [Measurement Protocol](MEASUREMENT_PROTOCOL.md), [server-side tracking](SERVER_SIDE_TRACKING_ARCHITECTURE.md), [GTM writes](PHASE3_WRITE.md) | Specialist implementation references |
| Coordinate | [Global/local SEO](product/GLOBAL-LOCAL-SEO.md), [local operations](product/LOCAL-SEO-OPERATIONS.md) | Registry, grants, controls, jobs and supervised writes |
| Coordinate | [GBP retail scope](product/GBP-RETAIL-SPEC.md) | Dashboard behavior and explicitly deferred retail lots |
| Coordinate | [Data-agent journey](product/DATA-AGENT-JOURNEY.md) | Guided assistant, optional Slack and next increments |
| All stages | [Website journey](product/WEBSITE-CUSTOMER-JOURNEY.md), [site maintenance](../site/README.md) | Shared bilingual content/navigation and generated assets |
| Data lifecycle | [Retention and erasure](CONSERVATION-EFFACEMENT.md) | Existing policy; module-specific collection/erasure semantics also apply |

## Operations and integration runbooks

| Task | Canonical guide |
| --- | --- |
| Primary OVH deployment, Keycloak and tenant provisioning | [OVH](../deploy/kayroslab-vps/README.md), [login theme](../deploy/kayroslab-vps/keycloak/themes/gtm-growth/README.md) |
| CI and release workflow mapping | [CI/CD](CI_CD.md), [operations](technical/OPERATIONS.md) |
| CRM adapter | [Plugin API and client](../integrations/crm-plugin/README.md) |
| Social worker and provider | [ZenML/Postiz operations](../deploy/social/README.md) |
| Local durable jobs | [Node-RED operations](../deploy/node-red/README.md) |
| Optional Slack agent | [Eve runbook](../integrations/eve-data-agent/README.md), [upstream notice](../integrations/eve-data-agent/NOTICE.md) |
| Cache | [Redis](CACHING.md) |
| CLI and agent tool reference | [CLI](CLI.md), [tool catalog](../skills/gtm-growth/references/tools.md), [examples](../skills/gtm-growth/references/examples.md), [sGTM](../skills/gtm-growth/references/sgtm.md), [GEO](../skills/gtm-growth/references/geo.md) |
| MCP client setup | [Claude](CLAUDE_SETUP.md), [Codex](CODEX_SETUP.md), [Grok](GROK_SETUP.md), [Grok Build](GROK_BUILD.md), [canonical skill](../skills/gtm-growth/SKILL.md), [setup](../skills/gtm-growth/references/setup.md) |
| Alternative deployment targets | [Generic Docker/Fly/Railway](DEPLOYMENT.md), [Caddy VPS](VPS_DEPLOY.md), [public Cloudflare Worker](WORKER.md) |

## Plans, supplied scope and history

These records retain design context. They are not the entry point for current
capabilities and do not override source behavior or release evidence.

| Record | How to read it |
| --- | --- |
| [Original Social specification](product/SOCIAL-TOOLKIT-SOURCE-SPEC.md) | Preserved source input; use [reviewed adaptations](product/SOCIAL-TOOLKIT-SPEC-REVIEW.md) for implemented behavior |
| [Original UX/UI roadmap](UX_UI_ROADMAP.md) | Dated planning snapshot; current website/console contracts supersede its delivery status |
| [Free console value plan](product/FREE-CONSOLE-VALUE-PLAN.md) | Initial implementation and proposed conversion experiments |
| [Early local SEO research](product/LOCAL-SEO-INTEGRATION.md) | Original planning tab and proposal; later global/local contract governs current integration |
| [AI visibility requirements](CAHIER-CHARGES-VISIBILITE-IA.md) | Requirements, not a blanket implementation or provider-availability claim |
| [Former pitch entry](PRESENTATION.md) | Stable pointer to the maintained marketing track |
| [Sample OpenDPE report](../site/reports/opendpe.html) | Historical sample, not a current production audit |
| [Changelog](../CHANGELOG.md) | Version history and unreleased source changes; not a deployment log |
| [Legacy ga-to-grok skill](../skills/ga-to-grok/README.md) | Compatibility/history; prefer [gtm-growth](../skills/gtm-growth/README.md) for new use |

## Documentation ownership

The journey blueprint owns vocabulary and handoffs. The capability register owns
availability and release evidence. Reading tracks explain the same facts for their
audiences. Domain contracts own API/detail, runbooks own activation/recovery, and
historical documents preserve intent. Run `pnpm run docs:check` after edits.

## PAP 1.0 read pilot

[Personal Agent Protocol read pilot](PAP.md). Implemented behind a disabled feature flag; production and real-agent interoperability require staging evidence.
