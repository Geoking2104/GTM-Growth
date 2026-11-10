# GTM Growth — Mise en ligne du moteur d'abonnement Mollie

**Runbook d'architecture, d'implémentation et de déploiement**  
**Version :** 1.0 — 9 novembre 2026  
**Application :** <https://gtm.kayroslab.com/fr/> · Console : <https://gtm.kayroslab.com/console/>  
**Dépôt cible :** <https://github.com/Geoking2104/GTM-Growth>  
**Référence de paiement :** <https://github.com/Geoking2104/openDPE>  
**Statut :** instructions préparatoires — **aucune modification, aucun paiement et aucun déploiement effectués**.

> **Principe directeur :** conserver le moteur open source GTM Growth gratuit et facturer uniquement le service Cloud opéré. Réutiliser **l'organisation marchande Mollie** d'openDPE, **sous réserve que l'entité juridique soit identique**, mais créer un **profil de site GTM Growth distinct** avec ses propres clés test et production. Ne jamais connecter GTM Growth au backend de paiement d'openDPE ni réutiliser ses clés.

## 1. Décisions et périmètre du pilote

| Sujet | Décision pour le pilote | Vérification avant ouverture |
|---|---|---|
| Logiciel auto-hébergé | **0 €**, licence Apache-2.0 | Aucun contrôle de souscription dans la distribution self-hosted |
| Audit public | Lecture gratuite de 10 contrôles, sans compte | Limitation d'usage anti-abus, cache et protection SSRF |
| Cloud Solo | **39 €/mois** | Vérifier le traitement HT/TTC et les prestations incluses |
| Cloud Agence | **149 €/mois** | Vérifier le traitement HT/TTC et les prestations incluses |
| Autres paliers | Hors pilote ; pas de Growth à 99 € ou d'Agency à 249 € implicitement activés | Nouvelle décision commerciale requise avant vente |
| Périodicité | Mensuelle, reconduction automatique, résiliation en ligne | Afficher date de renouvellement et règles de fin d'accès |
| Dépenses IA | Modèle **BYOK** : clés OpenAI/Gemini du client | Affichage explicite des coûts éventuels des fournisseurs tiers |
| Infrastructure | Conserver le VPS OVH et les services existants | Tests de charge, sauvegarde, déploiement ciblé sans interruption |
| Essai de 14 jours | **Non activé par défaut** pour ce premier lot | À ajouter après validation des mandats et de la politique d'essai |
| GEO v2 / Apply Mode | Indépendants de la facturation | Ne pas vendre des fonctions non encore déployées ; validation du propriétaire de domaine toujours nécessaire |

**Point de prix à trancher avant de créer les produits Mollie :** les montants de **39 € et 149 €** sont des hypothèses pilotes approuvées. Le montant **facturé** par Mollie doit être calculé et documenté en tenant compte de la TVA applicable. Ne pas assimiler silencieusement un prix marketing HT à un montant à prélever TTC.

**Critères d'entrée dans le pilote :** compte Cloud existant, identité Keycloak vérifiée, propriétaire/administrateur de l'organisation cliente, domaines autorisés, CGV acceptées et premier paiement effectivement confirmé.

## 2. Constat sur les deux dépôts

### openDPE : source d'expérience, pas moteur à partager

Le dépôt privé `Geoking2104/openDPE` utilise actuellement :

- `backend/src/server.js` : routes `POST /mollie/checkout` et `POST /mollie/webhook` ; création d'un paiement hébergé Mollie.
- `backend/src/payment-plans.js` : achats **ponctuels** de crédits DPE, et non abonnements.
- `backend/src/payment-fulfillment.js` : récupération du paiement depuis l'API Mollie, transaction SQL et traitement idempotent avec `mollie_payment_id` unique.
- `backend/migrate_mollie.sql` : index partiel d'unicité sur l'identifiant de paiement.
- `backend/package.json` : utilisation de `@mollie/api-client` sur Node.js.

**À reprendre :** validation des plans côté serveur, checkout hébergé, récupération du statut par API, unicité des paiements, transaction atomique, journalisation, reprise sur erreur.

**À ne pas reprendre tel quel :** `MOLLIE_PLANS` (montants et crédits DPE), `payment-fulfillment.js` (attribution de crédits), identifiants de clientèle, clé Mollie d'openDPE, URL `api.opendpe.net`, base `payments` d'openDPE ou retour de checkout ouvert sans authentification GTM.

