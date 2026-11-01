# Google Growth MCP tools

Unprefixed names as registered by the Google Growth server. Agents usually prefix them (examples: `ga-to-grok__…` or a custom connector name). Always discover tools in the current agent first.

Common ids

- `propertyId` — numeric GA4 property (no `properties/` prefix unless the tool already accepts it)
- `accountId`, `containerId`, `workspaceId` — GTM ids as strings
- `siteUrl` — exact Search Console property id (from `list_search_console_sites`)
- dates — `today`, `yesterday`, `NdaysAgo`, or `YYYY-MM-DD`

## GA4

| Tool | Typical args | Notes |
|---|---|---|
| `list_properties` | none | Start here |
| `get_property_details` | propertyId | |
| `get_metadata` | propertyId? | Dimensions and metrics catalog |
| `run_report` | metrics[], startDate, endDate, dimensions?, limit? | Last resort |
| `run_realtime_report` | metrics[], dimensions?, limit? | Last ~30 minutes |
| `get_traffic_overview` | propertyId?, startDate?, endDate? | Users, sessions, views, bounce |
| `get_top_pages` | propertyId?, dates, limit? | |
| `get_acquisition` | propertyId?, dates, limit? | Channel / source / medium |
| `get_devices` | propertyId?, dates | Device, OS, browser |
| `get_events_summary` | propertyId?, dates, limit? | |
| `analyze_ecommerce_data` | propertyId, dates?, limit? | Purchases, revenue, AOV, funnel, quality warnings |

## GTM web (read)

| Tool | Typical args |
|---|---|
| `list_gtm_accounts` | none |
| `list_gtm_containers` | accountId |
| `list_gtm_workspaces` | accountId, containerId |
| `list_gtm_tags` | accountId, containerId, workspaceId |
| `get_ga4_tags` | accountId, containerId, workspaceId |
| `get_gtm_container_summary` | accountId, containerId, workspaceId? |
| `list_gtm_triggers` | accountId, containerId, workspaceId |
| `get_trigger_details` | + triggerId |
| `list_gtm_variables` | accountId, containerId, workspaceId |
| `get_variable_details` | + variableId |
| `get_tag_details` | + tagId |
| `analyze_event_parameters` | accountId, containerId, workspaceId |
| `compare_gtm_vs_ga4_events` | + propertyId, dates? |
| `audit_ga4_setup` | legacy — prefer v2 |
| `audit_ga4_setup_v2` | accountId, containerId, workspaceId?, propertyId?, dates? |
| `find_tags_by_trigger` | + triggerId — tags fired and blocked |
| `find_tags_using_variable` | + variableId — tags referencing it; `unused` flag |
| `detect_duplicate_tags` | accountId, containerId, workspaceId |
| `get_built_in_variables` | accountId, containerId, workspaceId |
| `gtm_audit_installation` | url — page-level install audit, no credentials |
| `gtm_generate_snippet` | containerId, includeDataLayer?, consentDefault? |
| `validate_ecommerce_events` | accountId, containerId, workspaceId, propertyId?, dates? |

## Custom events (read)

| Tool | Typical args |
|---|---|
| `list_custom_events` | propertyId, dates?, limit? |
| `analyze_custom_event` | propertyId, eventName, dates? |
| `suggest_custom_event_config` | eventName, parameters?, measurementId?, GTM ids? |

## GTM writes (Phase 3 — gated)

All require `confirm=true` to execute. Prefer `dryRun=true` first. Do not publish.

| Tool | Typical args |
|---|---|
| `create_custom_event_trigger` | accountId, containerId, workspaceId, eventName, triggerName?, dryRun?, confirm? |
| `create_ga4_event_tag` | + tagName?, measurementId?, parameters[{key,value}]?, firingTriggerIds? |
| `create_ga4_event_setup` | trigger + tag in one call — preferred |

## sGTM and Measurement Protocol

| Tool | Typical args |
|---|---|
| `list_sgtm_containers` | none |
| `list_gtm_clients` | accountId, containerId, workspaceId |
| `get_gtm_client_details` | + clientId |
| `audit_sgtm_setup` | accountId, containerId, workspaceId? |
| `audit_measurement_protocol_client` | accountId, containerId, workspaceId?, clientId? |
| `compare_dual_tagging` | webAccountId, webContainerId, serverAccountId, serverContainerId, propertyId, workspace ids?, dates? |
| `cutover_checklist` | same + sgtmHealthUrl? |
| `check_sgtm_health` | url, paths?, timeoutMs? |
| `sgtm_observability_snapshot` | sgtmHealthUrl, propertyId? |
| `list_data_streams` | propertyId |
| `list_measurement_protocol_secrets` | propertyId, dataStreamId, revealSecrets? |
| `verify_ga4_secrets` | propertyId, revealSecrets? |
| `suggest_measurement_protocol_config` | propertyId, dataStreamId?, mode?, sgtmBaseUrl? |
| `create_measurement_protocol_secret` | propertyId, dataStreamId, displayName, dryRun?, confirm? |
| `configure_measurement_protocol` | propertyId, mode?, sgtmBaseUrl?, createSecretName?, dryRun?, confirm? |

