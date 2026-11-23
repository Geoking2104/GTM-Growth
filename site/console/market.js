/* Partner market-data console panel (R4): keyword search volumes, Google SERP
 * positions and GBP local rank grids from the operator's DataForSEO-compatible
 * bridge. Every figure carries provenance `partner-api`, the observation date
 * and the locale; unknown stays "—", never zero; the operator owns the partner
 * keys and the call costs. Partner calls are tenant-admin only. */
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
    el("p", "c-note", L("Volumes de recherche, positions Google et grille locale GBP depuis le pont partenaire de l’opérateur. Chaque chiffre porte la provenance partner-api avec sa date d’observation ; aucune valeur n’est inventée hors pont et les coûts d’appel restent à l’opérateur.", "Search volumes, Google positions and GBP local grids from the operator's partner bridge. Every figure carries provenance partner-api with its observation date; nothing is invented outside the bridge and call costs stay with the operator.")),
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

  const volumesRow = el("p"); volumesRow.append(volumesInput, document.createTextNode(" "), volumesDevice, document.createTextNode(" "), volumesButton);
  const serpRow = el("p"); serpRow.append(serpInput, document.createTextNode(` ${L("profondeur", "depth")} `), serpDepth, document.createTextNode(" "), serpButton);
  const gridRow = el("p"); gridRow.append(gridKeyword, document.createTextNode(` ${L("centre", "centre")} `), gridLat, document.createTextNode(" "), gridLng, document.createTextNode(` ${L("rayon (km)", "distance (km)")} `), gridDistance, document.createTextNode(" "), gridButton);
  const volumesBox = el("div"); volumesBox.append(el("h4", "", L("Volumes de recherche Google", "Google search volumes")), volumesRow, volumesResult);
  const serpBox = el("div"); serpBox.append(el("h4", "", L("Positions Google (SERP)", "Google positions (SERP)")), serpRow, serpResult);
  const gridBox = el("div"); gridBox.append(el("h4", "", L("Grille locale Google Business Profile", "Google Business Profile local grid")), el("p", "c-note", L("Grille 5×5 autour du centre, mobile, rangs jusqu’à 20 : au-delà le point est non trouvé, jamais zéro.", "5×5 grid around the centre, mobile, ranks up to 20: beyond, the point is not found, never zero.")), gridRow, gridResult);
  content.append(statusLine, volumesBox, serpBox, gridBox);

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
    if (!gate) box.append(el("p", "c-note", admin
      ? L("Les appels partenaire attendent l’activation du pont par l’opérateur ; aucune donnée n’est inventée en attendant.", "Partner calls wait for the operator to enable the bridge; no data is invented in the meantime.")
      : L("Seuls les administrateurs du client peuvent lancer les appels partenaire (coûts à l’opérateur).", "Only tenant administrators can trigger partner calls (costs are the operator's).")));
  };
  void load();
  return box;
}
