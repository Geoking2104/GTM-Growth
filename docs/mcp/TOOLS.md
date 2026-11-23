# MCP tool contracts (stable reference)

This page documents the tool contracts exposed by the GTM Growth MCP server
(entry points: `src/tools/index.ts` and the sibling families below): names,
schemas and behaviours are versioned contracts. A tool changes name, schema or
meaning only in a documented release; breaking changes ship as a new tool name
and the old one is retired through the changelog, never silently.

The MCP server is served through `gtm-growth` (see the install runbook). Every
tool is implemented in `src/tools/*.ts`; the schemas in the source remain the
executable truth and this page is the human-readable mirror. Error answers use
the common `{ ok: false, error }` envelope; success answers use
`{ ok: true, data }` (see `src/tools/response.ts`).

## Invariants

- **Read-only by default, writes gated.** Tools that write to Google, a store
  platform or a third party carry "WRITE" in their contract and require
  `confirm=true`, and where configured an environment flag
  (`SEARCH_CONSOLE_WRITE_ENABLED`, `INDEXING_WRITE_ENABLED`), on top of the
  module's own credentials. Nothing executes on a dry run.
- **No invented data.** Tools report what they measured or fetched, nothing
  else; a missing value stays missing (`null`), never zero.
- **Bounded calls.** Batch tools state their recommended caps; oversized input
  is refused rather than truncated.
- **Provenance everywhere.** GEO and PAP tools return per-check evidence; audit
  tools return the signals behind each verdict.

## Writes and pre-approved actions (R11)

Direct write tools (GTM create, sitemap submit, Indexing API, MP secret) keep
their own confirmation gates. The R11 pre-approved action catalog
(`src/actions/catalog.ts`, runbook in `docs/technical/ACTIONS.md`) adds governed
one-click operations; a PAP agent may only *propose* a catalog operation
behind `PAP_OPERATIONS_ENABLED` (scope `gtm:operations:propose`), and approval
plus execution stay human console acts.

## GA4 properties, reports and business analytics

Source: `src/tools/index.ts`. Service-account credentials (GA4 read-only `analytics.readonly`).

| Tool | Stable contract |
| --- | --- |
| `list_properties` | List all Google Analytics 4 properties accessible with the current Service Account credentials. |
| `get_property_details` | Get detailed information about a specific GA4 property. |
| `get_metadata` | Retrieve available dimensions and metrics for a GA4 property. |
| `run_report` | Run a flexible GA4 report. Prefer business tools when possible. |
| `run_realtime_report` | Get realtime data from the last 30 minutes. |
| `get_traffic_overview` | Complete traffic overview (users, sessions, pageviews, bounce rate…). |
| `get_top_pages` | Most viewed pages for a period. |
| `get_acquisition` | Traffic acquisition by channel, source and medium. |
| `get_devices` | Traffic breakdown by device, OS and browser. |
| `get_events_summary` | Most frequent events for a period. |
| `analyze_ecommerce_data` | Analyze real ecommerce performance from GA4: purchases, revenue, AOV, funnel, top items, data-quality warnings. |

## Google Tag Manager (read and audit)

Source: `src/tools/gtm.ts`. Service-account credentials with GTM read access; `inspect_gtm`-style live-page checks fetch public pages only.

