import { renderLocalOperations } from "./local-seo-operations.js";
import { parseRegistryCsv } from "./local-seo-csv.js";
/** Local SEO workspace. All dynamic content uses text nodes. */
import { LANG } from "./i18n.js";
import { el } from "./render.js";
const L = (fr,en) => LANG === "fr" ? fr : en;
const labels = {
  GBP_UNAVAILABLE: ["Connexion GBP indisponible. Contactez l’exploitation.","GBP connection unavailable. Contact operations."],
  GBP_ACCESS: ["Accès Google refusé ou révoqué.","Google access denied or revoked."],
  GBP_UNBOUND: ["Confirmez la correspondance de la fiche Google.","Confirm the Google listing mapping."],
  GBP_QUOTA: ["Quota atteint. La reprise sera limitée.","Quota reached. Retries are bounded."],
  GBP_WRITE_DISABLED: ["Publication désactivée par l’exploitation.","Publishing is disabled by operations."],
  GBP_IDENTITY: ["Identité Google ambiguë ou déjà liée.","Google identity ambiguous or already mapped."],
  GBP_TARGET_BUSY: ["Une écriture sur cette fiche est en attente de vérification.","A write to this listing awaits verification."],
  GBP_ALREADY_DISPATCHED: ["Cette version a déjà été traitée. Utilisez la relecture.","This version was already processed. Use readback."],
  GBP_NO_CHANGE: ["La valeur Google est déjà identique.","Google already has this value."],
  GBP_REMOTE: ["Google n’a pas confirmé la requête.","Google did not confirm the request."],
  draft: ["Brouillon","Draft"], submitted: ["À valider","Awaiting approval"], approved: ["Approuvée","Approved"], rejected: ["Refusée","Rejected"], "manual-pending": ["Application manuelle à vérifier","Manual application awaiting verification"],
  physical: ["Établissement physique","Physical location"], "service-area": ["Zone desservie","Service area"], "web-only": ["Web uniquement","Web only"],
  LOCAL_ACCESS: ["Accès refusé. Vérifiez votre périmètre et vos droits.","Access denied. Check your scope and permissions."],
  LOCAL_INVALID: ["Données invalides. Vérifiez les champs et le format du fichier.","Invalid data. Check the fields and file format."],
  LOCAL_CHANGED: ["La version a changé. Rechargez puis vérifiez à nouveau.","The version changed. Reload and review again."],
  LOCAL_LANGUAGE: ["La langue doit appartenir aux langues de l’établissement.","The language must be one of the location’s languages."],
  LOCAL_EVIDENCE: ["Une observation accessible du même établissement est requise.","An accessible observation for the same location is required."],
  LOCAL_TRANSITION: ["Transition refusée : un autre administrateur doit approuver la version soumise.","Transition refused: another administrator must approve the submitted version."],
  LOCAL_CAPACITY: ["Capacité atteinte. Contactez votre administrateur.","Capacity reached. Contact your administrator."],
  LOCAL_NOT_APPLICABLE: ["Le suivi local ne s’applique pas à une activité uniquement web.","Local tracking does not apply to a web-only business."],
};
const label = value => labels[value] ? L(...labels[value]) : value;
function field(parent, title, value = "", type = "text") {
  const wrap = el("label","c-field"); wrap.append(el("span","",title));
  const input = el(type === "textarea" ? "textarea" : "input"); if(type !== "textarea") input.type = type;
  input.value = value; if(type === "textarea") input.rows = 7; wrap.append(input); parent.append(wrap); return input;
}
function button(parent, title, fn) { const b=el("button","btn btn-small",title); b.type="button"; b.onclick=fn; parent.append(b); return b; }
function table(parent, headers, rows) {
  const wrap=el("div","c-table-wrap"), t=el("table","c-table app-table"), head=el("thead"), tr=el("tr");
  headers.forEach(h=>{const th=el("th","",h);th.scope="col";tr.append(th);}); head.append(tr);t.append(head);
  const body=el("tbody"); rows.forEach(row=>{const tr=el("tr");row.forEach(v=>{const td=el("td");td.append(v instanceof Node?v:document.createTextNode(String(v ?? "—")));tr.append(td);});body.append(tr);});t.append(body);wrap.append(t);parent.append(wrap);
}
export async function renderLocalSeo({ api, me }) {
  const root=el("section","app-strip local-seo-workspace"), status=el("p","c-note");status.setAttribute("role","status");
  const admin=me?.role === "tenant-admin" && !me?.platformAdmin;
  const call=async(path,body={})=>api("/local-seo/"+path,body);
  const run=async(fn)=>{try{status.textContent=L("Traitement…","Working…");await fn();status.textContent=L("Enregistré.","Saved.");}catch(e){const code=Object.keys(labels).find(k=>String(e.message).includes(k));status.textContent=code?label(code):L("Opération indisponible. Vérifiez le fichier, votre connexion et vos droits.","Operation unavailable. Check the file, your connection and permissions.");}};
  root.append(el("h2","",L("SEO global et local","Global and local SEO")),el("p","c-note",L("Périmètre : ","Scope: ")+(me?.tenant?.name||"—")),status);
  const content=el("div");root.append(content);
  async function refresh() {
    const data=await call("state");content.replaceChildren();
    content.append(el("p","c-note",L("Observations déclarées, règles calculées et validation humaine. GBP et Node-RED nécessitent une configuration serveur. L’IA locale reste indisponible. Aucun repli payant.","Declared observations, calculated rules and human approval. GBP and Node-RED require server configuration. Local AI remains unavailable. No paid fallback.")));
    content.append(renderLocalOperations({data,admin,call,run,refresh}));
    const filters=el("div","c-fields"); const country=field(filters,L("Filtrer par pays","Filter by country"));const language=field(filters,L("Filtrer par langue de recherche","Filter by search language"));content.append(filters);
    const list=el("div");content.append(list);
    const date=v=>new Intl.DateTimeFormat(LANG,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
    const number=v=>v===null?L("Indisponible","Unavailable"):new Intl.NumberFormat(LANG,{maximumFractionDigits:1}).format(v);
    function draw() {
      list.replaceChildren();const sites=data.sites.filter(s=>(!country.value||s.country.includes(country.value.toUpperCase()))&&(!language.value||s.languages.includes(language.value)));
      const ids=new Set(sites.map(s=>s.id));
      table(list,[L("Établissement","Location"),L("Pays / langues","Country / languages"),L("Type","Type"),L("Fuseau","Time zone")],sites.map(s=>[s.name+" · "+s.id,s.country+" · "+s.languages.join(", "),label(s.kind),s.timezone]));
      if(!sites.length)list.append(el("p","c-note",L("Aucun établissement dans ce périmètre. Importez un référentiel ou demandez un accès.","No locations in this scope. Import a registry or request access.")));
      list.append(el("h3","",L("Visibilité importée","Imported visibility")),el("p","c-note",L("La langue d’interface ne modifie pas la langue de recherche. Une importation manuelle ne certifie pas la collecte. Les erreurs et identités non résolues réduisent la couverture.","The interface language does not change the search language. A manual import does not certify collection. Errors and unresolved identities reduce coverage.")));
      table(list,[L("Établissement / preuve","Location / evidence"),L("Source / date","Source / date"),L("Recherche","Search"),L("Couverture","Coverage"),L("Top 3","Top 3"),L("Médiane trouvée","Found median"),L("Comparabilité","Comparability")],data.observations.filter(o=>ids.has(o.siteId)&&(!language.value||o.language===language.value)).map(o=>[
        o.siteId+" · "+o.id,o.source+" · "+date(o.observedAt),o.query+" · "+(o.language||"—")+" · "+o.surface,
        number(o.metrics.coverage)+"% ("+o.metrics.valid+"/"+o.metrics.planned+")",number(o.metrics.top3)+(o.metrics.top3===null?"":"%"),number(o.metrics.median)+" ("+o.metrics.found+"/"+o.metrics.valid+")",
        o.comparableSeries?L("Métadonnées complètes ; même série requise","Complete metadata; matching series required"):L("Désactivée : métadonnées manquantes","Disabled: missing metadata")
      ]));
      if(data.comparisons?.length) {
        list.append(el("h3","",L("Évolutions comparables","Comparable changes")));
        table(list,[L("Établissement","Location"),L("Preuve précédente / actuelle","Previous / current evidence"),L("Variation top 3 (points de pourcentage)","Top 3 change (percentage points)")],data.comparisons.filter(c=>ids.has(c.siteId)).map(c=>[c.siteId,c.previousId+" / "+c.currentId,number(c.deltaTop3)]));
      }
      list.append(el("h3","",L("Actions et validations","Actions and approvals")));
      for(const a of data.actions.filter(a=>ids.has(a.siteId))) {
        const card=el("section","c-card");card.append(el("h4","",a.title),el("p","",a.content),el("p","c-note",`${a.siteId} · ${a.language} · ${a.owner} · ${date(a.due)} · ${label(a.status)} · v${a.version}`),el("p","c-note",L("Preuves : ","Evidence: ")+a.evidence.join(", ")));
        const transition=(op)=>run(async()=>{await call("transition",{id:a.id,version:a.version,op});await refresh();});
        if(a.status==="draft")button(card,L("Soumettre","Submit"),()=>transition("submit"));
        if(a.status==="submitted"&&admin){button(card,L("Approuver cette version","Approve this version"),()=>transition("approve"));button(card,L("Refuser","Reject"),()=>transition("reject"));}
        if(a.status==="approved")button(card,L("Passer en application manuelle","Move to manual application"),()=>transition("manual"));
        list.append(card);
      }
    }
    country.oninput=draw;language.oninput=draw;draw();
    const imports=el("details");imports.append(el("summary","",L("Importer et organiser","Import and organise")));content.append(imports);
    if(admin){
      imports.append(el("h3","",L("Référentiel des établissements","Location registry")),el("p","c-note",L("Import JSON : identifiants stables, pays ISO, langues BCP 47, fuseau IANA et page appartenant à votre espace. Aucun champ d’adresse privée n’est accepté.","JSON import: stable IDs, ISO countries, BCP 47 languages, IANA time zone and a page owned by your workspace. Private address fields are not accepted.")));
      const registry=field(imports,L("Établissements (JSON)","Locations (JSON)"),JSON.stringify([{id:"brussels",name:"Brussels",brand:"Brand",country:"BE",languages:["fr-BE","nl-BE"],timezone:"Europe/Brussels",kind:"physical",page:"https://"+(me?.tenant?.domains?.[0]||"example.com")+"/brussels"}],null,2),"textarea");
      const file=field(imports,L("Fichier CSV ou JSON (1 Mo maximum)","CSV or JSON file (maximum 1 MB)"),"","file");file.accept=".csv,.json";
      file.onchange=()=>run(async()=>{const f=file.files[0];if(!f)return;if(f.size>1000000)throw new Error("LOCAL_CAPACITY");const text=await f.text();registry.value=JSON.stringify(f.name.endsWith(".csv")?parseRegistryCsv(text):JSON.parse(text),null,2);pending=null;confirm.disabled=true;});
      imports.append(el("p","c-note",L("Colonnes CSV : id,name,brand,country,languages,timezone,kind,page,phone. Séparez les langues par ;. Prévisualisez avant de confirmer.","CSV columns: id,name,brand,country,languages,timezone,kind,page,phone. Separate languages with ;. Preview before confirming.")));
      const preview=el("pre");imports.append(preview);let pending=null;
      const confirm=button(imports,L("Confirmer les lignes valides","Confirm valid rows"),()=>run(async()=>{if(!pending)return;await call("registry",{rows:pending.rows,hash:pending.hash,confirm:true});pending=null;confirm.disabled=true;await refresh();}));confirm.disabled=true;
      registry.oninput=()=>{pending=null;confirm.disabled=true;};
      button(imports,L("Prévisualiser l’import","Preview import"),()=>run(async()=>{const rows=JSON.parse(registry.value);const p=await call("registry",{rows});pending={rows,hash:p.hash};preview.textContent=L("Lignes valides : ","Valid rows: ")+p.accepted.length+L(" ; lignes rejetées : ","; rejected rows: ")+p.rejected.map(r=>r.row).join(", ")+"\n"+JSON.stringify(p.accepted,null,2);confirm.disabled=!p.accepted.length;}));
      const user=field(imports,L("Identifiant SSO du responsable local","Local manager SSO subject"));const grants=field(imports,L("Identifiants établissements séparés par des virgules (vide = révocation)","Comma-separated location IDs (empty = revoke)"));
      button(imports,L("Enregistrer le périmètre","Save scope"),()=>run(async()=>{await call("grant",{user:user.value,sites:grants.value.split(",").map(s=>s.trim()).filter(Boolean)});await refresh();}));
    }
    const observation=field(imports,L("Observation de positions (JSON)","Rank observation (JSON)"),JSON.stringify({siteId:data.sites[0]?.id||"brussels",source:"Manual survey",method:"manual",observedAt:new Date().toISOString(),surface:"maps",query:"service",depth:20,points:[{id:"centre",status:"not-found",latitude:50.85,longitude:4.35}]},null,2),"textarea");
    imports.append(el("p","c-note",L("Ajoutez language, country, device et identity pour permettre une comparaison. found exige un rang ; not-found et error n’en acceptent pas. Aucune collecte Google n’est lancée.","Add language, country, device and identity to enable comparison. found requires a rank; not-found and error cannot have one. No Google collection is triggered.")));
    button(imports,L("Importer l’observation","Import observation"),()=>run(async()=>{await call("import",{observation:JSON.parse(observation.value)});await refresh();}));
    const draft=el("details");draft.append(el("summary","",L("Créer une action fondée sur une preuve","Create an evidence-based action")));content.append(draft);
    const siteId=field(draft,L("Identifiant établissement","Location ID"),data.sites[0]?.id||"");const title=field(draft,L("Titre","Title"));const text=field(draft,L("Modification proposée et procédure de vérification","Proposed change and verification procedure"),"","textarea");const lang=field(draft,L("Langue du contenu","Content language"),data.sites[0]?.languages?.[0]||"");const owner=field(draft,L("Responsable","Owner"));const due=field(draft,L("Échéance UTC (ISO 8601)","UTC deadline (ISO 8601)"),new Date(Date.now()+7*86400000).toISOString());const evidence=field(draft,L("Identifiants de preuves séparés par des virgules","Comma-separated evidence IDs"));
    button(draft,L("Enregistrer le brouillon","Save draft"),()=>run(async()=>{await call("action",{action:{siteId:siteId.value,title:title.value,content:text.value,language:lang.value,owner:owner.value,due:due.value,evidence:evidence.value.split(",").map(s=>s.trim()).filter(Boolean)}});await refresh();}));
    button(content,L("Exporter mon périmètre (JSON)","Export my scope (JSON)"),()=>run(async()=>{const value=await call("export");const url=URL.createObjectURL(new Blob([JSON.stringify({reportLocale:LANG,...value},null,2)],{type:"application/json"}));const a=el("a");a.href=url;a.download="local-seo-"+LANG+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
  }
  try{await refresh();}catch{status.textContent=L("Accès indisponible. Un compte client actif et une délégation sont nécessaires ; le rôle plateforme seul ne donne pas accès aux données locales.","Access unavailable. An active customer account and a delegation are required; the platform role alone does not grant local data access.");}
  return root;
}
