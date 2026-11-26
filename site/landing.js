/** Shared FR/EN landing behavior; locale changes copy, never the workflow. */
import { auditUrlShape, normalizeTarget } from "./preview.js";
import { dictFor } from "./i18n.js";
import { renderTables, sampleTables } from "./tables.js";
import { renderSitemapMap } from "./sitemap-map.js";
import { translateLiveTables } from "./fr/server-tables.js";
import { requestPublicRead, auditStatusText } from "./audit-client.js";
import { node as element, dashboardMetrics, categoryChart, outcomeChart, trendPanel, auditSeries, sitemapActivity } from "./read-dashboard.js";
import { geoCheckTitle } from "./geo-check-titles.js";

const language = document.documentElement.lang === "fr" ? "fr" : "en";
const dict = dictFor(language);
const L = (fr, en) => language === "fr" ? fr : en;
const form = document.getElementById("url-form");
const input = document.getElementById("url-input");
const feedback = document.getElementById("form-msg");
const result = document.getElementById("read-result");
let generation = 0;

function panel(theme, heading, ...body) {
  const section = element("section", "read-panel read-" + theme);
  section.append(heading, ...body);
  return section;
}

function renderSources(container, tables) {
  container.replaceChildren();
  const labels = { seo: "SEO", ga4: "Google Analytics 4", gsc: "Google Search Console", other: L("Autres données", "Other data") };
  const groups = new Map();
  for (const table of tables) {
    const source = String(table.id || "").split(".")[0];
    const id = Object.hasOwn(labels, source) ? source : "other";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(table);
  }
  for (const [id, group] of groups) {
    const section = panel(id, element("h3", "", labels[id]));
    const rows = group.filter(t => !t.sample).flatMap(t => t.rows || []).filter(r => ["pass","warn","fail"].includes(r.status));
    if (rows.length) {
      const passed = rows.filter(r => r.status === "pass").length;
      const pct = Math.round(100 * passed / rows.length);
      const label = L(`${pct} % conformes · ${rows.length-passed}/${rows.length} signaux évalués à examiner`,
        `${pct}% passed · ${rows.length-passed}/${rows.length} assessed signals to review`);
      const bar = element("progress", "read-meter");
      bar.max = 100; bar.value = pct; bar.setAttribute("aria-label", label);
      section.append(element("p", "read-source-stat", label), bar);
    }
    const data = element("div", "read-source-tables");
    renderTables(data, group, dict); section.append(data); container.append(section);
  }
}

function renderChecks(report) {
  const list = element("ul", "gg-checks");
  for (const check of report.checks) {
    const item = element("li", check.status);
    const state = check.status === "pass" ? L("Conforme", "Passed") : L("À corriger", "Needs attention");
    item.append(element("span", "read-check-state", state), element("strong", "", check.label), element("small", "", check.evidence));
    if (check.status !== "pass" && check.fix) item.append(element("small", "gg-fix", check.fix));
    list.append(item);
  }
  return list;
}

function renderInitialResult(url, report) {
  const title = element("h2", "", report.host);
  title.tabIndex = -1;
  const verdictText = element("p", "read-caption");
  const score = element("h3", "", L("Vérifications IA", "AI checks"));
  const explanation = element("p", "gg-note", L("Lecture de votre page en cours : les 42 contrôles de visibilité IA s’afficheront ici.", "Reading your page: the 42 AI visibility checks will appear here."));
  const heading = element("h3", "", `${L("Vérification de l’adresse", "Address check")} (${report.total} points) · ${report.passed}/${report.total} ${L("conformes", "passed")}`);
  const addressNote = element("p", "gg-note", L(`Ces ${report.total} points vérifient seulement la forme de l’adresse saisie (HTTPS, nom d’hôte, chemin…), pas le contenu de votre site. Ils sont distincts des 42 contrôles de visibilité IA ci-dessus.`, `These ${report.total} points only check the format of the address you entered (HTTPS, host name, path…), not your site content. They are separate from the 42 AI visibility checks above.`));
  const apiHeading = element("h3", "", L("Données SEO, GA4 et Search Console", "SEO, GA4 and Search Console data"));
  const note = element("p", "gg-note", dict.tables.loading);
  note.setAttribute("role", "status");
  note.dataset.resultNote = "";
  const tables = element("div", "gg-data");
  tables.dataset.resultTables = "";
  const next = element("a", "gg-next", L("Étape suivante : explorer les questions de mes clients, gratuitement →", "Next: explore my customers’ questions for free →"));
  next.href = `/console/?lang=${language}#c-public-read`;
  const actions = element("section", "landing-next-actions"); actions.hidden = true;

  const mapHeading = element("h3", "", L("Carte du sitemap", "Sitemap map"));
  const map = element("div", "sitemap-map");
  renderSitemapMap(map, null, language);
  const head = element("header", "read-heading");
  const identity = element("div");
  identity.append(element("p", "read-kicker", L("Tableau de bord de l’audit", "Site audit dashboard")), title);
  const stamp = element("span", "read-timestamp", L("Analyse en cours", "Analysis in progress"));
  head.append(identity, stamp);
  const metrics = element("div");
  metrics.append(dashboardMetrics(report, undefined, language));
  const charts = element("div", "read-charts");
  const geoCopy = element("div", "read-geo-copy");
  geoCopy.append(verdictText, explanation);
  const geoBody = element("div", "read-geo-body");
  geoBody.append(geoCopy);
  const geo = panel("geo", score, geoBody);
  const inventory = panel("map", mapHeading, map);
  const mapActivity = element("div");
  inventory.append(mapActivity);
  actions.className += " read-panel read-actions";
  result.replaceChildren(head, metrics, charts, geo, actions, next, panel("address", heading, addressNote, renderChecks(report)), apiHeading, note, tables, inventory);
  result.hidden = false;
  result.scrollIntoView({ behavior: "instant", block: "start" });
  title.focus({ preventScroll: true });
  return { score, verdictText, explanation, note, tables, map, actions, stamp, metrics, charts, mapActivity, geoBody, report };
}

