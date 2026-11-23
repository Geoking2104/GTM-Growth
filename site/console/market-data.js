/* Market-data bridge panel (R4): keyword volumes, Google.fr SERP positions and
 * local rank grids through the operator's partner bridge. Every call is an
 * explicit administrator action (operator credits); every result displays its
 * provider, observation date, locale, device and partner provenance. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, action) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = action; return b; };
const status = () => { const note = el("p", "c-note"); note.setAttribute("role", "status"); return note; };
const field = (span, input) => { const wrap = el("label"); wrap.style.display = "block"; wrap.append(el("span", "c-note", span), input); return wrap; };
const number = (value, fraction = 6) => new Intl.NumberFormat(L("fr-FR", "en-GB"), { maximumFractionDigits: fraction }).format(value);
const dateText = (value) => new Intl.DateTimeFormat(L("fr-FR", "en-GB"), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));

function metaLine(meta) {
  const cost = meta.costUsd === null || meta.costUsd === undefined ? L("coût inconnu", "cost unknown") : `${L("coût estimé", "estimated cost")} : ${number(meta.costUsd, 4)} USD`;
  return `${L("fournisseur", "provider")} : ${meta.provider} · ${dateText(meta.observedAt)} (UTC) · ${meta.locale} · ${meta.device} · ${L("provenance partenaire", "partner provenance")} · ${cost}`;
}

export function renderOpsMarket({ api, me }) {
  const box = el("section", "app-strip ops-market");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div");
  const message = status();
  box.append(
    el("h3", "", L("Données de marché (pont partenaire)", "Market data (partner bridge)")),
    el("p", "c-note", L("Volumes de mots-clés, positions Google et grilles de rang local via le pont partenaire de l’opérateur. Chaque appel consomme des crédits de l’opérateur, jamais facturés aux espaces ; chaque résultat affiche son fournisseur, sa date d’observation, sa locale, son appareil et sa provenance. La plateforme ne mesure rien elle-même.", "Keyword volumes, Google positions and local rank grids through the operator's partner bridge. Each call spends operator credits, never billed to workspaces; every result shows its provider, observation date, locale, device and provenance. The platform measures nothing itself.")),
    content, message,
  );

  const run = async (action, after) => {
    message.textContent = L("Appel partenaire en cours…", "Calling the partner bridge…");
    try { const data = await action(); message.textContent = ""; after(data); }
    catch (error) { message.textContent = error.message; }
  };

  const volumesBlock = () => {
    const block = el("div");
    const input = el("input"); input.size = 60; input.disabled = !admin;
    input.placeholder = L("Mots-clés séparés par des virgules (50 max)", "Comma-separated keywords (max 50)");
    block.append(el("h4", "", L("Volumes de recherche", "Search volumes")));
    const details = el("details"); const summary = el("summary", "", L("Vérifier des volumes de mots-clés", "Check keyword volumes")); summary.append(el("span", "c-note", " /volumes"));
    details.append(summary, field(L("Mots-clés", "Keywords"), input));
    const rows = el("ul", "c-note");
    const call = () => run(
      () => api("/market/volumes", { keywords: input.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 50) }),
      (data) => {
        rows.replaceChildren(...data.results.map((row) => el("li", "", `${row.keyword} — ${row.searchVolume === null ? L("volume inconnu", "volume unknown") : `${L("volume", "volume")} : ${number(row.searchVolume)}${row.cpc !== null ? `${row.currency ? ` ${row.currency}` : ""}, CPC ${number(row.cpc, 2)}` : ""}`}`)));
        content.append(el("p", "c-note", metaLine(data)));
      },
    );
    if (admin) details.append(button(L("Rechercher les volumes", "Get volumes"), call));
    block.append(details, rows);
    return block;
  };

  const serpBlock = () => {
    const block = el("div");
    const input = el("input"); input.size = 50; input.disabled = !admin; input.placeholder = L("Mot-clé", "Keyword");
    block.append(el("h4", "", L("Positions Google (SERP)", "Google positions (SERP)")));
    const details = el("details"); const summary = el("summary", "", L("Vérifier les positions d’un mot-clé", "Check a keyword's positions")); summary.append(el("span", "c-note", " /serp"));
    details.append(summary, field(L("Mot-clé", "Keyword"), input));
    const rows = el("ul", "c-note");
    const call = () => run(
      () => api("/market/serp", { keyword: input.value, depth: 20 }),
      (data) => {
        const mine = data.tenantRank === null || data.tenantRank === undefined ? L("Pas dans les 20 premiers résultats.", "Not in the top 20 results.") : L(`Votre position : ${data.tenantRank} (${data.tenantUrl})`, `Your rank: ${data.tenantRank} (${data.tenantUrl})`);
        rows.replaceChildren(
          el("li", "", mine),
          ...data.results.slice(0, 20).map((row) => el("li", "", `${row.position ?? "—"}. ${row.url}`)),
        );
        if (data.aiOverview?.present) rows.append(el("li", "c-note", L("AI Overview détectée sur cette requête.", "AI Overview detected on this query.")));
        content.append(el("p", "c-note", metaLine(data)));
      },
    );
    if (admin) details.append(button(L("Vérifier la SERP", "Check the SERP"), call));
    block.append(details, rows);
    return block;
  };

  const gridBlock = () => {
    const block = el("div");
    const keyword = el("input"); keyword.size = 40; keyword.disabled = !admin; keyword.placeholder = L("Requête locale", "Local query");
    const latitude = el("input"); latitude.size = 10; latitude.value = "48.8566"; latitude.disabled = !admin;
    const longitude = el("input"); longitude.size = 10; longitude.value = "2.3522"; longitude.disabled = !admin;
    const columns = el("input"); columns.size = 2; columns.value = "5"; columns.disabled = !admin;
    const rows_ = el("input"); rows_.size = 2; rows_.value = "5"; rows_.disabled = !admin;
    const distance = el("input"); distance.size = 4; distance.value = "2"; distance.disabled = !admin;
    const siteId = el("input"); siteId.size = 20; siteId.disabled = !admin;
    block.append(el("h4", "", L("Grille de rang local (GBP)", "Local rank grid (GBP)")));
    const details = el("details"); const summary = el("summary", "", L("Vérifier la grille locale", "Check the local grid")); summary.append(el("span", "c-note", " /grid"));
    details.append(summary,
      field(L("Requête", "Query"), keyword),
      field(L("Latitude du centre", "Centre latitude"), latitude), field(L("Longitude du centre", "Centre longitude"), longitude),
      field(L("Colonnes (1-7)", "Columns (1-7)"), columns), field(L("Lignes (1-7)", "Rows (1-7)"), rows_),
      field(L("Distance totale (km, 0,1-20)", "Total distance (km, 0.1-20)"), distance),
      field(L("Identifiant du site local (optionnel, pour proposer l’import)", "Local site id (optional, to propose the import)"), siteId));
    const rows = el("ul", "c-note");
    const call = () => run(
      () => api("/market/grid", {
        keyword: keyword.value,
        geometry: { latitude: Number(latitude.value), longitude: Number(longitude.value), columns: Number(columns.value), rows: Number(rows_.value), distanceKm: Number(distance.value) },
        ...(siteId.value ? { siteId: siteId.value } : {}),
      }),
      (data) => {
        const found = data.results.filter((p) => p.status === "found").length;
        const items = data.results.map((p) => el("li", "", `${p.id} — ${p.rank === null ? L("non trouvé", "not found") : L(`rang ${p.rank}`, `rank ${p.rank}`)} (${number(p.latitude)}, ${number(p.longitude)})`));
        rows.replaceChildren(el("li", "", L(`${found}/${data.results.length} points avec un rang local`, `${found}/${data.results.length} points with a local rank`)), ...items);
        content.append(el("p", "c-note", metaLine(data)));
        if (data.observation) {
          const importButton = button(L("Importer dans Global et local SEO", "Import into Global & local SEO"), () => run(
            () => api("/local-seo/import", data.observation),
            (result) => { message.textContent = result.duplicate ? L("Observation déjà présente (aucun doublon créé).", "Observation already present (no duplicate created).") : L("Observation importée ; les métriques locales sont recalculées.", "Observation imported; local metrics are recomputed."); importButton.remove(); },
          ));
          const note = el("p", "c-note", L("Proposition d’import déclarée : la vérification du site, du pays et des doublons reste celle du module Global & local SEO.", "Declared import proposal: site, country and duplicate checks remain those of the Global & local SEO module."));
          content.append(note, importButton);
        }
      },
    );
    if (admin) details.append(button(L("Vérifier la grille", "Check the grid"), call));
    block.append(details, rows);
    return block;
  };

  const draw = (config) => {
    const wrap = el("div");
    if (!config.enabled) {
      wrap.append(el("p", "c-note", L("Aucun pont données de marché activé. L’opérateur configure MARKET_DATA_ENABLED=true, MARKET_DATA_API_URL, MARKET_DATA_API_LOGIN et MARKET_DATA_API_PASSWORD ; Google.fr est la première locale (MARKET_DATA_LOCALES).", "No market-data bridge enabled. The operator configures MARKET_DATA_ENABLED=true, MARKET_DATA_API_URL, MARKET_DATA_API_LOGIN and MARKET_DATA_API_PASSWORD; Google.fr is the first locale (MARKET_DATA_LOCALES).")));
    } else {
      wrap.append(el("p", "c-note", `${config.provider} — ${L("locales activées", "enabled locales")} : ${config.locales.join(", ")} · ${L("provenance partenaire", "partner provenance")} : ${config.provenance}`));
      wrap.append(volumesBlock(), serpBlock(), gridBlock());
      if (!admin) wrap.append(el("p", "c-note", L("Seuls les administrateurs peuvent lancer des appels partenaire.", "Only administrators can run partner calls.")));
    }
    content.replaceChildren(wrap);
  };

  void api("/market/config", {}).then(draw).catch((error) => { content.replaceChildren(); message.textContent = error.message; });
  return box;
}
