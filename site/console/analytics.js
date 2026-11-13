/* Track : Search Console, GA4 et Bing en direct + statut des accès et paramètres.
 * Même vocabulaire visuel que la vue d'ensemble (kpi-row, app-chart, app-table). */
import { el, table } from "./render.js";
import { renderDataGuide } from "./data-guidance.js";
import { LANG } from "./i18n.js";
import { metricIcon } from "./visuals.js";

export const L = (fr, en) => (LANG === "en" ? en : fr);
const loc = LANG === "en" ? "en-GB" : "fr-FR";
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const int = (v) => (typeof v === "number" ? Math.round(v).toLocaleString(loc) : "—");
const pct = (v) => (typeof v === "number" ? `${(v * 100).toLocaleString(loc, { maximumFractionDigits: 1 })} %` : "—");
const dec = (v, d = 1) => (typeof v === "number" ? v.toLocaleString(loc, { maximumFractionDigits: d }) : "—");
const dur = (s) => (typeof s === "number" ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s` : "—");
const region = (() => { try { return new Intl.DisplayNames([LANG], { type: "region" }); } catch { return null; } })();
const ISO3 = { fra: "FR", bel: "BE", che: "CH", can: "CA", usa: "US", gbr: "GB", deu: "DE", esp: "ES", ita: "IT", nld: "NL", lux: "LU", mar: "MA", dza: "DZ", tun: "TN", sen: "SN", civ: "CI", prt: "PT", irl: "IE", ind: "IN", bra: "BR", jpn: "JP", chn: "CN", aus: "AU", pol: "PL", rou: "RO", aut: "AT", swe: "SE", nor: "NO", dnk: "DK", fin: "FI", rus: "RU", ukr: "UA", tur: "TR", mex: "MX", arg: "AR", reu: "RE", glp: "GP", mtq: "MQ", guf: "GF", nzl: "NZ", sgp: "SG", hkg: "HK", kor: "KR", isr: "IL", are: "AE", sau: "SA", egy: "EG", zaf: "ZA", cmr: "CM", mdg: "MG", grc: "GR", cze: "CZ", hun: "HU" };
const country = (c) => { const two = ISO3[String(c).toLowerCase()]; return two && region ? `${region.of(two)} (${c.toUpperCase()})` : String(c).toUpperCase(); };
const DEVICE = { DESKTOP: L("Ordinateur", "Desktop"), MOBILE: "Mobile", TABLET: L("Tablette", "Tablet"), desktop: L("Ordinateur", "Desktop"), mobile: "Mobile", tablet: L("Tablette", "Tablet") };

export const PERIODS = [[7, L("7 jours", "7 days")], [28, L("28 jours", "28 days")], [90, L("3 mois", "3 months")], [180, L("6 mois", "6 months")], [365, L("12 mois", "12 months")], [480, L("16 mois", "16 months")]];

/** Barre d'outils : période (+ type de recherche pour GSC). */
export function toolbar(state, rerender, { searchType = false } = {}) {
  const bar = el("form", "c-toolbar");
  const sel = (name, opts, value, label) => { const f = el("label", "c-field"); f.append(el("span", "", label)); const s = el("select"); s.name = name; for (const [v, txt] of opts) { const o = el("option", "", txt); o.value = String(v); s.append(o); } s.value = String(value); s.onchange = () => { state[name] = name === "days" ? Number(s.value) : s.value; localStorage.setItem(`gtm-console-${name}`, s.value); rerender(); }; f.append(s); return f; };
  bar.append(sel("days", PERIODS, state.days, L("Période", "Period")));
  if (searchType) bar.append(sel("searchType", [["web", "Web"], ["image", "Images"], ["video", L("Vidéos", "Videos")], ["news", L("Actualités", "News")], ["discover", "Discover"], ["googleNews", "Google News"]], state.searchType, L("Type de recherche", "Search type")));
  bar.onsubmit = (e) => e.preventDefault();
  return bar;
}

function kpi(label, value, deltaPct, { invert = false, note } = {}) {
  const c = el("div", "kpi-cell");
  c.append(metricIcon(/position/i.test(label) ? "geo" : /reven|revenue/i.test(label) ? "products" : "overview"));
  const v = el("div", "kpi-value"); v.append(el("strong", "", value)); c.append(el("span", "kpi-label", label), v);
  const f = el("div", "kpi-foot");
  if (deltaPct === null || deltaPct === undefined) f.append(el("span", "kpi-note", note ?? L("pas de période précédente", "no previous period")));
  else { const good = invert ? deltaPct <= 0 : deltaPct >= 0; f.append(el("span", `delta ${good ? "up" : "down"}`, `${deltaPct > 0 ? "+" : ""}${dec(deltaPct)} %`), el("span", "kpi-note", note ?? L("vs période préc.", "vs prev. period"))); }
  c.append(f); return c;
}
const kpiRow = (cells) => { const r = el("div", "kpi-row"); r.append(...cells); return r; };

/** Courbes multi-séries, chacune sur sa propre échelle (comme Search Console). */
export function lineChart(rows, series, title) {
  const fig = el("figure", "app-chart");
  const cap = el("figcaption", "", title); const legend = el("span", "c-legend");
  for (const s of series) { const k = el("span", "c-legend-item"); const dot = el("i", "c-dot"); dot.style.background = s.color; k.append(dot, s.label); legend.append(k); }
  cap.append(legend); fig.append(cap);
  if (!rows?.length) { fig.append(el("p", "c-note", L("Aucune donnée sur la période.", "No data for the period."))); return fig; }
  const W = 620, H = 220, x = (i) => 30 + (580 * i) / Math.max(1, rows.length - 1);
  const s = svg("svg", { viewBox: `0 0 ${W} ${H + 20}`, role: "img", "aria-label": title });
  const grid = svg("g", { stroke: "#eceef3", "stroke-width": "1" });
  for (let i = 0; i < 4; i += 1) grid.append(svg("line", { x1: 30, y1: 10 + (i * (H - 20)) / 3, x2: 610, y2: 10 + (i * (H - 20)) / 3 }));
  s.append(grid);
  for (const ser of series) {
    const vals = rows.map((r) => Number(r[ser.key] ?? 0)); const max = Math.max(...vals); const min = ser.invert ? Math.min(...vals) : 0; const span = Math.max(1e-9, max - min);
    const y = (v) => (ser.invert ? 10 + ((v - min) / span) * (H - 20) : H - 10 - ((v - min) / span) * (H - 20));
    s.append(svg("polyline", { points: vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "), fill: "none", stroke: ser.color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }
  const labels = svg("g", { fill: "#9aa3b2", "font-size": "10" });
  const ticks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  for (const i of [...new Set(ticks)]) { const tx = svg("text", { x: x(i), y: H + 12, "text-anchor": i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle" }); tx.textContent = rows[i].date; labels.append(tx); }
  s.append(labels); fig.append(s); return fig;
}

/** Barres horizontales simples (canaux, appareils). */
function bars(rows, labelKey, valueKey, fmt = int) {
  const total = rows.reduce((a, r) => a + Number(r[valueKey] ?? 0), 0) || 1;
  const box = el("div", "c-bars");
  for (const r of rows.slice(0, 10)) { const line = el("div", "c-bar"); const fill = el("span", "c-bar-fill"); fill.style.width = `${(Number(r[valueKey] ?? 0) / total) * 100}%`; line.append(el("span", "c-bar-label", String(r[labelKey])), el("span", "c-bar-track"), el("span", "c-bar-value", `${fmt(r[valueKey])} · ${pct(Number(r[valueKey] ?? 0) / total)}`)); line.children[1].append(fill); box.append(line); }
  return box;
}

/** Sélecteur segmenté de ventilations : un seul tableau visible, tout reste accessible. */
function segments(defs) {
  const wrap = el("div", "c-seg-wrap"); const seg = el("div", "c-seg"); seg.setAttribute("role", "tablist"); const out = el("div", "c-seg-out");
  defs.forEach((d, i) => {
    const b = el("button", `c-seg-btn${i === 0 ? " is-active" : ""}`, `${d.label}${d.count !== undefined ? ` (${d.count})` : ""}`); b.type = "button"; b.setAttribute("role", "tab");
    b.onclick = () => { seg.querySelectorAll("button").forEach((x) => x.classList.remove("is-active")); b.classList.add("is-active"); out.replaceChildren(...[d.render()].flat()); };
    seg.append(b);
  });
  out.append(...[defs[0].render()].flat()); wrap.append(seg, out); return wrap;
}

/** Filtre texte + export CSV pour un tableau de lignes. */
function filterable(rows, columns, filename) {
  const box = el("div", "c-filterable");
  const bar = el("div", "c-table-bar"); const input = el("input", "c-filter"); input.type = "search"; input.placeholder = L("Filtrer…", "Filter…");
  const csv = el("button", "c-btn c-btn-ghost", "CSV"); csv.type = "button";
  csv.onclick = () => { const head = columns.map((c) => c[1]); const lines = [head, ...rows.map((r) => columns.map((c) => { const v = typeof c[0] === "function" ? c[0](r) : r[c[0]]; return `"${String(v ?? "").replace(/"/g, '""')}"`; }))]; const a = el("a"); a.href = URL.createObjectURL(new Blob([lines.map((l) => l.join(";")).join("\n")], { type: "text/csv" })); a.download = filename; a.click(); };
  const holder = el("div"); const draw = () => { const q = input.value.trim().toLowerCase(); holder.replaceChildren(table(q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows, columns)); };
  input.oninput = draw; bar.append(input, el("span", "c-note", `${rows.length} ${L("lignes", "rows")}`), csv); box.append(bar, holder); draw(); return box;
}

