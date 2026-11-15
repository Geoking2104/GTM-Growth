import { defineTool } from "eve/tools";
import { z } from "zod";
import { readGtm } from "../lib/bridge.ts";
export default defineTool({ description: "List GTM's read-only business metrics and their grains. No SQL or arbitrary MCP tools.", inputSchema: z.object({}),
  execute: (_input, ctx) => readGtm(ctx.session.auth.current, { operation: "catalog" }, ctx.abortSignal) });
