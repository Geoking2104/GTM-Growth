/* Rendu générique des résultats : métriques, tableaux, blocs de code. */
import { tr, LANG } from "./i18n.js";
import { entityCell, metricIcon } from "./visuals.js";
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = tag === "h4" || tag === "p" ? tr(text) : text; return n; };
export { el };

export function metrics(pairs) {
  const box = el("div", "c-metrics");
  for (const [label, value] of pairs) { const m = el("div", "c-metric"); m.append(metricIcon(), el("span", "", tr(label)), el("strong", "", value === null || value === undefined ? "—" : String(value))); box.append(m); }
  return box;
}

export function table(rows, columns) {
  if (!rows?.length) return el("p", "c-note", tr("Aucune donnée."));
  const cols = columns ?? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== "object");
  const t = el("table", "c-table app-table"); const head = el("tr");
  for (const c of cols) head.append(el("th", "", tr(Array.isArray(c) ? c[1] : c)));
  t.append(head);
  for (const row of rows) {
    const tr = el("tr");
    for (const c of cols) {
      const key = Array.isArray(c) ? c[0] : c, v = typeof key === "function" ? key(row) : row[key], cell = el("td");
      const visual = typeof v === "string" && v.trim() && (typeof key === "string" && /^(page|url|siteUrl|itemName|product|brand)$/.test(key) || /^https:\/\//.test(v));
      if (v instanceof Node) cell.append(v);
      else if (visual) cell.append(entityCell(v, { ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}), kind: key === "itemName" || key === "product" ? "product" : key === "brand" ? "brand" : "page" }));
      else cell.textContent = v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString(LANG) : v.toLocaleString(LANG, { maximumFractionDigits: 2 })) : String(v);
      tr.append(cell);
    }
    t.append(tr);
  }
  const wrap = el("div", "c-table-wrap"); wrap.append(t); return wrap;
}

export function code(text, filename) {
  const wrap = el("div", "c-code");
  const bar = el("div", "c-code-bar"); bar.append(el("span", "", filename ?? ""));
  const copy = el("button", "c-btn c-btn-ghost", tr("Copier")); copy.type = "button";
  copy.onclick = () => navigator.clipboard?.writeText(text);
  bar.append(copy);
  if (filename) { const dl = el("a", "c-btn c-btn-ghost", tr("Télécharger")); dl.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); dl.download = filename; bar.append(dl); }
  const pre = el("pre"); pre.textContent = text; wrap.append(bar, pre); return wrap;
}

export function raw(data) {
  const d = el("details", "c-raw"); d.append(el("summary", "", tr("Données brutes (JSON)")));
  const pre = el("pre"); pre.textContent = JSON.stringify(data, null, 2); d.append(pre); return d;
}

export function list(items, cls = "c-list") { const ul = el("ul", cls); for (const i of items ?? []) ul.append(el("li", "", typeof i === "string" ? i : JSON.stringify(i))); return ul; }
export const kb = (b) => (b === null || b === undefined ? "—" : b > 1048576 ? `${(b / 1048576).toFixed(2)} Mo` : `${Math.round(b / 1024)} Ko`);
