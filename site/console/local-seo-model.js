/** Local SEO planning from user declarations, never a live directory/rank audit. */
export const LOCAL_SEO_VERSION = 1;
const clean = (v, max = 200) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const normal = (v) => clean(v).normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
const phone = (v) => clean(v).replace(/[\s().-]/g, "");
export function safeUrl(v) {
  try { const u = new URL(clean(v, 2048)); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password ? u.href : ""; } catch { return ""; }
}
export function normaliseLocalProfile(input = {}) {
  const p = input && typeof input === "object" ? input : {};
  return Object.fromEntries([
    ...["name", "street", "city", "postalCode", "country", "phone", "service", "area"].map(k => [k, clean(p[k])]),
    ["website", safeUrl(p.website)], ["gbp", safeUrl(p.gbp)], ["publicAddress", p.publicAddress === true],
  ]);
}
export function buildLocalPlan(input = {}, language = "fr") {
  const p = normaliseLocalProfile(input.profile);
  const L = (fr, en) => language === "en" ? en : fr;
  const checks = [];
  const check = (id, complete, fr, en) => checks.push({ id, status: complete ? "declared" : "missing", action: L(fr, en), source: "user-declared" });
  check("identity", !!(p.name && p.phone), "Renseigner le nom commercial et le téléphone de référence.", "Enter the reference business name and phone number.");
  check("website", !!p.website, "Renseigner une URL HTTP(S) valide pour la page locale.", "Enter a valid HTTP(S) URL for the local landing page.");
  check("location", p.publicAddress ? !!(p.street && p.city && p.postalCode && p.country) : !!p.area, "Compléter l’adresse publique ou la zone desservie.", "Complete the public address or service area.");
  check("service", !!p.service, "Préciser le service principal pour préparer les requêtes locales.", "Specify the main service to prepare local queries.");
  check("gbp", !!p.gbp, "Renseigner le lien de la fiche Google Business Profile et vérifier sa propriété.", "Enter the Google Business Profile link and verify ownership.");
  const citations = (Array.isArray(input.citations) ? input.citations : []).slice(0, 20).map((c) => {
    c = c && typeof c === "object" ? c : {};
    const row = { directory: clean(c.directory), url: safeUrl(c.url), name: clean(c.name), address: clean(c.address), phone: clean(c.phone) };
    const expectedAddress = [p.street, p.postalCode, p.city, p.country].filter(Boolean).join(", ");
    const compare = (a, b, fn = normal) => !a || !b ? "unknown" : fn(a) === fn(b) ? "match" : "review";
    return { ...row, source: "user-declared", comparison: {
      name: compare(p.name, row.name), phone: compare(p.phone, row.phone, phone),
      address: p.publicAddress && p.street && p.city && p.postalCode && p.country ? compare(expectedAddress, row.address) : "not-applicable",
    } };
  });
  const location = p.area || p.city;
  return {
    version: LOCAL_SEO_VERSION, profile: p, checks, citations,
    queries: p.service && location ? [`${p.service} ${location}`] : [],
    querySource: "hypothesis", integrations: { googleBusinessProfile: "not-connected", mapRankTracking: "not-connected", directoryPublishing: "not-connected" },
    limitation: L("Diagnostic des informations saisies uniquement : aucune fiche, position Google Maps, citation ou statistique n’a été vérifiée en ligne. Les correspondances textuelles ne prouvent pas l’identité d’un établissement.", "Assessment of entered information only: no listing, Google Maps rank, citation or metric was verified online. Text matches do not prove business identity."),
    actions: [
      L("Vérifier catégories, horaires et photos sur Google Business Profile, Bing Places et Apple Business Connect.", "Verify categories, hours and photos on Google Business Profile, Bing Places and Apple Business Connect."),
      L("Corriger les écarts de coordonnées dans les annuaires après vérification manuelle des liens et doublons.", "Correct directory contact details after manually checking links and duplicates."),
      L("Adapter titre, H1 et contenu de la page au service et à la zone réelle ; éviter les pages locales dupliquées.", "Adapt the page title, H1 and content to the actual service and area; avoid duplicate local pages."),
      L("Demander un avis honnête à tous les clients concernés, sans récompense ni sélection des avis positifs ; préparer les réponses pour validation.", "Ask all eligible customers for honest reviews, without incentives or filtering for positive feedback; prepare replies for review."),
      L("Connecter ultérieurement les sources autorisées pour mesurer appels, itinéraires et visibilité locale.", "Connect authorised sources in a later phase to measure calls, directions and local visibility."),
    ],
  };
}
/** Only publish a LocalBusiness draft when a complete public address is provided. */
export function localSchema(profile) {
  const p = normaliseLocalProfile(profile);
  if (!p.publicAddress || !p.name || !p.website || !p.street || !p.city || !p.postalCode || !p.country) return null;
  return { "@context": "https://schema.org", "@type": "LocalBusiness", name: p.name, url: p.website,
    ...(p.phone ? { telephone: p.phone } : {}),
    address: { "@type": "PostalAddress", streetAddress: p.street, addressLocality: p.city, postalCode: p.postalCode, addressCountry: p.country },
    ...(p.area ? { areaServed: p.area } : {}),
  };
}
export function localPlanMarkdown(plan, language = "fr") {
  const en = language === "en";
  return [`# ${en ? "Local SEO action plan" : "Plan d’action SEO local"}`, "", plan.profile.name, plan.profile.website, "", plan.limitation, "",
    ...plan.checks.map(c => `- [${c.status === "declared" ? "x" : " "}] ${c.action}`), "",
    en ? "Checked boxes mean declared information, not verified completion." : "Les cases cochées indiquent une information déclarée, pas une action vérifiée.", "",
    ...plan.citations.map(c => `- ${c.directory}: ${c.url} — ${JSON.stringify(c.comparison)}`), "",
    en ? "Query hypotheses (no search volumes):" : "Hypothèses de requêtes (sans volumes de recherche) :", ...plan.queries.map(q => `- ${q}`), "",
    ...plan.actions.map(a => `- [ ] ${a}`)].join("\n");
}
