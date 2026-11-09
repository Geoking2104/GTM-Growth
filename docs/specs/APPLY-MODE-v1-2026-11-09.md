# Cahier des charges - Mode Appliquer
## GTM Growth - KayrosLab

| Champ | Valeur |
| --- | --- |
| Produit | GTM Growth - KayrosLab |
| Fonctionnalité | Mode Appliquer - De l'audit à l'implémentation sans pilote automatique |
| Version | v1.0 - MVP |
| Date | 9 novembre 2026 |
| Statut | Proposition de spécification |
| Langue | Français |

---

## 1. Contexte et problème

### 1.1 Constat

GTM Growth est aujourd'hui très fort pour diagnostiquer :

- Score GEO 0-100 sur 8 catégories et 42 contrôles
- Preuve par contrôle
- Plan priorisé par points récupérables
- Génération de `llms.txt`, schéma JSON-LD et `robots.txt` corrigés
- Audit GTM / GA4, console multi-clients, boucle Ops

Mais l'implémentation reste manuelle. L'utilisateur reçoit un fichier corrigé, puis doit l'installer lui-même. Résultat :

- Frictions pour les non-développeurs
- Risque d'erreur de copier-coller
- Fichiers non régénérés à chaque publication
- Aucune preuve automatique que le correctif est bien en ligne
- Abandon entre l'audit et l'application

### 1.2 Objectif

Permettre à l'utilisateur d'**appliquer un correctif en 3 clics, avec preview, approbation explicite et vérification automatique**, sans jamais publier sans son consentement.

Principe directeur :

> Copilote, jamais pilote automatique. Tout ce qui touche à la production passe par une approbation humaine, un diff visible et un rollback possible.

### 1.3 Non-objectifs (v1)

- Ne pas remplacer un plugin WordPress complet comme OctoPlug GEO Suite
- Ne pas publier automatiquement un article, une page ou un tag GTM
- Ne pas modifier le code source du site sans backup et sans preview
- Ne pas promettre une citation dans ChatGPT, Gemini, Perplexity ou Google AIO
- Ne pas gérer l'hébergement, le DNS ou le déploiement CI/CD du client

---

## 2. Personas

### 2.1 Propriétaire de site non-technique

- 1 site WordPress, pas de développeur
- Veut : "Corrige pour moi, mais montre-moi avant"
- Craint : casser son site, perdre son référencement

### 2.2 Freelance SEO / GEO

- 3 à 10 clients
- Veut : appliquer vite, prouver avant / après, réutiliser les mêmes correctifs
- Craint : passer 2 heures par client en copier-coller

### 2.3 Agence / équipe Ops

- 10 à 50 clients, console multi-clients
- Veut : workflow par client, droits par rôle, traçabilité, rollback
- Craint : une erreur appliquée sur 20 sites en même temps

### 2.4 Développeur

- Utilise déjà CLI et MCP
- Veut : `geo-apply --dry-run`, diff en terminal, export Git
- Craint : un outil qui écrit n'importe où sans log

---

## 3. Principes et garde-fous

Ce sont des règles non négociables. Elles s'appliquent à tous les correctifs.

### 3.1 Garde-fous produit

1. **Aucune écriture sans approbation explicite.** Chaque application demande un `Appliquer` + confirmation.
2. **Diff avant application.** L'utilisateur voit toujours avant / après, ligne par ligne.
3. **Dry-run par défaut.** Le mode par défaut simule, ne modifie rien.
4. **Backup automatique avant chaque écriture.** `robots.txt`, `llms.txt`, schéma, tags GTM : snapshot horodaté conservé.
5. **Rollback en 1 clic.** Restauration du snapshot précédent, sans manipulation manuelle.
6. **Vérification post-application.** Après application, re-scan externe : fichier accessible ? Schéma valide ? Tag déclenché ?
7. **Jamais de publication directe.** Pour WordPress : brouillon ou prévisualisation d'abord. Pour GTM : workspace brouillon d'abord, jamais de publish direct.
8. **Journal d'audit complet.** Qui, quoi, quand, sur quel client, quel snapshot, quel résultat de vérification.
9. **Périmètre borné.** Une application = un correctif = un périmètre déclaré. Pas d'écriture hors périmètre.
10. **Échec = blocage.** Si une vérification échoue, l'application est marquée `À vérifier`, le score projeté n'est pas validé.

