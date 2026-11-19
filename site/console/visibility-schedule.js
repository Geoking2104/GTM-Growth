import { el } from "./render.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => LANG === "fr" ? fr : en;
const usd = (micros) => (micros / 1_000_000).toLocaleString(L("fr-FR", "en-US"), { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const stateLabel = (state) => ({
  pending: L("En file", "Queued"), leased: L("Attribuées", "Claimed"), calling: L("Appel en cours", "Calling"),
  succeeded: L("Réussies", "Succeeded"), failed: L("Échecs", "Failed"), rate_limited: L("Limitées par le fournisseur", "Provider rate limit"),
  uncertain: L("Issue inconnue", "Uncertain outcome"), revoked: L("Accès révoqué", "Access revoked"), expired: L("Expirées", "Expired"),
  quota_calls: L("Plafond d’appels atteint", "Call quota reached"), quota_cost: L("Budget estimé atteint", "Estimated budget reached"),
  panel_unavailable: L("Panel indisponible", "Panel unavailable"), account_unavailable: L("Compte indisponible", "Account unavailable"),
  panel_storage_full: L("Capacité de stockage des jeux atteinte", "Dataset storage limit reached"),
  access_unavailable: L("Accès indisponible", "Access unavailable"), no_prompts: L("Aucune question suivie", "No tracked prompts"),
})[state] || state;

function field(form, label, input) {
  const wrap = el("label", "c-field");
  wrap.append(el("span", "", label), input);
  form.append(wrap);
  return input;
}
function options(select, entries, selected) {
  select.replaceChildren();
  for (const [value, title] of entries) {
    const option = el("option", "", title); option.value = value; select.append(option);
  }
  if (entries.some(([value]) => value === selected)) select.value = selected;
}
function numberInput(min, max, step, value) {
  const input = el("input");
  input.type = "number"; input.required = true; input.min = String(min); input.max = String(max);
  input.step = String(step); input.value = value === undefined || value === null ? "" : String(value);
  return input;
}
function button(label) {
  const node = el("button", "btn btn-small", label); node.type = "button"; return node;
}

export function renderVisibilitySchedule({ api, admin }) {
  const root = el("section", "app-strip");
  root.hidden = true;
  const status = el("p", "c-note"); status.setAttribute("role", "status");
  const body = el("div");

  async function load() {
    try {
      const data = await api("/visibility/schedule", {});
      if (!data?.available) return;
      root.hidden = false;
      root.replaceChildren(el("h3", "", L("Collecte IA planifiée", "Scheduled AI collection")), status, body);
      const { schedule, runs = [] } = data;
      body.replaceChildren(el("p", "c-note", schedule?.enabled
        ? L(`Prochain créneau UTC · ${schedule.nextAt}`, `Next UTC slot · ${schedule.nextAt}`)
        : L("Collecte en pause.", "Collection paused.")));
      if (admin) {
        const configure = el("details"), fields = el("div");
        configure.append(el("summary", "", L("Configurer la collecte", "Configure collection")), fields);
        configure.ontoggle = async () => {
          if (!configure.open || fields.childElementCount) return;
          fields.append(el("p", "c-note", L("Chargement…", "Loading…")));
          try { fields.replaceChildren(buildForm(await api("/visibility/schedule/options", {}), schedule)); }
          catch (error) { fields.replaceChildren(); status.textContent = error.message; }
        };
        body.append(configure);
        if (schedule?.enabled) {
          const pause = button(L("Mettre en pause", "Pause collection"));
          pause.onclick = () => act(pause, "/visibility/schedule/pause", {});
          body.append(pause);
        }
      }
      for (const run of runs) body.append(runSummary(run));
      const refresh = button(L("Actualiser les créneaux", "Refresh collection runs"));
      refresh.onclick = load;
      body.append(refresh);
    } catch (error) {
      if (root.childElementCount) status.textContent = error.message;
    }
  }

  async function act(trigger, route, payload) {
    trigger.disabled = true;
    status.textContent = "";
    try { await api(route, payload); await load(); }
    catch (error) { status.textContent = error.message; }
    finally { trigger.disabled = false; }
  }

  function buildForm(data, saved) {
    const providers = (data.providers ?? []).filter((item) => item.accounts.length);
    if (!providers.length || !data.panels?.length) {
      const link = el("a", "", L("Ouvrir Visibilité IA", "Open AI Visibility")); link.href = "#ai_visibility";
      const note = el("p", "c-note", L("Enregistrez un compte API et un panel dans Visibilité IA pour planifier la collecte.", "Save an API account and a panel in AI Visibility to schedule collection."));
      note.append(" ", link); return note;
    }
    const form = el("form", "ai-review");
    const panel = field(form, L("Panel", "Panel"), el("select"));
    const provider = field(form, L("Fournisseur", "Provider"), el("select"));
    const account = field(form, L("Compte API enregistré", "Saved API account"), el("select"));
    options(panel, data.panels.map((item) => [item.id, `${item.createdAt.slice(0, 10)} · ${item.brands.join(", ")}`]), saved?.panelId ?? data.panels.at(-1)?.id);
    options(provider, providers.map((item) => [item.id, item.name]), saved?.provider);
    const showAccounts = () => options(account, (providers.find((item) => item.id === provider.value)?.accounts ?? []).map((item) => [item.id, item.label]), saved?.accountId);
    showAccounts(); provider.onchange = showAccounts;
    const interval = field(form, L("Intervalle en heures", "Interval in hours"), numberInput(1, 168, 1, saved?.intervalHours ?? 24));
    const calls = field(form, L("Appels maximum par jour UTC", "Maximum calls per UTC day"), numberInput(1, 4800, 1, saved?.maxDailyCalls));
    const estimate = field(form, L("Estimation par appel en USD", "Estimated USD per call"), numberInput(0.000001, 2000, 0.000001, saved && saved.estimateUsdMicros / 1_000_000));
    const budget = field(form, L("Plafond estimé par jour UTC en USD", "Estimated daily UTC cap in USD"), numberInput(0.000001, 2000, 0.000001, saved && saved.maxDailyUsdMicros / 1_000_000));
    const confirm = el("input"); confirm.type = "checkbox"; confirm.required = true;
    field(form, L("J’autorise les appels facturables dès le premier créneau.", "I authorize billable calls starting with the first slot."), confirm);
    const save = el("button", "btn btn-small", L("Activer la collecte", "Enable collection"));
    save.type = "submit"; form.append(save);
    form.onsubmit = async (event) => {
      event.preventDefault();
      await act(save, "/visibility/schedule/save", {
        confirmed: confirm.checked, panelId: panel.value, provider: provider.value, accountId: account.value,
        intervalHours: Number(interval.value), maxDailyCalls: Number(calls.value),
        estimateUsdMicros: Math.round(Number(estimate.value) * 1_000_000), maxDailyUsdMicros: Math.round(Number(budget.value) * 1_000_000),
      });
    };
    return form;
  }

  function runSummary(run) {
    const row = el("details");
    row.append(el("summary", "", `${run.slot} · ${run.provider} · ${run.planned} ${L("questions", "prompts")}`));
    if (run.decision) row.append(el("p", "c-note", stateLabel(run.decision)));
    const states = Object.entries(run.counts ?? {});
    if (states.length) row.append(el("p", "c-note", states.map(([state, count]) => `${stateLabel(state)} · ${count}`).join(" · ")));
    if (run.publish_failed) row.append(el("p", "c-note", L("Enregistrement du jeu à reprendre.", "Dataset publication will be retried.")));
    if (run.dataset_id) row.append(el("p", "c-note", L("Jeu enregistré dans Visibilité IA.", "Dataset saved in AI Visibility.")));
    if (!run.decision) {
      const costs = [L(`Estimation réservée · ${usd(run.reserved_micros)}`, `Reserved estimate · ${usd(run.reserved_micros)}`)];
      if (run.billed_micros !== null && run.billed_micros !== undefined) {
        costs.push(L(`Facture saisie · ${usd(run.billed_micros)}`, `Invoice entered · ${usd(run.billed_micros)}`),
          L(`Écart · ${usd(run.billed_micros - run.reserved_micros)}`, `Difference · ${usd(run.billed_micros - run.reserved_micros)}`));
      }
      row.append(el("p", "c-note", costs.join(" · ")));
      if (admin && !states.some(([state, count]) => ["pending", "leased", "calling"].includes(state) && count > 0)) {
        const form = el("form", "ai-review");
        const billed = field(form, L("Montant facturé en USD", "Billed amount in USD"), numberInput(0, 2000, 0.000001, run.billed_micros == null ? null : run.billed_micros / 1_000_000));
        const submit = el("button", "btn btn-small", L("Saisir la facture", "Record invoice")); submit.type = "submit";
        form.append(submit);
        form.onsubmit = (event) => { event.preventDefault(); void act(submit, "/visibility/schedule/billed", { runId: run.id, billedUsdMicros: Math.round(Number(billed.value) * 1_000_000) }); };
        row.append(form);
      }
    }
    return row;
  }
  void load();
  return root;
}
