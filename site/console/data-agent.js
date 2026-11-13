import { el } from "./render.js";

/** Always accessible, but no data query or external action runs merely by navigating. */
export function createDataAgent({ api, language = "en", workspaceName = "" }) {
  const L = (fr, en) => language === "fr" ? fr : en;
  const root = el("details", "c-data-agent");
  const summary = el("summary", "", L("Assistant données · mes objectifs, ma prochaine action", "Data assistant · my goals, my next action"));
  const body = el("div", "c-agent-body"); root.append(summary, body);
  let section = "overview", loaded = false, profile = null, context = null, epoch = 0;
  const labels = {
    workspace: L("Quelles sources sont configurées ?", "Which sources are configured?"),
    search: L("Combien de clics organiques ?", "How many organic clicks?"),
    analytics: L("Combien de sessions et d'événements clés ?", "How many sessions and key events?"),
    visibility: L("Quelles mentions IA sont validées ?", "Which AI mentions are confirmed?"),
    operations: L("Où en sont mes opérations ?", "What is my operations status?"),
  };
  const preferred = () => section === "gsc" || section === "search" ? "search" : section === "ga4" ? "analytics" : ["ai_visibility", "competition"].includes(section) ? "visibility" : section === "ops" ? "operations" : profile?.goal === "ai-visibility" ? "visibility" : ["leads", "sales"].includes(profile?.goal) ? "analytics" : "workspace";
  function select(label, values, value, onChange) {
    const wrapper = el("label", "c-field"); wrapper.append(el("span", "", label)); const input = el("select");
    for (const [key, text] of values) { const opt = el("option", "", text); opt.value = key; input.append(opt); }
    input.value = value; input.onchange = () => onChange(input.value); wrapper.append(input); return wrapper;
  }
  const button = (text, fn) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = fn; return b; };
  function draw() {
    const own = epoch; body.replaceChildren();
    body.append(el("p", "c-note", `${workspaceName} · ${L("Réponses guidées sans frais de modèle. Vos choix personnels adaptent les raccourcis sans modifier vos droits.", "Guided answers without model fees. Your personal choices tailor shortcuts without changing your permissions.")}`));
    const actions = el("div", "c-agent-actions");
    for (const a of context.actions || []) { const link = el("a", "app-pill", a.title); link.href = a.href; link.title = a.reason; actions.append(link); }
    body.append(actions);
    const settings = el("details", "c-agent-profile"); settings.append(el("summary", "", L("Mon rôle, mon audience et mes objectifs", "My role, audience and goals")));
    const form = el("form", "c-agent-grid");
    form.append(select(L("Rôle métier", "Business role"), [["owner", L("Dirigeant", "Owner")], ["marketer", "Marketing"], ["agency", L("Agence", "Agency")], ["technical", L("Technique", "Technical")]], profile.role, v => { profile.role = v; }),
      select(L("Objectif", "Goal"), [["traffic", L("Trafic", "Traffic")], ["leads", L("Prospects", "Leads")], ["sales", L("Ventes", "Sales")], ["ai-visibility", L("Visibilité IA", "AI visibility")], ["local", L("Visibilité locale", "Local visibility")]], profile.goal, v => { profile.goal = v; }),
      select(L("Étape d'utilisation de GTM", "GTM lifecycle stage"), [["discover", L("Découverte", "Discovery")], ["activate", L("Activation", "Activation")], ["grow", L("Croissance", "Growth")], ["retain", L("Suivi et fidélisation", "Retention")], ["expand", L("Développement", "Expansion")]], profile.stage, v => { profile.stage = v; }));
    const audienceLabel = el("label", "c-field"); audienceLabel.append(el("span", "", L("Audience cible", "Target audience")));
    const audience = el("input"); audience.maxLength = 200; audience.value = profile.audience; audience.oninput = () => { profile.audience = audience.value; }; audienceLabel.append(audience); form.append(audienceLabel);
    let targetMetric = profile.target?.metric || "clicks";
    form.append(select(L("Mesure cible sur 28 jours", "Target metric over 28 days"), [["clicks", L("Clics organiques", "Organic clicks")], ["sessions", "Sessions"], ["keyEvents", L("Événements clés", "Key events")]], targetMetric, v => { targetMetric = v; }));
    const targetLabel = el("label", "c-field"); targetLabel.append(el("span", "", L("Cible souhaitée (facultatif)", "Desired target (optional)")));
    const target = el("input"); target.type = "number"; target.min = "1"; target.max = "1000000000000"; target.step = "any"; target.value = profile.target?.value ?? ""; targetLabel.append(target); form.append(targetLabel);
    const save = el("button", "btn btn-small", L("Enregistrer mes préférences", "Save my preferences")); save.type = "submit";
    const status = el("p", "c-note"); status.setAttribute("role", "status"); form.append(save, status);
    form.onsubmit = async e => {
      e.preventDefault(); save.disabled = true;
      const targetValue = target.value.trim() ? Number(target.value) : null;
      if (targetValue !== null && (!Number.isFinite(targetValue) || targetValue <= 0 || targetValue > 1e12)) { status.textContent = L("Saisissez une cible positive valide.", "Enter a valid positive target."); save.disabled = false; return; }
      try {
        await api("/data-agent/profile", { ...profile, target: targetValue === null ? null : { metric: targetMetric, value: targetValue } });
        if (epoch !== own) return;
        await load();
      } catch { status.textContent = L("Enregistrement impossible. Réessayez.", "Could not save. Please retry."); }
      finally { save.disabled = false; }
    };
    settings.append(form); body.append(settings);
    const query = el("form", "c-agent-grid"); let model = preferred(), days = 28;
    query.append(select(L("Ma question", "My question"), Object.entries(labels), model, v => { model = v; }),
      select(L("Période Google (jours)", "Google period (days)"), [["7", "7"], ["28", "28"], ["90", "90"]], "28", v => { days = Number(v); }));
    const ask = el("button", "btn btn-small", L("Lire les données", "Read the data")); ask.type = "submit"; query.append(ask);
    const output = el("div", "c-agent-answer"); output.setAttribute("aria-live", "polite");
    async function run(source) {
      ask.disabled = true; output.replaceChildren(el("p", "c-note", L("Lecture en cours…", "Reading…")));
      const requestedModel = model, requestedDays = days;
      try {
        const answer = await api("/data-agent/query", { model: requestedModel, days: requestedDays, locale: language, ...(source ? { source } : {}) });
        if (epoch !== own) return;
        output.replaceChildren(el("p", "", answer.summary));
        if (answer.state === "choose-source") {
          for (const value of answer.sources || []) output.append(button(value, () => run(value)));
          return;
        }
        const table = el("table", "c-table"); const tbody = el("tbody");
        for (const m of answer.metrics || []) { const row = el("tr"); row.append(el("th", "", m.label), el("td", "", m.value === null ? "—" : `${Number(m.value).toLocaleString(language)}${m.unit === "percent" ? " %" : ""}`)); tbody.append(row); }
        if (tbody.children.length) { table.append(tbody); output.append(table); }
        output.append(el("p", "c-note", `${answer.source || "GTM Growth"}${answer.period ? ` · ${answer.period.start} → ${answer.period.end}` : ""}`));
        if (answer.readAt) output.append(el("p", "c-note", `${L("Lu à", "Read at")} ${answer.readAt}`));
        const m = (answer.metrics || []).find(v => v.id === profile.target?.metric);
        if (requestedDays === 28 && answer.state === "ready" && m?.value !== null && m?.value !== undefined && profile.target) output.append(el("p", "", `${L("Mesure / cible personnelle sur 28 jours", "Measurement / personal 28-day target")} : ${m.value} / ${profile.target.value}`));
        for (const note of answer.caveats || []) output.append(el("p", "c-note", note));
        if (/^#[a-z_]+(?:\/[a-z-]+)?$/.test(answer.href || "")) { const link = el("a", "app-pill", L("Ouvrir l'analyse et ses sources", "Open the analysis and its sources")); link.href = answer.href; output.append(link); }
      } catch { if (epoch === own) output.replaceChildren(el("p", "c-error", L("Données indisponibles. Réessayez ou vérifiez les accès dans Tracking.", "Data unavailable. Retry or check access in Tracking."))); }
      finally { ask.disabled = false; }
    }
    query.onsubmit = e => { e.preventDefault(); void run(); }; body.append(query, output);
    const slack = el("details", "c-agent-slack"); slack.append(el("summary", "", L("Continuer dans Slack", "Continue in Slack")));
    slack.append(el("p", "c-note", context.slack === "configured"
      ? L("Une liaison est configurée pour cet espace. Dans un canal autorisé, mentionnez l'agent pour poser une question. L'administrateur doit encore valider la connexion en conditions réelles.", "A binding is configured for this workspace. Mention the agent in an authorized channel to ask a question. An administrator must still verify the live connection.")
      : L("Demandez à votre administrateur de connecter l'agent Eve et d'autoriser l'espace Slack, les canaux et les utilisateurs. Les réponses seront visibles par les membres du canal. Les appels au modèle peuvent être facturés par son fournisseur.", "Ask your administrator to connect the Eve agent and authorize the Slack workspace, channels and users. Channel members can read the replies. Model calls may incur provider charges.")));
    body.append(slack);
  }
  async function load() {
    const own = ++epoch; body.replaceChildren(el("p", "c-note", L("Chargement de vos préférences…", "Loading your preferences…")));
    try {
      const data = await api("/data-agent/context", { locale: language, section });
      if (epoch !== own) return;
      if (!data.profile) throw new Error("No profile");
      context = data; profile = data.profile; loaded = true; draw();
    } catch { if (epoch === own) { loaded = false; body.replaceChildren(el("p", "c-error", L("Assistant indisponible.", "Assistant unavailable.")), button(L("Réessayer", "Retry"), load)); } }
  }
  root.addEventListener("toggle", () => { if (root.open && !loaded) void load(); });
  return { element: root, setSection(value) { if (section !== value) { section = value; loaded = false; epoch++; if (root.open) void load(); } } };
}

