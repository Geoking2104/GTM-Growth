/* Partner market-data console panel (R4/R5): keyword search volumes, Google
 * SERP positions, GBP local rank grids and backlink intelligence (overview,
 * link gap, disavow export) from the operator's DataForSEO-compatible bridge.
 * Every partner figure carries provenance `partner-api`, the observation date
 * and the locale; unknown stays "—", never zero; the operator owns the partner
 * keys and the call costs. Partner calls are tenant-admin only. The disavow
 * export is a pure tenant selection (provenance tenant-selection), no partner
 * call, and stays available even when the bridge is off. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, callback) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = callback; return b; };
const dash = (value) => value === null || value === undefined ? "—" : String(value);
const deviceLabel = (device) => device === "mobile" ? L("mobile", "mobile") : L("ordinateur", "desktop");

/** Origin, observation date, locale, device and partner cost on every answer. */
const metaLine = (result) =>
  L("Origine : pont partenaire (provenance partner-api)", "Source: partner bridge (provenance partner-api)") +
  ` · ${L("observé le", "observed on")} ${(result?.observedAt ?? "").slice(0, 10)}` +
  ` · ${L("locale", "locale")} ${dash(result?.locale)}` +
  ` · ${deviceLabel(result?.device)}` +
  ` · ${L("coût partenaire", "partner cost")} : ${result?.costUsd === null || result?.costUsd === undefined ? "—" : `${result.costUsd} USD`}`;

