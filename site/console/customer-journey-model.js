/** Deterministic, source-labelled customer journey preview.
 * Adapts the five awareness stages from Illyism/customer-journey; no LLM call,
 * prompt volume claim, conversion prediction, or implicit site crawl. */
export const JOURNEY_VERSION = "2.0.0";

export const JOURNEY_STAGES = Object.freeze([
  { id: "unaware", fr: "Découverte", en: "Unaware", intent: "problem-discovery",
    mindset: { fr: "Comprendre un symptôme avant de rechercher un produit.", en: "Understand a symptom before looking for a product." } },
  { id: "problem-aware", fr: "Problème", en: "Problem aware", intent: "problem-definition",
    mindset: { fr: "Nommer le problème et les critères de résolution.", en: "Name the problem and the criteria for solving it." } },
  { id: "solution-aware", fr: "Solutions", en: "Solution aware", intent: "solution-comparison",
    mindset: { fr: "Comparer les approches disponibles.", en: "Compare available approaches." } },
  { id: "product-aware", fr: "Produits", en: "Product aware", intent: "provider-evaluation",
    mindset: { fr: "Vérifier si une offre répond au besoin.", en: "Check whether a provider fits the need." } },
  { id: "most-aware", fr: "Décision", en: "Most aware", intent: "conversion-decision",
    mindset: { fr: "Lever une dernière objection avant d'agir.", en: "Remove the last objection before acting." } },
]);

const clean = (v, max = 160) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const sameSite = (a, b) => { try { return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, ""); } catch { return false; } };

/** Fail closed. A heading/hostname alone never creates a question. The customer
 * confirms the product, category, buyer and use case; only read product facts and
 * explicitly selected comparisons can then shape the hypotheses. Shared by Eve. */
export function buildJourneyPreview(input = {}) {
  const language = input.language === "en" ? "en" : "fr", fr = language === "fr";
  const context = input.journeyContext || {}, url = clean(input.finalUrl || input.url, 2048);
  const validContext = context.url === url && Array.isArray(context.products);
  const product = validContext && context.products.find(p => p.id === input.productId && sameSite(p.url, url));
  const brand = clean(input.brand || context.brand, 70), category = clean(input.category || product?.category, 100);
  const audience = clean(input.audience, 100), goal = clean(input.goal, 100);
  const ready = Boolean(input.contextConfirmed === true && product && brand && category && audience && goal);
  const missing = [];
  if (!validContext) missing.push(fr ? "Lecture de la page" : "Page reading");
  if (!product) missing.push(fr ? "Produit ou service identifié" : "Identified product or service");
  if (!brand) missing.push(fr ? "Marque" : "Brand");
  if (!category) missing.push(fr ? "Catégorie du produit" : "Product category");
  if (!audience) missing.push(fr ? "Client cible" : "Target customer");
  if (!goal) missing.push(fr ? "Besoin du client" : "Customer need");
  if (input.contextConfirmed !== true) missing.push(fr ? "Confirmation du contexte" : "Context confirmation");
  const ref = "gtm-journey-context:" + JOURNEY_VERSION;
  const proposals = Object.fromEntries(JOURNEY_STAGES.map(s => [s.id, []]));
  const evidence = product ? [{ url: product.sourceUrl, label: product.name, detail: product.description || Object.values(product.attributes || {}).join(" · "), kind: product.source }] : [];
  const add = (stage, text, sources = evidence) => proposals[stage].push({ text: clean(text, 500), sourceKind: "inferred", sourceRef: ref, evidence: sources });
  const competitors = [];
  if (ready) {
    const item = `${brand} — ${product.name}`;
    add("unaware", fr ? `Pour ${audience}, comment choisir ${category} pour ${goal} ?` : `For ${audience}, how should I choose ${category} for ${goal}?`);
    add("problem-aware", fr ? `Quels critères de ${category} dois-je examiner pour ${goal} ?` : `Which criteria should I check in ${category} for ${goal}?`);
    // Every comparison is customer-selected and references a real product, never
    // an automatically detected brand, an unverified rival or an invented feature.
    for (const choice of (input.competitors || []).slice(0, 2)) {
      const c = choice.context;
      const cp = c?.products?.find(p => p.id === choice.productId && sameSite(p.url, c.url));
      if (!cp || !c.brand || choice.comparable !== true || sameSite(c.url, url)) continue;
      competitors.push({ brand: c.brand, product: cp.name, url: cp.url });
      add("solution-aware", fr ? `Comment comparer ${item} et ${c.brand} — ${cp.name} pour ${goal} ?` : `How do ${item} and ${c.brand} — ${cp.name} compare for ${goal}?`, [...evidence, { url: cp.sourceUrl, label: `${c.brand} — ${cp.name}`, detail: cp.description || Object.values(cp.attributes || {}).join(" · "), kind: cp.source }]);
    }
    add("product-aware", fr ? `Quelles caractéristiques de ${item} répondent au besoin « ${goal} » ?` : `Which characteristics of ${item} address the need “${goal}”?`);
    const attrs = product.attributes || {};
    if (attrs.material) add("product-aware", fr ? `Que faut-il savoir sur le matériau « ${attrs.material} » de ${item} pour ${goal} ?` : `What should I know about the “${attrs.material}” material of ${item} for ${goal}?`);
    if (attrs.variant) add("product-aware", fr ? `La variante « ${attrs.variant} » de ${item} correspond-elle à mon usage : ${goal} ?` : `Does the “${attrs.variant}” variant of ${item} suit my use: ${goal}?`);
    for (const link of (context.links || []).filter(l => sameSite(l.url, url))) {
      const texts = {
        size: [ `Comment choisir ma taille pour ${item} ?`, `How do I choose my size for ${item}?` ],
        delivery: [ `Quelles conditions de livraison vérifier avant de commander ${item} ?`, `Which delivery terms should I check before ordering ${item}?` ],
        returns: [ `Quelles conditions de retour vérifier avant de commander ${item} ?`, `Which return terms should I check before ordering ${item}?` ],
        care: [ `Quels conseils d’entretien vérifier pour ${item} ?`, `Which care instructions should I check for ${item}?` ],
      };
      if (texts[link.kind] && product.kind === "Product") add("most-aware", texts[link.kind][fr ? 0 : 1], [...evidence, { url: link.url, label: link.label, detail: fr ? "Lien observé ; conditions non vérifiées" : "Observed link; terms not verified", kind: "link" }]);
    }
  }
  const stages = JOURNEY_STAGES.map(s => ({ id: s.id, title: s[language], intent: s.intent, mindset: s.mindset[language], prompts: proposals[s.id], targetUrl: product?.url || url, coverage: "not-verified", heading: null, observedControls: [], missing: s.id === "solution-aware" ? (fr ? "Ajoutez une fiche concurrente et confirmez sa comparabilité." : "Add a competitor product page and confirm it is comparable.") : s.id === "most-aware" ? (fr ? "Aucune information de décision exploitable observée sur cette page." : "No usable decision information observed on this page.") : (fr ? "Confirmez le contexte ci-dessus pour préparer cette étape." : "Confirm the context above to prepare this stage.") }));
  return { version: JOURNEY_VERSION, url, brand, category, product, audience, goal, language, ready, missing, competitors, stages, limitation: fr ? "Questions hypothétiques fondées sur les sources et votre contexte confirmé. Ni demande observée, ni réponse IA mesurée. Relisez leur pertinence avant utilisation." : "Hypothetical questions grounded in sources and your confirmed context. Neither observed demand nor measured AI answers. Review relevance before use." };
}
