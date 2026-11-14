/** Evidence-gated buyer questions. No provider call, automatic collection or publication. */
import { buildJourneyPreview } from "./customer-journey-model.js";
const el = (tag, cls = "", text) => { const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const line = v => String(v || "").replace(/[\r\n]+/g, " ").trim();
const safeLink = (url, label) => { const a = el("a", "", label); try { const u = new URL(url); if (["https:", "http:"].includes(u.protocol) && !u.username && !u.password) { a.href = u.href; a.target = "_blank"; a.rel = "noopener noreferrer"; } } catch {} return a; };
export function makeJourneyPlanMarkdown(journey, states, _opportunities, language) {
  const fr = language === "fr", lines = ["# " + (fr ? "Parcours client contextualisé" : "Contextual customer journey"), "", `URL: ${journey.url}`, `Brand: ${journey.brand}`, `Product: ${journey.product?.name || "—"}`, `Category: ${journey.category}`, `Audience: ${journey.audience}`, `Customer need: ${journey.goal}`, "", "> " + journey.limitation];
  for (const stage of journey.stages) {
    const state = states.get(stage.id); if (!state?.enabled) continue;
    const selected = stage.prompts[state.index || 0], text = state.custom ?? selected?.text; if (!text) continue;
    lines.push("", "## " + stage.title, "", line(text), "", state.custom !== null ? (fr ? "Formulation du client · non mesurée" : "Customer wording · not measured") : (fr ? "Hypothèse · non mesurée" : "Hypothesis · not measured"));
    for (const source of selected?.evidence || []) lines.push(`- ${line(source.label)}: ${source.url} — ${line(source.detail)}`);
  }
  return lines.join("\n") + "\n";
}
export function renderJourneyPreview({ data = {}, language = "fr", mode = "public", savePrompt, readPage } = {}) {
  const fr = language === "fr", t = (a, b) => fr ? a : b;
  const panel = el("section", (mode === "workspace" ? "app-strip" : "public-panel") + " journey-panel");
  panel.id = mode === "workspace" ? "journey-workspace" : "public-journey-preview";
  panel.append(el("p", "public-eyebrow", t("PARCOURS DE VOS CLIENTS", "YOUR CUSTOMERS’ JOURNEY")), el("h2", "", t("Des questions ancrées dans vos produits", "Questions grounded in your products")), el("p", "public-description", t("Confirmez la marque, le produit et le besoin du client. Les hypothèses modifiables seront fondées sur ce contexte et les sources affichées. Aucune question n’est inventée pour remplir une étape vide.", "Confirm the brand, product and customer need. The editable hypotheses will use this context and the sources shown. Empty stages are never filled with invented questions.")));
  let current = data, competitors = [], revision = 0, states = new Map(), journey;
  const form = el("form", "journey-context"), fields = el("div", "journey-context-fields");
  const field = (label, type = "text", max = 100) => { const l = el("label", "", label), n = el("input"); n.type = type; n.maxLength = max; l.append(n); fields.append(l); return n; };
  const brand = field(t("Marque (à confirmer)", "Brand (confirm)")); brand.value = current.journeyContext?.brand || ""; brand.required = true;
  const productLabel = el("label", "", t("Produit ou service lu sur la page", "Product or service read on the page")), product = el("select"); product.required = true; productLabel.append(product); fields.append(productLabel);
  const category = field(t("Catégorie précise du produit", "Specific product category")); category.required = true;
  const audience = field(t("Qui achète ce produit ?", "Who buys this product?")); audience.required = true;
  const goal = field(t("Pour quel usage ou besoin ?", "For which use or need?")); goal.required = true;
  const status = el("p", "journey-status"); status.setAttribute("role", "status");
  const sourceInfo = el("div", "journey-source-context");
  const setProducts = () => { product.replaceChildren(); const blank = el("option", "", t("Choisir un produit identifié", "Choose an identified product")); blank.value = ""; product.append(blank); for (const p of current.journeyContext?.products || []) { const o = el("option", "", p.name + (p.attributes?.variant ? " · " + p.attributes.variant : "")); o.value = p.id; product.append(o); } };
  setProducts();
  const selections = () => ({ ...current, language, brand: brand.value, productId: product.value, category: category.value, audience: audience.value, goal: goal.value, competitors: competitors.map(c => ({ context: c.context, productId: c.select.value, comparable: c.check.checked })) });
  const list = el("ol", "journey-stages");
  const copy = el("button", "public-recommend-button", t("Copier les questions retenues", "Copy selected questions")); copy.type = "button";
  function draw(confirmed = false) {
    journey = buildJourneyPreview({ ...selections(), contextConfirmed: confirmed });
    states = new Map(journey.stages.map(s => [s.id, { index: 0, custom: null, enabled: true }]));
    list.replaceChildren(); sourceInfo.replaceChildren();
    if (current.journeyContext) sourceInfo.append(el("p", "c-note", t("Source de la marque : ", "Brand source: ") + current.journeyContext.brandSource), safeLink(current.journeyContext.url, t("Ouvrir la page lue", "Open the page read")));
    if (!journey.ready) sourceInfo.append(el("p", "journey-missing", t("Contexte à compléter : ", "Context to complete: ") + journey.missing.join(" · ")));
    copy.disabled = !journey.stages.some(s => s.prompts.length);
    for (const [index, stage] of journey.stages.entries()) {
      const state = states.get(stage.id), card = el("li", "journey-stage"), head = el("div", "journey-stage-head");
      head.append(el("strong", "journey-stage-number", String(index + 1)), el("h3", "", stage.title)); card.append(head, el("p", "journey-mindset", stage.mindset));
      if (!stage.prompts.length) { card.append(el("p", "journey-missing", stage.missing)); list.append(card); continue; }
      const badge = el("p", "public-pill", t("Hypothèse sourcée · à relire · non mesurée", "Sourced hypothesis · review required · not measured")); card.append(badge);
      const editLabel = el("label", "journey-question-label", t("Question à relire", "Review question")), edit = el("textarea"); edit.maxLength = 500; edit.rows = 3; edit.value = stage.prompts[0].text; editLabel.append(edit);
      const evidence = el("div", "journey-evidence");
      const showEvidence = () => { evidence.replaceChildren(); for (const s of stage.prompts[state.index].evidence) { const p = el("p", ""); p.append(safeLink(s.url, s.label), document.createTextNode(s.detail ? " — " + s.detail : "")); evidence.append(p); } };
      if (stage.prompts.length > 1) { const l = el("label", "journey-question-label", t("Autre angle fondé sur les sources", "Another angle grounded in sources")), select = el("select"); for (const [i, p] of stage.prompts.entries()) { const o = el("option", "", p.text); o.value = String(i); select.append(o); } select.onchange = () => { state.index = Number(select.value); state.custom = null; edit.value = stage.prompts[state.index].text; showEvidence(); }; l.append(select); card.append(l); }
      edit.oninput = () => { state.custom = edit.value.trim(); badge.textContent = t("Votre formulation · à relire · non mesurée", "Your wording · review required · not measured"); };
      showEvidence(); card.append(editLabel, evidence);
      const toggle = el("button", "public-rank-mode", t("Écarter", "Discard")); toggle.type = "button"; toggle.onclick = () => { state.enabled = !state.enabled; edit.disabled = !state.enabled; toggle.textContent = state.enabled ? t("Écarter", "Discard") : t("Conserver", "Keep"); card.classList.toggle("journey-stage-discarded", !state.enabled); }; card.append(toggle);
      if (savePrompt) { const save = el("button", "public-rank-mode", t("Suivre cette question", "Track this question")); save.type = "button"; save.onclick = async () => { if (!state.enabled || !edit.value.trim()) return; save.disabled = true; try { await savePrompt({ prompt: edit.value.trim(), group: stage.id, sourceKind: state.custom === null ? "inferred" : "provided:user", sourceRef: "gtm-journey-context:" + journey.version, targetUrl: stage.targetUrl, locale: language }); status.textContent = t("Question ajoutée.", "Question added."); } catch { status.textContent = t("Ajout impossible. Vérifiez vos droits.", "Could not save. Check your permissions."); } finally { save.disabled = false; } }; card.append(save); }
      list.append(card);
    }
  }
  const invalidate = () => { revision++; draw(false); status.textContent = t("Contexte modifié. Confirmez-le pour régénérer les questions.", "Context changed. Confirm it to regenerate questions."); };
  form.addEventListener("input", invalidate);
  product.onchange = () => { for (const c of competitors) c.check.checked = false; category.value = current.journeyContext?.products.find(p => p.id === product.value)?.category || ""; invalidate(); };
  category.onchange = () => { for (const c of competitors) c.check.checked = false; invalidate(); };
  const read = readPage || (async url => { const response = await fetch("/api/free-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(25000) }); if (!response.ok) throw new Error("read unavailable"); const result = await response.json(); if (result.httpStatus < 200 || result.httpStatus >= 400) throw new Error("read unavailable"); return result; });
  const extra = el("details", "journey-add-sources"); extra.append(el("summary", "", t("Lire une fiche produit ou une page concurrente", "Read a product page or competitor page")));
  const pageLabel = el("label", "", t("URL publique de la fiche", "Public page URL")), pageInput = el("input"); pageInput.type = "url"; pageInput.maxLength = 2048; pageLabel.append(pageInput); extra.append(pageLabel);
  const competitorList = el("div", "journey-competitors");
  for (const isCompetitor of [false, true]) { const b = el("button", "public-rank-mode", isCompetitor ? t("Lire un concurrent", "Read a competitor") : t("Lire mon produit", "Read my product")); b.type = "button"; b.onclick = async () => {
    const url = pageInput.value.trim(); let parsed; try { parsed = new URL(url); } catch { status.textContent = t("Saisissez une URL valide.", "Enter a valid URL."); return; }
    if (!isCompetitor && parsed.hostname.replace(/^www\./, "") !== new URL(current.finalUrl || current.url).hostname.replace(/^www\./, "")) { status.textContent = t("La fiche doit appartenir au site analysé.", "The product must belong to the analysed site."); return; }
    if (isCompetitor && competitors.length >= 2) { status.textContent = t("Deux concurrents maximum. Retirez une source pour la remplacer.", "Maximum two competitors. Remove a source to replace it."); return; }
    invalidate(); const version = revision; b.disabled = true; status.textContent = t("Lecture de la source…", "Reading source…");
    try { const result = await read(url, isCompetitor); if (version !== revision || !panel.isConnected) return; const ctx = result.journeyContext;
      if (!ctx?.products?.length) throw new Error("no products");
      if (!isCompetitor && new URL(ctx.url).hostname.replace(/^www\./, "") !== new URL(current.finalUrl || current.url).hostname.replace(/^www\./, "")) throw new Error("foreign redirect");
      if (isCompetitor) {
        const row = el("div", "journey-competitor"), l = el("label", "", ctx.brand || ctx.url), select = el("select"), checkLabel = el("label", ""), check = el("input"); check.type = "checkbox";
        const placeholder = el("option", "", t("Choisir un produit concurrent", "Choose a competitor product")); placeholder.value = ""; select.append(placeholder);
        for (const p of ctx.products) { const o = el("option", "", p.name); o.value = p.id; select.append(o); }
        checkLabel.append(check, document.createTextNode(t("Je confirme que cette offre est comparable au produit sélectionné.", "I confirm this offer is comparable to the selected product."))); l.append(select); row.append(l, checkLabel, safeLink(ctx.url, t("Source concurrente", "Competitor source")));
        const choice = { context: ctx, select, check }, remove = el("button", "public-rank-mode", t("Retirer", "Remove")); remove.type = "button"; remove.onclick = () => { competitors = competitors.filter(c => c !== choice); row.remove(); invalidate(); }; row.append(remove); competitorList.append(row); competitors.push(choice);
      } else { current = result; brand.value = ctx.brand || ""; category.value = ""; competitors = []; competitorList.replaceChildren(); setProducts(); }
      invalidate(); status.textContent = t("Source lue. Sélectionnez le produit puis confirmez le contexte.", "Source read. Select the product, then confirm the context.");
    } catch { if (version === revision) status.textContent = t("Source insuffisante ou inaccessible. Aucune question n’a été générée. Essayez une fiche produit contenant des données structurées.", "Insufficient or unavailable source. No questions generated. Try a product page with structured product data."); } finally { b.disabled = false; }
  }; extra.append(b); }
  const submit = el("button", "public-recommend-button", t("Confirmer le contexte et préparer les questions", "Confirm context and prepare questions")); submit.type = "submit";
  form.onsubmit = event => { event.preventDefault(); revision++; draw(true); status.textContent = journey.ready ? t("Questions préparées à partir des sources. Relisez-les avant de les suivre.", "Questions prepared from the sources. Review them before tracking.") : t("Complétez le contexte pour continuer.", "Complete the context to continue."); };
  form.append(fields, extra, competitorList, submit); panel.append(form, sourceInfo, list, copy, status);
  copy.onclick = async () => { try { await navigator.clipboard.writeText(makeJourneyPlanMarkdown(journey, states, [], language)); status.textContent = t("Questions et sources copiées.", "Questions and sources copied."); } catch { status.textContent = t("Copie indisponible.", "Copy unavailable."); } };
  if (mode === "public") { const link = el("a", "public-action-cta", t("Suivre mes questions dans mon espace", "Track my questions in my workspace")); link.href = "#c-login-form"; panel.append(link); }
  draw(); panel.append(el("p", "public-micro", journey.limitation)); return panel;
}
