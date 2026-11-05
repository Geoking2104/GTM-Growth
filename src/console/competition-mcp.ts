/** Tenant-scoped, read-only competition MCP; separate from the legacy shared MCP. */
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TenantStore } from "../tenants/store.js";
import { oidcConfigFromEnv, requireOidc } from "./auth.js";
import { withTrust, tenancyMiddleware, type ConsoleOptions } from "./api.js";
import { aiVisibilityRoutes } from "./ai-visibility.js";
import { competitionRoutes } from "./competition.js";
import { fail, success } from "../tools/response.js";
import type { TenantContext } from "../tenants/context.js";
import type { TokenClaims } from "./auth.js";

const definitions = [
  { name: "competition_list_datasets", description: "List datasets accessible to the authenticated tenant.", path: "/ai-visibility/datasets", schema: z.object({}).strict() },
  { name: "competition_report", description: "Read a tenant competition report with evidence and optional filters.", path: "/competition/report", schema: z.object({ datasetId: z.string().min(1).max(100), source: z.string().max(100).optional(), brand: z.string().max(100).optional(), groupId: z.string().max(100).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }).strict() },
  { name: "competition_discovery", description: "List unverified candidate names with excerpts from a tenant dataset.", path: "/competition/discovery", schema: z.object({ datasetId: z.string().min(1).max(100) }).strict() },
  { name: "competition_alert", description: "Read the tenant's configured visibility alert.", path: "/competition/alert", schema: z.object({}).strict() },
];
export function buildCompetitionMcpRouter(options: ConsoleOptions = {}) {
  const router = express.Router(), store = options.store ?? new TenantStore();
  const config = withTrust(options.config === undefined ? oidcConfigFromEnv() : options.config, store);
  router.use(requireOidc(config, options.jwksLoader));
  // An explicit tenant is required even for users with a single membership.
  router.use((req, res, next) => { if (!req.header("X-Tenant")) return res.status(400).json({ error: "X-Tenant required" }); return next(); });
  router.use(tenancyMiddleware(config, store));
  router.post("/", async (req, res) => {
    const { tenancy, user } = res.locals as { tenancy?: TenantContext; user?: TokenClaims };
    if (!tenancy?.tenant || tenancy.tenant.status !== "active") return res.status(403).json({ error: "Active tenant required" });
    const server = new Server({ name: "gtm-growth-competition", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: definitions.map((d) => ({ name: d.name, description: d.description, inputSchema: zodToJsonSchema(d.schema) })) }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const definition = definitions.find((d) => d.name === request.params.name); if (!definition) return fail("Unknown tool");
      const parsed = definition.schema.safeParse(request.params.arguments ?? {}); if (!parsed.success) return fail("Invalid arguments");
      const route = [...aiVisibilityRoutes, ...competitionRoutes].find((r) => r.path === definition.path);
      if (!route || route.adminOnly) return fail("Tool unavailable");
      try { return success(await route.handler({ url: "", body: parsed.data, tenancy, user })); } catch { return fail("Unable to access requested data"); }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: "MCP request failed" }); }
  });
  router.all("/", (_req, res) => res.status(405).json({ error: "Use POST" }));
  return router;
}
