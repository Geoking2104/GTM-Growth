import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { runReport, runRealtimeReport, getMetadata } from "../google/data-api.js";
import { listProperties, getPropertyDetails } from "../google/admin-api.js";
import {
  getTrafficOverview,
  getTopPages,
  getAcquisition,
  getDevices,
  getEventsSummary,
  getEcommerceAnalysis,
} from "./business.js";
import { gtmTools } from "./gtm.js";
import { customEventTools } from "./custom-events.js";
import { gtmWriteTools } from "./gtm-write.js";
import { sgtmTools } from "./sgtm.js";
import { mpSecretsTools } from "./mp-secrets.js";
import { searchConsoleTools } from "./search-console.js";
import { indexingTools } from "./indexing.js";
import { performanceTools } from "./performance.js";
import { geoTools } from "./geo.js";
import { success, fail } from "./response.js";
import {
  accountId,
  containerId,
  workspaceId,
  propertyId,
  strict,
} from "./schema.js";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: (args: any) => Promise<any>;
}

const coreAndBusinessTools: ToolDefinition[] = [
  {
    name: "list_properties",
    description:
      "List all Google Analytics 4 properties accessible with the current Service Account credentials.",
    schema: strict({}),
    handler: async () => {
      try {
        return success(await listProperties());
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_property_details",
    description: "Get detailed information about a specific GA4 property.",
    schema: strict({ propertyId }),
    handler: async (args) => {
      try {
        return success(await getPropertyDetails(args.propertyId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_metadata",
    description: "Retrieve available dimensions and metrics for a GA4 property.",
    schema: strict({ propertyId: propertyId.optional() }),
    handler: async (args) => {
      try {
        return success(await getMetadata(args.propertyId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "run_report",
    description: "Run a flexible GA4 report. Prefer business tools when possible.",
    schema: strict({
      propertyId: propertyId.optional(),
      metrics: z.array(z.string()),
      dimensions: z.array(z.string()).optional(),
      startDate: z.string(),
      endDate: z.string(),
      limit: z.number().optional(),
      dimensionFilter: z.any().optional(),
      metricFilter: z.any().optional(),
      orderBys: z.array(z.any()).optional(),
    }),
    handler: async (args) => {
      try {
        if (!args.metrics?.length) return fail("metrics is required");
        return success(
          await runReport({
            propertyId: args.propertyId,
            metrics: args.metrics,
            dimensions: args.dimensions,
            startDate: args.startDate,
            endDate: args.endDate,
            limit: args.limit,
            dimensionFilter: args.dimensionFilter,
            metricFilter: args.metricFilter,
            orderBys: args.orderBys,
          })
        );
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "run_realtime_report",
    description: "Get realtime data from the last 30 minutes.",
    schema: strict({
      propertyId: propertyId.optional(),
      metrics: z.array(z.string()),
      dimensions: z.array(z.string()).optional(),
      limit: z.number().optional(),
    }),
    handler: async (args) => {
      try {
        if (!args.metrics?.length) return fail("metrics is required");
        return success(
          await runRealtimeReport({
            propertyId: args.propertyId,
            metrics: args.metrics,
            dimensions: args.dimensions,
            limit: args.limit,
          })
        );
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_traffic_overview",
    description: "Complete traffic overview (users, sessions, pageviews, bounce rate…).",
    schema: strict({
      propertyId: propertyId.optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    handler: getTrafficOverview,
  },
  {
    name: "get_top_pages",
    description: "Most viewed pages for a period.",
    schema: strict({
      propertyId: propertyId.optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional(),
    }),
    handler: getTopPages,
  },
  {
    name: "get_acquisition",
    description: "Traffic acquisition by channel, source and medium.",
    schema: strict({
      propertyId: propertyId.optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional(),
    }),
    handler: getAcquisition,
  },
  {
    name: "get_devices",
    description: "Traffic breakdown by device, OS and browser.",
    schema: strict({
      propertyId: propertyId.optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    handler: getDevices,
  },
  {
    name: "get_events_summary",
    description: "Most frequent events for a period.",
    schema: strict({
      propertyId: propertyId.optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional(),
    }),
    handler: getEventsSummary,
  },
  {
    name: "analyze_ecommerce_data",
    description:
      "Analyze real ecommerce performance from GA4: purchases, revenue, AOV, funnel, top items, data-quality warnings.",
    schema: strict({
      propertyId,
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional(),
    }),
    handler: getEcommerceAnalysis,
  },
];

export const tools: ToolDefinition[] = [
  ...coreAndBusinessTools,
  ...gtmTools,
  ...customEventTools,
  ...gtmWriteTools,
  ...sgtmTools,
  ...mpSecretsTools,
  ...searchConsoleTools,
  ...indexingTools,
  ...performanceTools,
  ...geoTools,
];

export async function handleToolCall(name: string, args: Record<string, any>) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return fail(`Unknown tool: ${name}`);
  }

  let parsed = args ?? {};
  try {
    const result = tool.schema.safeParse(parsed);
    if (!result.success) {
      const detail = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ");
      return fail(`Invalid arguments for "${name}": ${detail}`);
    }
    parsed = result.data;
  } catch (err) {
    return fail(err);
  }

  try {
    return await tool.handler(parsed);
  } catch (err) {
    return fail(err);
  }
}