### 3.2 Garde-fous sécurité

- Clés API jamais renvoyées au navigateur, stockées côté serveur
- Accès Google en lecture seule par défaut. Toute écriture exige un drapeau + `confirm=true`
- Compte de service invité, périmètre minimal, révocable par client
- Rôles : `Lecteur`, `Éditeur`, `Approbateur`, `Admin`. Seul `Approbateur` et `Admin` peuvent appliquer en production
- Connexion sécurisée via Keycloak, cloisonnement par client
- Aucun chiffre inventé : score validé uniquement après vérification mesurée

---

## 4. Périmètre

### 4.1 MVP - v1.0

| Catégorie | Correctifs couverts en MVP |
| --- | --- |
| GEO Fichiers | `robots.txt` - règles crawlers IA, `llms.txt`, `llms-full.txt` |
| GEO Données | JSON-LD `Organization`, `WebSite`, `Article`, `FAQPage`, `Breadcrumb` |
| GEO Contenu | Métadonnées : titre, meta description, H1 manquant ou dupliqué |
| GTM / GA4 | Snippet GTM / GA4 : détection, ordre, doublons, consentement |
| WordPress | Envoi en brouillon, pas en publié |
| Vérification | Re-scan externe + validation schéma + test robots |

### 4.2 V2 - Hors MVP

- Réécriture de blocs de contenu avec coach de citabilité
- Gestion multilingue WPML / Polylang
- Correctifs Next.js / Shopify / Webflow / site statique
- Déploiement Git / FTP / SFTP automatisé
- Propositions commerciales auto-générées
- Rapports mensuels white-label

---

## 5. Parcours utilisateur global

### 5.1 Vue d'ensemble

```
Audit -> Plan priorisé -> Choisir un correctif -> Voir le diff
-> Prévisualiser -> Approuver -> Appliquer -> Vérifier
-> Score mis à jour OU Rollback
```

### 5.2 Étapes détaillées

1. **Audit.** Score GEO, preuves, plan priorisé par points récupérables.
2. **Choix.** L'utilisateur coche 1 correctif ou un lot de correctifs du même périmètre.
3. **Diff.** Affichage avant / après, avec lignes ajoutées, supprimées, modifiées.
4. **Preview.** Rendu simulé : à quoi ressemblera la page / le fichier / le tag.
5. **Approbation.** Bouton `Appliquer` + confirmation explicite + rappel du rollback.
6. **Application.** Écriture bornée, backup, log.
7. **Vérification.** Re-scan externe, validation, test GTM / GA4 si concerné.
8. **Résultat.** Statut `Appliqué et vérifié`, `Appliqué à vérifier` ou `Échec - rollback proposé`.
9. **Suivi.** Historique, score réel mis à jour, alerte si drift détecté.

---

## 6. Écrans - Spécifications

### 6.1 Écran 1 - Tableau de bord client

**Objectif :** Voir où en est le client, en un coup d'oeil.

**Contenu :**

- Nom du client, URL, date du dernier audit
- Score GEO actuel / Score projeté
- Nombre de correctifs : `À faire / En cours / Appliqués / Échoués`
- Alertes : chute de positions, drift, fichier inaccessible
- Bouton principal : `Voir le plan d'action`

**Règles :**

- Le score projeté est affiché en grisé tant que les correctifs ne sont pas vérifiés
- Aucune action d'écriture depuis cet écran, uniquement navigation

### 6.2 Écran 2 - Plan d'action priorisé

**Objectif :** Choisir quoi appliquer en premier.

**Contenu par ligne :**

- Titre du correctif : ex. `Autoriser ChatGPT-User et PerplexityBot dans robots.txt`
- Catégorie : Robots / llms.txt / Schéma / Métadonnées / GTM
- Points récupérables : `+6 pts`
- Effort : `Faible / Moyen / Élevé`
- Risque : `Faible / Moyen`
- Statut : `À faire / Brouillon / Appliqué / À vérifier`
- Cases à cocher pour application par lot

**Filtres :**

- Par catégorie
- Par effort
- Par risque
- Par page / URL concernée

**Actions :**

- `Voir le détail`
- `Appliquer ce correctif`
- `Appliquer le lot sélectionné`

**Règle :** Un lot ne peut contenir que des correctifs du même périmètre (ex. uniquement `robots.txt`). Pas de lot mixte GEO + GTM en v1.

