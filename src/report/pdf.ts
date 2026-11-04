/**
 * Client-ready GEO report as a PDF.
 *
 * Pure Node: pdfkit draws everything (text, bars, chips, pictograms) — no
 * headless browser, no Python, so it works in CI and on any machine that can
 * run the CLI. The layout is deliberately plain-language: a sales reader gets
 * the score and the plan on the first two pages, an engineer gets the evidence
 * tables afterwards.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import type { GeoAuditResult } from "../geo/types.js";
import type { PlatformReadiness } from "../geo/platforms.js";
import type { CitabilityResult } from "../geo/citability.js";
import {
  citabilityHeight,
  drawBandLadder,
  drawCategoryBars,
  drawCitability,
  drawEntityGraph,
  drawRadar,
  drawTrajectory,
  trajectorySeries,
} from "./charts.js";

export interface PdfReportInput {
  audit: GeoAuditResult;
  platforms?: PlatformReadiness[];
  citability?: CitabilityResult;
  outPath: string;
  generatedAt?: Date;
  brandName?: string;
  contactUrl?: string;
  /** PNG mark embedded on the cover; falls back to a drawn monogram. */
  logoPath?: string;
}

export interface PdfReportResult {
  path: string;
  bytes: number;
  pages: number;
}

const PAGE = { width: 595.28, height: 841.89 };
const M = 46;
const CONTENT = PAGE.width - M * 2;

const C = {
  ink: "#0B1220",
  ink2: "#1B2637",
  muted: "#5A6B83",
  muted2: "#8494A9",
  line: "#E2E8F2",
  bg: "#F5F7FB",
  white: "#FFFFFF",
  brand: "#2563EB",
  teal: "#0EA5B7",
  green: "#12B76A",
  amber: "#F79009",
  red: "#D92D20",
  violet: "#7C3AED",
};

type Doc = PDFKit.PDFDocument;

