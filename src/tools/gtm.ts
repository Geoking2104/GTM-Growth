import {
  listGtmAccounts,
  listGtmContainers,
  listGtmWorkspaces,
  listGtmTags,
  getGa4Tags,
  getGtmContainerSummary,
  auditGa4Setup,
  listGtmTriggers,
  getTriggerDetails,
  listGtmVariables,
  getVariableDetails,
  getTagDetails,
  findTagsByTrigger,
  findTagsUsingVariable,
  detectDuplicateTags,
  getBuiltInVariables,
} from "../google/tagmanager-api.js";
import {
  analyzeEventParameters,
  compareGtmVsGa4Events,
} from "../google/gtm-ga4-bridge.js";
import { auditGa4SetupV2 } from "../google/gtm-audit-v2.js";
import { validateEcommerceEvents } from "../google/ecommerce-validation.js";
import { success, fail } from "./response.js";
import { z } from "zod";
import { accountId, containerId, workspaceId, propertyId, strict } from "./schema.js";

export const gtmTools = [
  // ─── Discovery ──────────────────────────────────────────────
  {
    name: "list_gtm_accounts",
    description: "List all Google Tag Manager accounts accessible with the current credentials.",
    schema: strict({}),
    handler: async () => {
      try { return success(await listGtmAccounts()); }
      catch (err) { return fail(err); }
    },
  },
  {
    name: "list_gtm_containers",
    description: "List all containers belonging to a GTM account.",
    schema: strict({ accountId }),
    handler: async (args: any) => {
      try { return success(await listGtmContainers(args.accountId)); }
      catch (err) { return fail(err); }
    },
  },
  {
    name: "list_gtm_workspaces",
    description: "List workspaces of a GTM container.",
    schema: strict({ accountId, containerId }),
    handler: async (args: any) => {
      try { return success(await listGtmWorkspaces(args.accountId, args.containerId)); }
      catch (err) { return fail(err); }
    },
  },
  {
    name: "list_gtm_tags",
    description: "List all tags in a GTM workspace.",
    schema: strict({ accountId, containerId, workspaceId }),
    handler: async (args: any) => {
      try {
        return success(await listGtmTags(args.accountId, args.containerId, args.workspaceId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_ga4_tags",
    description: "List only GA4 Configuration + Event tags in a workspace.",
    schema: strict({ accountId, containerId, workspaceId }),
    handler: async (args: any) => {
      try {
        return success(await getGa4Tags(args.accountId, args.containerId, args.workspaceId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_gtm_container_summary",
    description: "High-level GA4-focused summary of a GTM container.",
    schema: strict({ accountId, containerId, workspaceId: workspaceId.optional() }),
    handler: async (args: any) => {
      try {
        return success(await getGtmContainerSummary(args.accountId, args.containerId, args.workspaceId));
      } catch (err) { return fail(err); }
    },
  },

  // ─── Triggers & Variables ───────────────────────────────────
  {
    name: "list_gtm_triggers",
    description: "List all triggers in a GTM workspace.",
    schema: strict({ accountId, containerId, workspaceId }),
    handler: async (args: any) => {
      try {
        return success(await listGtmTriggers(args.accountId, args.containerId, args.workspaceId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_trigger_details",
    description: "Get full details of a specific GTM trigger.",
    schema: strict({ accountId, containerId, workspaceId, triggerId: z.string() }),
    handler: async (args: any) => {
      try {
        return success(await getTriggerDetails(args.accountId, args.containerId, args.workspaceId, args.triggerId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "list_gtm_variables",
    description: "List all user-defined variables in a GTM workspace.",
    schema: strict({ accountId, containerId, workspaceId }),
    handler: async (args: any) => {
      try {
        return success(await listGtmVariables(args.accountId, args.containerId, args.workspaceId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_variable_details",
    description: "Get full details of a specific GTM variable.",
    schema: strict({ accountId, containerId, workspaceId, variableId: z.string() }),
    handler: async (args: any) => {
      try {
        return success(await getVariableDetails(args.accountId, args.containerId, args.workspaceId, args.variableId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_tag_details",
    description: "Get full enriched details of a GTM tag (parameters, triggers, eventName…).",
    schema: strict({ accountId, containerId, workspaceId, tagId: z.string() }),
    handler: async (args: any) => {
      try {
        return success(await getTagDetails(args.accountId, args.containerId, args.workspaceId, args.tagId));
      } catch (err) { return fail(err); }
    },
  },

  // ─── Analysis & Audit ───────────────────────────────────────
  {
    name: "analyze_event_parameters",
    description: "Check critical parameters on all GA4 Event tags (value, currency, transaction_id…).",
    schema: strict({ accountId, containerId, workspaceId }),
    handler: async (args: any) => {
      try {
        return success(await analyzeEventParameters(args.accountId, args.containerId, args.workspaceId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "compare_gtm_vs_ga4_events",
    description: "Cross-reference GTM configured events vs events actually received in GA4.",
    schema: strict({
      accountId, containerId, workspaceId, propertyId,
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(await compareGtmVsGa4Events(args));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "audit_ga4_setup",
    description: "Basic GA4 setup audit (Phase 1). Prefer audit_ga4_setup_v2.",
    schema: strict({ accountId, containerId, workspaceId: workspaceId.optional() }),
    handler: async (args: any) => {
      try {
        return success(await auditGa4Setup(args.accountId, args.containerId, args.workspaceId));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "audit_ga4_setup_v2",
    description:
      "Full intelligent audit of a GTM container for GA4. Combines config checks, parameter quality, triggers, and optional live GA4 data comparison. Returns score, grade, issues and recommendations.",
    schema: strict({
      accountId, containerId,
      workspaceId: workspaceId.optional(),
      propertyId: propertyId.optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(await auditGa4SetupV2(args));
      } catch (err) { return fail(err); }
    },
  },

  // ─── Reverse lookups & diagnostics ───────────────────────────
  {
    name: "find_tags_by_trigger",
    description:
      "Find every tag a trigger fires or blocks — answers 'what runs when this trigger fires?'.",
    schema: strict({ accountId, containerId, workspaceId, triggerId: z.string() }),
    handler: async (args: any) => {
      try {
        return success(
          await findTagsByTrigger(
            args.accountId,
            args.containerId,
            args.workspaceId,
            args.triggerId
          )
        );
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "find_tags_using_variable",
    description:
      "Find every tag that references a variable ({{name}}), and flag the variable as unused when none do.",
    schema: strict({ accountId, containerId, workspaceId, variableId: z.string() }),
    handler: async (args: any) => {
      try {
        return success(
          await findTagsUsingVariable(
            args.accountId,
            args.containerId,
            args.workspaceId,
            args.variableId
          )
        );
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "detect_duplicate_tags",
    description:
      "Detect duplicate GA4 tags: the same event name fired by several tags, or several configuration tags sharing a Measurement ID.",
    schema: strict({ accountId, containerId, workspaceId }),
    handler: async (args: any) => {
      try {
        return success(
          await detectDuplicateTags(args.accountId, args.containerId, args.workspaceId)
        );
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "get_built_in_variables",
    description:
      "List the built-in variables enabled in a GTM workspace (Page URL, Click Text, Form ID…).",
    schema: strict({ accountId, containerId, workspaceId }),
    handler: async (args: any) => {
      try {
        return success(
          await getBuiltInVariables(args.accountId, args.containerId, args.workspaceId)
        );
      } catch (err) { return fail(err); }
    },
  },

  // ─── Ecommerce validation ───────────────────────────────────
  {
    name: "validate_ecommerce_events",
    description:
      "Validate GA4 ecommerce events against the official Google schema (purchase, add_to_cart, begin_checkout, view_item, etc.). Checks required/recommended parameters, items array, triggers, and optionally cross-checks with real GA4 revenue & event counts. Returns a funnel score and actionable fixes.",
    schema: strict({
      accountId, containerId, workspaceId,
      propertyId: propertyId.optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(await validateEcommerceEvents(args));
      } catch (err) { return fail(err); }
    },
  },
];
