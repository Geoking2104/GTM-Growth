/* Shared visual vocabulary: real images, honest gauges and comparable trends. */
import { LANG } from "./i18n.js";
import { icon } from "./icons.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = String(text); return el; };
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); return el; };
const entities = new Map();
let selectedOrigin = "";
export function safeImageUrl(value) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && u.hostname.includes(".") && !/^[\d.]+$/.test(u.hostname) && !/(?:^|\.)(?:localhost|local|internal|test)$/.test(u.hostname) && !u.hostname.includes(":") ? u.href : null; } catch { return null; }
}
export function thumbnail({ name = "", imageUrl, kind = "page" } = {}, size = "") {
  const box = node("span", `v-thumb ${size ? `v-thumb-${size}` : ""}`);
  const fallback = node("span", "v-thumb-fallback"); fallback.innerHTML = icon(kind === "product" ? "products" : kind === "brand" ? "brand" : "page");
  fallback.setAttribute("aria-hidden", "true"); box.append(fallback);
  const src = safeImageUrl(imageUrl);
  box.title = src ? name : L("Image non fournie", "Image not supplied");
  if (src) {
    const image = node("img"); image.alt = name; image.loading = "lazy"; image.decoding = "async"; image.referrerPolicy = "no-referrer"; image.width = 56; image.height = 56;
    image.onerror = () => { image.remove(); box.title = L("Image indisponible : vérifiez son URL et les droits d’accès.", "Image unavailable: check its URL and access permissions."); };
    image.src = src; box.append(image);
  }
  return box;
}
const keyFor = (value) => { try { const u = new URL(value, selectedOrigin || undefined); u.hash = ""; return u.href; } catch { return String(value || "").toLocaleLowerCase(); } };
export function clearVisualEntities(origin = "") { entities.clear(); selectedOrigin = origin; }
export function setVisualEntities(items = [], origin = selectedOrigin) {
  selectedOrigin = origin;
  for (const item of items) { if (item.url) entities.set(keyFor(item.url), item); if (item.name) entities.set(String(item.name).toLocaleLowerCase(), item); }
  document.querySelectorAll(".v-entity[data-visual-key]").forEach(el => {
    const match = entities.get(el.dataset.visualKey); if (match) el.querySelector(".v-thumb")?.replaceWith(thumbnail(match));
  });
}
export function entityCell(value, data = {}) {
  const key = keyFor(data.url || value), known = data.kind === "brand" ? undefined : entities.get(key) || entities.get(String(value).toLocaleLowerCase());
  const item = { name: String(value ?? "—"), kind: "page", ...known, ...data };
  const row = node("span", "v-entity"); if (data.kind !== "brand" && !data.imageUrl) row.dataset.visualKey = key;
  row.append(thumbnail(item), node("span", "v-entity-label", value ?? "—")); return row;
}
export function metricIcon(name = "overview") { const chip = node("span", "v-metric-icon"); chip.innerHTML = icon(name); return chip; }
export function gauge(label, value, note = "") {
  const card = node("section", "v-gauge"); card.append(node("h3", "", label));
  const known = value !== null && value !== undefined && Number.isFinite(value), pct = known ? Math.max(0, Math.min(100, value)) : 0;
  const chart = svg("svg", { viewBox: "0 0 200 112", role: "img", "aria-label": `${label}: ${known ? `${Math.round(pct)} %` : L("non mesuré", "not measured")}` });
  chart.append(svg("path", { d: "M 20 98 A 80 80 0 0 1 180 98", fill: "none", stroke: "#e9ebf0", "stroke-width": 15, "stroke-linecap": "round" }));
  if (known && pct > 0) chart.append(svg("path", { d: "M 20 98 A 80 80 0 0 1 180 98", fill: "none", stroke: pct >= 80 ? "#16866b" : pct >= 50 ? "#d68b20" : "#db6068", "stroke-width": 15, "stroke-linecap": "round", pathLength: 100, "stroke-dasharray": `${pct} 100` }));
  const text = svg("text", { x: 100, y: 88, "text-anchor": "middle", class: "v-gauge-value" }); text.textContent = known ? `${Math.round(pct)} %` : "—"; chart.append(text);
  card.append(chart, node("p", "c-note", note)); return card;
}
export function sectionHeading(title, description, name = "overview") {
  const header = node("header", "v-section-heading"), copy = node("div"); copy.append(node("h1", "", title), node("p", "c-note", description)); header.append(metricIcon(name), copy); return header;
}
export function sourceBadge(label) { return node("span", "v-source", label); }

