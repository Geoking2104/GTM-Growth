# Connect Google Growth to Grok

MCP server name: **google-growth**. Repo: https://github.com/Geoking2104/GTM-Growth

Two paths:

1. **Grok Build** (CLI / TUI) — local stdio or remote HTTP → see **[GROK_BUILD.md](GROK_BUILD.md)**
2. **grok.com Connectors** — public HTTPS MCP (`/mcp` or `/sse`)

Claude and Codex use the same skill. See [CLAUDE_SETUP.md](CLAUDE_SETUP.md) and [CODEX_SETUP.md](CODEX_SETUP.md).

---

## A. Grok Build

```bash
cd google-growth && npm install && npm run build
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
grok mcp doctor google-growth
grok   # run inside the repo — uses .grok/config.toml
```

Tools appear as `google-growth__<tool_name>`.

---

## B. grok.com Custom Connector (remote)

### Prerequisites

- Public **HTTPS** endpoint running this server (`TRANSPORT=http`)
- Service Account with access to GA4, GTM (optional), and Search Console (optional)
- Optional API keys: `PAGESPEED_API_KEY`, `CRUX_API_KEY`, or `GOOGLE_API_KEY`

### 1. Credentials

1. Create a Service Account in Google Cloud
2. Enable Analytics Data API, Admin API, Tag Manager API, Search Console API
3. Grant **Viewer** on GA4 / GTM, and access on the Search Console property
4. Provide JSON via `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_CREDENTIALS_JSON`

### 2. Run the server

```bash
npm install && npm run build
npm run start:http
ngrok http 3000
# use https://xxxx.ngrok-free.app/mcp
```

### 3. Add connector

1. [https://grok.com/connectors](https://grok.com/connectors)
2. **New Connector → Custom**
3. Name: `google-growth`
4. URL: `https://your-server.com/mcp` (or `/sse` for legacy clients)
5. Optional auth headers (`Authorization: Bearer <MCP_API_TOKEN>`)
6. Save — tools auto-discover

### 4. Example prompts

- List my GA4 properties
- Traffic overview last 7 days
- Top Search Console queries for the last 28 days
- Run PageSpeed on https://www.example.com
- Audit this GTM container for GA4 ecommerce readiness

---

## Notes

- Grok **web** connectors need a **public** URL (no localhost without a tunnel).
- Prefer business tools (`get_traffic_overview`, `get_top_queries`, `run_pagespeed`).
- Writes stay off unless the matching env flag is `true` and the tool is called with `confirm=true`.
- Old configs named `ga-to-grok` still work if you have not rebuilt. New installs should use `google-growth`.