/** Problème d'accès : quoi faire, et quel e-mail autoriser. */
export function problemBox(p) {
  const source = /GA4|Analytics/i.test(p.message) ? "ga4" : /Bing/i.test(p.message) ? "bing" : /GTM|Tag Manager|conteneur/i.test(p.message) ? "gtm" : "gsc";
  const box = renderDataGuide(source, { error: p.message });
  if (p.grantEmail) { const e = el("p", ""); e.append(L("E-mail à autoriser : ", "Email to grant: ")); const c = el("code", "", p.grantEmail); const copy = el("button", "c-btn c-btn-ghost", L("Copier", "Copy")); copy.type = "button"; copy.onclick = () => navigator.clipboard?.writeText(p.grantEmail); e.append(c, " ", copy); box.append(e); }
  if (p.steps?.length) { const detail = el("details"); detail.append(el("summary", "", L("Instructions renvoyées par la source", "Instructions returned by the source"))); const ol = el("ol", "c-list"); for (const s of p.steps) ol.append(el("li", "", s)); detail.append(ol); box.append(detail); }
  return box;
}

const gscCols = (key, label, fmt = (v) => v) => [[(r) => fmt(r[key]), label], ["clicks", L("Clics", "Clicks")], ["impressions", "Impressions"], [(r) => pct(r.ctr), "CTR"], [(r) => dec(r.position), "Position"]];
const periodNote = (p) => el("p", "c-note c-pad", `${L("Du", "From")} ${p.start} ${L("au", "to")} ${p.end} · ${L("comparé au", "compared with")} ${p.prevStart} → ${p.prevEnd}`);

export function renderSearchPerformance(d) {
  if (d.problem) return [problemBox(d.problem)];
  const t = d.totals;
  return [
    periodNote(d.period),
    kpiRow([kpi(L("Clics", "Clicks"), int(t.clicks), d.deltas.clicks), kpi("Impressions", int(t.impressions), d.deltas.impressions), kpi(L("CTR moyen", "Avg CTR"), pct(t.ctr), d.deltas.ctr), kpi(L("Position moyenne", "Avg position"), dec(t.position), d.deltas.position, { invert: true })]),
    lineChart(d.trend, [{ key: "clicks", label: L("Clics", "Clicks"), color: "#4f5bd5" }, { key: "impressions", label: "Impressions", color: "#7c3aed" }, { key: "ctr", label: "CTR", color: "#0f9d58" }, { key: "position", label: "Position", color: "#e37400", invert: true }], L("Performance quotidienne (Google Search)", "Daily performance (Google Search)")),
    segments([
      { label: L("Requêtes", "Queries"), count: d.queries.length, render: () => filterable(d.queries, gscCols("query", L("Requête", "Query")), "gsc-requetes.csv") },
      { label: "Pages", count: d.pages.length, render: () => filterable(d.pages, gscCols("page", "Page"), "gsc-pages.csv") },
      { label: L("Appareils", "Devices"), count: d.devices.length, render: () => [bars(d.devices.map((r) => ({ ...r, device: DEVICE[r.device] ?? r.device })), "device", "clicks"), filterable(d.devices, gscCols("device", L("Appareil", "Device"), (v) => DEVICE[v] ?? v), "gsc-appareils.csv")] },
      { label: L("Pays", "Countries"), count: d.countries.length, render: () => filterable(d.countries, gscCols("country", L("Pays", "Country"), country), "gsc-pays.csv") },
      { label: L("Apparence", "Search appearance"), count: d.searchAppearance.length, render: () => filterable(d.searchAppearance, gscCols("appearance", L("Apparence", "Appearance")), "gsc-apparence.csv") },
      { label: L("Jours", "Dates"), count: d.trend.length, render: () => filterable([...d.trend].reverse(), gscCols("date", "Date"), "gsc-jours.csv") },
    ]),
  ];
}