/** Public discovery uses the existing scan only. It never accesses customer data. */
export function renderPublicAgent(data, language) {
  const fr = language === "fr", box = el("details", "public-panel c-data-agent");
  box.append(el("summary", "", fr ? "Assistant · comprendre cette lecture" : "Assistant · understand this reading"));
  const questions = [
    [fr ? "Ce score mesure-t-il mes ventes ?" : "Does this score measure sales?", fr ? "Non. Il décrit les signaux techniques observés sur cette page. Il ne mesure ni les ventes ni les citations réelles dans les IA." : "It describes technical signals observed on this page. It measures neither sales nor actual AI citations."],
    [fr ? "Quelle est ma prochaine étape ?" : "What should I do next?", fr ? "Vérifiez les recommandations observées ci-dessous, puis précisez votre audience dans le parcours client. Les questions proposées sont des hypothèses." : "Review the observed recommendations below, then specify your audience in the customer journey. Suggested questions are hypotheses."],
  ];
  for (const [q, a] of questions) { const d = el("details"); d.append(el("summary", "", q), el("p", "", a)); box.append(d); }
  box.append(el("p", "public-micro", `${fr ? "Source : lecture publique d'une page" : "Source: public single-page read"} · ${data.finalUrl || data.url || ""}`));
  const link = el("a", "app-pill", fr ? "Définir mes objectifs dans mon espace" : "Set my goals in my workspace"); link.href = "#c-login-form"; box.append(link); return box;
}
