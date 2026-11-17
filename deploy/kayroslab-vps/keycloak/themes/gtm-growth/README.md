# GTM Growth Keycloak theme

The login theme inherits `keycloak.v2` on Keycloak **26.4**. It keeps native login,
registration, reset, OTP and organisation templates. Only branding changes:
violet `#6935dc`, lavender surfaces, Inter, 52px controls and the public rocket logo.
`darkMode=false` keeps these light surfaces consistent with the public website.

| Directory | Parent | Purpose |
| --- | --- | --- |
| `login/` | `keycloak.v2` | Native sign-in and authentication screens; current public identity |
| `email/` | `base` | Existing transactional email templates, EN/FR |
| `account/` | `keycloak.v3` | Native account console; public rocket wordmark, violet/light surfaces, Inter and consistent controls |

`login/theme.properties` loads the versioned `css/gtm-growth-v2.css`. The rocket
and Inter font are local copies from `site/fr/assets/`; there are no CDN requests.
The account theme sets the native `logo` and `logoUrl` properties, supplies a
self-contained rocket/wordmark SVG and favicon, and bundles Inter locally. It sets
`darkMode=false` so an OS dark preference cannot restore Keycloak's default shell.
Account links from the console carry the referrer and selected locale; the native
return action and brand link lead back to GTM Growth. Login/reset screens also
include a localized console return link through the native footer extension.
The realm's `loginTheme`, `emailTheme` and `accountTheme` remain `gtm-growth`.

## Deployment and rollback

Use `deploy/kayroslab-vps/deploy.sh`, not an ad hoc Compose invocation. It hashes
all theme files into `GTM_THEME_REVISION`, which becomes a Keycloak service label.
A changed digest recreates that container, clearing its production theme cache;
an unchanged digest does not restart it. Production theme caching stays enabled.
Allow a brief interruption to new sign-ins during this recreation. Persistent
Postgres data and the other applications on the VPS are not changed by the theme.

Revert the theme commit and rerun the same deployment script to roll back. After
deployment, open a fresh OIDC login flow in FR and EN and verify the rocket,
violet submit button, visible focus, locale selector and password visibility toggle.
Also open Mon compte / My account and verify the wordmark, light navigation,
profile fields, mobile menu and return destination. `deploy.sh` now fails if the
public account environment, violet stylesheet, wordmark, favicon or Inter font
is missing after SSO becomes ready.
Do not reuse an expired authentication URL or submit customer credentials for QA.

## Isolated browser verification

`node scripts/qa-brand.mjs` runs in CI with Docker and Playwright Chromium. It starts
an ephemeral Keycloak 26.4 realm with one disposable test user and no production configuration, mounts
this theme read-only and checks login/reset in FR/EN at 390px and 1280px, including
a dark OS preference. It signs in the fixture user to test the real account React
console, checks the logo loads and captures the account screen in both languages. It also captures the real dashboard renderers using clearly
labelled synthetic data. The container is removed in `finally`.

See [Keycloak theme documentation](https://www.keycloak.org/ui-customization/themes).
