/* Tracking IA natif : visibilité mesurée dans les réponses réelles des moteurs IA.
 * Preuve avant score : chaque score porte son nombre de runs et son mode de collecte.
 * GEO readiness (déterministe) et visibilité mesurée (échantillonnée) ne sont jamais fusionnés. */
import { el, metrics, table } from "./render.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => (LANG === "fr" ? fr : en);
const fmtPct = (n) => (n === null || n === undefined ? "—" : `${n.toLocaleString(LANG === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 })} %`);
const fmtNum = (n) => (n === null || n === undefined ? "—" : n.toLocaleString(LANG === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 }));
const button = (label, cls, callback) => { const node = el("button", cls ?? "btn btn-small", label); node.type = "button"; if (callback) node.onclick = callback; return node; };
const isAdmin = (me) => me?.role === "tenant-admin" || me?.platformAdmin === true;

const MODE_LABELS = {
  "consumer-ui": L("Interface consommateur", "Consumer UI"),
  "api-approximation": L("API (approximation)", "API (approximation)"),
};
const HEALTH_LABELS = {
  ok: L("OK", "OK"), degraded: L("Dégradé", "Degraded"), paused: L("En pause", "Paused"), disabled: L("Désactivé", "Disabled"),
};
const ENGINE_LABELS = {
  chatgpt: "ChatGPT", gemini: "Gemini", "google-ai-mode": L("Google AI Mode", "Google AI Mode"), perplexity: "Perplexity",
  "bing-ai-mode": L("Bing AI Mode", "Bing AI Mode"), claude: "Claude", mistral: "Mistral",
};
const engineName = (id) => ENGINE_LABELS[id] ?? id;

function modeBadge(mode) { return el("span", "app-pill", `${MODE_LABELS[mode] ?? mode}`); }
function healthBadge(health) {
  const node = el("span", `app-pill${health === "paused" || health === "disabled" ? " dashed" : ""}`, `${HEALTH_LABELS[health] ?? health}`);
  if (health === "ok") node.style.borderColor = "var(--ok, #2a9d5c)";
  return node;
}
function sampledWarning() {
  const note = el("p", "c-note", L("Scores échantillonnés sur des runs répétés : une tendance, pas une preuve de causalité. Chaque score affiche son nombre de runs et son mode de collecte.", "Scores are sampled over repeated runs: a trend, not causal proof. Every score shows its run count and collection mode."));
  return note;
}
function sectionIntro() {
  return el("p", "c-note", L("Ce que les IA disent réellement, mesuré sur vos prompts et vos concurrents. Distinct du score GEO readiness, qui mesure la préparation de la page.", "What AIs actually say, measured on your prompts and competitors. Separate from the GEO readiness score, which measures page preparation."));
}

