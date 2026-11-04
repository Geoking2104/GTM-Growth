# Deployment Guide — GTM Growth

This document covers production deployment with Docker, Fly.io and Railway, including Redis caching.

## 1. Prerequisites

- Service Account JSON key with **Viewer** on GA4, **Read** on GTM, and access on Search Console if you use those tools
- Optional API keys for PageSpeed Insights and CrUX
- (Recommended) A Redis instance for caching

## 2. Local with Docker Compose (easiest)

```bash
cp /path/to/your-service-account.json ./service-account.json
export GA4_PROPERTY_ID=123456789
export PAGESPEED_API_KEY=...
export CRUX_API_KEY=...

docker compose up -d --build
```

Server: `http://localhost:3000`  
MCP: `http://localhost:3000/mcp`  
Legacy SSE: `http://localhost:3000/sse`

Redis is included automatically. Writes stay disabled unless you set the flags to `true`.

---

## 3. Fly.io (recommended for Grok)

### Secrets

```bash
fly secrets set GOOGLE_CREDENTIALS_JSON="$(cat service-account.json)"
fly secrets set REDIS_URL="redis://default:...@..."
fly secrets set GA4_PROPERTY_ID=123456789
fly secrets set PAGESPEED_API_KEY=...
fly secrets set CRUX_API_KEY=...
# leave write flags unset or false
fly secrets set GA4_WRITE_ENABLED=false
fly secrets set SEARCH_CONSOLE_WRITE_ENABLED=false
fly secrets set INDEXING_WRITE_ENABLED=false
```

Public URL: `https://gtm-growth.fly.dev/mcp`

---

## 4. Railway

```
GOOGLE_CREDENTIALS_JSON = {paste the full JSON}
REDIS_URL = ${{Redis.REDIS_URL}}
GA4_PROPERTY_ID = 123456789
PAGESPEED_API_KEY = ...
CRUX_API_KEY = ...
TRANSPORT = http
PORT = 3000
GA4_WRITE_ENABLED = false
GTM_WRITE_ENABLED = false
SEARCH_CONSOLE_WRITE_ENABLED = false
INDEXING_WRITE_ENABLED = false
```

Endpoint: `https://your-app.up.railway.app/mcp`

---

## 5. Environment variables summary

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | ★ | Path to service-account.json |
| `GOOGLE_CREDENTIALS_JSON` | ★ | Alternative: full JSON content |
| `REDIS_URL` | Recommended | Redis connection string |
| `GA4_PROPERTY_ID` | Optional | Default property |
| `PAGESPEED_API_KEY` / `CRUX_API_KEY` / `GOOGLE_API_KEY` | Optional | Performance tools |
| `MCP_API_TOKEN` | Recommended on public hosts | Bearer token for `/mcp` |
| `GA4_WRITE_ENABLED` | Optional | Default false |
| `GTM_WRITE_ENABLED` | Optional | Default false |
| `SEARCH_CONSOLE_WRITE_ENABLED` | Optional | Sitemap submit |
| `INDEXING_WRITE_ENABLED` | Optional | URL notifications |

★ One of the two Google auth methods is required.

---

## 6. Connecting to Grok

1. Open [grok.com/connectors](https://grok.com/connectors)
2. **New Connector → Custom**
3. Paste: `https://your-public-url/mcp`
4. Save and start chatting

Recommended first prompts:

- "List my GA4 properties"
- "Give me a traffic overview for the last 7 days"
- "Top Search Console queries for the last 28 days"
- "Run PageSpeed on the homepage"
