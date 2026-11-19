import { z } from "zod";
import { listAIAccounts } from "../console/ai-connections.js";
import { getDataset, listDatasets } from "../console/ai-visibility-store.js";
import type { ConsoleRoute, HandlerContext } from "../console/util.js";
import { isScheduledProvider, SCHEDULED_PROVIDERS, scheduledProviderName } from "./provider.js";
import type { ScheduledProvider, VisibilityJobStore } from "./store.js";

const scheduleSchema = z.object({
  confirmed: z.literal(true),
  panelId: z.string().min(1).max(100),
  provider: z.custom<ScheduledProvider>(isScheduledProvider, "Select an enabled AI provider"),
  accountId: z.string().min(1).max(100),
  intervalHours: z.number().int().min(1).max(168),
  maxDailyCalls: z.number().int().min(1).max(4800),
  estimateUsdMicros: z.number().int().min(1).max(2_000_000_000),
  maxDailyUsdMicros: z.number().int().min(1).max(2_000_000_000),
}).strict();
const invoiceSchema = z.object({ runId: z.string().uuid(), billedUsdMicros: z.number().int().min(0).max(2_000_000_000) }).strict();

function tenantId(ctx: HandlerContext) {
  if (!ctx.tenancy?.tenant) throw new Error("Select a workspace");
  return ctx.tenancy.tenant.id;
}

export function visibilityScheduleRoutes(store?: VisibilityJobStore | null): ConsoleRoute[] {
  function requireStore() {
    if (!store) throw new Error("Scheduled visibility is disabled");
    return store;
  }
  return [
    { path: "/visibility/schedule", needsUrl: false, handler: async (ctx) => {
      if (!store) return { available: false };
      const id = tenantId(ctx);
      const [schedule, runs] = await Promise.all([store.schedule(id), store.history(id)]);
      return { available: true, schedule, runs };
    } },
    { path: "/visibility/schedule/options", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      requireStore();
      const id = tenantId(ctx);
      return {
        panels: listDatasets(id).map(({ id, createdAt, brands }) => ({
          id, createdAt, brands: brands.map((brand) => (brand as { name: string }).name),
        })),
        providers: SCHEDULED_PROVIDERS.map((provider) => ({
          id: provider, name: scheduledProviderName(provider),
          accounts: listAIAccounts(id, provider).filter((account) => account.kind === "saved").map(({ id, label }) => ({ id, label })),
        })),
      };
    } },
    { path: "/visibility/schedule/save", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const db = requireStore();
      const id = tenantId(ctx);
      const { confirmed: _confirmed, ...input } = scheduleSchema.parse(ctx.body);
      if (!listAIAccounts(id, input.provider).some((account) => account.kind === "saved" && account.id === input.accountId)) {
        throw new Error("Select a saved API account for this provider");
      }
      const panel = getDataset(id, input.panelId);
      if (!panel?.brands.length) throw new Error("Select a panel from this workspace");
      if (input.estimateUsdMicros > input.maxDailyUsdMicros) throw new Error("Daily budget must cover one call");
      await db.save(id, input);
      return { schedule: await db.schedule(id) };
    } },
    { path: "/visibility/schedule/pause", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const db = requireStore();
      await db.pause(tenantId(ctx));
      return { paused: true };
    } },
    { path: "/visibility/schedule/billed", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const db = requireStore();
      const { runId, billedUsdMicros } = invoiceSchema.parse(ctx.body);
      if (!await db.recordBilledCost(tenantId(ctx), runId, billedUsdMicros)) throw new Error("Completed collection not found");
      return { recorded: true };
    } },
  ];
}
