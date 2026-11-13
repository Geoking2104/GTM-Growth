# Connecteurs e-commerce — PrestaShop & Shopify

**Cahier des charges fonctionnel et technique**
Projet : GTM Growth (`gtm-growth`) · Version du document : 1.0 · Date : 2026-11-13
Statut : proposition à valider avant implémentation

---

## 0. Résumé exécutif

GTM Growth mesure aujourd'hui la visibilité d'un site dans les moteurs IA (audit GEO 100 points), le trafic (GA4, Search Console) et la vitesse. La chaîne s'arrête au **clic** : le produit ne sait pas dire si une citation dans ChatGPT ou Perplexity a produit une **commande**.

Ce cahier des charges ajoute deux connecteurs de boutique — **Shopify** et **PrestaShop** — pour remonter le catalogue et les commandes, puis relier chaque commande à son canal d'acquisition, y compris les moteurs génératifs.

Trois décisions structurantes sont proposées :

1. **Webhooks en temps réel + backfill API** : les webhooks donnent la commande en moins d'une minute, l'API comble l'historique. Un seul chemin d'ingestion normalisé pour les deux plateformes.
2. **Aucune PII stockée en clair** : la commande est conservée sous forme pseudonymisée (identifiant boutique, montants, lignes, canal). Le nom et l'e-mail ne sortent jamais du connecteur.
3. **Le commercial ne dépend pas de l'App Store** : Shopify démarre en *custom app* (installation par le marchand, sans revue), PrestaShop en *module + clé webservice*. La publication App Store est une phase ultérieure, pas un prérequis.

Effort estimé : **5 à 6 semaines** pour un développeur, dont 2 semaines de connecteurs purs et 2 semaines d'attribution/console.

---

## 1. Contexte et problème

### 1.1 Ce que le produit sait faire aujourd'hui

| Brique | Ce qu'elle produit | Fichier de référence |
|---|---|---|
| Audit GEO | Score 0–100 sur 8 catégories, 42 checks, preuves | `src/geo/audit.ts` |
| Plateformes | Readiness par moteur (7 depuis cette version) | `src/geo/platforms.ts` |
| Citabilité | 12 méthodes de quotabilité | `src/geo/citability.ts` |
| Trafic | GA4 / Search Console via service account | `src/google/*` |
| Console | Multi-tenant, Keycloak, rapports PDF | `src/report/pdf.ts`, `deploy/` |
| Surfaces | MCP tools, CLI, free read, console | `src/tools/*`, `src/freelread/*` |

### 1.2 Le trou

Un directeur e-commerce pose trois questions auxquelles le produit ne répond pas :

- « Les 12 000 visites venant de ChatGPT ce trimestre, elles ont acheté quoi ? »
- « Mes fiches produit sont-elles citables par un agent d'achat, ou seulement indexables ? »
- « Sur quel SKU dois-je investir en contenu GEO en premier ? »

Sans commandes, l'attribution s'arrête au session. Sans catalogue, l'audit reste au niveau de la page d'accueil. Les deux connecteurs ferment ces deux trous.

### 1.3 Pourquoi ces deux plateformes

- **PrestaShop** : ~300 000 boutiques actives, très forte densité en France, Espagne, Italie, Pologne. C'est la plateforme de l'écosystème agence/PME française.
- **Shopify** : la plateforme de référence pour le D2C international, avec une API propre, des webhooks natifs et un écosystème d'apps.

Ensemble, elles couvrent la majorité des prospects d'une agence GTM européenne sans ajouter WooCommerce (PHP/WordPress, très fragmenté) dans un premier temps.

---

## 2. Objectifs et indicateurs de succès

| # | Objectif | Indicateur | Cible à 3 mois |
|---|---|---|---|
| O1 | Attribuer les commandes aux canaux, dont les moteurs IA | % de commandes attribuées | ≥ 85 % |
| O2 | Auditer les pages produit, pas seulement la home | % de fiches auditées sur le catalogue actif | ≥ 90 % |
| O3 | Exposer la donnée aux agents et à la console | outils MCP + onglet console livrés | 4 outils, 1 onglet |
| O4 | Fiabilité de l'ingestion | latence webhook → visible en console | < 60 s (p95) |
| O5 | Conformité | PII en base | 0 champ nominatif |

