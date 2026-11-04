/* Définition des onglets de la console : chaque action appelle une route
 * /api/console/* et rend son résultat. Phase 1 : Sitemap, GEO, Performance. */
import { renderSitemapMap } from "../sitemap-map.js";
import { el, metrics, table, code, raw, list, kb } from "./render.js";

const checks = (result) => table(result?.checks ?? [], [["label", "Contrôle"], ["status", "Statut"], [(c) => `${c.earned}/${c.max}`, "Points"], ["evidence", "Constat"], ["fix", "Correctif"]]);

export const TABS = [
  {
    id: "sitemap", label: "Sitemap", intro: "Carte visuelle, audit GEO page par page et génération d'un sitemap XML.",
    actions: [
      { id: "map", label: "Carte du sitemap", route: "/sitemap/map", render: (d) => { const host = el("div", "sitemap-map"); renderSitemapMap(host, d.map, "fr"); return [metrics([["Sitemap", d.sitemapUrl], ["Entrées", d.entries]]), host]; } },
      { id: "audit", label: "Audit GEO du sitemap", route: "/sitemap/audit", params: [{ name: "maxUrls", label: "Pages (max 25)", type: "number", value: 10 }],
        render: (d) => [metrics([["Score moyen", d.averageScore], ["Pages auditées", d.pagesAudited], ["Échecs", d.pagesFailed]]), el("h4", "", "Pages les plus faibles"), table(d.weakest, [["url", "URL"], ["score", "Score"], ["band", "Niveau"], [(r) => r.topFixes.join(" · "), "Correctifs prioritaires"]]), el("h4", "", "Manques sur tout le site"), list(d.missingAcrossSite)] },
      { id: "build", label: "Générer un sitemap", route: "/sitemap/build", params: [{ name: "maxUrls", label: "URL (max 500)", type: "number", value: 50 }],
        render: (d) => [metrics([["Pages récupérées", d.stats.fetched], ["Découvertes", d.stats.discovered], ["Incluses", d.stats.included], ["Bloquées", d.stats.blocked]]), code(d.xml, "sitemap.xml"), list(d.limits)] },
    ],
  },
  {
    id: "geo", label: "GEO", intro: "Lisibilité IA (citabilité), llms.txt, robots IA et données structurées — en direct.",
    actions: [
      { id: "citability", label: "Citabilité IA", route: "/geo/citability", render: (d) => [metrics([["Score", `${d.score}/100`], ["Points", `${d.points}/${d.max}`]]), table(d.methods, [["label", "Méthode"], [(m) => `${m.points}/${m.max}`, "Points"], ["evidence", "Constat"]]), el("h4", "", "Points forts"), list(d.strengths), el("h4", "", "Manques"), list(d.gaps)] },
      { id: "llms", label: "llms.txt : valider, générer, dérive", route: "/geo/llms",
        render: (d) => [el("h4", "", "Validation"), checks(d.validation), el("h4", "", "Dérive vs sitemap"), d.drift?.error ? el("p", "c-note", d.drift.error) : metrics([["Couverture", `${d.drift.coverage}%`], ["Synchronisé", d.drift.inSync ? "oui" : "non"], ["Absentes de llms.txt", d.drift.missingFromLlms.length], ["Obsolètes", d.drift.staleInLlms.length]]), d.generated ? code(d.generated, "llms.txt") : el("p", "c-note", "Génération impossible : aucun sitemap trouvé.")] },
      { id: "robots", label: "Robots IA", route: "/geo/robots",
        render: (d) => [metrics([["Autorisés", d.audit.data.botsAllowed.length], ["Bloqués", d.audit.data.botsBlocked.length], ["Non déclarés", d.audit.data.botsMissing.length]]), checks(d.audit), el("h4", "", "robots.txt proposé"), code(d.fix.content, "robots.txt")] },
      { id: "schema", label: "Données structurées", route: "/geo/schema", render: (d) => [checks(d.audit)] },
    ],
  },
  {
    id: "performance", label: "Performance", intro: "PageSpeed Insights, Core Web Vitals terrain (CrUX) et poids de page mesuré.",
    actions: [
      { id: "psi", label: "PageSpeed", route: "/performance/pagespeed", params: [{ name: "strategy", label: "Appareil", type: "select", options: [["mobile", "Mobile"], ["desktop", "Ordinateur"]] }],
        render: (d) => [metrics(Object.entries(d.scores ?? {}).map(([k, v]) => [k, v])), metrics(Object.entries(d.vitals ?? {}).map(([k, v]) => [k.toUpperCase(), v]))] },
      { id: "crux", label: "Core Web Vitals (CrUX)", route: "/performance/crux", params: [{ name: "formFactor", label: "Appareil", type: "select", options: [["PHONE", "Mobile"], ["DESKTOP", "Ordinateur"], ["ALL_FORM_FACTORS", "Tous"]] }, { name: "scope", label: "Portée", type: "select", options: [["origin", "Origine"], ["url", "URL"]] }],
        render: (d) => [metrics(Object.entries(d.summary ?? d.metrics ?? {}).map(([k, v]) => [k, v?.p75 ?? "—"]))] },
      { id: "weight", label: "Poids de page", route: "/performance/weight",
        render: (d) => [metrics([["Total", kb(d.totalBytes)], ["Ressources", d.resources.length], ["Taille inconnue", d.unknown]]), table(Object.entries(d.byType).map(([type, v]) => ({ type, count: v.count, poids: kb(v.bytes) })), [["type", "Type"], ["count", "Nombre"], ["poids", "Poids"]]), table([...d.resources].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)).slice(0, 20).map((r) => ({ ...r, poids: kb(r.bytes) })), [["url", "Ressource"], ["type", "Type"], ["poids", "Poids"]])] },
    ],
  },
];

