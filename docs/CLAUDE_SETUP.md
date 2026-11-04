# Install GTM Growth for Claude Code

Skill folder: `google-growth`. MCP server name: `google-growth`.

## Where to put the skill

| Scope | Path |
|-------|------|
| This project | `.claude/skills/google-growth/` |
| Your user (all projects) | `~/.claude/skills/google-growth/` |

## Install

```bash
./scripts/install-skill.sh claude
# or
cp -R skills/google-growth .claude/skills/google-growth
```

Restart Claude Code so it picks up the skill.

## Connect live data

This repo ships [`.mcp.json`](../.mcp.json):

```json
{
  "mcpServers": {
    "google-growth": {
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

1. Skill `google-growth` is listed.
2. MCP tools are visible (`list_properties`, `get_traffic_overview`).
3. Ask: “List my GA4 properties.”

If tools are missing, the skill explains setup and does not invent numbers.

## Notes

- `name` in SKILL.md must match the folder (`google-growth`).
- Writes stay gated (`confirm=true` + env flags).
