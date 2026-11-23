/* AEO Writer console panel (R8): answer-grounded content scoring and local
 * drafts from the tenant's stored AI-visibility panel. Evidence-first: the
 * score covers the stored prompts and the supplied text only; unknown stays
 * "—", never zero; drafts are local, never published. Nothing is stored. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, callback) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = callback; return b; };
const dash = (value) => value === null || value === undefined ? "—" : String(value);

export function renderOpsAeoWriter({ api, me }) {
  const box = el("section", "app-strip ops-aeo-writer");
  const message = el("p", "c-note"); message.setAttribute("role", "status");
  const result = el("div");
  box.append(
    el("h3", "", L("AEO Writer : score ancré sur les réponses IA", "AEO Writer: answer-grounded scoring")),
    el("p", "c-note", L(
      "Collez un contenu (page ou brouillon) : il est confronté aux prompts du panneau de visibilité IA stocké du tenant (réponses importées ou collectées) et audité par les heuristiques de citabilité. Tout est local : aucun appel externe, rien n'est stocké, aucune donnée inventée ; un score élevé ne garantit pas une citation.",
      "Paste content (a page or a draft): it is scored against the prompts of the tenant's stored AI-visibility panel (imported or collected answers) and audited with the citability heuristics. Everything is local: no external call, nothing stored, nothing invented; a high score does not guarantee a citation.")),
  );

  const content = el("textarea"); content.rows = 10; content.style.width = "100%";
  content.setAttribute("aria-label", L("Contenu à scorer (texte ou HTML)", "Content to score (text or HTML)"));
  const inputs = el("div");
  const brand = el("input"); brand.type = "text"; brand.style.width = "40%";
  brand.setAttribute("aria-label", L("Marque (optionnel)", "Brand (optional)"));
  inputs.append(brand, el("span", "c-note", "  ·  "));
  const run = async (path) => {
    message.textContent = L("Analyse locale en cours…", "Running the local analysis…");
    result.textContent = "";
    try {
      const data = await api(path, { content: content.value, ...(brand.value.trim() ? { brand: brand.value.trim() } : {}) });
      message.textContent = "";
      renderResult(path, data);
    } catch (e) {
      message.textContent = String(e?.message ?? e ?? "");
    }
  };
  const scoreButton = button(L("Scorer le contenu", "Score the content"), () => run("/aeo-writer/score"));
  const draftsButton = button(L("Générer des brouillons", "Generate drafts"), () => run("/aeo-writer/drafts"));
  box.append(content, inputs, scoreButton, " ", draftsButton, message, result);

  const statusTd = (status) => status === "covered" ? L("couvert", "covered") : status === "partial" ? L("partiel", "partial") : status === "absent" ? L("absent", "absent") : L("non évaluable", "unevaluated");

  function renderResult(path, data) {
    const wrap = el("div");
    wrap.append(el("p", "c-note",
      L("Origine : panneau stocké du tenant + contenu fourni", "Source: tenant stored panel + supplied content") +
      ` · ${L("panneau", "panel")} ${dash(data.datasetId)}` +
      (data.brand ? ` · ${L("marque", "brand")} ${data.brand}` : "") +
      (data.observedAt ? ` · ${L("dernière réponse", "latest answer")} ${String(data.observedAt).slice(0, 16).replace("T", " ")}` : "")));
    if (path === "/aeo-writer/score") {
      wrap.append(el("p", "c-note",
        `${L("Score ancré réponses", "Answer-grounded score")} : ${dash(data.score)}/100 · ` +
        `${L("couverture prompts", "prompt coverage")} ${dash(data.coverageScore)}% (${data.covered ?? 0} ${L("couverts", "covered")}, ${data.partial ?? 0} ${L("partiels", "partial")}, ${data.absent ?? 0} ${L("absents", "absent")}) · ` +
        `${L("citabilité heuristique", "citability heuristic")} ${dash(data.citabilityScore)}/100`));
      if (data.citabilitySignals) {
        const list = el("ul");
        for (const strength of data.citabilitySignals.strengths?.slice(0, 5) ?? []) list.append(el("li", "", strength));
        for (const gap of data.citabilitySignals.gaps?.slice(0, 5) ?? []) list.append(el("li", "", gap));
        wrap.append(list);
      }
      if (data.rows?.length) {
        const table = el("table", "c-table"); const head = el("tr");
        for (const h of [L("Prompt", "Prompt"), L("Statut", "Status"), L("Termes manquants", "Missing terms"), L("Preuve", "Evidence")]) head.append(el("th", "", h));
        table.append(head);
        for (const row of data.rows) {
          const tr = el("tr");
          tr.append(el("td", "", row.prompt), el("td", "", statusTd(row.status)), el("td", "", row.missingTerms?.length ? row.missingTerms.join(", ") : "—"), el("td", "", row.evidence ?? "—"));
          table.append(tr);
        }
        wrap.append(table);
      } else {
        wrap.append(el("p", "c-note", L("Aucun prompt exploitable dans le panneau stocké : le score reste non évalué.", "No usable prompt in the stored panel: the score stays unevaluated.")));
      }
      wrap.append(el("p", "c-note", data.note ?? ""));
    } else {
      if (!data.drafts?.length) {
        wrap.append(el("p", "c-note", data.note ?? ""));
      }
      for (const draft of data.drafts ?? []) {
        const details = el("details", "ai-crawlers-diff");
        const body = el("div");
        body.append(el("p", "c-note", `${draft.prompt} · ${L("statut", "status")} : ${statusTd(draft.status)}`));
        const list = el("ul");
        for (const title of draft.titles ?? []) list.append(el("li", "", `${title.text} (${title.chars})`));
        body.append(el("p", "", L("Titres proposés", "Proposed titles")), list);
        const outlineList = el("ul");
        outlineList.append(el("li", "", draft.outline?.h1 ?? ""));
        for (const section of draft.outline?.sections ?? []) outlineList.append(el("li", "", `${section.h2}${section.h3?.length ? ` — ${section.h3.join(", ")}` : ""}`));
        body.append(el("p", "", L("Plan proposé", "Proposed outline")), outlineList);
        const faq = el("ul");
        for (const question of draft.outline?.faq ?? []) faq.append(el("li", "", question));
        body.append(el("p", "", L("FAQ suggérée", "Suggested FAQ")), faq);
        body.append(el("p", "c-note", draft.review ?? ""));
        details.append(el("summary", "", L("Brouillon", "Draft")), body);
        wrap.append(details);
      }
      wrap.append(el("p", "c-note", data.note ?? ""));
    }
    result.append(wrap);
  }

  return box;
}
