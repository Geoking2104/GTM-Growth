import { getGtmContainerSummary, listGtmTriggers, getGa4Tags } from "./tagmanager-api.js";
import { analyzeEventParameters, compareGtmVsGa4Events } from "./gtm-ga4-bridge.js";

export interface AuditIssue {
  severity: "critical" | "high" | "medium" | "low" | "info";
  code: string;
  message: string;
  recommendation?: string;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
};

/**
 * GTM-17 — Full intelligent audit of a GTM container for GA4 quality.
 * Optionally cross-references with real GA4 data when propertyId is provided.
 */
export async function auditGa4SetupV2(params: {
  accountId: string;
  containerId: string;
  workspaceId?: string;
  propertyId?: string; // optional — enables real data comparison
  startDate?: string;
  endDate?: string;
}) {
  const {
    accountId,
    containerId,
    workspaceId,
    propertyId,
    startDate = "30daysAgo",
    endDate = "yesterday",
  } = params;

  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];

  // ─── 1. Container summary ───────────────────────────────────
  const summary = await getGtmContainerSummary(accountId, containerId, workspaceId);
  const wsId = summary.workspaceId;

  // ─── 2. Config tag checks ───────────────────────────────────
  if (!summary.hasGa4ConfigTag) {
    issues.push({
      severity: "critical",
      code: "NO_CONFIG_TAG",
      message: "Aucun tag GA4 Configuration (googtag) trouvé",
      recommendation:
        "Ajouter un tag Google Tag (GA4 Configuration) avec le Measurement ID de la property cible et le déclencher sur All Pages ou Initialization",
    });
  } else if (summary.ga4ConfigTagsCount > 1) {
    issues.push({
      severity: "high",
      code: "MULTIPLE_CONFIG_TAGS",
      message: `${summary.ga4ConfigTagsCount} tags GA4 Configuration détectés (risque de doublons)`,
      recommendation: "Ne conserver qu'un seul tag de configuration par Measurement ID",
    });
  }

  // ─── 3. Measurement IDs ─────────────────────────────────────
  if (summary.measurementIds.length === 0) {
    issues.push({
      severity: "critical",
      code: "NO_MEASUREMENT_ID",
      message: "Aucun Measurement ID (G-XXXXXXXX) détecté dans les tags",
      recommendation: "Vérifier que le Measurement ID est bien renseigné dans le tag de configuration",
    });
  } else if (summary.measurementIds.length > 1) {
    issues.push({
      severity: "medium",
      code: "MULTIPLE_MEASUREMENT_IDS",
      message: `Plusieurs Measurement IDs trouvés: ${summary.measurementIds.join(", ")}`,
      recommendation: "Confirmer que l'envoi vers plusieurs properties est intentionnel",
    });
  }

  // Check for legacy UA format
  for (const id of summary.measurementIds) {
    if (id.startsWith("UA-")) {
      issues.push({
        severity: "high",
        code: "LEGACY_UA_ID",
        message: `Measurement ID legacy Universal Analytics détecté: ${id}`,
        recommendation: "Migrer vers un Measurement ID GA4 (G-XXXXXXXX)",
      });
    }
  }

  // ─── 4. Config tag firing triggers ──────────────────────────
  for (const tag of summary.ga4ConfigTags) {
    if (!tag.firingTriggerId || tag.firingTriggerId.length === 0) {
      issues.push({
        severity: "critical",
        code: "CONFIG_TAG_NO_TRIGGER",
        message: `Le tag de configuration "${tag.name}" n'a aucun trigger de déclenchement`,
        recommendation: "Lier ce tag à un trigger All Pages ou Initialization",
      });
    }
  }

  // ─── 5. Event tags without triggers ─────────────────────────
  for (const tag of summary.ga4EventTags) {
    if (!tag.firingTriggerId || tag.firingTriggerId.length === 0) {
      issues.push({
        severity: "high",
        code: "EVENT_TAG_NO_TRIGGER",
        message: `Le tag Event "${tag.name}" n'a aucun trigger de déclenchement`,
        recommendation: "Associer un trigger (Custom Event, Click, etc.) à ce tag",
      });
    }
  }

  // ─── 6. Parameter quality analysis ──────────────────────────
  let paramAnalysis: any = null;
  try {
    paramAnalysis = await analyzeEventParameters(accountId, containerId, wsId);

    for (const item of paramAnalysis.analysis || []) {
      if (item.missingCriticalParameters?.length > 0) {
        issues.push({
          severity: "high",
          code: "MISSING_CRITICAL_PARAMS",
          message: `Tag "${item.tagName}" (event: ${item.eventName}) — paramètres critiques manquants: ${item.missingCriticalParameters.join(", ")}`,
          recommendation: `Ajouter les paramètres ${item.missingCriticalParameters.join(", ")} pour un tracking e-commerce complet`,
        });
      }
    }
  } catch (err: any) {
    issues.push({
      severity: "info",
      code: "PARAM_ANALYSIS_SKIPPED",
      message: `Analyse des paramètres non disponible: ${err.message}`,
    });
  }

  // ─── 7. Triggers overview ───────────────────────────────────
  let triggersCount = 0;
  let triggersRead = false;
  try {
    const triggers = await listGtmTriggers(accountId, containerId, wsId);
    triggersCount = triggers.count;
    triggersRead = true;

    if (triggersCount === 0) {
      issues.push({
        severity: "critical",
        code: "NO_TRIGGERS",
        message: "Aucun trigger trouvé dans le workspace",
        recommendation: "Créer au minimum un trigger All Pages / Initialization",
      });
    }
  } catch {
    // non-blocking
  }

  // ─── 8. Real GA4 data comparison (if propertyId provided) ───
  let comparison: any = null;
  if (propertyId) {
    try {
      comparison = await compareGtmVsGa4Events({
        accountId,
        containerId,
        workspaceId: wsId,
        propertyId,
        startDate,
        endDate,
      });

      if (comparison.error) issues.push({ severity: 'info', code: 'GA4_COMPARISON_SKIPPED', message: 'GA4 event comparison unavailable.' });
      if (comparison.comparison) {
        const { configuredInGtmButNotSeenInGa4, trulyMissingInGtm, matched } =
          comparison.comparison;

        if (configuredInGtmButNotSeenInGa4?.length > 0) {
          issues.push({
            severity: "high",
            code: "EVENTS_CONFIGURED_BUT_NEVER_RECEIVED",
            message: `${configuredInGtmButNotSeenInGa4.length} événement(s) configuré(s) dans GTM jamais reçus dans GA4: ${configuredInGtmButNotSeenInGa4.slice(0, 8).join(", ")}${configuredInGtmButNotSeenInGa4.length > 8 ? "…" : ""}`,
            recommendation:
              "Vérifier les triggers, le Measurement ID, et qu'il y a bien du trafic générant ces événements",
          });
        }

        if (trulyMissingInGtm?.length > 0) {
          issues.push({
            severity: "medium",
            code: "EVENTS_IN_GA4_NOT_IN_GTM",
            message: `${trulyMissingInGtm.length} événement(s) présents dans GA4 mais absents de GTM: ${trulyMissingInGtm.slice(0, 8).join(", ")}${trulyMissingInGtm.length > 8 ? "…" : ""}`,
            recommendation:
              "Ces événements peuvent provenir de gtag.js direct, d'un autre conteneur, ou du Measurement Protocol",
          });
        }

        if (matched?.length === 0 && summary.ga4EventTagsCount > 0) {
          issues.push({
            severity: "critical",
            code: "ZERO_MATCH",
            message: "Aucun événement GTM ne correspond aux événements reçus dans GA4",
            recommendation:
              "Vérifier que le Measurement ID du conteneur GTM pointe bien vers cette property GA4",
          });
        }
      }
    } catch (err: any) {
      issues.push({
        severity: "info",
        code: "GA4_COMPARISON_SKIPPED",
        message: `Comparaison avec les données GA4 non disponible: ${err.message}`,
      });
    }
  }

  // ─── 9. Scoring ─────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    score -= SEVERITY_WEIGHT[issue.severity] || 0;
  }
  score = Math.max(0, Math.min(100, score));

  // Deduplicate recommendations
  const uniqueRecs = [
    ...new Set(
      issues
        .filter((i) => i.recommendation)
        .map((i) => i.recommendation as string)
    ),
  ];

  // Grade
  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  return {
    coverage: { parameters: !!paramAnalysis, triggers: triggersRead, ga4: !!comparison?.comparison,
      complete: !!paramAnalysis && triggersRead && !!comparison?.comparison },
    meta: {
      accountId,
      containerId,
      workspaceId: wsId,
      propertyId: propertyId || null,
      period: propertyId ? { startDate, endDate } : null,
      auditedAt: new Date().toISOString(),
    },
    score,
    grade,
    summary: {
      measurementIds: summary.measurementIds,
      hasGa4ConfigTag: summary.hasGa4ConfigTag,
      ga4ConfigTagsCount: summary.ga4ConfigTagsCount,
      ga4EventTagsCount: summary.ga4EventTagsCount,
      triggersCount,
      issuesCount: {
        critical: issues.filter((i) => i.severity === "critical").length,
        high: issues.filter((i) => i.severity === "high").length,
        medium: issues.filter((i) => i.severity === "medium").length,
        low: issues.filter((i) => i.severity === "low").length,
        info: issues.filter((i) => i.severity === "info").length,
      },
    },
    issues: issues.sort((a, b) => {
      const order = ["critical", "high", "medium", "low", "info"];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    }),
    recommendations: uniqueRecs,
    parameterAnalysis: paramAnalysis
      ? {
          totalEventTags: paramAnalysis.totalEventTags,
          healthy: paramAnalysis.summary?.healthy,
          needsAttention: paramAnalysis.summary?.needsAttention,
        }
      : null,
    ga4Comparison: comparison
      ? {
          matchRate: comparison.insights?.matchRate,
          matched: comparison.comparison?.matched,
          configuredButNotSeen: comparison.comparison?.configuredInGtmButNotSeenInGa4,
          seenButNotConfigured: comparison.comparison?.trulyMissingInGtm,
          notes: comparison.insights?.notes,
        }
      : null,
  };
}
