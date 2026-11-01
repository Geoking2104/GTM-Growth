# Google Growth

**Open-source MCP server** connecting **Google Analytics 4**, **Google Tag Manager** (web + **server-side**), **Measurement Protocol**, **Search Console**, the **Indexing API**, **PageSpeed Insights**, and **CrUX** to **Grok** (xAI), **Claude** (Anthropic), **Codex** (OpenAI), and any MCP-capable agent.

The agent reads live Google data, audits setups, crosses organic search with site speed, and (when explicitly enabled) submits sitemaps or notifies the Indexing API — via **MCP tools** or a **CLI**. Skill, MCP server, and GitHub repo are all named **google-growth**.

| Client | How to connect | Skill install |
|--------|----------------|---------------|
| **Grok** (xAI) | [grok.com/connectors](https://grok.com/connectors) or Grok Build | Agensi zip of `skills/google-growth/` |
| **Claude** (Anthropic) | Claude Code MCP / `.mcp.json` | `.claude/skills/google-growth/` — [docs/CLAUDE_SETUP.md](docs/CLAUDE_SETUP.md) |
| **Codex** (OpenAI) | Codex MCP settings | `.codex/skills/google-growth/` — [docs/CODEX_SETUP.md](docs/CODEX_SETUP.md) |

> Compatible with **Grok**, **Claude Code**, **Codex**, Cursor (`.mcp.json`), and self-hosted deployments.  
> **Apache-2.0** license · Node ≥ 20

---

## Why use it (vs a classic LLM)

| Classic LLM | Google Growth |
|-------------|---------------|
| Works on pasted exports and screenshots | Calls Google APIs directly |
| Can invent numbers | Cites only tool results |
| One source at a time, manual | Crosses GA4, Search Console, PageSpeed, CrUX |
| Advice only | Can act (gated writes) |
| Method changes every chat | Reproducible workflows (skill + agents) |

### For marketers

1. **Real numbers** — traffic, queries, Core Web Vitals come from the APIs.
2. **Less friction** — no export → paste → reformat loop.
3. **Cross-source insight** — pages that rank well but convert poorly, or rank well and load slowly.
4. **Detailed growth dashboards** — period-over-period KPI scorecards, at least 10 evidence-backed watch points, and exactly 3 priorities for short, medium, and long term.
5. **Safe by default** — reads are open; writes need flags + `confirm=true`.

The agent-facing method lives in [`skills/google-growth/`](skills/google-growth/) (same skill for Agensi, Claude, and Codex).

---

## What you can do

| Domain | Capabilities |
|--------|----------------|
| **GA4** | Reports, realtime, traffic, acquisition, devices, events, ecommerce analysis |
| **GTM Web** | Tags, triggers, variables, GA4 audit v2, ecommerce schema validation |
| **sGTM** | List server containers, clients, MP client audit, dual-tagging, cutover, health |
| **Measurement Protocol** | List/verify secrets, suggest config, create secrets (write), direct + sGTM modes |
| **Search Console** | Sites, sitemaps, Search Analytics (queries, pages, devices, countries), URL inspection |
| **Indexing API** | Notify Google of URL updates/deletes (gated); read notification metadata |
| **PageSpeed & CrUX** | Lighthouse lab scores and real-user Core Web Vitals |
| **Growth dashboards** | Cross-channel KPI summaries, data-confidence checks, 10+ watch points, and 3 horizon-based priorities with implementation and measurement plans |
| **GEO / AEO** | 0–100 AI-search-readiness audit across robots.txt, llms.txt, schema, meta, content, brand, signals and AI discovery; llms.txt / JSON-LD / robots.txt generators |
| **Custom events** | Discover, analyze, suggest GTM config; Phase 3 write (trigger + tag) |
| **Ops** | CLI per step, Redis cache, Docker, GitHub Actions CI + live validation |

---

## Architecture (high level)

```text
     ┌─────────┐   ┌────────────┐   ┌─────────┐
     │  Grok   │   │   Claude   │   │  Codex  │
     │  (xAI)  │   │ (Anthropic)│   │ (OpenAI)│
     └────┬─────┘   └─────┬──────┘   └────┬─────┘
          └───────────────┬─────────────┘
                       │ MCP (stdio or HTTPS /mcp)
                       ▼
              ┌───────────────────┐
              │   google-growth   │
              │  Service Account  │
              └─────────┬─────────┘
     ┌─────────────────┼───────────────────┐
     ▼              ▼              ▼
 GA4 Data/Admin  GTM Web + sGTM  Search Console
 + MP secrets    tags / clients  + Indexing API
                                 + PageSpeed / CrUX
```

---

## Connect — pick your client

| Client | Best path | Guide |
|--------|-----------|-------|
| **Grok** | Custom Connector (HTTPS) or Grok Build (stdio) | [docs/GROK_SETUP.md](docs/GROK_SETUP.md) |
| **Claude** | `.mcp.json` (this repo) + skill in `.claude/skills/` | [docs/CLAUDE_SETUP.md](docs/CLAUDE_SETUP.md) |
| **Codex** | MCP settings + skill in `.codex/skills/` | [docs/CODEX_SETUP.md](docs/CODEX_SETUP.md) |

Install the skill for Claude and Codex:

```bash
./scripts/install-skill.sh both          # copy into .claude and .codex
./scripts/install-skill.sh claude --link # symlink
./scripts/install-skill.sh codex --user  # user-wide
```

Recommended for a marketing team: deploy the server once (HTTPS), invite the Service Account to GA4 / GTM / Search Console, add optional PageSpeed and CrUX keys, then connect the client of your choice.

Step-by-step: [`skills/google-growth/references/setup.md`](skills/google-growth/references/setup.md)

---

## 1. Prerequisites

1. **Google Cloud project** with APIs enabled:
   - Google Analytics Data API
   - Google Analytics Admin API
   - Tag Manager API
   - Search Console API (for SEO tools)
2. **Service Account** JSON key
3. Grant the SA email:
   - GA4 property: **Viewer** (or Editor if you create MP secrets)
   - GTM accounts: **Read** (or **Edit** for Phase 3 tag creation)
   - Search Console property: user with access (write if submitting sitemaps)
4. Optional API keys for performance tools (`PAGESPEED_API_KEY`, `CRUX_API_KEY`, or `GOOGLE_API_KEY`)
5. Node.js **≥ 20**

### Scopes used

```text
analytics.readonly
analytics.edit                    # MP secret creation
tagmanager.readonly
tagmanager.edit.containers        # Phase 3 GTM writes
webmasters.readonly               # Search Console read
webmasters                        # sitemap submit (gated)
indexing                          # Indexing API (gated)
```

Writes are gated by `confirm=true`, optional `dryRun`, and env flags (all **disabled by default**):

```bash
GA4_WRITE_ENABLED=true
GTM_WRITE_ENABLED=true
SEARCH_CONSOLE_WRITE_ENABLED=true
INDEXING_WRITE_ENABLED=true
```

### Reliability & safety features

- **Input validation (zod):** every tool validates its arguments. Invalid arguments are rejected before any Google API call.
- **Enriched errors:** Google failures surface `status` + `reason` (e.g. `[status 403 | permissionDenied]`).
- **Retry & pagination:** gaxios retries on 429/5xx; `run_report` paginates past GA4's row cap.
- **HTTP auth:** set `MCP_API_TOKEN` on any remote deployment; clients send `Authorization: Bearer <token>`.
- **Logging:** `LOG_LEVEL` (`debug` | `info` | `warn` | `error`). Logs stay on stderr so STDIO keeps stdout for MCP.

---

## 2. Install & configure

```bash
git clone https://github.com/Geoking2104/Google-Growth.git
cd google-growth
npm install
cp .env.example .env
```

Edit `.env`:

```bash
# Auth (pick one)
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa.json
# or
GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'

# Optional defaults
GA4_PROPERTY_ID=123456789

# Transport
TRANSPORT=stdio          # or http
PORT=3000

# Optional performance keys
PAGESPEED_API_KEY=
CRUX_API_KEY=
# or GOOGLE_API_KEY=

# Optional Redis
REDIS_URL=redis://localhost:6379

# Optional HTTP auth (recommended for any remote/public deployment).
# MCP_API_TOKEN=change-me-to-a-long-random-string

LOG_LEVEL=info

# Safety: writes DISABLED by default.
GA4_WRITE_ENABLED=false
GTM_WRITE_ENABLED=false
SEARCH_CONSOLE_WRITE_ENABLED=false
INDEXING_WRITE_ENABLED=false
```

Build:

```bash
npm run build
```

---

## 3. Client packaging

| File | Role |
|------|------|
| `.grok/config.toml` | Grok Build MCP server (`google-growth`) |
| `.mcp.json` | Claude Code / Cursor / Codex local stdio |
| `skills/google-growth/` | Canonical skill (Agensi, Claude, Codex) |
| `skills/google-growth/agents/openai.yaml` | Codex display metadata |
| `skills/ga-to-grok/` | Redirect to google-growth |
| `scripts/install-skill.sh` | Copies the skill into `.claude` and `.codex` |
| `docs/CLAUDE_SETUP.md` | Anthropic Claude Code |
| `docs/CODEX_SETUP.md` | OpenAI Codex |
| `docs/GROK_SETUP.md` | Grok connectors + Build |

### Grok

```bash
grok mcp add --scope project google-growth -- node dist/index.js --transport stdio
# or remote
grok mcp add --transport http google-growth https://your-host.example.com/mcp
```

Or [grok.com/connectors](https://grok.com/connectors) → New Connector → Custom → `https://your-server.com/mcp`.

### Claude (Anthropic)

```bash
./scripts/install-skill.sh claude
# MCP: this repo's .mcp.json after npm run build
```

Guide: [docs/CLAUDE_SETUP.md](docs/CLAUDE_SETUP.md)

### Codex (OpenAI)

```bash
./scripts/install-skill.sh codex
```

Guide: [docs/CODEX_SETUP.md](docs/CODEX_SETUP.md)

---

## 4. Run the MCP server

```bash
npm run start:stdio          # local
npm run start:http           # http://localhost:3000/mcp  and  /sse
docker compose up -d         # see docs/DEPLOYMENT.md
```

---

## 5. Skill for Agensi, Claude, and Codex

Canonical skill: `skills/google-growth/` (`SKILL.md` + `references/`).

| Agent | Install path | Guide |
|-------|----------------|-------|
| Agensi / Grok | zip of `google-growth/` | below |
| Claude Code | `.claude/skills/google-growth/` or `~/.claude/skills/google-growth/` | [docs/CLAUDE_SETUP.md](docs/CLAUDE_SETUP.md) |
| Codex | `.codex/skills/google-growth/` or `~/.codex/skills/google-growth/` | [docs/CODEX_SETUP.md](docs/CODEX_SETUP.md) |

The skill does not replace MCP. Connect the server (stdio or HTTPS) or the agent will refuse to invent numbers.

Agensi zip:

```text
google-growth/
  SKILL.md
  VERSION.txt
  references/
```

---

## 6. CLI — full validation workflow

```bash
npm run cli -- help
npm run cli -- list-properties
npm run cli -- list-search-sites
npm run cli -- pagespeed --url https://example.com/
npm run cli -- audit-web --account WEB --container WEB --property 123
```

Full reference: [docs/CLI.md](docs/CLI.md)

---

## 7. Main MCP tools

### GA4

| Tool | Description |
|------|-------------|
| `list_properties` / `get_property_details` | Discovery |
| `get_traffic_overview` | Users, sessions, bounce rate… |
| `get_top_pages` / `get_acquisition` / `get_devices` | Breakdowns |
| `get_events_summary` / `run_report` / `run_realtime_report` | Events & reports |
| `analyze_ecommerce_data` | Funnel, revenue, AOV, data quality |

### GTM Web / sGTM / MP

| Tool | Description |
|------|-------------|
| `audit_ga4_setup_v2` | Full audit + optional live GA4 |
| `find_tags_by_trigger` / `find_tags_using_variable` | Reverse lookup: tags a trigger fires or blocks; tags using a variable |
| `detect_duplicate_tags` / `get_built_in_variables` | Duplicate GA4 tags; enabled built-in variables |
| `validate_ecommerce_events` | Official ecommerce schema |
| `create_ga4_event_setup` | Phase 3 write (confirm required) |
| `audit_sgtm_setup` / `compare_dual_tagging` / `cutover_checklist` | Server-side path |
| `verify_ga4_secrets` / `configure_measurement_protocol` | Secrets & setup |

### Search Console

| Tool | Description |
|------|-------------|
| `list_search_console_sites` / `get_search_console_site` | Properties |
| `list_sitemaps` / `get_sitemap` / `submit_sitemap` | Sitemaps (submit is gated) |
| `get_search_overview` / `get_top_queries` / `get_top_search_pages` | Performance |
| `get_query_page_pairs` / `get_search_by_device` / `get_search_by_country` / `get_search_trend` | Breakdowns |
| `inspect_url` / `inspect_urls` | Index status |

### Indexing API

| Tool | Description |
|------|-------------|
| `get_url_notification_metadata` | Last notify status |
| `publish_url_notification` / `publish_url_notifications` | URL_UPDATED / URL_DELETED (gated) |

### PageSpeed & CrUX

| Tool | Description |
|------|-------------|
| `run_pagespeed` / `run_pagespeed_batch` | Lighthouse lab scores |
| `query_crux` / `query_crux_batch` | Real-user Core Web Vitals |

### GEO — AI search readiness

| Tool | Description |
|------|-------------|
| `geo_audit` | Score one URL 0–100 across 8 categories, with evidence per check and prioritized fixes |
| `geo_audit_sitemap` | Sample the sitemap (≤25 pages): site average, weakest pages, checks failing across the site |
| `geo_generate_llms_txt` | Generate `/llms.txt` from the sitemap |
| `geo_generate_schema` | Generate rich JSON-LD (website, organization, faq, article, product, localbusiness) |
| `geo_generate_robots` | Append-only robots.txt fix; blocked bots are reported, never overridden |

All GEO tools are read-only. Rubric, bands and limits: [docs/GEO.md](docs/GEO.md).

Full catalog for agents: [`skills/google-growth/references/tools.md`](skills/google-growth/references/tools.md)

---

## 8. Standard workflows

### Weekly analytics briefing

`list_properties` → `get_traffic_overview` → acquisition / pages / devices → events → ecommerce if relevant.

### SEO & performance audit

`list_search_console_sites` → `get_top_search_pages` → `query_crux` → `run_pagespeed` → optional `inspect_url` → priority table + 3–5 actions.

### Detailed growth dashboard

For a full cross-channel audit, the skill compares the last 28 complete days with the previous 28 days by default. It combines GA4, Search Console, CrUX/PageSpeed, and tracking-quality evidence when those sources are available. The report includes an executive readout, KPI scorecard, channel/page/funnel breakdowns, at least 10 distinct watch points, and exactly 3 priorities: short term (0–30 days), medium term (1–3 months), and long term (3–12 months).

Each priority includes implementation steps, an owner/role, dependencies, a success metric, and an expected effect. Impact estimates are ranges or scenarios based on explicit data and assumptions (for example, eligible sessions × tested conversion-rate change × average order value). If the inputs are missing, the report gives a measurable target and explains what data or experiment is needed; it does not invent a revenue forecast. The connected assistant performs the LLM synthesis over MCP results; the server does not make a separate LLM API call.

### GEO / AI search readiness audit

`geo_audit` (homepage) → `geo_audit_sitemap` (≤10 pages) → generate only what is missing (`geo_generate_llms_txt`, `geo_generate_schema`, `geo_generate_robots`) → re-run `geo_audit` and compare the breakdown. Readiness only: the server never queries ChatGPT, Claude or Perplexity, so it cannot claim an engine cites the site.

### Example GEO report

Real `geo_audit` output for `https://stripe.com` (run 2026-10-30, redirected to `/en-fr`). The tool returns the full JSON — score, breakdown, all 42 checks with their evidence, and 12 recommendations; this is how an agent reports it:

**78/100 · good** — 29 of 42 checks pass, 1 partial, 12 fail.

| Category | Points | Max | Finding |
|---|---:|---:|---|
| robots.txt | 15 | 18 | File present; the five citation bots are allowed only through `User-agent: *` → partial credit |
| llms.txt | 16 | 18 | 8,032 words, 31 H2 sections, 308 links; no `/llms-full.txt` |
| Schema JSON-LD | 10 | 16 | WebSite + Organization at 5.5 attributes per object (rich); no FAQPage, no Article |
| Meta tags | 14 | 14 | Title 54 chars, description 148, canonical, full Open Graph |
| Content | 12 | 12 | 1,890 words, 5 H2 / 25 H3, 5 lists, figures in the first 30% |
| Brand & Entity | 8 | 10 | 3/4 Knowledge Graph pillars; schema and meta descriptions disagree; no dated articles |
| Signals | 3 | 6 | `lang="en-FR"`; no RSS link; no `dateModified` |
| AI discovery | 0 | 6 | `/.well-known/ai.txt`, `/ai/summary.json`, `/ai/faq.json`, `/ai/service.json` all 404 |

**Prioritized fixes** — returned in this order (priority first, then points recovered):

| # | Priority | Check | +Pts | Action |
|---|---|---|---:|---|
| 1 | high | `robots.citation_bots` | 3 | Add explicit `User-agent` rules for OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, Applebot instead of relying on `*` |
| 2 | medium | `schema.faq` | 3 | Mark up the site FAQ as FAQPage |
| 3 | medium | `schema.article` | 3 | Add Article/BlogPosting with author and `dateModified` |
| 4 | medium | `llms.full` | 2 | Publish `/llms-full.txt` and link it from `llms.txt` |
| 5 | low | `signals.rss` | 2 | Link the RSS feed in `<head>` |
| 6 | low | `ai_discovery.summary` | 2 | Publish `/ai/summary.json` with name and description |

No blockers: no `noindex`, no `noai`. One zero-point finding is still reported — 25 of 29 images lack alt text. `geo_audit_sitemap --max-urls 2` on the same site averaged 68/100 across the homepage (78) and `/legal` (57).

### Before / after

The same audit on a fixture site — a normal day-one page (title, H1, one sentence), no robots.txt, no llms.txt, no structured data — and then after applying what this server generates (robots.txt, llms.txt, JSON-LD) plus the editorial fixes the audit asks for (meta tags, an answer with figures in the first 30%, H2/H3, a list, an FAQ). Reproduce offline with `npm run build && npm run demo:geo`:

| Category | Before | After | Max |
|---|---:|---:|---:|
| robots.txt | 0 | 18 | 18 |
| llms.txt | 0 | 14 | 18 |
| Schema JSON-LD | 0 | 16 | 16 |
| Meta tags | 5 | 14 | 14 |
| Content | 2 | 12 | 12 |
| Brand & Entity | 2 | 10 | 10 |
| Signals | 0 | 6 | 6 |
| AI discovery | 0 | 6 | 6 |
| **Total** | **9** | **96** | **100** |

Bands: critical → excellent. The 4 points still missing are llms.txt depth: a file under 1,000 words cannot earn `llms.depth` and `llms.depth_high`. Nothing else is left on the table, which is the point — the rubric tells you when to stop.

### Server-side tracking / cutover

See [docs/SERVER_SIDE_TRACKING_ARCHITECTURE.md](docs/SERVER_SIDE_TRACKING_ARCHITECTURE.md).

Example report shapes: [`skills/google-growth/references/examples.md`](skills/google-growth/references/examples.md)

---

## 9. CI/CD

| Workflow | When | What |
|----------|------|------|
| **CI** | push / PR | typecheck + lint + test + build + CLI smoke |
| **Validate** | manual (+ optional weekly cron) | live pipeline with SA secret |

```bash
npm run lint
npm test
npm run typecheck
```

→ [docs/CI_CD.md](docs/CI_CD.md)

---

## 10. Documentation index

| Doc | Content |
|-----|---------|
| **[skills/google-growth/SKILL.md](skills/google-growth/SKILL.md)** | **Shared agent skill** |
| **[docs/CLAUDE_SETUP.md](docs/CLAUDE_SETUP.md)** | **Anthropic Claude Code** |
| **[docs/CODEX_SETUP.md](docs/CODEX_SETUP.md)** | **OpenAI Codex** |
| **[docs/GROK_SETUP.md](docs/GROK_SETUP.md)** | **Grok connectors + Build** |
| [skills/google-growth/references/setup.md](skills/google-growth/references/setup.md) | Connect — 3 solutions |
| [PRESENTATION.md](docs/PRESENTATION.md) | Pitch & marketing guide |
| [GROK_BUILD.md](docs/GROK_BUILD.md) | Grok Build packaging |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker / Fly / Railway |
| [CLI.md](docs/CLI.md) | All CLI commands |
| [GEO.md](docs/GEO.md) | GEO rubric, tools, limits |
| [CI_CD.md](docs/CI_CD.md) | GitHub Actions |
| [GTM_INTEGRATION.md](docs/GTM_INTEGRATION.md) | GTM ↔ GA4 specs |
| [PHASE3_WRITE.md](docs/PHASE3_WRITE.md) | Controlled GTM writes |
| [MEASUREMENT_PROTOCOL.md](docs/MEASUREMENT_PROTOCOL.md) | MP setup |
| [SERVER_SIDE_TRACKING_ARCHITECTURE.md](docs/SERVER_SIDE_TRACKING_ARCHITECTURE.md) | sGTM architecture |
| [CACHING.md](docs/CACHING.md) | Redis |

---

## 11. Project layout

```text
.grok/config.toml              # Grok Build MCP (server name: google-growth)
.mcp.json                      # Claude / Cursor / Codex local stdio
skills/google-growth/          # canonical skill
  agents/openai.yaml           # Codex appearance metadata
skills/ga-to-grok/             # redirect to google-growth
scripts/install-skill.sh       # copies skill into .claude / .codex
src/
  google/                      # data-api, gtm, search-console, indexing, pagespeed, crux
  geo/                         # GEO engine: html, robots, sitemap, audit/*, score, generate/*
  tools/                       # tool definitions + zod schemas
  auth/ cache/ utils/
docs/
  CLAUDE_SETUP.md
  CODEX_SETUP.md
  GROK_SETUP.md
```

---

## License

Apache-2.0

---

Built by [Geoking2104](https://github.com/Geoking2104) / **KayrosLab** for Grok, Claude, and Codex.
