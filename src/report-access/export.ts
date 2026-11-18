/** A4 PDF and plain Markdown exports from the exact saved public snapshot. */
import PDFDocument from "pdfkit";
import type { FreeReport360, ReportAction, ReportPillarId } from "../freeread/report360.js";
import type { ReportLanguage } from "./service.js";
import { readableOn, type WhiteLabelBrand } from "./brand.js";

export interface ExportOptions {
  /** Per-client white-label branding; null keeps the house GTM Growth identity. */
  brand?: WhiteLabelBrand | null;
}

/** Without metric summing: an export is always ONE snapshot in ONE language. */
const singleSnapshot = (report: FreeReport360): FreeReport360 => {
  if (Array.isArray(report) || typeof report !== "object" || report === null)
    throw new TypeError("The white-label export takes exactly one snapshot; aggregated or multi-client metrics are refused.");
  return report;
};

const PALETTE = { ink: "#262144", muted: "#675e85", accent: "#6935DC", line: "#E3DCF5", soft: "#F6F2FF", white: "#FFFFFF" };
const PILLAR_COLORS: Record<ReportPillarId, string> = { seo: "#6935DC", geo: "#2474AB", ai: "#9855B5", crm: "#B57C1A", social: "#148570" };
const NAMES: Record<ReportPillarId, [string, string]> = { seo: ["SEO", "SEO"], geo: ["GEO", "GEO"], ai: ["Moteurs IA", "AI engines"], crm: ["CRM", "CRM"], social: ["Réseaux sociaux", "Social"] };
const ACTION_TITLES: Record<string, [string, string]> = {
  title: ["Clarifier le titre de la page", "Clarify the page title"],
  description: ["Expliquer la proposition de valeur", "Explain the page value"],
  canonical: ["Vérifier l'URL de référence", "Verify the canonical URL"],
  robots: ["Vérifier les directives d'indexation", "Review indexing directives"],
  x_robots: ["Contrôler X-Robots-Tag", "Review X-Robots-Tag"],
  lang: ["Déclarer la langue principale", "Declare the page language"],
  open_graph: ["Améliorer l'aperçu social", "Improve shared-link previews"],
  h1: ["Clarifier le titre principal", "Clarify the main heading"],
  outline: ["Structurer les réponses", "Organise answers by topic"],
  content_review: ["Vérifier la valeur éditoriale", "Review content usefulness"],
  internal_links: ["Relier les pages pertinentes", "Link related pages"],
  image_alt: ["Décrire les images utiles", "Describe informative images"],
  jsonld: ["Vérifier les données structurées", "Review structured data"],
  schema: ["Déclarer les entités vérifiables", "Declare verifiable entities"],
  ai_measurement: ["Mesurer les réponses des IA", "Measure actual AI answers"],
  crm_measurement: ["Relier les actions aux conversions", "Connect actions to conversions"],
  social_presence: ["Valider la présence sociale", "Validate social presence"],
};
const PRIORITIES: Record<string, [string, string]> = { critical: ["critique", "critical"], high: ["haute", "high"], medium: ["moyenne", "medium"], low: ["basse", "low"] };
const OWNERS: Record<string, [string, string]> = { content: ["équipe éditoriale", "content team"], technical: ["équipe technique", "technical team"], marketing: ["marketing", "marketing"], analytics: ["data / CRM", "data / CRM"] };
const V2_STEPS: Record<string, [[string, string, string], [string, string, string]]> = {
  R: [["Vérifiez les règles robots.txt applicables à cette URL et aux robots IA.", "Préparez le changement d'accès requis, après validation du propriétaire.", "Recontrôlez les statuts HTTP et les directives par robot."], ["Inspect the robots.txt rules for this URL and AI crawlers.", "Prepare any access changes with the owner's approval.", "Recheck HTTP status codes and agent-specific rules."]],
  L: [["Consultez llms.txt et les pages de documentation accessibles.", "Ajoutez des titres, résumés et liens fidèles au contenu approuvé.", "Vérifiez les fichiers et leur structure après mise à jour."], ["Inspect llms.txt and reachable documentation pages.", "Add headings, summaries and links based on approved facts.", "Recheck the files and document structure after the update."]],
  J: [["Comparez les entités Schema.org aux faits visibles sur la page.", "Corrigez les champs et identifiants uniquement s'ils sont vérifiés.", "Testez la syntaxe JSON-LD et la cohérence du contenu publié."], ["Compare Schema.org entities with visible page facts.", "Update only verified properties and stable identifiers.", "Validate JSON-LD syntax and visible content consistency."]],
  M: [["Repérez la balise meta concernée dans la réponse HTML.", "Rédigez une valeur fidèle au contenu et faites-la approuver.", "Relancez la lecture et comparez la balise après publication."], ["Find the affected metadata in the HTML response.", "Draft an accurate replacement and have it approved.", "Read the page again and compare metadata after publication."]],
  C: [["Lisez le passage comme un client, en vérifiant la question traitée.", "Ajoutez des réponses et références sourcées sans inventer de faits.", "Revérifiez la hiérarchie des titres et la lisibilité."], ["Read the passage from a customer's point of view.", "Add supported answers and references without invented claims.", "Check the heading hierarchy and readability again."]],
  B: [["Confirmez la marque, les coordonnées et les profils officiels.", "Alignez la page et les déclarations structurées approuvées.", "Vérifiez les liens officiels et les preuves indépendantes."], ["Confirm the brand, contact details and official profiles.", "Align the page and approved structured declarations.", "Check official links and independent evidence."]],
  D: [["Repérez les ressources de découverte accessibles depuis la page.", "Reliez le sitemap et les points d'entrée autorisés.", "Vérifiez les URL et les réponses HTTP correspondantes."], ["Locate discovery resources reachable from the page.", "Connect approved sitemaps and entry points.", "Verify URLs and corresponding HTTP responses."]],
  P: [["Vérifiez la propriété du domaine (DNS TXT ou fichier HTTPS).", "Autorisez un rendu Playwright isolé et limité en ressources.", "Comparez le HTML, le DOM rendu et les journaux vérifiés."], ["Verify ownership through DNS TXT or an HTTPS file.", "Authorise an isolated, resource-limited Playwright render.", "Compare the original HTML, rendered DOM and verified logs."]],
};

