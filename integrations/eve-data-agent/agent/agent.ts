import { defineAgent } from "eve";
export default defineAgent({
  model: process.env.GTM_AGENT_MODEL || "anthropic/claude-sonnet-5",
  // Documented Eve override: builds do not need a Gateway metadata lookup.
  // Conservative context budget; operator must keep it within the selected model's limit.
  modelContextWindowTokens: 32000,
  defaultTools: false,
  tool: false,
  limits: { sessionTimeoutMs: 86400000, sessionUsage: ({ total }) => total.inputTokens >= 100000 || total.outputTokens >= 8000 },
});