### 6.3 Écran 3 - Détail d'un correctif

**Objectif :** Comprendre, avant de décider.

**Sections :**

1. **Pourquoi ?** Preuve mesurée, extrait de page, capture de la règle actuelle
2. **Qu'est-ce que ça change ?** Description en langage clair, sans jargon
3. **Quel gain ?** Points récupérables, impact sur citabilité et sur mesure
4. **Quel risque ?** Ce qui pourrait casser, et comment on annule
5. **Pour qui ?** Page(s) concernée(s), périmètre exact

**Actions :**

- `Voir le diff`
- `Prévisualiser`
- `Retour au plan`

### 6.4 Écran 4 - Diff avant / après

**Objectif :** Zéro boîte noire. L'utilisateur voit exactement ce qui va changer.

**Contenu :**

- Vue split ou unifiée, au choix
- Légende : Vert = ajouté, Rouge = supprimé, Jaune = modifié
- Pour `robots.txt` : lignes par bot, avec label humain
- Pour `llms.txt` : titre, résumé, liens, sections
- Pour JSON-LD : bloc JSON validé, avec champs manquants surlignés
- Pour métadonnées : titre actuel vs titre proposé, longueur, aperçu SERP
- Pour GTM : tag actuel vs tag proposé, trigger, variable, ordre de déclenchement

**Actions :**

- `Copier le diff`
- `Télécharger le fichier corrigé`
- `Modifier manuellement` (mode expert, avec re-validation)
- `Passer à la prévisualisation`

**Règles :**

- Toute modification manuelle relance la validation automatique
- Si la validation échoue, le bouton `Appliquer` reste désactivé, avec message explicite

### 6.5 Écran 5 - Prévisualisation et approbation

**Objectif :** Dernier contrôle avant écriture.

**Contenu :**

- Récapitulatif : client, URL, correctif, périmètre, backup qui sera créé
- Case à cocher obligatoire : `J'ai relu le diff et je comprends ce qui va changer`
- Pour WordPress : mention `Envoi en brouillon, pas en publié`
- Pour GTM : mention `Workspace brouillon, pas de publication`
- Boutons : `Annuler` / `Appliquer`

**Comportement :**

- Au clic sur `Appliquer` : confirmation modale avec résumé en 3 lignes
- Affichage d'une barre de progression : `Backup -> Application -> Vérification`
- Pas de double-clic possible, bouton désactivé pendant l'application

### 6.6 Écran 6 - Résultat et vérification

**Objectif :** Prouver que c'est bien en ligne, ou dire que ça a échoué.

**États possibles :**

#### A. Appliqué et vérifié

- Coche verte
- Détail des vérifications : fichier accessible en externe, schéma valide, tag déclenché
- Nouveau score réel
- Boutons : `Voir l'historique` / `Retour au plan` / `Annuler ce correctif (rollback)`

#### B. Appliqué, à vérifier

- Avertissement orange
- Exemple : cache serveur, délai de propagation, fichier accessible mais avec redirect
- Action proposée : `Relancer la vérification dans 10 min`
- Score projeté non validé tant que la vérification n'est pas verte

#### C. Échec

- Message rouge, cause lisible, pas de code d'erreur brut
- Bouton principal : `Restaurer la version précédente (rollback)`
- Bouton secondaire : `Télécharger le rapport d'erreur`
- Le correctif repasse en `À faire`, avec log conservé

### 6.7 Écran 7 - Historique et rollback

**Objectif :** Traçabilité totale.

**Colonnes :**

- Date et heure
- Utilisateur
- Client / Site
- Correctif appliqué
- Snapshot avant / après (lien de téléchargement)
- Résultat de vérification
- Action : `Restaurer` / `Comparer` / `Télécharger`

**Règles :**

- Historique non supprimable, même après rollback
- Restauration = nouvelle entrée dans l'historique, pas écrasement
- Filtre par client, par utilisateur, par statut

---

## 7. Connecteur WordPress léger - v1

### 7.1 Principe

Un connecteur minimal, pas un plugin SEO complet. Son seul rôle : recevoir, prévisualiser et appliquer les correctifs validés dans GTM Growth, puis régénérer les fichiers à chaque publication.

### 7.2 Fonctionnalités v1

