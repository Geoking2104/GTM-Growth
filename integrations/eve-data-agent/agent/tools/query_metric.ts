import { defineTool } from "eve/tools";
import { z } from "zod";
import { readGtm } from "../lib/bridge.ts";
import { model } from "./get_model.ts";
export default defineTool({ description: "Read aggregates for this conversation's bound workspace. Ask for source selection when required. No writes, paid collection, SQL, raw customer records or cross-workspace queries.",
  inputSchema: z.object({ model, days: z.union([z.literal(7), z.literal(28), z.literal(90)]).default(28), source: z.string().max(2048).optional(), locale: z.enum(["fr", "en"]).default("en") }),
  execute: (input, ctx) => readGtm(ctx.session.auth.current, { operation: "query", ...input }, ctx.abortSignal) });