export function renderQueryPages(d) {
  if (d.problem) return [problemBox(d.problem)];
  const multi = new Map(); for (const r of d.rows) multi.set(r.query, (multi.get(r.query) ?? 0) + 1);
  const cannibal = d.rows.filter((r) => multi.get(r.query) > 1);
  return [periodNote(d.period), segments([
    { label: L("Requête → page", "Query → page"), count: d.rows.length, render: () => filterable(d.rows, [["query", L("Requête", "Query")], ["page", "Page"], ["clicks", L("Clics", "Clicks")], ["impressions", "Impressions"], [(r) => pct(r.ctr), "CTR"], [(r) => dec(r.position), "Position"]], "gsc-requete-page.csv") },
    { label: L("Cannibalisation (requête sur plusieurs pages)", "Cannibalisation (query on several pages)"), count: cannibal.length, render: () => filterable(cannibal.sort((a, b) => String(a.query).localeCompare(String(b.query))), [["query", L("Requête", "Query")], ["page", "Page"], ["clicks", L("Clics", "Clicks")], ["impressions", "Impressions"], [(r) => dec(r.position), "Position"]], "gsc-cannibalisation.csv") },
  ])];
}

export function renderSitemaps(d) {
  if (d.problem) return [problemBox(d.problem)];
  return [filterable(d.sitemaps, [["path", "Sitemap"], ["lastSubmitted", L("Envoyé", "Submitted")], ["lastDownloaded", L("Lu par Google", "Read by Google")], [(r) => (r.isPending ? L("en attente", "pending") : "OK"), L("État", "State")], ["submitted", L("URL envoyées", "URLs submitted")], ["indexed", L("Indexées", "Indexed")], ["errors", L("Erreurs", "Errors")], ["warnings", L("Alertes", "Warnings")]], "gsc-sitemaps.csv")];
}

const gaCols = (key, label, extra = []) => [[key, label], ["sessions", "Sessions"], ["totalUsers", L("Utilisateurs", "Users")], [(r) => pct(r.engagementRate), L("Engagement", "Engagement rate")], ["keyEvents", L("Conversions", "Key events")], ...extra];

export function renderGa4(d) {
  if (d.problem) return [problemBox(d.problem)];
  const t = d.totals; const dl = d.deltas;
  return [
    periodNote(d.period),
    kpiRow([kpi("Sessions", int(t.sessions), dl.sessions), kpi(L("Utilisateurs", "Users"), int(t.totalUsers), dl.totalUsers), kpi(L("Nouveaux utilisateurs", "New users"), int(t.newUsers), dl.newUsers), kpi(L("Taux d'engagement", "Engagement rate"), pct(t.engagementRate), dl.engagementRate)]),
    kpiRow([kpi(L("Sessions engagées", "Engaged sessions"), int(t.engagedSessions), dl.engagedSessions), kpi(L("Durée moy. de session", "Avg session duration"), dur(t.averageSessionDuration), dl.averageSessionDuration), kpi(L("Pages vues", "Views"), int(t.screenPageViews), dl.screenPageViews), kpi(L("Conversions (événements clés)", "Key events (conversions)"), int(t.keyEvents), dl.keyEvents)]),
    lineChart(d.trend, [{ key: "sessions", label: "Sessions", color: "#4f5bd5" }, { key: "totalUsers", label: L("Utilisateurs", "Users"), color: "#7c3aed" }, { key: "keyEvents", label: L("Conversions", "Key events"), color: "#0f9d58" }], L("Trafic quotidien (GA4)", "Daily traffic (GA4)")),
    segments([
      { label: L("Canaux", "Channels"), count: d.channels.length, render: () => [bars(d.channels, "sessionDefaultChannelGroup", "sessions"), filterable(d.channels, gaCols("sessionDefaultChannelGroup", L("Canal", "Channel")), "ga4-canaux.csv")] },
      { label: L("Source / support", "Source / medium"), count: d.sources.length, render: () => filterable(d.sources, [["sessionSourceMedium", L("Source / support", "Source / medium")], ["sessions", "Sessions"], ["totalUsers", L("Utilisateurs", "Users")], ["keyEvents", L("Conversions", "Key events")]], "ga4-sources.csv") },
      { label: L("Pages", "Pages"), count: d.pages.length, render: () => filterable(d.pages, [["pagePath", "Page"], ["screenPageViews", L("Vues", "Views")], ["activeUsers", L("Utilisateurs actifs", "Active users")], [(r) => dur(r.averageSessionDuration), L("Durée moy.", "Avg duration")], [(r) => pct(r.engagementRate), "Engagement"], ["keyEvents", L("Conversions", "Key events")]], "ga4-pages.csv") },
      { label: L("Pages de destination", "Landing pages"), count: d.landingPages.length, render: () => filterable(d.landingPages, [["landingPage", L("Page de destination", "Landing page")], ["sessions", "Sessions"], [(r) => pct(r.engagementRate), "Engagement"], ["keyEvents", L("Conversions", "Key events")]], "ga4-destination.csv") },
      { label: L("Appareils", "Devices"), count: d.devices.length, render: () => [bars(d.devices.map((r) => ({ ...r, deviceCategory: DEVICE[r.deviceCategory] ?? r.deviceCategory })), "deviceCategory", "sessions"), filterable(d.devices, gaCols("deviceCategory", L("Appareil", "Device")), "ga4-appareils.csv")] },
      { label: L("Pays", "Countries"), count: d.countries.length, render: () => filterable(d.countries, gaCols("country", L("Pays", "Country")), "ga4-pays.csv") },
      { label: L("Événements", "Events"), count: d.events.length, render: () => filterable(d.events, [["eventName", L("Événement", "Event")], ["eventCount", L("Nombre", "Count")], ["totalUsers", L("Utilisateurs", "Users")], ["keyEvents", L("Conversions", "Key events")]], "ga4-evenements.csv") },
    ]),
  ];
}

