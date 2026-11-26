import { mountBillingApi } from "./billing/api.js";
import { mountPoppy } from "./poppy/router.js";
import { crmPluginRouter } from "./crm/plugins.js";
import { buildSocialMcpRouter } from './console/social-mcp.js';
import { socialWorkerRouter } from "./social/worker.js";
import { localWorkerRouter } from "./local-seo/worker.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./tools/index.js";
import { createMcpServer, mountMcpHttp, mountMcpMetadata } from "./mcp/http.js";
import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "./utils/logger.js";
import { mountPublicApi } from "./http/public-api.js";
import { mountReportAccessApi } from "./report-access/router.js";
import { buildCompetitionMcpRouter } from "./console/competition-mcp.js";
import { mountConsoleApi } from "./console/api.js";
import { ecommerceWebhookRouter } from "./console/ecommerce-webhooks.js";
import { startScheduler, stopScheduler } from "./console/ops-scheduler.js";
import { startVisibilityJobs } from "./visibility-jobs/runtime.js";
import { buildDataAgentBridge } from "./data-agent/bridge.js";
import { startAuditRuntime } from "./audit-jobs/runtime.js";
import { mountAuditRoutes } from "./audit-jobs/routes.js";

function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = getVersion();
const SERVER_NAME = "gtm-growth";

export { createMcpServer } from "./mcp/http.js";

export async function startServer(transportType: "stdio" | "http" = "stdio") {
  const server = createMcpServer();

  if (transportType === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("gtm-growth MCP server running on STDIO");
    return;
  }

  // ─── HTTP: SSE (legacy) + Streamable HTTP (modern) ──────────────────
  const app = express();
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "MCP-Session-Id", "Prefer", "Idempotency-Key"],
  }));
  const billing = mountBillingApi(app);
  const cloud = billing?.access;
  app.use("/api/internal/data-agent", buildDataAgentBridge({ cloud }));
  app.use("/api/integrations/commerce/webhooks", ecommerceWebhookRouter());
  app.use("/webhooks", ecommerceWebhookRouter());
  mountPoppy(app, { cloud });
  mountMcpMetadata(app);
  app.use(express.json({ limit: "4mb" }));
  const sessions = mountMcpHttp(app);

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";

  // Health / info (no auth — status only)
  app.get("/", (_req, res) => {
    res.json({
      name: SERVER_NAME,
      version: VERSION,
      status: "ok",
      transport: "http",
      activeSessions: sessions.size,
      tools: tools.map((t) => t.name),
      cache: process.env.REDIS_URL ? "enabled" : "disabled",
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", sessions: sessions.size });
  });

  // Public website API — free read and lead capture (no MCP session needed).
  const auditRuntime = await startAuditRuntime();
  mountAuditRoutes(app, auditRuntime);
  mountPublicApi(app, { audits: auditRuntime?.store });
  mountReportAccessApi(app, { audits: auditRuntime?.store });

  // Console API — Keycloak-protected (OIDC bearer tokens validated via JWKS).
  const visibilityJobs = await startVisibilityJobs(cloud).catch(() => {
    logger.warn("[visibility-jobs] unavailable at startup");
    return null;
  });
  mountConsoleApi(app, { cloud, visibilityJobs: visibilityJobs?.store });
  app.use("/api/internal/local-seo", localWorkerRouter(undefined, cloud));
  app.use("/api/internal/social", socialWorkerRouter(cloud));
  app.use("/api/integrations/crm", crmPluginRouter(cloud));
  app.use("/api/mcp/competition", buildCompetitionMcpRouter({ cloud }));
  app.use("/api/mcp/social", buildSocialMcpRouter({ cloud }));
  // Operations scheduler (T-11): periodic visibility + rank checks per tenant.
  // Opt-in through env so tests, stdio runs and CI stay quiet.
  if (process.env.OPS_SCHEDULER_ENABLED === "true") startScheduler({ cloud });

  // Graceful shutdown
  const httpServer = app.listen(port, host, () => {
    logger.info(`gtm-growth MCP server running on http://${host}:${port}`);
    logger.info(`Streamable HTTP endpoint → http://${host}:${port}/mcp`);
    logger.info(`SSE endpoint (legacy)    → http://${host}:${port}/sse`);
    logger.info(`Messages endpoint        → http://${host}:${port}/messages`);
    logger.info(`Ready for custom MCP connectors`);
  });

  const shutdown = async () => {
    logger.info("[server] Shutting down...");
    sessions.clear();
    stopScheduler();
    httpServer.close(async () => { await Promise.allSettled([auditRuntime?.close(), visibilityJobs?.close()]); process.exit(0); });
    setTimeout(() => process.exit(1), 30_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
