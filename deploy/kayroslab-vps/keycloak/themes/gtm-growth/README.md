# Thème Keycloak « gtm-growth »

Habillage des pages utilisateur Keycloak aux couleurs du site public GTM Growth
(`site/styles.css` : tokens `--brand`, `--night`, boutons pill, Inter / system-ui).

Monté dans le conteneur sur `/opt/keycloak/themes/gtm-growth`
(voir `docker-compose.prod.yml`).

## Contenu

| Dossier | Parent | Rôle |
|---------|--------|------|
| `login/` | `keycloak.v2` | Connexion, inscription, reset mot de passe, OTP, choix d’organisation |
| `email/` | `base` | E-mails reset / vérification / execute-actions (HTML + texte, FR & EN) |
| `account/` | `keycloak.v3` | Console compte (branding léger PatternFly) |

Libellés FR + EN. Logo : `login/resources/img/logo.png` (copie de `site/assets/logo-128.png`).

## Realm

Dans `realm-gtm-growth.json` :

- `loginTheme`: `gtm-growth`
- `emailTheme`: `gtm-growth`
- `accountTheme`: `gtm-growth`

Les **Organizations** (un tenant = une organisation Keycloak) restent inchangées :
le sélecteur d’organisation hérite du même CSS.

## Preview sans toucher la prod

Déployer aussi ce dossier sous le nom `gtm-preview`, créer un realm temporaire
`theme-preview` avec `loginTheme=gtm-preview`, et laisser le realm `gtm-growth`
sur l’ancien CSS jusqu’à validation.