### GTM Growth : point d'intégration

Le dépôt cible a un backend **TypeScript / Node.js / Express**, une console client protégée par **Keycloak**, une séparation multi-tenant et un déploiement Docker Compose sous `/opt/gtm-growth` sur le VPS OVH. Son propre service écoute en interne sur le port `4300` selon `deploy/kayroslab-vps/README.md`.

- Code API : `src/server.ts`, `src/console/`, mécanisme d'authentification et de résolution des tenants existant.
- Frontend : `site/console/`, page commerciale `site/`.
- Déploiement : `deploy/kayroslab-vps/`, `.github/workflows/`.
- Stockages existants : SQLite applicatif/tenants et PostgreSQL **interne à Keycloak**. **Ne pas écrire les données commerciales dans les tables internes de Keycloak.**
- **Aucun moteur d'abonnement Mollie n'a été identifié dans l'état inspecté du dépôt** : les routes, tables, dépendances et droits ci-dessous sont donc **à implémenter**, et non des fonctions déjà en production.

Ne pas modifier les installations `/opt/opendpe` ou `/opt/kayroslab`, leurs processus PM2, leur port `8080/8787`, ni leurs clés de paiement.

## 3. Préparer le profil Mollie GTM Growth

Cette étape s'effectue **dans le compte Mollie existant**, pas en créant nécessairement une seconde organisation.

1. Vérifier que GTM Growth et openDPE sont opérés par **la même entité juridique et sous le même numéro d'immatriculation**. Sinon, demander à Mollie la structure marchande adaptée avant de poursuivre.
2. Connecter un administrateur à <https://my.mollie.com/dashboard> ; menu **Settings → Profiles → Create profile**.
3. Créer un profil dédié à `https://gtm.kayroslab.com`, avec activité « service logiciel/SaaS », coordonnées et nom commercial GTM Growth/KayrosLab.
4. Vérifier sur le site : description des offres et prix, devise EUR, identité commerciale et coordonnées, CGV, confidentialité, modalités de renouvellement, résiliation et remboursements. Attendre la **validation du profil** par Mollie.
5. Dans **Developers → API keys**, créer ou relever les clés **Test** et **Live propres au nouveau profil** ; enregistrer chaque secret immédiatement dans le gestionnaire de secrets serveur. La clé Live ne doit pas être utilisée avant l'accord de mise en production.
6. Vérifier l'activation en production des méthodes compatibles avec un **mandat récurrent** (notamment carte et, si désiré, SEPA/PayPal selon les capacités du profil). Ne pas supposer qu'un moyen de paiement ponctuel permet le prélèvement automatique.
7. Effectuer les tests exclusivement avec la clé **Test**. Les ressources Test et Live sont distinctes.

**Interdictions :** aucune clé dans GitHub, dans le JavaScript public, dans un ticket, dans ce document ou dans des logs. Aucun secret copié de la configuration openDPE. Ne pas utiliser le même profil API sur deux sites.

## 4. Configuration applicative proposée

Créer des variables de configuration **propres à GTM Growth** dans le système de secrets du déploiement existant. Les noms ci-dessous sont **proposés** : ils n'existent pas encore dans la version inspectée.

```dotenv
# Exemple de NOMS uniquement — ne pas mettre de vraie clé dans un fichier versionné.
BILLING_MODE=disabled                  # disabled | test | live
BILLING_CHECKOUT_ENABLED=false
MOLLIE_GTM_API_KEY=<cle_du_profil_GTM_test_ou_live>
MOLLIE_GTM_WEBHOOK_URL=https://gtm.kayroslab.com/api/billing/mollie/webhook
MOLLIE_GTM_RETURN_URL=https://gtm.kayroslab.com/console/?checkout=return
BILLING_CURRENCY=EUR
BILLING_GRACE_DAYS=7
```

