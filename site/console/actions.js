/* Pre-approved action catalog console panel (R11): the governed one-click
 * surface. Members read the catalog and their tenant's operations; proposal,
 * approval, one-click execution, cancellation and reconciliation are
 * tenant-admin acts. Every gesture renders the audit trail the routes return:
 * proposal → approval bound to the exact terms digest → atomic claim →
 * outcome, one journal event per step. Anything outside the catalog keeps its
 * module-level human confirmation: this panel never offers it, and says so. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, callback) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = callback; return b; };
const dash = (value) => value === null || value === undefined ? "—" : String(value);

const STATE_LABELS = {
  fr: { proposed: "proposée", approved: "approuvée", executing: "en exécution", reconciling: "en réconciliation", succeeded: "réussie", failed: "échouée", cancelled: "annulée" },
  en: { proposed: "proposed", approved: "approved", executing: "executing", reconciling: "reconciling", succeeded: "succeeded", failed: "failed", cancelled: "cancelled" },
};
const stateLabel = (state) => (STATE_LABELS[LANG === "fr" ? "fr" : "en"][state] ?? dash(state));
const originLabel = (origin) =>
  origin === "pap"
    ? L("agent PAP (proposition)", "PAP agent (proposal)")
    : origin === "console" ? L("console", "console") : dash(origin);
const when = (ms) => Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : "—";

export function renderOpsActions({ api, me }) {
  const box = el("section", "app-strip ops-actions");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div");
  const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(
    el("h3", "", L("Catalogue d'actions pré-approuvées", "Pre-approved action catalog")),
    el("p", "c-note", L("Trois actions seulement sont éligibles à l'exécution en un clic : soumission IndexNow, génération de brouillon, envoi d'un suivi de rapport dû. Un clic enchaîne approbation (liée aux termes exacts) puis exécution à claim atomique, avec une piste d'audit journalisée à chaque étape. Aucune autre écriture externe (robots/meta, WordPress, GBP, CRM, réseaux sociaux) n'entre jamais dans ce catalogue : elle garde sa confirmation humaine dans son module.", "Only three actions are eligible for one-click execution: IndexNow submission, draft generation, dispatch of a due report follow-up. One click chains approval (bound to the exact terms) then an atomic-claim execution, with a journaled audit trail at every step. No other external write (robots/meta, WordPress, GBP, CRM, social) ever enters this catalog: it keeps its human confirmation in its own module.")),
    content, message,
  );

  /* Catalog: version, eligible actions, explicit exclusions. Every member. */
  const catalogBox = el("div");
  catalogBox.append(el("h4", "", L("Catalogue", "Catalog")), el("p", "c-note", L("Chargement…", "Loading…")));

  /* Propose form: tenant-admin only, strict catalog terms. */
  const actionSelect = el("select");
  for (const [value, text] of [
    ["indexnow.submit", L("Soumission IndexNow", "IndexNow submission")],
    ["draft.generate", L("Génération de brouillon", "Draft generation")],
    ["report.dispatch", L("Envoi d'un suivi de rapport dû", "Dispatch of a due report follow-up")],
  ]) { const o = el("option", "", text); o.value = value; o.selected = value === "indexnow.submit"; actionSelect.append(o); }
  actionSelect.setAttribute("aria-label", L("Action à proposer", "Action to propose"));
  const termsInput = el("textarea"); termsInput.rows = 4; termsInput.style.width = "100%";
  termsInput.placeholder = L('Termes exacts en JSON, ex. {"host":"exemple.fr","key":"…","urls":["https://exemple.fr/page"]}', 'Exact terms as JSON, e.g. {"host":"example.com","key":"…","urls":["https://example.com/page"]}');
  termsInput.setAttribute("aria-label", L("Termes de l'opération (JSON strict du catalogue)", "Operation terms (strict catalog JSON)"));
  const proposeButton = button(L("Proposer", "Propose"), async () => {
    message.textContent = L("Proposition en cours…", "Proposing…");
    let terms;
    try { terms = JSON.parse(termsInput.value); }
    catch { message.textContent = L("Termes invalides : JSON attendu (contrat strict du catalogue).", "Invalid terms: JSON expected (strict catalog contract)."); return; }
    const result = await gesture("/actions/propose", { action: actionSelect.value, terms });
    if (result) message.textContent = L("Opération proposée. Approuvez puis exécutez en un clic quand vous relisez les termes.", "Operation proposed. Approve then run the one-click execution once you reviewed the terms.");
  });
  const proposeBox = el("div");
  proposeBox.append(
    el("h4", "", L("Proposer une opération", "Propose an operation")),
    el("p", "c-note", L("Les termes sont validés strictement par le catalogue (bornes, grammaire, domaine enregistré pour IndexNow) ; la proposition expire après 72 h.", "Terms are strictly validated by the catalog (bounds, grammar, registered domain for IndexNow); the proposal expires after 72 h.")),
  );
  if (admin) {
    const row = el("p");
    row.append(actionSelect, document.createTextNode(" "), proposeButton);
    proposeBox.append(termsInput, row);
  } else {
    proposeBox.append(el("p", "c-note", L("Seuls les administrateurs du client peuvent proposer, approuver, exécuter ou résoudre une opération.", "Only tenant administrators can propose, approve, execute or resolve an operation.")));
  }

  /* Operations ledger + admin gestures + the audit trail of the last gesture. */
  const operationsBox = el("div");
  operationsBox.append(el("h4", "", L("Opérations du client", "Tenant operations")), el("p", "c-note", L("Chargement…", "Loading…")));
  const auditBox = el("details");
  const auditSummary = el("summary", "", L("Piste d'audit de la dernière action", "Audit trail of the last gesture"));
  const auditList = el("div");
  auditBox.append(auditSummary, auditList);
  const auditOf = (events, operationId) => {
    auditList.replaceChildren();
    if (!events?.length) { auditList.append(el("p", "c-note", L("Aucun évènement journalisé pour ce geste.", "No journaled event for this gesture."))); return; }
    const table = el("table", "c-table");
    const head = el("tr");
    for (const h of [L("Quand", "When"), L("Évènement", "Event"), L("Acteur", "Actor"), L("Détail", "Detail")]) head.append(el("th", "", h));
    table.append(head);
    for (const e of events) {
      const tr = el("tr");
      tr.append(el("td", "", when(e.occurredAt)), el("td", "", dash(e.event)), el("td", "", dash(e.actor)), el("td", "", dash(e.detail)));
      table.append(tr);
    }
    auditSummary.textContent = `${L("Piste d'audit", "Audit trail")} · ${dash(operationId)} (${events.length})`;
    auditList.append(table);
  };

  const operationRow = (op) => {
    const tr = el("tr");
    const cells = [
      dash(op.id).slice(0, 13) + "…",
      dash(op.action),
      stateLabel(op.state),
      originLabel(op.origin),
      when(op.createdAt),
      dash(op.attempts),
    ];
    for (const c of cells) tr.append(el("td", "", String(c)));
    if (admin) {
      const act = el("td");
      if (op.state === "proposed" || op.state === "approved") {
        act.append(
          button(L("Exécuter (un clic)", "Run (one click)"), async () => {
            message.textContent = L("Approbation puis exécution en cours…", "Approving then executing…");
            const result = await gesture("/actions/execute", { operationId: op.id, approve: true });
            if (result?.note) message.textContent = result.note;
          }),
          document.createTextNode(" "),
          button(L("Annuler", "Cancel"), async () => { await gesture("/actions/cancel", { operationId: op.id }); }),
        );
      }
      if (op.state === "reconciling") {
        const outcome = el("select");
        for (const [value, text] of [["succeeded", L("réussie (vérifiée)", "succeeded (verified)")], ["failed", L("échouée (vérifiée)", "failed (verified)")]]) { const o = el("option", "", text); o.value = value; o.selected = value === "succeeded"; outcome.append(o); }
        const detail = el("input"); detail.size = 20; detail.placeholder = L("vérification externe", "external verification");
        act.append(outcome, document.createTextNode(" "), detail, document.createTextNode(" "), button(L("Résoudre", "Resolve"), async () => {
          await gesture("/actions/resolve", { operationId: op.id, outcome: outcome.value, detail: detail.value });
        }));
      }
      tr.append(act);
    }
    return tr;
  };

  let operationsCache = [];
  const renderOperations = (operations) => {
    operationsCache = operations ?? [];
    operationsBox.replaceChildren(
      el("h4", "", L("Opérations du client", "Tenant operations")),
      operationsCache.length
        ? (() => {
            const table = el("table", "c-table"); const head = el("tr");
            for (const h of [L("N°", "No."), L("Action", "Action"), L("État", "State"), L("Origine", "Origin"), L("Créée le", "Created"), L("Tentatives", "Attempts"), ...(admin ? [L("Gestes (admin)", "Gestures (admin)")] : [])]) head.append(el("th", "", h));
            table.append(head);
            for (const op of operationsCache) table.append(operationRow(op));
            return table;
          })()
        : el("p", "c-note", L("Aucune opération dans le registre du client pour le moment.", "No operation in this tenant's ledger yet.")),
    );
  };

  /* One wired gesture: call the route, refresh the ledger, show the audit trail. */
  const gesture = async (route, body) => {
    try {
      const result = await api(route, body);
      const operations = await api("/actions/operations", {});
      renderOperations(operations.operations ?? []);
      if (Array.isArray(result?.auditTrail)) auditOf(result.auditTrail, result.operation?.id ?? body.operationId ?? "");
      if (result?.note) message.textContent = result.note;
      if (result?.replay) message.textContent = result.note ?? message.textContent;
      return result;
    } catch (error) {
      message.textContent = error.message;
      return null;
    }
  };

  const load = async () => {
    try {
      const catalog = await api("/actions/catalog", {});
      catalogBox.replaceChildren(
        el("h4", "", L("Catalogue", "Catalog")),
        el("p", "c-note", `${L("Version du catalogue", "Catalog version")} : ${dash(catalog.version)} · ${dash(catalog.actions?.length ?? 0)} ${L("actions éligibles", "eligible actions")}`),
        (() => {
          const table = el("table", "c-table"); const head = el("tr");
          for (const h of [L("Action", "Action"), L("Terme du contrat / effet", "Contract terms / effect")]) head.append(el("th", "", h));
          table.append(head);
          for (const a of catalog.actions ?? []) {
            const tr = el("tr");
            tr.append(el("td", "", `${dash(a.id)} (${dash(a.version)})`), el("td", "", dash(a.title?.[LANG === "fr" ? "fr" : "en"] ?? a.title) + " · " + dash(a.summary?.[LANG === "fr" ? "fr" : "en"] ?? a.summary)));
            table.append(tr);
          }
          return table;
        })(),
        el("p", "c-note", `${L("Jamais éligibles, sans exception ni contournement", "Never eligible, no exception and no bypass")} : ${(catalog.excluded ?? []).map((w) => dash(w.id)).join(", ")}`),
      );
    } catch (error) { catalogBox.replaceChildren(el("h4", "", L("Catalogue", "Catalog")), el("p", "c-note", error.message)); }
    try {
      const operations = await api("/actions/operations", {});
      renderOperations(operations.operations ?? []);
    } catch (error) { operationsBox.replaceChildren(el("h4", "", L("Opérations du client", "Tenant operations")), el("p", "c-note", error.message)); }
  };
  content.append(catalogBox, proposeBox, operationsBox, auditBox);
  void load();
  return box;
}
