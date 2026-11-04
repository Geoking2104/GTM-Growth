# Plugin: ga-to-grok

Bundles the **GTM Growth** MCP server for Grok Build.

## Install (from this repo)

```bash
cd /path/to/GTM Growth
npm install && npm run build

# Project scope (recommended while developing in this repo)
grok mcp add --scope project ga-to-grok -- node dist/index.js --transport stdio

# Or rely on committed .grok/config.toml after build
grok inspect
grok mcp doctor ga-to-grok
```

## Remote HTTP (deployed server)

```bash
grok mcp add --transport http ga-to-grok https://YOUR_HOST/sse
```

See [docs/GROK_BUILD.md](../../docs/GROK_BUILD.md).
