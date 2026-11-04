# Connect Google Growth — practical guide

Source — https://github.com/Geoking2104/GTM-Growth

This guide is for marketers and the person who sets up the tools. You do not need to write code to *use* the skill, but someone must connect the server once.

## What “connected” means

The skill is a method. Live data comes from the **Google Growth MCP server**. Until that server is running and linked to your agent, the skill can only explain setup — it cannot read your Analytics.

## Choose a solution

### Solution A — Custom Connector (recommended for teams)

Best if several people will ask questions in Grok.

1. A technical owner deploys the server with public HTTPS (`TRANSPORT=http`).
2. You add the URL in [grok.com/connectors](https://grok.com/connectors) → New Connector → Custom.
3. URL: `https://your-host.example.com/mcp` (or `/sse` for older clients).
4. Optional: `Authorization: Bearer <MCP_API_TOKEN>` if the server requires it.
5. Save. Tools appear automatically.

**Quick test deploy (owner)**

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd GTM-Growth
npm install && npm run build
# fill .env with credentials
npm run start:http
ngrok http 3000
# then use https://xxxx.ngrok-free.app/mcp in the connector
```

### Solution B — Local stdio (developers)

Best if one person works inside the repo (Grok Build, Cursor, Claude Code).

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd GTM-Growth
npm install && npm run build
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa.json
grok mcp add --scope project ga-to-grok -- node dist/index.js --transport stdio
```

### Solution C — Skill only (no live data)

Installing the skill teaches the agent the workflows and tool names. It does **not** start the server. Use A or B for real reports.

## One-time Google setup (owner)

1. Google Cloud project.
2. Enable APIs:
   - Google Analytics Data API
   - Google Analytics Admin API
   - Tag Manager API (if you use GTM)
   - Search Console API (if you want SEO tools)
3. Create a Service Account and download the JSON key.
4. Invite the Service Account email:
   - GA4 property → **Viewer** (Editor only if creating secrets)
   - GTM account → **Read** (Edit only for tag creation)
   - Search Console property → user with access
5. Optional API keys for performance tools:
   - `PAGESPEED_API_KEY` and/or `CRUX_API_KEY`
   - or a shared `GOOGLE_API_KEY`

## Environment (owner)

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa.json
# or
GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'

GA4_PROPERTY_ID=123456789          # optional default
TRANSPORT=http                     # or stdio
PORT=3000

# Performance (optional but recommended)
PAGESPEED_API_KEY=...
CRUX_API_KEY=...

# Writes OFF by default — leave false unless you intentionally enable them
GA4_WRITE_ENABLED=false
GTM_WRITE_ENABLED=false
SEARCH_CONSOLE_WRITE_ENABLED=false
INDEXING_WRITE_ENABLED=false
```

## Optimal checklist for a marketing team

1. Server deployed (Solution A).
2. Service Account invited on every property you care about.
3. Connector visible in Grok; a test prompt works: “List my GA4 properties”.
4. PageSpeed / CrUX keys set if you want speed audits.
5. Optional: a dedicated agent with the SEO & performance workflow saved.
6. Agree a cadence (e.g. weekly briefing, monthly SEO audit).

## If tools are missing

1. Can the agent list MCP tools? Look for `list_properties` or `get_traffic_overview`.
2. Is the Service Account email invited in GA4 / GTM / Search Console?
3. Are the Google APIs enabled?
4. Does `TRANSPORT` match how you connected (stdio vs HTTP)?
5. Do not invent traffic, revenue, or scores.

## Related docs in the repo

- `docs/GROK_SETUP.md` — connectors vs Build
- `docs/DEPLOYMENT.md` — Docker / Fly / Railway
- `docs/GROK_BUILD.md` — local packaging
