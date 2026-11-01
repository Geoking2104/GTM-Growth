---
name: google-growth
description: Use live Google Analytics 4, Tag Manager, Search Console, PageSpeed, and CrUX for growth briefings, detailed KPI dashboards, cross-channel audits, and SEO recommendations, plus GEO/AEO audits that score whether AI answer engines can read and cite a site. Trigger on GA4, GTM, Search Console, PageSpeed, CrUX, ecommerce, dashboards, traffic reports, SEO audits, GEO, AEO, AI search readiness, llms.txt, or when the user mentions Google Growth.
license: Apache-2.0
compatibility: Requires the google-growth MCP server (stdio or HTTPS). Works with Grok, Claude, and Codex.
metadata:
  source: https://github.com/Geoking2104/Google-Growth
  version: "0.14.0"
  display_name: Google Growth
external_urls:
  - https://github.com/Geoking2104/Google-Growth
  - https://grok.com/connectors
  - https://analyticsdata.googleapis.com
  - https://analyticsadmin.googleapis.com
  - https://tagmanager.googleapis.com
  - https://searchconsole.googleapis.com
  - https://indexing.googleapis.com
  - https://www.googleapis.com/pagespeedonline
  - https://chromeuxreport.googleapis.com
---

# Google Growth

Work with **GA4 + GTM + Search Console + PageSpeed + CrUX + GEO** via the **google-growth** MCP server.

Source: https://github.com/Geoking2104/Google-Growth

This skill is for marketers, growth teams, and agencies who want answers from live Google data — not from pasted screenshots. It works with Grok, Claude, and Codex.

**Prerequisite:** The `google-growth` MCP server must be running and connected. The skill never stores credentials. If tools are missing, stop and explain setup (see `references/setup.md`). Do not invent metrics.

## Why use this skill (vs a classic LLM)

| Classic LLM | Google Growth |
|---|---|
| Works on what you paste (exports, screenshots) | Calls Google APIs directly |
| Can invent numbers | Cites only tool results |
| One source at a time, manual | Crosses GA4, Search Console, PageSpeed, CrUX |
| Advice only | Can act (gated writes: GTM, sitemap, Indexing API) |
| Method changes every chat | Reproducible workflows |

### Concrete benefits for marketers

1. **Real numbers** — traffic, queries, Core Web Vitals come from the APIs, not from memory.
2. **Less friction** — no export → paste → reformat loop. Ask in plain language.
3. **Cross-source insight** — pages that rank well but convert poorly, or rank well and load slowly.
4. **Prioritized actions** — reports end with a short list of what to fix first.
5. **Safe by default** — reads are open; writes need explicit flags + `confirm=true`.
6. **Reusable** — an agent can run the same briefing or SEO audit every week.

## First action every session

1. Discover live MCP tools. Names vary by prefix (`google-growth__…` or a custom connector name).
   - Search for tools containing `ga4`, `gtm`, `search_console`, `pagespeed`, `crux`, `indexing`.
2. If nothing matches, the MCP is not connected. Explain the shortest path in `references/setup.md`. Do not invent numbers.
3. Call tools with the exact discovered name. Prefer business tools over raw `run_report`.

## How to choose a tool

| User intent | Tool |
|---|---|
| List GA4 properties | `list_properties` |
| Traffic overview | `get_traffic_overview` |
| Top pages / channels / devices | `get_top_pages`, `get_acquisition`, `get_devices` |
| Ecommerce | `analyze_ecommerce_data` |
| Search Console sites | `list_search_console_sites` |
| Top queries / pages in Search | `get_top_queries`, `get_top_search_pages` |
| Index status | `inspect_url` |
| Page speed (lab) | `run_pagespeed` |
| Real-user vitals | `query_crux` |
| Submit a sitemap (write) | `submit_sitemap` (gated) |
| AI search readiness (GEO) | `geo_audit`, `geo_audit_sitemap` |
| GTM installed correctly? | `gtm_audit_installation` (page-level), `audit_ga4_setup_v2` (container) |
| Missing `llms.txt` / JSON-LD / AI bot rules | `geo_generate_llms_txt`, `geo_generate_schema`, `geo_generate_robots` |

Full catalog — `references/tools.md`.

Dates: `today`, `yesterday`, `7daysAgo`, `28daysAgo`, or `YYYY-MM-DD`. Default to 7 or 28 days if vague.

## Standard workflows

### A. Weekly analytics briefing (marketer)

1. `list_properties` if needed
2. `get_traffic_overview` (period)
3. `get_acquisition` + `get_top_pages` + `get_devices`
4. `get_events_summary`
5. If ecommerce — `analyze_ecommerce_data`
6. Summarize: users, sessions, top sources, anomalies. Cite dates and property id.

### B. SEO & performance audit

