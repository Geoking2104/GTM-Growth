# Install GTM Growth for Codex

Skill folder: `google-growth`. MCP server name: `google-growth`.

## Where to put the skill

| Scope | Path |
|-------|------|
| This project (Codex) | `.codex/skills/google-growth/` |
| This project (agents) | `.agents/skills/google-growth/` |
| Your user | `~/.codex/skills/google-growth/` |

Prefer **one** location so you do not load the skill twice.

## Install

```bash
./scripts/install-skill.sh codex
# or
cp -R skills/google-growth .codex/skills/google-growth
```

`skills/google-growth/agents/openai.yaml` sets the display name. Codex reads it; other agents ignore it.

## Connect live data

```bash
npm install && npm run build
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/sa.json
```

Register the server in Codex MCP settings:

```text
name: google-growth
command: node
args: dist/index.js --transport stdio
```

Remote HTTP: `https://your-host.example.com/mcp` with `Authorization: Bearer <MCP_API_TOKEN>` if set.

## Verify

1. Skill `google-growth` is listed. Invoke with `$google-growth` or ask in plain language.
2. MCP tools are available.
3. Ask: “Traffic overview for the last 7 days.”

If MCP is not connected, the skill must say so and must not invent metrics.
