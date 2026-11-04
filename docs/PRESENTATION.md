# GTM Growth — GTM Pitch & Marketing Guide

> Turn GA4, Search Console, and Core Web Vitals into prioritized actions with Grok.

## Problem

- Ecommerce teams see abandoned carts but not why tracking or speed is the cause.
- Agencies spend hours assembling reports from exports that clients barely read.

## Solution

GTM Growth connects live Google data to an agent. It reads GA4, GTM, Search Console, PageSpeed, and CrUX, then produces a short priority list instead of a raw dump.

## Benefits

| Benefit | Agency | Ecommerce |
|---|---|---|
| Real numbers | Reports cite APIs, not pasted screenshots | Decisions based on live data |
| Cross-source | Ranked pages vs conversion vs speed | Find pages that rank and load slowly |
| Faster reporting | Weekly briefing in one prompt | Executive summary for stakeholders |

## Workflow

1. Connect the MCP server (Service Account + optional API keys).
2. Trust the tracking (`audit_ga4_setup_v2`, ecommerce validation).
3. Measure (traffic, queries, CrUX, PageSpeed).
4. Prioritize (table of pages + 3–5 actions).
5. Act only when writes are explicitly enabled.

## Example prompts

- Give me a traffic briefing for the last 28 days.
- Top Search Console queries and the pages they land on.
- Run a mobile PageSpeed audit on the homepage.
- Which ranked pages are slow in CrUX?
- Draft a one-page monthly client report.

## Capabilities

GA4, GTM web, sGTM, Measurement Protocol, Search Console, Indexing API (gated), PageSpeed, CrUX.

## Safety

Reads are open. Writes need an env flag and `confirm=true`. The Indexing API is officially intended for job postings and livestream structured data.

## Start

- [GROK_SETUP.md](./GROK_SETUP.md)
- [CLAUDE_SETUP.md](./CLAUDE_SETUP.md)
- [CODEX_SETUP.md](./CODEX_SETUP.md)
- [../README.md](../README.md)