/** Standard PDF fonts are WinAnsi: replace glyphs they cannot draw. */
function safe(text: string): string {
  return String(text)
    .replace(/\u2192/g, "to")
    .replace(/\u2190/g, "from")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/\u2248/g, "~")
    .replace(/\u00d7/g, "x")
    .replace(/\u00f7/g, "/")
    .replace(/\u2212/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function bandColor(score: number): string {
  if (score >= 80) return C.green;
  if (score >= 60) return C.amber;
  return C.red;
}

function pctColor(points: number, max: number): string {
  if (max === 0) return C.muted2;
  const ratio = points / max;
  if (ratio >= 0.99) return C.green;
  if (ratio >= 0.6) return C.amber;
  return C.red;
}

/** Vector pictograms — no icon font, no external asset. */
function icon(doc: Doc, name: string, x: number, y: number, size: number, color: string): void {
  const s = size;
  doc.save().strokeColor(color).fillColor(color).lineWidth(Math.max(1.2, s * 0.11)).lineCap("round").lineJoin("round");
  switch (name) {
    case "search":
      doc.circle(x + s * 0.42, y + s * 0.42, s * 0.28).stroke();
      doc.moveTo(x + s * 0.62, y + s * 0.62).lineTo(x + s * 0.88, y + s * 0.88).stroke();
      break;
    case "bars":
      doc.rect(x + s * 0.1, y + s * 0.55, s * 0.16, s * 0.35).fill();
      doc.rect(x + s * 0.38, y + s * 0.3, s * 0.16, s * 0.6).fill();
      doc.rect(x + s * 0.66, y + s * 0.45, s * 0.16, s * 0.45).fill();
      break;
    case "layers":
      doc.moveTo(x + s * 0.5, y + s * 0.12).lineTo(x + s * 0.9, y + s * 0.32).lineTo(x + s * 0.5, y + s * 0.52).lineTo(x + s * 0.1, y + s * 0.32).closePath().stroke();
      doc.moveTo(x + s * 0.1, y + s * 0.52).lineTo(x + s * 0.5, y + s * 0.72).lineTo(x + s * 0.9, y + s * 0.52).stroke();
      break;
    case "list":
      for (let i = 0; i < 3; i++) {
        doc.circle(x + s * 0.16, y + s * (0.25 + i * 0.25), s * 0.055).fill();
        doc.moveTo(x + s * 0.34, y + s * (0.25 + i * 0.25)).lineTo(x + s * 0.9, y + s * (0.25 + i * 0.25)).stroke();
      }
      break;
    case "shield":
      doc.moveTo(x + s * 0.5, y + s * 0.1).lineTo(x + s * 0.86, y + s * 0.26).lineTo(x + s * 0.86, y + s * 0.52).quadraticCurveTo(x + s * 0.86, y + s * 0.82, x + s * 0.5, y + s * 0.92).quadraticCurveTo(x + s * 0.14, y + s * 0.82, x + s * 0.14, y + s * 0.52).lineTo(x + s * 0.14, y + s * 0.26).closePath().stroke();
      break;
    case "spark":
      doc.moveTo(x + s * 0.5, y + s * 0.08).lineTo(x + s * 0.6, y + s * 0.4).lineTo(x + s * 0.92, y + s * 0.5).lineTo(x + s * 0.6, y + s * 0.6).lineTo(x + s * 0.5, y + s * 0.92).lineTo(x + s * 0.4, y + s * 0.6).lineTo(x + s * 0.08, y + s * 0.5).lineTo(x + s * 0.4, y + s * 0.4).closePath().fill();
      break;
    case "check":
      doc.moveTo(x + s * 0.15, y + s * 0.55).lineTo(x + s * 0.4, y + s * 0.78).lineTo(x + s * 0.85, y + s * 0.22).stroke();
      break;
    case "alert":
      doc.moveTo(x + s * 0.5, y + s * 0.1).lineTo(x + s * 0.92, y + s * 0.85).lineTo(x + s * 0.08, y + s * 0.85).closePath().stroke();
      doc.moveTo(x + s * 0.5, y + s * 0.38).lineTo(x + s * 0.5, y + s * 0.62).stroke();
      doc.circle(x + s * 0.5, y + s * 0.73, s * 0.035).fill();
      break;
    case "target":
      doc.circle(x + s * 0.5, y + s * 0.5, s * 0.36).stroke();
      doc.circle(x + s * 0.5, y + s * 0.5, s * 0.18).stroke();
      doc.circle(x + s * 0.5, y + s * 0.5, s * 0.04).fill();
      break;
    case "bot":
      doc.roundedRect(x + s * 0.16, y + s * 0.3, s * 0.68, s * 0.5, s * 0.12).stroke();
      doc.moveTo(x + s * 0.5, y + s * 0.3).lineTo(x + s * 0.5, y + s * 0.14).stroke();
      doc.circle(x + s * 0.5, y + s * 0.11, s * 0.04).fill();
      doc.circle(x + s * 0.38, y + s * 0.55, s * 0.045).fill();
      doc.circle(x + s * 0.62, y + s * 0.55, s * 0.045).fill();
      break;
    default:
      doc.circle(x + s * 0.5, y + s * 0.5, s * 0.35).stroke();
  }
  doc.restore();
}

function heading(doc: Doc, y: number, eyebrow: string, title: string, iconName: string): number {
  icon(doc, iconName, M, y - 2, 16, C.brand);
  doc.fillColor(C.brand).font("Helvetica-Bold").fontSize(8).text(eyebrow.toUpperCase(), M + 24, y + 1, {
    characterSpacing: 1.1,
  });
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(19).text(title, M, y + 24, { width: CONTENT });
  return y + 30 + doc.heightOfString(title, { width: CONTENT }) + 10;
}

function paragraph(doc: Doc, text: string, y: number, options: { size?: number; color?: string; width?: number } = {}): number {
  const size = options.size ?? 9.5;
  const width = options.width ?? CONTENT;
  const content = safe(text);
  doc.font("Helvetica").fontSize(size).fillColor(options.color ?? C.ink2);
  const height = doc.heightOfString(content, { width, lineGap: 2 });
  doc.text(content, M, y, { width, lineGap: 2 });
  return y + height + 8;
}

function chip(doc: Doc, text: string, x: number, y: number, color: string, filled = true): number {
  doc.font("Helvetica-Bold").fontSize(7.5);
  const label = text.toUpperCase();
  // Drawn with characterSpacing 0.6: measure what is actually rendered.
  const w = doc.widthOfString(label) + label.length * 0.6 + 14;
  doc.save();
  if (filled) {
    doc.roundedRect(x, y, w, 16, 8).fill(color);
    doc.fillColor(C.white).text(text.toUpperCase(), x + 7, y + 4.5, { characterSpacing: 0.6 });
  } else {
    doc.roundedRect(x, y, w, 16, 8).lineWidth(1).strokeColor(color).stroke();
    doc.fillColor(color).text(text.toUpperCase(), x + 7, y + 4.5, { characterSpacing: 0.6 });
  }
  doc.restore();
  return w;
}

function bar(doc: Doc, x: number, y: number, width: number, ratio: number, color: string, height = 6): void {
  doc.save();
  doc.roundedRect(x, y, width, height, height / 2).fill(C.line);
  const filled = Math.max(ratio > 0 ? 3 : 0, Math.min(width, width * ratio));
  if (filled > 0) doc.roundedRect(x, y, filled, height, height / 2).fill(color);
  doc.restore();
}

function card(doc: Doc, x: number, y: number, width: number, height: number, fill = C.white, stroke = C.line): void {
  doc.save();
  doc.roundedRect(x, y, width, height, 10).lineWidth(1).fillAndStroke(fill, stroke);
  doc.restore();
}

function footer(doc: Doc, page: number, total: number, brand: string): void {
  const previousBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save();
  doc.strokeColor(C.line).lineWidth(0.8).moveTo(M, PAGE.height - 40).lineTo(PAGE.width - M, PAGE.height - 40).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(C.muted2);
  doc.text(brand, M, PAGE.height - 32, { width: 300, lineBreak: false });
  doc.text(`Page ${page} of ${total}`, PAGE.width - M - 90, PAGE.height - 32, { width: 90, align: "right", lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = previousBottom;
}

function metricCard(doc: Doc, x: number, y: number, w: number, label: string, value: string, color: string): void {
  card(doc, x, y, w, 58);
  doc.fillColor(color).font("Helvetica-Bold").fontSize(18).text(value, x + 12, y + 10, { width: w - 24 });
  doc.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(label.toUpperCase(), x + 12, y + 36, {
    width: w - 24,
    characterSpacing: 0.7,
  });
}

function cover(doc: Doc, input: PdfReportInput, generatedAt: Date): void {
  const audit = input.audit;
  const brand = input.brandName ?? "GTM Growth";
  const host = new URL(audit.url).hostname.replace(/^www\./, "");

  doc.rect(0, 0, PAGE.width, 318).fill(C.ink);
  doc.save();
  doc.circle(PAGE.width - 80, 40, 120).fill(C.brand);
  doc.circle(PAGE.width - 20, 210, 70).fill(C.teal);
  doc.restore();

  // Logo mark: the shipped PNG when available, otherwise a drawn monogram.
  const defaultLogo = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../assets/logo-128.png");
  const logoPath = input.logoPath ?? defaultLogo;
  if (fs.existsSync(logoPath)) {
    doc.save();
    doc.roundedRect(M, 40, 42, 42, 10).fill(C.white);
    doc.image(logoPath, M + 5, 45, { fit: [32, 32] });
    doc.restore();
  } else {
    doc.save();
    doc.roundedRect(M, 44, 30, 30, 8).fill(C.brand);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(16).text("G", M + 8, 52);
    doc.restore();
  }

  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(28).text("GEO readiness report", M, 110, { width: 420 });
  doc.fillColor("#B9C8E6").font("Helvetica").fontSize(11).text(host, M, 150, { width: 420 });
  doc.fillColor("#93A6C9").fontSize(8.5).text(
    `Snapshot ${generatedAt.toISOString().slice(0, 10)} · ${brand} · 8 categories · 100 points`,
    M,
    168,
    { width: 420 }
  );

  // Score card
  const cardY = 232;
  card(doc, M, cardY, CONTENT, 190);
  doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(8).text("OVERALL SCORE", M + 24, cardY + 24, {
    characterSpacing: 1,
  });
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(56).text(String(audit.score), M + 20, cardY + 40, {
    width: 160,
  });
  doc.fillColor(C.muted).font("Helvetica").fontSize(9).text("out of 100", M + 24, cardY + 104);

  chip(doc, audit.band, M + 130, cardY + 48, bandColor(audit.score));

  doc.fillColor(C.muted).font("Helvetica").fontSize(8).text("Projected after all fixes", M + 130, cardY + 78, {
    width: 160,
  });
  doc.fillColor(bandColor(audit.projectedScore)).font("Helvetica-Bold").fontSize(20).text(
    `${audit.projectedScore}/100`,
    M + 130,
    cardY + 92,
    { width: 160 }
  );
  doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(`${audit.recoverablePoints} points recoverable`, M + 130, cardY + 120);

  // Right side of the card: category mini bars
  const x = M + 290;
  let y = cardY + 26;
  for (const key of Object.keys(audit.scoreBreakdown) as Array<keyof typeof audit.scoreBreakdown>) {
    const points = audit.scoreBreakdown[key];
    const max = audit.scoreMax[key];
    doc.fillColor(C.muted).font("Helvetica").fontSize(7).text(key.replace("_", " "), x, y, { width: 76 });
    bar(doc, x + 80, y + 1, 84, max ? points / max : 0, pctColor(points, max), 5);
    doc.fillColor(C.ink2).font("Helvetica-Bold").fontSize(7).text(`${points}/${max}`, x + 168, y, { width: 30, align: "right" });
    y += 15;
  }

  doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(
    "Prepared for the site owner. Public data only — no analytics credentials were used for this audit.",
    M,
    444,
    { width: CONTENT - 60, lineGap: 2 }
  );

  const kpiY = 520;
  const kpiW = (CONTENT - 24) / 3;
  metricCard(doc, M, kpiY, kpiW, "Recoverable points", String(audit.recoverablePoints), C.brand);
  metricCard(doc, M + kpiW + 12, kpiY, kpiW, "Citability", input.citability ? `${input.citability.score}/100` : "n/a", C.violet);
  const ready = input.platforms?.filter((p) => p.band === "ready").length ?? 0;
  metricCard(doc, M + (kpiW + 12) * 2, kpiY, kpiW, "Platforms ready", `${ready}/${input.platforms?.length ?? 0}`, C.teal);

  doc.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(
    "What follows: the three findings that cost the most points, the category and platform tables, the citability method results, then the ordered fix plan with its projected score.",
    M,
    610,
    { width: CONTENT, lineGap: 2 }
  );

  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(10).text(brand, M, 760);
  doc.fillColor(C.muted2).font("Helvetica").fontSize(8).text(input.contactUrl ?? "", M, 774, { width: CONTENT });
}

function dashboardPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  const audit = input.audit;
  let y = M;

  y = heading(doc, y, "Dashboard", "The numbers, on one page", "bars");

  const series = trajectorySeries(audit);
  const fixes = series.length - 1;
  y = paragraph(
    doc,
    `${audit.score}/100 today, ${audit.projectedScore}/100 once all ${fixes} fixes ship. The curve below adds them in the order the engine ranks them; the bars show which categories hold the ${audit.recoverablePoints} recoverable points.`,
    y
  );

  const top = [
    { label: "Today", value: `${audit.score}`, color: C.brand },
    { label: "Projected", value: `${audit.projectedScore}`, color: C.green },
    { label: "Recoverable", value: `${audit.recoverablePoints}`, color: C.violet },
  ];
  const cardW = (CONTENT - 20) / 3;
  top.forEach((item, index) => {
    metricCard(doc, M + index * (cardW + 10), y, cardW, item.label, item.value, item.color);
  });
  y += 68;

  drawTrajectory(doc, { x: M, y, width: CONTENT, height: 146 }, audit);
  y += 158;

  const halfW = (CONTENT - 12) / 2;
  drawCategoryBars(doc, { x: M, y, width: halfW, height: 172 }, audit);
  if (input.platforms?.length) {
    drawRadar(doc, { x: M + halfW + 12, y, width: halfW, height: 172 }, input.platforms);
  }
  y += 184;

  if (input.citability) {
    const extra = citabilityHeight(input.citability);
    drawCitability(doc, { x: M, y, width: CONTENT, height: extra }, input.citability);
    y += extra + 14;
  }

  if (y + 96 < 780) {
    drawBandLadder(doc, { x: M, y, width: CONTENT, height: 92 }, audit);
  }
}

function entityPage(doc: Doc, input: PdfReportInput): void {
  const schema = input.audit.details?.schema;
  if (!schema) return;
  doc.addPage();
  let y = M;

  y = heading(doc, y, "Ontology", "Entity graph — what an engine can resolve", "target");
  y = paragraph(
    doc,
    "A model answers with entities, not pages. This graph is what the JSON-LD on the audited page lets an engine connect: the organisation, its site, the app and the FAQ on the left; the identities that disambiguate it on the right.",
    y
  );

  drawEntityGraph(
    doc,
    { x: M, y, width: CONTENT, height: 150 },
    {
      foundTypes: schema.foundTypes,
      hasArticle: schema.hasArticle,
      hasSameAs: schema.hasSameAs,
      hasDateModified: schema.hasDateModified,
    }
  );
  y += 162;

  if (!schema.hasSameAs) {
    const snippet = [
      '{',
      '  "@type": "Organization",',
      '  "name": "Your brand",',
      '  "url": "https://example.com",',
      '  "sameAs": [',
      '    "https://www.wikidata.org/wiki/Q000000",',
      '    "https://en.wikipedia.org/wiki/Your_brand",',
      '    "https://www.linkedin.com/company/your-brand"',
      '  ]',
      '}',
    ].join("\n");
    card(doc, M, y, CONTENT, 106, "#0B1220", "#0B1220");
    doc
      .fillColor("#93C5FD")
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .text("THE ONE BLOCK THAT UNLOCKS THE RIGHT COLUMN", M + 14, y + 10, {
        width: CONTENT - 28,
        characterSpacing: 0.8,
      });
    doc
      .fillColor("#E5EDFF")
      .font("Courier")
      .fontSize(6.6)
      .text(snippet, M + 14, y + 24, { width: CONTENT - 28, lineGap: 0.6 });
    y += 118;
  }

  const gaps: [string, string, number][] = [
    ["sameAs links", "Wikipedia, Wikidata, LinkedIn, Crunchbase — the pillars that tie the name to a Knowledge Graph node.", 3],
    ["Article schema", "headline, author, datePublished, dateModified on editorial pages.", 3],
    ["Named author", "A Person node with a URL, so a passage has a who behind it.", 1],
  ];
  for (const [name, why, points] of gaps) {
    card(doc, M, y, CONTENT, 44);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(9).text(name, M + 14, y + 10, { width: 120 });
    doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(why, M + 138, y + 10, { width: CONTENT - 200, lineGap: 1.2 });
    chip(doc, `+${points} pts`, M + CONTENT - 66, y + 12, C.brand);
    y += 52;
  }

  y += 4;
  card(doc, M, y, CONTENT, 62, C.bg, C.line);
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(8.5).text("Why this matters commercially", M + 14, y + 12);
  doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(
    "Without a resolved entity, an assistant has to guess which company a passage belongs to — and it usually guesses by omitting the name. Entity work is what turns a quotable passage into an attributed one.",
    M + 14,
    y + 26,
    { width: CONTENT - 28, lineGap: 1.4 }
  );
  y += 74;

  doc.fillColor(C.brand).font("Helvetica-Bold").fontSize(7).text("PATH TO A RESOLVED ENTITY", M, y, {
    characterSpacing: 0.9,
  });
  y += 16;

  const steps: [string, string][] = [
    ["1", "Add sameAs to Organization — Wikipedia, Wikidata, LinkedIn, Crunchbase. One block, four URLs."],
    ["2", "Publish Article or BlogPosting on editorial pages, with headline and dateModified."],
    ["3", "Name a Person author with a URL, and link it from the Article."],
    ["4", "Re-run the audit: sameAs and Article move brand & entity and schema, worth up to 7 points."],
  ];
  for (const [number, step] of steps) {
    doc.circle(M + 7, y + 5, 7).fill(C.brand);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.5).text(number, M + 2, y + 2.5, { width: 10, align: "center" });
    doc.fillColor(C.ink2).font("Helvetica").fontSize(8).text(safe(step), M + 22, y, { width: CONTENT - 32, lineGap: 1.2 });
    y += doc.heightOfString(safe(step), { width: CONTENT - 32, lineGap: 1.2 }) + 9;
  }
}

function summaryPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  const audit = input.audit;
  let y = M;

  y = heading(doc, y, "Executive summary", "What this audit found", "search");
  y = paragraph(
    doc,
    `${new URL(audit.url).hostname} scores ${audit.score}/100 (${audit.band}). Fixing every failing check would reach ${audit.projectedScore}/100 — ${audit.recoverablePoints} points are on the table, and the plan later in this report captures them in priority order.`,
    y
  );

  const findings = audit.recommendations.slice(0, 3);
  for (const finding of findings) {
    const color = finding.priority === "critical" ? C.red : finding.priority === "high" ? C.amber : C.brand;
    card(doc, M, y, CONTENT, 64);
    icon(doc, finding.priority === "low" ? "check" : "alert", M + 14, y + 16, 16, color);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(9.5).text(
      `${finding.checkId} · +${finding.points} points`,
      M + 40,
      y + 12,
      { width: CONTENT - 60 }
    );
    doc.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(safe(finding.action), M + 40, y + 26, {
      width: CONTENT - 60,
      lineGap: 1.5,
      height: 32,
      ellipsis: true,
    });
    chip(doc, finding.priority, M + CONTENT - 82, y + 12, color);
    y += 74;
  }

  y += 6;
  y = heading(doc, y, "Coverage", "What was checked", "list");
  const checked = [
    "Homepage HTML, metadata and JSON-LD types",
    "robots.txt against 27 AI crawlers, by tier",
    "llms.txt links compared with the sitemap",
    "12 citability methods with per-method evidence",
    "Hidden text, LLM instructions, thin copy, stuffing",
    "Five-engine readiness: AI Overviews, ChatGPT, Perplexity, Gemini, Copilot",
  ];
  for (const item of checked) {
    icon(doc, "check", M + 2, y + 2, 12, C.green);
    doc.fillColor(C.ink2).font("Helvetica").fontSize(9).text(item, M + 22, y, { width: CONTENT - 30 });
    y += 18;
  }

  y += 8;
  card(doc, M, y, CONTENT, 52, C.bg, C.line);
  icon(doc, "shield", M + 14, y + 12, 18, C.teal);
  doc.fillColor(C.ink2).font("Helvetica").fontSize(8.5).text(
    "Read-only audit: public URLs only. No Google credentials, no writes to the site, GA4 or GTM.",
    M + 42,
    y + 14,
    { width: CONTENT - 60, lineGap: 1.5 }
  );
}

function categoriesPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  let y = M;
  y = heading(doc, y, "Score detail", "Score by category", "bars");
  y = paragraph(doc, "Each bar is the category's earned points over its maximum. Colour follows the same rule as the overall band.", y, {
    size: 8.5,
    color: C.muted,
  });

  const labels: Record<string, string> = {
    robots: "robots.txt",
    llms: "llms.txt",
    schema: "Schema JSON-LD",
    meta: "Meta tags",
    content: "Content",
    brand_entity: "Brand & entity",
    signals: "Signals",
    ai_discovery: "AI discovery",
  };

  for (const key of Object.keys(input.audit.scoreBreakdown)) {
    const points = input.audit.scoreBreakdown[key as keyof typeof input.audit.scoreBreakdown];
    const max = input.audit.scoreMax[key as keyof typeof input.audit.scoreMax];
    const color = pctColor(points, max);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(9).text(labels[key] ?? key, M, y, { width: 120 });
    doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(`${points}/${max}`, M + 122, y + 1, { width: 42 });
    bar(doc, M + 168, y + 2, 250, max ? points / max : 0, color, 8);
    doc.fillColor(color).font("Helvetica-Bold").fontSize(7).text(
      points === max ? "complete" : points === 0 ? "missing" : "partial",
      M + 426,
      y,
      { width: 70 }
    );
    y += 26;
    doc.strokeColor(C.line).lineWidth(0.6).moveTo(M, y - 8).lineTo(M + CONTENT, y - 8).stroke();
  }

  y += 6;
  y = heading(doc, y, "Read this first", "What the numbers mean", "target");
  const notes = [
    ["robots.txt", "Whether AI crawlers may fetch the site — and whether the citation bots have their own rule."],
    ["llms.txt", "Whether a machine-readable index exists, with sections, links and enough depth."],
    ["Schema", "Whether the entity and its pages are described in JSON-LD an engine can parse."],
    ["Brand & entity", "Whether the name, descriptions and sameAs links agree across the page."],
    ["AI discovery", "Whether /.well-known/ai.txt and /ai/*.json exist for agent routing."],
  ];
  for (const [name, meaning] of notes) {
    doc.fillColor(C.brand).font("Helvetica-Bold").fontSize(8.5).text(name, M, y, { width: 100 });
    doc.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(meaning, M + 106, y, { width: CONTENT - 110, lineGap: 1.5 });
    y += 22;
  }
}

function platformsPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  let y = M;
  y = heading(doc, y, "Platform readiness", "Five engines, five verdicts", "bot");
  y = paragraph(
    doc,
    "Derived from the same evidence: crawler rules, llms.txt, schema, structure and freshness. A platform score is not a claim that the engine cites the page — it is the readiness of the signals that engine uses.",
    y,
    { size: 8.5, color: C.muted }
  );

  for (const platform of input.platforms ?? []) {
    card(doc, M, y, CONTENT, 58);
    icon(doc, platform.id === "chatgpt" || platform.id === "copilot" ? "bot" : "search", M + 12, y + 16, 16, C.brand);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(10).text(platform.label, M + 38, y + 12, { width: 220 });
    doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(`Main gap: ${safe(platform.mainGap)}`, M + 38, y + 28, {
      width: CONTENT - 160,
      lineGap: 1.2,
      height: 20,
      ellipsis: true,
    });
    bar(doc, M + 260, y + 20, 150, platform.score / 100, bandColor(platform.score), 8);
    doc.fillColor(bandColor(platform.score)).font("Helvetica-Bold").fontSize(12).text(`${platform.score}`, M + 418, y + 16, {
      width: 40,
      align: "right",
    });
    chip(doc, platform.band, M + 464, y + 16, bandColor(platform.score));
    y += 66;
  }
}

function citabilityPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  let y = M;
  const cit = input.citability;
  y = heading(doc, y, "Citability", "Would an answer engine quote this page?", "spark");
  if (!cit) {
    y = paragraph(doc, "No citability run was attached to this report.", y);
    return;
  }
  y = paragraph(
    doc,
    `Citability scores ${cit.score}/100 across 12 methods. Strengths: ${cit.strengths.slice(0, 3).join(", ") || "none"}. Gaps: ${cit.gaps.slice(0, 4).join(", ") || "none"}.`,
    y,
    { size: 8.5, color: C.muted }
  );

  for (const method of cit.methods) {
    const color = pctColor(method.points, method.max);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(8.5).text(method.label, M, y, { width: 200 });
    doc.fillColor(color).font("Helvetica-Bold").fontSize(7.5).text(`${method.points}/${method.max}`, M + 206, y, {
      width: 34,
      align: "right",
    });
    bar(doc, M, y + 12, 200, method.max ? method.points / method.max : 0, color, 5);
    doc.fillColor(C.muted).font("Helvetica").fontSize(7).text(safe(method.evidence), M + 248, y + 1, {
      width: CONTENT - 248,
      height: 20,
      ellipsis: true,
    });
    y += 28;
  }

  y += 4;
  card(doc, M, y, CONTENT, 54, C.bg, C.line);
  icon(doc, "alert", M + 14, y + 14, 16, C.amber);
  doc.fillColor(C.ink2).font("Helvetica").fontSize(8.5).text(
    `Biggest citability gaps: ${cit.gaps.slice(0, 4).join(", ")}. Fixing quotations, structure and question headings usually moves this score fastest.`,
    M + 40,
    y + 14,
    { width: CONTENT - 56, lineGap: 1.5 }
  );
}

function actionsPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  let y = M;
  y = heading(doc, y, "Action plan", "In priority order, with points", "list");
  y = paragraph(
    doc,
    "Priority bucket first, then recoverable points. Points are exact: they are the gap between what a check awards today and its maximum.",
    y,
    { size: 8.5, color: C.muted }
  );

  const rows = input.audit.recommendations.slice(0, 12);
  const colX = [M, M + 20, M + 86, M + 216, M + 248];
  doc.fillColor(C.muted2).font("Helvetica-Bold").fontSize(7).text("#", colX[0], y);
  doc.text("PRIORITY", colX[1], y);
  doc.text("CHECK", colX[2], y);
  doc.text("+PTS", colX[3], y);
  doc.text("ACTION", colX[4], y);
  y += 14;
  doc.strokeColor(C.line).lineWidth(0.6).moveTo(M, y).lineTo(M + CONTENT, y).stroke();
  y += 6;

  rows.forEach((row, index) => {
    const color = row.priority === "critical" ? C.red : row.priority === "high" ? C.amber : row.priority === "medium" ? C.brand : C.muted;
    doc.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(String(index + 1), colX[0], y + 1);
    chip(doc, row.priority, colX[1], y - 2, color);
    doc.fillColor(C.ink2).font("Helvetica").fontSize(7.5).text(row.checkId, colX[2], y + 1, { width: 122 });
    doc.fillColor(color).font("Helvetica-Bold").fontSize(8).text(String(row.points), colX[3], y + 1, { width: 26 });
    doc.font("Helvetica").fontSize(7.5);
    const actionText = safe(row.action);
    const actionHeight = doc.heightOfString(actionText, { width: CONTENT - 250, lineGap: 1 });
    doc.fillColor(C.ink2).text(actionText, colX[4], y, {
      width: CONTENT - 250,
      lineGap: 1,
    });
    y += Math.max(20, actionHeight + 8);
    doc.strokeColor(C.line).lineWidth(0.5).moveTo(M, y - 4).lineTo(M + CONTENT, y - 4).stroke();
  });

  y += 8;
  card(doc, M, y, CONTENT, 48, C.bg, C.line);
  icon(doc, "spark", M + 14, y + 12, 18, C.brand);
  const topSix = input.audit.recommendations.slice(0, 6).reduce((sum, row) => sum + row.points, 0);
  doc.fillColor(C.ink2).font("Helvetica-Bold").fontSize(9).text(
    `Top six fixes: ${input.audit.score} to ${Math.min(100, input.audit.score + topSix)}/100. All fixes: ${input.audit.projectedScore}/100.`,
    M + 42,
    y + 14,
    { width: CONTENT - 60 }
  );
  doc.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(
    "Deterministic score: re-running the same snapshot reproduces these numbers exactly.",
    M + 42,
    y + 28,
    { width: CONTENT - 60 }
  );
}

function closingPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  let y = M;
  y = heading(doc, y, "Method & limits", "How this report was produced", "shield");

  const blocks: Array<[string, string]> = [
    ["Source", "Public HTML of the audited URL, its robots.txt, llms.txt, sitemap and AI discovery endpoints. No credentials, no analytics data."],
    ["Scoring", "Eight weighted categories, 100 points. Every point belongs to a check with its own evidence. Projection = current score + all recoverable points, capped at 100."],
    ["Citability", "12 content methods (statistics, quotations, structure, question headings, answer-first, paragraph and sentence length, citations, authorship, freshness, FAQ, entity clarity)."],
    ["Platforms", "Readiness mapping per engine, not a citation measurement. No LLM provider is queried."],
    ["Limits", "JavaScript-rendered content is not executed. Drift reads up to 20 sub-sitemaps. Positioning and mentions outside the page are out of scope."],
  ];
  for (const [name, text] of blocks) {
    doc.fillColor(C.brand).font("Helvetica-Bold").fontSize(8.5).text(name.toUpperCase(), M, y, { width: 90, characterSpacing: 0.6 });
    doc.font("Helvetica").fontSize(8.5);
    const h = doc.heightOfString(text, { width: CONTENT - 104, lineGap: 2 });
    doc.fillColor(C.ink2).text(text, M + 100, y, { width: CONTENT - 104, lineGap: 2 });
    y += h + 14;
  }

  y += 10;
  doc.roundedRect(M, y, CONTENT, 110, 12).fill(C.ink);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(13).text("Turn this report into a plan", M + 22, y + 20, {
    width: CONTENT - 44,
  });
  doc.fillColor("#B9C8E6").font("Helvetica").fontSize(9).text(
    "The same engine can re-audit after each fix, compare the score month over month, and audit the GTM container that measures the traffic.",
    M + 22,
    y + 42,
    { width: CONTENT - 44, lineGap: 2 }
  );
  doc.fillColor("#93A6C9").font("Helvetica").fontSize(8).text(input.contactUrl ?? "", M + 22, y + 82, {
    width: CONTENT - 44,
  });

  doc.fillColor(C.muted2).font("Helvetica").fontSize(7.5).text(
    "Generated by gtm-growth. Not affiliated with Google. GEO rubric adapted from the MIT-licensed geo-optimizer-skill model.",
    M,
    PAGE.height - 80,
    { width: CONTENT, lineGap: 1.5 }
  );
}

/**
 * The console, drawn as a wireframe. A screenshot would age; a schematic shows
 * the reader where each number lives and why it is there.
 */