- Le backend refuse de démarrer son sous-système de paiement **Live** si une variable indispensable, un secret valide ou le schéma de base manquent.
- Les URL de retour sont choisies côté serveur, sur une **liste d'origines autorisées** ; aucun `returnTo` externe arbitraire.
- Configurer les secrets dans `deploy/kayroslab-vps/.env.local` ou le mécanisme de secrets existant, avec droits restrictifs. **Ne pas versionner le fichier**.
- Le webhook public HTTPS doit traverser Nginx jusqu'au backend GTM Growth. Il **ne passe pas par la session Keycloak**, puisque Mollie est son appelant ; sa sécurité repose sur la vérification auprès de l'API Mollie et la corrélation des identifiants.
- Prévoir une bascule de `test` vers `live` sans changer d'URL de webhook ; toute opération est journalisée sans afficher secrets ou données carte.

## 5. Modèle de données et droits d'accès

Créer un schéma de facturation isolé, avec migrations versionnées et sauvegardes. Un stockage transactionnel dédié est recommandé ; il peut utiliser un **schéma PostgreSQL applicatif distinct**, ou une base SQLite transactionnelle dédiée si le pilote reste mono-VPS, sans couplage au schéma interne de Keycloak.

| Table logique | Champs minimums / invariants |
|---|---|
| `billing_accounts` | `id`, `tenant_id` unique, organisation, adresse de facturation, `mollie_customer_id`, mode `test/live` |
| `billing_subscriptions` | `id`, `billing_account_id`, `plan_key`, `mollie_subscription_id` unique, `status`, dates de période, annulation, prix et devise |
| `billing_payments` | `mollie_payment_id` **unique**, `mollie_subscription_id` nullable (premier paiement), type `first/renewal`, montant en centimes, devise, statut, dates |
| `billing_events` | historique d'événements, identifiant de corrélation, horodatage, statut traité/à rejouer et erreurs expurgées |
| `billing_usage` | `billing_account_id`, période, métrique, quantité consommée ; unicité adaptée pour éviter le double comptage |

**Invariants obligatoires :**

- Un compte de facturation appartient à un tenant/organisation Keycloak vérifié côté backend ; aucun `tenantId` transmis par le navigateur ne constitue une preuve d'autorisation.
- Un achat ne confère des droits qu'au tenant associé au paiement créé **dans le profil GTM Growth**, après vérification serveur de `customerId`, `subscriptionId` si présent, métadonnées, montant, devise et plan.
- Un seul abonnement récurrent actif par compte facturé pour le même produit, sauf cas explicitement modélisé.
- Le backend lit les droits sur son registre d'abonnement ; il ne se fie ni au bouton « payé » du navigateur, ni à une métadonnée non recoupée.
- Les autorisations Cloud ne modifient jamais les droits du moteur auto-hébergé Apache-2.0. Le paiement ne remplace jamais une preuve de propriété du domaine pour les futurs scans Playwright.

### Catalogue de produits (pilotage côté serveur)

```text
solo   : 39.00 EUR / 1 month   # base commerciale à finaliser fiscalement
agency : 149.00 EUR / 1 month  # base commerciale à finaliser fiscalement
```

Les montants Mollie sont les **montants réellement prélevés** après calcul fiscal. Garder la configuration des tarifs dans **un seul module backend** ; le frontend transmet uniquement `planKey`, jamais un prix libre. Les quotas et fonctionnalités de Solo/Agence doivent être arrêtés dans un tableau d'`entitlements` versionné avant la publication de la page Tarifs.

## 6. Flux d'inscription et premier paiement

**Séquence recommandée pour un premier mois payé immédiatement :**

1. L'administrateur de l'organisation s'authentifie dans la console Keycloak, choisit Solo ou Agence et accepte explicitement prix, périodicité et CGV.
2. `POST /api/billing/checkout` (route **à créer**) vérifie l'identité et le tenant, applique le tarif serveur et bloque les doubles demandes de checkout concurrentes.
3. Le backend crée ou retrouve **un customer Mollie propre au compte GTM**, enregistre son identifiant `cst_...`, puis crée un **premier paiement** via `POST /v2/payments` avec :
   - `customerId` correspondant ;
   - `sequenceType: "first"` pour obtenir l'autorisation de paiements ultérieurs ;
   - `amount`, `currency`, `description`, `redirectUrl`, `webhookUrl` ;
   - des métadonnées minimales de corrélation (`billingAccountId`, `planKey`, identifiant de tentative), sans clé ni donnée sensible inutile.