| Tool | Stable contract |
| --- | --- |
| `list_gtm_accounts` | List all Google Tag Manager accounts accessible with the current credentials. |
| `list_gtm_containers` | List all containers belonging to a GTM account. |
| `list_gtm_workspaces` | List workspaces of a GTM container. |
| `list_gtm_tags` | List all tags in a GTM workspace. |
| `get_ga4_tags` | List only GA4 Configuration + Event tags in a workspace. |
| `get_gtm_container_summary` | High-level GA4-focused summary of a GTM container. |
| `list_gtm_triggers` | List all triggers in a GTM workspace. |
| `get_trigger_details` | Get full details of a specific GTM trigger. |
| `list_gtm_variables` | List all user-defined variables in a GTM workspace. |
| `get_variable_details` | Get full details of a specific GTM variable. |
| `get_tag_details` | Get full enriched details of a GTM tag (parameters, triggers, eventName…). |
| `analyze_event_parameters` | Check critical parameters on all GA4 Event tags (value, currency, transaction_id…). |
| `compare_gtm_vs_ga4_events` | Cross-reference GTM configured events vs events actually received in GA4. |
| `audit_ga4_setup` | Basic GA4 setup audit (Phase 1). Prefer audit_ga4_setup_v2. |
| `audit_ga4_setup_v2` | Full intelligent audit of a GTM container for GA4. Combines config checks, parameter quality, triggers, and optional live GA4 data comparison. Returns score, grade, issues and recommendations. |
| `find_tags_by_trigger` | Find every tag a trigger fires or blocks — answers 'what runs when this trigger fires?'. |
| `find_tags_using_variable` | Find every tag that references a variable ({{name}}), and flag the variable as unused when none do. |
| `detect_duplicate_tags` | Detect duplicate GA4 tags: the same event name fired by several tags, or several configuration tags sharing a Measurement ID. |
| `get_built_in_variables` | List the built-in variables enabled in a GTM workspace (Page URL, Click Text, Form ID…). |
| `gtm_audit_installation` | Audit a live page's GTM installation: container id, loader in <head>, noscript fallback, dataLayer order, consent default and duplicate containers. Page-level only; container contents are audited by the other GTM tools. |
| `gtm_generate_snippet` | Generate deployable GTM snippets for a container id: optional dataLayer init, optional default consent state, the <head> loader and the <noscript> body fallback. |
| `validate_ecommerce_events` | Validate GA4 ecommerce events against the official Google schema (purchase, add_to_cart, begin_checkout, view_item, etc.). Checks required/recommended parameters, items array, triggers, and optionally cross-checks with real GA4 revenue & event counts. Returns a funnel score and actionable fixes. |

## GTM writes (confirmation-gated)

Source: `src/tools/gtm-write.ts`. GTM edit access plus `confirm=true`; `dryRun=true` previews. Never publishes a workspace.

| Tool | Stable contract |
| --- | --- |
| `create_custom_event_trigger` | Phase 3 WRITE: Create a Custom Event trigger in a GTM workspace. Requires confirm=true. Use dryRun=true to preview without writing. Does NOT publish. |
| `create_ga4_event_tag` | Phase 3 WRITE: Create a GA4 Event tag (gaawe) in a GTM workspace. Requires confirm=true. Use dryRun=true to preview. Does NOT publish. |
| `create_ga4_event_setup` | Phase 3 WRITE (recommended): Create both a Custom Event trigger AND a linked GA4 Event tag in one call. Requires confirm=true. Use dryRun=true first. Does NOT publish the workspace. |

## Google Search Console

Source: `src/tools/search-console.ts`. Service-account credentials with Search Console access; write tools additionally require `SEARCH_CONSOLE_WRITE_ENABLED=true`.

| Tool | Stable contract |
| --- | --- |
| `list_search_console_sites` | List all Search Console properties (URL-prefix and domain) accessible by the Service Account. Always call this first to obtain the exact siteUrl. |
| `get_search_console_site` | Get details of a single Search Console property (permission level, etc.). |
| `list_sitemaps` | List all sitemaps submitted for a Search Console property, including processing status, errors and warnings. |
| `get_sitemap` | Get detailed status of a specific sitemap (path, last downloaded, errors, warnings, contents). |
| `submit_sitemap` | WRITE: Submit (add) a sitemap to a Search Console property. Requires SEARCH_CONSOLE_WRITE_ENABLED=true on the server and confirm=true. Use dryRun=true first to preview. The Service Account needs the full webmasters scope and write access on the property. |
| `get_search_overview` | Search Console totals (clicks, impressions, CTR, average position). No query/page dimensions for more complete counts. |
| `get_top_queries` | Top search queries by clicks/impressions. |
| `get_top_search_pages` | Top landing pages in Google Search. |
| `get_query_page_pairs` | Top query × page pairs. |
| `get_search_by_device` | Search performance by device (DESKTOP, MOBILE, TABLET). |
| `get_search_by_country` | Search performance by country. |
| `get_search_trend` | Daily Search Console trend. |
| `run_search_analytics` | Flexible Search Analytics query. Prefer specialized tools when possible. Dimensions: query, page, country, device, date, searchAppearance. |
| `inspect_url` | Inspect the index status of a URL in Google Search. Returns verdict (PASS/FAIL/NEUTRAL), coverageState, lastCrawlTime, googleCanonical vs userCanonical, robotsTxtState, indexingState, and referring URLs. Equivalent to URL Inspection in Search Console. |
| `inspect_urls` | Inspect multiple URLs (batch). Returns an array of inspection results. Use for checking key pages after a deploy or migration. Note: each inspection is relatively slow; keep batches small (recommended ≤ 10). |

