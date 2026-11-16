import { AI_DISCOVERY, WEIGHTS } from "../config.js";
import type { AiDiscoveryAudit, CategoryResult, GeoCheck } from "../types.js";

interface EndpointResponse {
  status: number;
  body: string | null;
}

export interface AiDiscoveryResponses {
  wellKnownAi: EndpointResponse;
  summary: EndpointResponse;
  faq: EndpointResponse;
  service: EndpointResponse;
}

function parseJson(body: string | null): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Audit the AI discovery endpoints from the geo-checklist standard:
 * /.well-known/ai.txt, /ai/summary.json, /ai/faq.json, /ai/service.json.
 */
export function auditAiDiscovery(
  responses: AiDiscoveryResponses
): CategoryResult<AiDiscoveryAudit> {
  const wellKnownOk =
    responses.wellKnownAi.status === 200 && (responses.wellKnownAi.body ?? "").trim().length > 0;

  const summaryData = parseJson(responses.summary.body);
  const hasSummary = responses.summary.status === 200 && summaryData !== null;
  const summaryValid =
    hasSummary &&
    typeof summaryData === "object" &&
    summaryData !== null &&
    String((summaryData as Record<string, unknown>).name ?? "").length >=
      AI_DISCOVERY.summaryNameMinLen &&
    String((summaryData as Record<string, unknown>).description ?? "").length >=
      AI_DISCOVERY.summaryDescriptionMinLen;

  const faqData = parseJson(responses.faq.body);
  const faqList = Array.isArray(faqData)
    ? faqData
    : faqData && typeof faqData === "object"
      ? ((faqData as Record<string, unknown>).faqs as unknown[])
      : null;
  const faqCount = Array.isArray(faqList)
    ? faqList.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        return (
          String(record.question ?? "").length >= AI_DISCOVERY.faqQuestionMinLen &&
          String(record.answer ?? "").length >= AI_DISCOVERY.faqAnswerMinLen
        );
      }).length
    : 0;
  const hasFaq = responses.faq.status === 200 && faqData !== null;

  const serviceData = parseJson(responses.service.body);
  const hasService =
    responses.service.status === 200 &&
    serviceData !== null &&
    typeof serviceData === "object" &&
    String((serviceData as Record<string, unknown>).name ?? "").length >=
      AI_DISCOVERY.serviceNameMinLen &&
    Array.isArray((serviceData as Record<string, unknown>).capabilities) &&
    ((serviceData as Record<string, unknown>).capabilities as unknown[]).length > 0;

  const data: AiDiscoveryAudit = {
    endpointStatus: {
      wellKnownAi: responses.wellKnownAi.status,
      summary: responses.summary.status,
      faq: responses.faq.status,
      service: responses.service.status,
    },
    hasWellKnownAi: wellKnownOk,
    hasSummary,
    summaryValid,
    hasFaq,
    faqCount,
    hasService,
  };

  const check = (
    id: string,
    label: string,
    earned: number,
    max: number,
    status: GeoCheck["status"],
    evidence: string,
    fix: string
  ): GeoCheck => ({
    id,
    category: "ai_discovery",
    label,
    earned,
    max,
    status,
    evidence,
    fix,
  });

  const checks: GeoCheck[] = [
    check(
      "ai_discovery.well_known",
      "/.well-known/ai.txt exists",
      wellKnownOk ? WEIGHTS.ai_discovery_well_known : 0,
      WEIGHTS.ai_discovery_well_known,
      wellKnownOk ? "pass" : "fail",
      wellKnownOk ? "Endpoint returned content" : `HTTP ${responses.wellKnownAi.status}`,
      "Publish /.well-known/ai.txt describing crawler permissions and key resources."
    ),
    check(
      "ai_discovery.summary",
      "/ai/summary.json is valid",
      summaryValid ? WEIGHTS.ai_discovery_summary : 0,
      WEIGHTS.ai_discovery_summary,
      summaryValid ? "pass" : "fail",
      summaryValid
        ? "JSON with name and description"
        : hasSummary
          ? "JSON present but name/description too short"
          : `HTTP ${responses.summary.status}`,
      'Publish /ai/summary.json with {"name": "...", "description": "..."} (description ≥ 20 chars).'
    ),
    check(
      "ai_discovery.faq",
      "/ai/faq.json exists",
      hasFaq ? WEIGHTS.ai_discovery_faq : 0,
      WEIGHTS.ai_discovery_faq,
      hasFaq ? "pass" : "fail",
      hasFaq ? `${faqCount} valid FAQ item(s)` : `HTTP ${responses.faq.status}`,
      "Publish /ai/faq.json with question/answer pairs an assistant can quote."
    ),
    check(
      "ai_discovery.service",
      "/ai/service.json describes capabilities",
      hasService ? WEIGHTS.ai_discovery_service : 0,
      WEIGHTS.ai_discovery_service,
      hasService ? "pass" : "fail",
      hasService ? "name + capabilities present" : `HTTP ${responses.service.status}`,
      'Publish /ai/service.json with {"name": "...", "capabilities": [...]} for agent discovery.'
    ),
  ];

  return { data, checks };
}
