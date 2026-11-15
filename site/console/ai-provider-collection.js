import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
export const PROVIDER_PORTALS = {
  openai: { name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  gemini: { name: "Gemini", url: "https://aistudio.google.com/api-keys" },
  claude: { name: "Claude", url: "https://platform.claude.com/settings/keys" },
  mistral: { name: "Mistral", url: "https://console.mistral.ai/" },
  grok: { name: "Grok", url: "https://console.x.ai/" },
};
export function providerFailure(reason = "") {
  if (/HTTP (401|403)/.test(reason)) return L("Vérifiez la clé, les droits du projet et l’accès au modèle/recherche web.", "Check the key, project permissions and model/web search access.");
  if (/HTTP 429/.test(reason)) return L("Quota ou limite de débit atteint : vérifiez les crédits et attendez avant de réessayer.", "Quota or rate limit reached: check credits and wait before retrying.");
  if (/HTTP (400|404)/.test(reason)) return L("Vérifiez le modèle configuré et sa compatibilité avec la recherche web.", "Check the configured model and its web search compatibility.");
  return L("Vérifiez le compte fournisseur ou importez des réponses sauvegardées. Aucun nouvel appel automatique.", "Check the provider account or import saved answers. No automatic retry.");
}
export function collectionSummary(result) {
  const count = L(`${result.succeeded} réponse(s) enregistrée(s), ${result.failed.length} échec(s).`, `${result.succeeded} answer(s) saved, ${result.failed.length} failed.`);
  const failures = result.failed.map(f => `${f.prompt} — ${f.reason} · ${providerFailure(f.reason)}`).join("\n");
  return `${count}${failures ? `\n${failures}\n${L("Les appels échoués peuvent avoir été facturés.", "Failed calls may have been billed.")}` : ""}`;
}
function field(label, type = "text") {
  const wrapper = el("label", "c-field"), input = el("input"); input.type = type; input.autocomplete = "off";
  wrapper.append(el("span", "", label), input); return { wrapper, input };
}
const button = (label, cls = "c-btn") => { const b = el("button", cls, label); b.type = "button"; return b; };
export function renderProviderCollection({ provider, api, onCollected, onImport }) {
  const { name, url } = PROVIDER_PORTALS[provider], root = el("details", "ai-import ai-provider"); root.dataset.provider = provider;
  const summary = el("summary", "", L(`Collecter avec l’API ${name}`, `Collect with the ${name} API`)), badge = el("span", "v-source", L("Vérification…", "Checking…")); summary.append(document.createTextNode(" · "), badge);
  const status = el("p", "c-note"); status.setAttribute("role", "status");
  const feedback = el("p", "c-note ai-feedback"); feedback.setAttribute("role", "status"); feedback.setAttribute("aria-live", "polite");
  root.append(summary, el("p", "c-note", L("Choisissez le compte API qui financera cette collecte. Se connecter au site du fournisseur ne connecte pas automatiquement son API à GTM Growth.", "Choose the API account that will fund this collection. Signing in to the provider website does not automatically connect its API to GTM Growth.")), status);
  const accountLabel = el("label", "c-field"); accountLabel.append(el("span", "", L(`Compte API ${name}`, `${name} API account`))); const accountsSelect = el("select"); accountsSelect.dataset.accountSelect = provider; accountLabel.append(accountsSelect);
  const accountActions = el("div", "ai-provider-actions"), add = button(L("Ajouter un compte", "Add an account")), check = button(L("Tester le compte sélectionné", "Test selected account")), disconnect = button(L("Déconnecter", "Disconnect")), refresh = button(L("Actualiser les comptes", "Refresh accounts"));
  accountActions.append(add, check, disconnect, refresh); root.append(accountLabel, accountActions);
  const connect = el("section", "ai-account-setup"); connect.hidden = true;
  connect.append(el("h3", "", L(`Connecter un compte API ${name}`, `Connect ${name} API account`)));
  const portal = el("a", "c-btn", L(`1. Ouvrir mon compte ${name} ↗`, `1. Open my ${name} account ↗`)); portal.href = url; portal.target = "_blank"; portal.rel = "noopener noreferrer";
  connect.append(portal, el("p", "c-note", L("Dans le nouvel onglet, connectez-vous avec le compte souhaité et choisissez son projet, organisation ou espace. Créez une clé API, puis revenez ici. Si l’onglet ne s’ouvre pas, utilisez le lien ci-dessus.", "In the new tab, sign in with your chosen account and select its project, organization or workspace. Create an API key, then return here. If the tab does not open, use the link above.")));
  const label = field(L("2. Nom de ce compte dans GTM Growth", "2. Account name in GTM Growth")); label.input.placeholder = L("Ex. Agence · Projet client", "e.g. Agency · Client project"); label.input.maxLength = 80;
  const secret = field(L("Clé API (jamais votre mot de passe)", "API key (never your password)"), "password"); secret.input.maxLength = 4096; secret.input.autocomplete = "new-password"; secret.input.spellcheck = false;
  connect.append(label.wrapper, secret.wrapper);
  const optional = {};
  for (const [key, title] of provider === "openai" ? [["organization", L("ID organisation (facultatif)", "Organization ID (optional)")], ["project", L("ID projet (facultatif)", "Project ID (optional)")]] : provider === "claude" ? [["workspace", L("ID espace Claude (si la clé le demande)", "Claude workspace ID (if required by the key)")]] : []) { optional[key] = field(title); connect.append(optional[key].wrapper); }
  const sharedLabel = el("label", "ai-consent"), shared = el("input"); shared.type = "checkbox"; sharedLabel.append(shared, document.createTextNode(L(" J’autorise GTM Growth à conserver cette clé chiffrée sur son serveur et les administrateurs de cet espace à utiliser ce compte API.", " I authorize GTM Growth to store this key encrypted on its server and this workspace’s administrators to use this API account.")));
  const save = button(L("3. Vérifier et enregistrer le compte", "3. Verify and save account")); const close = button(L("Fermer", "Close")); close.onclick = () => { connect.hidden = true; secret.input.value = ""; };
  connect.append(sharedLabel, save, close, el("p", "c-note", L("Vérification par lecture des modèles, sans génération. La clé n’est jamais réaffichée. Le nom du compte est un libellé que vous choisissez, pas une identité récupérée chez le fournisseur.", "Verification reads the model list without generating an answer. The key is never shown again. The account name is your own label, not an identity retrieved from the provider.")));
  if (provider === "openai") connect.append(el("p", "c-note", L("Connexion ChatGPT OAuth : non activée dans GTM Growth ; elle nécessite l’enregistrement de l’application auprès d’OpenAI. Le parcours disponible ici utilise une clé du projet API choisi.", "ChatGPT OAuth sign-in is not enabled in GTM Growth; it requires registering the application with OpenAI. This connection uses a key from your chosen API project.")));
  root.append(connect);
  const brand = field(L("Marque à observer", "Brand to observe")); brand.input.placeholder = L("Nom réel de votre marque", "Your actual brand name"); brand.input.maxLength = 100;
  const promptLabel = el("label", "c-field"), prompts = el("textarea"); prompts.rows = 4; prompts.placeholder = L("Une question réelle par ligne, jusqu’à 5 questions", "One real question per line, up to 5 questions"); promptLabel.append(el("span", "", L("Questions à poser", "Questions to ask")), prompts);
  const advanced = el("details", "ai-advanced"), config = el("label", "c-field"), json = el("textarea"); json.rows = 6; json.spellcheck = false; advanced.append(el("summary", "", L("Options avancées : panel de marques en JSON", "Advanced: brand panel as JSON"))); config.append(el("span", "", L("Marques et prompts en JSON (remplace les champs ci-dessus)", "Brands and prompts as JSON (overrides fields above)")), json); advanced.append(config);
  const consent = el("label", "ai-consent"), checked = el("input"); checked.type = "checkbox"; checked.dataset.collectionConsent = provider; consent.append(checked, document.createTextNode(L(` J’autorise l’envoi de ces questions à ${name} et les frais possibles sur le compte sélectionné (5 questions maximum, sans plafond monétaire automatique).`, ` I authorize sending these questions to ${name} and possible charges to the selected account (up to 5 questions, no automatic monetary cap).`)));
  const run = button("", "btn btn-small ai-collect"), manual = button(L("Importer des réponses sauvegardées", "Import saved answers")); manual.onclick = onImport;
  root.append(brand.wrapper, promptLabel, advanced, consent, el("div", "ai-provider-actions")); root.lastChild.append(run, manual); root.append(feedback);
  let accounts = [], enabled = provider !== "gemini", model = "", busy = false, removing = false, loadSeq = 0;
  function sync() {
    const selected = accounts.find(a => a.id === accountsSelect.value); checked.checked = false; removing = false;
    run.textContent = !accounts.length ? L(`Connecter un compte ${name}`, `Connect ${name} account`) : !selected ? L("Choisir un compte pour continuer", "Choose an account to continue") : !enabled ? L("Voir pourquoi la collecte est indisponible", "See why collection is unavailable") : L(`Lancer la collecte ${name}`, `Run ${name} collection`);
    run.disabled = busy; check.disabled = busy || !selected; disconnect.disabled = busy || !selected || selected.kind === "server"; add.disabled = refresh.disabled = accountsSelect.disabled = busy;
    disconnect.textContent = L("Déconnecter", "Disconnect");
  }
  function openConnection() {
    connect.hidden = false; feedback.textContent = L("Choisissez votre compte dans le portail ouvert, puis enregistrez sa clé ici. Aucune collecte n’est lancée.", "Choose your account in the opened portal, then save its key here. No collection is started.");
    window.open(url, "_blank", "noopener,noreferrer"); label.input.focus();
  }
  add.onclick = openConnection; accountsSelect.onchange = sync;
  async function load(selected = accountsSelect.value) {
    const seq = ++loadSeq;
    const results = await Promise.allSettled([api("/ai-visibility/accounts", { provider }), api(`/ai-visibility/${provider}-status`, {})]);
    if (seq !== loadSeq) return;
    if (results[1].status === "fulfilled") { enabled = results[1].value.enabled !== false; model = results[1].value.model; }
    accounts = results[0].status === "fulfilled" ? results[0].value.accounts || [] : [];
    accountsSelect.replaceChildren(); const none = el("option", "", L("Choisir un compte…", "Choose an account…")); none.value = ""; accountsSelect.append(none);
    for (const account of accounts) { const option = el("option", "", `${account.kind === "server" ? L("Compte configuré sur le serveur", "Server-configured account") : account.label}${account.fingerprint ? ` · ${account.fingerprint}` : ""}`); option.value = account.id; accountsSelect.append(option); }
    accountsSelect.value = accounts.some(a => a.id === selected) ? selected : "";
    badge.textContent = results[0].status === "rejected" ? L("Statut indisponible", "Status unavailable") : accounts.length ? L(`${accounts.length} compte(s)`, `${accounts.length} account(s)`) : L("À connecter", "Connect account");
    status.textContent = results[0].status === "rejected" ? L("Impossible de charger les comptes. Actualisez ou ouvrez le portail fournisseur. Aucune collecte lancée.", "Could not load accounts. Refresh or open the provider portal. No collection started.") : !enabled ? L("Gemini : la collecte Google Search reste indisponible tant que les suggestions Google ne peuvent pas être affichées. Connectez le compte pour le préparer ou utilisez l’import de réponses sauvegardées.", "Gemini: Google Search collection remains unavailable until Google suggestions can be displayed. Connect an account to prepare it, or import saved answers.") : accounts.length ? L(`Sélectionnez explicitement le compte à utiliser. Modèle : ${model}.`, `Explicitly select the account to use. Model: ${model}.`) : L("Aucun compte API connecté : le bouton ci-dessous ouvre la connexion, au lieu de rester inactif.", "No API account connected: the button below opens account setup instead of remaining inactive.");
    sync();
  }
  refresh.onclick = () => load();
  save.onclick = async () => {
    if (busy) return;
    if (!label.input.value.trim() || !secret.input.value.trim() || !shared.checked) { feedback.textContent = L("Renseignez le nom, la clé API et l’accord de partage avec les administrateurs de cet espace.", "Enter an account name, API key and consent to share with workspace administrators."); return; }
    const payload = { provider, label: label.input.value, key: secret.input.value, confirmed: true };
    for (const [key, value] of Object.entries(optional)) if (value.input.value.trim()) payload[key] = value.input.value.trim();
    secret.input.value = ""; busy = true; save.disabled = true; sync(); feedback.textContent = L("Vérification du compte, sans génération…", "Checking account, without generation…");
    try { const result = await api("/ai-visibility/accounts/connect", payload); await load(result.id); connect.hidden = true; shared.checked = false; feedback.textContent = L("Compte vérifié et enregistré. Saisissez vos questions puis confirmez la collecte. La vérification ne garantit pas les crédits ni l’accès à la recherche web.", "Account verified and saved. Enter questions, then confirm collection. Verification does not guarantee credits or web search access."); }
    catch (error) { feedback.textContent = `${error.message} · ${providerFailure(error.message)}`; }
    finally { busy = false; save.disabled = false; sync(); }
  };
  check.onclick = async () => { if (busy || !accountsSelect.value) return; busy = true; sync(); feedback.textContent = L("Vérification…", "Checking…"); try { await api("/ai-visibility/accounts/check", { provider, accountId: accountsSelect.value }); feedback.textContent = L("Accès à la liste des modèles confirmé, sans génération. Les crédits et l’accès à la recherche seront vérifiés à la collecte.", "Model-list access confirmed without generation. Credits and search access are checked when collecting."); } catch (error) { feedback.textContent = `${error.message} · ${providerFailure(error.message)}`; } finally { busy = false; sync(); } };
  disconnect.onclick = async () => { if (busy) return; if (!removing) { removing = true; disconnect.textContent = L("Confirmer la déconnexion", "Confirm disconnection"); feedback.textContent = L("Retirer cet accès de GTM Growth pour cet espace ? Les réponses enregistrées seront conservées. Cela ne révoque pas la clé chez le fournisseur.", "Remove this workspace’s access from GTM Growth? Saved answers are kept. This does not revoke the key at the provider."); return; } busy = true; sync(); try { await api("/ai-visibility/accounts/disconnect", { provider, accountId: accountsSelect.value, confirmed: true }); await load(""); feedback.textContent = L("Compte déconnecté de cet espace.", "Account disconnected from this workspace."); } catch (error) { feedback.textContent = error.message; } finally { busy = false; sync(); } };
  run.onclick = async () => {
    if (busy) return;
    if (!accounts.length) { openConnection(); return; }
    if (!accountsSelect.value) { feedback.textContent = L("Choisissez le compte API qui financera la collecte.", "Choose the API account that will fund this collection."); accountsSelect.focus(); return; }
    if (!enabled) { feedback.textContent = status.textContent; onImport(); return; }
    if (!checked.checked) { feedback.textContent = L("Confirmez d’abord l’envoi et les frais possibles pour le compte sélectionné.", "First confirm sending and possible charges for the selected account."); return; }
    let payload;
    try { payload = json.value.trim() ? JSON.parse(json.value) : { brands: [{ name: brand.input.value.trim(), aliases: [] }], prompts: prompts.value.split("\n").map(p => p.trim()).filter(Boolean) }; }
    catch { feedback.textContent = L("JSON invalide.", "Invalid JSON."); return; }
    if (!payload || !Array.isArray(payload.prompts) || payload.prompts.length < 1 || payload.prompts.length > 5 || !Array.isArray(payload.brands) || !payload.brands.length || payload.brands.some(b => typeof b?.name !== "string" || b.name.trim().length < 3)) { feedback.textContent = L("Renseignez une marque (3 caractères minimum) et 1 à 5 questions.", "Enter a brand (at least 3 characters) and 1–5 questions."); return; }
    if (payload.prompts.some(p => typeof p !== "string" || !p.trim() || p.length > 2000) || new Set(payload.prompts.map(p => p.trim())).size !== payload.prompts.length) { feedback.textContent = L("Chaque question doit être unique et contenir entre 1 et 2 000 caractères.", "Each question must be unique and contain 1–2,000 characters."); return; }
    busy = true; sync(); feedback.textContent = L("Collecte en cours…", "Collecting…");
    try { const result = await api(`/ai-visibility/${provider}-run`, { ...payload, accountId: accountsSelect.value, confirmed: true }); feedback.textContent = collectionSummary(result); if (result.id) await onCollected(result); }
    catch (error) { feedback.textContent = `${error.message}\n${providerFailure(error.message)} ${L("Des appels ont pu être facturés ; aucune relance automatique.", "Calls may have been billed; no automatic retry.")}`; }
    finally { busy = false; sync(); }
  };
  sync(); void load(); return root;
}