function consolePage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  const audit = input.audit;
  let y = M;

  y = heading(doc, y, "How to read", "The console, panel by panel", "bars");
  y = paragraph(
    doc,
    "The analysis console puts five sources on one screen: the GEO audit, citability, IndexNow, Search Console and the tracking layer. Its five tabs share one rule — every number points back to a check in this report, so a reader can audit the audit.",
    y
  );

  // ── Wireframe ────────────────────────────────────────────────────────
  const w = CONTENT;
  const h = 236;
  const top = y + 4;
  card(doc, M, top, w, h, "#FFFFFF", C.line);

  // Tab strip
  const tabs = ["Overview", "GEO", "Search", "IndexNow", "Tracking"];
  const tabW = w / tabs.length;
  doc.save();
  doc.rect(M, top, w, 22).fill("#F7F7F9");
  for (let i = 0; i < tabs.length; i += 1) {
    const tx = M + i * tabW;
    if (i === 0) doc.rect(tx, top, tabW, 22).fill(C.white);
    doc.strokeColor(C.line).lineWidth(0.6).moveTo(tx, top).lineTo(tx, top + 22).stroke();
    doc.fillColor(i === 0 ? C.ink : C.muted).font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(6.5).text(tabs[i], tx + 8, top + 8, { width: tabW - 12 });
  }
  doc.restore();

  // Sidebar
  const sideW = 96;
  doc.save();
  doc.rect(M, top + 22, sideW, h - 22).fill("#FAFAFB");
  doc.strokeColor(C.line).lineWidth(0.6).moveTo(M + sideW, top + 22).lineTo(M + sideW, top + h).stroke();
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(6.5).text("opendpe.net", M + 8, top + 32, { width: sideW - 16 });
  doc.fillColor(C.muted).font("Helvetica").fontSize(5.6).text("Track", M + 8, top + 50);
  const items = ["Overview", "GEO", "Citability", "IndexNow"];
  items.forEach((item, index) => {
    const iy = top + 60 + index * 11;
    if (index === 0) doc.roundedRect(M + 4, iy - 2, sideW - 8, 9, 2).fillAndStroke(C.white, C.line);
    doc.fillColor(index === 0 ? C.ink : C.muted).font("Helvetica").fontSize(5.6).text(item, M + 8, iy, { width: sideW - 16 });
  });
  doc.restore();

  // Main: KPI row
  const mainX = M + sideW + 10;
  const mainW = w - sideW - 20;
  const kpis = [
    ["GEO score", "71", "/100"],
    ["Citability", "53", "/100"],
    ["IndexNow", "35", "/100"],
    ["Engines", "3", "/5"],
  ];
  const kpiW = mainW / 4;
  doc.save();
  doc.roundedRect(mainX, top + 30, mainW, 34, 4).lineWidth(0.6).strokeColor(C.line).stroke();
  kpis.forEach(([label, value, unit], index) => {
    const kx = mainX + index * kpiW;
    if (index > 0) doc.strokeColor(C.line).lineWidth(0.5).moveTo(kx, top + 30).lineTo(kx, top + 64).stroke();
    doc.fillColor(C.muted).font("Helvetica").fontSize(5.4).text(label, kx + 6, top + 35, { width: kpiW - 10 });
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(11).text(value, kx + 6, top + 43, { width: kpiW - 10, continued: true });
    doc.fillColor(C.muted).font("Helvetica").fontSize(5.5).text(unit, { continued: false });
  });
  doc.restore();

  // Main: chart + ranking
  const chartW = mainW * 0.62;
  const chartH = 92;
  const chartY = top + 72;
  doc.save();
  doc.roundedRect(mainX, chartY, chartW, chartH, 4).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(5.8).text("Score trajectory", mainX + 6, chartY + 6, { width: chartW - 12 });

  const series: number[] = [];
  let running = audit.score;
  series.push(running);
  for (const rec of audit.recommendations) {
    running += rec.points;
    series.push(running);
  }
  const plotX = mainX + 8;
  const plotW = chartW - 16;
  const plotY = chartY + 18;
  const plotH = chartH - 26;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const xAt = (i: number) => plotX + (i / (series.length - 1)) * plotW;
  const yAt = (v: number) => plotY + plotH - ((v - min) / Math.max(1, max - min)) * plotH;
  doc.strokeColor(C.brand).lineWidth(1.4);
  const line = doc.moveTo(xAt(0), yAt(series[0]));
  series.slice(1).forEach((value, index) => line.lineTo(xAt(index + 1), yAt(value)));
  line.stroke();
  doc.restore();

  // Rank list
  const rankX = mainX + chartW + 8;
  const rankW = mainW - chartW - 8;
  doc.save();
  doc.roundedRect(rankX, chartY, rankW, chartH, 4).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(5.8).text("Engine readiness", rankX + 6, chartY + 6, { width: rankW - 12 });
  const engines: [string, number][] = [
    ["Google AIO", 100],
    ["ChatGPT", 100],
    ["Copilot", 80],
    ["Perplexity", 65],
    ["Gemini", 60],
  ];
  engines.forEach(([name, score], index) => {
    const ry = chartY + 18 + index * 12;
    doc.fillColor(score === 100 ? C.green : C.ink).circle(rankX + 8, ry + 2, 1.6).fill();
    doc.fillColor(C.ink2).font("Helvetica").fontSize(5.4).text(name, rankX + 13, ry - 2, { width: rankW - 40 });
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(5.4).text(String(score), rankX + rankW - 22, ry - 2, { width: 14, align: "right" });
  });
  doc.restore();

  // Strip
  doc.save();
  doc.fillColor(C.muted).font("Helvetica").fontSize(5.4).text("Where the points are — 8 categories", mainX, chartY + chartH + 8, { width: mainW });
  doc.restore();

  y = top + h + 18;

  // ── Explanations ─────────────────────────────────────────────────────
  const blocks: [string, string][] = [
    ["The KPI row", "Four numbers, four questions: how readable (GEO), how quotable (citability), how fast to update (IndexNow), how many engines are ready. Each one is a score with its checks in this report — never a model output."],
    ["The trajectory", "Adds the recommended fixes in the order the engine ranks them. Point 6 is the cheap half; point 16 is the full plan. It answers 'how far can I get this month?' with the audit's own arithmetic."],
    ["The engine ranking", "Shows the gap between each engine's readiness and 100. A short bar means the signals are already in place; a long red delta means the gap is structural — entity links, citations, freshness."],
    ["The strip and the tabs", "The strip ranks the eight GEO categories so you fix the cheapest first. The tabs carry the same data at full size: Search for demand, IndexNow for speed, Tracking for whether the numbers can be trusted."],
  ];
  for (const [title, body] of blocks) {
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(8.5).text(title, M, y, { width: 96 });
    doc.fillColor(C.muted).font("Helvetica").fontSize(7.8).text(safe(body), M + 104, y, { width: CONTENT - 108, lineGap: 1.4 });
    y += Math.max(20, doc.heightOfString(safe(body), { width: CONTENT - 108, lineGap: 1.4 }) + 10);
  }

  y += 14;
  card(doc, M, y, CONTENT, 92, C.bg, C.line);
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(8.5).text("Where to start", M + 14, y + 12);
  const start = [
    ["Overview", "the four numbers and the plan order — this is the page a client reads."],
    ["GEO", "the eight categories, with the exact check behind every point."],
    ["Search / IndexNow / Tracking", "demand, speed of update, and whether the measurement itself can be trusted."],
  ];
  let sy = y + 26;
  for (const [name, meaning] of start) {
    doc.fillColor(C.brand).font("Helvetica-Bold").fontSize(7.6).text(name, M + 14, sy, { width: 120 });
    doc.fillColor(C.muted).font("Helvetica").fontSize(7.8).text(safe(meaning), M + 138, sy, { width: CONTENT - 152, lineGap: 1.3 });
    sy += 19;
  }
  doc.fillColor(C.muted).font("Helvetica").fontSize(7.2).text(
    "The console reads the same payload as the analysis_board MCP tool and the CLI: one audit, three surfaces, no second scoring engine.",
    M + 14,
    y + 74,
    { width: CONTENT - 28 }
  );
}

