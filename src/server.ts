import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools, handleToolCall } from "./tools/index.js";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "./utils/logger.js";
import { mountPublicApi } from "./http/public-api.js";
import { buildCompetitionMcpRouter } from "./console/competition-mcp.js";
import { mountConsoleApi } from "./console/api.js";
import { startScheduler } from "./console/ops-scheduler.js";
import { mountBillingApi } from "./billing/api.js";

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

function createMcpServer() {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.schema),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args ?? {});
  });

  return server;
}

/**
 * Optional bearer-token auth for the HTTP transport.
 * Only enforced when MCP_API_TOKEN is set. When unset, the server stays
 * open (useful for local stdio / trusted networks).
 */
function requireToken(req: Request, res: Response, next: NextFunction) {
  const token = process.env.MCP_API_TOKEN;
  if (!token) return next();

  const header = req.headers["authorization"] || "";
  const incoming = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (incoming === token) return next();

  res.status(401).json({ error: "Unauthorized: invalid or missing bearer token" });
}

export async function startServer(transportType: "stdio" | "http" = "stdio") {
  const server = createMcpServer();

  if (transportType === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("gtm-growth MCP server running on STDIO");
    return;
  }

  // â”€â”€â”€ HTTP: SSE (legacy) + Streamable HTTP (modern) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const app = express();
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "MCP-Session-Id"],
  }));
  app.use(express.json({ limit: "4mb" }));

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";

  // sessionId â†’ transport (SSE legacy)
  const sessions = new Map<string, SSEServerTransport>();

  // Health / info (no auth â€” status only)
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

  // Public website API â€” free read and lead capture (no MCP session needed).
  mountPublicApi(app);

  // Console API â€” Keycloak-protected (OIDC bearer tokens validated via JWKS).
  mountConsoleApi(app);
  // Cloud-only billing: separate Mollie website profile, isolated ledger, disabled by default.
  mountBillingApi(app);
  app.use("/api/mcp/competition", buildCompetitionMcpRouter());
  // Operations scheduler (T-11): periodic visibility + rank checks per tenant.
  // Opt-in through env so tests, stdio runs and CI stay quiet.
  if (process.env.OPS_SCHEDULER_ENABLED === "true") startScheduler();

  // â”€â”€ Modern: Streamable HTTP transport at /mcp (stateless) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.post("/mcp", requireToken, async (req: Request, res: Response) => {
    try {
      const sessionServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
        sessionServer.close();
      });
      await sessionServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      logger.info("[mcp] Error handling request:", err?.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || "Internal error" });
      }
    }
  });

  // Streamable HTTP spec: GET/DELETE only valid for session-based mode.
  app.get("/mcp", requireToken, (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST /mcp." });
  });
  app.delete("/mcp", requireToken, (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST /mcp." });
  });

  // â”€â”€ Legacy: SSE transport at /sse (kept for older clients) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.get("/sse", requireToken, async (req: Request, res: Response) => {
    const sessionId = randomUUID();
    logger.info(`[sse] New connection â†’ session ${sessionId} from ${req.ip}`);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Session-Id", sessionId);

    const transport = new SSEServerTransport("/messages", res);
    sessions.set(sessionId, transport);

    const cleanup = () => {
      sessions.delete(sessionId);
      logger.info(`[sse] Session ${sessionId} closed (active: ${sessions.size})`);
    };
    res.on("close", cleanup);
    res.on("error", cleanup);

    try {
      await server.connect(transport);
      logger.info(`[sse] Session ${sessionId} connected (active: ${sessions.size})`);
    } catch (err: any) {
      logger.info(`[sse] Failed to connect session ${sessionId}:`, err?.message);
      sessions.delete(sessionId);
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  app.post("/messages", requireToken, async (req: Request, res: Response) => {
    const sessionId =
      (req.query.sessionId as string) ||
      (req.headers["x-session-id"] as string);

    if (!sessionId) {
      const first = sessions.values().next().value;
      if (first) {
        try {
          await first.handlePostMessage(req, res);
          return;
        } catch (err: any) {
          logger.info("[messages] Error handling message (fallback):", err?.message);
          return res.status(500).json({ error: err?.message });
        }
      }
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const transport = sessions.get(sessionId);
    if (!transport) {
      return res.status(404).json({ error: `Unknown session: ${sessionId}` });
    }

    try {
      await transport.handlePostMessage(req, res);
    } catch (err: any) {
      logger.info(`[messages] Error for session ${sessionId}:`, err?.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message });
      }
    }
  });

  // Graceful shutdown
  const httpServer = app.listen(port, host, () => {
    logger.info(`gtm-growth MCP server running on http://${host}:${port}`);
    logger.info(`Streamable HTTP endpoint â†’ http://${host}:${port}/mcp`);
    logger.info(`SSE endpoint (legacy)    â†’ http://${host}:${port}/sse`);
    logger.info(`Messages endpoint        â†’ http://${host}:${port}/messages`);
    logger.info(`Ready for custom MCP connectors`);
  });

  const shutdown = () => {
    logger.info("[server] Shutting down...");
    sessions.clear();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