4. Enregistrer le `payment.id` `tr_...` avant de renvoyer `_links.checkout.href`. Rediriger en **GET** vers le checkout hébergé Mollie.
5. À la réception du webhook **ou au retour navigateur**, le serveur interroge `GET /v2/payments/{paymentId}`. Seul un statut **`paid` confirmé par Mollie** permet d'activer la première période de service. Un retour utilisateur ne suffit pas.
6. Vérifier l'existence d'un mandat `pending` ou `valid` selon le moyen de paiement et la procédure Mollie. Créer **une seule subscription** via `POST /v2/customers/{customerId}/subscriptions`, avec `interval: "1 month"`, `webhookUrl`, `metadata` et une **`startDate` située au renouvellement suivant**. Le premier paiement couvre le premier mois : **ne pas le prélever une deuxième fois lors de la création de la subscription**.
7. Enregistrer le `subscription.id` `sub_...`, la prochaine échéance, le plan et l'état. Si le paiement initial est encaissé mais que la création de la subscription échoue, conserver l'accès au mois payé, créer une alerte d'exploitation et rejouer **la création**, après rapprochement, sans refaire payer le premier mois.
8. Afficher une page de confirmation avec statut réel, montant, prochaine date, facture/reçu et bouton de gestion de l'abonnement.

**Très important :** lors de la création d'une subscription ou d'une tentative de paiement susceptible de déclencher un prélèvement, utiliser une **clé d'idempotence Mollie stable par opération** (`Idempotency-Key`) **et** un verrou/identifiant unique en base locale. Le cache d'idempotence Mollie ne dure qu'**une heure** et est lié aux identifiants API : ne jamais le considérer comme une protection permanente contre les doubles abonnements.

### Essai gratuit éventuel (phase ultérieure)

Un essai de 14 jours exige une politique de consentement et de mandat séparée. Certains moyens (carte/PayPal selon configuration) permettent une première autorisation de montant zéro. Ne pas lancer un essai avec prélèvement différé sans valider les moyens compatibles, la date de premier débit, l'information client et les tests de bout en bout. **Non inclus dans le go-live pilote.**

## 7. Webhook, renouvellements et traitement des incidents

**Route à créer :** `POST https://gtm.kayroslab.com/api/billing/mollie/webhook`.

Pour les webhooks classiques Mollie, la requête fournit typiquement `application/x-www-form-urlencoded` avec `id=tr_...`. Elle **ne fournit pas un statut à croire directement**. Le traitement doit :

1. Valider la forme et la taille du corps, journaliser seulement l'identifiant technique.
2. Récupérer le paiement à l'API Mollie **avec la clé du profil GTM**.
3. Vérifier son rattachement au compte GTM : `customerId`, `subscriptionId` pour les renouvellements, métadonnées, montant, devise, `testmode` et contexte du profil.
4. Gérer la particularité des renouvellements : le `tr_...` peut être **inconnu localement** avant le webhook ; le retrouver via `subscriptionId`, puis l'insérer idempotemment.
5. En transaction atomique, insérer/mettre à jour le paiement **une fois** ; activer ou prolonger les droits seulement si `paid` et pour la période correspondante ; empêcher toute double prolongation lors des replays.
6. Enregistrer les statuts `open`, `pending`, `authorized`, `failed`, `canceled`, `expired`, `refunded`, litiges/chargebacks, sans les transformer en « payé ».
7. Répondre `2xx` **seulement après persistance fiable** ; en cas d'échec temporaire, répondre non-`2xx`, conserver la trace et prévoir une réconciliation périodique. Aucune erreur silencieuse.

Mollie appelle le webhook **pour chaque paiement d'abonnement** et **n'envoie pas un événement séparé à chaque changement d'état de subscription**. Prévoir donc une tâche de réconciliation quotidienne listant abonnements et paiements, détectant les écarts et corrigeant les statuts locaux après vérification.

### Politique d'incident proposée pour le pilote