/** Every line uses the same 0–100 scale. Missing source/day pairs are gaps, never zero. */
export function visibilityChart(responses, series, title) {
  const figure = node("figure", "v-trend"), head = node("figcaption", "", title); figure.append(head);
  const dates = [...new Set(responses.map(r => r.observedAt.slice(0, 10)))].sort();
  if (!dates.length) { figure.append(node("p", "c-note", L("Importez des réponses datées pour afficher cette comparaison.", "Import dated answers to show this comparison."))); return figure; }
  const colors = ["#6754c8", "#e58b3a", "#249cb2", "#32976b", "#ce679d", "#526fbc", "#ae952d", "#845a3b", "#69777d", "#a35f68"];
  const legend = node("div", "v-legend"), chart = svg("svg", { viewBox: "0 0 620 240", role: "img", "aria-label": `${title} · 0–100 %` });
  for (const value of [0, 25, 50, 75, 100]) { const y = 205 - value * 1.75; chart.append(svg("line", { x1: 40, y1: y, x2: 605, y2: y, stroke: "#e9ebf0", "stroke-dasharray": "3 4" })); const label = svg("text", { x: 32, y: y + 4, "text-anchor": "end", class: "v-axis" }); label.textContent = `${value}%`; chart.append(label); }
  const start = Date.parse(dates[0]), span = Date.parse(dates.at(-1)) - start;
  const x = date => span ? 42 + 560 * (Date.parse(date) - start) / span : 322;
  const data = [];
  series.slice(0, 10).forEach((serie, index) => {
    const color = colors[index % colors.length], item = node("span", "v-legend-item"), swatch = node("i"); swatch.style.backgroundColor = color; item.append(swatch, serie.label); legend.append(item);
    let segment = [];
    const flush = () => { if (segment.length > 1) chart.append(svg("polyline", { points: segment.join(" "), fill: "none", stroke: color, "stroke-width": 2.3, "stroke-linejoin": "round" })); segment = []; };
    for (const date of dates) {
      const sample = responses.filter(r => r.observedAt.startsWith(date) && (!serie.filter || serie.filter(r)));
      const value = sample.length ? sample.filter(serie.matches).length / sample.length * 100 : null;
      data.push({ date, label: serie.label, value, count: sample.length });
      if (value === null) { flush(); continue; }
      const y = 205 - value * 1.75; segment.push(`${x(date)},${y}`);
      const dot = svg("circle", { cx: x(date), cy: y, r: 3, fill: color }); const tip = svg("title", {}); tip.textContent = `${date} · ${serie.label}: ${value.toFixed(1)}% (${sample.length})`; dot.append(tip); chart.append(dot);
    }
    flush();
  });
  for (const date of [...new Set([dates[0], dates[Math.floor((dates.length - 1) / 2)], dates.at(-1)])]) { const label = svg("text", { x: x(date), y: 232, "text-anchor": date === dates[0] && span ? "start" : date === dates.at(-1) && span ? "end" : "middle", class: "v-axis" }); label.textContent = date; chart.append(label); }
  const details = node("details", "v-chart-data"); details.append(node("summary", "", L("Données du graphique", "Chart data")));
  const table = node("table", "app-table"), row = node("tr"); for (const title of ["Date", L("Série", "Series"), L("Visibilité", "Visibility"), L("Réponses", "Answers")]) row.append(node("th", "", title)); table.append(row);
  for (const entry of data) { const tr = node("tr"); for (const value of [entry.date, entry.label, entry.value === null ? "—" : `${entry.value.toFixed(1)} %`, entry.count]) tr.append(node("td", "", value)); table.append(tr); } details.append(table);
  figure.append(legend, chart, node("p", "c-note", L("Réponses importées · échelle commune · échantillons variables, évolution descriptive.", "Imported answers · shared scale · varying samples, descriptive trend.")), details); return figure;
}

export function visualBrief(profile, url) {
  const box = node("div", "v-context"), name = profile?.name || (() => { try { return new URL(url).hostname; } catch { return url; } })();
  box.append(thumbnail({ name, imageUrl: profile?.logoUrl || profile?.imageUrl, kind: "brand" }), node("strong", "", name));
  const link = node("a", "v-context-link", L("Images, produits et pages", "Images, products and pages")); link.href = "#catalog"; box.append(link); return box;
}
