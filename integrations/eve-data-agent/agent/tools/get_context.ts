import { defineTool } from "eve/tools";
import { z } from "zod";
import { readGtm } from "../lib/bridge.ts";
export default defineTool({ description: "Read this channel's operator-approved business role, objective, audience and customer lifecycle stage, plus console next actions.",
  inputSchema: z.object({ locale: z.enum(["fr", "en"]).default("en") }),
  execute: (input, ctx) => readGtm(ctx.session.auth.current, { operation: "context", ...input }, ctx.abortSignal) });
