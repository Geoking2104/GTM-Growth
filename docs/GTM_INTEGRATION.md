# Google Tag Manager ↔ GA4 Integration

**Cahier des charges & Spécifications techniques**  
Projet : **Google Growth**  
Version : 1.2  
Date : 1 novembre 2026  
Statut : Phase 1 et Phase 2 implémentées (v0.11.0)

---

## 1. Contexte & Objectif

Google Tag Manager (GTM) est la couche de collecte principale pour la plupart des implémentations GA4.  
L’objectif de cette intégration est de permettre à **Grok** de :

- Comprendre **comment** les données arrivent dans GA4 (via quels tags GTM)
- Auditer la qualité de la configuration GTM liée à une property GA4
- Diagnostiquer les problèmes de tracking (événements manquants, Measurement ID incorrect, paramètres absents…)
- Faire le lien clair entre un **conteneur GTM** et une **property GA4**
- Analyser en profondeur triggers, variables et paramètres d’événements

Référence officielle Google :  
[Configurer Google Analytics 4 avec Google Tag Manager](https://support.google.com/tagmanager/answer/14842164)

---

## 2. Périmètre fonctionnel global

### 2.1 Phase 1 – Lecture seule + Audit (MVP) → **Implémentée**

| ID | Tool | Statut |
|----|------|--------|
| GTM-01 | `list_gtm_accounts` | ✅ |
| GTM-02 | `list_gtm_containers` | ✅ |
| GTM-03 | `list_gtm_workspaces` | ✅ |
| GTM-04 | `list_gtm_tags` | ✅ |
| GTM-05 | `get_ga4_tags` | ✅ |
| GTM-06 | `get_gtm_container_summary` | ✅ |
| GTM-07 | `audit_ga4_setup` | ✅ |

### 2.2 Phase 2 – Enrichissement (Triggers, Variables, Audit avancé)

| ID | Tool | Description | Priorité |
|----|------|-------------|----------|
| GTM-09 | `list_gtm_triggers` | Lister tous les triggers d’un workspace | Must |
| GTM-10 | `get_trigger_details` | Détail complet d’un trigger (type, filtres, conditions) | Must |
| GTM-11 | `list_gtm_variables` | Lister toutes les variables (built-in + user-defined) | Must |
| GTM-12 | `get_variable_details` | Détail d’une variable | Should |
| GTM-13 | `get_tag_details` | Détail complet d’un tag (paramètres, triggers liés, priorités) | Must |
| GTM-14 | `analyze_event_parameters` | Analyser les paramètres envoyés par les tags GA4 Event | Must |
| GTM-15 | `find_tags_by_trigger` | Trouver tous les tags déclenchés par un trigger donné | Should |
| GTM-16 | `find_tags_using_variable` | Trouver les tags qui utilisent une variable | Should |
| GTM-17 | `audit_ga4_setup_v2` | Audit avancé (remplace/enrichit la v1) | Must |
| GTM-18 | `compare_gtm_vs_ga4_events` | Croiser les événements déclarés dans GTM avec ceux réellement reçus dans GA4 | Must |
| GTM-19 | `detect_duplicate_tags` | Détecter les tags GA4 en double ou conflictuels | Should |
| GTM-20 | `get_built_in_variables` | Lister les variables intégrées activées | Should |

### 2.3 Phase 3 – Écriture contrôlée (futur)

- Création / mise à jour de tags GA4 Event
- Modification de paramètres
- Publication de workspace (avec confirmation explicite)

---

## 3. Phase 2 – Spécification détaillée & Scénarios

### 3.1 Objectifs de la Phase 2

1. Donner à Grok une **vision complète** de la logique de déclenchement (triggers)
2. Comprendre les **données dynamiques** (variables) utilisées dans les tags GA4
3. Permettre un **diagnostic précis** des problèmes de tracking
4. Croiser la configuration GTM avec les **données réelles** reçues dans GA4
5. Produire des recommandations actionnables de haut niveau

---

### 3.2 Scénarios utilisateurs complets

#### Scénario A — Diagnostic « Pourquoi mon événement purchase n’apparaît pas dans GA4 ? »

**Flux attendu :**
1. `list_gtm_accounts` → `list_gtm_containers`
2. `get_gtm_container_summary` ou `audit_ga4_setup`
3. `get_ga4_tags` → repérer le tag `purchase`
4. `get_tag_details` sur ce tag
5. `list_gtm_triggers` + `get_trigger_details` sur les triggers liés
6. `analyze_event_parameters` → vérifier la présence de `value`, `currency`, `transaction_id`…
7. `compare_gtm_vs_ga4_events` → confirmer si l’événement arrive réellement dans GA4

**Résultat attendu :**  
Grok explique clairement si le problème vient du trigger, des paramètres manquants, d’un Measurement ID incorrect, ou d’un filtre côté GA4.

---

#### Scénario B — Audit complet d’un nouveau conteneur

**Flux :**
1. `audit_ga4_setup_v2`
2. Le tool retourne un score détaillé + liste des problèmes classés par sévérité
3. Grok propose un plan de correction priorisé

**Points contrôlés par l’audit v2 :**
- Présence et unicité du tag GA4 Configuration
- Measurement ID valide et cohérent
- Triggers de type « All Pages » / « Initialization » correctement liés
- Événements recommandés manquants
- Paramètres e-commerce critiques absents (`value`, `currency`, `items`…)
- Variables non définies ou mal référencées
- Tags en double
- Tags GA4 Event sans aucun trigger
- Utilisation de variables built-in recommandées (Page URL, Click Text, etc.)

---

#### Scénario C — « Quels paramètres sont envoyés avec mon événement add_to_cart ? »

**Flux :**
1. `get_ga4_tags` → trouver le tag
2. `get_tag_details`
3. `analyze_event_parameters`

**Résultat :** liste claire des paramètres (clés + source : constante / variable / dataLayer)

---

#### Scénario D — « Est-ce que ma variable “dlv – ecommerce value” est bien utilisée ? »

**Flux :**
1. `list_gtm_variables`
2. `get_variable_details`
3. `find_tags_using_variable`

---

#### Scénario E — « Montre-moi tous les tags qui se déclenchent sur le clic du bouton Acheter »

**Flux :**
1. `list_gtm_triggers` (filtrer type = CLICK)
2. `get_trigger_details`
3. `find_tags_by_trigger`

---

#### Scénario F — Croisement GTM ↔ données réelles GA4

**Flux :**
1. `get_ga4_tags` → liste des eventName déclarés dans GTM
2. `get_events_summary` (tool GA4 existant) → événements réellement reçus
3. `compare_gtm_vs_ga4_events` → écarts (configuré mais jamais reçu / reçu mais non configuré dans GTM)

---

#### Scénario G — Détection de configuration legacy ou incorrecte

- Tags de type `gaawc` (ancien) encore présents
- Plusieurs Measurement IDs différents dans le même conteneur
- Tag Configuration non déclenché sur toutes les pages
- Utilisation de variables Data Layer non standardisées

---

### 3.3 Spécification des nouveaux tools

#### GTM-09 — `list_gtm_triggers`

```ts
list_gtm_triggers({
  accountId: string,
  containerId: string,
  workspaceId: string
})
```

**Retour :**
```json
{
  "count": 12,
  "triggers": [
    {
      "triggerId": "123",
      "name": "All Pages",
      "type": "PAGEVIEW",
      "filter": [...],
      "path": "..."
    }
  ]
}
```

#### GTM-10 — `get_trigger_details`

Retour complet : type, conditions (filters), waitForTags, checkValidation, etc.

#### GTM-11 — `list_gtm_variables`

Inclut les variables **user-defined** + indication des **built-in** activées.

#### GTM-13 — `get_tag_details`

```json
{
  "tagId": "45",
  "name": "GA4 - purchase",
  "type": "gaawe",
  "measurementIds": ["G-XXXXXXXX"],
  "eventName": "purchase",
  "parameters": [
    { "key": "value", "type": "TEMPLATE", "value": "{{dlv - ecommerce value}}" },
    { "key": "currency", "type": "TEMPLATE", "value": "EUR" }
  ],
  "firingTriggers": [
    { "triggerId": "8", "name": "CE - purchase" }
  ],
  "blockingTriggers": [],
  "priority": 0,
  "notes": "..."
}
```

#### GTM-14 — `analyze_event_parameters`

Analyse tous les tags GA4 Event et produit un tableau :

| eventName | paramètres présents | paramètres critiques manquants | source des valeurs |
|-----------|---------------------|--------------------------------|--------------------|
| purchase  | value, currency, transaction_id | items | variables + constantes |

#### GTM-17 — `audit_ga4_setup_v2`

Version enrichie de l’audit.  
Nouveaux contrôles :

| Contrôle | Sévérité |
|----------|----------|
| Tag Configuration manquant | Critique |
| Tag Configuration sans trigger All Pages / Initialization | Haute |
| Measurement ID invalide ou multiple | Haute |
| Événement e-commerce sans `value` / `currency` | Haute |
| Événement e-commerce sans `items` | Moyenne |
| Tag Event sans aucun trigger | Haute |
| Variable référencée mais inexistante | Haute |
| Tags en double (même eventName) | Moyenne |
| Utilisation de type legacy `gaawc` | Basse |
| Trop de tags GA4 Event (> 30) | Info |

**Score final** : 0–100 avec pondération par sévérité.

#### GTM-18 — `compare_gtm_vs_ga4_events`

```ts
compare_gtm_vs_ga4_events({
  accountId, containerId, workspaceId,
  propertyId,               // GA4
  startDate?: string,       // défaut 7daysAgo
  endDate?: string
})
```

**Retour :**
```json
{
  "configuredInGtmButNotSeenInGa4": ["generate_lead", "sign_up"],
  "seenInGa4ButNotConfiguredInGtm": ["scroll", "file_download"],
  "matched": ["page_view", "purchase", "add_to_cart"],
  "notes": "Les événements 'scroll' et 'file_download' sont probablement des événements automatiques GA4 enhanced measurement."
}
```

---

### 3.4 Edge cases & règles de gestion

| Cas | Comportement attendu |
|-----|----------------------|
| Workspace vide | Retourner count = 0 + message clair |
| Permissions insuffisantes sur un compte | Erreur explicite + suggestion de droits Viewer |
| Conteneur Server-side | Détecter `usageContext: ["SERVER"]` et indiquer le support limité en Phase 2 |
| Tag sans paramètre `eventName` | Classer comme « Event name manquant » |
| Variable circulaire ou non résolue | Warning dans l’audit |
| Plusieurs workspaces | Toujours permettre de préciser `workspaceId`, défaut = Default Workspace |
| Measurement ID au format UA- | Détecter et warning « legacy Universal Analytics » |

---

### 3.5 Modèle de données interne (simplifié)

```ts
interface GtmTrigger {
  triggerId: string;
  name: string;
  type: string;           // PAGEVIEW, CLICK, CUSTOM_EVENT, ...
  filter?: any[];
  path: string;
}

interface GtmVariable {
  variableId: string;
  name: string;
  type: string;           // v, jsm, k, ...
  parameter?: any[];
  path: string;
}

interface Ga4TagDetailed {
  tagId: string;
  name: string;
  type: "googtag" | "gaawe" | "gaawc";
  measurementIds: string[];
  eventName?: string;
  parameters: Array<{ key: string; type: string; value: string }>;
  firingTriggers: Array<{ triggerId: string; name: string }>;
  blockingTriggers: Array<{ triggerId: string; name: string }>;
}
```

---

### 3.6 Critères d’acceptation – Phase 2

- [x] Tous les tools Must (GTM-09 à GTM-14, GTM-17, GTM-18) sont implémentés
- [x] `get_tag_details` résout les noms des triggers liés
- [x] `analyze_event_parameters` détecte correctement les paramètres critiques e-commerce
- [x] `audit_ga4_setup_v2` produit un score cohérent et des recommandations actionnables
- [x] `compare_gtm_vs_ga4_events` croise correctement GTM et les données GA4 existantes
- [x] Tous les tools Should (GTM-15, GTM-16, GTM-19, GTM-20) sont implémentés depuis la v0.11.0 — logique pure dans `src/utils/gtm-helpers.ts`, couverte par `tests/gtm.test.ts`
- [x] Compatible cache Redis (listes de triggers, variables et built-in variables mises en cache)
- [x] Documentation mise à jour
- [ ] Edge cases : workspace vide, permissions insuffisantes, tag sans `eventName` et multi-workspaces sont gérés ; la détection `usageContext: ["SERVER"]` et l'avertissement `UA-` legacy ne sont pas encore implémentés

---

## 4. Architecture technique (Phase 2)

```text
src/
├── google/
│   ├── tagmanager-api.ts       # Enrichi (triggers, variables, détails)
│   └── ...
├── tools/
│   ├── gtm.ts                  # Tous les tools GTM
│   └── index.ts
└── utils/
    └── gtm-helpers.ts          # Extraction paramètres, matching events, scoring
```

**Nouvelles dépendances :** aucune (on reste sur `googleapis`).

**Performance :**
- Mise en cache agressive des listes de triggers/variables (TTL 20–30 min)
- L’audit v2 peut faire plusieurs appels → bien gérer le parallélisme et le cache

---

## 5. Ordre d’implémentation recommandé (Phase 2)

1. `list_gtm_triggers` + `get_trigger_details`
2. `list_gtm_variables` + `get_variable_details`
3. `get_tag_details` (enrichissement)
4. `analyze_event_parameters`
5. `find_tags_by_trigger` / `find_tags_using_variable`
6. `audit_ga4_setup_v2`
7. `compare_gtm_vs_ga4_events`
8. `detect_duplicate_tags`

---

## 6. Hors scope Phase 2

- Écriture / modification de tags ou triggers
- Publication de versions
- Support complet des Server-side containers (détection uniquement)
- Templates personnalisés (Custom Templates)
- Zones (Zones GTM)

---

**Auteur** : Geoffroy de La Tournelle / KayrosLab  
**Licence** : Apache-2.0
