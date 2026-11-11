/** Five-stage customer journey UI shared by the anonymous read and the tenant console.
 * No paid engines, storage, remote write, or claims of observed prompt demand. */
import { buildJourneyPreview } from "./customer-journey-model.js";
import { rankRecommendations, explainRecommendation } from "./public-read-model.js";

const WORDS = {
  fr: {
    eyebrow: "PARCOURS DE VOS CLIENTS", title: "Les questions que vos clients pourraient poser",
    intro: "Cinq étapes, de la découverte à la décision. Les questions ci-dessous sont des hypothèses modifiables, jamais des requêtes observées dans Google ou les assistants IA.",
    adjust: "Préciser mon audience et mon objectif (facultatif)", audience: "À qui vendez-vous ?",
    goal: "Quel résultat cherchez-vous ?", update: "Adapter les questions",
    hypothetical: "Hypothèse générée · non mesurée", provided: "Votre formulation · non mesurée",
    mind: "Intention", alternative: "Choisir une autre question", edit: "Modifier cette question",
    discard: "Écarter", restore: "Conserver", discarded: "Question écartée de votre plan",
    matched: "Titre de page observé pouvant correspondre (couverture non vérifiée)",
    unknown: "Correspondance avec les titres de la page non vérifiée",
    missing: "Aucun H1/H2 dans le HTML observé ; contenu non vérifié",
    measured: "Contrôles techniques concernés", copy: "Copier mon plan gratuit",
    copied: "Plan copié. À relire avant toute modification.", copyError: "Copie impossible : vérifiez les droits du navigateur.",
    save: "Suivre cette question dans mon espace", saved: "Question ajoutée aux prompts suivis.", saveError: "Impossible d'ajouter cette question : ",
    cta: "Suivre mes progrès dans mon espace", note: "Le rapprochement des titres reste exploratoire ; les recommandations techniques sont fondées sur le diagnostic affiché.",
    checks: "Premières corrections observées", noChecks: "Aucune correction technique issue des contrôles n'est disponible.",
  },
  en: {
    eyebrow: "YOUR CUSTOMERS' JOURNEY", title: "Questions your future customers might ask",
    intro: "Five stages, from discovery to decision. Questions below are editable hypotheses, never observed Google searches or real prompts sent to AI assistants.",
    adjust: "Specify my audience and goal (optional)", audience: "Who are you selling to?",
    goal: "What result are you looking for?", update: "Adapt the questions",
    hypothetical: "Generated hypothesis · not measured", provided: "Your wording · not measured",
    mind: "Intent", alternative: "Choose another question", edit: "Edit this question",
    discard: "Discard", restore: "Keep", discarded: "Question removed from your plan",
    matched: "Observed heading that may match (coverage unverified)",
    unknown: "Heading match on this page has not been verified",
    missing: "No H1/H2 in observed HTML; content coverage unverified",
    measured: "Related technical checks", copy: "Copy my free action plan",
    copied: "Plan copied. Review before making changes.", copyError: "Could not copy: check browser permissions.",
    save: "Track this question in my workspace", saved: "Question added to tracked prompts.", saveError: "Could not add this question: ",
    cta: "Track progress in my workspace", note: "Heading matches are exploratory; technical fixes come only from the observed diagnostic.",
    checks: "First observed technical fixes", noChecks: "No evidence-backed technical fixes are available.",
  },
};
function el(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function line(value) { return String(value || "").replace(/[\r\n]+/g, " ").trim(); }

export function makeJourneyPlanMarkdown(journey, states, opportunities, language) {
  const lang = language === "en" ? "en" : "fr";
  const w = WORDS[lang];
  const lines = [
    "# " + w.title, "",
    "URL: " + journey.url, "Language: " + lang,
    "Audience: " + (journey.audience || "—"), "Goal: " + (journey.goal || "—"),
    "", "> " + journey.limitation, "",
  ];
  for (let i = 0; i < journey.stages.length; i++) {
    const stage = journey.stages[i];
    const selected = states.get(stage.id) || { index: 0, custom: "", enabled: true };
    if (!selected.enabled) continue;
    const prompt = line(selected.custom || stage.prompts[selected.index]?.text || stage.prompts[0].text);
    if (!prompt) continue;
    lines.push("## " + (i + 1) + ". " + stage.title, "", "- " + w.mind + ": " + stage.mindset,
      "- " + (selected.custom ? w.provided : w.hypothetical) + ": " + prompt,
      "- Target URL: " + journey.url,
      "- " + (stage.heading ? w.matched + ": " + stage.heading.level + " " + stage.heading.text : w.unknown), "");
  }
  lines.push("## " + w.checks, "");
  const fixes = rankRecommendations(opportunities || [], "quick", 3);
  if (!fixes.length) lines.push(w.noChecks);
  for (const fix of fixes) {
    const info = explainRecommendation(fix, lang);
    lines.push("- " + info.title + " (" + fix.checkId + "): " + info.steps,
      "  - " + info.effect + "; " + w.measured + ": " + line(fix.evidence));
  }
  lines.push("", w.note, "");
  return lines.join("\n");
}

/** @param {{data:object,language?:string,mode?:string,savePrompt?:(prompt:object)=>Promise<unknown>}} options */
export function renderJourneyPreview({ data, language = "fr", mode = "public", savePrompt } = {}) {
  const lang = language === "en" ? "en" : "fr";
  const w = WORDS[lang];
  const panel = el("section", mode === "workspace" ? "app-strip journey-panel journey-workspace" : "public-panel journey-panel");
  panel.id = mode === "workspace" ? "journey-workspace" : "public-journey-preview";
  panel.append(el("p", "public-eyebrow", w.eyebrow), el("h2", "", w.title), el("p", "public-description", w.intro));
  let audience = "";
  let goal = "";
  let journey = buildJourneyPreview({ ...data, language: lang, audience, goal });
  let states = new Map();
  const init = () => {
    states = new Map(journey.stages.map((stage) => [stage.id, { index: 0, custom: "", enabled: true }]));
  };
  init();
  const status = el("p", "public-micro journey-status"); status.setAttribute("role", "status");
  const form = el("form", "journey-context");
  const settings = el("details");
  settings.append(el("summary", "", w.adjust));
  const fields = el("div", "journey-context-fields");
  const audienceLabel = el("label", "", w.audience);
  const audienceInput = el("input"); audienceInput.type = "text"; audienceInput.maxLength = 100;
  audienceLabel.append(audienceInput);
  const goalLabel = el("label", "", w.goal);
  const goalInput = el("input"); goalInput.type = "text"; goalInput.maxLength = 100;
  goalLabel.append(goalInput);
  const update = el("button", "public-rank-mode", w.update); update.type = "submit";
  fields.append(audienceLabel, goalLabel, update);
  settings.append(fields); form.append(settings);
  panel.append(form);
  const list = el("ol", "journey-stages");
  panel.append(list);
  const actions = el("div", "journey-actions");
  const copy = el("button", "public-recommend-button", w.copy); copy.type = "button";
  copy.onclick = async () => {
    const markdown = makeJourneyPlanMarkdown(journey, states, data?.opportunities || [], lang);
    try { await navigator.clipboard.writeText(markdown); status.textContent = w.copied; }
    catch { status.textContent = w.copyError; }
  };
  actions.append(copy);
  if (mode === "public") {
    const link = el("a", "public-action-cta", w.cta);
    link.href = "#c-login-form"; actions.append(link);
  }
  panel.append(actions, status, el("p", "public-micro", w.note));

  function draw() {
    list.replaceChildren();
    journey.stages.forEach((stage, index) => {
      const state = states.get(stage.id);
      const item = el("li", "journey-stage" + (state.enabled ? "" : " journey-stage-discarded"));
      const heading = el("div", "journey-stage-head");
      const sourceBadge = el("span", "public-pill", state.custom ? w.provided : w.hypothetical);
      heading.append(el("strong", "journey-stage-number", String(index + 1)),
        el("h3", "", stage.title), sourceBadge);
      item.append(heading, el("p", "journey-mindset", stage.mindset));
      if (stage.prompts.length > 1) {
        const label = el("label", "journey-question-label", w.alternative);
        const select = el("select");
        for (const [i, value] of stage.prompts.entries()) {
          const option = el("option", "", value.text); option.value = String(i); option.selected = i === state.index; select.append(option);
        }
        select.onchange = () => { state.index = Number(select.value); state.custom = ""; draw(); };
        label.append(select); item.append(label);
      }
      const editLabel = el("label", "journey-question-label", w.edit);
      const edit = el("input");
      edit.type = "text"; edit.maxLength = 240;
      edit.value = state.custom || stage.prompts[state.index]?.text || stage.prompts[0].text;
      edit.disabled = !state.enabled;
      edit.oninput = () => {
        const value = edit.value.trim().slice(0, 240);
        state.custom = value === stage.prompts[state.index]?.text ? "" : value;
        sourceBadge.textContent = state.custom ? w.provided : w.hypothetical;
      };
      editLabel.append(edit); item.append(editLabel);
      const coverage = el("p", "journey-evidence",
        stage.heading ? w.matched + " : " + stage.heading.level + " — " + stage.heading.text
          : stage.coverage === "no-headings-observed" ? w.missing : w.unknown);
      item.append(coverage);
      if (stage.observedControls.length) item.append(el("p", "journey-evidence", w.measured + " : " + stage.observedControls.join(", ")));
      const buttons = el("div", "journey-card-actions");
      const toggle = el("button", "public-rank-mode", state.enabled ? w.discard : w.restore);
      toggle.type = "button";
      toggle.setAttribute("aria-pressed", String(!state.enabled));
      toggle.onclick = () => { state.enabled = !state.enabled; draw(); };
      buttons.append(toggle);
      if (typeof savePrompt === "function" && state.enabled) {
        const save = el("button", "public-rank-mode", w.save); save.type = "button";
        save.onclick = async () => {
          const prompt = line(edit.value).slice(0, 240);
          if (!prompt) return;
          save.disabled = true;
          try {
            await savePrompt({
              prompt, group: stage.id,
              sourceKind: prompt === stage.prompts[state.index]?.text ? "inferred" : "provided:user",
              sourceRef: "gtm-journey-template:" + journey.version,
              targetUrl: journey.url, locale: lang,
            });
            status.textContent = w.saved;
          } catch (error) { status.textContent = w.saveError + String(error?.message || error); }
          finally { save.disabled = false; }
        };
        buttons.append(save);
      }
      item.append(buttons);
      if (!state.enabled) item.append(el("p", "journey-evidence", w.discarded));
      list.append(item);
    });
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    audience = line(audienceInput.value).slice(0, 100);
    goal = line(goalInput.value).slice(0, 100);
    journey = buildJourneyPreview({ ...data, language: lang, audience, goal });
    init(); draw(); status.textContent = "";
  };
  draw();
  return panel;
}
