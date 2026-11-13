/** Shared FR/EN landing behavior; locale changes copy, never the workflow. */
import { auditUrlShape, normalizeTarget, verdict } from "./preview.js";
import { dictFor } from "./i18n.js";
import { renderTables, sampleTables } from "./tables.js";
import { renderSitemapMap } from "./sitemap-map.js";
import { translateLiveTables } from "./fr/server-tables.js";

const language = document.documentElement.lang === "fr" ? "fr" : "en";
const dict = dictFor(language);
const L = (fr, en) => language === "fr" ? fr : en;
const form = document.getElementById("url-form");
const input = document.getElementById("url-input");
const feedback = document.getElementById("form-msg");
const result = document.getElementById("read-result");
let generation = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function renderChecks(report) {
  const list = element("ul", "gg-checks");
  for (const check of report.checks) {
    const item = element("li", check.status);
    item.append(element("strong", "", check.label), element("small", "", check.evidence));
    if (check.status !== "pass" && check.fix) item.append(element("small", "gg-fix", check.fix));
    list.append(item);
  }
  return list;
}

function renderInitialResult(url, report) {
  const title = element("h2", "", `${L("Première lecture de", "First read of")} ${report.host}`);
  title.tabIndex = -1;
  const verdictText = element("p", "", `${verdict(report.score, dict)} ${dict.summary(report.passed, report.total)}`);
  const score = element("p", "gg-score", `${L("Hygiène de l’URL", "URL hygiene")}: ${report.score}/100`);
  const explanation = element("p", "gg-note", L("Ces 10 contrôles vérifient seulement l’adresse saisie, pas le contenu de votre site. La lecture serveur, lorsqu’elle est disponible, mesure les signaux GEO réels.", "These 10 checks inspect only the address you entered, not your site content. The server read measures actual GEO signals when available."));
  const heading = element("h3", "", L("Contrôles de l’adresse", "Address checks"));
  const apiHeading = element("h3", "", L("Données SEO, GA4 et Search Console", "SEO, GA4 and Search Console data"));
  const note = element("p", "gg-note", dict.tables.loading);
  note.setAttribute("role", "status");
  note.dataset.resultNote = "";
  const tables = element("div", "gg-data");
  tables.dataset.resultTables = "";
  const next = element("a", "gg-next", L("Ouvrir la console complète →", "Open the full console →"));
  next.href = `/console/?lang=${language}#overview`;

  const mapHeading = element("h3", "", L("Carte du sitemap", "Sitemap map"));
  const map = element("div", "sitemap-map");
  renderSitemapMap(map, null, language);
  result.replaceChildren(title, verdictText, score, explanation, heading, renderChecks(report), apiHeading, note, tables, mapHeading, map, next);
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
  title.focus({ preventScroll: true });
  return { title, score, verdictText, note, tables, map };
}

async function loadLiveRead(url, host, view, requestId) {
  try {
    const response = await fetch("/api/free-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (requestId !== generation) return;

    if (typeof payload.score === "number" && payload.score >= 0 && payload.score <= 100) {
      view.score.textContent = `${L("Score GEO mesuré", "Measured GEO score")} : ${payload.score}/100`;
      const projected = typeof payload.projectedScore === "number" ? ` · ${L("Potentiel après correctifs", "Potential after fixes")} : ${payload.projectedScore}/100` : "";
      view.verdictText.textContent = `${L("Audit de la page", "Page audit for")} ${host}${projected}. ${L("Ce score ne concerne pas tout le domaine.", "This score does not cover the whole domain.")}`;
    }
    renderTables(view.tables, language === "fr" ? translateLiveTables(payload.tables ?? []) : (payload.tables ?? []), dict);
    renderSitemapMap(view.map, payload.sitemapMap, language);
    view.note.textContent = dict.tables.serverNote({
      at: new Date().toLocaleTimeString(language === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" }),
      seconds: typeof payload.durationMs === "number" ? (payload.durationMs / 1000).toFixed(1) : undefined,
    });
  } catch {
    if (requestId !== generation) return;
    renderTables(view.tables, sampleTables(dict), dict);
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
  if (target) document.getElementById(target)?.scrollIntoView();
}
window.addEventListener("hashchange", followLegacyAnchor);
followLegacyAnchor();
