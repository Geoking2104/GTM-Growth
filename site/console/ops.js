/* Operations console (T-1/T-2/T-4/T-9/T-10/T-11): live AI-visibility runs,
 * keyword rank tracking, article pipeline with quality gates, alerts. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, callback) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = callback; return b; };

export function renderOpsPrompts({ api, me }) {
  const box = el("section", "app-strip ops-prompts");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(el("h3", "", L("Prompts suivis et visibilité IA en direct", "Tracked prompts and live AI visibility")), el("p", "c-note", L("Chaque exécution interroge les moteurs configurés (clés du client) et crée un jeu de données Concurrence à vérifier.", "Each run queries the configured engines (tenant keys) and creates a Competition dataset to review.")), content, message);
  let data = null;
  const input = el("input"); input.placeholder = L("Prompt à suivre (ex. quel outil pour auditer GA4 ?)", "Prompt to track (e.g. best tool to audit GA4?)"); input.size = 60; input.disabled = !admin;
  const load = async () => {
    message.textContent = L("Chargement…", "Loading…");
    try { data = await api("/visibility/prompts", {}); message.textContent = ""; draw(); }
    catch (error) { message.textContent = error.message; }
  };
  const draw = () => {
    const wrap = el("div");
    const engines = (data?.engines ?? []).map((e) => `${e.label} — ${e.configured ? L("clé configurée", "key configured") : L("clé absente", "no key")} (${e.model})`);
    wrap.append(el("p", "c-note", engines.join(" · ") || L("Aucun moteur configuré.", "No engine configured.")));
    const list = el("ul", "tracked-list");
    for (const p of data?.prompts ?? []) {
      const li = el("li");
      li.append(el("span", "", `${p.prompt} `), el("span", "c-note", `(${p.group})`));
      if (p.sourceKind) li.append(el("span", "c-note", p.sourceKind === "inferred" ? L(" · hypothèse non observée", " · unobserved hypothesis") : L(" · formulé par vous", " · user-provided")));
      if (admin) li.append(button(L("Retirer", "Remove"), async () => { try { await api("/visibility/prompts/remove", { id: p.id }); await load(); } catch (error) { message.textContent = error.message; } }));
      list.append(li);
    }
    if (!(data?.prompts ?? []).length) list.append(el("li", "", L("Aucun prompt suivi pour l'instant.", "No tracked prompts yet.")));
    wrap.append(list);
    if (admin) {
      const row = el("p");
      row.append(input, button(L("Suivre ce prompt", "Track this prompt"), async () => { try { await api("/visibility/prompts/add", { prompt: input.value }); input.value = ""; await load(); } catch (error) { message.textContent = error.message; } }));
      wrap.append(row);
      const enginesBox = el("p");
      const checkOpenai = el("input"); checkOpenai.type = "checkbox"; checkOpenai.checked = true;
      const checkGemini = el("input"); checkGemini.type = "checkbox";
      enginesBox.append(checkOpenai, document.createTextNode(" OpenAI "), checkGemini, document.createTextNode(" Gemini "), button(L("Lancer un contrôle maintenant", "Run a check now"), async () => {
        message.textContent = L("Contrôle en cours (borné à 10 prompts)…", "Running check (bounded to 10 prompts)…");
        try {
          const brands = (data?.brands ?? []).length ? data.brands : (me?.tenant?.siteProfiles ? Object.values(me.tenant.siteProfiles).map((p) => ({ name: p.name })) : []);
          const run = await api("/visibility/run", { engines: [checkOpenai.checked ? "openai" : null, checkGemini.checked ? "gemini" : null].filter(Boolean), brands: brands.length ? brands : [{ name: me?.tenant?.name }] });
          message.textContent = L(`Contrôle terminé : ${run.run.succeeded}/${run.run.prompts} réponses collectées. Vérifiez les mentions dans Concurrence.`, `Check done: ${run.run.succeeded}/${run.run.prompts} answers collected. Review mentions under Competition.`);
          await load();
        } catch (error) { message.textContent = error.message; }
      }));
      wrap.append(enginesBox);
    } else wrap.append(el("p", "c-note", L("Seuls les administrateurs peuvent lancer des contrôles.", "Only administrators can run checks.")));
    wrap.append(button(L("Actualiser", "Refresh"), load));
    let runs = null;
    void runs;
    content.replaceChildren(wrap);
    void api("/visibility/runs", {}).then((r) => { runs = r; const rows = (r.runs ?? []).slice(0, 5).map((x) => `${x.ranAt.slice(0, 16).replace("T", " ")} — ${x.succeeded}/${x.prompts} ok${x.failed ? `, ${x.failed} échecs` : ""}`); if (rows.length) content.append(el("p", "c-note", `${L("Derniers contrôles", "Latest checks")} : ${rows.join(" | ")}`)); }).catch(() => {});
  };
  content.append(button(L("Charger", "Load"), load));
  return box;
}

export function renderOpsRank({ api, me }) {
  const box = el("section", "app-strip ops-rank");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(el("h3", "", L("Positions Google suivies", "Tracked Google rankings")), el("p", "c-note", L("Suivi de mots-clés libres avec historique, détection AI Overviews et alertes de chute.", "Arbitrary keyword tracking with history, AI Overview detection and drop alerts.")), content, message);
  const input = el("input"); input.placeholder = L("Mot-clé à suivre", "Keyword to track"); input.size = 40; input.disabled = !admin;
  let board = null;
  const load = async () => {
    message.textContent = L("Chargement…", "Loading…");
    try { const data = await api("/rank/keywords", {}); board = data.board; message.textContent = data.supplier ? `${L("Fournisseur", "Supplier")} : ${data.supplier.provider}` : L("Aucun fournisseur SERP configuré (RANK_SUPPLIER_URL).", "No SERP supplier configured (RANK_SUPPLIER_URL)."); draw(); }
    catch (error) { message.textContent = error.message; }
  };
  const draw = () => {
    const wrap = el("div");
    const rows = (board ?? []).map((k) => ({ keyword: k.keyword, position: k.position ?? "—", url: k.url ?? "", aio: k.aiOverview ? (k.citedInAiOverview ? L("AIO : cité", "AIO: cited") : L("AIO : non cité", "AIO: not cited")) : "", checkedAt: (k.checkedAt ?? "").slice(0, 10), history: k.history.join(" → ") }));
    const table = el("table", "c-table");
    const head = el("tr"); for (const h of [L("Mot-clé", "Keyword"), L("Position", "Position"), "URL", "AIO", L("Vérifié", "Checked"), L("Historique", "History")]) head.append(el("th", "", h));
    table.append(head);
    for (const r of rows) { const tr = el("tr"); for (const v of [r.keyword, String(r.position), r.url, r.aio, r.checkedAt, r.history]) { const td = el("td", "", String(v)); td.style.maxWidth = "220px"; td.style.overflow = "hidden"; td.style.textOverflow = "ellipsis"; tr.append(td); } table.append(tr); }
    wrap.append(table);
    if (!(board ?? []).length) wrap.append(el("p", "c-note", L("Aucun mot-clé suivi.", "No tracked keywords.")));
    if (admin) {
      const row = el("p");
      row.append(input, button(L("Suivre", "Track"), async () => { try { await api("/rank/keywords/add", { keyword: input.value }); input.value = ""; await load(); } catch (error) { message.textContent = error.message; } }),
        button(L("Vérifier les positions maintenant", "Check positions now"), async () => { message.textContent = L("Vérification en cours…", "Checking…"); try { const r = await api("/rank/check", { limit: 25 }); message.textContent = L(`${r.checked} mots-clés vérifiés.`, `${r.checked} keywords checked.`); await load(); } catch (error) { message.textContent = error.message; } }));
      wrap.append(row);
    }
    wrap.append(button(L("Actualiser", "Refresh"), load));
    content.replaceChildren(wrap);
  };
  content.append(button(L("Charger", "Load"), load));
  return box;
}

export function renderOpsArticles({ api, me }) {
  const box = el("section", "app-strip ops-articles");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(el("h3", "", L("Pipeline article avec quality gates", "Article pipeline with quality gates")), el("p", "c-note", L("Brief déterministe, brouillon structuré et contrôles GEO avant création d'un brouillon WordPress. Aucune publication ni annonce IndexNow.", "Deterministic brief, structured draft, and GEO checks before creating a WordPress draft. No publication or IndexNow announcement.")), content, message);
  const keywordInput = el("input"); keywordInput.placeholder = L("Mot-clé cible", "Target keyword"); keywordInput.size = 40;
  let draft = null;
  const draw = () => {
    const wrap = el("div");
    if (!admin) { wrap.append(el("p", "c-note", L("Seuls les administrateurs peuvent générer et publier.", "Only administrators can generate and publish."))); content.replaceChildren(wrap); return; }
    const row = el("p");
    row.append(keywordInput,
      button(L("Générer un brouillon", "Generate draft"), async () => {
        message.textContent = L("Génération…", "Generating…");
        try { const r = await api("/content/draft", { keyword: keywordInput.value, mode: "deterministic", brand: me?.tenant?.name }); draft = r.draft; message.textContent = L("Brouillon généré. Vérifiez les gates ci-dessous.", "Draft generated. Check the gates below."); draw(); }
        catch (error) { message.textContent = error.message; }
      }));
    wrap.append(row);
    if (draft) {
      const gates = el("ul", "tracked-list");
      for (const g of draft.gates ?? []) { const li = el("li"); li.append(el("span", "", `${g.passed ? "✓" : "✗"} ${g.check} — ${g.detail}`)); gates.append(li); }
      const failed = (draft.gates ?? []).filter((g) => !g.passed);
      wrap.append(el("h4", "", draft.title), el("p", "c-note", `${draft.wordCount} mots · ${draft.outline.length} sections · ${L("gates", "gates")} ${failed.length ? `${failed.length} ${L("à corriger", "to fix")}` : L("tous passés", "all passed")}`), gates);
      const body = el("textarea"); body.value = draft.body; body.rows = 14; body.style.width = "100%"; body.setAttribute("aria-label", "Draft body");
      draft.body = body.value;
      body.onchange = () => { draft.body = body.value; };
      const actions = el("p");
      actions.append(button(L("Créer le brouillon WordPress", "Create WordPress draft"), async () => {
        message.textContent = L("Création du brouillon…", "Creating draft…");
        try {
          const r = await api("/content/publish", { draft: { ...draft, approved: true } });
          message.textContent = L(`Brouillon WordPress créé (post ${r.postId}), non publié.`, `WordPress draft created (post ${r.postId}), not published.`);
        } catch (error) { message.textContent = error.message; }
      }));
      wrap.append(body, actions);
    }
    content.replaceChildren(wrap);
  };
  draw();
  return box;
}

export function renderOpsAlerts({ api, me }) {
  const box = el("section", "app-strip ops-alerts");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(el("h3", "", L("Alertes", "Alerts")), el("p", "c-note", L("Chutes de position, pertes de mentions IA, événements du pipeline article.", "Rank drops, AI mention losses, article pipeline events.")), content, message);
  const load = async () => {
    message.textContent = L("Chargement…", "Loading…");
    try { const data = await api("/ops/alerts", {}); message.textContent = ""; draw(data.alerts ?? []); } catch (error) { message.textContent = error.message; }
  };
  const draw = (alerts) => {
    const wrap = el("div");
    if (!alerts.length) wrap.append(el("p", "c-note", L("Aucune alerte non lue.", "No unacknowledged alerts.")));
    const list = el("ul", "tracked-list");
    for (const a of alerts) {
      const li = el("li");
      li.append(el("strong", "", `${a.severity === "critical" ? "🔴" : a.severity === "warn" ? "🟠" : "🔵"} ${a.title}`), document.createTextNode(` — ${a.detail} (${(a.createdAt ?? "").slice(0, 16).replace("T", " ")})`));
      if (admin) li.append(button(L("Marquer lue", "Acknowledge"), async () => { try { await api("/ops/alerts/ack", { id: a.id }); await load(); } catch (error) { message.textContent = error.message; } }));
      list.append(li);
    }
    wrap.append(list, button(L("Actualiser", "Refresh"), load));
    content.replaceChildren(wrap);
  };
  content.append(button(L("Charger", "Load"), load));
  return box;
}