## Server-side GTM

Source: `src/tools/sgtm.ts`. GTM credentials with access to the server container; health probes hit the configured sGTM endpoints.

| Tool | Stable contract |
| --- | --- |
| `list_sgtm_containers` | List server-side GTM containers (usageContext SERVER). |
| `list_gtm_clients` | List clients in a GTM workspace (sGTM entry points). |
| `get_gtm_client_details` | Get full details of a GTM client. |
| `audit_sgtm_setup` | Audit server-side GTM container for GA4 readiness. |
| `audit_measurement_protocol_client` | Deep technical audit of Measurement Protocol client(s) in sGTM. |
| `compare_dual_tagging` | S3: Compare web GTM vs sGTM vs events actually received in GA4. Returns match rates, missing events, server readiness signals and migration risks. |
| `cutover_checklist` | S4: Automated readiness checklist for sGTM dual-tagging / cutover. Combines web audit, sGTM audit, MP secrets, parity, ecommerce quality and optional /healthy probe. Returns readyForDualTagging / readyForCutover flags. |
| `check_sgtm_health` | S5: Probe sGTM health endpoints (/healthy, /healthz, /) and report status codes + latency. |
| `sgtm_observability_snapshot` | S5: Combined snapshot — sGTM health probe + optional GA4 realtime event activity. |

## Measurement Protocol secrets

Source: `src/tools/mp-secrets.ts`. GA4 credentials; secret creation needs `analytics.edit` and `confirm=true`.

| Tool | Stable contract |
| --- | --- |
| `list_data_streams` | List GA4 data streams for a property (web / Android / iOS), including Measurement IDs. |
| `list_measurement_protocol_secrets` | List Measurement Protocol API secrets for a data stream. Values masked by default. |
| `verify_ga4_secrets` | Verify MP secrets across all streams of a GA4 property. Score, issues, readiness. |
| `suggest_measurement_protocol_config` | Generate a complete Measurement Protocol setup for a GA4 property: endpoints (direct + debug), payload examples, sGTM path, security notes and implementation steps. Uses real stream/secret status when available. |
| `create_measurement_protocol_secret` | WRITE: Create a Measurement Protocol API secret on a GA4 data stream. Requires analytics.edit. Use dryRun=true to preview, confirm=true to execute. Returns secretValue once — store securely. |
| `configure_measurement_protocol` | End-to-end Measurement Protocol configuration helper: verifies secrets, suggests direct/sGTM setup, and optionally creates a secret (createSecretName + confirm). |

## Google Indexing API

Source: `src/tools/indexing.ts`. Indexing API credentials; writes additionally require `INDEXING_WRITE_ENABLED=true` and `confirm=true`.

| Tool | Stable contract |
| --- | --- |
| `get_url_notification_metadata` | Get the latest Indexing API notification metadata for a URL (last update/delete notify time). Read-only. |
| `publish_url_notification` | WRITE: Notify Google that a URL was updated (URL_UPDATED) or deleted (URL_DELETED) via the Indexing API. Requires INDEXING_WRITE_ENABLED=true and confirm=true. Use dryRun=true first. Officially intended for job postings and livestream structured data; other uses may be limited by Google. |
| `publish_url_notifications` | WRITE: Notify Google about multiple URLs (batch). Same gates as publish_url_notification (INDEXING_WRITE_ENABLED + confirm). Keep batches small (recommended ≤ 20). |

## IndexNow

Source: `src/tools/indexnow.ts`. Public HTTPS targets; `indexnow_submit` requires `confirm=true` (third-party write consuming crawl quota).

