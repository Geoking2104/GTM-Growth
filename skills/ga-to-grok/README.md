# ga-to-grok skill

Expert workflows for **Google Analytics 4**, **Google Tag Manager** (web + server-side), and **Measurement Protocol** via the open-source [GTM Growth MCP server](https://github.com/Geoking2104/GTM-Growth).

## What this skill does

It teaches an AI agent how to:

- Discover and call the correct MCP tools
- Sequence analytics briefings, GTM audits, ecommerce validation, and sGTM dual-tagging / cutover
- Stay safe on writes (dry-run first, never publish, never expose secrets)

## Prerequisites

This skill **does not** contain credentials or the MCP server itself.

You must:

1. Deploy or run the [GTM Growth MCP server](https://github.com/Geoking2104/GTM-Growth) (Docker, Fly, Railway, VPS, or local).
2. Authenticate it with a Google Service Account that has access to your GA4 property (and GTM accounts if needed).
3. Connect the server to your agent (Custom Connector with HTTPS `/mcp` or `/sse`, or local stdio).

Until the MCP tools appear in the agent, the skill can only give setup instructions — it cannot return live data.

## Packaging

This folder is ready to zip for marketplaces such as Agensi:

```
ga-to-grok/
├── SKILL.md
├── README.md
└── references/
    ├── setup.md
    ├── tools.md
    └── sgtm.md
```

License: Apache-2.0 (same as the MCP server).
