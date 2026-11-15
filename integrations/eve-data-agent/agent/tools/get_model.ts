import { defineTool } from "eve/tools";
import { z } from "zod";
import { readGtm } from "../lib/bridge.ts";
export const model = z.enum(["workspace", "search", "analytics", "visibility", "operations"]);
export default defineTool({ description: "Read metric definitions, actual period rules and limitations before querying.", inputSchema: z.object({ model }),
  execute: (input, ctx) => readGtm(ctx.session.auth.current, { operation: "definition", ...input }, ctx.abortSignal) });
