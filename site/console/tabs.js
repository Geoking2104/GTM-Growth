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

export { raw };
