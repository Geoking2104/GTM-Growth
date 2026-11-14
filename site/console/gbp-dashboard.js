import { LANG } from "./i18n.js";
import { el } from "./render.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const metrics = [
  ["BUSINESS_IMPRESSIONS_MOBILE_MAPS", "Vues Maps · mobile", "Maps views · mobile"],
  ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "Vues Maps · ordinateur", "Maps views · desktop"],
  ["BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "Vues Search · mobile", "Search views · mobile"],
  ["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "Vues Search · ordinateur", "Search views · desktop"],
  ["WEBSITE_CLICKS", "Clics vers le site", "Website clicks"],
  ["CALL_CLICKS", "Clics sur Appeler", "Call button clicks"],
  ["BUSINESS_DIRECTION_REQUESTS", "Demandes d’itinéraire", "Direction requests"],
];
const format = value => value === null || value === undefined ? "—" : new Intl.NumberFormat(LANG, {maximumFractionDigits:2}).format(value);
function select(parent, title, options) {
  const label = el("label", "gbp-field"), input = el("select");
  label.append(el("span", "", title));
  for (const [value, text] of options) { const option = el("option", "", text); option.value = value; input.append(option); }
  input.value = options[0]?.[0] || ""; label.append(input); parent.append(label); return input;
}
function card(title, className = "") { const node = el("section", `gbp-card ${className}`); node.append(el("h4", "", title)); return node; }
const unavailable = code => code === "GBP_QUOTA" ? L("Quota Google atteint. Réessayez plus tard.", "Google quota reached. Try again later.")
  : code === "GBP_ACCESS" ? L("Accès refusé : faites vérifier les autorisations Google.", "Access denied: have the Google permissions checked.")
  : code === "GBP_UNAVAILABLE" ? L("La connexion Google doit être configurée par votre administrateur.", "Your administrator needs to configure the Google connection.")
  : L("Lecture indisponible. Réessayez ; aucune valeur n’a été remplacée par zéro.", "Reading unavailable. Try again; missing values have not been replaced with zero.");

/** Reference layout: location, two KPIs, rating gauge and monthly chart. No demo data. */
export function renderGbpDashboard({data, call, admin}) {
  const root = el("section", "gbp-dashboard"); root.setAttribute("aria-label", "Google Business Profile");
  const heading = el("div", "gbp-heading"); heading.append(el("div", "gbp-eyebrow", L("VOTRE PRÉSENCE LOCALE", "YOUR LOCAL PRESENCE")), el("h3", "", "Google Business Profile"), el("p", "", L("Consultez vos avis, suivez les interactions et choisissez la prochaine correction.", "Read your reviews, track interactions and choose the next correction."))); root.append(heading);
  const filters = el("div", "gbp-filters"); root.append(filters);
  const sites = data.sites || [];
  const location = select(filters, L("Établissement", "Location"), sites.length ? sites.map(s => [s.id, s.name]) : [["", L("Ajoutez un établissement", "Add a location")]]);
  const now = new Date(), months = Array.from({length:12}, (_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-i, 1)); return [d.toISOString().slice(0,7), new Intl.DateTimeFormat(LANG,{month:"long",year:"numeric",timeZone:"UTC"}).format(d)]; });
  const month = select(filters, L("Mois des interactions", "Interaction month"), months);
  const metric = select(filters, L("Indicateur", "Metric"), metrics.map(([id,fr,en]) => [id,L(fr,en)]));
  const load = el("button", "btn btn-primary", L("Lire les données Google", "Read Google data")); load.type = "button"; filters.append(load);
  const status = el("p", "gbp-status"); status.setAttribute("role", "status"); root.append(status);
  const grid = el("div", "gbp-grid"); root.append(grid);
  const links = el("div", "gbp-next-actions");
  for (const [target,fr,en] of [["local-registry","Organiser mes établissements","Organise my locations"],["local-operations","Relier et contrôler mes fiches","Link and check my listings"],["local-action-draft","Attribuer une correction","Assign a correction"]]) {
    if (!admin && target === "local-registry") continue;
    const b = el("button", "btn btn-small", L(fr,en)); b.type = "button";
    b.onclick = () => { const node = document.getElementById(target); if (!node) return; if (node.tagName === "DETAILS") node.open = true; node.scrollIntoView({behavior:"smooth",block:"start"}); (node.querySelector("summary, input, button") || node).focus(); }; links.append(b);
  }
  root.append(links);
  let request = 0;
  function draw(result) {
    grid.replaceChildren();
    const site = sites.find(s => s.id === location.value), bound = (data.bindings || []).some(b => b.siteId === site?.id);
    const business = card(L("Établissement sélectionné", "Selected location"), "gbp-business");
    business.append(el("strong", "gbp-business-name", site?.name || L("Votre établissement", "Your location")), el("p", "", site ? [site.brand,site.country,(site.languages || []).join(", ")].filter(Boolean).join(" · ") : L("Importez votre référentiel pour commencer.", "Import your location registry to get started.")), el("span", "gbp-badge", bound ? L("Fiche associée", "Listing linked") : L("Fiche non associée", "Listing not linked"))); grid.append(business);
    const account = card(L("Fiche Google associée", "Linked Google listing"), "gbp-account"); account.append(el("strong", "gbp-number", site ? String(Number(bound)) : "—"), el("p", "", L("Pour cet établissement. L’association ne garantit pas l’accès actuel.", "For this location. A mapping does not guarantee current access."))); grid.append(account);
    const reviews = result?.reviews, available = reviews?.status === "available";
    const reviewCard = card(L("Total des avis", "Total reviews"), "gbp-reviews"); reviewCard.append(el("strong", "gbp-number", format(available ? reviews.total : null)), el("p", "", L("Tous les avis de cette fiche, à la date de lecture. Indépendant du mois choisi.", "All reviews for this listing at read time. Independent of the selected month."))); if (reviews && !available) reviewCard.append(el("p", "gbp-message", unavailable(reviews.code))); grid.append(reviewCard);
    const rating = card(L("Note Google", "Google rating"), "gbp-rating"), value = available ? reviews.average : null;
    rating.append(el("p", "", L("Note de l’établissement sélectionné, sur 5.", "Rating for the selected location, out of 5.")));
    const gauge = el("div", "gbp-gauge"), arc = el("div", "gbp-gauge-arc"); arc.setAttribute("aria-hidden", "true");
    if (value !== null && value !== undefined) arc.style.setProperty("--rating", `${Math.max(0,Math.min(5,value))*36}deg`);
    const score = el("div", "gbp-gauge-score"); score.append(el("strong", "", format(value)), el("span", "", L("sur 5", "out of 5"))); gauge.append(arc,score); rating.append(gauge);
    rating.append(el("p", "gbp-caption", value === null || value === undefined ? L("Aucune note disponible.", "No rating available.") : L("Moyenne fournie par Google, sans qualification automatique.", "Average provided by Google, without an automatic quality label.")));
    const sample = available ? reviews.sample : null, split = el("div", "gbp-review-split");
    for (const [key,fr,en] of [["positive","Positifs · 4–5★","Positive · 4–5★"],["negative","Négatifs · 1–2★","Negative · 1–2★"],["neutral","Neutres · 3★","Neutral · 3★"]]) { const n=el("div",`gbp-${key}`); n.append(el("span","",L(fr,en)),el("strong","",format(sample ? sample[key] : null)));split.append(n); }
    rating.append(split, el("p","gbp-caption", sample ? `${L("Répartition par étoiles sur ","Star distribution across ")}${sample.size}${L(" avis reçus (50 maximum), triés par mise à jour."," returned reviews (50 maximum), ordered by update time.")} ${sample.complete?L("Liste complète.","Complete list."):L("Échantillon, pas le total de la fiche.","Sample, not the listing total.")} ${sample.unknown?`${sample.unknown} ${L("sans note exploitable.","without a usable rating.")}`:""}` : L("La répartition apparaîtra après lecture des avis.","The distribution will appear after reading reviews."))); grid.append(rating);
    const chart = card(L("Interactions mensuelles", "Monthly interactions"), "gbp-performance"), series = result?.performance;
    chart.append(el("p", "", `${month.value} · ${L(...metrics.find(m => m[0] === metric.value).slice(1))}`));
    if (series?.status === "available" && series.reportedDays > 0) {
      const max = Math.max(1,...series.points.map(p=>p.value??0)), bars = el("div","gbp-bars"); bars.setAttribute("aria-label", L("Valeurs quotidiennes ; tableau détaillé ci-dessous", "Daily values; detailed table below")); bars.setAttribute("role","img");
      for (const p of series.points) { const b=el("div",p.value===null?"gbp-bar gbp-missing":"gbp-bar"); b.style.setProperty("--bar-height",`${p.value===null?100:Math.max(1,p.value/max*100)}%`); b.title=`${p.date}: ${p.value===null?L("Non reçu","Not received"):format(p.value)}`; bars.append(b); }
      chart.append(bars,el("p","gbp-caption",`${series.reportedDays}/${series.expectedDays} ${L("jours reçus. Les pointillés signalent les données absentes.","days received. Dotted bars indicate missing data.")}`));
      const details=el("details"); details.append(el("summary","",L("Voir les valeurs quotidiennes","View daily values"))); const table=el("table","gbp-data-table"), head=el("tr"); for (const text of [L("Date","Date"),L("Valeur","Value")]) {const th=el("th","",text);th.scope="col";head.append(th);}table.append(head); for(const p of series.points){const row=el("tr");row.append(el("td","",p.date),el("td","",format(p.value)));table.append(row);}details.append(table);chart.append(details);
    } else chart.append(el("div","gbp-empty-chart",series?.status==="unavailable"?unavailable(series.code):L("Aucune mesure reçue pour cette période. Le graphique attend vos données Google.","No measurements received for this period. The chart is waiting for your Google data.")));
    chart.append(el("p","gbp-caption",L("Les clics et demandes d’itinéraire ne mesurent ni les appels aboutis, ni les visites en magasin, ni les ventes. Les jours récents peuvent manquer.","Clicks and direction requests do not measure completed calls, store visits or sales. Recent days may be missing."))); grid.append(chart);
    const eligible = !!site && site.kind !== "web-only" && bound;
    load.disabled = !eligible;
    if (!result) status.textContent = !site ? L("Commencez par ajouter vos établissements.","Start by adding your locations.") : site.kind === "web-only" ? L("GBP et Maps sont non applicables à une activité uniquement web.","GBP and Maps are not applicable to a web-only business.") : !bound ? admin ? L("Reliez cette fiche dans « Relier et contrôler mes fiches » pour afficher ses résultats.","Link this listing under ‘Link and check my listings’ to show its results.") : L("Demandez à votre administrateur de relier cette fiche Google.","Ask your administrator to link this Google listing.") : L("Fiche associée. Cliquez sur « Lire les données Google » pour obtenir les résultats actuels.","Listing linked. Select ‘Read Google data’ to retrieve current results.");
  }
  function reset() { request++; root.setAttribute("aria-busy","false"); draw(); }
  location.onchange = month.onchange = metric.onchange = reset;
  load.onclick = async () => {
    const sequence=++request; draw();load.disabled=true;status.textContent=L("Lecture auprès de Google…","Reading from Google…");root.setAttribute("aria-busy","true");
    try {
      const result=await call("gbp/dashboard",{siteId:location.value,month:month.value,metric:metric.value});if(sequence!==request)return;
      draw(result);status.textContent=L("Source : Google Business Profile · lu le ","Source: Google Business Profile · read on ")+new Intl.DateTimeFormat(LANG,{dateStyle:"medium",timeStyle:"short"}).format(new Date(result.fetchedAt));
    } catch(error) { if(sequence!==request)return;draw();status.textContent=unavailable(String(error.message).match(/GBP_(ACCESS|QUOTA|UNAVAILABLE)/)?.[0]); }
    finally { if(sequence===request)root.setAttribute("aria-busy","false"); }
  };
  draw();return root;
}