export function renderOpsMarket({ api, me }) {
  const box = el("section", "app-strip ops-market");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(
    el("h3", "", L("Données de marché partenaires", "Partner market data")),
    el("p", "c-note", L("Volumes de recherche, positions Google, grille locale GBP et intelligence de netlinking (aperçu, écart concurrentiel, export disavow) depuis le pont partenaire de l’opérateur. Chaque chiffre porte la provenance partner-api avec sa date d’observation ; aucune valeur n’est inventée hors pont et les coûts d’appel restent à l’opérateur.", "Search volumes, Google positions, GBP local grids and backlink intelligence (overview, competitor gap, disavow export) from the operator's partner bridge. Every figure carries provenance partner-api with its observation date; nothing is invented outside the bridge and call costs stay with the operator.")),
    content, message,
  );
  let enabled = false;
  const statusLine = el("p", "c-note", L("Chargement…", "Loading…"));

  /* Volumes form. */
  const volumesInput = el("textarea"); volumesInput.rows = 3; volumesInput.style.width = "100%";
  volumesInput.setAttribute("aria-label", L("Mots-clés (un par ligne)", "Keywords (one per line)"));
  const volumesDevice = el("select"); for (const [value, text] of [["desktop", L("ordinateur", "desktop")], ["mobile", L("mobile", "mobile")]]) { const o = el("option", "", text); o.value = value; o.selected = value === "desktop"; volumesDevice.append(o); }
  const volumesResult = el("div");
  const volumesButton = button(L("Volumes de recherche", "Search volumes"), async () => {
    message.textContent = L("Appel au pont partenaire…", "Calling the partner bridge…");
    try {
      const result = await api("/market/volumes", { keywords: volumesInput.value.split("\n").map((k) => k.trim()).filter(Boolean), device: volumesDevice.value });
      message.textContent = "";
      const table = el("table", "c-table"); const head = el("tr");
      for (const h of [L("Mot-clé", "Keyword"), L("Recherches/mois", "Searches/month"), "CPC", L("Concurrence", "Competition"), L("Devise", "Currency")]) head.append(el("th", "", h));
      table.append(head);
      for (const r of result.results ?? []) { const tr = el("tr"); for (const v of [r.keyword, dash(r.searchVolume), dash(r.cpc), dash(r.competition), dash(r.currency)]) tr.append(el("td", "", String(v))); table.append(tr); }
      volumesResult.replaceChildren(el("p", "c-note", metaLine(result)), table);
    } catch (error) { message.textContent = error.message; }
  });
  volumesButton.disabled = true;

  /* SERP form. */
  const serpInput = el("input"); serpInput.placeholder = L("Mot-clé à vérifier", "Keyword to check"); serpInput.size = 40;
  const serpDepth = el("input"); serpDepth.type = "number"; serpDepth.min = "1"; serpDepth.max = "100"; serpDepth.value = "20"; serpDepth.style.width = "72px";
  const serpResult = el("div");
  const serpButton = button(L("Positions Google", "Google positions"), async () => {
    message.textContent = L("Appel au pont partenaire…", "Calling the partner bridge…");
    try {
      const result = await api("/market/serp", { keyword: serpInput.value, depth: Number(serpDepth.value) || 20 });
      message.textContent = "";
      const table = el("table", "c-table"); const head = el("tr");
      for (const h of [L("Position", "Position"), "URL", L("Titre", "Title")]) head.append(el("th", "", h));
      table.append(head);
      for (const r of result.results ?? []) { const tr = el("tr"); for (const v of [dash(r.position), r.url ?? "", r.title ?? ""]) tr.append(el("td", "", String(v))); table.append(tr); }
      const notes = el("p", "c-note", metaLine(result));
      if (result.aiOverview) notes.append(document.createTextNode(` · ${L("AI Overview", "AI Overview")} : ${result.aiOverview.citedUrls?.length ?? 0} ${L("URL citées", "cited URLs")}`));
      serpResult.replaceChildren(notes, table);
    } catch (error) { message.textContent = error.message; }
  });
  serpButton.disabled = true;

  /* GBP local rank grid form (mobile by default). */
  const gridKeyword = el("input"); gridKeyword.placeholder = L("Mot-clé", "Keyword"); gridKeyword.size = 24;
  const gridLat = el("input"); gridLat.type = "number"; gridLat.step = "any"; gridLat.placeholder = "48.8566"; gridLat.setAttribute("aria-label", L("Latitude du centre", "Centre latitude"));
  const gridLng = el("input"); gridLng.type = "number"; gridLng.step = "any"; gridLng.placeholder = "2.3522"; gridLng.setAttribute("aria-label", L("Longitude du centre", "Centre longitude"));
  const gridDistance = el("input"); gridDistance.type = "number"; gridDistance.step = "any"; gridDistance.value = "1"; gridDistance.style.width = "72px";
  const gridResult = el("div");
  const gridButton = button(L("Grille locale GBP", "GBP local grid"), async () => {
    message.textContent = L("Appel au pont partenaire…", "Calling the partner bridge…");
    try {
      const result = await api("/market/local-grid", { keyword: gridKeyword.value, latitude: Number(gridLat.value), longitude: Number(gridLng.value), columns: 5, rows: 5, distanceKm: Number(gridDistance.value) || 1, device: "mobile" });
      message.textContent = "";
      const table = el("table", "c-table"); const head = el("tr");
      for (const h of [L("Point", "Point"), L("Latitude", "Latitude"), L("Longitude", "Longitude"), L("Rang (≤20)", "Rank (≤20)"), L("Statut", "Status")]) head.append(el("th", "", h));
      table.append(head);
      for (const r of result.results ?? []) { const tr = el("tr"); for (const v of [r.id, r.latitude, r.longitude, dash(r.rank), r.status === "found" ? L("trouvé", "found") : L("non trouvé (—)", "not found (—)")]) tr.append(el("td", "", String(v))); table.append(tr); }
      gridResult.replaceChildren(el("p", "c-note", metaLine(result)), table);
    } catch (error) { message.textContent = error.message; }
  });
  gridButton.disabled = true;

  /* Backlinks: domain overview, link gap versus named competitors (R5). */
  const blDomain = el("input"); blDomain.placeholder = " exemple.fr "; blDomain.size = 28;
  blDomain.setAttribute("aria-label", L("Domaine à analyser", "Domain to analyse"));
  const blReferrers = el("input"); blReferrers.type = "number"; blReferrers.min = "1"; blReferrers.max = "50"; blReferrers.value = "20"; blReferrers.style.width = "64px";
  blReferrers.setAttribute("aria-label", L("Référents affichés (max 50)", "Referrers shown (max 50)"));
  const blOverviewResult = el("div");
  const blOverviewButton = button(L("Aperçu netlinking", "Backlink overview"), async () => {
    message.textContent = L("Appel au pont partenaire…", "Calling the partner bridge…");
    try {
      const result = await api("/market/backlinks/overview", { domain: blDomain.value, referrersLimit: Number(blReferrers.value) || 20 });
      message.textContent = "";
      const profile = el("p", "c-note", `${L("Profil de", "Profile of")} ${dash(result.profile?.domain)} · ${L("backlinks", "backlinks")} : ${dash(result.profile?.backlinks)} · ${L("domaines référents", "referring domains")} : ${dash(result.profile?.refDomains)}`);
      const table = el("table", "c-table"); const head = el("tr");
      for (const h of [L("Domaine référent", "Referring domain"), L("Backlinks", "Backlinks")]) head.append(el("th", "", h));
      table.append(head);
      for (const r of result.referrers ?? []) { const tr = el("tr"); tr.append(el("td", "", String(r.domain ?? "")), el("td", "", dash(r.backlinks))); table.append(tr); }
      blOverviewResult.replaceChildren(el("p", "c-note", metaLine(result)), profile, table);
    } catch (error) { message.textContent = error.message; }
  });
  blOverviewButton.disabled = true;

  const blCompetitors = el("input"); blCompetitors.placeholder = L(" concurrent1.fr, concurrent2.fr ", "competitor1.fr, competitor2.fr "); blCompetitors.size = 40;
  blCompetitors.setAttribute("aria-label", L("Concurrents (1 à 5, séparés par des virgules)", "Competitors (1 to 5, comma-separated)"));
  const blGapResult = el("div");
  const blGapButton = button(L("Écart de netlinking", "Link gap"), async () => {
    message.textContent = L("Appel au pont partenaire…", "Calling the partner bridge…");
    try {
      const competitors = [...new Set(blCompetitors.value.split(",").map((c) => c.trim()).filter(Boolean))];
      const result = await api("/market/backlinks/gap", { domain: blDomain.value, competitors });
      message.textContent = "";
      const profilesTable = el("table", "c-table"); const pHead = el("tr");
      for (const h of [L("Domaine", "Domain"), L("Backlinks", "Backlinks"), L("Domaines référents", "Referring domains")]) pHead.append(el("th", "", h));
      profilesTable.append(pHead);
      for (const r of result.profiles ?? []) { const tr = el("tr"); tr.append(el("td", "", String(r.domain ?? "")), el("td", "", dash(r.backlinks)), el("td", "", dash(r.refDomains))); profilesTable.append(tr); }
      const gapsTable = el("table", "c-table"); const gHead = el("tr");
      for (const h of [L("Domaine à aller chercher", "Domain to pursue"), L("Cite", "Cites"), L("Backlinks vers lui", "Backlinks to it")]) gHead.append(el("th", "", h));
      gapsTable.append(gHead);
      for (const r of result.gaps ?? []) { const tr = el("tr"); tr.append(el("td", "", String(r.domain ?? "")), el("td", "", String((r.citedBy ?? []).join(", "))), el("td", "", dash(r.backlinks))); gapsTable.append(tr); }
      const gapNote = el("p", "c-note", L("Ces domaines citent au moins un concurrent nommé mais pas le domaine du client : terrain de netlinking à instruire, pas un plan d’action automatique.", "These domains cite at least one named competitor but not the client's domain: link-building ground to review, not an automatic action plan."));
      blGapResult.replaceChildren(el("p", "c-note", metaLine(result)), profilesTable, el("p", "c-note", L("Profils comparés", "Compared profiles")), gapsTable, gapNote);
    } catch (error) { message.textContent = error.message; }
  });
  blGapButton.disabled = true;

  /* Disavow export: pure tenant selection, partner-free, bridge-independent. */
  const blDisavowInput = el("textarea"); blDisavowInput.rows = 4; blDisavowInput.style.width = "100%";
  blDisavowInput.setAttribute("aria-label", L("Domaines à désavouer (un par ligne, 200 max)", "Domains to disavow (one per line, 200 max)"));
  const blDisavowResult = el("div");
  const blDisavowButton = button(L("Générer le fichier disavow", "Generate disavow file"), async () => {
    message.textContent = "";
    try {
      const result = await api("/market/backlinks/disavow", { domains: blDisavowInput.value.split("\n").map((d) => d.trim()).filter(Boolean) });
      message.textContent = "";
      const pre = el("pre", "c-code"); pre.textContent = result.content ?? "";
      blDisavowResult.replaceChildren(
        el("p", "c-note", `${L("Fichier", "File")} : ${dash(result.filename)} · ${dash(result.count)} ${L("domaines (provenance : sélection client, aucun appel partenaire)", "domains (provenance: tenant selection, no partner call)")}`),
        pre,
        el("p", "c-note", result.note ?? ""),
        el("p", "c-note", L("Relisez le fichier avant tout import Search Console : le désavow est un acte manuel de l’exploitant, jamais automatique ici.", "Review the file before any Search Console import: disavowing is a manual operator act, never automated here.")),
      );
    } catch (error) { message.textContent = error.message; }
  });
  blDisavowButton.disabled = true;

  const volumesRow = el("p"); volumesRow.append(volumesInput, document.createTextNode(" "), volumesDevice, document.createTextNode(" "), volumesButton);
  const serpRow = el("p"); serpRow.append(serpInput, document.createTextNode(` ${L("profondeur", "depth")} `), serpDepth, document.createTextNode(" "), serpButton);
  const gridRow = el("p"); gridRow.append(gridKeyword, document.createTextNode(` ${L("centre", "centre")} `), gridLat, document.createTextNode(" "), gridLng, document.createTextNode(` ${L("rayon (km)", "distance (km)")} `), gridDistance, document.createTextNode(" "), gridButton);
  const volumesBox = el("div"); volumesBox.append(el("h4", "", L("Volumes de recherche Google", "Google search volumes")), volumesRow, volumesResult);
  const serpBox = el("div"); serpBox.append(el("h4", "", L("Positions Google (SERP)", "Google positions (SERP)")), serpRow, serpResult);
  const gridBox = el("div"); gridBox.append(el("h4", "", L("Grille locale Google Business Profile", "Google Business Profile local grid")), el("p", "c-note", L("Grille 5×5 autour du centre, mobile, rangs jusqu’à 20 : au-delà le point est non trouvé, jamais zéro.", "5×5 grid around the centre, mobile, ranks up to 20: beyond, the point is not found, never zero.")), gridRow, gridResult);
  const blOverviewRow = el("p"); blOverviewRow.append(blDomain, document.createTextNode(` ${L("référents", "referrers")} `), blReferrers, document.createTextNode(" "), blOverviewButton);
  const blOverviewBox = el("div"); blOverviewBox.append(el("h4", "", L("Aperçu netlinking du domaine", "Domain backlink overview")), blOverviewRow, blOverviewResult);
  const blGapRow = el("p"); blGapRow.append(blCompetitors, document.createTextNode(" "), blGapButton);
  const blGapBox = el("div"); blGapBox.append(el("h4", "", L("Écart de netlinking vs concurrents", "Link gap versus competitors")), el("p", "c-note", L("Jusqu’à 5 concurrents nommés : le pont liste les domaines qui les citent sans citer le domaine du client.", "Up to 5 named competitors: the bridge lists domains citing them without citing the client's domain.")), blGapRow, blGapResult);
  const blDisavowBox = el("div"); blDisavowBox.append(el("h4", "", L("Export disavow (sélection client)", "Disavow export (tenant selection)")), el("p", "c-note", L("Copiez-collez votre sélection de domaines à désavouer : le fichier texte est généré localement, sans appel partenaire, puis vous l’importez manuellement dans Search Console après relecture.", "Paste your selection of domains to disavow: the text file is generated locally, with no partner call, then you import it manually into Search Console after review.")), blDisavowInput, blDisavowButton, blDisavowResult);
  content.append(statusLine, volumesBox, serpBox, gridBox, blOverviewBox, blGapBox, blDisavowBox);

  const load = async () => {
    try {
      const status = await api("/market/status", {});
      enabled = Boolean(status.enabled);
      statusLine.textContent = enabled
        ? `${L("Pont activé", "Bridge enabled")} · ${L("locales", "locales")} : ${(status.locales ?? []).join(", ")} · ${L("profondeur de grille", "grid depth")} ${status.localGridDepth}`
        : `${L("Pont non activé par l’opérateur (MARKET_DATA_ENABLED).", "Bridge not enabled by the operator (MARKET_DATA_ENABLED).")} ${status.note ?? ""}`;
    } catch (error) { statusLine.textContent = error.message; enabled = false; }
    const gate = enabled && admin;
    volumesButton.disabled = !gate; serpButton.disabled = !gate; gridButton.disabled = !gate;
    blOverviewButton.disabled = !gate; blGapButton.disabled = !gate;
    blDisavowButton.disabled = !admin; /* pure tenant selection: works with the bridge off */
    if (!gate) box.append(el("p", "c-note", admin
      ? L("Les appels partenaire attendent l’activation du pont par l’opérateur ; aucune donnée n’est inventée en attendant. L’export disavow, lui, reste disponible : c’est votre sélection client, sans appel partenaire.", "Partner calls wait for the operator to enable the bridge; no data is invented in the meantime. The disavow export stays available: it is your tenant selection, with no partner call.")
      : L("Seuls les administrateurs du client peuvent lancer les appels partenaire (coûts à l’opérateur).", "Only tenant administrators can trigger partner calls (costs are the operator's).")));
  };
  void load();
  return box;
}
