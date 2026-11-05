import { describe, expect, it } from "vitest";
// @ts-expect-error module JS du navigateur sans types
import { onboardingSteps, onboardingProgress } from "../site/console/onboarding-steps.js";

describe("console Démarrage checklist", () => {
  it("coche les étapes à partir du statut réel des accès et du premier audit", () => {
    const steps = onboardingSteps({
      status: { gsc: { hasAccess: true }, ga4: { hasAccess: true }, bing: { keyConfigured: false } },
      tenant: { domains: ["www.opendpe.net"], gtmContainers: ["GTM-WVQ4JXMN"], clarityProjects: [] },
      overview: { geo: { score: 71, recommendations: [{ points: 3 }] } },
      reports: [],
    });
    const done = Object.fromEntries(steps.map((s: { id: string; done: boolean }) => [s.id, s.done]));
    expect(done).toEqual({ freeRead: true, gsc: true, ga4: true, bing: false, gtm: true, clarity: false, audit: true, plan: true });
    expect(onboardingProgress(steps)).toEqual({ done: 6, total: 8 });
  });
  it("reste vide sans données", () => {
    expect(onboardingProgress(onboardingSteps({})).done).toBe(0);
  });
});
