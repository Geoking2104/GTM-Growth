/** Deterministic, source-labelled customer journey preview.
 * Adapts the five awareness stages from Illyism/customer-journey; no LLM call,
 * prompt volume claim, conversion prediction, or implicit site crawl. */
export const JOURNEY_VERSION = "1.0.0";

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

function clean(value, limit = 110) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}
function stemWords(value) {
  const stop = new Set(["avec", "dans", "pour", "the", "this", "that", "from", "what", "your", "vous", "votre", "quels", "quelle", "quelles", "comment", "pourquoi", "dont", "peut", "site", "page", "vers", "plus", "quel"]);
  return new Set(clean(value, 220).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !stop.has(word)));
}
function headingMatch(prompt, headings) {
  const wanted = stemWords(prompt);
  if (wanted.size < 2) return null;
  for (const h of headings) {
    const actual = stemWords(h.text);
    const shared = [...wanted].filter((word) => actual.has(word));
    if (shared.length >= 2) return h;
  }
  return null;
}
function promptsFor(stage, lang, brand, subject, audience, goal) {
  const who = audience || (lang === "fr" ? "mon activité" : "my business");
  const outcome = goal || (lang === "fr" ? "répondre à ce besoin" : "meet this need");
  const topic = subject || (lang === "fr" ? "ce service" : "this service");
  const values = lang === "fr" ? {
    unaware: ["Pourquoi est-il difficile de choisir une solution pour " + topic + " ?", "Quels problèmes faut-il anticiper avant de " + outcome + " ?"],
    "problem-aware": ["Comment reconnaître un problème lié à " + topic + " ?", "Quelles questions poser pour " + outcome + " ?"],
    "solution-aware": ["Quelles options existent pour " + outcome + " ?", "Comment comparer les approches possibles pour " + who + " ?"],
    "product-aware": [brand + " convient-il à " + who + " ?", "Quelles différences faut-il vérifier avant de choisir " + brand + " ?"],
    "most-aware": ["Comment commencer avec " + brand + " ?", "Que faut-il vérifier avant de faire confiance à " + brand + " ?"],
  } : {
    unaware: ["Why is choosing a solution for " + topic + " difficult?", "What problems should I anticipate before trying to " + outcome + "?"],
    "problem-aware": ["How can I recognise a problem related to " + topic + "?", "What should I ask before trying to " + outcome + "?"],
    "solution-aware": ["What options are available to " + outcome + "?", "How should I compare approaches for " + who + "?"],
    "product-aware": ["Is " + brand + " suitable for " + who + "?", "What should I compare before choosing " + brand + "?"],
    "most-aware": ["How do I get started with " + brand + "?", "What should I verify before trusting " + brand + "?"],
  };
  return values[stage] || [];
}

/** Preview is about the buyer of the analysed website, not the GTM buyer.
 * All suggested prompts are hypotheses even if page headings were observed. */
export function buildJourneyPreview(input = {}) {
  const lang = input.language === "en" ? "en" : "fr";
  const page = input.pageSignals && typeof input.pageSignals === "object" ? input.pageSignals : {};
  const url = clean(input.finalUrl || input.url, 2048);
  let brand = clean(input.brand, 70);
  if (!brand) {
    try { brand = new URL(url).hostname; } catch { brand = lang === "fr" ? "ce fournisseur" : "this provider"; }
  }
  const title = clean(page.title, 130);
  const description = clean(page.description, 180);
  const h1 = (Array.isArray(page.h1) ? page.h1 : []).slice(0, 4).map((text) => ({ level: "H1", text: clean(text, 130) })).filter((h) => h.text);
  const h2 = (Array.isArray(page.h2) ? page.h2 : []).slice(0, 8).map((text) => ({ level: "H2", text: clean(text, 130) })).filter((h) => h.text);
  const headings = [...h1, ...h2];
  const audience = clean(input.audience, 100);
  const goal = clean(input.goal, 100);
  const subject = clean(h1[0]?.text || title || description || brand, 75);
  const opportunities = Array.isArray(input.opportunities) ? input.opportunities : [];
  const measured = opportunities.filter((fix) => fix?.status === "fail" || fix?.status === "partial");
  const controlIds = measured.map((fix) => fix.checkId).filter((id) => typeof id === "string");
  const stages = JOURNEY_STAGES.map((stage) => {
    const prompts = promptsFor(stage.id, lang, brand, subject, audience, goal).map((text) => ({
      text: clean(text, 240), sourceKind: "inferred", sourceRef: "gtm-journey-template:" + JOURNEY_VERSION,
    }));
    const heading = prompts.map((p) => headingMatch(p.text, headings)).find(Boolean) || null;
    return {
      id: stage.id, title: stage[lang], intent: stage.intent, mindset: stage.mindset[lang],
      prompts, targetUrl: url,
      coverage: heading ? "possible-heading" : headings.length ? "not-verified" : "no-headings-observed",
      heading,
      observedControls: stage.id === "unaware" || stage.id === "problem-aware"
        ? controlIds.filter((id) => id.startsWith("content.") || id.startsWith("meta.")).slice(0, 3)
        : stage.id === "product-aware"
          ? controlIds.filter((id) => id.startsWith("brand.") || id.startsWith("schema.")).slice(0, 3)
          : controlIds.filter((id) => id.startsWith("content.") || id.startsWith("schema.")).slice(0, 3),
    };
  });
  return {
    version: JOURNEY_VERSION, url, title, description, brand, language: lang,
    audience, goal, observed: { headings, title: Boolean(title), description: Boolean(description) },
    stages, limitation: lang === "fr"
      ? "Questions hypothétiques, pas des requêtes GSC, prompts réellement posés, citations ou positions mesurées."
      : "Hypothetical questions, not observed GSC queries, real AI prompts, citations, or measured rankings.",
  };
}