- Paiement de renouvellement non encaissé : état `past_due`, notification, **délai de grâce de 7 jours** proposé, puis accès Cloud en lecture seule si l'incident persiste. La politique exacte doit figurer dans les CGV.
- Webhook manquant : vérification via API et réconciliation, sans paiement supplémentaire automatique improvisé.
- Chargeback/remboursement : réévaluer les droits suivant la période concernée et la politique contractuelle ; **un remboursement ponctuel ne doit pas laisser involontairement l'abonnement actif**.
- Désabonnement : appeler l'API de **résiliation** de la subscription pour empêcher les futurs prélèvements ; conserver les droits jusqu'à la fin du mois **déjà payé**, si telle est la politique commerciale. Afficher la date effective et conserver l'accès à l'export pendant une période communiquée.
- Changement de plan : **au prochain renouvellement** durant le pilote, sans prorata automatique. L'API de mise à jour de subscription permet les changements futurs de montant ; désactiver les changements immédiats jusqu'aux tests de prorata et de TVA.
- Journal d'audit : qui a lancé checkout, annulation, changement de plan et intervention manuelle, avec motif, acteur et horodatage.

## 8. Routes et composants à livrer

| Route / composant proposé | Exposition | Rôle |
|---|---|---|
| `POST /api/billing/checkout` | Admin tenant authentifié | Première transaction et URL Mollie |
| `POST /api/billing/mollie/webhook` | Public HTTPS, vérification Mollie côté serveur | Paiements initiaux et renouvellements |
| `GET /api/billing/status` | Membre autorisé du tenant | Plan, usage, dates, état sans secret |
| `POST /api/billing/cancel` | Admin tenant, confirmation explicite | Résiliation et arrêt des futurs débits |
| `POST /api/billing/change-plan` | Admin tenant | Changement différé de formule |
| `POST /api/billing/reconcile` | Opérateur interne uniquement | Rapprochement et réparation contrôlée |
| `src/billing/*` | Backend | Catalogue, adaptateur Mollie, registre, entitlements, webhooks et tests |
| `site/console/*` | Frontend | Tarifs, checkout, suivi de paiement, factures, consommation, résiliation |

**Garde-fous :** CSRF/session pour mutations utilisateur, RBAC/tenant côté serveur, listes blanches de tarifs et d'URL, idempotence, limites de débit, isolation Test/Live, logs expurgés. Le webhook ne doit pas ouvrir de chemin d'élévation de privilèges ou de mutation sur un tenant arbitraire.

## 9. Préparation commerciale, factures et conformité

Avant l'activation de la clé Live, publier et faire valider :

- [ ] Page Tarifs : nom des formules, montant **HT et/ou TTC selon le public**, TVA, période, reconduction, limites, BYOK et fournisseurs externes exclus.
- [ ] Mentions légales et identification de la structure opérant GTM Growth (qui doivent correspondre au profil Mollie).
- [ ] CGV / conditions d'abonnement : consentement explicite aux prélèvements récurrents, conditions de résiliation, remboursement, assistance, suspension, export et suppression.
- [ ] Politique de confidentialité : données de facturation, Mollie sous-traitant/prestataire, conservation, droits, contacts et sécurité.
- [ ] Émission et stockage des justificatifs/factures : source de vérité, numérotation, échéances, traitement TVA, exports comptables ; **Mollie ne doit pas être supposé produire à lui seul toutes les factures fiscales GTM Growth**.
- [ ] Bouton **« Résilier mon abonnement »** clairement accessible depuis l'espace client ; notification de réception et date d'effet. Vérifier avec le conseil juridique les règles françaises applicables selon clients professionnels/consommateurs.
- [ ] Adresse e-mail de support et procédure de contestation/réclamation.
- [ ] Visibilité des consentements de paiement et du mandat récurrent pendant le checkout.

## 10. Plan de livraison par PR, sans interruption du VPS partagé

**PR 1 — Fondations (sans effet externe)**

- Ajouter schéma/migrations, catalogue Solo/Agence, interfaces Mollie, flags `disabled/test/live`, états et tests unitaires.
- Conserver checkout désactivé et **ne pas injecter de clé Live**.
- Valider idempotence, isolation des tenants, absence de référence à la base ou clé openDPE.

**PR 2 — Parcours complet en Test**

- Ajouter routes, webhook, checkout hébergé, abonnement, annulation, console et rapprochement.
- Exécuter les scénarios de la section 11 avec la clé **Test du profil GTM** ; aucun débit réel.
- Vérifier le rendu de la page Tarifs et les documents contractuels.

**PR 3 — Préparation Live (flag fermé)**

- Ajouter configuration Nginx du webhook (HTTPS, routage GTM uniquement), secrets du profil Live et alarmes.
- Préparer la sauvegarde/restauration de la base GTM et la procédure de retour arrière.
- Revoir les changements de code, dépendances, migrations et journaux avant activation.

