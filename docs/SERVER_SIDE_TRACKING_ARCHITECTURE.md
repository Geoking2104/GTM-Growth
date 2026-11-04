# Server-Side Tracking Architecture

**Référence technique** — Google Growth / KayrosLab  
Version : 1.1 · Août 2026  
Scope : Google Tag Manager Server-Side (sGTM) + Google Analytics 4

---

## Support dans Google Growth (implémenté)

| Phase | Tool | Statut |
|-------|------|--------|
| S1 | `list_sgtm_containers`, `list_gtm_clients`, `get_gtm_client_details` | ✅ |
| S2 | `audit_sgtm_setup`, `audit_measurement_protocol_client` | ✅ |
| **S3** | **`compare_dual_tagging`** | ✅ |
| **S4** | **`cutover_checklist`** | ✅ |
| **S5** | **`check_sgtm_health`**, **`sgtm_observability_snapshot`** | ✅ |

### S3 — Dual-tagging

Compare :
- events configurés dans GTM **Web**
- capacité **sGTM** (clients + tags GA4)
- events **réellement reçus** dans GA4

Sortie : match rate, events manquants, risks, signaux de dual-tagging.

### S4 — Cutover checklist

Checklist automatisée (pass/fail/warn) :
- audit web ≥ 70
- audit sGTM ≥ 70 + client GA4 + tag GA4
- secrets MP
- parité web ↔ GA4
- qualité e-commerce
- `/healthy` (optionnel)

Flags : `readyForDualTagging`, `readyForCutover`.

### S5 — Health / observabilité

- Probe `/healthy`, `/healthz`, `/`
- Latence + status
- Snapshot + realtime GA4 optionnel

---

## Architecture (rappel)

```text
Browser (GTM Web / gtag + server_container_url)
    → sGTM first-party (Cloud Run)
        → Clients (GA4, MP)
        → Tags (GA4, CAPI…)
            → GA4 property
```

Voir le détail complet dans l’historique du fichier (sections 1–13) : principes, flux, consent, dédup, déploiement, checklist manuelle.

## Workflow recommandé avec les tools

```text
1. audit_sgtm_setup + audit_ga4_setup_v2
2. verify_ga4_secrets + configure_measurement_protocol
3. compare_dual_tagging
4. cutover_checklist (+ sgtmHealthUrl)
5. dual-tagging progressif + event_id
6. sgtm_observability_snapshot pendant 48–72h
7. cutover client-side → server-only
```

**Licence** : Apache-2.0 · [Google Growth](https://github.com/Geoking2104/GTM-Growth)
