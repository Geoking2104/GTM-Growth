/* Configuration OIDC de la console. À adapter au déploiement (aucun secret ici :
 * gtm-console est un client public, Authorization Code + PKCE). */
export const OIDC = {
  issuer: "https://auth.kayroslab.com/realms/gtm-growth",
  clientId: "gtm-console",
  scope: "openid profile email",
};
export const API_BASE = "/api/console";
