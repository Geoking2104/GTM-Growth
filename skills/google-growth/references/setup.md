# Connect Google Growth — practical guide

Source — https://github.com/Geoking2104/GTM-Growth

Skill name and MCP server name: **google-growth**.

This guide is for marketers and the person who sets up the tools. You do not need to write code to *use* the skill, but someone must connect the server once.

## What “connected” means

The skill is a method. Live data comes from the **google-growth MCP server**. Until that server is running and linked to your agent, the skill can only explain setup — it cannot read your Analytics.

## Choose a solution

### Solution A — Custom Connector (recommended for teams)

Best if several people will ask questions in Grok, Claude, or Codex.

1. A technical owner deploys the server with public HTTPS (`TRANSPORT=http`).
2. Add the URL as a custom MCP connector named `google-growth`.
3. URL: `https://your-host.example.com/mcp` (or `/sse` for older clients).
4. Optional: `Authorization: Bearer <MCP_API_TOKEN>` if the server requires it.
5. Save. Tools appear automatically.

### Solution B — Local stdio (developers)

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd google-growth
npm install && npm run build
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa.json
./scripts/install-skill.sh both
```

The project `.mcp.json` and `.grok/config.toml` already register the server as `google-growth`.

### Solution C — Skill only (no live data)

Installing the skill teaches the agent the workflows. It does **not** start the server. Use A or B for real reports.

## One-time Google setup (owner)

1. Google Cloud project.
2. Enable APIs: Analytics Data, Analytics Admin, Tag Manager, Search Console.
3. Create a Service Account and download the JSON key.
4. Invite the Service Account email on GA4, GTM, and Search Console.
5. Optional API keys: `PAGESPEED_API_KEY`, `CRUX_API_KEY`, or `GOOGLE_API_KEY`.

## Environment (owner)

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa.json
GA4_PROPERTY_ID=123456789
TRANSPORT=http
PORT=3000
PAGESPEED_API_KEY=...
CRUX_API_KEY=...
GA4_WRITE_ENABLED=false
GTM_WRITE_ENABLED=false
SEARCH_CONSOLE_WRITE_ENABLED=false
INDEXING_WRITE_ENABLED=false
```

## If you still have an old connector

Remove or rename any connector still called `ga-to-grok`. The server identity is now `google-growth`. Tools are prefixed `google-growth__…`.

## Related docs

- `docs/GROK_SETUP.md`
- `docs/CLAUDE_SETUP.md`
- `docs/CODEX_SETUP.md`
- `docs/DEPLOYMENT.md`
