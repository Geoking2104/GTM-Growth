# GTM Growth

Agent skill for live **GA4**, **GTM**, **Search Console**, **PageSpeed**, and **CrUX**.

It teaches the agent how to brief, audit, and prioritize. It does **not** include credentials or the MCP server.

## What you get

- Weekly analytics briefings from real API data
- Detailed cross-channel dashboards with period-over-period KPIs, 10+ evidence-backed watch points, and a 3-horizon action plan
- SEO and performance priority tables (Search Console + CrUX + PageSpeed)
- GEO / AEO audits: 0–100 AI-search-readiness score, per-check evidence, and llms.txt / JSON-LD / robots.txt generators
- GTM and server-side tracking audits
- Gated writes only (sitemap, Indexing API, GTM tags)

## Prerequisite

Connect the open-source MCP server: https://github.com/Geoking2104/GTM-Growth

Without that connection the skill explains setup and refuses to invent numbers.

## Install

Unzip so `SKILL.md` sits at the root of `gtm-growth/`:

```text
gtm-growth/
  SKILL.md
  README.md
  VERSION.txt
  references/
  agents/
```

| Agent | Path |
|-------|------|
| Claude | `~/.claude/skills/gtm-growth/` |
| Codex | `~/.codex/skills/gtm-growth/` |
| Cursor | `~/.cursor/skills/gtm-growth/` |

## License

Apache-2.0
