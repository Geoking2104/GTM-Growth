# Déploiement GTM Growth sur le VPS KayrosLab

## Coordonnées vérifiées

Les paramètres proviennent du dépôt KayrosLab, `deploy/ovh-vps/BOOTSTRAP.md` et
`.github/workflows/deploy-vps-backend.yml` :

| Élément | Valeur |
| --- | --- |
| Fournisseur | OVH VPS |
| Hôte | `51.210.9.71` (`vps-088d27a3.vps.ovh.net`) |
| Accès | SSH port `22`, compte défini par le secret `VPS_SSH_USER` |
| Services déjà présents | OpenDPE (`/opt/opendpe`, port `8080`), KayrosLab (`/opt/kayroslab`, port `8787`) |
| Proxy/TLS | Nginx + Certbot |

GTM Growth utilise son propre répertoire (`/opt/gtm-growth`), Docker Compose,
le port local `4300` et les volumes Docker `gtm_growth_*`. Il ne touche donc ni
aux processus PM2 ni aux ports des deux applications existantes.

## Première installation

1. Créer un enregistrement DNS `A` : `gtm.kayroslab.com` -> `51.210.9.71`.
2. Sur le VPS, en SSH avec le même compte administrateur que KayrosLab :

   ```bash
   git clone https://github.com/Geoking2104/GTM-Growth.git /opt/gtm-growth
   git config --global --add safe.directory /opt/gtm-growth
   cd /opt/gtm-growth
   mkdir -p .secrets
   cp deploy/kayroslab-vps/.env.production.example deploy/kayroslab-vps/.env.local
   chmod 600 deploy/kayroslab-vps/.env.local
   # éditer MCP_API_TOKEN ; installer ensuite le service account si nécessaire
   ```

3. Installer Docker Compose si nécessaire, puis lancer le backend :

   ```bash
   bash deploy/kayroslab-vps/deploy.sh
   ```

4. Installer Nginx et le certificat une seule fois :

   ```bash
   cp deploy/kayroslab-vps/nginx-gtm-growth.conf /etc/nginx/sites-available/gtm.kayroslab.com
   ln -s /etc/nginx/sites-available/gtm.kayroslab.com /etc/nginx/sites-enabled/gtm.kayroslab.com
   nginx -t && systemctl reload nginx
   certbot --nginx -d gtm.kayroslab.com --redirect --agree-tos -m contact@kayroslab.com
   ```

5. Vérifier :

   ```bash
   curl -fsS https://gtm.kayroslab.com/health
   curl -I https://gtm.kayroslab.com/
   ```

## Déploiements suivants

Sur le VPS, après chaque mise à jour :

```bash
cd /opt/gtm-growth
git fetch origin main
git merge --ff-only origin/main
bash deploy/kayroslab-vps/deploy.sh
```

Ne jamais versionner `.env.local`, le jeton MCP ou le fichier JSON du service
account. Le site est déjà configuré pour appeler l’API publique via
`https://gtm.kayroslab.com`.

## Keycloak (SSO de la console)

Services ajoutés au compose : `keycloak` (Keycloak 26, `start --import-realm`, mode
production, `127.0.0.1:8180`) et `keycloak-db` (Postgres 16, volume
`gtm_growth_keycloak_db`). Le realm `gtm-growth` et le client public `gtm-console`
sont importés depuis `keycloak/realm-gtm-growth.json` au premier démarrage.

1. DNS IONOS : **A** `auth.kayroslab.com` → `51.210.9.71`.
2. Dans `.env.local` (chmod 600), renseigner des valeurs générées sur le VPS :

   ```bash
   echo "KC_DB_PASSWORD=$(openssl rand -base64 32)" >> deploy/kayroslab-vps/.env.local
   echo "KC_BOOTSTRAP_ADMIN_PASSWORD=$(openssl rand -base64 32)" >> deploy/kayroslab-vps/.env.local
   ```

   (`KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_HOSTNAME`, `OIDC_ISSUER` : voir `.env.production.example`.)