Indicateur de qualité d'attribution : sur un échantillon de 100 commandes, un contrôle manuel (referrer/UTM) doit confirmer ≥ 90 % des attributions automatiques.

---

## 3. Cas d'usage fonctionnels

### US-01 — Connecter une boutique
Le marchand ou l'agence ouvre `Console → Commerce → Connecter`. Deux parcours :

- **Shopify** : saisie du domaine `*.myshopify.com` → OAuth → écran de consentement Shopify listant les scopes → retour avec jeton.
- **PrestaShop** : saisie de l'URL, de la clé webservice et du préfixe de boutique ; test de connexion (`GET /api/`), vérification des droits par ressource.

*Acceptation* : la connexion échoue avec un message actionnable si un scope manque (`read_orders` absent, clé webservice sans droit `orders`), et la console affiche l'état « connecté / droits insuffisants / erreur réseau ».

### US-02 — Synchroniser le catalogue
Produits, variantes, prix, stock, statut actif, collections/catégories, URL de la fiche, images.
Backfill initial paginé, puis mise à jour par webhooks (Shopify) ou par le module (PrestaShop).

*Acceptation* : un catalogue de 5 000 références est importé en < 10 min ; une modification de prix est reflétée en < 2 min.

### US-03 — Recevoir les commandes
Commande créée, payée, expédiée, annulée, remboursée. L'ingestion est **idempotente** : rejouer le même webhook ne crée pas de doublon.

*Acceptation* : un rejeu de webhook (même `event_id`) laisse la base inchangée ; une commande payée apparaît en console en < 60 s.

### US-04 — Attribuer la commande
Chaque commande reçoit un canal : `organic`, `paid`, `direct`, `email`, `social`, `ai_assistant` (sous-catégorie : ChatGPT, Claude, Perplexity, Copilot, Gemini, Grok), `unknown`.
La règle est déterministe et **affichée** dans l'interface (voir §9) : l'utilisateur doit pouvoir contester une attribution.

### US-05 — Onglet console « Commerce »
Quatre blocs :
1. Revenu par canal sur 30/90 jours, avec la part des moteurs IA.
2. Tableau produits : CA, marge si disponible, score GEO de la fiche, citations IA connues.
3. Entonnoir : sessions IA → ajouts panier → commandes.
4. Top 10 fiches à corriger, triées par **CA exposé** (CA × écart de score), pas par score.

### US-06 — Audit GEO des fiches produit
Le moteur existant s'applique à chaque URL produit, avec deux checks supplémentaires propres au commerce :
- `Product` / `Offer` JSON-LD complet (prix, devise, disponibilité, GTIN/SKU, avis).
- Cohérence prix affiché / prix structuré / prix du feed.

*Acceptation* : un audit de 500 fiches produit un rapport agrégé avec le top 20 des corrections par CA exposé.

### US-07 — Feed readiness
Contrôle des champs attendus par les surfaces d'achat (Google Merchant, agents conversationnels) : `id`, `title`, `description`, `link`, `image_link`, `availability`, `price`, `brand`, `gtin`. Sortie : tableau des manquants par produit + export CSV.

### US-08 — Alertes
- Chute de conversion d'un canal > 30 % semaine sur semaine.
- Rupture de stock sur un produit cité par un moteur IA.
- Fiche produit qui perd son JSON-LD (régression de thème).

### US-09 — Rapport
Une page PDF « AI revenue » : revenu attribué aux moteurs IA, top produits cités, score GEO moyen des fiches, plan d'action. Réutilise `src/report/pdf.ts`.

