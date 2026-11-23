import { collectOpenAI, normalizeImport } from "../console/ai-visibility.js";
import { AI_PROVIDERS, collectProvider, providerConfig } from "../console/ai-visibility-providers.js";
import { CONNECTION_PROVIDERS, type AICredential } from "../console/ai-connections.js";
import type { Claim, Outcome, ScheduledProvider } from "./store.js";

export const SCHEDULED_PROVIDERS = CONNECTION_PROVIDERS.filter((provider) => provider !== "gemini");
export function isScheduledProvider(value: unknown): value is ScheduledProvider {
  return SCHEDULED_PROVIDERS.some((provider) => value === provider);
}

export function scheduledProviderName(provider: ScheduledProvider) {
  return provider === "openai" ? "OpenAI" : AI_PROVIDERS[provider].name;
}

export async function collectScheduledAnswer(
  claim: Claim, credential: AICredential, transport: typeof fetch = fetch,
): Promise<{ state: Outcome; answer?: unknown }> {
  const provider = claim.config.provider;
  if (!isScheduledProvider(provider)) return { state: "revoked" };
  let responseStatus: number | undefined;
  const request: typeof fetch = async (...args) => {
    const response = await transport(...args);
    responseStatus = response.status;
    return response;
  };
  const input = { confirmed: true, brands: claim.brands, prompts: [claim.payload.prompt] };
  const result = provider === "openai"
    ? await collectOpenAI(input, credential.key, request, credential)
    : await collectProvider(provider, input, credential.key, providerConfig(provider, claim.tenant_id).model, request, credential);
  const answer = result.successes[0];
  if (answer) {
    const observation = { ...answer, measurement: { ...answer.measurement, ...(claim.payload.locale ? { language: claim.payload.locale } : {}) } };
    normalizeImport({ brands: claim.brands, responses: [observation] }, "collected");
    return { state: "succeeded", answer: observation };
  }
  if (responseStatus === 429) return { state: "rate_limited" };
  if (responseStatus === undefined || responseStatus === 408 || responseStatus >= 500) return { state: "uncertain" };
  return { state: "failed" };
}
