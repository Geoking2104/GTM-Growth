export const JOURNEY_VERSION: string;
export const JOURNEY_STAGES: ReadonlyArray<{ id: string; fr: string; en: string; intent: string }>;
export function buildJourneyPreview(input?: Record<string, unknown>): {
  version: string; url: string; brand: string; category: string; audience: string; goal: string;
  language: string; ready: boolean; missing: string[]; limitation: string;
  product: { name: string; url: string } | false | undefined;
  competitors: Array<{ brand: string; product: string; url: string }>;
  stages: Array<{ id: string; title: string; mindset: string; targetUrl: string; coverage: string; observedControls: string[]; missing: string;
    prompts: Array<{ text: string; sourceKind: string; sourceRef: string; evidence: Array<{ url: string; label: string; detail: string; kind: string }> }> }>;
};
