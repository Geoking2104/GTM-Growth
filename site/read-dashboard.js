/** Anonymous audit charts. Only the public observations enter these views. */
import { completionStats } from "./console/completion-donut.js";

const categories = {
  robots: ["Accès des robots", "Crawler access"], llms: ["Documentation IA", "AI documentation"],
  jsonld: ["Données structurées", "Structured data"], meta: ["Métadonnées", "Metadata"],
  content: ["Contenu", "Content"], brand: ["Identité de marque", "Brand identity"],
  discovery: ["Découverte IA", "AI discovery"], rendering: ["Rendu navigateur", "Browser rendering"],
};

export function node(tag, className, label) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (label !== undefined) el.textContent = String(label);
  return el;
}

function progress(value, label) {
  const bar = node("progress", "read-meter");
  bar.max = 100; bar.value = value;
  bar.setAttribute("aria-label", label);
  return bar;
}

function kpi(id, label, value, detail, pct) {
  const card = node("article", "read-kpi read-" + id);
  card.append(node("h3", "", label), node("strong", "read-value", value), node("small", "", detail));
  if (pct != null) card.append(progress(pct, label));
  return card;
}

function card(title, theme, description) {
  const box = node("section", "read-panel read-" + theme);
  box.append(node("h3", "", title));
  if (description) box.append(node("p", "read-caption", description));
  return box;
}

export function dashboardMetrics(report, payload, lang) {
  const fr = lang === "fr", L = (a, b) => fr ? a : b;
  const number = new Intl.NumberFormat(lang);
  const pct = n => number.format(n) + (fr ? " %" : "%");
  const controls = payload?.geoV2?.controls;
  const total = 42;
  const stats = completionStats(controls);
  const resolved = stats.observed + stats.notApplicable;
  const hasData = stats.total > 0 && stats.total <= total && payload?.geoV2?.status !== "failed";
  const done = Math.round(100 * resolved / total);
  const mapCount = payload?.sitemapMap?.nodeCount;
  const row = node("div", "read-kpis");
  const wait = L("En attente de la lecture", "Waiting for the page read");
  const missing = payload === undefined ? wait : L("Mesure indisponible", "Measurement unavailable");
  row.append(
    kpi("address", L("Adresse conforme", "URL checks passed"), pct(report.score), L(`${report.passed} sur ${report.total} conformes`, `${report.passed} of ${report.total} passed`), report.score),
    kpi("geo", L("Vérification IA", "AI checks completed"), hasData ? pct(done) : "—", hasData ? L(`${resolved} sur ${total} contrôles traités`, `${resolved} of ${total} checks resolved`) : missing, hasData ? done : null),
    kpi("pending", L("Restant à vérifier", "Still to verify"), hasData ? pct(100 - done) : "—", hasData ? L(`${total - resolved} contrôles IA en attente`, `${total - resolved} AI checks outstanding`) : missing, hasData ? 100 - done : null),
    kpi("map", L("Pages du sitemap", "Sitemap pages"), Number.isInteger(mapCount) ? number.format(mapCount) : "—", Number.isInteger(mapCount) ? L("URL répertoriées dans le sitemap lu", "URLs listed in the sitemap read") : missing)
  );
  return row;
}

export function categoryChart(controls, lang) {
  const fr = lang === "fr";
  const box = card(fr ? "Couverture par famille de contrôles" : "Coverage by check category", "geo",
    fr ? "Part vérifiée dans chaque famille, contrôles non applicables compris." : "Share resolved in each category, including confirmed non-applicable checks.");
  for (const [id, names] of Object.entries(categories)) {
    const s = completionStats(controls.filter(c => c.category === id));
    if (!s.total) continue;
    const resolved = s.observed + s.notApplicable;
    const name = names[fr ? 0 : 1], row = node("div", "read-bar-row");
    row.dataset.family = id;
    row.append(node("span", "", name), progress(100 * resolved / s.total, name), node("b", "", resolved + "/" + s.total));
    box.append(row);
  }
  return box;
}

export function outcomeChart(controls, lang) {
  const fr = lang === "fr";
  const states = [
    ["pass", fr ? "Conformes" : "Passed", "#148467"],
    ["review", fr ? "À améliorer" : "Needs attention", "#c26b24"],
    ["not_applicable", fr ? "Non applicables" : "Not applicable", "#4f82ac"],
    ["unknown", fr ? "À vérifier" : "Still to verify", "#d5dbe5"],
  ];
  if (!controls.length || controls.some(c => !states.some(([key]) => c.outcome === key))) return null;
  const rows = states.map(([key, label, color]) => ({ label, color, count: controls.filter(c => c.outcome === key).length }));
  const chart = node("div", "read-outcomes"), legend = node("ul", "read-legend"), stops = [];
  let offset = 0;
  for (const {label, color, count} of rows) {
    const end = offset + 100 * count / controls.length;
    stops.push(`${color} ${offset}% ${end}%`); offset = end;
    const item = node("li"), dot = node("i");
    dot.style.backgroundColor = color;
    item.append(dot, node("span", "", label), node("b", "", count)); legend.append(item);
  }
  const ring = node("div", "read-ring"), center = node("span", "", controls.length);
  ring.setAttribute("aria-hidden", "true");
  ring.style.backgroundImage = "conic-gradient(" + stops.join(",") + ")";
  ring.append(center); chart.append(ring, legend); return chart;
}