/**
 * Marketing plays, each tied to a check in this audit. No revenue forecast: the
 * only promises are the points and the signals to watch.
 */
function marketingPage(doc: Doc, input: PdfReportInput): void {
  doc.addPage();
  const audit = input.audit;
  let y = M;

  y = heading(doc, y, "Marketing", "Three plays this audit unlocks", "target");
  y = paragraph(
    doc,
    "Every play below is anchored to a check in this report, not to a projection. The question each one answers is commercial: where does an assistant place this brand when a buyer asks who verifies a DPE?",
    y
  );

  const plays: { title: string; state: string; points: string; do: string; measure: string }[] = [
    {
      title: "1. Be the brand, not the page",
      state: "Entity signals sit at 3/10. sameAs has 0/4 pillars, the name differs between title, H1 and Organization schema, and there is no about link.",
      points: "+7 GEO · +3 citability",
      do: "One name everywhere; sameAs to Wikidata, LinkedIn and Crunchbase; a real about page; a Person author with a URL.",
      measure: "Branded queries in Search Console, and whether an assistant repeats 'OpenDPE' when asked who verifies a DPE.",
    },
    {
      title: "2. Publish the answer, not the brochure",
      state: "Citability is 53/100: 0/3 on quotations, outbound citations, authorship and freshness. The page states numbers but sources none of them.",
      points: "+12 citability",
      do: "Quote the official DPE method with a link, turn one comparison into a table, name an author, add dateModified, and put a sourced figure above the fold.",
      measure: "The four zeroed methods in this report, re-run monthly; then AI referral sessions in GA4.",
    },
    {
      title: "3. Own the launch window",
      state: "IndexNow is 35/100 — no key file — and AI discovery is 0/6: no /.well-known/ai.txt, no /ai/*.json. New pages wait for a crawl nobody announced.",
      points: "+45 IndexNow · +6 discovery",
      do: "Publish the key file, verify it, announce each release in one POST, and ship the machine-readable summary, FAQ and service files.",
      measure: "Time between publish and first crawl in Bing Webmaster Tools; AI referral sessions after a launch.",
    },
  ];

  for (const play of plays) {
    const boxH = 128;
    card(doc, M, y, CONTENT, boxH);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(10).text(play.title, M + 14, y + 12, { width: CONTENT - 150 });
    // Right-anchor the chip on its measured width: a long label must not leave the card.
    doc.font("Helvetica-Bold").fontSize(7.5);
    const label = play.points.toUpperCase();
    const chipWidth = doc.widthOfString(label) + label.length * 0.6 + 14;
    chip(doc, play.points, M + CONTENT - 14 - chipWidth, y + 12, C.brand);
    doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(safe(play.state), M + 14, y + 30, { width: CONTENT - 28, lineGap: 1.5 });
    doc.fillColor(C.ink2).font("Helvetica-Bold").fontSize(7.6).text("DO", M + 14, y + 68, { width: 24 });
    doc.fillColor(C.ink2).font("Helvetica").fontSize(7.8).text(safe(play.do), M + 40, y + 68, { width: CONTENT - 54, lineGap: 1.4 });
    doc.fillColor(C.ink2).font("Helvetica-Bold").fontSize(7.6).text("WATCH", M + 14, y + 98, { width: 34 });
    doc.fillColor(C.muted).font("Helvetica").fontSize(7.8).text(safe(play.measure), M + 50, y + 98, { width: CONTENT - 64, lineGap: 1.4 });
    y += boxH + 12;
  }

  y += 2;
  card(doc, M, y, CONTENT, 56, C.bg, C.line);
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(8.5).text("The proof is the same audit, re-run", M + 14, y + 12);
  doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(
    "In 30 days, run geo-audit on the same URL. The category vector moves or it does not — that is the whole report card. Nothing here needs a dashboard to be believed.",
    M + 14,
    y + 26,
    { width: CONTENT - 28, lineGap: 1.4 }
  );
}

export async function writeGeoReportPdf(input: PdfReportInput): Promise<PdfReportResult> {
  const generatedAt = input.generatedAt ?? new Date();
  const brand = input.brandName ?? "GTM Growth";

  fs.mkdirSync(path.dirname(input.outPath), { recursive: true });
  const stream = fs.createWriteStream(input.outPath);
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: M, bottom: M, left: M, right: M },
    bufferPages: true,
    info: {
      Title: `GEO readiness report — ${input.audit.url}`,
      Author: brand,
      Subject: "GEO / AI-search readiness audit",
      Keywords: "GEO, AEO, llms.txt, schema, GTM, AI search",
    },
  });

  const done = new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.on("error", reject);
  });
  doc.pipe(stream);

  cover(doc, input, generatedAt);
  dashboardPage(doc, input);
  consolePage(doc, input);
  summaryPage(doc, input);
  categoriesPage(doc, input);
  if (input.platforms?.length) platformsPage(doc, input);
  entityPage(doc, input);
  if (input.citability) citabilityPage(doc, input);
  actionsPage(doc, input);
  marketingPage(doc, input);
  closingPage(doc, input);

  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 1; i < total; i++) {
    doc.switchToPage(range.start + i);
    footer(doc, i + 1, total, `${brand} · GEO readiness report · ${new URL(input.audit.url).hostname}`);
  }

  doc.end();
  await done;

  return { path: input.outPath, bytes: fs.statSync(input.outPath).size, pages: total };
}
