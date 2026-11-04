/* Configuration OIDC de la console. À adapter au déploiement (aucun secret ici :
 * gtm-console est un client public, Authorization Code + PKCE). */
export const OIDC = {
  // Realm partagé (Organisations Keycloak). Un client en realm dédié a son propre
  // émetteur, renvoyé par /api/tenants/discover.
  issuer: "https://auth.kayroslab.com/realms/gtm-growth",
  clientId: "gtm-console",
  scope: "openid profile email",
};
export const API_BASE = "/api/console";
export const DISCOVER = "/api/tenants/discover";
/** Domaine des espaces clients : <client>.gtm.kayroslab.com */
export const CONSOLE_DOMAIN = "gtm.kayroslab.com";