export function renderRealtime(d) {
  if (d.problem) return [problemBox(d.problem)];
  return [kpiRow([kpi(L("Utilisateurs actifs (30 min)", "Active users (30 min)"), int(d.activeUsers), null, { note: L("temps réel", "realtime") })]), segments([
    { label: "Pages", render: () => table(d.pages, [["unifiedScreenName", L("Page / écran", "Page / screen")], ["activeUsers", L("Actifs", "Active")], ["screenPageViews", L("Vues", "Views")]]) },
    { label: L("Pays", "Countries"), render: () => table(d.countries, [["country", L("Pays", "Country")], ["activeUsers", L("Actifs", "Active")]]) },
    { label: L("Appareils", "Devices"), render: () => table(d.devices, [["deviceCategory", L("Appareil", "Device")], ["activeUsers", L("Actifs", "Active")]]) },
  ])];
}

export function renderBing(d) {
  if (d.problem) return [problemBox(d.problem)];
  const t = d.totals;
  return [
    el("p", "c-note c-pad", `${d.siteUrl} · ${L("Du", "From")} ${d.period.start} ${L("au", "to")} ${d.period.end}`),
    kpiRow([kpi(L("Clics", "Clicks"), int(t.clicks), d.deltas.clicks), kpi("Impressions", int(t.impressions), d.deltas.impressions), kpi("CTR", pct(t.ctr), null, { note: L("calculé", "computed") })]),
    lineChart(d.trend, [{ key: "clicks", label: L("Clics", "Clicks"), color: "#008373" }, { key: "impressions", label: "Impressions", color: "#7c3aed" }], L("Performance Bing (trafic et classement)", "Bing performance (rank & traffic)")),
    segments([
      { label: L("Mots-clés", "Keywords"), count: d.queries.length, render: () => filterable(d.queries, gscCols("query", L("Mot-clé", "Keyword")), "bing-mots-cles.csv") },
      { label: "Pages", count: d.pages.length, render: () => filterable(d.pages, gscCols("page", "Page"), "bing-pages.csv") },
      { label: L("Appareils / pays", "Devices / countries"), render: () => el("p", "c-note", L("Non fourni par l'API Bing Webmaster (gratuite) : Bing n'expose pas de ventilation par appareil ni par pays.", "Not provided by the (free) Bing Webmaster API: Bing exposes no device or country breakdown.")) },
    ]),
  ];
}

const yes = (b) => (b === null || b === undefined ? "—" : b ? L("oui", "yes") : L("non", "no"));
/** Guide the client to grant access to the credential actually used for this tenant. */
export function renderGtmAccess(serviceAccount) {
  const section = el("section", "c-card c-pad");
  section.append(el("h3", "", L("Autoriser GTM Growth dans Google Tag Manager", "Grant GTM Growth access in Google Tag Manager")));
  if (!serviceAccount?.email) {
    section.append(el("p", "c-note", L("Adresse du compte de service indisponible. Contactez l’administration pour configurer les identifiants Google de cet espace.", "Service account email unavailable. Contact the administrator to configure Google credentials for this workspace.")));
    return section;
  }
  section.append(el("p", "c-note", L("Adresse du compte de service utilisé par cet espace :", "Service account used by this workspace:")));
  const email = el("code", "c-service-email", serviceAccount.email); const feedback = el("p", "c-note"); feedback.setAttribute("role", "status");
  const copy = el("button", "btn btn-small", L("Copier l’adresse", "Copy email")); copy.type = "button";
  copy.onclick = async () => { try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(serviceAccount.email); feedback.textContent = L("Adresse copiée. Collez-la dans Google Tag Manager.", "Email copied. Paste it in Google Tag Manager."); } catch { feedback.textContent = L("Copie indisponible : sélectionnez et copiez l’adresse ci-dessus.", "Copy unavailable: select and copy the email above."); } };
  const open = el("a", "btn btn-small", L("Ouvrir Google Tag Manager", "Open Google Tag Manager")); open.href = "https://tagmanager.google.com/"; open.target = "_blank"; open.rel = "noopener noreferrer";
  section.append(email, el("p", "c-note", L("Si nécessaire, créez d’abord un conteneur dans Google Tag Manager. Dans GTM : Administration → colonne Conteneur → Gestion des utilisateurs → + → Ajouter des utilisateurs. Collez l’adresse et attribuez au minimum Lecture. Choisissez Modifier ou Publier uniquement si ces fonctions sont nécessaires, puis validez dans Google.", "If needed, create a container in Google Tag Manager first. In GTM: Admin → Container column → User Management → + → Add users. Paste the email and grant at least Read. Choose Edit or Publish only when needed, then confirm in Google.")), copy, open, feedback);
  return section;
}

