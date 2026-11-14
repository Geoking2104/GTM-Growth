/** Explicit tenant scope; AI callers may read and prepare, never approve or publish. */
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TenantStore } from "../tenants/store.js";
import { oidcConfigFromEnv, requireOidc, type TokenClaims } from "./auth.js";
import { withTrust, tenancyMiddleware, type ConsoleOptions } from "./api.js";
import type { TenantContext } from "../tenants/context.js";
import { success, fail } from "../tools/response.js";
import {
  socialState,
  analyticsReport,
  savePost,
  saveCampaign,
  saveCreator,
  saveOutreach,
  type Principal,
} from "../social/service.js";
import {
  campaignInput,
  creatorInput,
  outreachInput,
  postInput,
  id,
} from "../social/model.js";
const command = (schema: z.ZodTypeAny) =>
  z.object({ key: z.string().min(8).max(120), input: schema }).strict();
export const socialMcpDefinitions = [
  {
    name: "social_state",
    description:
      "Read campaigns, drafts, accounts and execution receipts for the selected client.",
    schema: z.object({}).strict(),
    run: (p: Principal) => socialState(p),
  },
  {
    name: "social_analytics",
    description: "Read sourced measurements; missing data remains unknown.",
    schema: z
      .object({ campaignId: id.optional(), from: z.string(), to: z.string() })
      .strict(),
    run: analyticsReport,
  },
  {
    name: "social_campaign_create",
    description:
      "Create a draft campaign from client product facts. Requires strategist access.",
    schema: command(campaignInput),
    run: (p: Principal, i: any) => saveCampaign(p, i.key, i.input),
  },
  {
    name: "social_post_draft",
    description:
      "Create or revise a draft; invalidates any approval. Never publishes.",
    schema: command(
      z
        .object({
          post: postInput,
          id: id.optional(),
          version: z.number().int().optional(),
        })
        .strict(),
    ),
    run: (p: Principal, i: any) => savePost(p, i.key, i.input),
  },
  {
    name: "social_creator_add",
    description:
      "Add a sourced creator for human review; never marks the creator as vetted.",
    schema: command(creatorInput),
    run: (p: Principal, i: any) => saveCreator(p, i.key, i.input),
  },
  {
    name: "social_outreach_draft",
    description:
      "Prepare exact outreach copy for a vetted creator; never sends a message.",
    schema: command(outreachInput),
    run: (p: Principal, i: any) => saveOutreach(p, i.key, i.input),
  },
];
export function buildSocialMcpRouter(options: ConsoleOptions = {}) {
  const router = express.Router(),
    store = options.store ?? new TenantStore();
  const config = withTrust(
    options.config === undefined ? oidcConfigFromEnv() : options.config,
    store,
  );
  router.use(requireOidc(config, options.jwksLoader));
  router.use((req, res, next) => {
    if (!req.header("X-Tenant"))
      return res.status(400).json({ error: "X-Tenant required" });
    next();
  });
  router.use(tenancyMiddleware(config, store));
  router.post("/", async (req, res) => {
    const { tenancy, user } = res.locals as {
      tenancy?: TenantContext;
      user?: TokenClaims;
    };
    if (
      !tenancy?.tenant ||
      tenancy.tenant.status !== "active" ||
      tenancy.platformAdmin ||
      !user?.sub
    )
      return res
        .status(403)
        .json({ error: "Active client membership required" });
    // A service account is a viewer until explicitly granted a Social role.
    const p: Principal = {
      tenant: tenancy.tenant,
      actor: user.sub,
      admin: false,
      agent: true,
    };
    const server = new Server(
      { name: "gtm-growth-social", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: socialMcpDefinitions.map((d) => ({
        name: d.name,
        description: d.description,
        inputSchema: zodToJsonSchema(d.schema),
      })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const d = socialMcpDefinitions.find(
        (d) => d.name === request.params.name,
      );
      if (!d) return fail("Tool unavailable");
      const parsed = d.schema.safeParse(request.params.arguments ?? {});
      if (!parsed.success) return fail("Invalid arguments");
      try {
        return success(await d.run(p, parsed.data));
      } catch {
        return fail("Unable to access or prepare requested data");
      }
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({ error: "MCP request failed" });
    }
  });
  router.all("/", (_req, res) => res.status(405).json({ error: "Use POST" }));
  return router;
}
