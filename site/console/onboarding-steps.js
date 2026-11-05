/* Checklist « Démarrage » : calcul pur (sans DOM) à partir du statut réel des accès
 * (/tracking/status), du tenant (/me) et du premier audit (/overview ou /reports). */
export function onboardingSteps({ status, tenant, overview, reports } = {}) {
  const s = status ?? {};
  const audit = Boolean(overview?.geo && typeof overview.geo.score === "number") || (reports?.length ?? 0) > 0;
  return [
    { id: "freeRead", done: Boolean(tenant?.domains?.length), href: "/#free-read" },
    { id: "gsc", done: s.gsc?.hasAccess === true, href: "#tracking/settings" },
    { id: "ga4", done: s.ga4?.hasAccess === true, href: "#tracking/settings" },
    { id: "bing", done: Boolean(s.bing?.keyConfigured) && s.bing?.hasAccess !== false && !s.bing?.error, href: "#tracking/settings" },
    { id: "gtm", done: (tenant?.gtmContainers?.length ?? 0) > 0, href: "#gtm" },
    { id: "clarity", done: (tenant?.clarityProjects?.length ?? 0) > 0, href: "#tracking/settings" },
    { id: "audit", done: audit, href: "#audit" },
    { id: "plan", done: audit && (overview?.geo?.recommendations?.length ?? 0) > 0, href: "#overview/plan" },
  ];
}
export const onboardingProgress = (steps) => ({ done: steps.filter((x) => x.done).length, total: steps.length });