`mode` on MP helpers is typically `direct`, `sgtm`, or `both`.

## Search Console

| Tool | Typical args | Notes |
|---|---|---|
| `list_search_console_sites` | none | Start here — copy exact `siteUrl` |
| `get_search_console_site` | siteUrl | Property details / permission |
| `list_sitemaps` | siteUrl | All submitted sitemaps + status |
| `get_sitemap` | siteUrl, feedpath | One sitemap details |
| `submit_sitemap` | siteUrl, feedpath, dryRun?, confirm? | WRITE — gated |
| `get_search_overview` | siteUrl, dates?, type? | Totals |
| `get_top_queries` | siteUrl, dates?, limit?, type? | Top search queries |
| `get_top_search_pages` | siteUrl, dates?, limit?, type? | Top landing pages |
| `get_query_page_pairs` | siteUrl, dates?, limit?, type? | query × page |
| `get_search_by_device` | siteUrl, dates?, type? | DESKTOP / MOBILE / TABLET |
| `get_search_by_country` | siteUrl, dates?, limit?, type? | |
| `get_search_trend` | siteUrl, dates?, type? | Daily |
| `run_search_analytics` | siteUrl, dimensions?, filters? | Flexible — prefer specialized |
| `inspect_url` | siteUrl, inspectionUrl, languageCode? | Index status of one URL |
| `inspect_urls` | siteUrl, inspectionUrls[] | Batch inspection (keep ≤ 10–20) |

`siteUrl` must be copied exactly from `list_search_console_sites`.

### submit_sitemap safety

- Requires `SEARCH_CONSOLE_WRITE_ENABLED=true` on the server.
- Requires `confirm=true` to execute.
- Always run `dryRun=true` first.
- Service Account needs the `webmasters` scope and write access.

## Google Indexing API

Officially intended for job postings and livestream structured data; other uses may be limited by Google.

| Tool | Typical args | Notes |
|---|---|---|
| `get_url_notification_metadata` | url | Read-only |
| `publish_url_notification` | url, type, dryRun?, confirm? | WRITE — gated |
| `publish_url_notifications` | notifications[{url,type}], dryRun?, confirm? | Batch write — gated |

`type` is `URL_UPDATED` or `URL_DELETED`.

### Indexing API safety

- Requires `INDEXING_WRITE_ENABLED=true`.
- Requires `confirm=true`.
- Always `dryRun=true` first.
- Service Account needs the `indexing` scope.

## PageSpeed Insights & CrUX

| Tool | Typical args | Notes |
|---|---|---|
| `run_pagespeed` | url, strategy?, categories?, locale? | Lighthouse scores + vitals |
| `run_pagespeed_batch` | urls[], strategy?, categories? | Keep ≤ 5 |
| `query_crux` | origin? or url?, formFactor?, metrics? | Real-user CrUX |
| `query_crux_batch` | targets[{origin?|url?}], formFactor? | Keep ≤ 10 |

`strategy` is `mobile` or `desktop`. `formFactor` is `PHONE`, `DESKTOP`, `TABLET`, or `ALL_FORM_FACTORS`.

## GEO — AI search readiness

| Tool | Typical args | Notes |
|---|---|---|
| `geo_audit` | url, includeAiDiscovery? | Score 0–100, 8 categories, per-check evidence, prioritized fixes |
| `geo_audit_sitemap` | url, sitemapUrl?, maxUrls? | Site sample (max 25, default 10) + `missingAcrossSite` |
| `geo_generate_llms_txt` | url, sitemapUrl?, siteName?, description?, maxLinksPerSection? | Returns the file content for `/llms.txt` |
| `geo_generate_schema` | kind, name, url, description?, logo?, sameAs?, faqs?, … | Returns JSON-LD + `<script>` tag |
| `geo_generate_robots` | url, sitemapUrl? | Append-only fix; blocked bots are reported, not overridden |
| `geo_citability` | url | Second 0–100 score, 12 content methods |
| `geo_crawler_access` | url | Per-bot matrix by tier |
| `geo_llms_drift` | url, sitemapUrl?, maxUrls? | Stale/missing links + coverage |
| `geo_content_risks` | url | Hidden text, LLM instructions, thin copy |
| `geo_positioning` | url, competitors[1–5], maxTerms? | Vocabulary overlap, unique themes |

All five are read-only and need no `confirm`. `kind` is `website`, `organization`, `faq`, `article`, `product`, or `localbusiness`; `kind: "faq"` requires real `faqs[]`. Score bands: 86–100 excellent, 68–85 good, 36–67 foundation, 0–35 critical. Rubric and limits — `references/geo.md`.

## Common error patterns

- **403** — Service Account not invited.
- **Writes disabled** — env flag not true. Do not retry with `confirm=true`.
- **Invalid arguments** — Zod validation failed.
- **Empty results** — widen the date range.
- **siteUrl mismatch** — use the exact string from `list_search_console_sites`.
- **PageSpeed / CrUX 429** — add an API key and reduce batch size.
- **GEO audit HTTP error** — the page returned 403/5xx or timed out; fix the response before auditing content. A WAF that blocks non-browser user agents will also block AI crawlers.
