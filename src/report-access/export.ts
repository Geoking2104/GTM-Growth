/** A4 PDF and plain Markdown exports from the exact saved public snapshot. */
import PDFDocument from "pdfkit";
import type { FreeReport360, ReportAction, ReportPillarId } from "../freeread/report360.js";
import type { ReportLanguage } from "./service.js";

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

export function actionGuide(action: ReportAction, lang: ReportLanguage): { title: string; why: string; steps: [string, string, string]; verify: string } {
  const fr = lang === "fr";
  const title = ACTION_TITLES[action.code] ? at(ACTION_TITLES[action.code], lang) : (fr ? `Examiner le contrôle ${clean(action.checkId, 80)}` : `Review control ${clean(action.checkId, 80)}`);
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

export function renderReportMarkdown(report: FreeReport360, language: ReportLanguage): string {
  const fr = language === "fr";
  const out: string[] = [
    `# GTM Growth - ${fr ? "Rapport gratuit 360°" : "Free 360° report"}`,
    "",
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
    const measurement = p.score !== null ? `${p.score}/100 (GEO v1)` : p.id === "seo" ? `${p.observedChecks ?? "-"} ${fr ? "contrôles" : "checks"}; ${p.needsAttention ?? "-"} ${fr ? "à revoir" : "to review"}` : p.id === "social" ? `${p.observedCount ?? "-"} ${fr ? "liens de profils sortants" : "outbound profile links"}` : (fr ? "non mesuré" : "not measured");
    out.push(`| ${at(NAMES[p.id], language)} | ${p.coverage} | ${measurement} |`);
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
  out.push(fr ? "Aucun moteur IA ou compte CRM n'a été interrogé. Les liens entrants, positions et conversions ne sont pas mesurés. Une seconde lecture n'a pas été effectuée : aucun avant/après réel n'est affirmé." : "No AI engine or CRM account was queried. Inbound links, rankings and conversions are not measured. No second observation was made: no real before/after improvement is claimed.");
  return out.join("\n") + "\n";
}

/** Vector-only PDF; one source snapshot, no external image fetch or private data. */
export async function renderReportPdf(report: FreeReport360, language: ReportLanguage): Promise<Buffer> {
  const fr = language === "fr";
  const pdf = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: `GTM Growth - ${fr ? "Rapport" : "Report"} 360`, Subject: "Public page evidence and reviewed actions", Creator: "GTM Growth" } });
  const pieces: Buffer[] = [];
  pdf.on("data", (part: Buffer) => pieces.push(part));
  const completed = new Promise<Buffer>((resolve, reject) => { pdf.on("end", () => resolve(Buffer.concat(pieces))); pdf.on("error", reject); });
  const width = pdf.page.width, left = 42, usable = width - 84;
  const text = (v: unknown, max = 450): string => clean(v, max);
  const drawText = (value: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}) => pdf.text(value, x, y, { width: usable, ...options });

  pdf.rect(0, 0, width, 170).fill("#281649");
  pdf.fillColor(PALETTE.white).font("Helvetica-Bold").fontSize(12).text("GTM Growth", left, 39);
  pdf.fontSize(27).text(fr ? "Rapport gratuit 360" : "Free 360 report", left, 75, { width: usable });
  pdf.fillColor("#DFD2FF").font("Helvetica").fontSize(10).text(fr ? "Un diagnostic public expliqué, sourcé et actionnable" : "Public evidence with an understandable action plan", left, 121);
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
    const value = p.score !== null ? `${p.score}/100 - GEO v1` : p.id === "seo" ? `${p.observedChecks ?? "-"} ${fr ? "contrôles" : "checks"}` : p.id === "social" ? `${p.observedCount ?? "-"} ${fr ? "liens sortants" : "outbound links"}` : (fr ? "Non mesuré" : "Not measured");
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
    ? "Source : lecture HTTP d'une seule page. GEO v1 mesure une préparation. Aucune citation réelle des moteurs IA, conversion CRM, backlink entrant ni mesure avant/après n'est déduite. Toute publication exige l'accord du propriétaire."
    : "Source: a single public HTTP page read. GEO v1 measures readiness. Real AI citations, CRM conversions, inbound backlinks and before/after results are not inferred. Publishing requires owner approval.", left, y + 40, { width: usable, lineGap: 3 });

  const pages = pdf.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    pdf.switchToPage(i);
    pdf.strokeColor(PALETTE.line).lineWidth(0.7).moveTo(left, 776).lineTo(width - left, 776).stroke();
    pdf.fillColor(PALETTE.muted).font("Helvetica").fontSize(7.5)
      .text(`GTM Growth | ${report.method}`, left, 784, { height: 11, lineBreak: false });
    pdf.text(`${i + 1} / ${pages.count}`, width - 85, 784, { width: 42, height: 11, align: "right", lineBreak: false });
  }
  pdf.end();
  return completed;
}