// ---------------------------------------------------------------------------
// Vue marque : métriques par mode, santé, citations
// ---------------------------------------------------------------------------
async function boardView(api, me) {
  const root = el("div");
  root.append(sectionIntro(), sampledWarning());
  const status = await api("/ai-tracker/status");
  const brands = await api("/ai-tracker/brands");
  if (!status.enabled) {
    const off = el("p", "c-error", L("Le tracker IA natif est désactivé sur ce déploiement (AI_TRACKER_ENABLED=false). Contactez l'administrateur de la plateforme.", "The native AI tracker is disabled on this deployment (AI_TRACKER_ENABLED=false). Contact the platform administrator."));
    root.append(off);
  }
  if (!brands.brands?.length) {
    root.append(el("p", "c-note", L("Aucune marque suivie. Créez une marque et vos prompts dans l'onglet Prompts.", "No tracked brand yet. Create a brand and your prompts in the Prompts tab.")));
    return root;
  }
  for (const brand of brands.brands) {
    const card = el("details", "decision-setup");
    card.open = brands.brands.length === 1;
    const summary = el("summary", "", `${brand.name}${brand.active ? "" : L(" (en pause)", " (paused)")}`);
    card.append(summary);
    const data = await api("/ai-tracker/metrics", { brandId: brand.brandId });
    const body = el("div");
    body.append(el("h4", "", L("Visibilité mesurée par mode de collecte", "Measured visibility by collection mode")));
    if (!data.runCount) {
      body.append(el("p", "c-note", L("Aucun run encore collecté pour cette marque. Les runs arrivent avec la cadence quotidienne configurée.", "No run collected yet for this brand. Runs arrive on the configured daily cadence.")));
    } else {
      for (const [mode, series] of Object.entries(data.byMode ?? {})) {
        const block = el("div");
        block.append(modeBadge(mode));
        block.append(metrics([
          [L("Visibilité", "Visibility"), fmtPct(series.visibility.value)],
          [L("Part de voix", "Share of voice"), fmtPct(series.shareOfVoice.value)],
          [L("Sentiment", "Sentiment"), series.sentiment.value === null ? "—" : `${fmtNum(series.sentiment.value)} / 100`],
          [L("Position moyenne", "Average position"), fmtNum(series.position.value)],
          [L("Runs", "Runs"), String(series.visibility.runCount)],
        ]));
        body.append(block);
      }
      body.append(el("p", "c-note", L(`Fenêtre : ${data.window.from} → ${data.window.to} · ${data.runCount} runs au total. Les séries interface consommateur et API ne sont jamais mélangées.`, `Window: ${data.window.from} → ${data.window.to} · ${data.runCount} runs total. Consumer-UI and API series are never mixed.`)));
    }
    const visibility = await api("/ai-tracker/visibility", { brandId: brand.brandId });
    if (visibility.citations?.length) {
      body.append(el("h4", "", L("Citations principales", "Top citations")));
      body.append(table(visibility.citations.slice(0, 10), [["url", L("URL citée", "Cited URL")], ["domain", L("Domaine", "Domain")], ["citingRuns", L("Runs citants", "Citing runs")]]));
    }
    if (status.engines?.length) {
      body.append(el("h4", "", L("Santé par moteur", "Engine health")));
      const list = el("div", "c-list");
      for (const engine of status.engines) {
        const row = el("p");
        row.append(el("strong", "", engineName(engine.engine)), document.createTextNode(" — "), healthBadge(engine.health));
        if (engine.note) row.append(document.createTextNode(` · ${engine.note.slice(0, 120)}`));
        list.append(row);
      }
      body.append(list);
    }
    card.append(body);
    root.append(card);
  }
  return root;
}