1. `list_search_console_sites` → exact `siteUrl`
2. `get_top_search_pages` (28 days, limit 10–15)
3. `query_crux` on origin (PHONE) and key URLs
4. `run_pagespeed` (mobile) on home + priority pages
5. Optional: `inspect_url` on critical pages
6. Output a priority table:
   - Page | Search clicks | LCP/INP/CLS field | Lab score | Priority
   - Then 3–5 concrete actions

If a source fails (403, no CrUX data, quota), say so and continue with the others. Never invent figures.

### C. Detailed growth dashboard (cross-channel)

Use this workflow when the user asks for a complete audit, a detailed dashboard, a growth plan, or prioritized recommendations. The connected assistant is the LLM that performs the synthesis: retrieve evidence with MCP tools, then reason over the returned results. The MCP server does not expose a separate LLM endpoint; do not claim that a second model call occurred.

#### Collect comparable evidence

1. Resolve the GA4 property and exact Search Console `siteUrl`; state both in the report. Ask for the business objective only if it cannot be inferred (lead generation, ecommerce, subscriptions, etc.).
2. Choose a primary period (default: last 28 complete days) and an equal-length comparison period immediately before it. State exact dates. Respect source freshness and date limits; do not compare mismatched windows.
3. GA4: get traffic overview, acquisition, top pages, devices and events. Add ecommerce analysis when relevant. Include conversion/revenue metrics only when the property actually records them.
4. Search Console: get search overview, top search pages and queries; use query/page pairs or device/country breakdowns when they explain a material change.
5. Performance: query CrUX for the origin and priority URLs (phone first); run mobile PageSpeed on a small representative set. Label CrUX as field data and PageSpeed as lab data.
6. Tracking quality: inspect GTM/GA4 setup and ecommerce events when the findings depend on trustworthy event collection. Treat tracking defects as a confidence limitation on business metrics.
7. Continue when one source fails. Mark it unavailable, explain the consequence, and do not substitute a fabricated value.

#### LLM analysis sequence

Use the current assistant's reasoning in this order and keep evidence separate from interpretation:

1. **Facts:** transcribe metric, value, unit, date window, source, and comparison. Calculate absolute and percentage change only when the denominator is non-zero.
2. **Data confidence:** flag missing properties, sampling/thresholding, low-volume events, attribution gaps, inconsistent date windows, absent CrUX data, and unvalidated tracking. Do not overstate causal conclusions.
3. **Signals:** identify positive and negative changes, anomalies, funnel leakage, channel/page/device differences, search demand/CTR/ranking opportunities, performance bottlenecks, and measurement gaps. Cross-check signals across sources where possible.
4. **Hypotheses:** explain plausible causes as hypotheses, name the evidence that supports them, and state what would confirm or disprove them.
5. **Opportunities:** estimate only from supplied baselines and explicit assumptions. Prefer ranges and formulas; distinguish measured results from forecasts. Label confidence (high / medium / low).
6. **Prioritization:** rank by likely business value, evidence strength, effort, dependency, and time to learn. Do not rank solely by a Lighthouse score or traffic volume.

#### Required dashboard output

Write the dashboard in the user's language. Include these sections:

1. **Executive readout:** overall status, decision, biggest positive, biggest risk, and data-confidence level.
2. **Scope & freshness:** GA4 property, Search Console property, exact date ranges, comparison range, timezone if known, sources used/unavailable, and known limitations.
3. **KPI scorecard:** metric | current | comparison | absolute change | relative change | source | status. Cover traffic, acquisition, engagement, conversions/revenue when instrumented, organic search, and performance when data exists. Use “N/D” with a reason for unavailable metrics.
4. **Channel/page/funnel tables:** expose the strongest and weakest useful segments, not just site-wide averages. Include volume so rates are not read without context.
5. **At least 10 distinct watch/change points** for a full audit. Prefer 10–15 across acquisition, landing pages, conversion/funnel, tracking quality, SEO (demand, CTR, position, indexation), mobile/desktop performance, and data quality. Each point must include: observed evidence and source/window; why it matters; recommended change or monitoring step; KPI to watch; effect estimate or a clear reason it cannot yet be quantified; confidence. Avoid duplicate observations. If evidence is insufficient for ten findings, keep unsupported entries explicitly labeled **“à vérifier / hypothèse”** and name the data needed; never invent a defect to reach ten.
6. **Three priority actions, exactly one per horizon:** short term (0–30 days), medium term (1–3 months), long term (3–12 months). For each give owner/role, implementation steps, dependencies, effort estimate, success metric and review date, expected effect as a range or target, calculation/assumptions, and confidence. If a range cannot be defended, give a measurable target and state what baseline or experiment is needed before estimating business impact.
7. **Measurement plan:** event or metric, baseline, target, source, cadence, and experiment/holdout where causal impact matters.