- Connexion via clé API par site, révocable
- Réception des fichiers `llms.txt`, `robots.txt`, JSON-LD
- Mode `Brouillon` par défaut pour tout contenu
- Régénération automatique à chaque publication / mise à jour de page
- Vérification externe après application : le fichier est-il accessible comme un crawler le verrait ?
- Compatibilité : ne pas dupliquer le schéma déjà généré par Yoast, Rank Math ou SEOPress
- Journal local des applications, synchronisé avec la console

### 7.3 Ce que le connecteur ne fait pas en v1

- Pas d'analyse par page
- Pas d'édition en masse dans WordPress
- Pas de réécriture de contenu
- Pas de gestion multilingue WPML / Polylang (prévu en v2)

### 7.4 Installation - Parcours

1. Dans GTM Growth : `Connecter un site WordPress` -> génération d'une clé
2. Dans WordPress : installer le connecteur, coller la clé, valider
3. Test de connexion : lecture seule d'abord
4. Activation de l'écriture uniquement après validation du test
5. Premier correctif en mode `Brouillon` pour valider le circuit

---

## 8. GTM / GA4 - Workspace brouillon

### 8.1 Principe

Ne jamais publier directement dans GTM. Le flux passe toujours par un workspace brouillon + preview + approbation.

### 8.2 Flux v1

1. **Audit.** Tags, triggers, variables, doublons, ordre du dataLayer, consentement.
2. **Proposition.** Tag corrigé, trigger corrigé, variable corrigée, avec diff.
3. **Workspace brouillon.** Création d'un workspace nommé : `GTM Growth - [date] - [correctif]`
4. **Preview.** Lien de preview GTM généré, test à faire par l'utilisateur sur le site.
5. **Preuve GA4.** Vérification que l'événement est bien reçu dans GA4, avec charge validée contre le schéma officiel.
6. **Approbation.** `Publier le workspace` uniquement après `confirm=true` et rôle `Approbateur`.
7. **Rollback.** Restauration de la version GTM précédente, log conservé.

### 8.3 Garde-fous GTM

- Aucune écriture sans `confirm=true`
- Aucune publication sans preview validé
- Backup de la version GTM avant chaque modification
- Détection des tags en double avant application
- Générateur de snippets qui refuse les identifiants mal formés
- Si GA4 ne reçoit pas l'événement, le statut reste `À vérifier`, jamais `Appliqué`

---

## 9. Vérification post-application - Spécifications

### 9.1 Vérifications GEO

| Vérification | Méthode | Critère de succès |
| --- | --- | --- |
| `robots.txt` accessible | Requête externe comme un crawler | HTTP 200, règles présentes, pas de redirect bloquant |
| `llms.txt` accessible | Requête externe | HTTP 200, contenu conforme au diff validé |
| JSON-LD valide | Parsing + validation schéma | JSON valide, champs requis présents, pas de doublon avec plugin SEO |
| Métadonnées | Re-fetch de la page | Titre / meta / H1 conformes au diff |
| Cache / Firewall | Requête externe + en-têtes | Pas de cache servant l'ancienne version |

### 9.2 Vérifications GTM / GA4

| Vérification | Méthode | Critère de succès |
| --- | --- | --- |
| Tag présent | Scan de page | Tag présent, loader en head, noscript présent |
| Trigger correct | Preview GTM + log | Déclenchement sur l'événement attendu |
| Événement GA4 reçu | API GA4 | Événement reçu, paramètres conformes |
| Pas de doublon | Scan + config GTM | Un seul tag pour un même événement |
| Consentement | Test consentement | Tag respectant le mode consentement |

### 9.3 Gestion des délais

- Vérification immédiate après application
- Si échec lié au cache : nouvelle tentative automatique à +10 min, puis +30 min
- Après 3 échecs : statut `À vérifier manuellement`, notification, rollback proposé
- L'utilisateur peut relancer manuellement à tout moment

---

## 10. API, CLI et MCP

### 10.1 CLI - Pour les développeurs

```bash
# Audit - lecture seule par défaut
npm run cli -- geo-audit --url https://acme.com

# Simuler sans écrire
npm run cli -- geo-apply --url https://acme.com --fix robots-ai --dry-run

# Voir le diff
npm run cli -- geo-apply --url https://acme.com --fix robots-ai --diff

# Appliquer avec confirmation explicite
npm run cli -- geo-apply --url https://acme.com --fix robots-ai --confirm=true

# Vérifier après application
npm run cli -- geo-verify --url https://acme.com --fix robots-ai

# Annuler
npm run cli -- geo-rollback --url https://acme.com --fix robots-ai --to snapshot-2026-11-09-14-32
```

