/* Commerce console: connect Shopify/PrestaShop stores, sync catalogue and
 * orders, revenue by channel (AI assistants included), product GEO audit list
 * and feed readiness. Credentials are entered once and sealed server-side. */
import { renderDataGuide } from "./data-guidance.js";
import { el, metrics, table } from "./render.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, callback) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = callback; return b; };
const eur = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString(LANG === "en" ? "en-GB" : "fr-FR")} €`);
const CHANNEL_LABELS = { organic: ["Organique", "Organic"], paid: ["Payé", "Paid"], direct: ["Direct", "Direct"], email: ["E-mail", "Email"], social: ["Social", "Social"], ai_assistant: ["Moteur IA", "AI assistant"], referral: ["Referral", "Referral"], unknown: ["Inconnu", "Unknown"] };
const channelLabel = (c) => { const pair = CHANNEL_LABELS[c]; return pair ? (LANG === "fr" ? pair[0] : pair[1]) : c; };

export function renderCommerce({ api, me }) {
  const box = el("section", "app-strip commerce");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(
    el("h3", "", L("Commerce — boutiques connectées", "Commerce — connected stores")),
    el("p", "c-note", L("Connectez Shopify (custom app) ou PrestaShop (clé webservice). Les commandes sont pseudonymisées à l'ingestion : aucun nom ni e-mail n'est stocké.", "Connect Shopify (custom app) or PrestaShop (webservice key). Orders are pseudonymized at ingestion: no name or e-mail is stored.")),
    content, message,
  );
  let data = null;

  const load = async () => {
    message.textContent = L("Chargement…", "Loading…");
    try {
      const [stores, dash] = await Promise.all([api("/commerce/stores", {}), api("/commerce/dashboard", { days: 30 })]);
      data = { stores: stores.stores, dashboard: dash }; message.textContent = ""; draw();
    } catch (error) { message.textContent = ""; content.replaceChildren(renderDataGuide("commerce", { error, retry: load })); }
  };

  const connectForm = () => {
    if (!admin) return el("p", "c-note", L("Seuls les administrateurs peuvent connecter une boutique.", "Only administrators can connect a store."));
    const provider = el("select");
    for (const [value, label] of [["shopify", "Shopify"], ["prestashop", "PrestaShop"]]) { const o = el("option", "", label); o.value = value; provider.append(o); }
    const domain = el("input"); domain.placeholder = L("boutique.myshopify.com ou www.exemple.fr", "store.myshopify.com or www.example.com"); domain.size = 34;
    const credential = el("input"); credential.placeholder = L("Jeton d'accès (Shopify) ou clé webservice (PrestaShop)", "Access token (Shopify) or webservice key (PrestaShop)"); credential.size = 44;
    const secret = el("input"); secret.placeholder = L("Secret webhook (optionnel)", "Webhook secret (optional)"); secret.size = 30;
    const row = el("p");
    row.append(provider, document.createTextNode(" "), domain, document.createTextNode(" "), credential, document.createTextNode(" "), secret, document.createTextNode(" "),
      button(L("Connecter", "Connect"), async () => {
        message.textContent = L("Connexion et vérification des droits…", "Connecting and checking scopes…");
        try {
          const result = await api("/commerce/connect", { provider: provider.value, domain: domain.value, accessToken: credential.value, apiKey: credential.value, webhookSecret: secret.value });
          message.textContent = result.store.status === "insufficient_scopes"
            ? L("Connecté, mais des droits manquent (read_products / read_orders ou ressources webservice).", "Connected, but scopes are missing (read_products / read_orders or webservice resources).")
            : L("Boutique connectée.", "Store connected.");
          await load();
        } catch (error) { message.textContent = error.message; }
      }));
    return row;
  };

  const draw = () => {
    const wrap = el("div");
    const stores = data?.stores ?? [];
    wrap.append(metrics([
      [L("Boutiques", "Stores"), stores.length],
      [L("Commandes (30 j)", "Orders (30 d)"), (data?.dashboard?.revenueByChannel ?? []).reduce((s, r) => s + r.orders, 0)],
      [L("Part moteurs IA", "AI share"), `${data?.dashboard?.aiRevenueShare ?? 0} %`],
      [L("Commandes attribuées", "Attributed"), `${data?.dashboard?.attributedShare ?? 0} %`],
    ]));
    wrap.append(table(stores, [
      ["domain", L("Boutique", "Store")], [(s) => s.provider, L("Plateforme", "Platform")],
      ["currency", L("Devise", "Currency")], ["status", L("État", "Status")], ["connectedAt", L("Connectée le", "Connected on")],
    ]));
    if (stores.length) {
      wrap.append(el("h4", "", L("Revenu par canal — 30 jours", "Revenue by channel — 30 days")));
      wrap.append(table((data?.dashboard?.revenueByChannel ?? []).map((r) => ({ ...r, channelLabel: channelLabel(r.channel) })), [
        ["channelLabel", L("Canal", "Channel")], ["orders", L("Commandes", "Orders")], [(r) => eur(r.revenue), L("Revenu", "Revenue")],
      ]));
      wrap.append(el("p", "c-note", data?.dashboard?.note ?? ""));
      const actions = el("p");
      for (const store of stores) {
        actions.append(button(L(`Synchroniser ${store.domain} (catalogue)`, `Sync ${store.domain} (catalogue)`), async () => {
          message.textContent = L("Synchronisation du catalogue…", "Syncing catalogue…");
          try { const r = await api("/commerce/sync/products", { storeId: store.id }); message.textContent = L(`${r.imported} produits importés${r.done ? " (terminé)" : ` — page suivante : ${r.nextCursor}`}.`, `${r.imported} products imported${r.done ? " (done)" : ` — next page: ${r.nextCursor}`}.`); await load(); } catch (error) { message.textContent = error.message; }
        }));
        actions.append(button(L("Commandes", "Orders"), async () => {
          message.textContent = L("Synchronisation des commandes…", "Syncing orders…");
          try { const r = await api("/commerce/sync/orders", { storeId: store.id }); message.textContent = L(`${r.imported} commandes importées${r.done ? " (terminé)" : ""}.`, `${r.imported} orders imported${r.done ? " (done)" : ""}.`); await load(); } catch (error) { message.textContent = error.message; }
        }));
        if (admin) actions.append(button(L("Déconnecter", "Disconnect"), async () => {
          try { await api("/commerce/disconnect", { storeId: store.id }); await load(); } catch (error) { message.textContent = error.message; }
        }));
        actions.append(document.createTextNode(" · "));
      }
      wrap.append(actions);
    }
    wrap.append(connectForm());
    wrap.append(button(L("Actualiser", "Refresh"), load));
    content.replaceChildren(wrap);
    if (stores.length) {
      void api("/commerce/orders", {}).then((r) => {
        const rows = (r.orders ?? []).slice(0, 10);
        if (!rows.length) return;
        const block = el("div");
        block.append(el("h4", "", L("Dernières commandes", "Latest orders")));
        block.append(table(rows, [
          ["number", L("N°", "No.")], [(o) => new Date(o.createdAt).toLocaleDateString(LANG === "en" ? "en-GB" : "fr-FR"), L("Date", "Date")],
          ["status", L("Statut", "Status")], [(o) => eur(o.total), L("Total", "Total")],
          [(o) => channelLabel(o.channel) + (o.engine ? ` (${o.engine})` : ""), L("Canal (méthode)", "Channel (method)")],
          [(o) => `${o.method} · ${o.confidence}`, L("Attribution", "Attribution")],
        ]));
        content.append(block);
      }).catch(() => {});
      void api("/commerce/feed/readiness", {}).then((r) => {
        if (!r?.feed?.products) return;
        const block = el("div");
        block.append(el("h4", "", L("Feed readiness (Google Merchant, agents)", "Feed readiness (Google Merchant, agents)")));
        block.append(metrics([
          [L("Produits", "Products"), r.feed.products],
          [L("Prêts", "Ready"), r.feed.ready],
          [L("Complétude moyenne", "Avg completeness"), `${r.feed.averageCompleteness} %`],
        ]));
        if (r.feed.missing?.length) block.append(table(r.feed.missing, [["field", L("Champ manquant", "Missing field")], ["products", L("Produits", "Products")]]));
        content.append(block);
      }).catch(() => {});
    }
  };
  void load();
  return box;
}
