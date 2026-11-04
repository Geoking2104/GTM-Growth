# Install GTM Growth for Claude Code

Skill folder: `gtm-growth`. MCP server name: `gtm-growth`.

## Where to put the skill

| Scope | Path |
|-------|------|
| This project | `.claude/skills/gtm-growth/` |
| Your user (all projects) | `~/.claude/skills/gtm-growth/` |

## Install

```bash
./scripts/install-skill.sh claude
# or
cp -R skills/gtm-growth .claude/skills/gtm-growth
```

Restart Claude Code so it picks up the skill.

## Connect live data

This repo ships [`.mcp.json`](../.mcp.json):

```json
{
  "mcpServers": {
    "gtm-growth": {
      "command": "node",
      "args": ["dist/index.js", "--transport", "stdio"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/sa.json"
      }
    }
  }
}
```

Build first: `npm install && npm run build`.

Remote HTTP: point Claude at `https://your-host/mcp`. Set `MCP_API_TOKEN` on the server and send `Authorization: Bearer <token>`.

## Verify

1. Skill `gtm-growth` is listed.
2. MCP tools are visible (`list_properties`, `get_traffic_overview`).
3. Ask: “List my GA4 properties.”

If tools are missing, the skill explains setup and does not invent numbers.

## Notes

- `name` in SKILL.md must match the folder (`gtm-growth`).
- Writes stay gated (`confirm=true` + env flags).