export function renderStatus(d, state) {
  const out = [];
  const sa = d.serviceAccount;
  out.push(kpiRow([
    kpi(L("Compte de service", "Service account"), sa.installed ? "OK" : L("absent", "missing"), null, { note: sa.email ?? "—" }),
    kpi("Search Console", d.gsc?.error ? L("erreur", "error") : `${d.gsc?.sites?.length ?? 0} ${L("site(s)", "site(s)")}`, null, { note: `${state.property || "—"} : ${yes(d.gsc?.hasAccess)}` }),
    kpi("GA4", d.ga4?.error ? L("erreur", "error") : `${d.ga4?.properties?.length ?? 0} ${L("propriété(s)", "propert(y/ies)")}`, null, { note: `${state.ga4Property || "—"} : ${yes(d.ga4?.hasAccess)}` }),
    kpi("Bing", d.bing?.keyConfigured ? (d.bing.error ? L("erreur", "error") : `${d.bing.sites?.length ?? 0} site(s)`) : L("clé absente", "no key"), null, { note: `${state.bingSite || "—"} : ${yes(d.bing?.hasAccess)}` }),
  ]));
  out.push(renderGtmAccess(sa));
  const steps = [];
  if (sa.email && d.gsc && !d.gsc.error && d.gsc.hasAccess !== true) steps.push({ state: "no-access", message: L(`Search Console : la propriété ${state.property || "(non renseignée)"} n'est pas visible par le compte de service.`, `Search Console: property ${state.property || "(not set)"} is not visible to the service account.`), grantEmail: sa.email, steps: [L("Search Console → la propriété → Paramètres → Utilisateurs et autorisations → Ajouter un utilisateur → autorisation « Restreint ».", "Search Console → the property → Settings → Users and permissions → Add user → “Restricted” permission.")] });
  if (sa.email && d.ga4 && !d.ga4.error && d.ga4.hasAccess !== true) steps.push({ state: "no-access", message: L(`GA4 : la propriété ${state.ga4Property || "(non renseignée)"} n'est pas visible par le compte de service.`, `GA4: property ${state.ga4Property || "(not set)"} is not visible to the service account.`), grantEmail: sa.email, steps: [L("Google Analytics → Admin → Gestion des accès à la propriété → + Ajouter des utilisateurs → rôle « Lecteur ».", "Google Analytics → Admin → Property access management → + Add users → “Viewer” role."), L("Puis renseignez l'identifiant numérique de la propriété dans le sélecteur (Admin → Paramètres de la propriété).", "Then enter the numeric property id in the picker (Admin → Property settings).")] });
  if (!d.bing?.keyConfigured) steps.push({ state: "not-configured", message: L("Bing Webmaster Tools : aucune clé API.", "Bing Webmaster Tools: no API key."), steps: [L("bing.com/webmasters → Paramètres → Accès API → Clé API (gratuite).", "bing.com/webmasters → Settings → API access → API key (free)."), L("Collez-la dans l'onglet Paramètres ci-dessus.", "Paste it in the Settings tab above.")] });
  out.push(...steps.map(problemBox));
  out.push(el("h4", "c-pad", L("Propriétés Search Console visibles", "Visible Search Console properties")), table(d.gsc?.sites ?? [], [["siteUrl", L("Propriété", "Property")], ["permissionLevel", L("Autorisation", "Permission")]]));
  out.push(el("h4", "c-pad", L("Propriétés GA4 visibles", "Visible GA4 properties")), table(d.ga4?.properties ?? [], [["account", L("Compte", "Account")], ["name", L("Propriété", "Property")], ["propertyId", "ID"]]));
  if (d.bing?.sites) out.push(el("h4", "c-pad", L("Sites Bing", "Bing sites")), table(d.bing.sites, [["url", "Site"], [(r) => yes(r.verified), L("Validé", "Verified")]]));
  for (const k of ["gsc", "ga4", "bing"]) if (d[k]?.error) out.push(el("p", "c-error c-pad", `${k.toUpperCase()} : ${d[k].error}`));
  return out;
}

const STATUS = { pass: "ok", fail: "bad", warn: "warn", info: "" };
export function renderTags(d) {
  const a = d.tags;
  if (!a) return [el("p", "c-note c-pad", L("Choisissez un domaine pour lire les balises.", "Pick a domain to read the tags."))];
  if (a.error && !a.checks?.length) return [el("p", "c-error c-pad", a.error)];
  return [
    kpiRow([kpi(L("Conteneurs GTM", "GTM containers"), String(a.containerIds.length), null, { note: a.containerIds.join(", ") || "—" }), kpi(L("Score d'installation", "Installation score"), `${a.score}/100`, null, { note: `${a.passedRequired}/${a.requiredTotal} ${L("requis", "required")}` }), kpi("HTTP", String(a.httpStatus), null, { note: a.finalUrl })]),
    table(a.checks.map((c) => ({ ...c })), [["label", L("Signal", "Signal")], [(c) => c.status, L("Verdict", "Verdict")], [(c) => (c.required ? L("requis", "required") : ""), ""], ["evidence", L("Constat", "Evidence")], ["fix", L("Correctif", "Fix")]]),
    el("p", "c-note c-pad", L("Lu dans le HTML servi : les chargeurs en double sont la cause habituelle des données gonflées.", "Read from the served HTML — duplicated loaders are the usual culprit.")),
  ].map((n) => { n.querySelectorAll?.("td").forEach((td) => { const cls = STATUS[td.textContent]; if (cls !== undefined && cls) td.classList.add(`c-st-${cls}`); }); return n; });
}

