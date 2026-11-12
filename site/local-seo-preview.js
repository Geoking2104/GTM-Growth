/** Free, browser-only local SEO planning. User declarations are never measurements. */
export function renderLocalSeoPreview(language = "en") {
  const L=(fr,en)=>language==="fr"?fr:en;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const root=el("section");root.className="public-panel c-card";root.id="local-seo-planner";
  root.append(el("h2",L("Préparez votre présence locale gratuitement","Plan your local presence for free")),el("p",L("Déclarez votre activité et obtenez une liste de préparation. Aucun compte Google ni paiement requis. Ce plan ne mesure pas vos positions.","Describe your business to get a preparation checklist. No Google account or payment required. This plan does not measure rankings.")));
  const label=el("label",L("Type d’activité ","Business type ")),kind=el("select");
  for(const [value,fr,en] of [["physical","Établissement physique","Physical location"],["service-area","Zone desservie, adresse privée","Service area, private address"],["web-only","Activité uniquement web","Web-only business"]]){const o=el("option",L(fr,en));o.value=value;kind.append(o);}label.append(kind);root.append(label);
  const result=el("div");result.setAttribute("aria-live","polite");root.append(result);
  function draw(){result.replaceChildren();const list=el("ul");const steps=[L("Confirmez la page, le pays, les langues et le fuseau de votre activité.","Confirm your page, country, languages and business time zone."),L("Vérifiez votre domaine avant un audit avec rendu navigateur.","Verify your domain before a browser-rendered audit.")];
    if(kind.value==="web-only")steps.push(L("Les contrôles GBP et Maps sont non applicables. Conservez le suivi web et Search Console.","GBP and Maps checks are not applicable. Keep web monitoring and Search Console."));
    else {steps.push(L("Confirmez l’identité exacte de chaque établissement ; ne fusionnez pas les sites par nom ou domaine.","Confirm each location’s exact identity; do not merge locations by name or domain."),L("Préparez horaires, téléphone public et langues de vos pages ; comparez-les à votre référence validée.","Prepare hours, public phone and page languages; compare them with your approved reference."));if(kind.value==="service-area")steps.push(L("Gardez l’adresse privée hors des contenus et exports publics.","Keep your private address out of public content and exports."));steps.push(L("Importez vos positions avec source, date, langue, appareil et coordonnées. Sans observation, la visibilité reste non mesurée.","Import rankings with source, date, language, device and coordinates. Without observations, visibility stays unmeasured."));}
    steps.push(L("Attribuez chaque correction à un responsable, puis faites vérifier le résultat.","Assign each correction to an owner, then verify the result."));steps.forEach(s=>list.append(el("li",s)));result.append(el("p",L("Plan déclaratif — aucune collecte ni publication.","Declared plan — no collection or publication.")),list);
  }kind.onchange=draw;draw();
  const a=el("a",L("Continuer dans mon espace","Continue in my workspace"));a.className="btn btn-primary";a.href="/console/?lang="+language+"#local_seo/network";root.append(a);return root;
}
const mount=document.getElementById("local-seo-free");if(mount)mount.append(renderLocalSeoPreview(document.documentElement.lang==="fr"?"fr":"en"));
