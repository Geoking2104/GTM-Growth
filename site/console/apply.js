/* Apply Mode, phase 0.2: a reviewable robots.txt preview, never an execution UI. */
import { el } from "./render.js";
import { renderDataGuide } from "./data-guidance.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => LANG === "fr" ? fr : en;

function sourceDetails(summary, text) {
  const details = el("details", "apply-source-details");
  details.append(el("summary", "", summary), el("pre", "apply-source", text));
  return details;
}

function renderPreview(result) {
  const preview = result?.preview;
  if (!preview || preview.mode !== "dry-run" || result.writesEnabled !== false)
    throw new Error(L("Réponse de prévisualisation invalide.", "Invalid read-only preview response."));

  const box = el("section", "apply-review");
  box.append(el("h4", "", L("Correctif proposé — non appliqué", "Proposed fix — not applied")));
  box.append(el("p", "c-note", `${preview.target.url} · ${L("Expire le", "Expires at")} ${preview.expiresAt}`));
  box.append(el("p", preview.changed ? "c-note" : "c-note", preview.changed
    ? L("Diff à vérifier avant toute approbation future.", "Review the diff before any future approval.")
    : L("Aucune modification nécessaire.", "No change needed.")));

  if (preview.manualReview?.length) {
    const list = el("ul", "apply-review-warnings");
    for (const item of preview.manualReview) list.append(el("li", "", item));
    box.append(el("p", "c-error", L("Conflit : revue humaine obligatoire.", "Conflict: manual review required.")), list);
  }

  const diff = el("pre", "apply-diff");
  diff.setAttribute("aria-label", L("Diff proposé pour robots.txt", "Proposed robots.txt diff"));
  for (const line of (preview.diff || L("Aucune différence.", "No difference.")).split("\n")) {
    const cls = line.startsWith("+") && !line.startsWith("+++") ? "apply-added"
      : line.startsWith("-") && !line.startsWith("---") ? "apply-removed" : "";
    diff.append(el("span", cls, line));
  }
  box.append(diff);
  box.append(sourceDetails(L("Version observée", "Observed version"), preview.before));
  box.append(sourceDetails(L("Version proposée", "Proposed version"), preview.after));
  box.append(el("p", "apply-hash", `SHA-256 ${L("avant", "before")}: ${preview.observed.sha256}`));
  box.append(el("p", "apply-hash", `SHA-256 ${L("après", "after")}: ${preview.proposedSha256}`));
  box.append(el("p", "c-note", L(
    "Simulation uniquement. Aucun bouton d'application n'est activé : vérification du domaine, approbation, sauvegarde et rollback restent nécessaires.",
    "Preview only. No apply button is enabled: domain verification, approval, backup and rollback are still required.",
  )));
  return box;
}

export function renderApplyMode({ api, me, url }) {
  const box = el("section", "app-strip apply-mode");
  const note = el("p", "c-note", L(
    "Mode Appliquer — copilote, jamais pilote automatique. Visualisez le correctif de robots.txt sans modifier votre site.",
    "Apply Mode — copilot, never autopilot. Preview a robots.txt correction without changing your site.",
  ));
  const form = el("form", "c-form apply-preview-form");
  const label = el("label", "c-field");
  label.append(el("span", "", L("Site enregistré dans cet espace", "Website registered to this workspace")));
  const input = el("input"); input.type = "url";
  input.value = url || (me?.tenant?.domains?.[0] ? `https://${me.tenant.domains[0]}` : "");
  input.placeholder = "https://example.com";
  input.required = true;
  input.autocomplete = "url";
  label.append(input);
  const button = el("button", "btn btn-small", L("Prévisualiser robots.txt", "Preview robots.txt"));
  button.type = "submit";
  const status = el("p", "c-note"); status.setAttribute("role", "status");
  const output = el("div", "apply-preview-output");

  form.append(label, button);
  const load = async () => {
    if (!input.value) { output.replaceChildren(renderDataGuide("domain")); return; }
    button.disabled = true;
    status.textContent = L("Lecture et calcul du diff…", "Reading robots.txt and preparing the diff…");
    output.replaceChildren();
    try {
      const result = await api("/apply/preview", { url: input.value, fix: "robots-ai", mode: "dry-run" });
      output.replaceChildren(renderPreview(result));
      status.textContent = L("Prévisualisation prête. Aucune écriture effectuée.", "Preview ready. No writes performed.");
    } catch (error) {
      status.textContent = "";
      output.replaceChildren(renderDataGuide("geo", { error, retry: load }));
    } finally { button.disabled = false; }
  };
  form.onsubmit = event => { event.preventDefault(); void load(); };

  box.append(el("h3", "", L("Correctifs GEO — Mode Appliquer", "GEO fixes — Apply Mode")), note, form, status, output);
  void load();
  return box;
}