/** Paramètres du client (admin) : propriétés GSC / GA4, sites et clé Bing. */
export function renderSettings(me, save, serviceAccount, api) {
  const t = me?.tenant;
  if (!t) return [el("p", "c-note c-pad", L("Aucun espace client sélectionné.", "No client space selected."))];
  const admin = me.platformAdmin || me.role === "tenant-admin";
  const form = el("form", "c-form c-pad");
  const field = (name, label, value, ph, type = "text") => { const f = el("label", "c-field"); f.append(el("span", "", label)); const i = el("input"); i.name = name; i.type = type; i.value = value ?? ""; if (ph) i.placeholder = ph; i.disabled = !admin; f.append(i); return f; };
  form.append(
    field("gscProperties", L("Propriétés Search Console (séparées par des virgules)", "Search Console properties (comma separated)"), t.gscProperties.join(", "), "sc-domain:exemple.fr"),
    field("ga4Properties", L("Propriétés GA4 (identifiants numériques)", "GA4 properties (numeric ids)"), (t.ga4Properties ?? []).join(", "), "123456789"),
    field("bingSites", L("Sites Bing Webmaster", "Bing Webmaster sites"), (t.bingSites ?? []).join(", "), "https://www.exemple.fr/"),
    field("gtmContainers", L("Conteneurs GTM (web et serveur)", "GTM containers (web and server)"), (t.gtmContainers ?? []).join(", "), "accounts/123/containers/456"),
    field("clarityProjects", L("Projets Microsoft Clarity (ID)", "Microsoft Clarity projects (id)"), (t.clarityProjects ?? []).join(", "), "z8ln1th2sn"),
    field("bingApiKey", L(`Clé API Bing ${t.bingKeyConfigured ? "(configurée — laisser vide pour la garder)" : ""}`, `Bing API key ${t.bingKeyConfigured ? "(set — leave empty to keep it)" : ""}`), "", "••••••••", "password"),
  );
  const containerInput = form.querySelector('[name="gtmContainers"]');
  const containerHelp = el("p", "c-note", L("Aucun conteneur ? Renseignez le chemin API accounts/<id>/containers/<id> du conteneur autorisé pour ce client. L’identifiant public GTM-XXXX ne suffit pas à lui seul ; le compte de service doit avoir accès au conteneur.", "No container? Enter the API path accounts/<id>/containers/<id> for this client's authorized container. The public GTM-XXXX ID alone is not enough; the service account needs access to the container."));
  containerInput.closest("label").append(containerHelp);
  containerInput.readOnly = !me.platformAdmin;
  if (admin && !me.platformAdmin) containerInput.closest("label").append(el("p", "c-note", L("Pour associer un nouveau conteneur, contactez l’administration de la plateforme après avoir autorisé le compte de service.", "To associate a new container, contact the platform administrator after granting access to the service account.")));
  if (me.platformAdmin) {
    const paste = el("button", "btn btn-small", L("Coller le chemin du conteneur", "Paste container path")); paste.type = "button";
    paste.onclick = async () => { try { const raw = (await navigator.clipboard.readText()).trim(); const value = raw.match(/accounts\/\d+\/containers\/\d+/)?.[0] || raw; if (!/^accounts\/\d+\/containers\/\d+$/.test(value)) throw new Error(L("Le presse-papiers doit contenir accounts/<id>/containers/<id>.", "Clipboard must contain accounts/<id>/containers/<id>.")); const existing = containerInput.value.split(",").map((item) => item.trim()).filter(Boolean); if (!existing.includes(value)) existing.push(value); containerInput.value = existing.join(", "); containerInput.dispatchEvent(new Event("input", { bubbles: true })); msg.textContent = L("Chemin collé. Enregistrez pour l’appliquer.", "Path pasted. Save to apply."); msg.className = "c-note"; } catch (error) { msg.textContent = error?.message || L("Presse-papiers inaccessible : collez le chemin manuellement.", "Clipboard unavailable: paste the path manually."); msg.className = "c-error"; } };
    containerInput.closest("label").append(paste);
    if (api) {
      const discover = el("button", "btn btn-small", L("Rechercher les conteneurs accessibles", "Find accessible containers")); discover.type = "button";
      const choices = el("div", "c-container-choices");
      discover.onclick = async () => {
        discover.disabled = true; choices.replaceChildren(el("p", "c-loading", L("Recherche en cours…", "Searching…")));
        try {
          const data = await api("/gtm/containers", {});
          if (data.problem) { choices.replaceChildren(problemBox(data.problem)); return; }
          choices.replaceChildren();
          if (!data.containers?.length) choices.append(el("p", "c-note", L("Aucun conteneur accessible. Vérifiez l’autorisation du compte de service dans Google Tag Manager.", "No accessible containers. Check the service account permissions in Google Tag Manager.")));
          for (const c of data.containers || []) {
            if (!/^accounts\/\d+\/containers\/\d+$/.test(c.path || "")) continue;
            const row = el("p", "c-note"); row.append(el("span", "", `${c.account || "—"} · ${c.name || "—"} · ${c.publicId || "—"} · ${c.path} `));
            const add = el("button", "btn btn-small", L("Sélectionner", "Select")); add.type = "button";
            add.onclick = () => { const existing = containerInput.value.split(",").map((x) => x.trim()).filter(Boolean); if (!existing.includes(c.path)) existing.push(c.path); containerInput.value = existing.join(", "); msg.textContent = L("Conteneur sélectionné. Vérifiez qu’il appartient au client, puis enregistrez.", "Container selected. Confirm it belongs to the client, then save."); };
            row.append(add); choices.append(row);
          }
        } catch (error) { choices.replaceChildren(el("p", "c-error", error.message)); } finally { discover.disabled = false; }
      };
      containerInput.closest("label").append(discover, choices);
    }
  }
  const msg = el("p", "c-note");
  if (admin) { const b = el("button", "btn btn-small", L("Enregistrer", "Save")); b.type = "submit"; form.append(b); }
  else msg.textContent = L("Réservé aux administrateurs du client.", "Client administrators only.");
  form.onsubmit = async (e) => {
    e.preventDefault(); const fd = new FormData(form); const split = (k) => String(fd.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const body = { gscProperties: split("gscProperties"), ga4Properties: split("ga4Properties"), bingSites: split("bingSites"), gtmContainers: split("gtmContainers"), clarityProjects: split("clarityProjects") };
    const key = String(fd.get("bingApiKey") ?? "").trim(); if (key) body.bingApiKey = key;
    try { await save(body); msg.textContent = L("Enregistré.", "Saved."); msg.className = "c-note"; } catch (error) { msg.textContent = error.message; msg.className = "c-error"; }
  };
  return serviceAccount === undefined ? [form, msg] : [renderGtmAccess(serviceAccount), form, msg];
}

/* ── GA4 e-commerce ── */
const money = (v) => (typeof v === "number" ? v.toLocaleString(loc, { style: "currency", currency: "EUR", maximumFractionDigits: 2 }) : "—");
const FUNNEL_LABEL = { view_item_list: L("Vue de liste", "Item list view"), view_item: L("Vue produit", "Item view"), add_to_cart: L("Ajout au panier", "Add to cart"), begin_checkout: L("Début de commande", "Begin checkout"), add_shipping_info: L("Livraison", "Shipping info"), add_payment_info: L("Paiement", "Payment info"), purchase: L("Achat", "Purchase") };

export function renderEcommerce(d) {
  if (d.problem) return [problemBox(d.problem)];
  const t = d.totals; const dl = d.deltas; const out = [periodNote(d.period)];
  if (!d.hasEcommerce) out.push(problemBox({ state: "not-configured", message: L("Aucun événement e-commerce GA4 (view_item, add_to_cart, purchase…) sur la période : le site ne mesure pas encore le e-commerce. Les tableaux restent affichés à zéro.", "No GA4 ecommerce events (view_item, add_to_cart, purchase…) in the period: the site does not measure ecommerce yet. Tables are shown with zeros.") }));
  const max = Math.max(1, ...d.funnel.map((f) => f.users));
  const funnel = el("div", "c-bars");
  d.funnel.forEach((f, i) => { const prev = i ? d.funnel[i - 1].users : null; const line = el("div", "c-bar"); const fill = el("span", "c-bar-fill"); fill.style.width = `${(f.users / max) * 100}%`; line.append(el("span", "c-bar-label", FUNNEL_LABEL[f.step] ?? f.step), el("span", "c-bar-track"), el("span", "c-bar-value", `${int(f.users)} ${L("util.", "users")}${prev ? ` · ${pct(f.users / prev)}` : ""}`)); line.children[1].append(fill); funnel.append(line); });
  const ecCols = (key, label) => [[key, label], ["sessions", "Sessions"], ["transactions", "Transactions"], [(r) => money(r.purchaseRevenue), L("Revenu", "Revenue")]];
  out.push(
    kpiRow([kpi(L("Revenu", "Revenue"), money(t.purchaseRevenue), dl.purchaseRevenue), kpi("Transactions", int(t.transactions), dl.transactions), kpi(L("Panier moyen", "Average order value"), money(t.averagePurchaseRevenue), dl.averagePurchaseRevenue), kpi(L("Articles achetés", "Items purchased"), int(t.itemsPurchased), dl.itemsPurchased)]),
    kpiRow([kpi(L("Acheteurs", "Purchasers"), int(t.totalPurchasers), dl.totalPurchasers), kpi(L("Taux d'acheteurs", "Purchaser rate"), pct(t.purchaserRate), dl.purchaserRate), kpi(L("Ajouts au panier", "Add-to-carts"), int(t.addToCarts), dl.addToCarts), kpi(L("Commandes commencées", "Checkouts"), int(t.checkouts), dl.checkouts)]),
    lineChart(d.trend, [{ key: "purchaseRevenue", label: L("Revenu", "Revenue"), color: "#0f9d58" }, { key: "transactions", label: "Transactions", color: "#4f5bd5" }], L("Revenu quotidien", "Daily revenue")),
    segments([
      { label: L("Entonnoir", "Funnel"), count: d.funnel.length, render: () => [funnel, filterable(d.funnel.map((f) => ({ ...f, step: FUNNEL_LABEL[f.step] ?? f.step })), [["step", L("Étape", "Step")], ["users", L("Utilisateurs", "Users")], ["events", L("Événements", "Events")]], "ga4-entonnoir.csv")] },
      { label: L("Produits", "Items"), count: d.items.length, render: () => filterable(d.items, [["itemName", L("Produit", "Item")], [(r) => money(r.itemRevenue), L("Revenu", "Revenue")], ["itemsPurchased", L("Achetés", "Purchased")], ["itemsViewed", L("Vus", "Viewed")], ["itemsAddedToCart", L("Ajoutés au panier", "Added to cart")]], "ga4-produits.csv") },
      { label: L("Listes de produits", "Item lists"), count: d.itemLists.length, render: () => filterable(d.itemLists, [["itemListName", L("Liste", "List")], ["itemsViewedInList", L("Vus", "Viewed")], ["itemsClickedInList", L("Cliqués", "Clicked")], [(r) => pct(r.itemListClickThroughRate), "CTR"]], "ga4-listes.csv") },
      { label: L("Canaux", "Channels"), count: d.channels.length, render: () => filterable(d.channels, ecCols("sessionDefaultChannelGroup", L("Canal", "Channel")), "ga4-ecommerce-canaux.csv") },
      { label: L("Appareils", "Devices"), count: d.devices.length, render: () => filterable(d.devices, ecCols("deviceCategory", L("Appareil", "Device")), "ga4-ecommerce-appareils.csv") },
      { label: "Transactions", count: d.transactions.length, render: () => filterable(d.transactions, [["transactionId", "ID"], [(r) => money(r.purchaseRevenue), L("Revenu", "Revenue")]], "ga4-transactions.csv") },
    ]),
  );
  return out;
}

/* ── GA4 systèmes et navigateurs ── */
export function renderTechnology(d) {
  if (d.problem) return [problemBox(d.problem)];
  const cols = (key, label, k2, l2) => [[key, label], ...(k2 ? [[k2, l2]] : []), ["sessions", "Sessions"], ["totalUsers", L("Utilisateurs", "Users")], [(r) => pct(r.engagementRate), "Engagement"], ["keyEvents", L("Conversions", "Key events")], [(r) => money(r.purchaseRevenue), L("Revenu", "Revenue")]];
  return [periodNote(d.period), segments([
    { label: L("Systèmes", "Operating systems"), count: d.os.length, render: () => [bars(d.os, "operatingSystem", "sessions"), filterable(d.os, cols("operatingSystem", L("Système", "OS")), "ga4-systemes.csv")] },
    { label: L("Navigateurs", "Browsers"), count: d.browser.length, render: () => [bars(d.browser, "browser", "sessions"), filterable(d.browser, cols("browser", L("Navigateur", "Browser")), "ga4-navigateurs.csv")] },
    { label: L("Système + version", "OS + version"), count: d.osVersion.length, render: () => filterable(d.osVersion, cols("operatingSystemWithVersion", L("Système", "OS")), "ga4-systemes-versions.csv") },
    { label: L("Navigateur × appareil", "Browser × device"), count: d.browserVersion.length, render: () => filterable(d.browserVersion, cols("browser", L("Navigateur", "Browser"), "deviceCategory", L("Appareil", "Device")), "ga4-navigateur-appareil.csv") },
    { label: L("Appareil × système", "Device × OS"), count: d.deviceOs.length, render: () => filterable(d.deviceOs, cols("deviceCategory", L("Appareil", "Device"), "operatingSystem", L("Système", "OS")), "ga4-appareil-systeme.csv") },
    { label: L("Résolutions", "Resolutions"), count: d.resolution.length, render: () => filterable(d.resolution, cols("screenResolution", L("Résolution", "Resolution")), "ga4-resolutions.csv") },
    { label: L("Plateformes", "Platforms"), count: d.platform.length, render: () => filterable(d.platform, cols("platform", L("Plateforme", "Platform")), "ga4-plateformes.csv") },
    { label: L("Langues", "Languages"), count: d.language.length, render: () => filterable(d.language, cols("language", L("Langue", "Language")), "ga4-langues.csv") },
  ]), el("p", "c-note c-pad", L("Search Console ne fournit pas de ventilation par système ou navigateur : seule la dimension appareil existe (Search Console → Appareils).", "Search Console has no OS/browser breakdown: only the device dimension exists (Search Console → Devices)."))];
}

/* ── Google Tag Manager : inventaire, écriture, publication confirmée ── */
export function renderGtm(d, api, rerender) {
  if (d.problem) return [problemBox(d.problem)];
  const c = d.container; const out = [];
  out.push(el("p", "c-note c-pad", `${c.name} · ${c.publicId} · ${(c.usageContext ?? []).join(", ")} · ${L("version en ligne", "live version")} : ${d.live ? `${d.live.id} ${d.live.name ?? ""}` : "—"} · ${L("modifications en attente", "pending changes")} : ${d.pendingChanges}`));
  const msg = el("div", "c-out");
  const call = async (route, body) => { msg.replaceChildren(el("p", "c-loading", L("En cours…", "Working…"))); try { const r = await api(route, { container: c.path, ...body }); if (r.problem) msg.replaceChildren(problemBox(r.problem)); else { msg.replaceChildren(el("pre", "c-code", JSON.stringify(r.done ?? r, null, 2))); } return r; } catch (e) { msg.replaceChildren(el("p", "c-error", e.message)); } };
  // Formulaire d'écriture
  const form = el("form", "c-form");
  const field = (name, label, node) => { const f = el("label", "c-field"); f.append(el("span", "", label)); node.name = name; f.append(node); form.append(f); return node; };
  const select = (opts) => { const s = el("select"); for (const [v, t] of opts) { const o = el("option", "", t); o.value = v; s.append(o); } return s; };
  field("op", L("Opération", "Operation"), select([["create", L("Créer", "Create")], ["update", L("Modifier", "Update")], ["delete", L("Supprimer", "Delete")], ["create-workspace", L("Créer un espace de travail", "Create workspace")], ["delete-workspace", L("Supprimer l'espace de travail", "Delete workspace")], ["create-version", L("Créer une version", "Create version")]]));
  field("kind", L("Élément", "Item"), select([["tags", L("Balise", "Tag")], ["triggers", L("Déclencheur", "Trigger")], ["variables", "Variable"]]));
  const ws = field("workspace", L("Espace de travail", "Workspace"), select(d.workspaces.map((w) => [w.path, w.name])));
  ws.value = d.workspace;
  const path = el("input"); path.placeholder = "accounts/…/tags/12"; field("path", L("Chemin (modifier/supprimer)", "Path (update/delete)"), path);
  const name = el("input"); field("name", L("Nom (espace / version)", "Name (workspace / version)"), name);
  const res = el("textarea"); res.rows = 5; res.placeholder = '{"name":"GA4 - page_view","type":"gaawe","parameter":[…],"firingTriggerId":["2147479553"]}'; field("resource", L("Ressource JSON (API Tag Manager)", "Resource JSON (Tag Manager API)"), res);
  const dry = el("input"); dry.type = "checkbox"; dry.checked = true; const dl = el("label", "c-field c-inline"); dry.name = "dryRun"; dl.append(dry, el("span", "", L("Simulation (rien n'est envoyé à Google)", "Dry run (nothing sent to Google)"))); form.append(dl);
  const go = el("button", "btn btn-small", L("Exécuter", "Run")); go.type = "submit"; form.append(go);
  form.onsubmit = async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(form)); const body = { ...fd, dryRun: dry.checked }; if (body.op === "update" || body.op === "delete") body.path = path.value; else delete body.path; if (body.op === "delete-workspace" && !confirm(L("Supprimer cet espace de travail ?", "Delete this workspace?"))) return; const r = await call("/gtm/write", body); if (r && !r.problem && !dry.checked) rerender(); };
  // Publication avec confirmation
  const pub = el("form", "c-form");
  const ver = el("select"); ver.name = "version"; for (const v of d.versions.filter((x) => !x.deleted)) { const o = el("option", "", `${v.id} · ${v.name ?? ""} (${v.tags ?? 0} ${L("balises", "tags")})`); o.value = v.id; ver.append(o); }
  const vf = el("label", "c-field"); vf.append(el("span", "", L("Version à publier", "Version to publish")), ver); pub.append(vf);
  const cf = el("label", "c-field"); const conf = el("input"); conf.name = "confirm"; conf.placeholder = c.publicId; cf.append(el("span", "", L(`Retapez ${c.publicId} pour confirmer`, `Type ${c.publicId} to confirm`)), conf); pub.append(cf);
  const pb = el("button", "btn btn-small btn-danger", L("Publier en production", "Publish to production")); pb.type = "submit"; pub.append(pb);
  pub.onsubmit = async (e) => { e.preventDefault(); if (conf.value.trim() !== c.publicId) { msg.replaceChildren(el("p", "c-error", L(`Confirmation incorrecte : tapez ${c.publicId}.`, `Wrong confirmation: type ${c.publicId}.`))); return; } if (!confirm(L(`Publier la version ${ver.value} sur ${c.publicId} ? Elle sera en ligne immédiatement.`, `Publish version ${ver.value} to ${c.publicId}? It goes live immediately.`))) return; await call("/gtm/publish", { version: ver.value, confirm: conf.value.trim() }); };
  const card = (title, ...kids) => { const s = el("section", "c-card"); s.append(el("h3", "", title), ...kids); return s; };
  out.push(segments([
    { label: L("Balises", "Tags"), count: d.tags.length, render: () => filterable(d.tags, [["name", L("Nom", "Name")], ["type", "Type"], [(r) => r.firing.join(", "), L("Déclencheurs", "Triggers")], [(r) => (r.paused ? L("en pause", "paused") : "✓"), L("État", "State")], ["path", L("Chemin", "Path")]], "gtm-balises.csv") },
    { label: L("Déclencheurs", "Triggers"), count: d.triggers.length, render: () => filterable(d.triggers, [["name", L("Nom", "Name")], ["type", "Type"], ["triggerId", "ID"], ["path", L("Chemin", "Path")]], "gtm-declencheurs.csv") },
    { label: "Variables", count: d.variables.length, render: () => filterable(d.variables, [["name", L("Nom", "Name")], ["type", "Type"], ["path", L("Chemin", "Path")]], "gtm-variables.csv") },
    ...(d.clients.length || (c.usageContext ?? []).includes("server") ? [{ label: L("Clients (serveur)", "Clients (server)"), count: d.clients.length, render: () => filterable(d.clients, [["name", L("Nom", "Name")], ["type", "Type"], ["priority", L("Priorité", "Priority")]], "sgtm-clients.csv") }] : []),
    { label: L("Espaces de travail", "Workspaces"), count: d.workspaces.length, render: () => filterable(d.workspaces, [["name", L("Nom", "Name")], ["description", "Description"], ["path", L("Chemin", "Path")]], "gtm-espaces.csv") },
    { label: "Versions", count: d.versions.length, render: () => filterable(d.versions, [["id", "ID"], ["name", L("Nom", "Name")], ["tags", L("Balises", "Tags")], ["triggers", L("Déclencheurs", "Triggers")], ["variables", "Variables"]], "gtm-versions.csv") },
  ]));
  out.push(card(L("Écrire dans GTM", "Write to GTM"), el("p", "c-note", L("Réservé aux administrateurs du client. Testez d'abord dans un espace de travail dédié ; rien n'est en ligne avant publication.", "Client admins only. Test in a dedicated workspace first; nothing goes live before publishing.")), form));
  out.push(card(L("Publier une version", "Publish a version"), el("p", "c-note", L("Publication immédiate sur le site : double confirmation requise.", "Goes live immediately: double confirmation required.")), pub));
  out.push(msg);
  return out;
}
