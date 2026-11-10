/** Preserve the landing language when opening the authenticated Cloud console.
 * This does not touch public pages, external links or OAuth redirects. */
const language = document.documentElement.lang.startsWith("fr") ? "fr" : "en";
for (const link of document.querySelectorAll("a[href]")) {
  try {
    const url = new URL(link.href, location.href);
    if ((url.hostname === location.hostname || url.hostname === "gtm.kayroslab.com") && url.pathname.startsWith("/console/")) {
      url.searchParams.set("lang", language);
      link.href = url.href;
    }
  } catch { /* ignore fragment-only and malformed links */ }
}