// ---------------------------------------------------------------------------
// Prompts : liste, création (admin), activation
// ---------------------------------------------------------------------------
async function promptsView(api, me) {
  const root = el("div");
  root.append(sampledWarning());
  const brands = await api("/ai-tracker/brands");
  const prompts = await api("/ai-tracker/prompts");
  if (isAdmin(me)) {
    const create = el("form", "c-form");
    const brand = el("select");
    for (const b of brands.brands ?? []) { const option = el("option", "", b.name); option.value = b.brandId; brand.append(option); }
    const text = el("input"); text.placeholder = L("Question acheteur, 500 caractères max", "Buyer question, 500 characters max"); text.maxLength = 500;
    const engines = el("select"); engines.multiple = true; engines.size = 5;
    for (const id of ["chatgpt", "gemini", "google-ai-mode", "perplexity", "bing-ai-mode", "claude", "mistral"]) {
      const option = el("option", "", engineName(id)); option.value = id; engines.append(option);
    }
    const result = el("p", "c-note"); result.setAttribute("role", "status");
    const brandField = el("label", "c-field"); brandField.append(el("span", "", L("Marque", "Brand")), brand);
    const textField = el("label", "c-field"); textField.append(el("span", "", L("Texte du prompt", "Prompt text")), text);
    const enginesField = el("label", "c-field"); enginesField.append(el("span", "", L("Moteurs", "Engines")), engines);
    create.append(brandField, textField, enginesField, button(L("Créer le prompt", "Create prompt"), "btn btn-small"));
    create.onsubmit = async (event) => {
      event.preventDefault();
      result.textContent = L("Création…", "Creating…");
      try {
        const outcome = await api("/ai-tracker/prompt", { brandId: brand.value, promptText: text.value, engines: [...engines.selectedOptions].map(o => o.value) });
        result.textContent = outcome.reused ? L("Ce prompt existe déjà (hash identique).", "This prompt already exists (same hash).") : L("Prompt créé.", "Prompt created.");
        root.replaceWith(await promptsView(api, me));
      } catch (error) { result.textContent = error.message; }
    };
    root.append(create, result);
  }
  const rows = (prompts.prompts ?? []).map(p => ({
    brandId: p.brandId, engineList: p.engines.map(engineName).join(", "), locale: p.locale, status: p.active ? L("Actif", "Active") : L("Inactif", "Inactive"),
    actions: (() => {
      const cell = el("span");
      if (isAdmin(me)) cell.append(button(p.active ? L("Mettre en pause", "Pause") : L("Réactiver", "Resume"), "btn btn-small", async () => {
        await api("/ai-tracker/prompt/set-active", { brandId: p.brandId, promptId: p.promptId, active: !p.active });
        root.replaceWith(await promptsView(api, me));
      }));
      return cell;
    })(),
    promptText: p.promptText, tags: p.tags.join(", "),
  }));
  root.append(el("h4", "", L("Prompts suivis", "Tracked prompts")), table(rows, [["promptText", L("Prompt", "Prompt")], ["engineList", L("Moteurs", "Engines")], ["tags", L("Tags", "Tags")], ["locale", "Locale"], ["status", L("Statut", "Status")], ["actions", ""]]));
  return root;
}

// ---------------------------------------------------------------------------
// Runs : audit de bout en bout, preuve complète
// ---------------------------------------------------------------------------
async function runsView(api, me) {
  const root = el("div");
  root.append(sampledWarning());
  const detail = el("div");
  const list = el("div");
  let nextCursor = null;
  const load = async () => {
    const page = await api("/ai-tracker/runs", { cursor: nextCursor, limit: 25 });
    nextCursor = page.nextCursor;
    const rows = page.runs.map(run => ({
      date: run.runDate, engineLabel: engineName(run.engine), mode: run.collectionMode,
      excerpt: run.rawText.slice(0, 120) + (run.rawText.length > 120 ? "…" : ""),
      actions: (() => {
        const cell = el("span");
        cell.append(button(L("Ouvrir", "Open"), "btn btn-small", async () => {
          detail.replaceChildren();
          const full = await api("/ai-tracker/run", { runId: run.runId });
          const box = el("details", "c-raw"); box.open = true;
          box.append(el("summary", "", L(`Run ${run.runDate} · ${engineName(run.engine)} · ${MODE_LABELS[run.collectionMode] ?? run.collectionMode}`, `Run ${run.runDate} · ${engineName(run.engine)} · ${run.collectionMode}`)));
          const meta = el("p", "c-note", L(`Moteur : ${engineName(run.engine)} · Provider : ${run.provider} · Mode : ${MODE_LABELS[run.collectionMode] ?? run.collectionMode}${run.model ? ` · Modèle : ${run.model}` : ""} · Début : ${run.startedAt} · Fin : ${run.finishedAt}`, `Engine: ${engineName(run.engine)} · Provider: ${run.provider} · Mode: ${run.collectionMode}${run.model ? ` · Model: ${run.model}` : ""} · Started: ${run.startedAt} · Finished: ${run.finishedAt}`));
          box.append(meta);
          const text = el("pre"); text.textContent = full.run.rawText; box.append(el("h4", "", L("Réponse brute complète", "Full raw answer")), text);
          box.append(el("h4", "", L("Jugements", "Judgements")));
          const judgements = el("div", "c-list");
          for (const mention of full.mentions) {
            const line = el("p");
            line.append(el("strong", "", mention.companyId), document.createTextNode(
              mention.status === "error" ? L(" — jugement en erreur (juge indisponible ou JSON invalide)", " — judgement error (judge unavailable or invalid JSON)")
                : mention.counted ? L(` — mentionnée · sentiment ${mention.sentiment ?? "—"} · position ${mention.position ?? "—"}`, ` — mentioned · sentiment ${mention.sentiment ?? "—"} · position ${mention.position ?? "—"}`)
                  : L(" — non mentionnée", " — not mentioned")));
            if (mention.passage) { const quote = el("p", "c-note", `« ${mention.passage} »`); judgements.append(quote); }
            line.append(document.createTextNode(L(` · juge ${mention.judgeVersion}`, ` · judge ${mention.judgeVersion}`)));
            judgements.append(line);
          }
          box.append(judgements);
          if (full.run.citations.length) box.append(el("h4", "", L("Citations", "Citations")), table(full.run.citations.map(c => ({ url: c.url })), [["url", L("URL", "URL")]]));
          if (full.run.fanOut.length) { const fan = el("ul", "c-list"); for (const query of full.run.fanOut) fan.append(el("li", "", query)); box.append(el("h4", "", L("Recherches lancées par le moteur (fan-out)", "Searches launched by the engine (fan-out)")), fan); }
          detail.append(box);
        }));
        return cell;
      })(),
    }));
    list.replaceChildren(el("h4", "", L("Runs collectés", "Collected runs")), table(rows, [["date", L("Date", "Date")], ["engineLabel", L("Moteur", "Engine")], ["mode", L("Mode", "Mode")], ["excerpt", L("Extrait", "Excerpt")], ["actions", ""]]));
    more.hidden = !nextCursor;
  };
  const more = button(L("Charger plus", "Load more"), "btn btn-small", load);
  root.append(list, more, detail);
  await load();
  return root;
}

