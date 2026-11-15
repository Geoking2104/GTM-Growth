import { el } from "./render.js";
import { raw } from "./tools.js";
import { t, tr, actionLabel, LANG } from "./i18n.js";
import { renderDataGuide } from "./data-guidance.js";

function paramField(p) {
  const label = el("label", "c-field"); label.append(el("span", "", tr(p.label)));
  let input;
  if (p.type === "select") { input = el("select"); for (const [v, txt] of p.options) { const o = el("option", "", tr(txt)); o.value = v; input.append(o); } }
  else if (p.type === "textarea") { input = el("textarea"); input.rows = p.rows ?? 4; input.value = p.value ?? ""; }
  else { input = el("input"); input.type = p.type ?? "text"; if (p.value !== undefined) input.value = p.value; if (p.step) input.step = p.step; if (p.placeholder) input.placeholder = p.placeholder; }
  input.name = p.name; label.append(input); return label;
}

export function renderAction(action, { state, api, automaticRoutes }) {
  const card = el("section", "c-card");
  card.append(el("h3", "", actionLabel(action)));
  if (action.help) card.append(el("p", "c-note", tr(action.help)));
  const form = el("form", "c-form");
  for (const p of action.params ?? []) form.append(paramField(p));
  const automatic = action.route && automaticRoutes.has(action.route);
  const btn = el("button", "btn btn-small", automatic ? (LANG === "fr" ? "Actualiser" : "Refresh") : tr(action.button) ?? t("run")); btn.type = "submit"; form.append(btn);
  const out = el("div", "c-out");
  const run = async () => {
    const body = { url: state.url, property: state.property || undefined };
    for (const [k, v] of new FormData(form)) body[k] = v;
    if (action.local) { out.replaceChildren(...[action.local(body)].flat()); return; }
    if (action.needsUrl !== false && !state.url) { out.replaceChildren(renderDataGuide("domain")); return; }
    if (/^\/(search|keywords)\//.test(action.route) && !state.property) { out.replaceChildren(renderDataGuide("gsc")); return; }
    btn.disabled = true; out.replaceChildren(el("p", "c-loading", t("running")));
    try {
      if (action.download) { const blob = await api(action.route, body, { binary: true }); const a = el("a", "btn btn-small", t("download")); a.href = URL.createObjectURL(blob); a.download = action.download; out.replaceChildren(a); a.click(); return; }
      const data = await api(action.route, body);
      if (data.problem) { out.replaceChildren(renderDataGuide(action.route, { error: data.problem.message, retry: run })); return; }
      out.replaceChildren(...[action.render ? action.render(data, body) : []].flat(), raw(data));
      if (data.rows?.length === 0 || data.pages?.length === 0 || data.opportunities?.length === 0) out.prepend(renderDataGuide(action.route, { reason: LANG === "fr" ? "La source a répondu, mais aucun résultat ne correspond à la période ou aux filtres choisis. Élargissez la période ou assouplissez les filtres." : "The source responded, but no results match the selected period or filters. Expand the period or relax the filters." }));
    } catch (error) { out.replaceChildren(renderDataGuide(action.route, { error, retry: run })); }
    finally { btn.disabled = false; }
  };
  form.onsubmit = (event) => { event.preventDefault(); void run(); };
  card.append(form, out);
  // Calling the read directly also works before the card is attached. Native
  // requestSubmit on a detached form was silently cancelled by the browser.
  if (automatic) void run();
  else out.append(el("p", "c-note", action.download
    ? (LANG === "fr" ? "Le PDF est créé à votre demande. Vérifiez le site sélectionné, puis utilisez « Générer le PDF » pour le télécharger." : "The PDF is created on request. Check the selected website, then use “Generate the PDF” to download it.")
    : (LANG === "fr" ? "Cette action nécessite vos paramètres. Complétez les champs ci-dessus puis validez pour afficher le résultat." : "This action needs your inputs. Complete the fields above, then submit to see the result.")));
  return card;
}