### US-10 — RGPD et consentement
- Aucun nom/e-mail/adresse stocké (pseudonymisation à l'ingestion).
- Effacement : webhook `customers/redact` (Shopify) ou commande d'effacement côté console → suppression des lignes liées.
- Conservation : 13 mois glissants pour les commandes, 25 mois pour les agrégats.
- Consentement : les événements côté navigateur (Web Pixel) ne partent que si le consentement est donné (Customer Privacy API côté Shopify ; bandeau du thème côté PrestaShop).

### Hors périmètre (v1)
Marketplaces (Amazon, Cdiscount), ERP/PIM, gestion des retours, facturation, TVA, multi-devises comptable, édition de produit depuis la console.

---

## 4. Architecture

```
┌──────────────┐   webhooks signés    ┌────────────────────┐
│  Shopify     │ ───────────────────► │  /webhooks/shopify │──┐
│  (GraphQL)   │ ◄── backfill bulk ── │  /webhooks/presta  │  │
└──────────────┘                      └────────────────────┘  │
┌──────────────┐   module PHP + HMAC                  │        │
│  PrestaShop  │ ────────────────────────────────────►┘        ▼
│  (/api/)     │ ◄── backfill REST ──────────────► ┌──────────────────┐
└──────────────┘                                   │  ingest.ts       │
                                                   │  normalisation   │
                                                   │  idempotence     │
                                                   └────────┬─────────┘
                                                            ▼
                                                   ┌──────────────────┐
                                                   │ store (tenant)   │
                                                   │ orders · products│
                                                   └────────┬─────────┘
                        ┌───────────────┬───────────────────┼───────────────┐
                        ▼               ▼                   ▼               ▼
                  MCP tools       Console API          Rapport PDF      Alertes
```

### 4.1 Arborescence proposée

```
src/ecommerce/
  types.ts                    # schéma canonique (§6)
  ingest.ts                   # normalisation + idempotence + file
  attribute.ts                # règles d'attribution (§9)
  store.ts                    # persistance tenant-scoped (sqlite/Redis existants)
  providers/
    provider.ts               # interface commune
    shopify/
      oauth.ts                # install, callback, token exchange
      client.ts               # GraphQL, coût, backoff, bulk
      webhooks.ts             # HMAC, topics, mapping
      mapper.ts               # Shopify → canonique
    prestashop/
      client.ts               # webservice /api/ (JSON, filtres, pagination)
      webhooks.ts             # réception module, HMAC, mapping
      mapper.ts               # PrestaShop → canonique
  feed.ts                     # feed readiness (§US-07)
```

### 4.2 Choix techniques

| Sujet | Décision | Raison |
|---|---|---|
| Temps réel | Webhooks | Latence < 60 s, pas de polling coûteux |
| Historique | Backfill API paginé, job reprenable | Un webhook ne rejoue pas 12 mois |
| File d'attente | Redis existant (`src/cache/redis.ts`) | Déjà en dépendance, pas de nouveau broker |
| Stockage | Store tenant existant | Isolation déjà testée côté console |
| Idempotence | Clé `provider:event_id` | Rejeu Shopify natif, module PrestaShop bavard |
| PII | Pseudonymisation à la frontière | Conformité + surface de risque réduite |
| Erreurs | Retry exponentiel + DLQ | Un webhook perdu = une commande invisible |

---

## 5. Modèle de données canonique

```ts
export type Channel =
  | "organic" | "paid" | "direct" | "email" | "social"
  | "ai_assistant" | "referral" | "unknown";

export type AiEngine =
  | "chatgpt" | "claude" | "perplexity" | "copilot" | "gemini" | "grok" | "other";

export interface Store {
  id: string;                 // tenant interne
  provider: "shopify" | "prestashop";
  domain: string;             // boutique.myshopify.com | www.exemple.fr
  currency: string;
  timezone: string;
  connectedAt: string;
  status: "connected" | "insufficient_scopes" | "error";
}

export interface Product {
  id: string;                 // identifiant provider, préfixé
  storeId: string;
  sku: string | null;
  gtin: string | null;
  title: string;
  url: string;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  availability: "in_stock" | "out_of_stock" | "preorder" | "unknown";
  category: string | null;
  updatedAt: string;
}

export interface OrderLine {
  productId: string | null;
  sku: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  storeId: string;
  /** Identifiant provider, jamais le nom du client. */
  number: string;
  createdAt: string;
  currency: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  status: "pending" | "paid" | "fulfilled" | "cancelled" | "refunded" | "partial_refund";
  lines: OrderLine[];
  /** Pseudonyme stable, jamais l'e-mail. */
  customerRef: string | null;
  attribution: Attribution;
  source: "web" | "mobile" | "pos" | "marketplace" | "unknown";
}

export interface Attribution {
  channel: Channel;
  engine: AiEngine | null;
  referrer: string | null;
  landingPage: string | null;
  utm: { source?: string; medium?: string; campaign?: string };
  /** "webhook" | "utm" | "referrer" | "ga4_join" | "manual" */
  method: "webhook" | "utm" | "referrer" | "ga4_join" | "manual" | "none";
  confidence: "high" | "medium" | "low";
  firstTouch: boolean;
  windowDays: number;
}

export interface SyncCursor {
  storeId: string;
  resource: "products" | "orders";
  cursor: string | null;      // cursor GraphQL | date_upd PrestaShop
  lastSyncedAt: string;
  status: "idle" | "running" | "failed";
  error?: string;
}
```

---

## 6. Fiche d'intégration — Shopify

### 6.1 Type d'application

| Option | Usage | Avantages | Contraintes |
|---|---|---|---|
| **Custom app** (recommandé v1) | Une boutique par installation | Pas de revue, installation immédiate, jeton direct | Pas d'App Store, installation manuelle |
| Public app (v2) | Distribution multi-boutiques | App Store, install en 1 clic | Revue, webhooks de conformité obligatoires, protection des données client |

La v1 doit viser la custom app pour livrer vite ; l'architecture OAuth doit être écrite dès le départ pour ne pas refaire le travail en v2.

### 6.2 Authentification et scopes

OAuth 2.0, jeton d'accès offline stocké chiffré par tenant.

| Scope | Nécessaire pour | Remarque |
|---|---|---|
| `read_products` | Catalogue | Indispensable |
| `read_orders` | Commandes < 60 jours | Indispensable |
| `read_all_orders` | Commandes > 60 jours | Soumis à approbation Shopify |
| `read_customers` | Pseudonyme client | Données client protégées → formulaire dédié |
| `read_inventory` | Disponibilité | Optionnel v1 |
| `read_fulfillments` | Statut expédié | Optionnel v1 |
| `read_discounts` | Codes promo | Optionnel |
| `write_pixels` / `read_customer_events` | Pixel checkout | Uniquement si l'on ajoute le pixel custom |

Sans `read_all_orders`, l'historique est limité à 60 jours : acceptable pour un pilote, bloquant pour un audit annuel. À arbitrer avec le marchand.

### 6.3 API

- **GraphQL Admin API** : les nouvelles apps publiques doivent l'utiliser (REST Admin est en legacy depuis 2025). Version épinglée, mise à jour trimestrielle (ex. `2026-01`).
- **Coût et limites** : coût calculé par requête, *leaky bucket* de **1 000 points** sur les plans standard, recharge **50 points/seconde** ; une requête ne peut pas dépasser 1 000 points. Lire `extensions.cost.throttleStatus` dans chaque réponse et ralentir avant le 429.
- **Backfill** : *bulk operations* (résultat JSONL téléchargeable) pour un import massif sans saturer le bucket.
- **Pagination** : curseurs `pageInfo.hasNextPage` / `endCursor` ; plafond de 25 000 objets par collection paginée.
- **Limites d'entrée** : 250 éléments maximum par tableau d'arguments.

### 6.4 Webhooks

| Topic | Usage |
|---|---|
| `orders/create`, `orders/paid` | Commande et encaissement |
| `orders/fulfilled`, `orders/cancelled` | Cycle de vie |
| `refunds/create` | Remboursement |
| `products/create`, `products/update`, `products/delete` | Catalogue |
| `inventory_levels/update` | Disponibilité |
| `carts/update`, `checkouts/create` | Entonnoir (optionnel) |
| `app/uninstalled` | Révocation du jeton |
| `customers/data_request`, `customers/redact`, `shop/redact` | **Conformité obligatoire** pour une app distribuée |

Règles d'implémentation :

1. Vérifier la signature **HMAC-SHA256** de l'en-tête `X-Shopify-Hmac-Sha256` avec le secret de l'app, sur le **corps brut** (avant parsing JSON).
2. Dédupliquer avec `X-Shopify-Webhook-Id` (idempotence) et contrôler `X-Shopify-Shop-Domain` vs le tenant.
3. Répondre **200 en moins de 5 secondes** : le traitement lourd part en file, sinon Shopify réessaie et finit par désactiver l'abonnement.
4. Réseau : prévoir un endpoint public stable, TLS, et une IP sortante documentée.

### 6.5 Checkout et pixel

Shopify n'expose plus le script de checkout classique : l'événement `checkout_completed` passe par la **Web Pixels API** (sandbox JS), avec `analytics.subscribe("checkout_completed", …)`. Le pixel ne doit émettre qu'après consentement (Customer Privacy API). Pour la v1, l'événement serveur `orders/paid` suffit : le pixel devient utile seulement si l'on veut l'entonnoir pré-achat.

### 6.6 Pièges connus

- Le jeton d'une custom app créée à la main n'a pas de refresh : prévoir la réinstallation.
- Les montants arrivent en chaînes (`"19.99"`) et en deux devises (`shop_money` / `presentment_money`) : toujours convertir explicitement.
- Un `orders/paid` peut arriver avant `orders/create` : l'ingestion doit être un *upsert*, pas un *insert*.
- Les webhooks ne sont pas ordonnés : se fier à `updated_at`, pas à l'ordre d'arrivée.

---

## 7. Fiche d'intégration — PrestaShop

### 7.1 Deux API, deux générations

| | Webservice (`/api/`) | Admin API (PrestaShop 9+) |
|---|---|---|
| Auth | Clé en Basic auth (clé = utilisateur, mot de passe vide) | OAuth 2.0 |
| Format | XML par défaut, JSON via `output_format=JSON` | JSON (API Platform 3) |
| Modèle | CRUD sur `ObjectModel` | CQRS, orienté domaine |
| Compatibilité | 1.7, 8.x, 9.x | 9.x uniquement |
| Verdict | **Socle v1** | À suivre, pas avant 2027 |

Le webservice reste le seul moyen de couvrir 1.7 et 8.x, qui représentent l'essentiel du parc installé.

### 7.2 Webservice : ce qu'il faut savoir

- Endpoint : `https://boutique.fr/api/` (ou `/prestashop/api/` en sous-dossier).
- Authentification recommandée : en-tête `Authorization: Basic <base64(clé:)>` — jamais la clé dans l'URL (elle finit dans les logs).
- JSON : ajouter `?output_format=JSON` à chaque appel.
- Ressources utiles : `products`, `combinations`, `stock_availables`, `orders`, `order_details`, `order_histories`, `order_states`, `customers`, `categories`, `images`.
- Filtres et pagination : `filter[date_upd]=[2026-11-01,2026-11-13]`, `date=1`, `limit=0,500`, `sort=[id_ASC]`, `display=full`.
- Schémas : `?schema=synopsis` (types) et `?schema=blank` (gabarit d'écriture) — utiles pour générer les types TypeScript.
- Pas de rate limit documenté, mais une seule requête concurrente recommandée par boutique : un PrestaShop mal dimensionné tombe vite.

### 7.3 Temps réel : pas de webhook natif

PrestaShop n'a pas de webhooks. Deux options, à implémenter dans cet ordre :

**Option A (recommandée) — module PHP `gtmgrowth`**
Le module s'abonne aux hooks et pousse l'événement vers notre endpoint :

| Hook | Moment | Charge utile |
|---|---|---|
| `actionValidateOrder` | Commande validée | `$order`, `$customer`, `$cart` |
| `actionOrderStatusPostUpdate` | Changement de statut | `$order`, `$newOrderStatus` |
| `actionProductAdd` / `actionProductUpdate` | Catalogue | `$product` |
| `actionUpdateQuantity` | Stock | `$idProduct`, `$idProductAttribute`, `$quantity` |

Contraintes : signer le corps en HMAC-SHA256 avec un secret généré à l'installation, réessayer avec backoff, ne jamais bloquer le tunnel d'achat (appel asynchrone, timeout court, échec silencieux côté boutique).

Compatibilité : PHP 7.4 pour 1.7, PHP 8.1+ pour 8.x, 8.2 pour 9.x ; multistore via `id_shop`.

**Option B (repli, sans installation) — polling incrémental**
`GET /api/orders?filter[date_upd]=[<curseur>,<maintenant>]&date=1&limit=0,500`, toutes les 5 à 15 minutes. Latence acceptable pour un rapport, pas pour une alerte temps réel. C'est aussi le mécanisme de backfill dans les deux cas.

### 7.4 Pièges connus

- Les montants sont HT/TTC selon la configuration : toujours lire `total_paid_tax_incl` et `total_paid_tax_ex` et indiquer lequel est utilisé.
- `order_details` peut contenir des lignes personnalisées sans `product_id` : conserver `product_name` et `product_reference`.
- Les statuts sont des **identifiants** (`current_state`), pas des libellés : charger `order_states` une fois et mapper.
- Multistore : filtrer par `id_shop` sinon on mélange les boutiques.
- Le webservice renvoie du XML si `output_format=JSON` est oublié : parser les deux, ou échouer explicitement.
- Une clé webservice peut être restreinte par ressource et par méthode : tester les droits au moment de la connexion, pas au premier incident.

---

## 8. Contrats internes

```ts
export interface EcommerceProvider {
  readonly id: "shopify" | "prestashop";
  /** Vérifie les droits et renvoie l'identité de la boutique. */
  connect(input: ConnectInput): Promise<Store>;
  listProducts(cursor: string | null, limit: number): Promise<Page<Product>>;
  listOrders(cursor: string | null, limit: number): Promise<Page<Order>>;
  /** Valide la signature et normalise l'événement. */
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean;
  parseWebhook(rawBody: string): Promise<Order | Product | null>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Points de quota consommés, quand le provider les expose. */
  cost?: { used: number; available: number };
}
```

Un seul contrat pour deux plateformes : les différences (coût GraphQL, champs XML, statuts) restent dans les mappers, jamais dans l'ingestion.

---

## 9. Attribution : relier une commande à un moteur IA

### 9.1 Signaux, dans l'ordre de priorité

| Priorité | Signal | Méthode retenue | Confiance |
|---|---|---|---|
| 1 | `utm_source` explicite (`chatgpt`, `perplexity`, `copilot`…) | `utm` | haute |
| 2 | Referrer correspondant à un moteur | `referrer` | haute |
| 3 | Referrer vide + landing page produit + session GA4 connue | `ga4_join` | moyenne |
| 4 | Aucun signal | `unknown` | — |

### 9.2 Table de correspondance des referrers

| Moteur | Motifs de referrer |
|---|---|
| ChatGPT | `chatgpt.com`, `chat.openai.com` |
| Claude | `claude.ai` |
| Perplexity | `perplexity.ai` |
| Copilot | `copilot.microsoft.com`, `bing.com/chat` |
| Gemini | `gemini.google.com` |
| Grok | `grok.com`, `x.com/i/grok` |

### 9.3 Règles

- Fenêtre d'attribution : **30 jours**, premier contact, configurable par tenant.
- Une commande = une attribution. Les commandes suivantes du même client gardent leur propre signal.
- Le referrer est souvent **masqué** par les moteurs et les navigateurs : l'attribution `unknown` doit être affichée comme telle, jamais reclassée d'office.
- Les bots (crawlers IA) ne doivent pas être comptés comme du trafic : filtrer par user-agent et par absence d'événements d'engagement.
- Toute attribution est **explicable** : la console affiche le signal, la méthode et la confiance. Sans ça, le rapport n'est pas défendable en comité.

### 9.4 Envoi côté mesure

Les commandes attribuées peuvent être renvoyées à GA4 via le **Measurement Protocol** (déjà implémenté : `configure_measurement_protocol`, secrets par propriété) pour que la vue GA4 du client contienne le revenu, pas seulement les sessions.

---

## 10. Sécurité, conformité, exploitation

| Sujet | Exigence |
|---|---|
| Secrets | Jeton Shopify / clé PrestaShop chiffrés au repos (AES-GCM, clé par tenant), jamais renvoyés au navigateur, rotation documentée |
| Isolation | Un tenant ne peut jamais lire le store d'un autre : test automatisé obligatoire |
| Webhooks | HMAC obligatoire, fenêtre anti-rejeu (timestamp + nonce), refus silencieux (200 + log) en cas de signature invalide |
| SSRF | URL de boutique validée (http/https, pas d'IP privée), redirections limitées |
| PII | Aucun nom, e-mail, téléphone, adresse en base ; `customerRef` = HMAC de l'identifiant client |
| Rétention | Commandes 13 mois, agrégats 25 mois, purge planifiée |
| Effacement | `customers/redact` (Shopify), commande d'effacement console (PrestaShop) |
| Journalisation | Logs sans PII, un identifiant de corrélation par événement |
| Observabilité | Métriques par connecteur : lag d'ingestion, taux 4xx/5xx, signatures rejetées, taille de la DLQ |

---

## 11. Plan de livraison

| Phase | Contenu | Charge | Dépendance |
|---|---|---|---|
| P0 | Types canoniques, store, ingestion idempotente, file Redis, HMAC | 5 j | — |
| P1 | Connecteur Shopify (OAuth, GraphQL, webhooks, backfill) | 8 j | P0 |
| P2 | Connecteur PrestaShop (client webservice, module PHP, backfill) | 9 j | P0 |
| P3 | Attribution + onglet console « Commerce » | 6 j | P1 ou P2 |
| P4 | Audit GEO des fiches produit + feed readiness | 5 j | P1/P2 |
| P5 | Rapport PDF « AI revenue » + alertes | 4 j | P3 |
| **Total** | | **~37 j** | |

Hypothèses : 1 développeur, pas de revue App Store, environnements de test fournis par deux boutiques pilotes (une par plateforme). Une revue Shopify ajoute 2 à 4 semaines de calendrier, pas de charge de développement.

---

## 12. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Referrer masqué par les moteurs | Attribution incomplète | Afficher `unknown`, proposer un champ UTM documenté au marchand, ne jamais extrapoler |
| `read_all_orders` refusé | Pas d'historique > 60 j | Backfill partiel + mention explicite dans le rapport |
| PrestaShop lent ou mal configuré | Timeouts de backfill | Pagination agressive, une requête à la fois, reprise sur curseur |
| Module PHP bloquant le tunnel | Perte de CA chez le marchand | Appel asynchrone, timeout 2 s, échec silencieux, journal local |
| Doublons de commandes | Chiffres faux | Clé d'idempotence provider + contrainte unique en base |
| Données client protégées (Shopify) | Refus d'installation | Pseudonymisation dès l'ingestion, aucun champ nominatif demandé |
| Écart PrestaShop HT/TTC | Revenu sous-estimé | Stocker les deux, afficher la base utilisée |

---

## 13. Critères d'acceptation

1. Rejouer 10 fois le même webhook produit une seule commande.
2. Une signature HMAC invalide est rejetée sans écriture et journalisée.
3. Un catalogue de 5 000 produits est importé en moins de 10 minutes, reprise après coupure incluse.
4. Une commande Shopify payée apparaît dans la console en moins de 60 secondes (p95).
5. Une commande PrestaShop validée apparaît en moins de 60 secondes avec le module, moins de 15 minutes en polling.
6. Les tests d'isolation montrent qu'un tenant A ne lit jamais les données du tenant B.
7. Aucune colonne de la base ne contient d'e-mail, de nom ou de téléphone (test de schéma).
8. L'attribution d'un échantillon de 100 commandes est confirmée à ≥ 90 % par contrôle manuel.
9. Une fiche produit sans JSON-LD `Product` est signalée dans le top des corrections.
10. Le rapport PDF s'ouvre et contient le revenu attribué par moteur, avec la méthode affichée.

---

## 14. Apports de l'intégration

### 14.1 Ce que ça change pour le client

1. **La preuve qui manque au budget GEO.** Aujourd'hui la conversation s'arrête à « votre score est passé de 47 à 76 ». Demain : « 12 400 € de commandes attribuées aux moteurs IA ce trimestre, sur 38 commandes ». C'est ce chiffre qui reconduit un budget, pas un score.
2. **La priorisation par l'argent, pas par la page.** Auditer 500 fiches produit à égalité de score n'a pas de sens ; les prioriser par CA exposé (CA × écart de score) change la feuille de route.
3. **Un argument de vente concret pour l'agence.** Le connecteur transforme la console en source de vérité commerce : elle répond à « combien » et plus seulement à « combien de visites ».
4. **La rétention.** Un client qui a branché sa boutique ne change pas d'outil de mesure au trimestre suivant : la donnée historique et l'attribution vivent chez vous.
5. **Une extension naturelle du produit.** Le même socle (webhooks, normalisation, isolation tenant) resservira pour WooCommerce, les ERP ou les feeds marketplace. C'est un investissement d'architecture, pas une fonctionnalité isolée.

### 14.2 Ce que ça ne promet pas

- **Pas de causalité.** Une commande attribuée à ChatGPT n'a pas été « causée » par ChatGPT : elle est corrélée à un referrer ou à un UTM. La méthode doit être affichée partout, sinon le premier client qui creuse invalide tout le rapport.
- **Pas d'exhaustivité.** Les referrers masqués, les achats sur un autre appareil et les achats en boutique physique resteront hors radar.
- **Pas de remplacement de GA4.** Le connecteur ajoute la couche commande et l'attribution IA ; GA4 reste la source pour le comportement.

### 14.3 Ordre de valeur

| Livraison | Valeur immédiate |
|---|---|
| Catalogue + fiches produit auditées | La plus rapide : réutilise le moteur GEO existant, aucun webhook à écrire |
| Commandes + attribution | La plus forte : c'est elle qui justifie le budget |
| Feed readiness | La plus « produit » : ouvre la porte aux agents d'achat |
| Alertes | La plus « rétention » : crée une raison de revenir chaque semaine |

Une fois Shopify et PrestaShop en place, WooCommerce devient le troisième connecteur naturel : même contrat, même ingestion, seul le client change.

---

## 15. Sources et vérifications

| Sujet | Source |
|---|---|
| Limites et *leaky bucket* Shopify | <https://shopify.dev/docs/api/usage/limits> et <https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits> |
| Topics de webhooks Shopify | <https://shopify.dev/docs/api/webhooks> |
| Conformité et webhooks obligatoires | <https://shopify.dev/docs/apps/build/privacy-law-compliance> |
| Webservice PrestaShop (auth, CRUD, JSON) | <https://devdocs.prestashop-project.org/9/webservice/getting-started/> |
| Admin API PrestaShop 9 (OAuth2, API Platform) | <https://devdocs.prestashop-project.org/9/admin-api/> |
| Hooks `actionValidateOrder`, `actionOrderStatusPostUpdate` | <https://devdocs.prestashop-project.org/9/modules/concepts/hooks/list-of-hooks/actionvalidateorder> |

Chiffres à revalider au moment de l'implémentation : les limites Shopify évoluent par version d'API et par plan ; les hooks PrestaShop varient légèrement entre 1.7 et 9.
