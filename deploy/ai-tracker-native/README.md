# Tracker IA natif — déploiement local

Voir la documentation produit : `docs/product/AI-TRACKER-NATIVE.md`.

## Démarrage

```bash
cp .env.example .env       # renseigner AI_TRACKER_TENANT_ID
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:14b
```

## Sessions scraper (optionnel, désactivé par défaut)

1. Activer le tracker avec `AI_TRACKER_ENABLED=true`, puis faire accepter la version courante du disclaimer par un administrateur du tenant dans l’onglet Moteurs.
2. Créer la session : lancer une fois Chromium avec le profil dédié au tracker, se connecter avec le compte du client, puis exporter le `storageState` dans le volume `tracker_data`, sous `/data/ai-tracker-sessions/<tenant>/<engine>.json`.
3. Le worker utilise uniquement ces fichiers ; aucun mot de passe n'est stocké dans le repo.

VPS cible : 8 Go RAM minimum (16 Go recommandés), 20 Go de disque pour 90 jours de réponses brutes.