#### Quantifying expected effects safely

- **Ecommerce:** estimated incremental revenue = eligible sessions × tested conversion-rate change × average order value. If value is not instrumented, report conversion/purchase-count opportunity only. Use a conservative range and label it a scenario, not a promise.
- **Lead generation:** estimated incremental leads = eligible sessions × tested conversion-rate change. Estimate revenue only when lead-to-sale rate and value are supplied or measured.
- **Search CTR:** potential additional clicks = impressions × (target CTR − current CTR). Choose the target from the site's own comparable queries/pages at similar positions, or show it as an assumption. Do not use a generic CTR benchmark as a forecast.
- **Performance:** report the CrUX threshold/status and affected traffic. Do not convert a speed-score change into revenue without a site-specific experiment or defensible historical relationship.
- **Tracking repair:** quantify recovered visibility/coverage only when event counts or reconciliation data support it; do not call recovered measurement “incremental revenue.”
- For every forecast show inputs, formula, range, confidence, and the main uncertainty. Never add impacts across overlapping segments or present correlation as causation.

### D. GTM web audit

1. `list_gtm_accounts` → containers → workspaces
2. `audit_ga4_setup_v2`
3. `validate_ecommerce_events` if relevant
4. Report grade, blockers, fixes. Do not publish.

### E. Server-side tracking / cutover

Follow order in `references/sgtm.md`. Do not skip steps.

### F. Custom event (write)

1. Analyze first
2. `suggest_custom_event_config`
3. Write only after explicit confirmation — `dryRun=true` then `confirm=true`

### G. GEO / AI search readiness

1. `geo_audit` on the homepage — report score, band, and the categories with the most recoverable points
2. `geo_audit_sitemap` (maxUrls ≤ 10) when the user wants a site-wide view; lead with `missingAcrossSite`
3. Generate only what the audit flags: `geo_generate_llms_txt`, `geo_generate_schema`, `geo_generate_robots`
4. Re-run `geo_audit` after deployment and compare the breakdown

Readiness only — never claim an engine cites the site. Details — `references/geo.md`.

## Optimal operation (for marketers)

| Solution | Best for | What you need |
|---|---|---|
| **A. Custom Connector (HTTPS)** | Most teams | Someone deploys the server once; you add the URL in the agent |
| **B. Local stdio** | Developers | Clone, build, Service Account on the machine |
| **C. Skill only** | Docs / method | Installs the method, but **no live data** until A or B is done |

Recommended for a marketing team:

1. One technical owner deploys the MCP (Path A).
2. Service Account invited to GA4, GTM, and Search Console.
3. Optional API keys for PageSpeed and CrUX.
4. Connector named `google-growth` added in Grok, Claude, or Codex.
5. Optional: a dedicated agent with the SEO audit workflow saved.

Details — `references/setup.md`.

## Write safety

Writes (GTM tags, sitemap submit, Indexing API, MP secrets) are off by default.

- Never set `confirm=true` unless the user explicitly asked to write.
- Always `dryRun=true` first.
- Server flags (`GA4_WRITE_ENABLED`, `GTM_WRITE_ENABLED`, `SEARCH_CONSOLE_WRITE_ENABLED`, `INDEXING_WRITE_ENABLED`) must be `true`.
- Never print a full secret or Service Account key.

## Common errors

| Symptom | Likely cause | Next step |
|---|---|---|
| Tool not found | MCP not connected | Follow `references/setup.md` |
| 403 | Service Account not invited | Grant Viewer / Read on the property or site |
| Writes blocked | Env flag not `true` | Tell the user; do not retry with confirm |
| Empty results | Narrow dates or no traffic | Widen the range |
| PageSpeed 429 | Quota | Add an API key; reduce batch size |
| No CrUX data | Low traffic page | Fall back to PageSpeed lab |

## Answer style

- Lead with the decision (healthy / needs work / priority pages).
- For a standard question, give 3–7 actions. For a requested full dashboard/audit, follow the dashboard requirements above (10+ watch points and exactly 3 horizon-based priorities).
- Use tables for metrics.
- Separate measured facts, interpretations, hypotheses, and scenario estimates. Cite the MCP tool/source and period next to important figures.
- Do not force an ROI number when the required baseline is missing; show the formula and data needed to quantify it.
- Match the user's language.
- If MCP is missing, give the shortest connect path — do not guess data.

## Source of truth

Repo — https://github.com/Geoking2104/Google-Growth  
Skill name and MCP server name: `google-growth`.

- Setup — `references/setup.md`
- Tool catalog — `references/tools.md`
- sGTM — `references/sgtm.md`
- Example reports — `references/examples.md`
- GEO / AI search readiness — `references/geo.md`
