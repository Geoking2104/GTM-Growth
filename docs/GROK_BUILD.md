# Package & use Google Growth with Grok Build

MCP server name: **google-growth**. Repo: https://github.com/Geoking2104/GTM-Growth

[Grok Build](https://docs.x.ai/build/overview) loads MCP servers from:

- `~/.grok/config.toml` (user)
- **Project** `.grok/config.toml` (this repo ships one)
- Compatible `.mcp.json` / Cursor / Claude configs
- Plugins under `.grok/plugins/`

Tools appear as `google-growth__<tool_name>`.

---

## Quick start (local stdio)

```bash
git clone https://github.com/Geoking2104/GTM-Growth.git
cd google-growth
npm install && npm run build

export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
export GA4_PROPERTY_ID=123456789

grok inspect
grok mcp doctor google-growth

cd google-growth && grok
```

### One-liner register (project scope)

```bash
grok mcp add --scope project google-growth -- node dist/index.js --transport stdio
```

### User-level register

```bash
grok mcp add google-growth -- node /ABS/PATH/Google Growth/dist/index.js --transport stdio
```

---

## Remote HTTP

```bash
grok mcp add --transport http google-growth https://your-host.example.com/mcp
```

Or [grok.com/connectors](https://grok.com/connectors) → New Connector → Custom → paste the `/mcp` URL.

---

## Compatibility files

| File | Purpose |
|------|---------|
| `.grok/config.toml` | Project MCP registration (`google-growth`) |
| `.mcp.json` | Claude Code / Cursor / Grok vendor MCP merge |
| `.grok/plugins/google-growth/` | Plugin stub |

---

## TUI tips

- `/mcps` — list / toggle servers
- `grok mcp list` / `grok mcp doctor google-growth`
- Logs: `~/.grok/logs/mcp/google-growth.stderr.log`

If you still have an old `ga-to-grok` server entry, remove it so tools are not listed twice.
