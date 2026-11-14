# Repository audit and integration priorities

[Documentation hub](../README.md) · [Capability register](../journey/CAPABILITIES.md) · [Contributing](../../CONTRIBUTING.md)

Review date: **15 November 2026 (Asia/Shanghai)**. Baseline:
[`353e658`](https://github.com/Geoking2104/GTM-Growth/commit/353e65878f8142627430549968ecce31d43cc9a2).
Scope: README and Markdown inventory, website/console journey descriptions,
critical integration paths and matching tests/workflows. This is a documentation
and integration review, not a complete security audit or a live-provider acceptance run.

## Findings and changes delivered

| Finding | Evidence at baseline | Resolution |
| --- | --- | --- |
| Entry page mixes marketing, implementation, releases and appended features | README: 648 lines, duplicate local-SEO heading/numbering, malformed recent-updates table | Short root README; separate marketing/technical tracks; central hub and register |
| No shared handoff definition | Scattered product, CRM, Social and assistant documents | Shared five-stage blueprint with owners, prerequisites, outputs and acceptance |
| Three meanings of “journey” overlap | Website stages, buyer-awareness model and CRM timeline | Explicit vocabulary and diagrams; no automatic stage or identity inference |
| Old question-generation claims survive | README, `CUSTOMER-JOURNEY-INTEGRATION`, console-readiness row and shared site catalog mention heading hypotheses | Current Product/Service-based contract and matching EN/FR catalog descriptions |
| Production status is internally inconsistent and unsupported | README cites OVH runs 43522090712 and 43270543975 as successful; current Actions records say waiting | Dated central release register; source/activation/deployment separation; stale success claims removed |
| Public pitch overstates attribution and uniform write safety | “Proving” AI citation revenue, “no PII”, and a single write-gate rule | Explain correlation, pseudonymisation, CRM retained content and adapter-specific gates |
| Specialist deployment guides conflict with workflow triggers | CI/CD and Worker guide describe automatic publication | Manual dispatch/main/confirmation conditions aligned with workflow files |
| General MCP and console trust boundaries blurred | Shared MCP token plus caller-supplied commerce `tenantId` | Explicit operator-only trust model; use scoped routes/bridges for client audiences |
| Historical input can look like delivered architecture | Original Social/AI/UX specs alongside current contracts | Hub labels intent/history and links reviewed implementation; source specs retained |
| Navigation can drift after documentation edits | No repository documentation link check | Dependency-free Markdown local-path/anchor check in package scripts and CI |

## Reorganisation decisions

The root README is an entry page. `docs/journey` owns the shared workflow and
capability register; `docs/marketing` owns value/measurement; `docs/technical`
owns architecture/integration/operations; `docs/maintenance` owns audit findings.
The hub classifies existing specialist files and preserves their established URLs.

The former long README remains available in Git history at the baseline revision.
It is not duplicated as another active guide. Source modules, package paths and
original supplied specifications remain stable. Legacy skill material is labelled
rather than removed, because downstream installations may still reference it.
The shared site catalog receives only the factual journey-copy correction and
regenerated bilingual output; no console navigation redesign is included.

## Prioritised integration work

These are **open findings/recommendations**, not implementation delivered here.
Priority denotes review order, not an approved delivery date or a new issue assignment.

| Priority | Evidence / gap | Proposed next change | Acceptance |
| --- | --- | --- | --- |
| P1 | [Console commerce](../../src/console/commerce.ts) and [MCP commerce](../../src/tools/ecommerce.ts) sum channels across currencies, cap loaded orders and use inconsistent date/status denominators | Share one currency-aware aggregation contract; report coverage/truncation; align engine/channel/attributed series | Mixed currencies never combine; cancelled/refunded/date exclusions and pagination agree across surfaces |
| P1 | [Attribution](../../src/ecommerce/attribute.ts) returns low-confidence `direct` for absent referrer/landing and labels `ga4_join` without source resolution | Decide explicit missing-signal semantics and implement or rename the GA4 placeholder | No unsupported “proven direct” or completed GA4-join claim; tests cover each signal/provenance case |
| P1 | [General MCP](../../src/server.ts) does not establish console tenant membership | Keep it restricted to trusted operators; design identity-scoped dispatch before multi-customer distribution | Foreign tenant requests rejected by server-derived identity, not only by input validation |
| P1 | Deployment prose lacks an authoritative current revision record | Record actual deployed SHA, workflow/run and live readback in one release artifact | Successful run + exact revision + EN/FR/API verification before a “live” claim |
| P2 | Questions, drafts and actions remain separate module records | Design versioned multi-page journey/backlog linking evidence, owner and action | End-to-end handoff across modules without losing provenance or bypassing permissions |
| P2 | [CRM plugin](../../integrations/crm-plugin/README.md) is generic; real vendor/source setup is separate | Qualify one real CRM adapter and first-party event source | Exact source identity, idempotency, conflict, pause/erase and consent-reference acceptance |
| P2 | [GEO PR #30](https://github.com/Geoking2104/GTM-Growth/pull/30) is open; live rendering is separate | Review/rebase 42-control work and qualify isolated renderer in its own delivery | Deterministic applicability, incomplete-evidence semantics, enforced egress and resource limits |
| P2 | [Apply registry](../architecture/APPLY-MODE-MVP.md) is not wired to execution | Separate execution design with locking, approval consumption, backup/readback/rollback | Staging failure/retry/drift/rollback acceptance before any production writer |
| P2 | [GBP dashboard](../product/LOCAL-SEO-OPERATIONS.md) is on-demand; WF-04 is absent | Qualify durable performance collection and retention separately | Source timestamp, quota handling and retry semantics; dashboard reads remain distinct |
| P3 | [Social](../product/SOCIAL-TOOLKIT-SPEC-REVIEW.md), Slack and Cloud retain activation/deferred scope | Live provider pilots; separately specify billing lifecycle and entitlements | Verified configured sources and explicit commercial terms before availability claims |

## Validation record for this change

Validation results are recorded in the pull request for the exact change revision.
Local validation passed: 362 relative links across 74 Markdown files; positive
and negative link-check probes; six Mermaid diagrams parsed successfully;
TypeScript checks, build, site generation/parity and 657 tests across 83 files.
Lint returned zero errors with 319 existing warnings in unchanged source files.
Local Chromium rendering was unavailable because the environment denied its
process socket; no visual-browser pass is claimed from that attempt. CI browser
jobs remain the authority for rendered FR/EN checks. This audit does not label an
unexecuted live pilot as passed.

No runtime attribution, access-control, schema or connector behavior is changed
by this documentation work. The open findings remain visible in the measurement
guide and capability register until their own implementation is verified.