const pct = (v) => (typeof v === "number" ? `${(v * 100).toFixed(1)} %` : "—");
const pos = (v) => (typeof v === "number" ? v.toFixed(1) : "—");
const days = { name: "days", label: "Période (jours)", type: "number", value: 28 };
const eur = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("fr-FR")} €`);

function sparkline(rows, key, label) {
  const values = rows.map((r) => r[key] ?? 0); const max = Math.max(1, ...values); const w = 720; const h = 120;
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 10) - 5}`).join(" ");
  const box = el("figure", "c-chart"); box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${label}"><polyline fill="none" stroke="#2563eb" stroke-width="2" points="${points}"/></svg>`;
  box.append(el("figcaption", "c-note", `${label} — max ${max.toLocaleString("fr-FR")}`)); return box;
}

TABS.push(
  {
    id: "search", label: "Search", intro: "Données Search Console en direct pour la propriété indiquée en haut de page.",
    actions: [
      { id: "queries", label: "Requêtes", route: "/search/queries", needsUrl: false, params: [days, { name: "rowLimit", label: "Lignes", type: "number", value: 250 }],
        render: (d) => [el("p", "c-note", `Du ${d.period.start} au ${d.period.end}`), table(d.rows, [["query", "Requête"], ["clicks", "Clics"], ["impressions", "Impressions"], [(r) => pct(r.ctr), "CTR"], [(r) => pos(r.position), "Position"]])] },
      { id: "trends", label: "Tendances", route: "/search/trends", needsUrl: false, params: [{ ...days, value: 90 }],
        render: (d) => [sparkline(d.rows, "clicks", "Clics par jour"), sparkline(d.rows, "impressions", "Impressions par jour")] },
      { id: "losing", label: "Pages qui perdent des clics", route: "/search/losing-pages", needsUrl: false, params: [days],
        render: (d) => [table(d.pages, [["page", "Page"], ["clicksBefore", "Clics avant"], ["clicksAfter", "Clics après"], ["delta", "Écart"], [(r) => (r.deltaPercent === null ? "—" : `${r.deltaPercent} %`), "Écart %"], [(r) => `${pos(r.positionBefore)} → ${pos(r.positionAfter)}`, "Position"]])] },
      { id: "inspect", label: "Inspection d'URL", route: "/search/inspect", needsUrl: false, params: [{ name: "inspectUrl", label: "URL à inspecter", placeholder: "https://…" }],
        render: (d) => { const r = d.inspectionResult?.indexStatusResult ?? {}; return [metrics([["Verdict", r.verdict], ["Couverture", r.coverageState], ["Dernier crawl", r.lastCrawlTime], ["Canonique Google", r.googleCanonical], ["Robots", r.robotsTxtState], ["Indexation", r.indexingState]])]; } },
    ],
  },
  {
    id: "keywords", label: "Mots-clés", intro: "Score d'opportunité et regroupement des requêtes, calculés à partir des paires requête/page de Search Console.",
    actions: [
      { id: "opps", label: "Opportunités et clusters", route: "/keywords/opportunities", needsUrl: false, params: [days, { name: "minImpressions", label: "Impressions min.", type: "number", value: 20 }, { name: "targetPosition", label: "Position cible", type: "number", value: 3 }],
        render: (d) => [el("h4", "", "Clusters"), table(d.clusters, [["label", "Thème"], [(c) => c.queries.length, "Requêtes"], ["impressions", "Impressions"], ["clicks", "Clics"], ["score", "Score"], [(c) => c.pages.slice(0, 2).join(" · "), "Pages"]]), el("h4", "", "Requêtes à travailler"), table(d.opportunities, [["query", "Requête"], ["score", "Score"], [(r) => pos(r.position), "Position"], ["impressions", "Impressions"], ["potentialClicks", "Clics potentiels"], ["reason", "Action"], ["page", "Page"]])] },
    ],
  },
  {
    id: "calculators", label: "Calculateurs", intro: "Estimations indicatives : courbe de CTR par position, valeur du trafic, ROI et budget SEO.",
    actions: [
      { id: "ctr", label: "CTR par position", route: "/calc/ctr", needsUrl: false, button: "Afficher", render: (d) => [table(d.curve.map((r) => ({ ...r, ctr: `${r.ctr} %` })), [["position", "Position"], ["ctr", "CTR moyen"]]), el("p", "c-note", d.source)] },
      { id: "value", label: "Valeur du trafic organique", route: "/calc/traffic-value", needsUrl: false, button: "Calculer", params: [{ name: "searchVolume", label: "Volume mensuel", type: "number", value: 1000 }, { name: "position", label: "Position", type: "number", value: 3 }, { name: "clicks", label: "ou clics réels (GSC)", type: "number" }, { name: "cpc", label: "CPC équivalent (€)", type: "number", step: "0.01", value: 1.5 }],
        render: (d) => [metrics([["Clics / mois", d.clicks], ["Valeur / mois", eur(d.monthlyValue)], ["Valeur / an", eur(d.yearlyValue)]])] },
      { id: "roi", label: "ROI SEO", route: "/calc/roi", needsUrl: false, button: "Calculer", params: [{ name: "monthlyTraffic", label: "Trafic / mois", type: "number", value: 5000 }, { name: "conversionRate", label: "Conversion (%)", type: "number", step: "0.1", value: 2 }, { name: "averageOrderValue", label: "Panier moyen (€)", type: "number", value: 80 }, { name: "margin", label: "Marge (%)", type: "number", value: 40 }, { name: "monthlyCost", label: "Coût SEO / mois (€)", type: "number", value: 1500 }],
        render: (d) => [metrics([["Conversions", d.conversions], ["CA", eur(d.revenue)], ["Marge brute", eur(d.grossProfit)], ["ROI", d.roiPercent === null ? "—" : `${d.roiPercent} %`], ["Trafic d'équilibre", d.breakEvenTraffic]])] },
      { id: "budget", label: "Budget SEO", route: "/calc/budget", needsUrl: false, button: "Calculer", params: [{ name: "targetRevenue", label: "Objectif CA / mois (€)", type: "number", value: 20000 }, { name: "conversionRate", label: "Conversion (%)", type: "number", step: "0.1", value: 2 }, { name: "averageOrderValue", label: "Panier moyen (€)", type: "number", value: 80 }, { name: "costPerVisit", label: "Coût par visite (€)", type: "number", step: "0.01", value: 0.3 }],
        render: (d) => [metrics([["Conversions nécessaires", d.conversionsNeeded], ["Trafic nécessaire", d.trafficNeeded], ["Budget / mois", eur(d.monthlyBudget)]])] },
    ],
  },
  {
    id: "report", label: "Rapport PDF", intro: "Rapport GEO complet (audit, plateformes IA, citabilité) généré à la demande pour le domaine choisi.",
    actions: [{ id: "pdf", label: "Exporter le rapport PDF", route: "/report/pdf", download: "rapport-geo.pdf", button: "Générer le PDF", params: [{ name: "brandName", label: "Marque (optionnel)" }] }],
  },
);

export { raw };