async function loadLiveRead(url, host, view, requestId) {
  try {
    const payload = await requestPublicRead(url, { endpoint: "/api/free-read", onStatus: status => {
      if (requestId === generation) view.note.textContent = auditStatusText(status, language);
    } });
    if (requestId !== generation) return;

    view.metrics.replaceChildren(dashboardMetrics(view.report, payload, language));
    const observedAt = payload.report360?.observedAt || payload.evidence?.observedAt;
    const measuredAt = Date.parse(observedAt);
    view.stamp.textContent = Number.isFinite(measuredAt)
      ? L("Mesuré le ", "Measured ") + new Date(measuredAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })
      : L("Lecture terminée", "Read complete");
    if (payload.geoV2?.controls?.length && payload.geoV2.status !== "failed") {
      const done = payload.geoV2.controls.filter(c => c.status === "measured" || c.status === "not_applicable").length;
      const unknown = Math.max(0, 42 - done);
      view.score.textContent = `${L("Visibilité IA · 42 contrôles", "AI visibility · 42 checks")} — ${done}/42 ${L("contrôles faits", "checks done")}`;
      view.verdictText.textContent = unknown > 0
        ? `${L("Audit de la page", "Page audit for")} ${host} · ${unknown} ${L("contrôles à vérifier. La note sur 100 est calculée quand les 42 le sont, dans votre espace.", "checks to verify. The score out of 100 is calculated once all 42 are done, in your workspace.")}`
        : `${L("Audit de la page", "Page audit for")} ${host} · ${L("les 42 contrôles sont faits. La note sur 100 s'affiche dans votre espace.", "all 42 checks are done. The score out of 100 is shown in your workspace.")}`;
      view.explanation.textContent = L("Les 42 contrôles de visibilité IA lisent votre page, son robots.txt, son llms.txt et son sitemap. Un contrôle à vérifier ne compte jamais comme un échec.", "The 42 AI visibility checks read your page, its robots.txt, llms.txt and sitemap. A check still to verify never counts as a failure.");
      const outcomes = outcomeChart(payload.geoV2.controls, language);
      if (outcomes) view.geoBody.append(outcomes);
      const points = await auditSeries(payload);
      if (requestId !== generation) return;
      view.charts.append(categoryChart(payload.geoV2.controls, language), trendPanel(points, language));
    } else {
      view.score.textContent = L("Visibilité IA : lecture indisponible", "AI visibility: read unavailable");
      view.verdictText.textContent = L("Les 42 contrôles de visibilité IA n'ont pas pu être lus pour cette page. Les anciennes mesures ne remplacent pas cette note.", "The 42 AI visibility checks could not be read for this page. Older measurements do not replace this score.");
      view.explanation.textContent = "";
    }
    renderSources(view.tables, language === "fr" ? translateLiveTables(payload.tables ?? []) : (payload.tables ?? []));
    const fixes = (payload.report360?.actions ?? []).filter(a => a.kind === "observed_fix" && a.pillar === "geo").slice(0, 3);
    view.actions.replaceChildren(element("h3", "", L("Votre prochaine action, fondée sur les constats", "Your next action, grounded in evidence")));
    if (!fixes.length) view.actions.append(element("p", "", L("Cette lecture ne fournit pas de correctif étayé. Explorez les questions clients ou vérifiez les mesures techniques ci-dessous.", "This read provides no evidence-backed fix. Explore customer questions or review the technical measurements below.")));
    const list = element("ol");
    for (const fix of fixes) {
      const item = element("li"), evidence = element("details");
      item.append(element("strong", "", `${fix.checkId} · ${geoCheckTitle(fix.checkId, fix.title, language)}`), element("p", "", L("Consultez le rapport 360° pour les étapes et la source du constat.", "Open the 360° report for the steps and the finding's source.")));
      evidence.append(element("summary", "", L("Voir le constat", "View the finding")), element("p", "", fix.proof?.value || L("Preuve indisponible", "Evidence unavailable")));
      item.append(evidence); list.append(item);
    }
    view.actions.append(list); view.actions.hidden = false;
    renderSitemapMap(view.map, payload.sitemapMap, language);
    const activity = sitemapActivity(payload.sitemapMap, observedAt, language);
    if (activity) view.mapActivity.append(activity);
    view.note.textContent = dict.tables.serverNote({
      at: (Number.isFinite(measuredAt) ? new Date(measuredAt) : new Date()).toLocaleTimeString(language === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" }),
      seconds: typeof payload.durationMs === "number" ? (payload.durationMs / 1000).toFixed(1) : undefined,
    });
  } catch {
    if (requestId !== generation) return;
    view.metrics.replaceChildren(dashboardMetrics(view.report, null, language));
    view.stamp.textContent = L("Lecture de l’adresse uniquement", "Address checks only");
    renderSources(view.tables, sampleTables(dict));
    view.explanation.textContent = L("Les 42 contrôles de visibilité IA n’ont pas pu être lus pour l’instant. Réessayez dans quelques instants.", "The 42 AI visibility checks could not be read right now. Please try again in a moment.");
    view.note.textContent = L("Lecture serveur momentanément indisponible. Les tableaux ci-dessous sont des EXEMPLES, pas des mesures de votre site.", "Server read temporarily unavailable. The tables below are SAMPLES, not measurements of your site.");
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  feedback.className = "form-msg";
  feedback.textContent = "";
  const parsed = normalizeTarget(input.value, dict);
  if (!parsed.ok) {
    feedback.classList.add("err");
    feedback.textContent = parsed.error;
    input.focus();
    return;
  }

  const requestId = ++generation;
  const url = parsed.url.href;
  try { sessionStorage.setItem("gtm-console-onboarding-url", url); } catch { /* storage may be unavailable */ }
  const report = auditUrlShape(parsed.url, dict);
  const view = renderInitialResult(url, report);
  void loadLiveRead(url, report.host, view, requestId);
});