Règles CLI :

- `--dry-run` par défaut si `--confirm=true` absent
- `--diff` ne modifie rien
- Sortie lisible + JSON pour intégration CI
- Code de retour non nul si vérification échoue

### 10.2 MCP - Pour les agents IA

Outils proposés :

- `geo_list_fixes` - Lister les correctifs, avec points et risque
- `geo_get_diff` - Récupérer le diff d'un correctif
- `geo_apply_dry_run` - Simuler
- `geo_apply` - Appliquer, exige `confirm=true` + rôle autorisé
- `geo_verify` - Vérifier après application
- `geo_rollback` - Restaurer un snapshot
- `gtm_preview_workspace` - Créer un workspace brouillon GTM

Règle : un agent ne peut jamais appliquer sans `confirm=true` et sans approbation humaine dans la console.

### 10.3 API REST - Exemple

```
POST /api/apply
{
  "client_id": "opendpe",
  "fix_id": "robots-ai-allow",
  "mode": "dry-run",
  "confirm": false
}

POST /api/apply
{
  "client_id": "opendpe",
  "fix_id": "robots-ai-allow",
  "mode": "apply",
  "confirm": true,
  "snapshot_note": "Avant ajout ChatGPT-User"
}

GET /api/verify?client_id=opendpe&fix_id=robots-ai-allow
POST /api/rollback
{
  "client_id": "opendpe",
  "snapshot_id": "snap-2026-11-09-14-32"
}
```

---

## 11. Données et modèles

### 11.1 Correctif - Fix

```
Fix {
  id: string
  client_id: string
  title: string
  category: robots | llms | schema | metadata | gtm | ga4
  url: string
  points: number
  effort: low | medium | high
  risk: low | medium | high
  status: todo | draft | applied | to_verify | failed
  before: string // contenu avant
  after: string // contenu proposé
  diff: string // diff unifié
  validation: { valid: boolean, errors: [] }
  created_at: datetime
  updated_at: datetime
}
```

### 11.2 Application - Apply

```
Apply {
  id: string
  fix_id: string
  user_id: string
  role: string
  mode: dry-run | apply
  snapshot_id: string
  status: success | to_verify | failed
  verification: { checks: [], passed: boolean }
  created_at: datetime
}
```

### 11.3 Snapshot

```
Snapshot {
  id: string
  client_id: string
  fix_id: string
  type: robots | llms | schema | gtm_version
  content_before: string
  content_after: string
  created_at: datetime
  created_by: string
}
```

---

## 12. Cas limites et erreurs

| Cas | Comportement attendu |
| --- | --- |
| Fichier modifié entre audit et application | Blocage, nouveau diff demandé, message explicite |
| Plugin SEO écrase le schéma | Détection de doublon, application annulée, proposition de coexistence |
| Cache serveur sert l'ancienne version | Statut `À vérifier`, nouvelle tentative à +10 min, rollback proposé |
| Droits insuffisants dans GTM | Blocage avant écriture, message avec rôle requis |
| Perte de connexion pendant application | Application marquée `Inconnue`, vérification obligatoire avant tout nouvel essai |
| Deux utilisateurs appliquent le même correctif | Verrouillage : 2e application bloquée, message `Déjà en cours par X` |
| Site multilingue en v1 | Correctif limité à la langue principale, avertissement affiché |
| `robots.txt` physique vs virtuel WordPress | Détection, explication, choix explicite avant application |

---

## 13. Métriques de succès

### 13.1 Adoption

- % d'audits qui aboutissent à au moins 1 correctif appliqué (objectif v1 : 60 %)
- Temps médian audit -> première application (objectif v1 : < 15 min)
- % d'utilisateurs non-techniques qui appliquent sans aide (objectif v1 : 50 %)

### 13.2 Qualité

- % d'applications vérifiées du 1er coup (objectif v1 : > 90 %)
- % de rollbacks (objectif v1 : < 5 %)
- % de vérifications en échec après 3 tentatives (objectif v1 : < 3 %)

### 13.3 Impact

- Points GEO réellement gagnés, pas seulement projetés
- Nombre de fichiers accessibles en externe après application
- Nombre d'événements GA4 validés après correction GTM
- Taux de drift à 30 jours : correctif toujours en place ?