// Separate keys make simultaneous reads independent. Store counts and server timestamps only.
export async function auditSeries(payload) {
  const v2 = payload?.geoV2, report = payload?.report360;
  const time = Date.parse(report?.observedAt || payload?.evidence?.observedAt);
  const controls = v2?.controls;
  if (!Number.isFinite(time) || !v2?.gridVersion || v2.status === "failed" || controls?.length !== 42) return [];
  const stats = completionStats(controls);
  const current = { time, resolved: stats.observed + stats.notApplicable };
  try {
    const url = new URL(payload.finalUrl || report.sourceUrl);
    url.hash = "";
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v2.gridVersion + "|" + url.href));
    const scope = "gtm-read-series:" + Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("") + ":";
    const storage = window.localStorage;
    storage.setItem(scope + time, String(current.resolved));
    const keys = Object.keys(storage).filter(key => key.startsWith("gtm-read-series:")).sort((a,b) => Number(b.split(":").at(-1)) - Number(a.split(":").at(-1)));
    for (const key of keys.slice(200)) storage.removeItem(key);
    const own = keys.slice(0, 200).filter(key => key.startsWith(scope));
    for (const key of own.slice(12)) storage.removeItem(key);
    const points = own.slice(0,12).map(key => ({ time: Number(key.slice(scope.length)), resolved: Number(storage.getItem(key)) }))
      .filter(p => Number.isFinite(p.time) && p.time <= time && Number.isInteger(p.resolved) && p.resolved >= 0 && p.resolved <= 42);
    return points.length ? points.reverse() : [current];
  } catch { return [current]; }
}

export function trendPanel(points, lang) {
  const fr = lang === "fr";
  const box = card(fr ? "Évolution de la couverture IA" : "AI audit coverage trend", "trend",
    fr ? "Audits datés de cette page dans ce navigateur." : "Dated audits of this page in this browser.");
  if (!points.length) {
    box.append(node("p", "read-caption", fr ? "Une observation datée est nécessaire pour suivre l’évolution." : "A dated observation is required to track change."));
    return box;
  }
  const first = points[0], last = points.at(-1);
  const share = p => Math.round(p.resolved / 42 * 100);
  const delta = share(last) - share(first);
  const date = t => new Date(t).toLocaleString(lang, { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  const summary = node("div", "read-trend-summary");
  summary.append(node("strong", "read-value", share(last) + (fr ? " %" : "%")), node("span", "read-chip", points.length === 1 ? (fr ? "Première mesure" : "First observation") : (delta > 0 ? "+" : "") + delta + " pts"));
  box.append(summary);
  if (points.length === 1) {
    box.append(progress(share(last), fr ? "Couverture mesurée" : "Measured coverage"), node("small", "", date(last.time)), node("p", "read-caption", fr ? "La prochaine analyse distincte permettra de comparer les deux mesures." : "The next distinct audit will show how coverage changed."));
    return box;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 310 90"); svg.setAttribute("class", "read-trend-line");
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", points.map(p => date(p.time) + " · " + share(p) + "%").join(", "));
  const coords = points.map(p => [5 + (p.time-first.time)/(last.time-first.time)*300, 82 - p.resolved/42*72].join(",")).join(" ");
  const area = document.createElementNS(svg.namespaceURI, "polygon");
  area.setAttribute("points", "5,86 " + coords + " 305,86"); area.setAttribute("fill", "#d9edff");
  const line = document.createElementNS(svg.namespaceURI, "polyline");
  line.setAttribute("points", coords); line.setAttribute("fill", "none"); line.setAttribute("stroke", "#1672b9"); line.setAttribute("stroke-width", "3");
  svg.append(area, line);
  const range = node("div", "read-axis"); range.append(node("small", "", date(first.time)), node("small", "", date(last.time)));
  box.append(svg, range); return box;
}

export function sitemapActivity(map, observedAt, lang) {
  const time = Date.parse(observedAt);
  if (!Number.isFinite(time) || !map?.nodes?.length) return null;
  const fr = lang === "fr", end = new Date(time);
  const key = d => d.getUTCFullYear()*12 + d.getUTCMonth();
  const last = key(end), months = Array(6).fill(0);
  let dated = 0;
  for (const n of map.nodes) {
    const stamp = Date.parse(n.lastmod);
    if (!Number.isFinite(stamp) || stamp > time) continue;
    dated++;
    const idx = key(new Date(stamp)) - last + 5;
    if (idx >= 0 && idx < 6) months[idx]++;
  }
  if (!dated) return null;
  const box = card(fr ? "Dernières modifications déclarées" : "Reported last modifications", "map",
    fr ? `Dates lastmod disponibles pour ${dated}/${map.nodes.length} URL de la carte. Chaque URL compte dans le mois de sa dernière modification déclarée.` :
      `Sitemap lastmod dates available for ${dated}/${map.nodes.length} mapped URLs. Each URL counts in the month of its reported last change.`);
  const bars = node("div", "read-months"), max = Math.max(1, ...months);
  months.forEach((count,i) => {
    const month = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth()-5+i, 1));
    const name = month.toLocaleDateString(lang, { month: "short", year:"2-digit", timeZone:"UTC" });
    const bar = node("div", "read-month");
    const plot = node("span", "read-month-plot"); const fill = node("i");
    fill.style.height = (100 * count/max) + "%"; plot.append(fill);
    bar.append(node("b", "", count), plot, node("small", "", name)); bars.append(bar);
  });
  box.append(bars); return box;
}
