/** Static, accessible illustration. No customer data or tracker is loaded. */
export function crmMarkup(locale) {
  const L = (en, fr) => (locale === "fr" ? fr : en);
  const steps = [
    [
      "Web",
      L("An authenticated product visit", "Une visite produit authentifiée"),
      L(
        "The client’s server supplies an account ID and its verified CRM association.",
        "Le serveur du client fournit un ID de compte et son association vérifiée au CRM.",
      ),
    ],
    [
      L("Social", "Réseaux sociaux"),
      L("A documented conversation", "Une conversation documentée"),
      L(
        "A platform-scoped user ID is explicitly linked with a source record. Aggregate impressions remain separate.",
        "Un ID utilisateur propre à la plateforme est explicitement relié à une fiche source. Les impressions agrégées restent séparées.",
      ),
    ],
    [
      L("Manual", "Manuel"),
      L("An advisor’s follow-up", "Un suivi par un conseiller"),
      L(
        "A call or meeting is recorded on the chosen contact, with its date and a human declaration.",
        "Un appel ou rendez-vous est enregistré sur la fiche choisie, avec sa date et une déclaration humaine.",
      ),
    ],
    [
      "Shopify",
      L("A received order", "Une commande reçue"),
      L(
        "The store customer ID is linked to the contact. The order and its observed status are visible with their source.",
        "L’ID client de la boutique est relié au contact. La commande et son statut observé sont visibles avec leur source.",
      ),
    ],
    [
      "PrestaShop",
      L("Another connected store", "Une autre boutique connectée"),
      L(
        "A separate store ID keeps identities distinct until you explicitly confirm the association.",
        "Un identifiant propre à la boutique garde les identités distinctes jusqu’à votre confirmation explicite de la liaison.",
      ),
    ],
  ];
  return `<section class="block section" id="crm-global"><div class="wrap"><div class="crm-public-heading"><div><span class="kicker">${L("Follow the observed journey", "Suivre le parcours observé")}</span><h2 class="title">${L("One contact. Its documented touchpoints.", "Une fiche. Ses points de contact documentés.")}</h2></div><p class="lede">${L("Keep a lightweight CRM in GTM Growth, or connect your client’s CRM through a server plugin. The same clickable timeline brings together sourced web, social, manual and commerce events.", "Gardez un CRM léger dans GTM Growth, ou connectez le CRM du client par un plugin serveur. La même timeline cliquable réunit les événements web, sociaux, manuels et commerciaux sourcés.")}</p></div><div class="crm-public-modes"><article data-card-art="crm"><span>01</span><h3>${L("CRM inside GTM Growth", "CRM dans GTM Growth")}</h3><p>${L("Create contacts, record interactions, inspect identity evidence and export the selected contact.", "Créez des fiches, enregistrez les interactions, consultez les preuves de liaison et exportez le contact sélectionné.")}</p></article><article data-card-art="tracking"><span>02</span><h3>${L("Your CRM, with a plugin", "Votre CRM, avec un plugin")}</h3><p>${L("Keep your existing records. Your server adapter sends exact IDs and authorised events to the shared timeline.", "Conservez vos fiches existantes. Votre adaptateur serveur envoie les ID exacts et les événements autorisés vers la timeline commune.")}</p></article></div><div class="crm-public-demo"><div class="crm-public-demo-top"><strong>${L("Contact 001 · illustrative journey", "Contact 001 · parcours illustratif")}</strong><span>${L("Synthetic example · open a step", "Exemple fictif · ouvrez une étape")}</span></div><ol>${steps.map(([channel, title, proof], i) => `<li><details${i === 0 ? " open" : ""}><summary><span class="crm-public-step">${String(i + 1).padStart(2, "0")}</span><div><small>${channel}</small><strong>${title}</strong></div><span aria-hidden="true">+</span></summary><p>${proof}</p></details></li>`).join("")}</ol><p class="crm-public-boundary">${L("Each link needs evidence. Missing identities stay unlinked; this view is not a complete browsing history or a causal attribution model.", "Chaque liaison exige une preuve. Les identités manquantes restent non reliées ; cette vue n’est ni un historique de navigation complet ni un modèle d’attribution causale.")}</p></div><div class="crm-public-actions"><a class="btn btn-primary" href="/console/?lang=${locale}#crm/connections">${L("Set up my CRM and sources", "Configurer mon CRM et mes sources")} →</a><a href="/console/?lang=${locale}#crm/timeline">${L("Open contacts and timeline", "Ouvrir les contacts et la timeline")} ↗</a></div><p class="journey-access-note">${L("Collection requires administrator activation and authorised sources. Client CRM mode requires a server adapter; vendor-specific connectors are not preinstalled.", "La collecte exige l’activation par un administrateur et des sources autorisées. Le mode CRM client nécessite un adaptateur serveur ; les connecteurs propres aux éditeurs ne sont pas préinstallés.")}</p></div></section>`;
}
