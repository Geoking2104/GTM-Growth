/**
 * MCP HTTP routes (Streamable HTTP + legacy SSE) and Protected Resource Metadata.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools } from "../tools/index.js";
import { logger } from "../utils/logger.js";
import { requireMcpAuth, requireMcpWriteScope, type McpAuthOptions } from "./auth.js";
import { currentMcpAuth, type McpAuthContext } from "./context.js";
import { dispatchMcpTool, withRequestAuth } from "./dispatch.js";
import { mcpResourceConfig, protectedResourceMetadata } from "./resource.js";

export function createMcpServer() {
  const server = new Server({ name: "gtm-growth", version: mcpVersion() }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return dispatchMcpTool(name, (args ?? {}) as Record<string, unknown>);
  });
  return server;
}

function mcpVersion(): string {
  return process.env.npm_package_version || "0.0.0";
}

export function mountMcpMetadata(app: Express, env: NodeJS.ProcessEnv = process.env): void {
  const config = mcpResourceConfig(env);
  if (!config) return;
  const send = (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(protectedResourceMetadata(config));
  };
  // Path-specific document (RFC 9728 / MCP 2025-11-25). Does not collide with PAP.
  app.get("/.well-known/oauth-protected-resource/mcp", send);
  if (env.PAP_ENABLED !== "true") {
    app.get("/.well-known/oauth-protected-resource", send);
  }
}

export function mountMcpHttp(app: Express, options: McpAuthOptions = {}): Map<string, SSEServerTransport> {
  const auth = requireMcpAuth(options);
  const sessions = new Map<string, SSEServerTransport>();
  const enter = (req: Request, res: Response, fn: () => Promise<void>) => {
    const ctx = (res.locals.mcpAuth ?? currentMcpAuth()) as McpAuthContext | undefined;
    return withRequestAuth(ctx, fn);
  };

  app.post("/mcp", auth, requireMcpWriteScope, async (req: Request, res: Response) => {
    try {
      await enter(req, res, async () => {
        const sessionServer = createMcpServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => {
          transport.close();
          sessionServer.close();
        });
        await sessionServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal error";
      logger.info("[mcp] Error handling request:", message);
      if (!res.headersSent) res.status(500).json({ error: message });
    }
  });

  app.get("/mcp", auth, (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST /mcp." });
  });
  app.delete("/mcp", auth, (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST /mcp." });
  });

  const shared = createMcpServer();
  app.get("/sse", auth, async (req: Request, res: Response) => {
    const sessionId = randomUUID();
    logger.info(`[sse] New connection → session ${sessionId} from ${req.ip}`);
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
      await enter(req, res, () => shared.connect(transport));
      logger.info(`[sse] Session ${sessionId} connected (active: ${sessions.size})`);
    } catch (err: unknown) {
      logger.info(`[sse] Failed to connect session ${sessionId}:`, err instanceof Error ? err.message : err);
      sessions.delete(sessionId);
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.post("/messages", auth, requireMcpWriteScope, async (req: Request, res: Response) => {
    const sessionId = (req.query.sessionId as string) || (req.headers["x-session-id"] as string);
    const run = async (transport: SSEServerTransport) => {
      await enter(req, res, () => transport.handlePostMessage(req, res));
    };
    if (!sessionId) {
      const first = sessions.values().next().value;
      if (first) {
        try { await run(first); return; } catch (err: unknown) {
          logger.info("[messages] Error handling message (fallback):", err instanceof Error ? err.message : err);
          return res.status(500).json({ error: err instanceof Error ? err.message : "error" });
        }
      }
      return res.status(400).json({ error: "Missing sessionId" });
    }
    const transport = sessions.get(sessionId);
    if (!transport) return res.status(404).json({ error: `Unknown session: ${sessionId}` });
    try { await run(transport); } catch (err: unknown) {
      logger.info(`[messages] Error for session ${sessionId}:`, err instanceof Error ? err.message : err);
      if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : "error" });
    }
  });

  return sessions;
}
