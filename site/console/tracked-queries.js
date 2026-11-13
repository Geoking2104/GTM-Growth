import { renderDataGuide } from "./data-guidance.js";
import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, callback) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = callback; return b; };

/** Selection and scores are scoped to the currently selected GSC property. */
export function renderTrackedQueries({ state, api, scope, saveSettings }) {
  const box = el("section", "app-strip tracked-queries");
  const property = state.property; const saved = state.me?.tenant?.watchedQueries?.[property] || [];
  const selected = new Set(saved); let rows = null, opportunities = null;
  const admin = state.me?.platformAdmin || state.me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(el("h3", "", L("Requêtes à suivre", "Tracked queries")), el("p", "c-note", L("Requêtes réellement observées dans Search Console, par propriété. Les scores sont des opportunités estimées, pas des prévisions.", "Queries actually observed in Search Console, by property. Scores are estimated opportunities, not forecasts.")), content, message);
  if (!property) { content.append(renderDataGuide("gsc")); return box; }
  const load = async () => {
    message.textContent = L("Chargement des données Search Console…", "Loading Search Console data…");
    try {
      const [queries, scored] = await Promise.all([api("/search/queries", scope({ rowLimit: 100 })), api("/keywords/opportunities", scope({ minImpressions: 0 }))]);
      if (queries.problem || scored.problem) { message.textContent = ""; content.replaceChildren(renderDataGuide("gsc", { error: queries.problem?.message || scored.problem?.message, retry: load })); return; }
      rows = queries.rows || []; opportunities = scored.opportunities || []; message.textContent = ""; draw();
    } catch (error) { message.textContent = ""; content.replaceChildren(renderDataGuide("gsc", { error, retry: load })); }
  };
  const draw = () => {
    content.replaceChildren(el("p", "c-note", `${L("Propriété", "Property")} : ${property}`));
    if (!rows) { content.append(button(L("Charger les requêtes", "Load queries"), load)); return; }
    const byQuery = new Map(rows.filter((r) => r.query).map((r) => [r.query, r]));
    const options = [...new Set([...saved, ...rows.map((r) => r.query).filter(Boolean)])];
    if (!options.length) content.append(el("p", "c-note", L("Aucune requête disponible sur cette période.", "No queries are available for this period.")));
    const list = el("ul", "tracked-list");
    for (const query of options) {
      const row = byQuery.get(query); const opp = opportunities.find((x) => x.query === query);
      const li = el("li"); const label = el("label"); const check = el("input"); check.type = "checkbox"; check.checked = selected.has(query); check.disabled = !admin;
      check.onchange = () => { if (check.checked && selected.size >= 10) { check.checked = false; message.textContent = L("10 requêtes maximum.", "Maximum 10 queries."); return; } if (check.checked) selected.add(query); else selected.delete(query); message.textContent = `${selected.size}/10`; };
      label.append(check, document.createTextNode(` ${query}`)); li.append(label);
      const detail = row ? `${row.clicks ?? 0} ${L("clics", "clicks")} · ${row.impressions ?? 0} impressions · ${L("position", "position")} ${Number(row.position || 0).toFixed(1)} · ${L("score d’opportunité", "opportunity score")} ${opp?.score ?? "—"}` : L("Pas de données sur cette période", "No data for this period");
      li.append(el("p", "c-note", detail)); list.append(li);
    }
    content.append(list);
    if (admin) content.append(button(L("Enregistrer la sélection", "Save selection"), async () => { try { await saveSettings({ watchedQueries: { property, queries: [...selected] } }); message.textContent = L("Sélection enregistrée pour cette propriété.", "Selection saved for this property."); } catch (error) { message.textContent = error.message; } }));
    else content.append(el("p", "c-note", L("Seul un administrateur peut modifier la sélection.", "Only an administrator can change the selection.")));
    content.append(button(L("Actualiser", "Refresh"), load));
  };
  void load(); return box;
}
