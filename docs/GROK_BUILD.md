# Package & use GTM Growth with Grok Build

MCP server name: **gtm-growth**. Repo: https://github.com/Geoking2104/GTM-Growth

[Grok Build](https://docs.x.ai/build/overview) loads MCP servers from:

- `~/.grok/config.toml` (user)
- **Project** `.grok/config.toml` (this repo ships one)
- Compatible `.mcp.json` / Cursor / Claude configs
- Plugins under `.grok/plugins/`

Tools appear as `gtm-growth__<tool_name>`.

---

## Quick start (local stdio)

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd GTM-Growth
npm install && npm run build

export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
export GA4_PROPERTY_ID=123456789

grok inspect
grok mcp doctor gtm-growth

cd GTM-Growth && grok
```

### One-liner register (project scope)

```bash
grok mcp add --scope project gtm-growth -- node dist/index.js --transport stdio
```

### User-level register

```bash
grok mcp add gtm-growth -- node /ABS/PATH/GTM Growth/dist/index.js --transport stdio
```

---

## Remote HTTP

```bash
grok mcp add --transport http gtm-growth https://your-host.example.com/mcp
```

Or [grok.com/connectors](https://grok.com/connectors) → New Connector → Custom → paste the `/mcp` URL.

---

## Compatibility files

| File | Purpose |
|------|---------|
| `.grok/config.toml` | Project MCP registration (`gtm-growth`) |
| `.mcp.json` | Claude Code / Cursor / Grok vendor MCP merge |
| `.grok/plugins/gtm-growth/` | Plugin stub |

---

## TUI tips

- `/mcps` — list / toggle servers
- `grok mcp list` / `grok mcp doctor gtm-growth`
- Logs: `~/.grok/logs/mcp/gtm-growth.stderr.log`

If you still have an old `ga-to-grok` server entry, remove it so tools are not listed twice.