**Bascule après approbation humaine expresse :**

1. CI verte : `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` ; contrôle des tests d'intégration et du pipeline de sécurité.
2. Sauvegardes vérifiées, migration **sur base GTM seulement**, aucune modification du schéma Keycloak ou openDPE.
3. Vérifier que le script `deploy/kayroslab-vps/deploy.sh` cible uniquement GTM Growth ; ne redémarrer ni openDPE ni KayrosLab.
4. Déployer d'abord avec `BILLING_MODE=test` et `BILLING_CHECKOUT_ENABLED=false`, vérifier santé, console, API et routage public du webhook.
5. Passer au mode Live **seulement après la validation Mollie et le go/no-go** ; activer le bouton de souscription par feature flag, progressivement.
6. Réaliser un véritable paiement Live **uniquement avec autorisation explicite de son payeur**, puis contrôler compte, abonnement, justificatif, réconciliation et annulation. Aucun test de débit réel automatique.
7. Observer les webhooks, taux de succès checkout, erreurs 5xx, écarts de rapprochement, retards de renouvellement et impact mémoire/CPU du VPS pendant les premières 48 h.

### Contrôles read-only immédiats après déploiement

```bash
curl -fsS https://gtm.kayroslab.com/health
curl -I https://gtm.kayroslab.com/
curl -fsS https://auth.kayroslab.com/realms/gtm-growth/.well-known/openid-configuration
```

Ces commandes ne prouvent **pas** que Mollie, les abonnements et les webhooks fonctionnent : elles complètent la recette métier, et ne doivent pas contenir de clés API.

## 11. Recette obligatoire — scénarios d'acceptation

| ID | Scénario | Résultat attendu |
|---|---|---|
| T01 | Abonnement Solo en Test | Un premier paiement et un seul `customerId`, puis une seule subscription ; droits Solo activés après `paid` |
| T02 | Abonnement Agence en Test | Montant fiscal final correct et droits Agence correctement appliqués |
| T03 | Paiement `failed` / `canceled` / `expired` | Pas d'activation payante |
| T04 | Retour navigateur avant webhook | Statut `pending`/chargement, puis activation après vérification Mollie |
| T05 | Webhook avant retour navigateur | Droits activés correctement ; page de retour reflète l'état serveur |
| T06 | Webhook répété 2, 10 ou 100 fois | Un seul paiement enregistré, une seule période attribuée |
| T07 | Checkout lancé simultanément deux fois | Pas de double abonnement ni double prélèvement |
| T08 | Paiement initial `paid`, création subscription en échec | Premier mois conservé ; reprise sans second débit initial |
| T09 | Renouvellement : nouvel `tr_...` inconnu | Corrélation par `subscriptionId`, prolongation une seule fois |
| T10 | Webhook forgé, mauvais profil, montant ou tenant | Refus de droits, alerte et trace expurgée |
| T11 | Panne base / redémarrage pendant webhook | Reprise fiable et réconciliation, sans perte ni double période |
| T12 | Paiement de renouvellement échoué | Grâce 7 jours selon CGV, notifications, suspension non destructive |
| T13 | Résiliation | Futurs débits stoppés, accès préservé jusqu'à date contractuelle, confirmation envoyée |
| T14 | Upgrade/downgrade | Prix et droits changent seulement à l'échéance planifiée |
| T15 | Refus du moyen de paiement récurrent | Le client reste non abonné, reçoit un message exploitable |
| T16 | Isolation de tenants | Client A ne peut lire/annuler/modifier l'abonnement de B |
| T17 | Mode `disabled` ou `test` | Aucun appel de paiement Live possible |
| T18 | Régression openDPE / KayrosLab | Services, checkout existant et healthchecks inchangés |
| T19 | Self-host GTM Growth | Usage open source inchangé, sans clé ni abonnement Mollie |
| T20 | Annulation suivie de remboursement/chargeback | Pas de droit indûment maintenu ; vérification humaine des cas complexes |

**Critère de réussite :** zéro paiement en double, zéro attribution de droits sans paiement confirmé, zéro accès inter-tenant et aucun incident sur les applications co-hébergées. Toute anomalie P0/P1 bloque l'activation Live.