// The same validation, payload and honest success/failure feedback in both locales.
const started = Date.now();
const leadForm = document.getElementById("lead-form");
leadForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const name = document.getElementById("lead-name").value.trim();
  const email = document.getElementById("lead-email").value.trim();
  const parsed = normalizeTarget(document.getElementById("lead-url").value.trim(), dict);
  const status = document.getElementById("lead-msg-status");
  const valid = [name.length >= 2, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), parsed.ok];
  ["err-name", "err-email", "err-url"].forEach((id, i) => { document.getElementById(id).hidden = valid[i]; });
  status.className = "form-msg";
  if (valid.includes(false)) {
    status.classList.add("err");
    status.textContent = L("Certains champs sont invalides — corrigez puis renvoyez.", "Some fields are invalid — correct them and try again.");
    return;
  }
  const button = leadForm.querySelector("button");
  button.disabled = true;
  status.textContent = L("Envoi en cours…", "Sending…");
  try {
    const response = await fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, website: parsed.url.href, source: `landing-${language}`, elapsedMs: Date.now() - started }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    status.classList.add("ok");
    status.textContent = L("Votre demande a bien été enregistrée.", "Your request has been recorded.");
    leadForm.reset();
  } catch {
    status.classList.add("err");
    status.textContent = L("L’envoi a échoué. Veuillez réessayer.", "Sending failed. Please try again.");
  } finally { button.disabled = false; }
});

// Keep existing English deep links working after unifying section IDs.
const aliases = { how: "fonctionnement", tools: "outils", measurement: "mesure", proof: "preuve", plans: "offres", talk: "contact", geosuite: "credit", "free-read": "url-form" };
function followLegacyAnchor() {
  const target = aliases[location.hash.slice(1)];
  const node = target && document.getElementById(target);
  if (node) {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true;
    node.scrollIntoView({ behavior: "instant" });
  }
}
window.addEventListener("hashchange", followLegacyAnchor);
followLegacyAnchor();
