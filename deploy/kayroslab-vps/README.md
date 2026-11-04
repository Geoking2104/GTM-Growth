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
git reset --hard origin/main
bash deploy/kayroslab-vps/deploy.sh
```

Ne jamais versionner `.env.local`, le jeton MCP ou le fichier JSON du service
account. Le site est déjà configuré pour appeler l’API publique via
`https://gtm.kayroslab.com`.
