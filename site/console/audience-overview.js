/* Live search and traffic trends. Missing AI-answer metrics are never simulated. */
import { el } from "./render.js";
import { lineChart, toolbar } from "./analytics.js";
import { LANG } from "./i18n.js";
import { metricIcon, visibilityChart } from "./visuals.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const fmt = (value) => Number(value).toLocaleString(L("fr-FR", "en-GB"));
export function renderAudienceOverview({ search, ga4, status, state, rerender, ai: aiData }) {
  const section = el("section", "audience-overview");
  section.append(el("h3", "", L("Votre audience dans le temps", "Your audience over time")), el("p", "c-note", L("Données observées sur les propriétés connectées. Chaque graphique utilise sa propre échelle et les dates fournies par la source.", "Observed data from connected properties. Each chart uses its own scale and source dates.")), toolbar(state, rerender));
  const grid = el("div", "audience-grid");
  for (const item of [
    { data: search, label: L("Clics Google Search", "Google Search clicks"), key: "clicks", color: "#4f5bd5", link: "#gsc", name: "Search Console" },
    { data: ga4, label: L("Sessions GA4", "GA4 sessions"), key: "sessions", color: "#008373", link: "#ga4", name: "GA4" },
  ]) {
    const card = el("section", "audience-card"); card.append(el("h4", "", item.label));
    if (item.data?.trend?.length && !item.data.problem) {
      const rows = item.data.trend.filter((row) => row.date && row[item.key] !== null && row[item.key] !== undefined && Number.isFinite(Number(row[item.key]))).sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length) {
        const total = item.data.totals?.[item.key]; if (total !== null && total !== undefined && Number.isFinite(Number(total))) card.append(el("p", "audience-total", fmt(total)));
        card.append(lineChart(rows, [{ key: item.key, label: item.label, color: item.color }], item.label));
        const details = el("details", "audience-table"); details.append(el("summary", "", L("Voir les données", "View data"))); const table = el("table", "app-table"); const head = el("tr"); for (const title of ["Date", item.label]) { const th = el("th", "", title); th.scope = "col"; head.append(th); } const thead = el("thead"); thead.append(head); table.append(thead); const body = el("tbody"); for (const row of rows) { const tr = el("tr"); tr.append(el("td", "", row.date), el("td", "", fmt(row[item.key]))); body.append(tr); } table.append(body); details.append(table); card.append(details);
      } else card.append(el("p", "c-note", L("Aucune donnée sur cette période.", "No data for this period.")));
    } else { card.append(el("p", "c-note", item.data?.problem ? L("Données indisponibles : vérifiez la connexion.", "Data unavailable: check the connection.") : item.data ? L("Aucune donnée sur cette période.", "No data for this period.") : !status ? L("Statut des accès indisponible.", "Connection status unavailable.") : L("Connectez cette source pour afficher son historique.", "Connect this source to see its history."))); }
    const link = el("a", "", L(`Ouvrir ${item.name} →`, `Open ${item.name} →`)); link.href = item.link; card.append(link); grid.append(card);
  }
  section.append(grid);
  const ai = el("div", "audience-ai"); ai.append(el("h3", "", L("Présence dans les réponses IA", "Presence in AI answers")), el("p", "c-note", L("Ces indicateurs demandent des réponses d’IA collectées et analysées. L’audit GEO ci-dessous mesure la préparation du site, pas les mentions effectives.", "These metrics require collected and analyzed AI answers. The GEO audit below measures site readiness, not actual mentions.")));
  const percent = value => Number.isFinite(value) ? `${Number(value).toLocaleString(LANG, { maximumFractionDigits: 1 })} %` : "—";
  const available = aiData && !aiData.unavailable;
  const metrics = el("div", "audience-metrics");
  for (const [name, value, desc, symbol] of [
    [L("Visibilité de marque", "Brand visibility"), available ? percent(aiData.visibility) : "—", L("Part des réponses qui mentionnent la marque", "Share of answers mentioning the brand"), "eye"],
    [L("Part de voix", "Share of voice"), available ? percent(aiData.shareOfVoice) : "—", L("Mentions par rapport aux marques suivies", "Mentions relative to tracked brands"), "geo"],
    [L("Réponses analysées", "Answers analyzed"), available ? String(aiData.total) : "—", L("Dernier jeu importé · mentions à vérifier", "Latest imported dataset · mentions need review"), "report"],
  ]) { const cell = el("div"); cell.append(metricIcon(symbol), el("strong", "", name), el("p", "audience-missing", value), el("p", "c-note", desc)); if (!available) cell.append(el("p", "c-note", aiData?.unavailable ? L("Source indisponible", "Source unavailable") : L("Non mesuré", "Not measured"))); metrics.append(cell); }
  ai.append(metrics);
  const link = el("a", "v-context-link", available ? L(`Consulter les preuves pour ${aiData.brand} →`, `Inspect evidence for ${aiData.brand} →`) : L("Importer des réponses pour afficher ces indicateurs →", "Import answers to show these metrics →")); link.href = "#ai_visibility"; ai.append(link); section.append(ai);
  if (available && aiData.responses?.length) {
    const trends = el("div", "v-trend-grid"), present = (r, name) => r.mentions.some(m => m.brand === name && m.status !== "rejected");
    trends.append(visibilityChart(aiData.responses, aiData.brands.map(b => ({ label: b.name, matches: r => present(r, b.name) })), L("Comparaison des marques", "Brand comparison")), visibilityChart(aiData.responses, aiData.sources.map(source => ({ label: source, filter: r => r.source === source, matches: r => present(r, aiData.brand) })), L(`Présence de ${aiData.brand} par source`, `${aiData.brand} presence by source`))); section.append(trends);
  }
  return section;
}
