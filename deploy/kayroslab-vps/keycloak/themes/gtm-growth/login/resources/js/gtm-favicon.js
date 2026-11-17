/* Keycloak 26.4 hardcodes img/favicon.ico in its parent template.
 * Point that native link at the existing rocket without copying auth templates. */
(() => {
  const script = document.currentScript;
  const favicon = document.querySelector('link[rel="icon"]');
  if (script?.src && favicon) {
    favicon.href = new URL('../img/logo-rocket.png', script.src).href;
    favicon.type = 'image/png';
  }
})();