3. `bash deploy/kayroslab-vps/deploy.sh`
4. Nginx + TLS :

   ```bash
   cp deploy/kayroslab-vps/nginx-auth-kayroslab.conf /etc/nginx/sites-available/auth.kayroslab.com
   ln -s /etc/nginx/sites-available/auth.kayroslab.com /etc/nginx/sites-enabled/auth.kayroslab.com
   nginx -t && systemctl reload nginx
   certbot --nginx -d auth.kayroslab.com --redirect --agree-tos -m contact@kayroslab.com
   ```

   Reporter aussi le bloc `location /console/` (et `proxy_read_timeout 180` sur `/api/`) de
   `nginx-gtm-growth.conf` dans le vhost HTTPS de `gtm.kayroslab.com` géré par certbot.
5. Se connecter à `https://auth.kayroslab.com/admin/` avec le compte d'administration
   initial, puis dans le realm `gtm-growth` : créer l'utilisateur, son mot de passe, et lui
   attribuer le rôle `console-user`. Créer ensuite un administrateur permanent et
   supprimer le compte initial (recommandation Keycloak). Restreindre `/admin/` par IP dans le vhost.
6. Vérifier : `curl -fsS https://auth.kayroslab.com/realms/gtm-growth/.well-known/openid-configuration`
   puis ouvrir `https://gtm.kayroslab.com/console/`.

Optionnel — générateurs via modèle open source : `docker compose --profile llm up -d ollama`,
`docker compose exec ollama ollama pull mistral`, puis `OLLAMA_URL=http://ollama:11434` dans `.env.local`.

## Keycloak multi-tenant (clients GTM Growth)

- DNS : `A *.gtm.kayroslab.com → 51.210.9.71`, plus un certificat joker obtenu par DNS-01 (`certbot-dns-ionos`, open source).
- Le dossier `keycloak/themes/` est monté dans le conteneur (`gtm-growth` login/email/account ; un thème `gtm-preview` peut cohabiter pour validation).
- Dans Keycloak, configurer :
  - le SMTP du realm `gtm-growth` (invitations, mot de passe oublié) ;
  - le secret du client `gtm-provisioner` → `KEYCLOAK_ADMIN_CLIENT_SECRET` dans `.env.local` ;
  - les rôles du compte de service (`manage-realm`, `manage-users`, `manage-clients`, `manage-identity-providers`) ;
  - le compte `platform-admin`.
- Pour ajouter un client, la méthode recommandée en production est `POST /api/platform/tenants`, avec un jeton `platform-admin`. Autre possibilité, depuis le dépôt cloné sur le VPS : `KEYCLOAK_INTERNAL_URL=http://127.0.0.1:8180 TENANTS_PATH=<volume gtm_growth_data>/tenants.json npm run tenant:provision -- …`. L'image de production n'embarque pas `scripts/`. Voir le README principal (« Ajouter un client »).
- Le realm s'importe au premier démarrage (`--import-realm` n'écrase pas un realm existant). Sur un Keycloak déjà initialisé, appliquer à la main : Organisations activées, mappers `groups` et `organization`, rôle `platform-admin`, client `gtm-provisioner`.

## Stockage de la visibilité IA

Les jeux de données sont stockés dans `ai-visibility/datasets.sqlite3` sur le volume de données (ou dans `AI_VISIBILITY_PATH` si défini). SQLite utilise des transactions et un journal de rollback pour les écritures de plusieurs processus sur un même serveur et un système de fichiers local. Ne pas partager cette base entre plusieurs hôtes via un disque réseau. Le registre de tenants utilise un stockage distinct.

À la première consultation de chaque tenant, les anciens fichiers JSON sont importés dans une transaction et conservés. Arrêter tous les anciens processus écrivant les fichiers JSON avant la migration : leurs écritures ultérieures ne seraient pas reprises. Conserver et gérer les anciens fichiers dans les procédures de rétention. Une restauration de l'ancien code après migration nécessite d'abord un export des nouvelles données : les fichiers JSON ne sont plus mis à jour.

Sauvegarder la base avec l'API de sauvegarde SQLite ou arrêter tous les processus et copier la base et son éventuel journal ensemble. Vérifier la restauration et inclure les sauvegardes et anciens JSON dans les procédures d'effacement. La suppression automatique après un an n'est pas implémentée.
