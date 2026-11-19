import { el } from "./render.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => LANG === "fr" ? fr : en;
const number = (value) => value.toLocaleString(L("fr-FR", "en-GB"), { maximumFractionDigits: 1 });
const metrics = [
  ["visibility", "Visibilité de la marque", "Brand visibility"],
  ["shareOfVoice", "Part de voix du panel", "Panel share of voice"],
];

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  const safe = typeof value === "string" && /^[\s\uFEFF]*[=@+\-\t\r\n]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function comparisonCsv(report) {
  const header = ["method", "state", "panel", "brand", "source", "group_id", "prompt", "action_id", "history", "datasets", "minimum_per_window",
    "metric", "period", "from_utc", "to_utc", "responses", "without_context", "included", "excluded", "shared_cohorts", "rate_percent", "change_points"];
  const rows = metrics.flatMap(([key]) => {
    const metric = report[key];
    return report.windows.map((window, index) => [
      report.method, report.state, report.panel, report.brand, report.filters.source, report.filters.groupId, report.filters.prompt, report.filters.actionId,
      report.filters.includeHistory, report.datasets, report.minimumPerWindow, key, index === 0 ? "previous" : "current",
      window.from, window.to, window.responses, window.withoutContext, metric.included[index], window.responses - metric.included[index],
      metric.sharedCohorts, index === 0 ? metric.previous : metric.current, index === 0 ? null : metric.delta,
    ]);
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function measurementLabel(context) {
  return [[L("Moteur", "Engine"), context.engine], [L("Modèle", "Model"), context.model], [L("Mode", "Mode"), context.mode],
    [L("Langue", "Language"), context.language], [L("Marché", "Market"), context.market]]
    .filter(([, value]) => value).map(([label, value]) => `${label} ${value}`).join(" · ");
}

function renderMetrics(report) {
  return metrics.map(([key, fr, en]) => {
    const metric = report[key];
    const box = el("div");
    const heading = el("h4", "", L(fr, en));
    const value = metric.delta === null ? L("Évolution indisponible", "Change unavailable")
      : `${number(metric.previous)} % → ${number(metric.current)} % · ${metric.delta > 0 ? "+" : ""}${number(metric.delta)} ${L("points", "points")}`;
    box.append(heading, el("p", "", value));
    const coverage = report.windows.map((window, index) => {
      const included = metric.included[index];
      return L(`${window.from} – ${window.to} · ${included}/${window.responses} réponses comparées · ${window.responses - included} exclues`,
        `${window.from} – ${window.to} · ${included}/${window.responses} answers matched · ${window.responses - included} excluded`);
    });
    for (const line of coverage) box.append(el("p", "c-note", line));
    box.append(el("p", "c-note", L(`${metric.sharedCohorts} cohortes communes, pondérées à parts égales.`, `${metric.sharedCohorts} shared cohorts, weighted equally.`)));
    if (key === "shareOfVoice" && metric.delta === null && report.state === "comparable") {
      box.append(el("p", "c-note", L("La part de voix exige des mentions observées des marques suivies dans les deux fenêtres et une couverture suffisante.", "Share of voice requires tracked-brand mentions in both windows and sufficient coverage.")));
    }
    return box;
  });
}

function renderResult(report) {
  const content = [];
  if (report.state === "incomplete") content.push(el("p", "c-note", L("Choisissez deux fenêtres UTC terminées pour obtenir l’évolution.", "Choose two closed UTC windows to calculate the change.")));
  if (report.state === "insufficient") content.push(el("p", "c-note", L(
    `Couverture insuffisante. Il faut au moins ${report.minimumPerWindow} réponses comparables par période.`,
    `Insufficient coverage. At least ${report.minimumPerWindow} comparable answers are required per window.`,
  )));
  content.push(...renderMetrics(report));
  const older = report.windows.reduce((sum, window) => sum + window.withoutContext, 0);
  if (older) content.push(el("p", "c-note", L(
    `${older} réponses sans contexte détaillé. Elles sont comparées entre elles par question, source et provenance.`,
    `${older} answers lack detailed context. They are matched with one another by prompt, source and provenance.`,
  )));
  const download = el("button", "btn btn-small", L("Exporter la comparaison CSV", "Export comparison CSV"));
  download.type = "button";
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob(["\ufeff", comparisonCsv(report)], { type: "text/csv;charset=utf-8" }));
    const link = el("a");
    link.href = url;
    link.download = "visibility-comparison.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  content.push(download);
  return content;
}

export function renderPeriodComparison(api, filters, { action = false } = {}) {
  const box = el(action ? "div" : "section", action ? "" : "ai-chart");
  const heading = action ? L("Comparer après l’action", "Compare after the action")
    : L("Comparaison avec la période précédente", "Comparison with the previous period");
  const result = el("div");
  const trigger = el("button", "btn btn-small", heading);
  trigger.type = "button";
  async function load() {
    trigger.disabled = true;
    const status = el("p", "c-note", L("Calcul de la comparaison…", "Calculating comparison…"));
    status.setAttribute("role", "status");
    result.replaceChildren(status);
    try {
      const report = await api("/competition/comparison", filters);
      result.replaceChildren(...renderResult(report));
      trigger.remove();
    } catch {
      status.textContent = L("Comparaison indisponible pour ces filtres.", "Comparison unavailable for these filters.");
      trigger.textContent = L("Réessayer", "Retry");
      trigger.disabled = false;
      if (!trigger.isConnected && trigger.parentNode !== box) box.append(trigger);
    }
  }
  trigger.onclick = load;
  if (action) box.append(trigger, result);
  else {
    box.append(el("h3", "", heading), result);
    void load();
  }
  return box;
}
