# Local SEO: public feature research and first console increment

Date: 2026-11-12. Baseline: `45d30bf` (main, customer journey integration).

## Findings and evidence boundary

Crowdo's [public Local SEO page](https://crowdo.net/local-seo/) describes a managed service covering business listings, local content, citations, reviews and monthly reporting. This is evidence of advertised deliverables, not evidence of the implementation, data providers or effectiveness of its private service. The public website does not supply enough evidence to reproduce its internal delivery system.

[REA](https://github.com/morluto/rea) is an investigation tool, not a Local SEO engine. Its MIT license applies to REA-authored code, not to Crowdo material. We used REA CLI 6.8.0 outside the application dependency tree to statically analyse five inline JavaScript files extracted from the public page. No third-party script was executed or copied into GTM Growth. REA produced evidence ID `ev_a26fb34fd99ae79f65b89527b850a1c66a810d490fc0d51cdea8386ab8597a96`, input digest `9c779778b8f31c4262a2bc4f18d5a33e0dc43ee846594a65e244a9d5c324453d`.

Reproduction: download that public HTML, extract nonempty executable inline script bodies in document order, then run `rea analyze-javascript-application /absolute/path/to/extracted-scripts --format json`. The live site can change, so hashes are capture-specific. Static syntax establishes neither runtime calls nor backend functionality. Passive browser capture was attempted but local Chromium could not start because Unix sockets are unavailable. No authenticated Crowdo area, private API or customer data was inspected. REA is not installed into the production service. A second static analysis of the public theme bundle was interrupted during semantic processing; no conclusion relies on that incomplete run.

## Existing GTM Growth capabilities and gaps

| Area | Baseline | This increment | Remaining work |
| --- | --- | --- | --- |
| Business identity | Generic LocalBusiness generator | Dedicated establishment form and public-address consent | Tenant-owned multi-location persistence |
| NAP consistency | No dedicated workspace | Compare up to 20 manually entered citations against reference name/address/phone | Approved directory connectors and dated observations |
| Local content | GEO audit and customer journey | Service + location query hypothesis and local-page action checklist | Link measured page evidence to local content opportunities |
| Structured data | Generic generator | Export a LocalBusiness draft from a complete public address | Validation and explicit Apply Mode publication workflow |
| Google Business Profile | No dedicated local integration | Profile URL declaration, clearly not a connection | OAuth, approved Google project, listing ownership and API adapter |
| Reviews | No review workflow | Honest-review and reply-review checklist | Authorised read/sync and approval before replies |
| Maps positions | No local rank source | Explicitly unavailable; no synthetic map or score | Provider adapter, coordinate grid, language, timestamp and quota |
| Reporting | Existing general reports | Local action plan Markdown and JSON dossier round-trip | Observed GBP metrics, history and scheduled tenant reports |

## Shipped behaviour

Console → Track → Local SEO, available in French and English. Existing console components and CSS are reused. This is a browser-local planning workspace; no data is sent to directories and no credentials are requested. Export the JSON dossier before navigating away; import it to resume. There is no server or browser-storage persistence, so dossiers do not silently carry across tenants.

All checks describe completeness of user declarations. A declared GBP URL does not prove ownership. Citation comparisons distinguish match, review and unknown; address comparison is not applicable for private/service-area addresses. Phone comparison removes formatting only, without guessing country equivalence. Name and address comparison retains meaningful punctuation and accents. These are text comparisons, not entity resolution or verified rankings.

JSON-LD export requires name, a valid HTTP(S) URL and a complete address explicitly marked public. Service-area-only businesses receive no LocalBusiness address export in this increment. Review the draft against visible page content before publication. The general GEO score is unchanged. No external publication is performed.

## Next integration architecture

1. Persist locations under `tenantId + locationId`, with role checks, domain grants, audit events and a revision counter. Reuse the existing tenant registry rather than adding unscoped local storage.
2. Add Google Business Profile OAuth using server-held encrypted tokens. First implement read-only listing and performance import, timestamp every observation and distinguish API failure from zero metrics. Google requires project approval before API access: [prerequisites](https://developers.google.com/my-business/content/prereqs).
3. Model citations with source URL, observation time, collection method, original values and reviewed discrepancy status. Add adapters only for documented/authorised sources; manual import remains available.
4. Put publication and review replies behind explicit previews and owner approval in Apply Mode. Never bulk-create low-quality links or selectively solicit only positive reviews.
5. Add local rank observations through a chosen provider: keyword, coordinates, radius/grid, language, device, timestamp, rank or explicit not-found/error state. Search Console averages are not Google Maps grid positions.
6. Expose usage and cost limits before scheduling cloud sync. Proposed split: keep manual planning/import/export in free open source; use cloud entitlements for hosting, scheduling, multi-location history and provider usage. This is a proposal, not a billing change. Existing Mollie prices and subscriptions are unchanged.

Google's [LocalBusiness structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/local-business) informs the address boundary. A markup draft is not a guarantee of a search feature or ranking.

## Validation and release boundary

Unit coverage includes absent evidence, conservative NAP comparison, unsafe URLs, malformed imports, public-address constraints and bilingual exports. DOM interaction coverage exercises FR/EN rendering, report invalidation after edits, citation bounds/removal, hostile text, JSON import/export and oversize rejection. These tests do not replace browser visual QA.

Validation results: 59 test files / 423 tests passed after rebuilding the local SQLite native dependency; TypeScript checks, build and site checks passed. ESLint reports zero errors and 289 existing warnings in unchanged backend sources. Browser visual QA remains pending because Chromium could not start in this environment.

No merge, deployment or production validation is implied by this change. A full managed Local SEO service requires the remaining connectors and workflows above.
