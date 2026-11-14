/** Public action guide. Google measurements require a linked, authorised workspace. */
export function renderLocalSeoPreview(language = "en") {
  const L=(fr,en)=>language==="fr"?fr:en;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const root=el("section");root.className="public-panel c-card";root.id="local-seo-planner";
  root.append(el("h2",L("Fiabilisez vos fiches. Suivez les interactions. Agissez localement.","Fix your listings. Track interactions. Take local action.")),el("p",L("Un espace pour organiser vos établissements, consulter leurs résultats Google et attribuer les corrections à la bonne personne.","One workspace to organise your locations, read their Google results and assign corrections to the right person.")));
  const label=el("label",L("Votre activité","Your business")),kind=el("select");
  for(const [value,fr,en] of [["physical","Établissement physique","Physical location"],["service-area","Zone desservie, adresse privée","Service area, private address"],["web-only","Activité uniquement web","Web-only business"]]){const o=el("option",L(fr,en));o.value=value;kind.append(o);}label.append(kind);root.append(label);
  const result=el("div");result.setAttribute("aria-live","polite");root.append(result);
  function draw(){
    result.replaceChildren();const grid=el("div");grid.className="local-action-grid";
    const web=kind.value==="web-only";
    const cards=web?[
      [L("01 · ORGANISER","01 · ORGANISE"),L("Définissez vos pages et marchés","Define your pages and markets"),L("Résultat : un référentiel de pages, pays, langues et responsables.","Result: a shared registry of pages, countries, languages and owners.")],
      [L("02 · MESURER","02 · MEASURE"),L("Analysez votre visibilité web","Analyse your web visibility"),L("Résultat : des observations issues de vos audits et de Search Console, après connexion.","Result: observations from your audits and Search Console, after connection.")],
      [L("03 · AGIR","03 · ACT"),L("Attribuez les corrections","Assign corrections"),L("Résultat : une action, une preuve, un responsable et une échéance.","Result: an action, evidence, an owner and a deadline.")]
    ]:[
      [L("01 · ORGANISER","01 · ORGANISE"),L("Rassemblez vos établissements","Bring your locations together"),L("Résultat : un référentiel par établissement, avec pays, langues et accès de l’équipe locale.","Result: a registry for each location, with countries, languages and local team access.")],
      [L("02 · MESURER","02 · MEASURE"),L("Consultez votre dashboard Google","Read your Google dashboard"),L("Résultat : note, total des avis et interactions quotidiennes par mois, après association de la fiche et autorisation Google.","Result: rating, total reviews and daily interactions by month, after linking and authorising the Google listing.")],
      [L("03 · AGIR","03 · ACT"),L("Corrigez et vérifiez","Correct and verify"),L("Résultat : des corrections attribuées et approuvées. Le téléphone et l’URL peuvent être publiés puis relus lorsque l’écriture est activée.","Result: assigned and approved corrections. Phone and website changes can be published and read back when writes are enabled.")]
    ];
    for(const [step,title,description] of cards){const card=el("article");card.className="local-action-card";card.append(el("span",step),el("h3",title),el("p",description));grid.append(card);}result.append(grid);
    const outcome=el("p",web?L("GBP et Maps sont non applicables à une activité uniquement web. Conservez les audits et Search Console.","GBP and Maps are not applicable to a web-only business. Use website audits and Search Console."):kind.value==="service-area"?L("Gardez votre adresse privée hors des contenus et exports publics. Reliez chaque fiche à la bonne zone desservie.","Keep your private address out of public content and exports. Link each listing to the correct service area."):L("Chaque résultat appartient à une fiche précise. Sans données Google reçues, le dashboard affiche « indisponible », jamais un résultat inventé.","Every result belongs to an exact listing. Without data received from Google, the dashboard shows ‘unavailable’, never an invented result."));outcome.className="local-outcome";result.append(outcome);
  }kind.onchange=draw;draw();
  const a=el("a",L("Ouvrir mon dashboard local","Open my local dashboard"));a.className="btn btn-primary";a.href="/console/?lang="+language+"#local_seo/network";root.append(a,el("p",L("Le socle open source reste gratuit. Un espace client est requis ; les données Google nécessitent une connexion configurée et autorisée. Les réponses aux avis et les campagnes de publications sont prévues dans la suite du parcours.","The open-source core stays free. A workspace is required; Google data requires a configured, authorised connection. Review replies and publishing campaigns are planned for the next stage.")));return root;
}
const mount=document.getElementById("local-seo-free");if(mount)mount.append(renderLocalSeoPreview(document.documentElement.lang==="fr"?"fr":"en"));
