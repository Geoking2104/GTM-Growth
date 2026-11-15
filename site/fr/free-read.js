/** French landing: the same honest two-stage free read as the English page. */
import { auditUrlShape, normalizeTarget, verdict } from "../preview.js";
import { dictFor } from "../i18n.js";
import { renderTables, sampleTables } from "../tables.js";
import { translateLiveTables } from "./server-tables.js";

const dict = dictFor("fr");
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
  const title = element("h2", "", `Première lecture de ${report.host}`);
  title.tabIndex = -1;
  const verdictText = element("p", "", `${verdict(report.score, dict)} ${dict.summary(report.passed, report.total)}`);
  const score = element("p", "gg-score", `Hygiène de l’URL : ${report.score}/100`);
  const explanation = element("p", "gg-note", "Ces 10 contrôles vérifient seulement l’adresse saisie, pas le contenu de votre site. La lecture serveur, lorsqu’elle est disponible, mesure les signaux GEO réels.");
  const heading = element("h3", "", "Contrôles de l’adresse");
  const apiHeading = element("h3", "", "Données SEO, GA4 et Search Console");
  const note = element("p", "gg-note", dict.tables.loading);
  note.setAttribute("role", "status");
  note.dataset.resultNote = "";
  const tables = element("div", "gg-data");
  tables.dataset.resultTables = "";
  const next = element("a", "gg-next", "Ouvrir la console complète →");
  next.href = "/console/?lang=fr#overview";

  result.replaceChildren(title, verdictText, score, explanation, heading, renderChecks(report), apiHeading, note, tables, next);
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
  title.focus({ preventScroll: true });
  return { title, score, verdictText, note, tables };
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
      view.score.textContent = `Score GEO mesuré : ${payload.score}/100`;
      const projected = typeof payload.projectedScore === "number" ? ` · Potentiel après correctifs : ${payload.projectedScore}/100` : "";
      view.verdictText.textContent = `Audit de la page ${host}${projected}. Ce score ne concerne pas tout le domaine.`;
    }
    renderTables(view.tables, translateLiveTables(payload.tables ?? []), dict);
    view.note.textContent = dict.tables.serverNote({
      at: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      seconds: typeof payload.durationMs === "number" ? (payload.durationMs / 1000).toFixed(1) : undefined,
    });
  } catch {
    if (requestId !== generation) return;
    renderTables(view.tables, sampleTables(dict), dict);
    view.note.textContent = "Lecture serveur momentanément indisponible. Les tableaux ci-dessous sont des EXEMPLES, pas des mesures de votre site.";
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
