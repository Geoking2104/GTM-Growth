# Modèle d'observation IA & écarts de citations — Provenance et analyse des sources citées

**Cahier des charges fonctionnel et technique**
Projet : GTM Growth (`gtm-growth`) · Version du document : 1.0 · Date : 2026-11-18
Statut : v1 initiale implémentée (provenance + écarts de citations) ; feuille de référence pour les lots suivants

---

## 0. Résumé exécutif

Le panneau « AI visibility » stocke des réponses IA importées ou collectées, avec leurs citations. La chaîne s'arrête au **stockage** : le produit ne dit pas quelles sources les moteurs citent **à la place de la marque**, ni comment chaque réponse est entrée dans l'espace de travail.

Ce cahier des charges ajoute deux briques au même panneau, sans nouveau service ni appel fournisseur :

1. **Provenance de l'observation** : chaque réponse stockée porte son origine — `imported` (import vérifié par le tenant), `collected` (collecte API bornée explicitement confirmée) ou `unverified` (panneaux antérieurs au champ, jamais ré-étiquetés silencieusement).
2. **Analyse des écarts de citations** (citation gaps) : classification de chaque URL citée — site de la marque suivie (`own`), autres marques suivies (`competitor`), communautés (`reddit`, `youtube`, `linkedin`, `wikipedia`), reste du web (`web`) — et liste bornée des réponses qui mentionnent la marque tout en citant d'autres sources.

L'implémentation initiale est incluse : modèle de données, route console lecture seule, tests. La boucle orchestration-visibility décrite dans le benchmark produit (R1/R2) s'appuie sur ce modèle ; les lots suivants ajoutent les connecteurs d'import normalisés et les vues de part de voix par moteur.

## 1. Contexte et problème

- Le benchmark concurrentiel (novembre 2026) place la boucle *mention → citation → écart* au cœur des leaders GEO/AEO (Profound, Peec AI, Scrunch, Meteoria). GTM Growth stocke les citations des réponses importées et collectées mais ne les analyse pas.
- Une question d'agence typique reste sans réponse : « Sur nos 40 réponses stockées, pourquoi nos pages ne sont-elles pas citées, et qui est cité à notre place ? »
- Sans provenance, un panneau ne distingue pas une réponse importée d'un export fournisseur ou d'une collecte API ; toute agrégation future (part de voix, tendances) devrait deviner l'origine.

## 2. Modèle d'observation canonique

| Champ | Statut v1 | Règles |
|---|---|---|
| `prompt`, `answer`, `source`, `observedAt` | existant | `observedAt` ISO horodaté ; 1 à 1000 réponses par panneau |
| `citations[]`, `citationSpans[]` | existant | URLs publiques http(s), bornées (100), chevauchement interdit |
| `mentions[]` | existant | heuristique v1 + revue humaine (`status` confirmed/rejected) |
| `provenance` | **nouveau v1** | `imported` par défaut sur `/ai-visibility/import` ; `collected` pour toute route de collecte API (OpenAI, Claude, Mistral, Grok, runner planifié) ; un champ porté par la réponse survit à la ré-importation |
| `provenance` absent | héritage | résumés en `unverified` ; jamais requalifié automatiquement |

Sources de vérité : [`normalizeImport`, `summarize`](../../src/console/ai-visibility.ts), [`insertDataset`](../../src/console/ai-visibility-store.ts).

## 3. Analyse des écarts de citations (R2)

### 3.1 Contrat d'API

`/ai-visibility/citation-gaps` — route console lecture seule, bornée au tenant, sans appel fournisseur :

- entrée : `{ datasetId, source?, brand? }` (mêmes filtres que `/ai-visibility/report`) ;
- sortie : totaux (observations, avec citations, citations, réponses mentionnant la marque, dont citation du site propre), sept catégories de citations (`own`, `competitor`, `reddit`, `youtube`, `linkedin`, `wikipedia`, `web`) avec `citations`, `citedPrompts` et part des citations, hôtes les plus cités (≤ 10), écarts (≤ 50) et note de lecture.

### 3.2 Règles de preuve (non négociables)

1. **Site de la marque non déclaré = preuve inconnue** : `evaluated: false`, écarts non calculés, message explicite — jamais un zéro silencieux.
2. **Réponse sans aucune citation = absence de preuve**, pas un écart : elle n'entre pas dans la liste.
3. **Mention rejetée par revue humaine** ne compte ni comme mention ni comme écart.
4. Les URLs citées décrivent **ce panneau stocké uniquement** : ni part de marché moteur, ni sessions consommateurs.
5. La classification communautaire est déclarative par hôte (reddit*, youtube/youtu.be, linkedin/lnkd.in, *.wikipedia.org) et ne présume pas de la nature réelle du contenu.

### 3.3 Implémentation

- Module : [`citationGaps`](../../src/console/ai-citations.ts) ; tests : `tests/ai-citations.test.ts`.
- Réutilisation : `summarize` expose désormais `provenance { imported, collected, unverified }` ; les routes de collecte taggent `collected`.

## 4. Hors périmètre de la v1

- Aucun échantillonnage de sessions consommateurs, aucune estimation de part de marché moteur (les leaders vendent cela ; GTM Growth reste une couche d'orchestration honnête, voir le benchmark).
- Pas de connecteur d'import normalisé par fournisseur (CSV/JSON générique existant ; connecteurs natifs à venir).
- Pas de panneau UI console dédié ni de rapport planifié ; la route est consommable par la console, la CLI et tout client MCP configuré.
- Pas de scoring sémantique des contenus à partir des réponses (citabilité existante inchangée).

## 5. Chargement produit

- Marketing : même preuve que « la réponse mentionne-t-elle la marque ? » (panneau détaillé et daté) ; interprétation bornée au panneau, site propre à déclarer.
- Technique : aucun nouveau service, aucune dépendance, aucun appel réseau ; lecture SQLite existante.
- Registre : ligne « Measure: citation gaps » du [registre de capacités](../journey/CAPABILITIES.md) ; guide de référence des fournisseurs mis à jour dans [AI visibility provider setup](../product/AI-VISIBILITY-PROVIDERS.md).