const at = (entry: [string, string], language: ReportLanguage): string => entry[language === "fr" ? 0 : 1];
const clean = (value: unknown, limit = 500): string => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
const markdownClean = (value: unknown, limit = 500): string => clean(value, limit).replace(/([\\`*_{}\[\]()#+.!|><~-])/g, "\\$1");
const markdownUrl = (value: string): string => {
  try { const u = new URL(value); if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) return "(unavailable)";
    return `<${u.href.replace(/</g, "%3C").replace(/>/g, "%3E")}>`;
  } catch { return "(unavailable)"; }
};
const date = (value: string, language: ReportLanguage): string => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(language === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "-";
};

function v2Summary(report: FreeReport360, language: ReportLanguage): string {
  const fr = language === "fr";
  const controls = report.geoV2?.controls ?? [];
  if (!controls.length) return fr ? "GEO v2 : collecte indisponible" : "GEO v2: evidence collection unavailable";
  const measured = controls.filter(control => control.status === "measured").length;
  const unknown = controls.filter(control => control.status === "unknown").length;
  const excluded = controls.filter(control => control.status === "not_applicable").length;
  return `GEO v2 · ${measured}/${controls.length} ${fr ? "observés" : "observed"} · ${unknown} ${fr ? "inconnus" : "unknown"} · ${excluded} ${fr ? "non applicables" : "not applicable"}`;
}

const V2_CATEGORY_NAMES: Record<string, [string, string]> = {
  robots: ["Accès des robots", "Crawler access"], llms: ["Documentation IA", "AI documentation"],
  jsonld: ["Données structurées", "Structured data"], meta: ["Métadonnées", "Metadata"],
  content: ["Contenu", "Content"], brand: ["Identité de marque", "Brand identity"],
  discovery: ["Découverte IA", "AI discovery"], rendering: ["Rendu du navigateur", "Browser rendering"],
};
const V2_TITLES_FR: Record<string, string> = {
  R01: "Accès au fichier robots.txt", R02: "Autorisation des robots des moteurs IA", R03: "Absence de blocage contradictoire", R04: "Sitemap déclaré et accessible", R05: "Cohérence des règles par robot",
  L01: "Accès au fichier llms.txt", L02: "Identification de l'activité", L03: "Résumé clair pour les IA", L04: "Structure et liens de documentation", L05: "Documentation de plus de 1 000 mots", L06: "Documentation approfondie et structurée",
  J01: "JSON-LD lisible", J02: "Entité entreprise déclarée", J03: "Identifiants des entités cohérents", J04: "Liens entre site et pages", J05: "Données adaptées au contenu", J06: "Cohérence entre texte et données structurées",
  M01: "Titre descriptif", M02: "Description utile", M03: "Adresse canonique cohérente", M04: "Aperçu Open Graph", M05: "Directives d'indexation cohérentes",
  C01: "Proposition de valeur identifiable", C02: "Réponses directes aux questions", C03: "Titres de page structurés", C04: "Faits vérifiables", C05: "Sources pertinentes", C06: "Passages faciles à extraire", C07: "Dates de mise à jour vérifiables", C08: "Liens internes contextualisés",
  B01: "Identité de marque cohérente", B02: "Entreprise et coordonnées identifiables", B03: "Profils sociaux déclarés cohérents", B04: "Références externes vérifiées", B05: "Expertise et autorité documentées",
  D01: "Ressources de découverte IA accessibles", D02: "Pages importantes présentes dans le sitemap", D03: "Documentation facilement accessible",
  P01: "Contenu essentiel présent dans le HTML", P02: "Cohérence entre HTML et rendu", P03: "Accès au contenu pour un crawler", P04: "Rendu stable sans blocage",
};
const v2Title = (id: string, original: string, language: ReportLanguage): string => language === "fr" ? V2_TITLES_FR[id] || original : original;

function v2Status(status: string, language: ReportLanguage): string {
  const fr = language === "fr";
  return status === "measured" ? (fr ? "Observé" : "Observed") :
    status === "not_applicable" ? (fr ? "Non applicable" : "Not applicable") :
    (fr ? "Inconnu · preuve requise" : "Unknown · evidence needed");
}

export function actionGuide(action: ReportAction, lang: ReportLanguage): { title: string; why: string; steps: [string, string, string]; verify: string } {
  const fr = lang === "fr";
  const title = action.code === "geo_v2_check" && action.checkId
    ? `GEO v2 ${clean(action.checkId, 8)} · ${clean(v2Title(action.checkId, action.title || action.checkId, lang), 130)}`
    : ACTION_TITLES[action.code] ? at(ACTION_TITLES[action.code], lang)
      : (fr ? `Examiner le contrôle ${clean(action.checkId, 80)}` : `Review control ${clean(action.checkId, 80)}`);
  if (action.code === "geo_v2_check" && action.checkId) {
    const steps = V2_STEPS[action.checkId[0]]?.[fr ? 0 : 1];
    if (steps) return {
      title,
      why: action.proof ? `${fr ? "Constat vérifié" : "Observed finding"}: ${clean(action.proof.value, 200)}` : (fr ? "Preuve à compléter." : "Further evidence required."),
      steps,
      verify: fr ? "Relancez le même contrôle v2 sur cette URL et comparez les preuves datées." : "Run the same v2 check on this URL again and compare dated evidence.",
    };
  }
  if (action.kind === "next_step") {
    const specific: Record<string, [string, string, string, string][]> = {
      ai_measurement: [["Sélectionnez des questions clients représentatives.", "Choisissez et autorisez les moteurs IA utiles.", "Enregistrez chaque réponse datée et sa provenance.", "Comparez les réponses réellement collectées, jamais un score de préparation.",], ["Select representative customer questions.", "Choose and authorise the relevant AI engines.", "Record each dated answer and its source.", "Compare actual collected answers, never a readiness score."]],
      crm_measurement: [["Définissez une conversion métier vérifiable.", "Connectez GA4 ou votre CRM avec les droits adaptés.", "Vérifiez les événements, sources et consentements.", "Contrôlez les conversions dans l'espace client, sans identité déduite.",], ["Define a verifiable business conversion.", "Connect GA4 or CRM with scoped permissions.", "Verify events, sources and consent.", "Review conversions in the private workspace; never infer identity."]],
      social_presence: [["Confirmez les profils officiels de votre marque.", "Ajoutez uniquement les liens sortants approuvés.", "Connectez une source autorisée pour les liens entrants.", "Vérifiez séparément liens sortants et signaux entrants.",], ["Confirm the brand's official profiles.", "Add only approved outbound profile links.", "Connect an authorised source for inbound signals.", "Verify outbound links separately from inbound mentions."]],
    };
    const steps = specific[action.code]?.[fr ? 0 : 1];
    if (steps) return { title, why: fr ? "Cette mesure n'a pas été collectée dans le rapport public." : "This measurement was not collected by the public report.", steps: [steps[0], steps[1], steps[2]], verify: steps[3] };
  }
  const proof = action.proof;
  return {
    title,
    why: proof ? `${fr ? "Constat" : "Observation"}: ${clean(proof.label, 80)} - ${clean(proof.value, 140)}${proof.note ? `. ${clean(proof.note, 190)}` : ""}` : (fr ? "Prochaine vérification proposée." : "Proposed follow-up review."),
    steps: [
      fr ? "Examinez le constat et confirmez l'objectif de cette page." : "Review the observation and confirm this page's goal.",
      fr ? `Préparez une correction ciblée avec ${at(OWNERS[action.owner] || OWNERS.technical, lang)} ; faites-la approuver avant publication.` : `Prepare a focused fix with the ${at(OWNERS[action.owner] || OWNERS.technical, lang)}; obtain approval before publishing.`,
      fr ? "Relancez la lecture sur la même URL, avec la même méthode." : "Run the read again on the same URL with the same method.",
    ],
    verify: fr ? "Comparez le contrôle observé et ses preuves à deux dates réelles. Aucun gain de trafic n'est garanti." : "Compare the check and its proof at two actual dates. No traffic gain is promised.",
  };
}

export function renderReportMarkdown(report: FreeReport360, language: ReportLanguage, options: ExportOptions = {}): string {
  singleSnapshot(report);
  const brand = options.brand ?? null;
  const fr = language === "fr";
  const out: string[] = [
    `# ${brand ? brand.name : "GTM Growth"} - ${fr ? "Rapport gratuit 360°" : "Free 360° report"}`,
    "",
    ...(brand?.tagline ? [`> ${markdownClean(brand.tagline, 140)}`, ""] : []),
    `- ${fr ? "Page analysée" : "Analysed page"}: ${markdownUrl(report.sourceUrl)}`,
    `- ${fr ? "Relevé" : "Observed"}: ${date(report.observedAt, language)}`,
    `- ${fr ? "Périmètre" : "Scope"}: ${fr ? "une seule URL publique" : "one public URL"}`,
    `- ${fr ? "Méthode" : "Method"}: ${report.method}`,
    "",
    `## ${fr ? "Les cinq leviers" : "Five channels"}`,
    "",
    `| ${fr ? "Levier" : "Channel"} | ${fr ? "Couverture" : "Coverage"} | ${fr ? "Mesure" : "Measurement"} |`,
    "| --- | --- | --- |",
  ];
  for (const p of report.pillars) {
    const measurement = p.id === "geo" ? v2Summary(report, language) : p.id === "seo" ? `${p.observedChecks ?? "-"} ${fr ? "contrôles" : "checks"}; ${p.needsAttention ?? "-"} ${fr ? "à revoir" : "to review"}` : p.id === "social" ? `${p.observedCount ?? "-"} ${fr ? "liens de profils sortants" : "outbound profile links"}` : (fr ? "non mesuré" : "not measured");
    out.push(`| ${at(NAMES[p.id], language)} | ${p.coverage} | ${measurement} |`);
  }
  out.push("", `## ${fr ? "Aperçu visuel de la page" : "Visual page evidence"}`, "");
  const preview = report.sourcePreview;
  if (preview?.kind === "observed_html_reconstruction") {
    out.push(`> ${fr ? "APERÇU RECONSTITUÉ À PARTIR DU HTML — PAS UNE CAPTURE D'ÉCRAN" : "RECONSTRUCTED FROM HTML — NOT A SCREENSHOT"}`, "");
    out.push(`- ${fr ? "Titre d'extrait" : "Snippet title"}: ${markdownClean(preview.title || (fr ? "Absent" : "Missing"))}`);
    out.push(`- ${fr ? "Description d'extrait" : "Snippet description"}: ${markdownClean(preview.description || (fr ? "Absente" : "Missing"))}`);
    out.push(`- H1: ${markdownClean(preview.heading || (fr ? "Absent" : "Missing"))}`);
    for (const h2 of preview.subheadings) out.push(`  - H2: ${markdownClean(h2)}`);
    out.push(`- ${fr ? "Source originale" : "Original source"}: ${markdownUrl(report.sourceUrl)}`, "");
  } else out.push(fr ? "Aucune reconstruction HTML disponible." : "No HTML reconstruction available.", "");
  out.push(`## ${fr ? "Grille GEO v2 — 42 contrôles" : "GEO v2 — 42-control evidence ledger"}`, "");
  out.push(`**${markdownClean(v2Summary(report, language))}**`, "");
  out.push(fr ? "Aucun score v2 n'est publié sans preuves complètes et consentement du propriétaire. Un contrôle inconnu n'est pas un échec." : "No v2 score is published without complete evidence and owner consent. Unknown is not a failure.", "");
  for (const [category, labels] of Object.entries(V2_CATEGORY_NAMES)) {
    const controls = report.geoV2?.controls.filter(control => control.category === category) ?? [];
    if (!controls.length) continue;
    out.push(`### ${at(labels, language)}`, "");
    for (const c of controls) {
      out.push(`- **${markdownClean(c.controlId)} — ${markdownClean(v2Title(c.controlId, c.title, language), 160)}**: ${v2Status(c.status, language)}.`);
      if (c.status === "measured" && c.proof) {
        out.push(`  - ${fr ? "Constat" : "Observation"}: ${markdownClean(c.proof.value, 260)} · ${fr ? "source" : "source"}: ${markdownUrl(c.proof.url)}`);
      } else if (c.reason) out.push(`  - ${fr ? "Motif" : "Reason"}: ${markdownClean(c.reason, 260)}`);
    }
    out.push("");
  }
  out.push("", `## ${fr ? "Plan d'action" : "Action plan"}`, "");
  let i = 0;
  for (const action of report.actions) {
    const guide = actionGuide(action, language);
    out.push(`### ${++i}. ${at(NAMES[action.pillar], language)} - ${markdownClean(guide.title, 150)}`);
    out.push(`- ${fr ? "Type" : "Type"}: ${action.kind === "observed_fix" ? (fr ? "constat observé" : "observed finding") : (fr ? "étape conditionnelle" : "conditional next step")}`);
    out.push(`- ${fr ? "Priorité" : "Priority"}: ${at(PRIORITIES[action.priority] || PRIORITIES.medium, language)}; ${fr ? "effort" : "effort"}: ${action.effort}; ${fr ? "risque" : "change risk"}: ${action.risk}; ${fr ? "responsable" : "owner"}: ${at(OWNERS[action.owner] || OWNERS.technical, language)}`);
    out.push(`- ${fr ? "Pourquoi" : "Why"}: ${markdownClean(guide.why)}`);
    if (action.proof) {
      out.push(`- ${fr ? "Preuve" : "Evidence"}: ${markdownClean(action.proof.label, 100)} - ${markdownClean(action.proof.value)} (${date(action.proof.observedAt, language)})`);
      out.push(`- ${fr ? "Source" : "Source"}: ${markdownUrl(action.proof.sourceUrl)}`);
    } else out.push(`- ${fr ? "Preuve" : "Evidence"}: ${fr ? "aucun échec observé; connexion à autoriser" : "no measured failure; optional connection"}`);
    out.push("", ...guide.steps.map((step, index) => `${index + 1}. ${markdownClean(step, 400)}`));
    out.push("", `**${fr ? "Vérifier" : "Verify"}:** ${markdownClean(guide.verify)}`, "");
  }
  out.push(`## ${fr ? "Limites" : "Limitations"}`, "");
  out.push(fr ? "L'aperçu est une reconstruction de titres/description/H1/H2, pas une capture de la page. Une capture Playwright exige la vérification du domaine. Aucun moteur IA ou compte CRM n'a été interrogé. Les liens entrants, positions et conversions ne sont pas mesurés. Une seconde lecture n'a pas été effectuée : aucun avant/après réel n'est affirmé." : "The preview reconstructs title/description/H1/H2, not an actual screenshot. Playwright capture requires domain verification. No AI engine or CRM account was queried. Inbound links, rankings and conversions are not measured. No second observation was made: no real before/after improvement is claimed.");
  return out.join("\n") + "\n";
}

/** Vector-only PDF; one source snapshot, no external image fetch or private data. */
export async function renderReportPdf(report: FreeReport360, language: ReportLanguage, options: ExportOptions = {}): Promise<Buffer> {
  singleSnapshot(report);
  const brand = options.brand ?? null;
  const fr = language === "fr";
  const name = brand?.name ?? "GTM Growth";
  const bandColor = brand?.accentColor ?? "#281649";
  const pdf = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: `${name} - ${fr ? "Rapport" : "Report"} 360`, Subject: "Public page evidence and reviewed actions", Creator: name } });
  const pieces: Buffer[] = [];
  pdf.on("data", (part: Buffer) => pieces.push(part));
  const completed = new Promise<Buffer>((resolve, reject) => { pdf.on("end", () => resolve(Buffer.concat(pieces))); pdf.on("error", reject); });
  const width = pdf.page.width, left = 42, usable = width - 84;
  const text = (v: unknown, max = 450): string => clean(v, max);
  const drawText = (value: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}) => pdf.text(value, x, y, { width: usable, ...options });

  pdf.rect(0, 0, width, 170).fill(bandColor);
  pdf.fillColor(readableOn(bandColor)).font("Helvetica-Bold").fontSize(12).text(name, left, 39);
  pdf.fontSize(27).text(fr ? "Rapport gratuit 360" : "Free 360 report", left, 75, { width: usable });
  const subtitle = brand?.tagline ?? (fr ? "Un diagnostic public expliqué, sourcé et actionnable" : "Public evidence with an understandable action plan");
  pdf.fillColor(brand ? readableOn(bandColor) : "#DFD2FF").font("Helvetica").fontSize(10).text(subtitle, left, 121, { width: usable });
  pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(9);
  drawText(`${fr ? "Page source" : "Source URL"}: ${text(report.sourceUrl, 300)}`, left, 190, { link: report.sourceUrl });
  drawText(`${fr ? "Relevé" : "Observed"}: ${date(report.observedAt, language)}  |  ${fr ? "Périmètre" : "Scope"}: ${fr ? "une seule page" : "one page"}`, left, 207);
  pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(15);
  drawText(fr ? "Les cinq leviers" : "Five channels", left, 250);

  for (const [index, p] of report.pillars.entries()) {
    const column = index % 2, row = Math.floor(index / 2), w = (usable - 12) / 2;
    const x = left + column * (w + 12), y = 283 + row * 89;
    pdf.roundedRect(x, y, w, 80, 9).fill(PALETTE.soft);
    pdf.rect(x, y + 5, 4, 68).fill(PILLAR_COLORS[p.id]);
    pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(11).text(at(NAMES[p.id], language), x + 13, y + 10, { width: w - 24 });
    const value = p.id === "geo" ? `${p.observedChecks ?? 0}/42 ${fr ? "observés" : "observed"}` : p.id === "seo" ? `${p.observedChecks ?? "-"} ${fr ? "contrôles" : "checks"}` : p.id === "social" ? `${p.observedCount ?? "-"} ${fr ? "liens sortants" : "outbound links"}` : (fr ? "Non mesuré" : "Not measured");
    pdf.fillColor(PALETTE.accent).font("Helvetica-Bold").fontSize(11).text(value, x + 13, y + 34, { width: w - 24 });
    pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(8).text(p.coverage, x + 13, y + 57, { width: w - 24 });
  }
  const priorities = report.actions.filter(a => a.kind === "observed_fix").slice(0, 3);
  pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(14).text(fr ? "Trois priorités à examiner" : "Three priorities to review", left, 579);
  let y = 612;
  for (const [index, action] of priorities.entries()) {
    const g = actionGuide(action, language);
    pdf.fillColor(PILLAR_COLORS[action.pillar]).font("Helvetica-Bold").fontSize(10).text(`${index + 1}. ${at(NAMES[action.pillar], language)} - ${text(g.title, 95)}`, left, y, { width: usable });
    y += 26;
  }
  pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(8).text(fr ? "Les inconnues ne sont pas des scores à zéro. Les corrections restent des propositions à valider." : "Unknown metrics are not zero scores. Every change requires review.", left, 721, { width: usable });

  // Source-linked editorial reconstruction: deliberately NO fabricated screenshot.
  pdf.addPage();
  pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(17)
    .text(fr ? "La page, illustrée par les faits" : "Your page, illustrated from evidence", left, 58, { width: usable });
  pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(9)
    .text(fr ? "Aperçu reconstitué du HTML observé — pas une capture d'écran du navigateur." : "Preview reconstructed from observed HTML — not a browser screenshot.", left, 88, { width: usable });
  const preview = report.sourcePreview;
  pdf.roundedRect(left, 126, usable, 208, 12).fill(PALETTE.soft);
  pdf.roundedRect(left + 17, 144, usable - 34, 29, 7).fill("#E8E1F8");
  for (const [i, color] of ["#E9738C", "#ECC06C", "#77C7AD"].entries()) {
    pdf.circle(left + 31 + i * 14, 159, 3.7).fill(color);
  }
  pdf.fillColor(PALETTE.ink).fontSize(8)
    .text(text(report.sourceUrl, 105), left + 103, 153, { width: usable - 133, ellipsis: true });
  pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(8)
    .text(fr ? "Aperçu du résultat de recherche" : "Search-result snippet preview", left + 27, 188);
  pdf.fillColor(PALETTE.accent).font("Helvetica-Bold").fontSize(14)
    .text(text(preview?.title || (fr ? "Titre non détecté" : "No title found"), 115), left + 27, 211, { width: usable - 58, ellipsis: true, height: 34 });
  pdf.fillColor(PALETTE.ink).font("Helvetica").fontSize(10)
    .text(text(preview?.description || (fr ? "Description non détectée" : "No description found"), 200), left + 27, 254, { width: usable - 58, height: 53, ellipsis: true });
  pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(13)
    .text(fr ? "Structure des titres observée" : "Observed heading outline", left, 366, { width: usable });
  const observedHeadings = [
    ["H1", preview?.heading || (fr ? "Aucun H1 trouvé" : "No H1 found")],
    ...(preview?.subheadings ?? []).slice(0, 4).map(value => ["H2", value]),
  ];
  for (const [index, [tag, value]] of observedHeadings.entries()) {
    const rowY = 407 + index * 50;
    pdf.roundedRect(left, rowY, usable, 42, 7).fill(index === 0 ? "#EBE3FC" : "#F6F2FF");
    pdf.fillColor(PALETTE.accent).font("Helvetica-Bold").fontSize(10)
      .text(tag, left + 13, rowY + 14, { width: 31 });
    pdf.fillColor(PALETTE.ink).font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(10)
      .text(text(value, 180), left + 55, rowY + 12, { width: usable - 70, height: 24, ellipsis: true });
  }
  pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(9)
    .text(fr ? "Capture Playwright authentique : domaine vérifié et autorisation du propriétaire requis." : "Authentic Playwright screenshot requires verified domain ownership and approval.", left, 689, { width: usable });

  // All 42 GEO v2 checks: visible coverage, explicit unknowns, no private points.
  pdf.addPage();
  let ledgerY = 56;
  pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(16)
    .text(fr ? "GEO v2 — 42 contrôles et preuves" : "GEO v2 — 42 checks and evidence", left, ledgerY, { width: usable });
  pdf.fillColor(PALETTE.accent).font("Helvetica-Bold").fontSize(10)
    .text(v2Summary(report, language), left, ledgerY + 30, { width: usable });
  pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(8.5)
    .text(fr ? "Score non publié. Inconnu ne signifie pas échec. Vérifier chaque preuve avant toute décision." : "Score unpublished. Unknown does not mean failure. Review each proof before acting.", left, ledgerY + 48, { width: usable });
  ledgerY += 82;
  for (const [category, names] of Object.entries(V2_CATEGORY_NAMES)) {
    const controls = report.geoV2?.controls.filter(control => control.category === category) ?? [];
    if (!controls.length) continue;
    if (ledgerY + 61 > 743) { pdf.addPage(); ledgerY = 56; }
    pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(11)
      .text(at(names, language), left, ledgerY, { width: usable });
    ledgerY += 19;
    for (const control of controls) {
      if (ledgerY + 34 > 743) { pdf.addPage(); ledgerY = 56; }
      const observed = control.status === "measured";
      pdf.roundedRect(left, ledgerY, usable, 33, 5).fill(observed ? "#F3F0FB" : "#FAF8FE");
      pdf.fillColor(PALETTE.accent).font("Helvetica-Bold").fontSize(9)
        .text(control.controlId, left + 8, ledgerY + 5, { width: 31 });
      pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(8.5)
        .text(text(v2Title(control.controlId, control.title, language), 70), left + 43, ledgerY + 5, { width: usable - 170, height: 11, ellipsis: true });
      pdf.fillColor(observed ? "#176450" : PALETTE.muted).font("Helvetica").fontSize(8)
        .text(v2Status(control.status, language), left + usable - 120, ledgerY + 5, { width: 112, align: "right", ellipsis: true });
      pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(7.5)
        .text(text(observed ? control.proof?.value : control.reason || (fr ? "Preuve requise" : "Evidence required"), 150), left + 43, ledgerY + 19,
          { width: usable - 55, height: 11, ellipsis: true });
      ledgerY += 37;
    }
    ledgerY += 6;
  }

  // Each action receives a readable proof/steps card. New page, no clipped rows.
  pdf.addPage(); y = 55;
  for (const [index, action] of report.actions.entries()) {
    const g = actionGuide(action, language);
    const proof = action.proof;
    const x = left + 14, w = usable - 28;
    const body = [
      `${fr ? "Pourquoi" : "Why"}: ${text(g.why, 220)}`,
      ...g.steps.map((step, i) => `${i + 1}. ${text(step, 210)}`),
      `${fr ? "Vérifier" : "Verify"}: ${text(g.verify, 220)}`,
    ];
    if (proof) body.push(`${fr ? "Preuve" : "Evidence"}: ${text(proof.value, 160)}  (${date(proof.observedAt, language)})`);
    pdf.font("Helvetica").fontSize(8.1);
    const bodyHeight = pdf.heightOfString(body.join("\n"), { width: w, lineGap: 2 });
    const h = Math.max(169, 75 + bodyHeight);
    if (y + h > 748) { pdf.addPage(); y = 55; }
    pdf.roundedRect(left, y, usable, h, 9).fill(PALETTE.soft);
    pdf.rect(left, y + 4, 5, h - 8).fill(PILLAR_COLORS[action.pillar]);
    pdf.fillColor(PILLAR_COLORS[action.pillar]).font("Helvetica-Bold").fontSize(8)
      .text(`${index + 1} / ${report.actions.length}  ${at(NAMES[action.pillar], language)}  |  ${action.kind === "observed_fix" ? (fr ? "CONSTAT" : "OBSERVED") : (fr ? "À CONNECTER" : "CONDITIONAL")}`, x, y + 10, { width: w });
    pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(12).text(text(g.title, 120), x, y + 26, { width: w });
    pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(8)
      .text(`${fr ? "Priorité" : "Priority"}: ${at(PRIORITIES[action.priority] || PRIORITIES.medium, language)}  |  ${fr ? "Responsable" : "Owner"}: ${at(OWNERS[action.owner] || OWNERS.technical, language)}  |  ${fr ? "Risque" : "Risk"}: ${action.risk}`, x, y + 46, { width: w });
    pdf.fillColor(PALETTE.ink).font("Helvetica").fontSize(8.1).text(body.join("\n"), x, y + 63, { width: w, lineGap: 2 });
    y += h + 13;
  }
  if (y > 688) { pdf.addPage(); y = 65; }
  pdf.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(13).text(fr ? "Méthode et limites" : "Method and limitations", left, y + 12);
  pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(9).text(fr
    ? "Source : lecture HTTP d'une page et grille GEO v2 de 42 contrôles avec inconnues distinctes. L'aperçu est reconstitué, sans capture d'écran réelle. Aucune citation IA, conversion CRM, backlink entrant ni amélioration avant/après n'est déduite. La publication d'un score exige l'accord du propriétaire."
    : "Source: one HTTP page read and the 42-control GEO v2 grid with explicit unknowns. The preview is reconstructed, not an actual screenshot. No AI citation, CRM conversion, inbound backlink or before/after improvement is inferred. Publishing a score requires owner consent.", left, y + 40, { width: usable, lineGap: 3 });

  const pages = pdf.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    pdf.switchToPage(i);
    pdf.strokeColor(PALETTE.line).lineWidth(0.7).moveTo(left, 776).lineTo(width - left, 776).stroke();
    pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(7.5)
      .text(`${name} | ${report.method}`, left, 784, { height: 11, lineBreak: false });
    pdf.text(`${i + 1} / ${pages.count}`, width - 85, 784, { width: 42, height: 11, align: "right", lineBreak: false });
  }
  pdf.end();
  return completed;
}
