# GTM implementation guide (and how to verify it)

End-to-end checklist for installing **Google Tag Manager** on a site whose
analytics you audit with `google-growth`. Every step lists the tool that checks
it, so the guide is verifiable rather than aspirational.

Adapted from the implementation guide supplied for this integration.

| Step | What you do | Verify with |
|---|---|---|
| 1. Create the container | GTM → Account → Create Container (Web), record `GTM-XXXXXXX` | `gtm_generate_snippet` validates the id shape |
| 2. Install the snippets | `<head>` loader + `<body>` `<noscript>` | `gtm_audit_installation` (`gtm.head_snippet`, `gtm.noscript`) |
| 3. Initialize `dataLayer` | `window.dataLayer = window.dataLayer || []` **before** the loader | `gtm_audit_installation` (`gtm.datalayer_order`) |
| 4. Configure tags & triggers | GA4 Configuration / Google Tag, All Pages | `audit_ga4_setup_v2`, `get_ga4_tags`, `find_tags_by_trigger` |
| 5. Consent (recommended) | Default consent state before GTM loads | `gtm_audit_installation` (`gtm.consent_default`) |
| 6. Test | GTM Preview + Tag Assistant | `gtm_audit_installation` on the staging URL |
| 7. Publish | Submit → Version name → Publish | `list_gtm_workspaces`, `get_gtm_container_summary` |

---

## 1. Create the container

1. Sign in to [tagmanager.google.com](https://tagmanager.google.com/).
2. Select or create the account for your organisation.
3. **Create Container** → target platform **Web** → name it (e.g. `Google-Growth Web Production`).
4. Record the **Container ID** (`GTM-XXXXXXX`).

## 2. Install the snippets

### Head loader (as high as possible in `<head>`)

```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
<!-- End Google Tag Manager -->
```

### Body fallback (immediately after `<body>`)

```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

Generate both, already filled in, with:

```
gtm_generate_snippet({ containerId: "GTM-XXXXXXX" })
```

The tool rejects an id that is not `GTM-XXXXXXX` instead of emitting broken
markup, and can prepend the `dataLayer` and consent blocks described below.

## 3. Initialize the data layer

Declare it **before** the loader so early events are not lost:

```html
<script>
  window.dataLayer = window.dataLayer || [];
</script>
```

Push interactions from application code:

```javascript
window.dataLayer.push({
  event: "form_submission",
  form_id: "contact_growth_form",
  user_role: "prospect",
});
```

`gtm_audit_installation` compares source order and fails `gtm.datalayer_order`
when the initialization appears after the loader — a silent source of missing
conversions.

## 4. Configure tags & triggers

In the container: **Tags → New → Google Tag** (GA4 configuration), then set the
Measurement ID (`G-XXXXXXXXXX`) and trigger **Initialization – All Pages**.

Then audit the container itself:

- `audit_ga4_setup_v2` — score, missing recommended events, parameter quality
- `get_ga4_tags` — configuration vs event tags, measurement ids
- `find_tags_by_trigger` — what actually fires on All Pages
- `detect_duplicate_tags` — the same event fired twice

## 5. Consent (recommended)

Set the default state **before** GTM loads:

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied'
  });
</script>
```

`gtm_audit_installation` reports this as advisory (`gtm.consent_default`): it
does not fail the installation score, but it warns when the default is missing
or ordered after the loader.

## 6. Test

1. GTM → **Preview**, enter the staging URL.
2. In Tag Assistant, confirm the container connects, the expected tags fire and
   the **Data Layer** tab holds the key/value pairs you expect.
3. Run `gtm_audit_installation` against the same URL — it checks the page, not
   the container, so the two views are complementary.

## 7. Publish

**Submit** → version name (e.g. `v1.0 – Initial GTM Setup & GA4 Integration`) →
**Publish**. Record the version in the release notes; `get_gtm_container_summary`
and `list_gtm_workspaces` confirm what is live in the workspace you audited.

---

## Checklist

- [ ] Container created, `GTM-XXXXXXX` recorded
- [ ] Head loader and `<noscript>` installed (`gtm.head_snippet`, `gtm.noscript`)
- [ ] `dataLayer` initialized before the loader (`gtm.datalayer_order`)
- [ ] One container only (`gtm.single_container`)
- [ ] GA4 configuration + events configured (`audit_ga4_setup_v2`)
- [ ] Consent default set before load (`gtm.consent_default`)
- [ ] Preview verified, container published

Run the whole page-level checklist at once:

```
gtm_audit_installation({ url: "https://example.com" })
```

It returns each check with its evidence, a 0–100 score over the required checks,
and the container ids found on the page. Page-level only: it never reads the
container's tags — that is what the Tag Manager API tools are for.
