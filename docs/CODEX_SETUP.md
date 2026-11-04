# Install GTM Growth for Codex

Skill folder: `gtm-growth`. MCP server name: `gtm-growth`.

## Where to put the skill

| Scope | Path |
|-------|------|
| This project (Codex) | `.codex/skills/gtm-growth/` |
| This project (agents) | `.agents/skills/gtm-growth/` |
| Your user | `~/.codex/skills/gtm-growth/` |

Prefer **one** location so you do not load the skill twice.

## Install

```bash
./scripts/install-skill.sh codex
# or
cp -R skills/gtm-growth .codex/skills/gtm-growth
```

`skills/gtm-growth/agents/openai.yaml` sets the display name. Codex reads it; other agents ignore it.

## Connect live data

```bash
npm install && npm run build
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa.json
```

Register the server in Codex MCP settings:

```text
name: gtm-growth
command: node
args: dist/index.js --transport stdio
```

Remote HTTP: `https://your-host.example.com/mcp` with `Authorization: Bearer <MCP_API_TOKEN>` if set.

## Verify

1. Skill `gtm-growth` is listed. Invoke with `$gtm-growth` or ask in plain language.
2. MCP tools are available.
3. Ask: “Traffic overview for the last 7 days.”

If MCP is not connected, the skill must say so and must not invent metrics.