// ---------------------------------------------------------------------------
// Opportunités : règles lisibles, brouillon après validation humaine
// ---------------------------------------------------------------------------
async function opportunitiesView(api, me) {
  const root = el("div");
  root.append(el("p", "c-note", L("Une opportunité n'est jamais générée à partir d'un seul run. Le brouillon passe ensuite par le circuit d'approbation GEO existant.", "An opportunity is never generated from a single run. The draft then flows through the existing GEO approval workflow.")));
  const result = el("p", "c-note"); result.setAttribute("role", "status");
  if (isAdmin(me)) {
    const generate = button(L("Analyser les opportunités", "Scan for opportunities"), "btn btn-small", async () => {
      result.textContent = L("Analyse…", "Scanning…");
      try { const outcome = await api("/ai-tracker/opportunities/generate", {}); result.textContent = L(`${outcome.generated} opportunité(s) mise(s) à jour.`, `${outcome.generated} opportunity(ies) updated.`); root.replaceWith(await opportunitiesView(api, me)); }
      catch (error) { result.textContent = error.message; }
    });
    root.append(generate, result);
  }
  const data = await api("/ai-tracker/opportunities");
  const rows = (data.opportunities ?? []).map(o => ({
    title: o.title, type: o.type, engineLabel: engineName(o.engine), status: o.status, createdAt: o.createdAt.slice(0, 10),
    actions: (() => {
      const cell = el("span");
      if (isAdmin(me) && o.status === "open") cell.append(button(L("Créer un brouillon d'action GEO", "Create GEO action draft"), "btn btn-small", async () => {
        try { await api("/ai-tracker/opportunity/draft", { opportunityId: o.opportunityId, confirmed: true }); root.replaceWith(await opportunitiesView(api, me)); }
        catch (error) { result.textContent = error.message; }
      }), button(L("Écarter", "Dismiss"), "btn btn-small", async () => {
        await api("/ai-tracker/opportunity/set-status", { opportunityId: o.opportunityId, status: "dismissed" });
        root.replaceWith(await opportunitiesView(api, me));
      }));
      return cell;
    })(),
  }));
  root.append(table(rows, [["title", L("Opportunité", "Opportunity")], ["type", L("Type", "Type")], ["engineLabel", L("Moteur", "Engine")], ["status", L("Statut", "Status")], ["createdAt", L("Créée le", "Created")], ["actions", ""]]));
  return root;
}