| Tool | Stable contract |
| --- | --- |
| `indexnow_keygen` | Generate an IndexNow key (32 hex characters, inside the protocol grammar) and everything needed to publish it: the file name, the exact URL to serve, the file content, the response headers and a copy-paste verification command. Local only — no request is sent. |
| `indexnow_verify` | Fetch the IndexNow key file and check that it is published, reachable and contains exactly the key — the only ownership proof the protocol accepts. Read-only. Returns the HTTP status, the content found and the fix for each failure mode. |
| `indexnow_submit` | Announce changed URLs to IndexNow (Bing, Yandex, Seznam, Naver) in one POST, up to 10 000 URLs. WRITE to a third party that consumes crawl quota: requires confirm=true. Returns the documented status code with its meaning and fix — 200/202 mean received, never indexed. |
| `analysis_board` | The analysis board: one payload combining GEO score, platform readiness, citability and IndexNow readiness, plus a ranked action list that adapts to what is actually blocking. IndexNow blockers come first (they cost minutes), then GEO recoverable points, then citability zeroes. Deterministic: same inputs, same order. |
| `indexnow_readiness` | Score IndexNow readiness 0-100 outside the GEO rubric: key grammar, published key file, key file content, Bing verification, Bingbot access, sitemap declaration, HTTPS. Each check carries its evidence and its fix. |
| `indexnow_explain` | Explain an IndexNow HTTP status code (200, 202, 400, 403, 422, 429) without sending anything: what it means and what to change before the next submission. |

## Core Web Vitals (PageSpeed, CrUX)

Source: `src/tools/performance.ts`. Public URLs; optional API keys via `PAGESPEED_API_KEY`, `CRUX_API_KEY` or `GOOGLE_API_KEY`.

| Tool | Stable contract |
| --- | --- |
| `run_pagespeed` | Run a PageSpeed Insights (Lighthouse) audit on a URL. Returns category scores and Core Web Vitals. Optional API key via PAGESPEED_API_KEY or GOOGLE_API_KEY. |
| `run_pagespeed_batch` | Run PageSpeed Insights on multiple URLs (sequential). Keep batches small (recommended ≤ 5) to respect rate limits. |
| `query_crux` | Query Chrome UX Report (CrUX) real-user Core Web Vitals for an origin or a specific URL. Optional API key via CRUX_API_KEY or GOOGLE_API_KEY. |
| `query_crux_batch` | Query CrUX for multiple origins or URLs. Keep batches small (recommended ≤ 10). |

## Commerce storefronts (Shopify, PrestaShop)

Source: `src/tools/ecommerce.ts`. Sealed per-tenant store credentials; read-only, pseudonymised answers.

| Tool | Stable contract |
| --- | --- |
| `commerce_dashboard` | E-commerce dashboard for a connected Shopify/PrestaShop store: revenue by acquisition channel (including AI assistants), attributed share and per-engine detail over the last N days. Read-only, tenant-scoped. |
| `commerce_orders` | Recent orders from connected e-commerce stores with their attribution (channel, engine, method, confidence). Pseudonymized: no customer name, e-mail or address is ever returned. |
| `commerce_products` | Catalogue synced from connected Shopify/PrestaShop stores: title, url, price, availability, sku/gtin — the basis for product-page GEO audits and feed readiness. |
| `ecommerce_feed_readiness` | Feed readiness report (Google Merchant / conversational agents): id, title, description, link, image_link, availability, price, brand, gtin — with missing-field counts per product. |

## GEO: Generative Engine Optimization

Source: `src/tools/geo.ts`. Public URLs only; every check returns its evidence. No SERP or ranking data is collected.

