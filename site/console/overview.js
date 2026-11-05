/* Vue d'ensemble et IndexNow : mêmes blocs que la démo publique (kpi-row, app-chart,
 * app-rank, app-strip), alimentés par POST /api/console/overview. */
import { el } from "./render.js";
import { t, CATEGORY, LANG } from "./i18n.js";
import { makeKey, keyFile, normalizeHost } from "../indexnow.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const fmtDelta = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const width = (node, pct) => { node.style.width = `${Math.max(0, Math.min(100, pct))}%`; return node; }; // CSSOM, compatible CSP

function kpi(label, value, max, delta, note, color, help) {
  const c = el("div", "kpi-cell");
  const v = el("div", "kpi-value"); v.append(el("strong", "", String(value ?? "—")), el("em", "", `/${max}`));
  const f = el("div", "kpi-foot"); f.append(el("span", `delta ${delta >= 0 ? "up" : "down"}`, fmtDelta(delta)), el("span", "kpi-note", note));
  c.append(el("span", "kpi-label", label), v, f); if (help) c.append(el("p", "kpi-help", help)); return c;
}

function trajectory(score, projected, recs) {
  const fig = el("figure", "app-chart");
  const steps = recs.filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
  const cap = el("figcaption", "", t("trajectory")); cap.append(el("span", "", `${score} → ${projected} · ${t("perFix")}`)); fig.append(cap);
  const lo = Math.max(0, Math.min(Math.floor(score / 10) * 10, 70)); const hi = 100;
  const y = (v) => 216 - ((v - lo) / (hi - lo)) * 180;
  const s = svg("svg", { viewBox: "0 0 620 240", role: "img", "aria-label": `${score} → ${projected}` });
  const grid = svg("g", { stroke: "#eceef3", "stroke-width": "1" }); const labels = svg("g", { fill: "#9aa3b2", "font-size": "10", "font-family": "var(--font)" });
  for (let i = 0; i < 4; i += 1) { const v = hi - ((hi - lo) / 3) * i; grid.append(svg("line", { x1: 8, y1: y(v), x2: 612, y2: y(v) })); const tx = svg("text", { x: 0, y: y(v) + 3 }); tx.textContent = String(Math.round(v)); labels.append(tx); }
  s.append(grid, labels);
  let acc = score; const values = [score, ...steps.map((r) => (acc = Math.min(projected, acc + r.points)))];
  const x = (i) => 8 + (604 * i) / Math.max(1, values.length - 1);
  s.append(svg("polyline", { points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "), fill: "none", stroke: "#4f5bd5", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" }));
  s.append(svg("circle", { cx: 8, cy: y(score), r: "3.5", fill: "#fff", stroke: "#4f5bd5", "stroke-width": "2" }), svg("circle", { cx: x(values.length - 1), cy: y(values.at(-1)), r: "3.5", fill: "#fff", stroke: "#4f5bd5", "stroke-width": "2" }));
  fig.append(s);
  const axis = el("div", "app-axis"); axis.append(el("span", "", t("now")), el("span", "", `+${Math.ceil(steps.length / 2)} ${t("fixes")}`), el("span", "", `+${steps.length} ${t("fixes")}`)); fig.append(axis);
  return fig;
}

function rank(platforms) {
  const a = el("aside", "app-rank"); const sorted = [...platforms].sort((p, q) => q.score - p.score);
  const head = el("div", "app-rank-head", t("engines")); head.append(el("span", "", t("outOf"))); a.append(head);
  if (sorted.length) { const lead = el("p", "app-rank-lead", `${t("best")} : `); lead.append(el("strong", "", `${sorted[0].label} ${sorted[0].score}`), ` · ${t("weakest")} : `, el("strong", "", `${sorted.at(-1).label} ${sorted.at(-1).score}`)); a.append(lead); }
  const ul = el("ul", "rank-list");
  for (const p of sorted) { const li = el("li"); li.title = p.mainGap ?? ""; li.append(el("span", "rank-dot"), el("span", "rank-name", p.label), el("span", "rank-score", String(p.score)), el("span", `rank-delta ${p.score >= 100 ? "up" : "down"}`, fmtDelta(p.score - 100))); ul.append(li); }
  a.append(ul, el("p", "rank-foot", t("gapFoot"))); return a;
}

function strip(breakdown, max) {
  const box = el("div", "app-strip"); box.append(el("h3", "", t("where")));
  const ul = el("ul", "strip-list");
  for (const [k, v] of Object.entries(breakdown ?? {})) { const m = max?.[k] ?? 0; const li = el("li"); const bar = el("span", "strip-bar"); bar.append(width(el("i"), m ? (v / m) * 100 : 0)); li.append(el("span", "strip-name", CATEGORY[k] ?? k), bar, el("span", "strip-value", `${v}/${m}`)); ul.append(li); }
  box.append(ul); return box;
}

export function renderOverview(d) {
  const ready = d.platforms.filter((p) => p.score >= 80);
  const idxFails = (d.indexnow?.checks ?? []).filter((c) => c.status !== "pass").length;
  const row = el("div", "kpi-row");
  row.append(
    kpi(t("kGeo"), d.geo.score, 100, d.geo.projectedScore - d.geo.score, t("projected"), "#4f5bd5", t("hGeo")),
    kpi(t("kCit"), d.citability?.score ?? "—", 100, d.citability ? 100 - d.citability.score : 0, t("toMax"), "#8b7bd8", t("hCit")),
    kpi(t("kIdx"), d.indexnow?.score ?? "—", 100, d.indexnow ? 100 - d.indexnow.score : 0, `${idxFails} ${t("toFix")}`, "#e0b23c", t("hIdx")),
    kpi(t("kEng"), ready.length, d.platforms.length, d.platforms.length - ready.length, ready.map((p) => p.label).join(", ") || "—", "#2f9e6f", t("hEng")),
  );
  const split = el("div", "app-split"); split.append(trajectory(d.geo.score, d.geo.projectedScore, d.geo.recommendations ?? []), rank(d.platforms));
  return [el("p", "c-note c-pad", t("hBoard")), row, split, strip(d.geo.breakdown, d.geo.max)];
}

function tableOf(caption, head, rows) {
  const tb = el("table", "app-table"); tb.append(el("caption", "", caption));
  const th = el("thead"); const tr = el("tr"); for (const h of head) { const c = el("th", "", h); c.scope = "col"; tr.append(c); } th.append(tr); tb.append(th);
  const body = el("tbody"); for (const r of rows) { const tr2 = el("tr"); r.forEach((cell, i) => { const c = el(i === 0 ? "th" : "td"); if (i === 0) c.scope = "row"; c.append(cell instanceof Node ? cell : document.createTextNode(String(cell ?? "—"))); tr2.append(c); }); body.append(tr2); } tb.append(body);
  return tb;
}
const pill = (status) => el("span", `pill ${status === "pass" ? "ok" : status === "warn" ? "warn" : "bad"}`, status);

export function renderPlan(d) {
  const recs = [...(d.geo.recommendations ?? [])].sort((a, b) => b.points - a.points);
  return [tableOf(`${d.geo.score} → ${d.geo.projectedScore}`, [t("rank"), t("action"), t("impact"), t("area")], recs.map((r, i) => [String(i + 1), r.action, `+${r.points}`, CATEGORY[r.category] ?? r.category ?? ""]))];
}


/** Local IndexNow key generator — browser only, no network. Lives in the console. */
export function renderIndexNowKeygen() {
  const card = el("section", "c-card c-keygen");
  card.append(el("h3", "", t("idxKeyTitle")));
  card.append(el("p", "c-note", t("idxKeyHelp")));

  const form = el("div", "ink-mini");
  const label = el("label", "sr-only");
  label.htmlFor = "ink-host";
  label.textContent = t("idxKeyHost");
  const hostInput = el("input");
  hostInput.id = "ink-host";
  hostInput.name = "ink-host";
  hostInput.type = "text";
  hostInput.placeholder = t("idxKeyPlaceholder");
  hostInput.inputMode = "url";
  hostInput.autocomplete = "url";
  const genBtn = el("button", "btn btn-small", t("idxKeyGenerate"));
  genBtn.type = "button";
  genBtn.id = "ink-generate";
  form.append(label, hostInput, genBtn);

  const out = el("p", "ink-mini-out");
  out.id = "ink-out";
  out.hidden = true;
  const keyEl = el("code");
  keyEl.id = "ink-key";
  const fileEl = el("span");
  fileEl.id = "ink-file";
  out.append(keyEl, fileEl);

  const row = el("div", "ink-mini-row");
  const dlBtn = el("button", "btn btn-ghost btn-small", t("idxKeyDownload"));
  dlBtn.type = "button";
  dlBtn.id = "ink-download";
  dlBtn.hidden = true;
  row.append(dlBtn);

  card.append(form, out, row);

  let current = null;
  const render = () => {
    if (!current) return;
    const host = normalizeHost(hostInput.value);
    const material = keyFile(current, host);
    keyEl.textContent = current;
    fileEl.textContent = host ? `→ ${material.url}` : `→ ${material.name}`;
    out.hidden = false;
    dlBtn.hidden = false;
  };
  genBtn.addEventListener("click", () => {
    current = makeKey();
    render();
  });
  hostInput.addEventListener("input", () => { if (current) render(); });
  dlBtn.addEventListener("click", () => {
    if (!current) return;
    const host = normalizeHost(hostInput.value);
    const material = keyFile(current, host);
    const blob = new Blob([material.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = material.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return [card];
}

export function renderIndexNow(d) {
  const parts = renderIndexNowKeygen();
  const ix = d?.indexnow;
  if (!ix) return [...parts, el("p", "c-note", t("idxNoAudit"))];
  const row = el("div", "kpi-row"); const fails = ix.checks.filter((c) => c.status !== "pass").length;
  row.append(kpi(t("kIdx"), ix.score, 100, 100 - ix.score, `${fails} ${t("toFix")}`, "#e0b23c"));
  return [...parts, row, el("p", "c-intro", t("idxIntro")), tableOf("IndexNow", [t("check"), t("points"), t("status"), t("evidence"), t("fix")], ix.checks.map((c) => [c.label ?? c.id, `${c.points ?? 0}/${c.max ?? "—"}`, pill(c.status), c.evidence ?? c.detail ?? "", c.fix ?? ""]))];
}
export const lang = LANG;
