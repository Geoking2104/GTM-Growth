# GTM Growth MCP tools

Unprefixed names as registered by the server. Agents usually prefix them (examples: `ga-to-grok__…` or a custom connector name). Always discover tools in the current agent first.

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

## Search Console — site, indexing & performance

| Tool | Typical args | Notes |
|---|---|---|
| `list_search_console_sites` | none | Start here — copy exact `siteUrl` |
| `get_search_console_site` | siteUrl | Property details / permission |
| `list_sitemaps` | siteUrl | All submitted sitemaps + status |
| `get_sitemap` | siteUrl, feedpath | One sitemap details |
| `submit_sitemap` | siteUrl, feedpath, dryRun?, confirm? | WRITE — gated |
| `get_search_overview` | siteUrl, dates?, type? | Totals (no query/page dims) |
| `get_top_queries` | siteUrl, dates?, limit?, type? | Top search queries |
| `get_top_search_pages` | siteUrl, dates?, limit?, type? | Top landing pages |
| `get_query_page_pairs` | siteUrl, dates?, limit?, type? | query × page |
| `get_search_by_device` | siteUrl, dates?, type? | DESKTOP / MOBILE / TABLET |
| `get_search_by_country` | siteUrl, dates?, limit?, type? | |
| `get_search_trend` | siteUrl, dates?, type? | Daily |
| `run_search_analytics` | siteUrl, dimensions?, filters? | Flexible — prefer specialized |
| `inspect_url` | siteUrl, inspectionUrl, languageCode? | Index status of one URL |
| `inspect_urls` | siteUrl, inspectionUrls[] | Batch inspection (keep ≤ 10–20) |

`siteUrl` must be copied exactly from `list_search_console_sites` (trailing slash for URL-prefix, or `sc-domain:example.com`).
Dates: `YYYY-MM-DD` or relative (`28daysAgo`, `7daysAgo`). Default end date accounts for the ~2–3 day data lag.
`type` on Search Analytics tools is typically `web`, `image`, `video`, `news`, `discover`, or `googleNews`.

### submit_sitemap safety

- Requires `SEARCH_CONSOLE_WRITE_ENABLED=true` on the server.
- Requires `confirm=true` to execute.
- Always run `dryRun=true` first and show the preview.
- Service Account needs the full `webmasters` scope and write access on the property.

## Google Indexing API

Notify Google that individual URLs were updated or deleted. Officially intended for job postings and livestream structured data; other uses may be limited by Google.

| Tool | Typical args | Notes |
|---|---|---|
| `get_url_notification_metadata` | url | Read-only — last notify time |
| `publish_url_notification` | url, type, dryRun?, confirm? | WRITE — gated |
| `publish_url_notifications` | notifications[{url,type}], dryRun?, confirm? | Batch write — gated |

`type` is `URL_UPDATED` or `URL_DELETED`.

### Indexing API safety

- Requires `INDEXING_WRITE_ENABLED=true` on the server.
- Requires `confirm=true` to execute.
- Always run `dryRun=true` first.
- Service Account needs the `indexing` scope.
- The URL must be owned by the publisher and crawlable for `URL_UPDATED`.

## PageSpeed Insights & CrUX

Lab data (Lighthouse) and real-user Core Web Vitals. Optional API keys recommended for production.

| Tool | Typical args | Notes |
|---|---|---|
| `run_pagespeed` | url, strategy?, categories?, locale? | Lighthouse scores + vitals |
| `run_pagespeed_batch` | urls[], strategy?, categories? | Sequential — keep ≤ 5 |
| `query_crux` | origin? or url?, formFactor?, metrics? | Real-user CrUX |
| `query_crux_batch` | targets[{origin?|url?}], formFactor? | Keep ≤ 10 |

`strategy` is `mobile` or `desktop` (default desktop for PageSpeed).
`formFactor` is `PHONE`, `DESKTOP`, `TABLET`, or `ALL_FORM_FACTORS`.
API keys: `PAGESPEED_API_KEY` / `CRUX_API_KEY` or shared `GOOGLE_API_KEY`.

## Common error patterns

- **403 / permissionDenied** — Service Account not invited to the property, GTM account, Search Console site, or missing Indexing API scope. Grant the appropriate access.
- **Writes disabled** — Server has `GA4_WRITE_ENABLED`, `GTM_WRITE_ENABLED`, `SEARCH_CONSOLE_WRITE_ENABLED`, or `INDEXING_WRITE_ENABLED` unset or false. Do not retry with `confirm=true`.
- **Invalid arguments** — Zod validation failed. Check the error message for the exact field.
- **Empty / truncated results** — Widen the date range or raise `limit`. Large reports are paginated automatically on `run_report`.
- **Search Console siteUrl mismatch** — Use the exact string returned by `list_search_console_sites`.
- **PageSpeed / CrUX 429** — Rate limit. Add an API key and reduce batch size.

## CLI twin (same repo, outside the agent)

```
npm run cli -- list-properties
npm run cli -- audit-web --account WEB --container WEB --property 123
npm run cli -- audit-sgtm --account SRV --container SRV
npm run cli -- verify-secrets --property 123
npm run cli -- cutover-checklist ...
```

See repo `docs/CLI.md`.
