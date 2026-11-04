# Feuille de route UX/UI — site GTM Growth

## Point de départ — 4 novembre 2026

Le site est déjà cohérent sur le fond : une lecture gratuite, un exemple concret,
une console, les outils et une proposition d'accompagnement. En revanche, il présente
très tôt une grande quantité de capacités techniques. Pour un nouveau visiteur, le
bénéfice métier et le prochain geste sont moins immédiats que sur une expérience
orientée produit comme Geoptie.

Cette feuille de route s'inspire de la **structure** de Geoptie, non de son contenu ni
de son design : résultat visible, démonstration du produit, déroulé clair, puis preuves
et intégrations. GTM Growth conserve sa différence : public, open source, sans promesse
de citation ni de données inventées.

## Comparaison utile

| Sujet | Geoptie | GTM Growth aujourd'hui | Décision UX |
|---|---|---|---|
| Promesse hero | Visibilité IA transformée en trafic | Outils et mesure réunis | Ouvrir sur un résultat : être lisible, citable et mesurable |
| Preuve immédiate | Maquette de produit + moteurs IA | Audit OpenDPE et métriques | Garder l'audit réel, rendre les moteurs IA visibles |
| Parcours | Question → réponse IA → source → action → trafic | Outils → console → mesure → prestation | Présenter la même chaîne, adaptée à des signaux vérifiables |
| Navigation | Tâches / outils identifiables | Ancres par sections | Regrouper progressivement par objectif utilisateur |
| Crédibilité | Marques clientes et chiffres commerciaux | Code, rapport, CI et données d'exemple | Ne pas imiter les logos de clients : privilégier preuve reproductible |

## Priorités de réalisation

### P0 — rendre l'offre gratuite réellement démontrable

1. Configurer `gg-api` vers l'API publique. Sans cela, la page GitHub Pages ne peut
   afficher que des exemples et la lecture gratuite ne révèle pas le sitemap visuel.
2. Conserver un état explicite « exemple » quand l'API est indisponible. Aucune métrique
   de trafic ou visibilité ne doit être simulée.
3. Mesurer les événements utiles : lancement de lecture, résultat visible, clic vers le
   rapport d'exemple, clic CLI et demande de prestation. Documenter les événements avant
   de les créer dans GTM.

### P1 — hero et premier écran (livré en partie)

1. Afficher les moteurs IA couverts sous la promesse, avec logos et libellés accessibles.
2. Conserver un seul CTA principal : la lecture gratuite. Le rapport OpenDPE est une
   preuve secondaire, pas un second parcours concurrent.
3. Remplacer les compteurs de dépôt par une preuve plus orientée visiteur lorsque des
   données vérifiées sont disponibles : délai de lecture, nombre de contrôles réalisés,
   actions livrables.

### P2 — convertir l'inventaire en parcours

Créer, après le hero, une section « De l'URL à l'action » en quatre étapes :

1. lire le HTML, robots et sitemap ;
2. détecter les blocages d'indexation, de citabilité et de mesure ;
3. prioriser les correctifs par impact récupérable ;
4. vérifier après publication.

Chaque étape doit pointer vers un résultat concret du produit, et non vers une liste de
fonctionnalités. La console reste une démonstration secondaire pour les visiteurs qui
veulent inspecter les preuves.

### P3 — organiser les outils par tâche

Faire évoluer la navigation et les cartes vers trois groupes :

- **Auditer** : lecture gratuite, GEO, sitemap, citabilité, robots ;
- **Corriger** : `llms.txt`, schema, IndexNow, plan d'action ;
- **Mesurer** : GA4, GTM, Search Console, suivi post-correction.

Les futurs outils gratuits doivent avoir une URL et une intention propres. Éviter de
faire grossir indéfiniment la page d'accueil ou de cacher un outil dans un menu déroulant.

### P4 — résultat de lecture plus décisionnel

Après une lecture serveur, mettre en avant dans cet ordre : score et limites, trois
correctifs prioritaires, sitemap visuel, puis tables détaillées. L'utilisateur doit
comprendre quoi faire avant de consulter toutes les preuves.

Quand une propriété Google est connectée, ajouter les données GA4/Search Console **avec
la période, la source et le statut mesuré**. Les données par URL ne doivent être montrées
que lorsqu'elles ont effectivement été lues depuis une propriété autorisée.

### P5 — confiance et conversion

1. Ajouter une page méthodologie : périmètre de chaque score, limites, fréquence de
   lecture et traitement des données.
2. Séparer « exécuter soi-même » (CLI/MCP) de « se faire accompagner » (prestation) avec
   deux parcours courts, sans cacher l'open source.
3. Utiliser des études de cas vérifiées ; ne pas afficher de logos de clients ou des
   compteurs de visibilité sans autorisation et source explicite.

## Critères de sortie

- Une personne comprend le bénéfice, le CTA et les limites avant le premier scroll.
- Chaque donnée affichée est soit mesurée, soit étiquetée exemple.
- Le résultat de la lecture répond à « que faire maintenant ? » en moins de 10 secondes.
- Les parcours gratuit, autonome et accompagné sont distincts, mais reliés.
- Les versions EN/FR restent fonctionnellement et visuellement équivalentes.