---

## 14. Critères d'acceptation - MVP

Le MVP est accepté si :

- [ ] Un utilisateur non-technique peut appliquer un correctif `robots.txt` en moins de 5 clics, avec diff visible
- [ ] Aucune application n'est possible sans approbation explicite et sans backup
- [ ] Chaque application crée un snapshot restaurable en 1 clic
- [ ] Chaque application déclenche une vérification externe automatique
- [ ] Le score projeté ne devient score réel qu'après vérification verte
- [ ] Un correctif WordPress part en brouillon, jamais en publié
- [ ] Un correctif GTM part en workspace brouillon, jamais en publish direct
- [ ] L'historique complet est consultable par client, avec qui / quoi / quand
- [ ] La CLI `--dry-run` ne modifie rien, et `--confirm=true` est requis pour écrire
- [ ] Un rollback restaure l'état précédent et est tracé dans l'historique
- [ ] 320 tests existants restent au vert, + tests sur apply / verify / rollback

---

## 15. Roadmap proposée

### Phase 1 - MVP (4 à 6 semaines)

- Écrans Plan, Détail, Diff, Approbation, Résultat, Historique
- Correctifs `robots.txt`, `llms.txt`, JSON-LD de base, métadonnées
- Backup, rollback, vérification externe
- Connecteur WordPress léger en brouillon
- GTM workspace brouillon + preview

### Phase 2 - Robustesse (6 à 8 semaines)

- Application par lot, même périmètre
- Gestion des conflits : fichier modifié entre audit et application
- Détection de doublons avec plugins SEO
- Mode expert : modification manuelle du diff avec re-validation
- Notifications : application réussie, échec, drift détecté

### Phase 3 - Échelle (8 à 12 semaines)

- Profils métier : SaaS, local, e-commerce, éditeur
- Multilingue WPML / Polylang
- Stacks Next.js, Shopify, Webflow, statique
- Coach de citabilité par bloc, avec pattern de réécriture
- Rapports mensuels white-label et propositions auto-générées

---

## 16. Exemples de correctifs en MVP

### Exemple 1 - Robots.txt

- **Avant :** `GPTBot` bloqué par `Disallow: /` involontaire
- **Après :** `Allow` pour `ChatGPT-User`, `OAI-SearchBot`, `PerplexityBot`, `Google-Extended` selon choix
- **Vérification :** Requête externe, HTTP 200, règles présentes
- **Rollback :** Restauration du `robots.txt` précédent

### Exemple 2 - llms.txt

- **Avant :** Aucun `llms.txt`, ou fichier de moins de 200 mots
- **Après :** `llms.txt` structuré : résumé du site, pages clés, liens
- **Vérification :** Accessibilité externe, longueur, liens valides
- **Rollback :** Suppression ou restauration de l'ancien fichier

### Exemple 3 - JSON-LD Organization

- **Avant :** Pas de `Organization`, entité non résolvable
- **Après :** Bloc JSON-LD `Organization` + `WebSite`, avec `sameAs` vers profils officiels
- **Vérification :** JSON valide, pas de doublon avec plugin SEO
- **Rollback :** Suppression du bloc ajouté

### Exemple 4 - GTM - Tag GA4 en double

- **Avant :** 2 tags GA4 déclenchés sur le même événement
- **Après :** 1 seul tag, trigger unique, variable corrigée
- **Vérification :** Preview GTM + événement reçu 1 fois dans GA4
- **Rollback :** Restauration de la version GTM précédente

---

## 17. Annexe - Textes UI recommandés

- Bouton principal : `Voir le diff`
- Bouton d'action : `Appliquer ce correctif`
- Confirmation : `J'ai relu le diff et je comprends ce qui va changer`
- Succès : `Appliqué et vérifié - Score mis à jour`
- Avertissement : `Appliqué, à vérifier - Nouvelle tentative dans 10 min`
- Échec : `Échec - Restaurer la version précédente`
- Info sécurité : `Backup créé automatiquement avant application. Rollback possible en 1 clic.`
- Info WordPress : `Envoi en brouillon. Rien ne sera publié sans votre relecture.`
- Info GTM : `Workspace brouillon créé. Aucune publication sans votre validation.`

---

*Fin du cahier des charges - Mode Appliquer - GTM Growth*
