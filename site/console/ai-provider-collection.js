import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const NAMES = { claude: "Claude", mistral: "Mistral", grok: "Grok" };
export function providerFailure(reason = "") {
  if (/HTTP (401|403)/.test(reason)) return L("Vérifiez la clé, les droits du modèle et l’accès à la recherche web.", "Check the key, model permissions and web search access.");
  if (/HTTP 429/.test(reason)) return L("Quota ou limite de débit atteint : vérifiez les crédits et attendez avant de réessayer.", "Quota or rate limit reached: check credits and wait before retrying.");
  if (/HTTP (400|404)/.test(reason)) return L("Vérifiez le modèle configuré et sa compatibilité avec la recherche web.", "Check the configured model and its web search compatibility.");
  return L("Réponse incomplète, recherche indisponible ou délai dépassé. Consultez le compte fournisseur ; vous pouvez aussi importer une réponse sauvegardée.", "Incomplete answer, unavailable search or timeout. Check the provider account; you can also import a saved answer.");
}
export function collectionSummary(result) {
  const count = L(`${result.succeeded} réponse(s) enregistrée(s), ${result.failed.length} échec(s).`, `${result.succeeded} answer(s) saved, ${result.failed.length} failed.`);
  const failures = result.failed.map(f => `${f.prompt} — ${f.reason} · ${providerFailure(f.reason)}`).join("\n");
  return `${count}${failures ? `\n${failures}\n${L("Les appels échoués peuvent avoir été facturés.", "Failed calls may have been billed.")}` : ""}`;
}
export function renderProviderCollection({ provider, api, onCollected, onImport }) {
  const name = NAMES[provider], root = el("details", "ai-import ai-provider"); root.dataset.provider = provider;
  const summary = el("summary", "", L(`Collecter avec l’API ${name}`, `Collect with the ${name} API`)), badge = el("span", "v-source", L("Vérification…", "Checking…")); summary.append(document.createTextNode(" · "), badge);
  const status = el("p", "c-note"); status.setAttribute("role", "status");
  root.append(summary, el("p", "c-note", L(`Réponses de l’API ${name}, avec recherche web disponible. Ce ne sont pas des mesures de son interface grand public. Jusqu’à 5 prompts par lancement ; les appels et recherches peuvent être facturés au compte du client, sans plafond monétaire automatique.`, `${name} API answers, with web search available. These do not measure its consumer interface. Up to 5 prompts per run; requests and searches may be billed to the client account, with no automatic monetary cap.`)), status);
  const setup = el("ol", "c-list");
  setup.append(el("li", "", L(`Créez une clé API ${name} avec accès au modèle et à la recherche web ; vérifiez les crédits du compte.`, `Create a ${name} API key with model and web search access; check account credits.`)));
  const serverStep = el("li", "", L("Demandez à l’administrateur de configurer la clé de cet espace sur le serveur, puis de redémarrer l’application. Ne collez pas la clé dans ce formulaire.", "Ask the administrator to configure this workspace’s key on the server and restart the app. Do not paste the key into this form.")); setup.append(serverStep, el("li", "", L("Vérifiez la connexion, renseignez les marques et questions, puis confirmez la collecte. Les réponses enregistrées alimentent les graphiques et la concurrence.", "Check the connection, enter brands and questions, then confirm collection. Saved answers populate the charts and competition view."))); root.append(setup);
  const config = el("label", "c-field"); config.append(el("span", "", L(`Marques et prompts ${name} en JSON`, `${name} brands and prompts as JSON`)));
  const input = el("textarea"); input.rows = 7; input.spellcheck = false; input.placeholder = JSON.stringify({ brands: [{ name: "ExampleBrand", aliases: [] }], prompts: ["What service should I choose?"] }, null, 2); config.append(input);
  const consent = el("label"), checked = el("input"); checked.type = "checkbox"; consent.append(checked, document.createTextNode(L(` J’autorise l’envoi de ces questions à ${name} et les appels potentiellement facturés sur le compte du client.`, ` I authorize sending these questions to ${name} and potentially billable calls on the client account.`)));
  const feedback = el("p", "c-note"); feedback.setAttribute("role", "status"); feedback.style.whiteSpace = "pre-wrap";
  const run = el("button", "btn btn-small", L(`Lancer la collecte ${name}`, `Run ${name} collection`)); run.type = "button"; run.disabled = true;
  const retry = el("button", "c-btn", L("Vérifier la connexion", "Check connection")); retry.type = "button";
  const manual = el("button", "c-btn", L("Importer des réponses sauvegardées", "Import saved answers")); manual.type = "button"; manual.onclick = onImport;
  let configured = false, busy = false;
  async function check() {
    retry.disabled = true; run.disabled = true; configured = false;
    try {
      const state = await api(`/ai-visibility/${provider}-status`, {}); configured = state.configured && state.enabled !== false;
      badge.textContent = configured ? L("Configuré", "Configured") : L("À configurer", "Setup required");
      status.textContent = configured ? L(`Clé configurée · modèle ${state.model}. La disponibilité effective sera vérifiée lors du lancement.`, `Key configured · model ${state.model}. Actual availability is checked when you run collection.`) : L(`Clé absente pour cet espace · modèle ${state.model}. Suivez les étapes ci-dessous ou importez des réponses sauvegardées.`, `No key for this workspace · model ${state.model}. Follow the steps below or import saved answers.`);
      if (state.keyVariable) serverStep.textContent = L(`L’administrateur doit renseigner ${state.keyVariable} dans les secrets du serveur, puis redémarrer l’application. Ne collez pas la clé ici.`, `The administrator must set ${state.keyVariable} in the server secrets and restart the app. Do not paste the key here.`);
    } catch { badge.textContent = L("Statut indisponible", "Status unavailable"); status.textContent = L("Impossible de vérifier la connexion. Réessayez ou utilisez l’import JSON de réponses réelles.", "Could not check the connection. Retry or import real answers as JSON."); }
    finally { retry.disabled = false; run.disabled = busy || !configured; }
  }
  retry.onclick = check;
  run.onclick = async () => {
    if (busy || !configured) return;
    if (!checked.checked) { feedback.textContent = L("Confirmez d’abord l’envoi et la facturation possible.", "First confirm sending the questions and possible charges."); return; }
    let payload; try { payload = JSON.parse(input.value); } catch { feedback.textContent = L("JSON invalide.", "Invalid JSON."); return; }
    if (!payload || !Array.isArray(payload.prompts) || !payload.prompts.length || payload.prompts.length > 5) { feedback.textContent = L("Saisissez entre 1 et 5 prompts.", "Enter 1–5 prompts."); return; }
    busy = true; run.disabled = retry.disabled = true; feedback.textContent = L("Collecte en cours…", "Collecting…");
    try { const result = await api(`/ai-visibility/${provider}-run`, { ...payload, confirmed: true }); feedback.textContent = collectionSummary(result); if (result.id) await onCollected(result); }
    catch (error) { feedback.textContent = `${error.message}\n${providerFailure()} ${L("Des appels ont pu être facturés ; aucune relance automatique.", "Calls may have been billed; no automatic retry.")}`; }
    finally { busy = false; run.disabled = !configured; retry.disabled = false; }
  };
  root.append(retry, config, consent, run, manual, feedback); void check(); return root;
}
