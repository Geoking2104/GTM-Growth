import { defineTool } from "eve/tools";
import { z } from "zod";
import { readGtm } from "../lib/bridge.ts";
export default defineTool({
  description: "Read products and prepare grounded buyer questions for a page in this channel's workspace. First call with url only; show the observed products and ask the customer to select a product and confirm their category, audience and need. Never invent these inputs. Comparisons require customer-selected URLs, actual product IDs and explicit comparable=true. Return only the tool's sourced questions; leave unsupported stages empty. This is not measured search demand or AI visibility.",
  inputSchema: z.object({ locale: z.enum(["fr", "en"]).default("en"), journey: z.object({
    url: z.url().max(2048), productId: z.string().max(50).optional(),
    brand: z.string().max(70).optional(), category: z.string().max(100).optional(),
    audience: z.string().max(100).optional(), goal: z.string().max(100).optional(),
    contextConfirmed: z.boolean().default(false),
    competitors: z.array(z.object({ url: z.url().max(2048), productId: z.string().max(50), comparable: z.boolean() }).strict()).max(2).default([]),
  }).strict() }),
  execute: (input, ctx) => readGtm(ctx.session.auth.current, { operation: "journey", ...input }, ctx.abortSignal),
});
