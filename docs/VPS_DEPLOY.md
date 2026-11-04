# Deploy GTM Growth on a VPS (Docker + Caddy)

This guide stands up a public, HTTPS-protected MCP server on a VPS so it can be
wired into xAI Grok via **Grok Connectors (Custom)** or the **Remote MCP Tools
API**. The stack is: `ga-grok-app` (Node, Streamable HTTP `/mcp`) behind
**Caddy** (automatic Let's Encrypt TLS) with a **Redis** cache.

## Prerequisites
- A VPS with Docker Engine + Docker Compose v2 installed (the shared VPS
  `vps-OpenDPE.vps.ovh.net`).
- A domain (or the VPS's own resolvable hostname) with an **A/AAAA record
  pointing at the VPS public IP**. Let's Encrypt needs a publicly resolvable
  domain — a bare IP address cannot get a trusted certificate, which Grok
  requires for outbound calls.
- Inbound firewall open on **80/tcp** and **443/tcp** (Caddy ACME + serving).
- A Google service-account JSON with read access to the GA4 / GTM resources.

## Steps
1. Copy the environment template and fill it in:
   ```bash
   cd deploy
   cp .env.prod.example .env.prod
   # edit .env.prod: SITE_ADDRESS, CADDY_EMAIL, MCP_API_TOKEN
   ```
   Generate a token: `openssl rand -hex 32`.

2. Place your Google service-account key at `deploy/service-account.json`.

3. Build and start:
   ```bash
   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
   ```

4. Verify:
   ```bash
   curl -fsS https://<SITE_ADDRESS>/health      # expect {"ok":true,...}
   curl -fsS https://<SITE_ADDRESS>/mcp -X POST \
     -H "Authorization: Bearer $MCP_API_TOKEN" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}'
   ```

## Connecting from Grok
- **Grok Connectors → Custom**: URL `https://<SITE_ADDRESS>/mcp`, Auth = Bearer,
  token = the `MCP_API_TOKEN` above.
- **Remote MCP Tools API**: `server_url = "https://<SITE_ADDRESS>/mcp"` with
  `authorization = "Bearer <MCP_API_TOKEN>"`.

## Notes
- The container runs as a non-root user; healthcheck hits `/health`.
- Writes are disabled by default (`GA4_WRITE_ENABLED` / `GTM_WRITE_ENABLED`).
- To rotate the token, edit `.env.prod` and `docker compose ... up -d`.
- For local Grok Build (stdio) use `.grok/config.toml` instead — no TLS needed.
