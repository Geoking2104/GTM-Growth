import { el } from "./render.js";
import { LANG } from "./i18n.js";
import { renderSearchPerformance } from "./analytics.js";
import { renderDataGuide } from "./data-guidance.js";
const L = (fr, en) => LANG === "fr" ? fr : en;

export function renderGlobalSeo({ state, api, scope }) {
  const root = el("section", "c-global-seo");
  const heading = el("div", "c-page-heading");
  heading.append(el("h2", "", L("SEO du site et des établissements", "Website and location SEO")), el("p", "c-note", L("Les performances de recherche et les observations locales ont des sources distinctes. Ouvrez chaque analyse pour charger les résultats disponibles.", "Search performance and local observations use separate sources. Open each analysis to load available results.")));
  const links = el("div", "c-guide-actions");
  for (const [href, fr, en] of [["#audit", "Audit technique", "Technical audit"], ["#sitemap", "Sitemap", "Sitemap"], ["#geo", "Préparation GEO", "GEO readiness"], ["#local_seo/network", "Réseau et établissements", "Network and locations"]]) { const a = el("a", "c-btn", L(fr, en)); a.href = href; links.append(a); }
  heading.append(links); root.append(heading);
  const search = el("div"); root.append(search);
  const load = async () => {
    if (!state.property) { search.replaceChildren(renderDataGuide("gsc")); return; }
    search.replaceChildren(el("p", "c-loading", L("Chargement Search Console…", "Loading Search Console…")));
    try { const data = await api("/search/performance", scope()); search.replaceChildren(...renderSearchPerformance(data)); }
    catch (error) { search.replaceChildren(renderDataGuide("gsc", { error, retry: load })); }
  };
  void load(); return root;
}
