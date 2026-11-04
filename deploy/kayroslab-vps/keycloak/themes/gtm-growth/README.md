# Thème Keycloak « gtm-growth »

Monté dans le conteneur Keycloak sur `/opt/keycloak/themes/gtm-growth` (voir `docker-compose.prod.yml`).

- `login/` : page de connexion (parent `keycloak.v2`), libellés FR.
- `email/` : e-mails d'invitation et de réinitialisation (parent `base`).

Habillage par client : en mode Organisations, la page de connexion affiche le nom de l'organisation et
la console applique le logo et la couleur du tenant (`branding`). Pour un thème totalement personnalisé,
provisionner le client en **realm dédié** et copier ce dossier en `themes/<client>/`, puis définir
`loginTheme` sur ce realm.