## 12. Procédure de retour arrière et continuité

En cas d'incident après la mise en ligne :

1. **Couper immédiatement les nouveaux checkouts** (`BILLING_CHECKOUT_ENABLED=false`) ; conserver le webhook et le rapprochement actifs pour les paiements déjà engagés.
2. Empêcher l'attribution de nouveaux droits erronés, sans supprimer les abonnements ni les paiements existants.
3. Consulter les logs expurgés, les identifiants Mollie et la base de facturation ; rapprocher chaque prélèvement avec le registre local.
4. Corriger via une PR ciblée et migration de données auditée ; si une ancienne version du code est rétablie, s'assurer qu'elle comprend toujours les paiements créés entre-temps.
5. **Ne pas annuler en masse des abonnements ou rembourser automatiquement** sous prétexte de rollback technique : chaque paiement réel et chaque période de service requièrent une décision métier traçable.
6. Vérifier explicitement que les services openDPE et KayrosLab restent intacts.

## 13. Points bloquants avant le « GO »

| Gate | Responsable | Preuve attendue | État |
|---|---|---|---|
| G1 | Propriétaire / comptabilité | Même entité juridique pour les deux sites, profil GTM dédié approuvé | À vérifier |
| G2 | Propriétaire / comptabilité | Politique de TVA et prix réellement prélevés pour Solo 39 / Agence 149 | À décider |
| G3 | Produit | Quotas, accès et conditions des deux offres pilotes finalisés | À finaliser |
| G4 | Technique | Paiement initial, mandat, subscription, annulation, webhook, rapprochement implémentés et testés | Non réalisé |
| G5 | Technique | Idempotence, isolation multi-tenant, logs, sauvegardes et monitoring validés | Non réalisé |
| G6 | Juridique / commercial | CGV, confidentialité, factures et résiliation en ligne conformes au public visé | À vérifier |
| G7 | Exploitation | CI verte, recette T01–T20 validée, non-régression VPS partagé | Non réalisé |
| G8 | Propriétaire | **Approbation explicite du déploiement et de la bascule Live** | Non donnée par ce document |

> **GO uniquement si G1 à G8 sont validés.** La rédaction de ce runbook ne vaut ni autorisation de créer des clés, ni de fusionner une PR, ni de facturer des clients, ni de déployer.

## 14. Références techniques officielles

Documentation consultée le **9 novembre 2026** :

- [Mollie — plusieurs profils sous une organisation](https://help.mollie.com/hc/en-us/articles/212613429-Can-I-add-or-change-a-website-profile)
- [Mollie — clés API Test/Live](https://help.mollie.com/hc/en-us/articles/360023732273-What-is-an-API-key)
- [Mollie — paiements récurrents et mandat](https://docs.mollie.com/docs/recurring-payments)
- [Mollie — créer un paiement](https://docs.mollie.com/reference/create-payment)
- [Mollie — créer une subscription](https://docs.mollie.com/reference/create-subscription)
- [Mollie — mettre à jour une subscription](https://docs.mollie.com/reference/update-subscription)
- [Mollie — résilier une subscription](https://docs.mollie.com/reference/cancel-subscription)
- [Mollie — webhooks classiques](https://docs.mollie.com/reference/webhooks)
- [Mollie — idempotence API](https://docs.mollie.com/reference/api-idempotency)
- [Mollie — environnement de test](https://docs.mollie.com/reference/testing)
- [Mollie — conditions de site marchand](https://help.mollie.com/hc/en-us/articles/211745545-What-information-needs-to-be-on-my-website)
- [DGCCRF / Bercy — mentions et résiliation des abonnements](https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter)
- [GTM Growth — déploiement VPS](https://github.com/Geoking2104/GTM-Growth/blob/main/deploy/kayroslab-vps/README.md)
- [openDPE — serveur et parcours Mollie (dépôt privé)](https://github.com/Geoking2104/openDPE/blob/main/backend/src/server.js)

---

**Usage recommandé :** enregistrer ce runbook dans `docs/billing/MOLLIE-SUBSCRIPTIONS-GO-LIVE.md` du dépôt GTM Growth **dans une PR de documentation séparée**, et maintenir le README du projet « English first » avec un simple lien vers la procédure. Cette suggestion ne constitue pas une demande de commit ou de déploiement.
