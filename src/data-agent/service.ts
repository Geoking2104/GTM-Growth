/** Shared semantic reads for the console and Eve. No SQL, writes, raw answers or arbitrary tool dispatch. */
import { z } from "zod";
import type { Tenant } from "../tenants/store.js";
import { withCredential } from "../auth/service-account.js";
import { querySearchAnalytics } from "../google/search-console.js";
import { runReport } from "../google/data-api.js";
import { periodOf } from "../console/analytics.js";
import { latestDataset } from "../console/ai-visibility-store.js";
import type { Dataset } from "../console/ai-visibility.js";
import { listPrompts, listVisibilityRuns, listAlerts } from "../console/ops-store.js";
import type { AgentProfile } from "./profile.js";

export const querySchema = z.object({
  model: z.enum(["workspace", "search", "analytics", "visibility", "operations"]),
  days: z.union([z.literal(7), z.literal(28), z.literal(90)]).default(28),
  source: z.string().max(2048).optional(),
  locale: z.enum(["fr", "en"]).default("en"),
}).strict();
export type AgentQuery = z.infer<typeof querySchema>;
export const catalog = [
  { id: "workspace", description: "Configured sources and domains; configuration is not verified access.", grain: "one active workspace", metrics: ["domains", "gscProperties", "ga4Properties"], period: "current configuration", caveat: "No connection-health or business-performance claim." },
  { id: "search", description: "Google Search Console web-search totals for one authorized property.", grain: "property and inclusive date window", metrics: ["clicks", "impressions"], period: "7, 28 or 90 days, ending 3 days ago", caveat: "Search Console reporting delay applies. Select a property when several exist. Counts are not conversions." },
  { id: "analytics", description: "GA4 aggregate sessions and configured key events for one authorized property.", grain: "property and inclusive date window", metrics: ["sessions", "keyEvents"], period: "7, 28 or 90 days, ending yesterday", caveat: "Key events are not necessarily leads, sales, people or revenue. Check event configuration before interpreting them." },
  { id: "visibility", description: "Latest imported AI answer dataset; reviewed and unreviewed mentions stay separate.", grain: "one dataset, first configured brand, all observed sources", metrics: ["responses", "confirmedResponses", "unreviewedResponses", "confirmedPresence"], period: "actual minimum and maximum observation dates, never the requested rolling period", caveat: "An observed sample, not market share, demand or a GEO readiness score. Never average datasets with different panels. Brand aliases are heuristic until reviewed." },
  { id: "operations", description: "Saved prompt inventory, latest collection run, and unacknowledged alert sample.", grain: "workspace; at most 200 latest alerts", metrics: ["prompts", "pendingAlertsSample", "latestRunSucceeded", "latestRunFailed"], period: "current inventory and latest recorded run", caveat: "Prompts are configured questions, not measured demand. Alert sample is not an exhaustive incident count." },
] as const;
export type AgentMetric = { id: string; label: string; value: number | null; unit: "count" | "percent" };
export type AgentResult = {
  model: string; state: "ready" | "empty" | "not-configured" | "choose-source" | "unavailable";
  summary: string; source: string; readAt: string; period: { start: string; end: string } | null;
  metrics: AgentMetric[]; caveats: string[]; href: string; sources?: string[]; importedAt?: string; brand?: string;
};
export function nextActions(profile: AgentProfile, locale: string, section = "overview") {
  const L = (fr: string, en: string) => locale === "fr" ? fr : en;
  const actions = new Map<string, { href: string; title: string; reason: string }>();
  const add = (href: string, title: string, reason: string) => { if (!actions.has(href)) actions.set(href, { href, title, reason }); };
  if (profile.stage === "discover" || profile.stage === "activate") add("#tracking", L("Vérifier les sources", "Verify your sources"), L("Commencez par des accès et des mesures fiables.", "Start with working connections and trustworthy measurements."));
  if (profile.role === "technical") add("#audit", L("Vérifier les blocages techniques", "Check technical blockers"), L("Priorité liée à votre rôle technique.", "Prioritized for your technical role."));
  if (profile.goal === "traffic") add("#gsc", L("Analyser les clics organiques", "Review organic clicks"), L("Reliez les requêtes et les pages à votre objectif de trafic.", "Connect queries and pages to your traffic goal."));
  if (profile.goal === "leads" || profile.goal === "sales") add("#ga4", L("Valider les événements clés", "Validate key events"), L("Définissez les événements qui représentent réellement un prospect ou une vente.", "Define which events actually represent a lead or sale."));
  if (profile.goal === "ai-visibility") add("#ai_visibility", L("Vérifier les réponses IA", "Review AI answers"), L("Comparez les mentions observées et validées sur un panel stable.", "Compare observed, reviewed mentions on a stable panel."));
  if (profile.goal === "local") add("#local_seo/network", L("Vérifier le réseau local", "Review local locations"), L("Priorisez les établissements et leurs données vérifiées.", "Prioritize locations and their verified data."));
  if (profile.stage === "retain") add("#ops/alerts", L("Examiner les alertes", "Review alerts"), L("Repérez les régressions avant de préparer le prochain bilan.", "Check regressions before the next review."));
  if (profile.stage === "expand" || profile.role === "agency") add("#report", L("Préparer un bilan client", "Prepare a customer review"), L("Gardez les résultats de chaque espace séparés.", "Keep each workspace's results separate."));
  if (section === "journey" || profile.stage === "grow") add("#journey", L("Relier contenus et audience", "Connect content and audience"), profile.audience || L("Précisez votre audience cible dans le profil.", "Set your target audience in the profile."));
  add("#journey", L("Préparer les questions du parcours", "Prepare journey questions"), L("Les questions proposées restent des hypothèses à valider.", "Suggested questions remain hypotheses to validate."));
  return [...actions.values()].slice(0, 4);
}
const active = new Map<string, number>();
export async function readModel(tenant: Tenant, input: unknown, dependencies = { search: querySearchAnalytics, analytics: runReport }): Promise<AgentResult> {
  if (tenant.status !== "active") throw new Error("Active workspace required");
  const q = querySchema.parse(input); const L = (fr: string, en: string) => q.locale === "fr" ? fr : en;
  const result: AgentResult = { model: q.model, state: "ready", summary: "", source: "GTM Growth", readAt: new Date().toISOString(), period: null, metrics: [], caveats: [], href: "#tracking" };
  const metric = (id: string, fr: string, en: string, value: number | null, unit: "count" | "percent" = "count") => result.metrics.push({ id, label: L(fr, en), value, unit });
  if (q.model === "workspace") {
    metric("domains", "Domaines autorisés", "Authorized domains", tenant.domains.length);
    metric("gscProperties", "Propriétés Search Console configurées", "Configured Search Console properties", tenant.gscProperties.length);
    metric("ga4Properties", "Propriétés GA4 configurées", "Configured GA4 properties", tenant.ga4Properties?.length ?? 0);
    result.summary = L("Voici les sources configurées pour cet espace.", "These are the configured sources for this workspace.");
    result.caveats = [L("Une configuration ne prouve pas que l'accès fonctionne.", "Configuration does not prove that access works.")]; return result;
  }
  if (q.model === "visibility") {
    result.source = L("Dernier jeu de réponses IA importé", "Latest imported AI answer dataset"); result.href = "#ai_visibility";
    const data = latestDataset<Dataset>(tenant.id);
    if (!data?.observations.length || !data.brands.length) { result.state = "empty"; result.summary = L("Importez des réponses IA pour commencer à mesurer les mentions.", "Import AI answers to start measuring mentions."); return result; }
    const brand = data.brands[0].name; result.brand = brand;
    const confirmed = data.observations.filter(r => r.mentions.some(m => m.brand === brand && m.status === "confirmed")).length;
    const unreviewed = data.observations.filter(r => r.mentions.some(m => m.brand === brand && !m.status)).length;
    const dates = data.observations.map(r => r.observedAt).sort(); result.period = { start: dates[0], end: dates[dates.length - 1] }; result.importedAt = data.createdAt;
    metric("responses", "Réponses observées", "Observed responses", data.observations.length);
    metric("confirmedResponses", "Réponses avec mention validée", "Responses with confirmed mentions", confirmed);
    metric("unreviewedResponses", "Réponses avec mention à vérifier", "Responses with unreviewed mentions", unreviewed);
    metric("confirmedPresence", "Présence validée dans cet échantillon", "Confirmed presence in this sample", Math.round(confirmed / data.observations.length * 1000) / 10, "percent");
    result.summary = L(`Échantillon observé pour ${brand}.`, `Observed sample for ${brand}.`);
    result.caveats = [L("Période réelle de l'échantillon, pas une période glissante. L'import n'atteste pas la fraîcheur des observations. Ce taux n'est ni une part de marché ni le score GEO.", "Actual sample period, not a rolling window. Import time does not prove observation freshness. This rate is neither market share nor the GEO score.")]; return result;
  }
  if (q.model === "operations") {
    result.href = "#ops"; const run = listVisibilityRuns(tenant.id, 1)[0];
    metric("prompts", "Questions enregistrées", "Saved questions", listPrompts(tenant.id).length);
    metric("pendingAlertsSample", "Alertes non acquittées (200 max.)", "Unacknowledged alerts (200 max.)", listAlerts(tenant.id, false).length);
    metric("latestRunSucceeded", "Dernière collecte : réussites", "Latest collection: successes", run?.succeeded ?? null);
    metric("latestRunFailed", "Dernière collecte : échecs", "Latest collection: failures", run?.failed ?? null);
    result.period = run ? { start: run.ranAt, end: run.ranAt } : null;
    result.summary = L("État enregistré des opérations. Aucune collecte n'est lancée.", "Recorded operations status. No collection is started.");
    result.caveats = [L("Les questions ne mesurent pas la demande. Les alertes sont un échantillon limité.", "Saved questions do not measure demand. Alerts are a bounded sample.")]; return result;
  }
  const search = q.model === "search"; const sources = search ? tenant.gscProperties : tenant.ga4Properties ?? [];
  result.source = search ? "Google Search Console" : "Google Analytics 4"; result.href = search ? "#gsc" : "#ga4";
  if (q.source && !sources.includes(q.source)) throw new Error("Source outside workspace");
  if (!sources.length) { result.state = "not-configured"; result.summary = L("Configurez une propriété dans Tracking pour lire ces mesures.", "Configure a property in Tracking to read these metrics."); result.href = "#tracking"; return result; }
  if (!q.source && sources.length > 1) { result.state = "choose-source"; result.sources = sources; result.summary = L("Choisissez la propriété à analyser.", "Choose the property to analyze."); return result; }
  const source = q.source ?? sources[0]; result.source += ` · ${source}`; result.period = periodOf(q.days, search ? 3 : 1);
  if ((active.get(tenant.id) ?? 0) >= 2) { result.state = "unavailable"; result.summary = L("Deux lectures sont déjà en cours. Réessayez après leur fin.", "Two reads are already running. Retry when they finish."); return result; }
  active.set(tenant.id, (active.get(tenant.id) ?? 0) + 1);
  try {
    await withCredential(tenant.googleCredential, async () => {
      const window = result.period!;
      if (search) {
        const response = await dependencies.search({ siteUrl: source, startDate: window.start, endDate: window.end, type: "web", dimensions: [], rowLimit: 1 });
        const row = response.rows[0];
        if (!row) { result.state = "empty"; return; }
        metric("clicks", "Clics", "Clicks", row.clicks ?? null); metric("impressions", "Impressions", "Impressions", row.impressions ?? null);
      } else {
        const response = await dependencies.analytics({ propertyId: source.replace(/^properties\//, ""), metrics: ["sessions", "keyEvents"], startDate: window.start, endDate: window.end, limit: 1 });
        const row = response.rows[0]; if (!row) { result.state = "empty"; return; }
        const value = (key: string) => row[key] !== undefined && Number.isFinite(Number(row[key])) ? Number(row[key]) : null;
        metric("sessions", "Sessions", "Sessions", value("sessions")); metric("keyEvents", "Événements clés", "Key events", value("keyEvents"));
      }
    });
    result.summary = result.state === "empty" ? L("Aucune ligne retournée pour cette période ; ce n'est pas une valeur zéro.", "No rows returned for this period; this is not a zero value.") : L("Mesures agrégées sur la période indiquée.", "Aggregate measurements for the stated period.");
  } catch { result.state = "unavailable"; result.summary = L("Lecture indisponible. Vérifiez les accès dans Tracking, puis réessayez.", "Reading unavailable. Check access in Tracking, then retry."); result.metrics = []; }
  finally { active.set(tenant.id, Math.max(0, (active.get(tenant.id) ?? 1) - 1)); }
  result.caveats = [search ? L("Données arrêtées il y a trois jours pour tenir compte du délai Search Console.", "Window ends three days ago to allow for Search Console reporting delay.") : L("Les événements clés ne sont pas nécessairement des prospects ou des ventes. Vérifiez leur définition.", "Key events are not necessarily leads or sales. Verify their definition.")];
  return result;
}
