# Google Business Profile — retail workspace and dashboard

Version 1.0 · 14 November 2026 · Product specification in French, with bilingual delivery requirements.

This specification extends [Global / Local SEO](GLOBAL-LOCAL-SEO.md) and [Local SEO operations](LOCAL-SEO-OPERATIONS.md). It preserves the free, self-hosted core and the existing approval boundary. **Implementation status is explicit below; a feature in this specification is not a claim that it is live.**

## 1. Objectif et références

Un responsable de réseau doit pouvoir répondre à quatre questions : quels établissements sont correctement renseignés, quels résultats Google sont réellement reçus, quelles corrections sont prioritaires et qui doit les exécuter ? Le responsable local retrouve le même parcours, limité à ses établissements.

Deux références distinctes sont utilisées :

- [Localith Retail](https://localith.ai/retail/) pour le périmètre produit : gestion des fiches en réseau, avis, publications et suivi des interactions. GTM reprend ces besoins, avec sa propre implémentation et ses garde-fous.
- Capture fournie le 14 novembre, `image(20261114-140957).png`, présentant ReplyReviews : bloc établissement à gauche, deux cartes de synthèse, jauge de note à droite, répartition des avis et graphique mensuel. Cette capture définit l’organisation visuelle demandée. Ses marques, noms de clients et chiffres ne sont pas des données GTM.

L’interface conserve la navigation, l’authentification et les styles de GTM Growth. Elle n’ajoute pas de menus « Outreach », « Branding », « Subscription » ou de fonctions sans service opérationnel derrière.

## 2. Livraison et limites

| Fonction | Livrée dans cette évolution | Condition ou suite à implémenter |
| --- | --- | --- |
| Dashboard dans la console | Oui : onglet Google Business Profile, sélection établissement / mois / indicateur, cartes et graphique | Connexion opérateur et association de fiche nécessaires pour lire Google |
| Note et nombre d’avis | Lecture à la demande des valeurs fournies par Google pour une fiche | Pas de moyenne réseau ni de compte rendu historique persisté |
| Répartition positive / négative / neutre | Comptage temporaire par étoiles, sur les 50 avis au maximum reçus | Échantillon explicitement signalé ; ce n’est pas une analyse de sentiment du texte |
| Interactions quotidiennes | Lecture à la demande de sept indicateurs, un par graphique | API Performance et accès Google requis ; pas de collecte planifiée WF-04 dans cette livraison |
| Référentiel et accès locaux | Déjà disponibles : import avec aperçu, identifiants stables, délégation par établissement | Parcours de saisie simplifié et groupes régionaux à développer |
| Contrôles et corrections | 24 contrôles existants, actions avec preuves ; téléphone / URL sous approbation indépendante | Horaires, catégories, attributs et changements en lot à développer |
| Réponses aux avis | Spécifiées ci-dessous | Lecture détaillée, brouillon, approbation et publication non implémentés ici |
| Publications / offres / événements | Spécifiés ci-dessous | Aucun calendrier de publication actif dans cette livraison |
| Connexion Google autonome | Spécifiée ci-dessous | Actuellement identifiants OAuth installés côté serveur par l’opérateur |
| Heatmap concurrentielle | Import de positions existant ; représentation géographique à développer | Aucune collecte gratuite de rangs Google supposée ou promise |
| IA locale | Contrat de génération défini ci-dessous | Modèle gratuit auto-hébergé à qualifier ; aucune activation ni solution payante de repli |

Le code livré et le déploiement en production sont deux états différents. La recette en environnement local utilise des fixtures identifiées ; une validation Google réelle exige un compte autorisé, une fiche associée et les API approuvées.

## 3. Parcours cible

### Responsable du siège

1. Définir la marque, les pays, les langues et les responsables ; importer le référentiel avec aperçu des lignes acceptées et rejetées.
2. Faire connecter le compte Google autorisé ; sélectionner les fiches et confirmer chaque correspondance sur l’identité, jamais uniquement sur le nom ou le domaine.
3. Ouvrir le dashboard d’un établissement. Lire la source, la date de récupération et le périmètre avant de comparer les résultats.
4. Ouvrir les contrôles, attribuer une correction avec preuve, responsable et échéance.
5. Prévisualiser les changements, obtenir l’approbation indépendante et publier explicitement dans le périmètre autorisé.
6. Vérifier la réponse du fournisseur et relire la fiche ; distinguer succès API et affichage public sur Maps.
7. Pour les futurs lots, traiter chaque établissement séparément : succès, rejet, conflit, résultat incertain ; relancer uniquement ce qui peut l’être sans doublon.

### Responsable local

Accéder seulement aux établissements délégués ; consulter les résultats, importer une observation autorisée, proposer une correction et suivre son avancement. Un responsable local ne peut ni élargir son périmètre ni approuver sa propre publication. La révocation prend effet sur les nouvelles requêtes et sur le retour des lectures en cours.

### Premier usage et absence de données

- Aucun établissement : afficher le référentiel à importer, sans chiffres de démonstration.
- Établissement non associé : proposer « Relier et contrôler mes fiches », ou demander l’intervention de l’administrateur pour un utilisateur local.
- Fiche associée : « Lire les données Google » lance la lecture actuelle, sans publication.
- Autorisation refusée ou connexion absente : expliquer l’étape de connexion ; conserver le référentiel de l’utilisateur.
- Quota atteint : message spécifique, pas de boucle de relance immédiate.
- Aucune mesure : tiret et explication ; zéro uniquement lorsqu’une valeur zéro est effectivement fournie.
- Activité uniquement web : GBP / Maps non applicables ; orienter vers le SEO du site et Search Console.
- Zone desservie : aucune adresse privée exposée dans le dashboard, les exports ou les contenus générés.

## 4. Dashboard demandé

### Correspondance avec la capture

| Zone de la capture | Implémentation GTM | Règle de compréhension |
| --- | --- | --- |
| Menu et barre supérieure | Coque GTM existante ; onglet Google Business Profile | Pas de deuxième navigation concurrente |
| Business / Snack bar | Établissement, marque, pays, langues, statut d’association | Données du référentiel client, sans inventer catégorie ou adresse |
| Google Business Accounts | Fiche Google associée pour l’établissement : 0 ou 1 | Le connecteur actuel utilise un compte configuré par tenant ; le nombre de comptes actifs ne peut pas être déduit du nombre de fiches |
| Total Reviews | Total fourni par Google | Tous les avis de la fiche à la date de lecture, indépendant du mois du graphique |
| Overall Google Rating | Jauge 0–5 et moyenne Google | Périmètre : établissement sélectionné ; pas d’étiquette « Excellent » ni de seuil arbitraire de confiance |
| Positive / Negative / Neutral | 4–5 étoiles / 1–2 étoiles / 3 étoiles | Taille de l’échantillon, ordre par mise à jour, avis sans note et couverture affichés |
| Monthly impressions | Graphique quotidien, mois et indicateur sélectionnables | Source, jours reçus et valeurs manquantes ; tableau accessible des points |

La structure desktop utilise trois colonnes : deux colonnes pour l’établissement, les cartes et le graphique ; une colonne pour la note. Sous 760 px, la jauge et le graphique passent sous les cartes. Aucun débordement à 390 px ; commandes utilisables au clavier, cibles tactiles de 44 px, états annoncés, valeurs disponibles sans lecture visuelle du graphique.

### Règles des métriques

| Indicateur | Source Google | Ce que l’utilisateur peut conclure |
| --- | --- | --- |
| Vues Maps, mobile / ordinateur | `BUSINESS_IMPRESSIONS_MOBILE_MAPS`, `BUSINESS_IMPRESSIONS_DESKTOP_MAPS` | Exposition sur la surface et l’appareil choisis |
| Vues Search, mobile / ordinateur | `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`, `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH` | Exposition sur la surface et l’appareil choisis |
| Clics vers le site | `WEBSITE_CLICKS` | Clics sur le lien, pas sessions ni ventes attribuées |
| Clics sur Appeler | `CALL_CLICKS` | Clics sur le bouton, pas appels aboutis |
| Demandes d’itinéraire | `BUSINESS_DIRECTION_REQUESTS` | Demandes, pas visites physiques |

Les quatre séries de vues restent séparées : leur somme n’est pas présentée comme une audience unique. Les requêtes portent sur un mois parmi les douze derniers, jusqu’à la veille UTC ; le jour courant n’est pas extrapolé. L’absence d’un jour reste `null`. La date de récupération ne remplace pas la période des mesures. Les jours récents peuvent manquer côté fournisseur.

Le total d’avis et la moyenne proviennent directement de `reviews.list`. La ventilation par étoiles décrit uniquement les avis retournés (page limitée à 50, mise à jour décroissante). Elle peut évoluer après modification d’un avis. Elle n’est exhaustive que si la pagination est terminée et que le nombre retourné correspond au total fourni. Aucune information d’auteur ni commentaire n’est renvoyé au navigateur par ce dashboard.

## 5. Exigences fonctionnelles pour la suite retail

| ID | Action et résultat attendu | Critère de recette |
| --- | --- | --- |
| GBP-01 | Connexion Google autonome avec consentement, choix de compte et fiches | Protection OAuth state/PKCE selon le client, validation du retour, aucun secret dans le navigateur ou les logs ; déconnexion et révocation vérifiées |
| GBP-02 | Regrouper par enseigne, pays et région ; filtrer les établissements | Un filtre change le périmètre visible, jamais les droits serveur ; un utilisateur local ne voit pas les autres groupes |
| GBP-03 | Détecter les écarts de téléphone, URL, horaires et attributs pertinents | Source et date visibles pour chaque écart ; une donnée absente ne devient pas une non-conformité certaine |
| GBP-04 | Modifier les horaires et jours exceptionnels par lot | Diff par fiche, fuseau et jour local ; aucun lot implicite ; validation fournisseur si disponible et contrôle de dérive avant envoi |
| GBP-05 | Boîte des avis : à traiter, brouillon, approuvé, publié, à vérifier | Pagination bornée, accès par fiche, recherche et conservation compatibles avec les règles du fournisseur ; pas de collecte hors périmètre |
| GBP-06 | Rédiger et approuver une réponse à un avis | Réponse liée à la version de l’avis ; invalidation si avis ou brouillon modifié ; consentement explicite avant publication et relecture ensuite |
| GBP-07 | Calendrier d’actualités, offres et événements locaux | Dates, langue, média autorisé et établissement explicites ; aperçu par fiche, approbation versionnée et statut fournisseur séparé du statut éditorial |
| GBP-08 | Proposer une campagne adaptée aux produits vendus localement | Produit et disponibilité documentés par la source client ; pas de stock, promotion, prix ou bénéfice inventé ; incohérence bloque la proposition |
| GBP-09 | Superviser les lots et les erreurs partielles | Clé d’idempotence par cible/version ; reprise bornée ; un succès n’est jamais republié par la relance du lot |
| GBP-10 | Suivre l’évolution des interactions | Fenêtres et indicateurs comparables ; pas de pourcentage si référence nulle ou incomplète ; aucune causalité commerciale supposée |
| GBP-11 | Visualiser les positions importées en grille géographique | Source, requête, langue, appareil, date, coordonnées et identité obligatoires pour comparer ; inconnu distinct de hors classement |
| GBP-12 | Rapports opérationnels et exports | Périmètre autorisé et provenance visibles ; format CSV/PDF accessible ; export de contenu Google soumis aux règles applicables, sans archivage illimité |
| GBP-13 | Alertes sur dérive et échéances | Déduplication, destinataires explicitement autorisés, fréquence bornée ; alerte distincte d’une autorisation d’écriture |
| GBP-14 | Déconnexion et fin de délégation | Plus de nouvelle lecture ni publication ; jobs révoqués, purge des caches concernés et retrait des autorisations documentés |

Les informations structurées de produits sur le site et les campagnes éditoriales sont distinctes du catalogue produit Google. La création de « Product Posts » n’est pas disponible via l’API Local Posts ; cette intégration ne doit pas promettre une synchronisation de catalogue à travers cet endpoint.

## 6. Génération contextuelle et compétition

Le dashboard ne requiert aucun modèle de langage. La future assistance éditoriale utilise un moteur local gratuit, désactivé tant que le matériel et le modèle ne sont pas qualifiés. Les connecteurs de données et les règles déterministes restent utilisables sans IA.

Chaque demande de génération devra fournir : tenant, établissement et marque confirmés, pays, langue du contenu, audience, objectif, produit/service identifié, attributs vérifiés, pages sources datées et éventuelles offres concurrentes sélectionnées par le client. Les sources concurrentes servent à comprendre les alternatives ; elles ne prouvent jamais une propriété du produit du client.

Contrat de sortie : brouillon, identifiants des faits utilisés, liens des preuves, informations manquantes et motif de blocage. Si l’identité du produit, le prix, la promotion ou la disponibilité locale ne sont pas suffisamment établis, demander l’information manquante et ne pas générer de texte générique présenté comme adapté. Les pages externes et les avis sont des données non fiables, jamais des instructions pour le système.

Les réponses aux avis peuvent reprendre les faits attestés et le ton validé de la marque. Elles ne doivent pas inventer un achat, une résolution de litige, un remboursement ou une promesse. Une modification du contexte invalide l’approbation. Aucune publication automatique n’est déduite du seul fait qu’un brouillon a été généré.

## 7. Architecture et contrats

### Implémentation de cette livraison

- `site/console/gbp-dashboard.js` : rendu et filtres ; réponses tardives ignorées après changement de sélection ; aucune persistance locale des données Google.
- `src/console/local-seo.ts`, route authentifiée `POST /api/console/local-seo/gbp/dashboard` : contrat `{siteId, month: "YYYY-MM", metric}` strict, identité et délégation contrôlées avant et après la lecture.
- `src/local-seo/dashboard.ts` : validation de la fenêtre, des nombres, des dates, des doublons et du format fournisseur ; aucune addition silencieuse de sous-séries.
- `src/local-seo/gbp.ts` : hôtes Google fixes, liste de fiches autorisées, quotas, délais et limites de réponse existants ; deux lectures indépendantes. Une panne Performance n’efface pas les avis reçus.
- Réponse : établissement, mois, indicateur, source, date de récupération, blocs `reviews` et `performance` avec statut disponible/indisponible. Aucun jeton ni texte d’avis.
- `Cache-Control: no-store` pour les routes locales. Pas de nouvelle table ni de migration pour ce dashboard. Aucun snapshot du dashboard dans SQLite, aucun export automatique de ces données.

L’endpoint réutilise les privilèges du lecteur existant : administrateur du tenant ou utilisateur explicitement délégué. Les comptes techniques, l’agent IA et l’administration de plateforme sans délégation éditoriale ne disposent pas de cet accès. Le client ne choisit ni tenant, ni compte Google, ni URL réseau, ni identifiant de fiche fournisseur dans la requête.

### Extensions prévues

| Composant | Contrat à implémenter | Garantie |
| --- | --- | --- |
| Connexion | `gbp/connect/start`, callback, comptes/fiches, disconnect | Liaison OAuth chiffrée côté serveur, séparation par tenant, anti-rejeu et révocation |
| Éditorial | Brouillons de réponses et publications avec source/version/langue | Pas de secrets ou de contenu fournisseur dans un journal de diagnostic |
| Approbations | Digest du contenu, des cibles et des faits ; expiration | Auteur différent de l’approbateur, nouvel accord après chaque modification |
| Exécution | Travail par cible, clé d’idempotence, verrou et état incertain | Relecture après timeout ; aucune relance aveugle d’écriture |
| Node-RED | WF-02 fiche, WF-03 avis, WF-07 contrôles, WF-09 relecture, WF-10 synthèse déjà présents | WF-04 Performance reste à développer ; aucun worker ne contourne l’approbation de publication |
| Stockage futur | Tables de brouillons, versions et métadonnées d’exécution | Séparer données propres au client, contenu Google temporaire et traces minimales sans contenu |

Socle : Node.js/TypeScript, SQLite existant, Node-RED, composants HTML/CSS/JS et tests locaux. Aucun fournisseur payant de positions ni modèle payant obligatoire. Les API Google restent un service propriétaire sous autorisation ; elles ne sont pas qualifiées d’open source. L’exploitation de l’hébergement reste un coût distinct de la licence logicielle.

## 8. Gouvernance des données et des publications

Le périmètre doit rester celui des fiches possédées ou gérées avec autorisation. L’application affiche ses actions et propose la déconnexion. Aucun changement Google ne doit être annulé automatiquement. La conservation de contenu fournisseur est temporaire et bornée à 30 jours maximum lorsqu’elle est permise ; toute agrégation stockée ou export historique doit être qualifié avant activation. Cette livraison lit les données du dashboard à la demande sans les stocker.

Pour les futures réponses, campagnes et modifications par lot, l’autorisation doit porter sur le contenu, la langue, les établissements et le calendrier exacts. Les écritures existantes restent limitées au téléphone et à l’URL avec un second administrateur et une fenêtre de 30 minutes. L’interface distingue approbation, envoi, acceptation API, relecture API et observation publique.

Une heatmap concurrentielle ne doit jamais être présentée comme fournie par l’API Performance. Les données de rangs nécessitent une source indépendante autorisée, ou un import manuel avec provenance. Pas de scraping Google Maps introduit dans ce périmètre.

## 9. Présentation publique FR / EN

Remplacer « Plan your local presence for free » par :

| Élément | FR | EN |
| --- | --- | --- |
| Titre | Fiabilisez vos fiches. Suivez les interactions. Agissez localement. | Fix your listings. Track interactions. Take local action. |
| Étape 1 | Rassemblez vos établissements → référentiel partagé et accès locaux | Bring your locations together → shared registry and local access |
| Étape 2 | Consultez votre dashboard Google → note, avis et interactions datés | Read your Google dashboard → dated rating, reviews and interactions |
| Étape 3 | Corrigez et vérifiez → correction attribuée, approuvée et relue | Correct and verify → assigned, approved and read-back corrections |
| Appel à l’action | Ouvrir mon dashboard local | Open my local dashboard |

La présentation indique qu’un espace et une connexion Google autorisée sont nécessaires. Elle réserve les réponses aux avis et campagnes de publications à la suite du parcours. Elle adapte les conseils aux établissements physiques, zones desservies et activités uniquement web.

## 10. Recette et étapes de livraison

### Lot A — livré dans cette évolution

1. Les langues FR/EN présentent les mêmes fonctionnalités et limites.
2. Aucun avis, note ou point du graphique n’est inventé en état vide.
3. Les filtres modifient la requête ; une réponse reçue après un changement ne remplace pas le nouvel écran.
4. Une erreur dans une API n’efface pas les résultats valides de l’autre.
5. Zéro réel, valeur absente, liste partielle et avis sans note sont distincts.
6. Les accès hors tenant, hors délégation et révoqués pendant la lecture sont refusés ; les URL et identifiants fournisseur injectés sont rejetés.
7. Quota, accès refusé et absence de connexion donnent une explication exploitable.
8. Le dashboard reste utilisable à 390 px et au clavier ; le tableau fournit les valeurs du graphique.
9. Les données Google du dashboard ne sont pas enregistrées dans le store, le navigateur ou les logs.
10. La mise en production est validée séparément par le workflow OVH, puis par comparaison des fichiers servis et contrôle santé. Une attente d’approbation d’environnement n’est pas un déploiement réussi.

### Lot B — connexion et gestion du réseau

Livrer l’OAuth autonome, les groupes, la saisie du référentiel et les écarts de fiches, puis tester révocation, quota et dérive avec un tenant pilote autorisé. Étendre les champs publiables seulement après revue des masques et scénarios de validation par type de fiche.

### Lot C — avis et campagnes

Livrer la boîte des avis, les brouillons contextuels, la double validation, le calendrier et l’exécution par cible. Activer progressivement sur quelques fiches pilotes avec métriques d’exploitation : erreurs, conflits, délai de relecture et doublons évités. Ces métriques ne constituent pas une promesse d’amélioration de classement.

### Lot D — pilotage réseau

Livrer les comparaisons compatibles, l’import et le rendu des grilles de positions, les rapports et alertes. Valider les règles de conservation et d’agrégation avant tout historique réseau. Ajouter les nouveaux workflows Node-RED uniquement après tests de reprise, révocation et limites de charge sur le VPS existant.

## Sources techniques vérifiées le 14 novembre 2026

- [Google — Reviews list](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list) : valeurs de synthèse et pagination.
- [Google — Performance time series](https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries) : séries quotidiennes par fiche.
- [Google — DailyMetric](https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric) : sémantique des indicateurs.
- [Google — Business Profile API policies](https://developers.google.com/my-business/content/policies) : autorisation, transparence, conservation et écritures.
- [Google — Prerequisites](https://developers.google.com/my-business/content/prereqs) : approbation du projet et accès API.
- [Google — Posts](https://developers.google.com/my-business/content/posts-data) : actualités, offres, événements et restriction Product Posts.
- [Localith — Retail](https://localith.ai/retail/) : référence fonctionnelle, sans reprendre ses chiffres ni ses engagements commerciaux.