| Tool | Stable contract |
| --- | --- |
| `geo_audit` | GEO/AEO readiness audit for one URL, scored 0-100 across 8 categories (robots.txt, llms.txt, schema, meta, content, brand, signals, AI discovery). Returns the per-category breakdown, every check with its evidence, and prioritized fixes ordered by recoverable points. Read-only: fetches the same public URLs an AI crawler reads. |
| `geo_audit_sitemap` | Audit a sample of pages from a site's sitemap (robots.txt sitemap first). Reports the average GEO score, the weakest pages with their top fixes, and the checks failing across most of the site — so one strong homepage cannot hide a site-wide gap. Keep maxUrls small (default 10). |
| `geo_generate_llms_txt` | Generate an llms.txt from the site's sitemap: H1, blockquote summary, H2 sections and markdown links ordered by sitemap priority. Returns the file content ready to deploy at /llms.txt. Read-only — it does not write to the site. |
| `geo_generate_schema` | Generate JSON-LD for the types that earn GEO points (website, organization, faq, article, product, localbusiness), plus the ready-to-paste <script> tag. Returns rich templates (5+ attributes) rather than generic name+url markup. |
| `geo_generate_robots` | Generate the robots.txt rules an AI-citation-ready site needs. Reads the current robots.txt, appends explicit Allow groups for AI crawlers it does not cover, and reports bots that existing rules block (those are never overridden automatically). Read-only. |
| `geo_citability` | Content citability score (0-100) over 12 methods: statistics, quotations, lists/tables, question headings, answer-first, paragraph and sentence length, outbound citations, authorship, freshness, FAQ depth, entity clarity. Separate from the 8-category GEO score; each method returns its own evidence. |
| `geo_crawler_access` | Per-bot AI crawler matrix from robots.txt, grouped by tier (training, search, user): allowed, partial, blocked or missing, plus wildcard-only access and blocked citation bots. |
| `geo_llms_drift` | Compare the deployed /llms.txt against the current sitemap: same-host links that are no longer in the sitemap (stale) and sitemap pages never linked (missing), with a coverage percentage. No per-link HTTP requests, so it is cheap enough to gate a deploy. |
| `geo_content_risks` | Defensive scan of your own page for patterns that suppress citation: hidden text, LLM instructions in copy or comments, invisible Unicode, CTA overload, thin content and keyword stuffing. Findings carry a severity and a fix; nothing is executed. |
| `geo_positioning` | On-page competitive positioning: compare your page against 1-5 competitor URLs and report shared vocabulary (undifferentiated), themes unique to you, themes only competitors cover, and a 0-100 overlap score. Uses public page copy only — no rankings, traffic or SERP data. |
| `geo_platform_readiness` | Per-platform readiness for Google AI Overviews, ChatGPT, Perplexity, Gemini, Microsoft Copilot, Claude and Grok, derived from the GEO audit: score, band, the signals behind it and each engine's main gap. |

## PAP discovery and site building (GeoSuite ports)

Source: `src/tools/geosuite.ts`. Public URLs; MIT-ported from GeoSuite. Nothing is written to third parties.

| Tool | Stable contract |
| --- | --- |
| `poppy_check` | Check /.well-known/poppy.json (Personal Agent Protocol 1.0) the way a personal agent reads it: file present, protocol version, organization domain against the serving host, channels, and the OAuth discovery chain when sign-in is offered. Ported from GeoSuite's MIT poppy-json checker. Read-only. |
| `poppy_generate` | Generate PAP 1.0 discovery and protected-resource proposals. Issuer metadata is returned only when supplied explicitly; endpoints are never fabricated. Lists deployment prerequisites. Ported from GeoSuite's MIT poppy-json generator. |
| `geo_sitemap_build` | Build a sitemap.xml by crawling a site from its homepage: same host only, assets and admin paths skipped, robots.txt honoured, hard caps on pages. Ported from GeoSuite's MIT sitemap-builder. Returns the XML, the URLs kept, what was skipped and why. |

## GA4 custom events

Source: `src/tools/custom-events.ts`. Service-account GA4 read access; optional GTM cross-check.

| Tool | Stable contract |
| --- | --- |
| `list_custom_events` | List all events received in a GA4 property and classify them as standard/recommended vs custom. Useful to discover custom events already being collected. |
| `analyze_custom_event` | Analyze a specific event in GA4: volume, users, daily trend, and classification (custom vs standard). |
| `suggest_custom_event_config` | Propose a ready-to-use GTM configuration for a custom GA4 event: tag type, parameters, trigger, dataLayer example, and implementation steps. Optionally checks if the event is already configured in a GTM workspace. |

## Versioning

This reference is updated in the same pull request as any tool change. The
tool inventory above is generated from the descriptions in `src/tools/*.ts`;
the two must never drift. CI runs the full tool tree (`pnpm test`).