// ---------------------------------------------------------------------------
// Moteurs : santé et activation des scrapers après disclaimer GTM Growth
// ---------------------------------------------------------------------------
async function enginesView(api, me) {
  const root = el("div");
  const data = await api("/ai-tracker/engine-settings");
  root.append(el("h4", "", L("Santé et activation des moteurs", "Engine health and activation")));
  root.append(el("p", "c-note", L("Les scrapers sont désactivés par défaut. API-first : quand une API officielle est configurée, elle est utilisée en priorité et le run est labellisé api-approximation.", "Scrapers are disabled by default. API-first: when an official API is configured, it is used first and the run is labelled api-approximation.")));
  for (const engine of data.engines ?? []) {
    const card = el("details", "decision-setup");
    card.append(el("summary", "", `${engineName(engine.engine)}${engine.scraperEnabled ? L(" · scraper activé", " · scraper enabled") : ""}`));
    const body = el("div");
    body.append(healthBadge(engine.health));
    if (engine.note) body.append(el("p", "c-note", engine.note));
    if (engine.consecutiveFailures > 0) body.append(el("p", "c-note", L(`Échecs consécutifs : ${engine.consecutiveFailures}. Pause automatique à 2.`, `Consecutive failures: ${engine.consecutiveFailures}. Automatic pause at 2.`)));
    if (engine.scraperEnabled) body.append(el("p", "c-note", L(`Scraper activé par ${engine.acceptedBy || "admin"}, acceptation du disclaimer le ${engine.disclaimerAcceptedAt.slice(0, 10)}.`, `Scraper enabled by ${engine.acceptedBy || "admin"}, disclaimer accepted on ${engine.disclaimerAcceptedAt.slice(0, 10)}.`)));
    if (isAdmin(me)) {
      const result = el("p", "c-note"); result.setAttribute("role", "status");
      if (!engine.scraperEnabled) {
        const disclaimer = el("p", "c-note", data.disclaimer);
        const accept = el("label", "c-field");
        const checkbox = el("input"); checkbox.type = "checkbox";
        accept.append(checkbox, document.createTextNode(L(" J'ai lu et j'accepte le disclaimer GTM Growth", " I have read and accept the GTM Growth disclaimer")));
        const enable = button(L("Activer le scraper", "Enable scraper"), "btn btn-small", async () => {
          if (!checkbox.checked) { result.textContent = L("Cochez l'acceptation du disclaimer avant d'activer.", "Tick the disclaimer acceptance before enabling."); return; }
          try { await api("/ai-tracker/engine/activate", { engine: engine.engine, enable: true, disclaimerAccepted: true, disclaimerVersion: data.disclaimerVersion }); root.replaceWith(await enginesView(api, me)); }
          catch (error) { result.textContent = error.message; }
        });
        body.append(disclaimer, accept, enable, result);
      } else {
        body.append(button(L("Désactiver le scraper", "Disable scraper"), "btn btn-small", async () => {
          try { await api("/ai-tracker/engine/activate", { engine: engine.engine, enable: false }); root.replaceWith(await enginesView(api, me)); }
          catch (error) { result.textContent = error.message; }
        }), result);
      }
    }
    card.append(body);
    root.append(card);
  }
  return root;
}

// ---------------------------------------------------------------------------

export async function renderAiTracker({ api, me, tab = "board" }) {
  const root = el("div");
  try {
    if (tab === "prompts") root.append(await promptsView(api, me));
    else if (tab === "runs") root.append(await runsView(api, me));
    else if (tab === "opportunities") root.append(await opportunitiesView(api, me));
    else if (tab === "engines") root.append(await enginesView(api, me));
    else root.append(await boardView(api, me));
  } catch (error) {
    root.append(el("p", "c-error", error.message));
  }
  return root;
}
