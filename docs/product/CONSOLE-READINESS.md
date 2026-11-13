# Console navigation and data readiness

Implemented in the console navigation fix, 13 November 2026. This document
describes the source changes; it does not certify an OVH production deployment.

The initial production review reproduced a customer picker displaying a membership
while requests had no selected tenant, detached forms failing to start their read,
and manual “Load” gates on journey and operations views. The sidebar fields could
outgrow their grid column, while the main grid stretched short content vertically.

## Entry contract

- Resolve the active workspace before rendering or requesting customer data. When
  there is exactly one existing membership, validate it through `/me` before
  remembering it. Multiple memberships require an explicit selection. Backend
  permissions remain authoritative.
- Open each data view by reading its existing data or running an allowlisted read.
  A refresh button is optional; it is never the initial display prerequisite.
- Missing data is not a zero or a demonstration metric. Show a reason, an ordered
  procedure and links to the configuration/import screen. Preserve the technical
  error in a disclosure for diagnosis and offer retry.
- Generation requiring user input, paid collections, imports, external writes,
  publication and downloads remain deliberate actions. Their inputs and next
  action are explained on entry.
- Both interface languages use the same components and layout. Upstream diagnostic
  messages and source-supplied instructions can retain their original language
  inside disclosures; the main procedures are translated.

## Navigation acceptance map

| Entry | On entry | When unavailable or empty |
|---|---|---|
| Overview | Audience sources, GEO audit and setup status | Source links; failed audit has recovery instructions |
| Global and local SEO | Website search performance when configured | Search Console setup; links to technical audit, sitemap and local network |
| Products & pages | Bounded public metadata read, image cards, completeness gauges and searchable table | Product/og:image setup or previewed JSON import; inaccessible pages and images remain explicit |
| Local network subtab | Registry, observations, controls and actions | CSV/JSON import procedure; customer account and delegation requirements |
| Local planning subtab | Editable business profile | Explain required inputs; export/reimport the dossier to retain work |
| Competition | Latest imported dataset, comparison and available GSC suggestions | Actual-answer import instructions, brand/alias requirements, dates and sources; reset empty filters |
| AI visibility | Latest dataset/report | Import instructions and expanded JSON import form for administrators |
| Search Console | Period-specific performance | Property, service-account access and period guidance |
| GA4 | Period-specific analytics | Numeric property ID, Viewer permission and event collection guidance |
| Bing Webmaster | Period-specific performance | Verified site, API key and access guidance |
| GEO | llms.txt read, validation and drift | URL/reachability/domain guidance; missing files remain audit findings |
| Citability | Read-only page analysis | Public-page and authorised-domain procedure |
| IndexNow | Existing readiness audit and local key generator | Failed audit is explained; key generation remains explicit |
| Sitemap | Sitemap map read | Public sitemap and crawl configuration procedure |
| Performance | PageSpeed read | Failure detail and URL/configuration procedure |
| Customer journey (Act) | Public-page reading and five-stage hypotheses | Labelled manual outline if reading fails; no invented observed content |
| GEO fixes | Read-only robots.txt diff | Domain/access guidance; no website writes |
| Search | Search Console queries | Connect property/access; expand an empty period |
| Keywords | Opportunities and clusters | Property/period/filter guidance; tracked-query subtab loads saved data directly |
| Tracking | Connection status | Service-account and source configuration steps |
| GTM | Container inventory | Container path and read-access procedure |
| Technical audit | Bounded read-only crawl | URL/reachability procedure |
| Generators | Parameter form and instructions | User supplies context and explicitly generates content |
| Calculators | CTR curve | Other calculators explain required scenario inputs |
| Report | Export form and procedure | PDF generation/download remains explicit |
| Operations | Saved prompts; rank and alert subtabs also read on entry | Add questions/keywords, configure sources; no automatic paid collection |
| Platform administration | Customer inventory | Existing platform access/configuration flow |

Local SEO deliberately rejects a platform-admin session, including one with a
customer selected. This change explains the restriction and the customer-account
workflow; it does not weaken it. GBP and Node-RED configuration are not performed
by navigation, and no customer dataset is fabricated or imported by this fix.

## Validation

- `tests/console-entry-ui.test.ts`: FR/EN automatic reads, workspace selection,
  missing scope, structured failures, journey fallback, Competition import links,
  local access restrictions and operations reads without collection.
- `tests/console-navigation-ui.test.ts`: all 25 sidebar entries in FR and EN against
  isolated DOM/API fixtures; checks selected-tenant request headers and absence of
  collection/import/publication calls.
- Existing competition UI test now requires automatic Search Console suggestions.
- Full suite, typecheck, lint, build and static site checks are run before delivery.

The shared dashboard CSS contains intrinsic field widths, wraps the account
toolbar, keeps short panels at the top and contains tables. Visual acceptance uses
an isolated browser preview with explicitly labelled synthetic analytics and
actual public product images extracted from atelieraffiche.com. No fixture data
is shipped or written to a customer workspace. Production authenticated acceptance
still requires an active customer SSO session.

## Visual catalogue and dashboard

All sections share compact navigation, section headings, metric cards, table
styles and source/error states. Overview, Competition and AI visibility chart
actual imported answers on a shared 0–100% scale, preserving missing observations
as gaps. Catalogue completeness and GEO readiness never stand in for AI mentions.

The catalogue reads the selected page plus up to five same-origin links through
the existing public-fetch guard. It extracts JSON-LD Product (including nested
ItemList/@graph), Open Graph/Twitter previews and declared organization icons.
At most 200 collected items are shown; this is a sample, not a full crawl. Failures
on secondary pages are disclosed without discarding successful results. Images
load directly from public HTTPS hosts with no referrer and an unavailable fallback;
the application does not host uploads or proxy image bytes.

To supply images, publish Product.image/og:image on the source site, or open
**Products & pages → Add or correct images and catalogue**. Import a JSON array
with `kind` (`product` or `page`), `name`, a same-origin HTTPS `url`, and `imageUrl`
or `images`. Optional product fields: `description`, `brand`, `sku`, `gtin`,
`category`, `price`, `currency`, `availability`. The inline example adapts to the
selected site. Preview is read-only; only an administrator's explicit save writes
the additions. Saving replaces previous imported additions for this tenant and
origin; other customers and sites are isolated in SQLite. Imported additions can
remain visible when a public read fails. File limit: 1 MB; 1–200 imported entries.

AI brand imports additionally accept optional public HTTPS `website` and `logoUrl`
fields. Missing logos remain neutral icons, never guessed third-party images.

Regression coverage includes extraction, bounded partial reads, URL validation,
tenant/domain isolation, administrator-only imports, preview invalidation,
image fallback, unknown gauges, chart gaps, filters and table/card switching.

## Résumé français

Chaque rubrique de données charge son contenu dès l’ouverture ou affiche une
procédure concrète de connexion/import. Le parcours client se trouve dans **Agir**,
car il prépare les questions et les contenus. Les observations IA, les statistiques
Google et les données locales restent distinctes du score de préparation GEO.
L’import manuel des réponses IA permet d’alimenter la comparaison sans API payante.
