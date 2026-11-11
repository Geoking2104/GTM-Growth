import { el } from "./render.js";
import { LANG } from "./i18n.js";
import { buildLocalPlan, localSchema, localPlanMarkdown, normaliseLocalProfile } from "./local-seo-model.js";

const L = (fr, en) => LANG === "en" ? en : fr;
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function renderLocalSeoWorkspace({ state }) {
  const panel = el("section", "app-strip journey-workspace");
  panel.append(el("h3", "", L("SEO local — mon établissement", "Local SEO — my business")),
    el("p", "c-note", L("Préparez vos informations de référence et comparez les citations que vous renseignez. Travail dans cet onglet uniquement : exportez le dossier JSON avant de quitter pour le réimporter ensuite.", "Prepare reference information and compare citations you enter. Work stays in this view only: export the JSON dossier before leaving and import it later.")));
  const form = el("form", "journey-context");
  const fields = el("div", "journey-context-fields");
  const inputs = {};
  const field = (key, fr, en, value = "", target = fields) => {
    const label = el("label", "journey-question-label", L(fr, en));
    const input = el("input"); input.type = "text"; input.maxLength = ["website", "gbp", "url"].includes(key) ? 2048 : 200; input.value = value;
    label.append(input); target.append(label); return input;
  };
  for (const [key, fr, en] of [
    ["name", "Nom commercial", "Business name"], ["phone", "Téléphone (format international conseillé)", "Phone (international format recommended)"],
    ["website", "URL de la page locale", "Local page URL"], ["service", "Service principal", "Main service"],
    ["area", "Zone desservie", "Service area"], ["street", "Rue publique", "Public street address"],
    ["postalCode", "Code postal", "Postal code"], ["city", "Ville", "City"], ["country", "Pays (code ISO, ex. FR)", "Country (ISO code, e.g. FR)"],
    ["gbp", "Lien Google Business Profile", "Google Business Profile link"],
  ]) inputs[key] = field(key, fr, en, key === "website" ? state.url || "" : "");
  const publicLabel = el("label", "journey-question-label");
  const publicAddress = el("input"); publicAddress.type = "checkbox";
  publicLabel.append(publicAddress, document.createTextNode(L(" Cette adresse accueille le public et peut être publiée", " This address receives customers and may be published")));
  form.append(fields, publicLabel, el("h4", "", L("Citations déclarées (20 maximum)", "Declared citations (maximum 20)")),
    el("p", "c-note", L("Adresse à comparer : rue, code postal, ville, pays. Une différence signifie « à vérifier ». Aucun annuaire n’est interrogé.", "Address format: street, postal code, city, country. A difference means ‘review’. No directory is queried.")));
  const rows = el("div"); const citations = [];
  const add = el("button", "btn btn-small", L("Ajouter une citation", "Add a citation")); add.type = "button";
  function addRow(value = {}) {
    if (citations.length >= 20) return;
    const row = el("fieldset", "journey-context-fields"); row.append(el("legend", "", L("Citation déclarée", "Declared citation")));
    const entry = {};
    for (const [key, fr, en] of [["directory", "Annuaire", "Directory"], ["url", "URL de la fiche", "Listing URL"], ["name", "Nom affiché", "Listed name"], ["address", "Adresse affichée", "Listed address"], ["phone", "Téléphone affiché", "Listed phone"]]) entry[key] = field(key, fr, en, typeof value[key] === "string" ? value[key] : "", row);
    const remove = el("button", "btn btn-small", L("Supprimer", "Remove")); remove.type = "button";
    remove.onclick = () => { citations.splice(citations.indexOf(entry), 1); row.remove(); add.disabled = false; invalidate(); };
    row.append(remove); citations.push(entry); rows.append(row); add.disabled = citations.length >= 20;
  }
  const collect = () => ({ profile: { ...Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value])), publicAddress: publicAddress.checked }, citations: citations.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value]))) });
  const output = el("div"); const status = el("p", "c-note"); status.setAttribute("role", "status");
  const invalidate = () => output.replaceChildren();
  form.addEventListener("input", invalidate);
  add.onclick = () => { addRow(); invalidate(); };
  const run = el("button", "btn btn-small", L("Préparer le diagnostic", "Prepare assessment")); run.type = "submit";
  form.append(rows, add, run);
  form.onsubmit = e => {
    e.preventDefault();
    const plan = buildLocalPlan(collect(), LANG); output.replaceChildren(el("p", "c-note", plan.limitation));
    const labels = { declared: L("Déclaré", "Declared"), missing: L("À compléter", "Missing"), match: L("Identique après normalisation", "Match after normalisation"), review: L("À vérifier", "Review"), unknown: L("Inconnu", "Unknown"), "not-applicable": L("Non applicable", "Not applicable") };
    const list = el("ul"); for (const c of plan.checks) list.append(el("li", "", labels[c.status] + " — " + c.action)); output.append(list);
    for (const c of plan.citations) output.append(el("p", "c-note", `${c.directory || L("Annuaire sans nom", "Unnamed directory")} — ${L("Nom", "Name")}: ${labels[c.comparison.name]} · ${L("Téléphone", "Phone")}: ${labels[c.comparison.phone]} · ${L("Adresse", "Address")}: ${labels[c.comparison.address]}`));
    output.append(el("h4", "", L("Hypothèses de requêtes — volumes non mesurés", "Query hypotheses — volumes not measured")), el("p", "c-note", plan.queries.join(" · ") || L("Renseignez un service et une zone ou une ville.", "Enter a service and an area or city.")));
    const actions = el("ul"); for (const a of plan.actions) actions.append(el("li", "", a)); output.append(actions);
    const report = el("button", "btn btn-small", L("Exporter le plan (.md)", "Export plan (.md)")); report.type = "button";
    report.onclick = () => download("local-seo-plan.md", localPlanMarkdown(plan, LANG), "text/markdown;charset=utf-8"); output.append(report);
    const schema = localSchema(plan.profile);
    if (schema) {
      output.append(el("p", "c-note", L("JSON-LD à relire avant publication ; il doit correspondre au contenu visible de votre page.", "Review JSON-LD before publishing; it must match the visible page content.")));
      const schemaButton = el("button", "btn btn-small", L("Exporter LocalBusiness (.json)", "Export LocalBusiness (.json)")); schemaButton.type = "button";
      schemaButton.onclick = () => download("local-business.json", JSON.stringify(schema, null, 2).replace(/</g, "\\u003c"), "application/ld+json"); output.append(schemaButton);
    } else output.append(el("p", "c-note", L("Export LocalBusiness indisponible : nom, URL et adresse publique complète nécessaires. Aucune adresse privée n’est publiée.", "LocalBusiness export unavailable: name, URL and full public address required. Private addresses are not published.")));
    status.textContent = L("Diagnostic préparé à partir de vos déclarations.", "Assessment prepared from your declarations.");
  };
  const save = el("button", "btn btn-small", L("Exporter le dossier JSON", "Export JSON dossier")); save.type = "button";
  save.onclick = () => download("local-seo-dossier.json", JSON.stringify({ version: 1, ...collect() }, null, 2), "application/json");
  const importLabel = el("label", "journey-question-label", L("Réimporter un dossier JSON (100 Ko maximum)", "Import a JSON dossier (maximum 100 KB)"));
  const file = el("input"); file.type = "file"; file.accept = ".json,application/json";
  file.onchange = async () => {
    try {
      const selected = file.files?.[0]; if (!selected) return;
      if (selected.size > 100000) throw new Error();
      const data = JSON.parse(await selected.text());
      if (!data || data.version !== 1 || !data.profile || typeof data.profile !== "object" || Array.isArray(data.profile) || !Array.isArray(data.citations) || data.citations.length > 20) throw new Error();
      const p = normaliseLocalProfile(data.profile);
      for (const [key, input] of Object.entries(inputs)) input.value = p[key]; publicAddress.checked = p.publicAddress;
      rows.replaceChildren(); citations.length = 0; add.disabled = false;
      const plan = buildLocalPlan(data, LANG); plan.citations.forEach(addRow); invalidate();
      status.textContent = L("Dossier importé. Relancez le diagnostic.", "Dossier imported. Run the assessment again.");
    } catch { status.textContent = L("Dossier invalide ou trop volumineux.", "Invalid or oversized dossier."); }
    file.value = "";
  };
  importLabel.append(file);
  panel.append(form, save, importLabel, status, output);
  return panel;
}
