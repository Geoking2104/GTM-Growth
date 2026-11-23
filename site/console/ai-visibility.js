/* Imported observations: no sample values and no implicit AI provider calls. */
import { renderDataGuide } from "./data-guidance.js";
import { el } from "./render.js";
import { LANG } from "./i18n.js";
import { entityCell, visibilityChart, metricIcon } from "./visuals.js";
import { renderProviderCollection, collectionSummary } from "./ai-provider-collection.js";
import { answerPinKey } from "./decision-flows.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
function renderAnswer(row) {
  const paragraph = el("p"); let offset = 0;
  for (const span of row.citationSpans || []) {
    paragraph.append(document.createTextNode(row.answer.slice(offset, span.start)));
    const link = el("a", "", row.answer.slice(span.start, span.end)); link.href = span.url; link.target = "_blank"; link.rel = "noopener noreferrer"; paragraph.append(link); offset = span.end;
  }
  paragraph.append(document.createTextNode(row.answer.slice(offset))); return paragraph;
}
const fmt = (n) => n === null ? "—" : `${n.toLocaleString(L("fr-FR", "en-GB"), { maximumFractionDigits: 1 })} %`;
const button = (label, callback) => { const node = el("button", "btn btn-small", label); node.type = "button"; node.onclick = callback; return node; };
export function renderAiVisibility({ api, me, initialFilters = {} }) {
  const root = el("section", "ai-vis"); const status = el("p", "c-note"); status.setAttribute("role", "status");
  root.append(el("h2", "", L("Visibilité dans les réponses IA", "Visibility in AI responses")), el("p", "c-note", L("Données importées par votre espace. Les réponses ne sont pas une mesure de toutes les conversations IA. Le score GEO mesure uniquement la préparation du site.", "Observations imported by your workspace. These answers do not measure every AI conversation. The GEO score only measures site readiness.")), status);
  const controls = el("div", "ai-controls"), output = el("div"); root.append(controls, output);
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  let datasets = [], current = initialFilters.datasetId || "", source = initialFilters.source || "", brand = initialFilters.brand || "", request = 0;
  let groupId = initialFilters.groupId || "", from = initialFilters.from || "", to = initialFilters.to || "";
  let focusCitations = initialFilters.focusCitations === true;
  function selectDataset(id) {
    current = id; source = brand = groupId = from = to = "";
  }
  async function list() { status.textContent = L("Chargement…", "Loading…"); try { const result = await api("/ai-visibility/datasets", {}); datasets = result.datasets || []; if (!datasets.some((d) => d.id === current)) selectDataset(datasets.at(-1)?.id || ""); drawControls(); await load(); } catch (error) { if (!controls.childElementCount) drawControls(); status.textContent = ""; output.replaceChildren(renderDataGuide("competition", { error, retry: list })); } }
  function drawControls() {
    controls.replaceChildren(); const label = el("label", "c-field"); label.append(el("span", "", L("Jeu importé", "Imported dataset"))); const select = el("select");
    for (const d of datasets) { const option = el("option", "", `${new Date(d.createdAt).toLocaleString(L("fr-FR", "en-GB"))} · ${d.count} ${L("réponses", "answers")}`); option.value = d.id; select.append(option); }
    select.value = current; select.disabled = !datasets.length; select.onchange = () => { selectDataset(select.value); load(); }; label.append(select); controls.append(label);
    if (!admin) return;
    for (const provider of ["openai", "gemini", "claude", "mistral", "grok"]) controls.append(renderProviderCollection({ provider, api,
      onCollected: async result => { selectDataset(result.id); await list(); status.textContent = collectionSummary(result); },
      onImport: () => { details.open = true; details.scrollIntoView?.({ block: "start", behavior: "smooth" }); input.focus(); },
    }));
    const details = el("details", "ai-import"); details.open = !datasets.length; details.append(el("summary", "", L("Importer des réponses JSON", "Import answers as JSON")));
    details.append(el("p", "c-note", L("Format : brands [{name, aliases, website?, logoUrl?}] et responses [{prompt, answer, source, observedAt, citations?}]. Logos facultatifs : URL HTTPS publique dans logoUrl. Date ISO avec fuseau requis ; 1 à 1 000 réponses par import, limité aussi par la taille maximale de la requête. Les données sont stockées sur le serveur de cet espace.", "Format: brands [{name, aliases, website?, logoUrl?}] and responses [{prompt, answer, source, observedAt, citations?}]. Optional logos: public HTTPS URL in logoUrl. ISO date with timezone required; 1–1,000 answers per import, also subject to request-size limits. Data is stored on this workspace’s server.")));
    const field = el("label", "c-field"); field.append(el("span", "", L("Document JSON", "JSON document"))); const input = el("textarea"); input.rows = 9; input.spellcheck = false; input.placeholder = JSON.stringify({ brands: [{ name: "ExampleBrand", aliases: ["Example Brand"] }], responses: [{ prompt: "Example question?", answer: "ExampleBrand is useful.", source: "manual import", observedAt: "2026-11-01T12:00:00Z", citations: ["https://example.com/"] }] }, null, 2); field.append(input); const feedback = el("p", "c-note"); feedback.setAttribute("role", "status"); let reviewed = "";
    const commit = button(L("Enregistrer l’import", "Save import"), async () => { if (!reviewed || reviewed !== input.value) { feedback.textContent = L("Vérifiez d’abord le document actuel.", "Review the current document first."); return; } commit.disabled = true; try { const result = await api("/ai-visibility/import", JSON.parse(reviewed)); selectDataset(result.id); await list(); } catch (error) { feedback.textContent = error.message; } finally { commit.disabled = false; } }); commit.disabled = true;
    const preview = button(L("Vérifier l’import", "Review import"), async () => { reviewed = ""; commit.disabled = true; try { const result = await api("/ai-visibility/import-preview", JSON.parse(input.value)); reviewed = input.value; feedback.textContent = `${result.count} ${L("réponses", "answers")} · ${result.brands.length} ${L("marques", "brands")} · ${result.sources.join(", ")}`; commit.disabled = false; } catch (error) { feedback.textContent = error.message; } }); input.oninput = () => { reviewed = ""; commit.disabled = true; }; details.append(field, preview, commit, feedback); controls.append(details);
    const tracker = el("details", "ai-import ai-import-tracker");
    tracker.append(el("summary", "", L("Importer un export de tracker", "Import a tracker export")));
    tracker.append(el("p", "c-note", L("Choisissez un profil générique ou fournisseur, puis vérifiez les colonnes reconnues. Les formats fournisseurs peuvent varier. Déclarez les marques suivies et vérifiez la tonalité.", "Choose a generic or provider profile and review the recognised columns. Provider formats can vary. Declare the tracked brands and review sentiment.")));
    const providerField = el("label", "c-field"); providerField.append(el("span", "", L("Tracker", "Tracker"))); const providerSelect = el("select");
    for (const [value, label] of [["generic", L("Générique", "Generic")], ["meteoria", "Meteoria"], ["peec", "Peec AI"], ["qwairy", "Qwairy"], ["profound", "Profound"]]) { const option = el("option", "", label); option.value = value; providerSelect.append(option); }
    providerSelect.value = "generic"; providerField.append(providerSelect);
    const formatField = el("label", "c-field"); formatField.append(el("span", "", L("Format", "Format"))); const formatSelect = el("select");
    for (const [value, label] of [["csv", "CSV"], ["json", "JSON"]]) { const option = el("option", "", label); option.value = value; formatSelect.append(option); }
    formatSelect.value = "csv"; formatField.append(formatSelect);
    const payloadField = el("label", "c-field"); payloadField.append(el("span", "", L("Contenu de l’export", "Export contents"))); const payloadInput = el("textarea"); payloadInput.rows = 9; payloadInput.spellcheck = false; payloadField.append(payloadInput);
    const brandsField = el("label", "c-field"); brandsField.append(el("span", "", L("Marques (JSON)", "Brands (JSON)"))); const brandsInput = el("textarea"); brandsInput.rows = 4; brandsInput.spellcheck = false; brandsInput.placeholder = JSON.stringify([{ name: "ExampleBrand", aliases: ["Example Brand"] }], null, 2); brandsField.append(brandsInput);
    const trackerFeedback = el("p", "c-note");
    trackerFeedback.setAttribute("role", "status");
    let trackerReviewed = null;
    const trackerSignature = () => JSON.stringify([providerSelect.value, formatSelect.value, payloadInput.value, brandsInput.value]);
    const trackerBody = () => ({ provider: providerSelect.value, format: formatSelect.value, payload: payloadInput.value, brands: JSON.parse(brandsInput.value) });
    const trackerCommit = button(L("Enregistrer l’import tracker", "Save tracker import"), async () => {
      const reviewed = trackerReviewed;
      if (!reviewed || reviewed.signature !== trackerSignature()) return;
      trackerCommit.disabled = true;
      try {
        const result = await api("/ai-visibility/import-tracker", { ...trackerBody(), ...(reviewed.digest ? { previewDigest: reviewed.digest } : {}) });
        trackerReviewed = null;
        selectDataset(result.id);
        await list();
        if (result.reused) status.textContent = L("Jeu existant ouvert, sans doublon.", "Existing dataset opened without duplication.");
      } catch (error) {
        trackerFeedback.textContent = error.message;
        trackerCommit.disabled = trackerReviewed?.signature !== trackerSignature();
      }
    });
    trackerCommit.disabled = true;
    const trackerPreview = button(L("Vérifier l’export tracker", "Review tracker export"), async () => {
      trackerReviewed = null;
      trackerCommit.disabled = true;
      const signature = trackerSignature();
      trackerPreview.disabled = true;
      try {
        const result = await api("/ai-visibility/import-tracker-preview", trackerBody());
        if (signature !== trackerSignature()) return;
        trackerReviewed = { signature, digest: result.previewDigest };
        const parts = [`${result.provider} · ${result.format} · ${result.count} ${L("réponses", "answers")}`,
          result.engines?.length ? result.engines.join(", ") : L("moteur inconnu", "unknown engine")];
        const labels = { prompt: L("Question", "Prompt"), answer: L("Réponse", "Answer"), date: L("Date", "Date"), engine: L("Moteur", "Engine"), citations: "Citations",
          model: L("Modèle", "Model"), mode: L("Mode de collecte", "Collection mode"), language: L("Langue", "Language"), market: L("Marché", "Market") };
        for (const [field, columns] of Object.entries(result.mapping || {})) {
          if (columns.length) parts.push(`${labels[field] || field} ← ${columns.join(", ")}`);
        }
        if (result.ignoredColumns?.length) parts.push(`${L("colonnes ignorées", "ignored columns")} · ${result.ignoredColumns.join(", ")}`);
        if (result.normalisedDates) parts.push(`${result.normalisedDates} ${L("dates normalisées", "normalised dates")}`);
        if (result.existingDatasetId) parts.push(L("Ce jeu existe déjà. L’enregistrement rouvre le jeu existant.", "This dataset already exists. Saving opens the existing dataset."));
        parts.push(result.warning);
        trackerFeedback.textContent = parts.filter(Boolean).join(" · ");
        trackerCommit.disabled = false;
      } catch (error) {
        if (signature === trackerSignature()) trackerFeedback.textContent = error.message;
      } finally {
        trackerPreview.disabled = false;
      }
    });
    const trackerReset = () => { trackerReviewed = null; trackerCommit.disabled = true; };
    providerSelect.onchange = trackerReset; formatSelect.onchange = trackerReset; payloadInput.oninput = trackerReset; brandsInput.oninput = trackerReset;
    tracker.append(providerField, formatField, payloadField, brandsField, trackerPreview, trackerCommit, trackerFeedback); controls.append(tracker);
  }
  async function load() {
    const seq = ++request; output.replaceChildren(); if (!current) { status.textContent = ""; output.append(renderDataGuide("competition")); return; }
    status.textContent = L("Chargement…", "Loading…");
    const filters = { datasetId: current, source, brand, ...(groupId ? { groupId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
    try {
      const [report, views, gaps] = await Promise.all([
        api("/ai-visibility/report", filters),
        api("/ai-visibility/share-of-voice", filters).catch(() => null),
        api("/ai-visibility/citation-gaps", filters).catch(() => null),
      ]);
      if (seq !== request) return;
      brand = report.brand;
      render(report, views, gaps);
      status.textContent = "";
    }
    catch (error) { if (seq === request) { status.textContent = ""; output.replaceChildren(renderDataGuide("competition", { error, retry: load })); } }
  }
  function render(data, views, gaps) {
    output.replaceChildren();
    if (!data.total) output.append(renderDataGuide("competition", { reason: L("Aucune réponse dans ce filtre. Choisissez une autre source ou un autre jeu.", "No answers match this filter. Choose another source or dataset.") }));
    const filters = el("div", "ai-filters");
    const select = (label, entries, currentValue, onChange) => { const wrap = el("label", "c-field"); wrap.append(el("span", "", label)); const s = el("select"); for (const [v, name] of entries) { const opt = el("option", "", name); opt.value = v; s.append(opt); } s.value = currentValue; s.onchange = () => onChange(s.value); wrap.append(s); return wrap; };
    filters.append(select(L("Marque", "Brand"), data.brands.map((b) => [b.name, b.name]), data.brand, (v) => { brand = v; load(); }), select(L("Source déclarée", "Declared source"), [["", L("Toutes", "All")], ...data.sources.map((x) => [x, x])], source, (v) => { source = v; load(); })); output.append(filters);
    const dates = [[L("Du", "From"), from, (value) => { from = value; }], [L("Au", "To"), to, (value) => { to = value; }]];
    for (const [label, value, set] of dates) {
      const field = el("label", "c-field");
      const input = el("input"); input.type = "date"; input.value = value;
      input.onchange = () => {
        set(input.value);
        if (from && to && from > to) {
          status.textContent = L("La date de début doit précéder la date de fin.", "The start date must come before the end date.");
          return;
        }
        load();
      };
      field.append(el("span", "", label), input);
      filters.append(field);
    }
    if (data.groups?.length) filters.append(select(L("Groupe de questions", "Prompt group"), [["", L("Tous", "All")], ...data.groups.map((g) => [g.id, g.name])], groupId, (v) => { groupId = v; load(); }));
    if (from || to || groupId) filters.append(button(L("Effacer les filtres de période et groupe", "Clear date and group filters"), () => { from = to = groupId = ""; load(); }));
    const cards = el("div", "ai-metrics"); for (const [title, value, explanation] of [[L("Visibilité", "Visibility"), fmt(data.visibility), `${data.count} / ${data.total} ${L("réponses", "answers")}`], [L("Part de voix — présence", "Share of voice — presence"), fmt(data.shareOfVoice), `${data.count} / ${data.presenceDenominator} ${L("présences du panel", "panel presences")}`], [L("Réponses analysées", "Answers analyzed"), String(data.total), data.provenance ? L(`Importées ${data.provenance.imported} · Collectes vérifiées ${data.provenance.collected} · Origine non vérifiée ${data.provenance.unverified}`, `Imported ${data.provenance.imported} · Verified collections ${data.provenance.collected} · Unverified origin ${data.provenance.unverified}`) : ""]]) { const card = el("div", "ai-metric"); card.append(metricIcon("eye"), el("span", "", title), el("strong", "", value), el("p", "c-note", explanation)); cards.append(card); } output.append(cards);
    output.append(visibilityChart(data.responses, data.brands.map(b => ({ label: b.name, matches: r => r.mentions.some(m => m.brand === b.name && m.status !== "rejected") })), L("Évolution des présences de marque", "Brand presence over time")));
    const wrap = el("div", "ai-grid"); const ranking = el("section", "ai-chart"); ranking.append(el("h3", "", L("Présence par marque", "Presence by brand")), el("p", "c-note", L("Détection automatique provisoire : une présence par marque et par réponse. Sélectionnez une marque et vérifiez les mentions.", "Provisional automatic detection: one presence per brand and answer. Select a brand and review its mentions.")));
    for (const row of data.counts) { const line = el("div", "ai-bar-row"); const name = button(row.brand, () => { brand = row.brand; load(); }); name.className = "ai-chart-link"; const brandMeta = data.brands.find(b => b.name === row.brand); name.replaceChildren(entityCell(row.brand, { kind: "brand", imageUrl: brandMeta?.logoUrl, url: brandMeta?.website })); const track = el("span", "ai-bar-track"); const fill = el("i", "ai-bar-fill"); fill.style.width = `${data.total ? row.count / data.total * 100 : 0}%`; track.append(fill); line.append(name, track, el("strong", "", data.total ? fmt(row.count / data.total * 100) : "—")); ranking.append(line); }
    const sentiments = el("section", "ai-chart"); sentiments.append(el("h3", "", L("Tonalité associée à la marque", "Tone associated with the brand")), el("p", "c-note", L("Heuristique expérimentale, non validée : ces résultats nécessitent une vérification humaine. Une absence de mot reconnu reste indéterminée.", "Experimental, unvalidated heuristic: human review is required. No recognized word remains unknown.")));
    for (const [key, label] of [["positive", L("Positive", "Positive")], ["neutral", L("Neutre", "Neutral")], ["negative", L("Négative", "Negative")], ["mixed", L("Mixte", "Mixed")], ["unknown", L("Indéterminée", "Unknown")]]) { const n = data.sentiment[key]; const line = el("div", "ai-bar-row"); const track = el("span", "ai-bar-track"); const fill = el("i", `ai-bar-fill ai-${key}`); fill.style.width = `${data.count ? n / data.count * 100 : 0}%`; track.append(fill); line.append(el("span", "", label), track, el("strong", "", `${n} · ${data.count ? fmt(n / data.count * 100) : "—"}`)); sentiments.append(line); }
    wrap.append(ranking, sentiments); output.append(wrap);
    if (views && Array.isArray(views.engines) && Array.isArray(views.overall?.brands)) {
      const share = el("section", "ai-chart"); share.append(el("h3", "", L("Part de voix par moteur", "Share of voice per engine")), el("p", "c-note", views.note || L("Proportions du panel stocké uniquement, pas de part de marché des moteurs.", "Proportions of the stored panel only, not engine market share.")));
      for (const engine of views.engines) { const value = engine.brands.find((b) => b.brand === views.brand)?.shareOfVoice ?? null; const line = el("div", "ai-bar-row"); const track = el("span", "ai-bar-track"); const fill = el("i", "ai-bar-fill"); fill.style.width = `${value === null ? 0 : value}%`; track.append(fill); line.append(el("span", "", `${engine.engine} · ${engine.mentions}/${engine.responses}`), track, el("strong", "", fmt(value))); share.append(line); }
      const overallValue = views.overall.brands.find((b) => b.brand === views.brand)?.shareOfVoice ?? null; const overall = el("div", "ai-bar-row"); const otrack = el("span", "ai-bar-track"); const ofill = el("i", "ai-bar-fill"); ofill.style.width = `${overallValue === null ? 0 : overallValue}%`; otrack.append(ofill); overall.append(el("span", "", L("Tous moteurs", "All engines")), otrack, el("strong", "", fmt(overallValue))); share.append(overall);
      output.append(share);
    }
    const history = el("section", "ai-chart"); history.append(el("h3", "", L("Historique par jour", "Daily history")), el("p", "c-note", L("Sélectionnez un jour pour afficher les réponses et le dénominateur. Les jours non collectés ne sont pas des zéros.", "Select a day to see its answers and denominator. Days without collection are not zeros."))); const days = el("div", "ai-days"); const selectedDay = el("p", "c-note"); selectedDay.setAttribute("role", "status");
    for (const day of data.trend) { const b = button(`${day.date} · ${day.count}/${day.total}`, () => { selectedDay.textContent = `${day.date} · ${day.count}/${day.total} · ${fmt(day.count / day.total * 100)}`; [...output.querySelectorAll("[data-response-id]")].forEach((node) => { node.hidden = node.dataset.day !== day.date; }); }); b.className = "ai-day"; b.style.setProperty("--fill", `${day.count / day.total * 100}%`); days.append(b); } history.append(days, selectedDay, button(L("Afficher toutes les réponses", "Show all answers"), () => { output.querySelectorAll("[data-response-id]").forEach((node) => { node.hidden = false; }); selectedDay.textContent = ""; })); output.append(history);
    const matrix = el("section", "ai-chart"); matrix.append(el("h3", "", L("Prompts × sources", "Prompts × sources")), el("p", "c-note", L("Présences détectées par réponse ; sélectionnez une cellule pour consulter les preuves. Les résultats non revus restent provisoires.", "Detected presence per answer; select a cell to inspect evidence. Unreviewed results remain provisional.")));
    const prompts = [...new Set(data.responses.map((r) => r.prompt))]; const sources = [...new Set(data.responses.map((r) => r.source))]; const scroll = el("div", "ai-matrix-scroll"); const table = el("table", "app-table"); const thead = el("thead"), header = el("tr"); const corner = el("th", "", "Prompt"); corner.scope = "col"; header.append(corner); for (const src of sources) { const th = el("th", "", src); th.scope = "col"; header.append(th); } thead.append(header); table.append(thead); const tbody = el("tbody");
    for (const prompt of prompts) { const tr = el("tr"), th = el("th", "", prompt); th.scope = "row"; tr.append(th); for (const src of sources) { const rows = data.responses.filter((r) => r.prompt === prompt && r.source === src), present = rows.filter((r) => r.mentions.some((m) => m.brand === data.brand && m.status !== "rejected")).length; const td = el("td"); if (!rows.length) td.textContent = "—"; else { const cell = button(`${present}/${rows.length} · ${fmt(present / rows.length * 100)}`, () => { output.querySelectorAll("[data-response-id]").forEach((node) => { node.hidden = node.dataset.prompt !== prompt || node.dataset.source !== src; }); selectedDay.textContent = `${prompt} · ${src} · ${present}/${rows.length}`; }); cell.className = "ai-matrix-cell"; td.append(cell); } tr.append(td); } tbody.append(tr); } table.append(tbody); scroll.append(table); matrix.append(scroll); output.append(matrix);
    const citations = el("section", "ai-chart"); citations.append(el("h3", "", L("Domaines cités dans les réponses", "Domains cited in answers")), el("p", "c-note", L("Sources renseignées par l’import ou le connecteur ; leur présence ne signifie pas que la marque est citée par chaque source.", "Sources supplied by the import or connector; their presence does not imply that each source cites the brand."))); const domains = new Map();
    for (const row of data.responses) { const seen = new Set(); for (const url of row.citations || []) { try { seen.add(new URL(url).hostname); } catch { /* invalid URLs never become links */ } } for (const domain of seen) domains.set(domain, (domains.get(domain) || 0) + 1); }
    if (!domains.size) citations.append(el("p", "c-note", L("Aucune citation renseignée.", "No citations supplied.")));
    for (const [domain, count] of [...domains].sort((a, b) => b[1] - a[1])) { const row = el("div", "ai-bar-row"); const b = button(domain, () => { output.querySelectorAll("[data-response-id]").forEach((node) => { node.hidden = !JSON.parse(node.dataset.domains || "[]").includes(domain); }); selectedDay.textContent = `${domain} · ${count} ${L("réponse(s)", "answer(s)")}`; }); b.className = "ai-chart-link"; const track = el("span", "ai-bar-track"), fill = el("i", "ai-bar-fill"); fill.style.width = `${data.total ? count / data.total * 100 : 0}%`; track.append(fill); row.append(b, track, el("strong", "", String(count))); citations.append(row); } output.append(citations);
    if (gaps && Array.isArray(gaps.categories) && gaps.totals && typeof gaps.evaluated === "boolean") {
      const CATEGORY_LABELS = { own: L("Site propre", "Own site"), competitor: L("Concurrents", "Competitors"), reddit: "Reddit", youtube: "YouTube", linkedin: "LinkedIn", wikipedia: "Wikipedia", web: L("Web autre", "Other web") };
      const analysis = el("section", "ai-chart"); analysis.append(el("h3", "", L("Écarts de citations", "Citation gaps")), el("p", "c-note", gaps.evaluated ? L("Écarts calculés uniquement à partir des citations stockées de ce panel.", gaps.note || "Gaps computed only from this panel’s stored citations.") : L("Déclarez le site de la marque pour évaluer les écarts.", gaps.note || "Declare the brand website to assess citation gaps.")));
      const ownMentions = gaps.evaluated ? gaps.totals.promptsMentioningBrandWithOwnCitation : "—";
      analysis.append(el("p", "c-note", `${gaps.totals.observations} ${L("observations", "observations")} · ${gaps.totals.withCitations} ${L("avec citations", "with citations")} · ${gaps.totals.citations} ${L("citations", "citations")} · ${gaps.totals.promptsMentioningBrand} ${L("réponses mentionnant la marque", "answers mentioning the brand")} · ${ownMentions} ${L("avec citation du site propre", "with an own-site citation")}`));
      const metadata = gaps.totals.withCitationMetadata ?? gaps.totals.withCitations;
      analysis.append(el("p", "c-note", L(`Métadonnées de citations disponibles · ${metadata}/${gaps.totals.observations}`, `Citation metadata available · ${metadata}/${gaps.totals.observations}`)));
      if (gaps.evaluated && metadata && Number.isInteger(gaps.totals.citingOwnSite)) {
        analysis.append(el("p", "c-note", L(`Réponses citant le site propre · ${gaps.totals.citingOwnSite}/${metadata}`, `Answers citing the own site · ${gaps.totals.citingOwnSite}/${metadata}`)));
      }
      if (gaps.evaluated && gaps.totals.observations) {
        if (!metadata) analysis.append(el("p", "c-note", L("Métadonnées de citations indisponibles.", "Citation metadata unavailable.")));
        else if (!gaps.gaps?.length) analysis.append(el("p", "c-note", L("Aucun écart observé dans les réponses dont les citations sont renseignées.", "No gap observed in answers with citation metadata.")));
      }
      for (const row of gaps.categories) {
        if (!row.citations && !row.citedPrompts && row.category !== "own") continue;
        const line = el("div", "ai-bar-row"); const track = el("span", "ai-bar-track"); const fill = el("i", "ai-bar-fill"); fill.style.width = `${row.shareOfCitations === null ? 0 : row.shareOfCitations}%`; track.append(fill);
        const categoryTotal = row.category === "own" && !gaps.evaluated ? "—" : `${row.citations} · ${fmt(row.shareOfCitations)}`;
        line.append(el("span", "", CATEGORY_LABELS[row.category] || row.category), track, el("strong", "", categoryTotal));
        analysis.append(line);
      }
      for (const host of Array.isArray(gaps.topHosts) ? gaps.topHosts : []) { const line = el("div", "ai-bar-row"); const link = el("a", "ai-chart-link", host.host); link.href = /^https?:\/\//i.test(host.example) ? host.example : `https://${host.host}/`; link.target = "_blank"; link.rel = "noopener noreferrer"; line.append(link, el("span", "c-note", `${CATEGORY_LABELS[host.category] || host.category} · ${host.citations}`)); analysis.append(line); }
      if (Array.isArray(gaps.gaps) && gaps.gaps.length) {
        analysis.append(el("p", "c-note", L("Réponses où la marque est citée sans citation du site propre. Preuves et citations ci-dessous.", "Answers that mention the brand without an own-site citation. Evidence and citations below.")));
        for (const gap of gaps.gaps) { const d = el("details", "ai-answer"); d.append(el("summary", "", `${gap.observedAt.slice(0, 10)} · ${gap.prompt} · ${L("site propre absent des citations", "own site missing from citations")}`), el("p", "c-note", gap.evidence)); for (const url of gap.citations || []) { const cite = el("a", "", url); cite.href = url; cite.target = "_blank"; cite.rel = "noopener noreferrer"; d.append(cite, el("br")); }
          d.append(button(L("Ouvrir la réponse", "Open answer"), () => {
            const answer = [...output.querySelectorAll("[data-response-id]")].find((row) => row.dataset.responseId === gap.id);
            if (!answer) return;
            answer.hidden = false;
            answer.open = true;
            answer.querySelector("summary")?.focus();
            answer.scrollIntoView?.({ block: "start" });
          }));
          analysis.append(d); }
      }
      output.append(analysis);
      if (focusCitations) {
        focusCitations = false;
        const title = analysis.querySelector("h3");
        title.tabIndex = -1;
        title.focus();
        analysis.scrollIntoView?.({ block: "start" });
      }
    } else if (data.total) output.append(el("p", "c-note", L("Analyse des citations temporairement indisponible.", "Citation analysis temporarily unavailable.")));
    const evidence = el("section", "ai-chart"); evidence.append(el("h3", "", L("Réponses et preuves", "Answers and evidence")));
    for (const row of data.responses) { const d = el("details", "ai-answer"); d.dataset.responseId = row.id; d.dataset.day = row.observedAt.slice(0, 10); d.dataset.prompt = row.prompt; d.dataset.source = row.source; d.dataset.domains = JSON.stringify((row.citations || []).map((url) => { try { return new URL(url).hostname; } catch { return ""; } })); d.append(el("summary", "", `${row.observedAt.slice(0, 10)} · ${row.source} · ${row.prompt}`), renderAnswer(row)); for (const mention of row.mentions) {
      d.append(el("p", "c-note", `${mention.brand}: ${mention.sentiment} · ${mention.status || L("à vérifier", "needs review")} · ${mention.evidence}`));
      if (admin) {
        const review = el("form", "ai-review"); const category = el("label", "c-field"); category.append(el("span", "", L("Tonalité vérifiée", "Reviewed sentiment"))); const choice = el("select");
        for (const [v, label] of [["positive", L("Positive", "Positive")], ["neutral", L("Neutre", "Neutral")], ["negative", L("Négative", "Negative")], ["mixed", L("Mixte", "Mixed")], ["unknown", L("Indéterminée", "Unknown")]]) { const option = el("option", "", label); option.value = v; choice.append(option); } choice.value = mention.sentiment; category.append(choice);
        const result = el("p", "c-note"); result.setAttribute("role", "status");
        const decide = async (decision) => { try { await api("/ai-visibility/review", { datasetId: current, responseId: row.id, brand: mention.brand, status: decision, sentiment: choice.value }); await load(); } catch (error) { result.textContent = error.message; } };
        review.onsubmit = (event) => event.preventDefault(); review.append(category, button(L("Confirmer la mention", "Confirm mention"), () => decide("confirmed")), button(L("Rejeter la mention", "Reject mention"), () => decide("rejected")), result); d.append(review);
      }
    } for (const url of row.citations || []) { const link = el("a", "", url); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; d.append(link, el("br")); }
      if (me?.role === 'tenant-admin') d.append(button(L('Épingler dans Intention', 'Pin to Intent'), () => {
        try {
          sessionStorage.setItem(answerPinKey(me.tenant.id), JSON.stringify({ datasetId: current, responseId: row.id, brand, prompt: row.prompt }));
          location.hash = '#diagnose/intent';
        } catch (error) { status.textContent = error.message; }
      }));
      evidence.append(d);
    }
    output.append(evidence);
  }
  list(); return root;
}
