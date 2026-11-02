/**
 * Vector charts for the GEO report.
 *
 * Everything here is drawn with pdfkit primitives, so the figures stay sharp at
 * any zoom and add no dependency. Each chart reads only values the audit already
 * produced: no estimates, no smoothing, no invented baselines.
 */

import type { PlatformReadiness } from "../geo/platforms.js";
import type { CitabilityResult } from "../geo/citability.js";
import type { GeoAuditResult } from "../geo/types.js";

export const CHART = {
  ink: "#0B1220",
  muted: "#5A6B83",
  muted2: "#8494A9",
  line: "#E2E8F2",
  track: "#EEF1F6",
  brand: "#2563EB",
  teal: "#0EA5B7",
  green: "#12B76A",
  amber: "#F79009",
  red: "#D92D20",
  violet: "#7C3AED",
};

type Doc = PDFKit.PDFDocument;

export function bandColor(ratio: number): string {
  if (ratio >= 0.8) return CHART.green;
  if (ratio >= 0.6) return CHART.amber;
  return CHART.red;
}

/** Cumulative score as each recommended fix ships, highest value first. */
export function trajectorySeries(audit: GeoAuditResult): { step: number; score: number }[] {
  let score = audit.score;
  const series = [{ step: 0, score }];
  for (const [index, rec] of audit.recommendations.entries()) {
    score += rec.points;
    series.push({ step: index + 1, score });
  }
  return series;
}

export interface ChartBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function frame(doc: Doc, box: ChartBox, title: string): void {
  doc.save();
  doc.roundedRect(box.x, box.y, box.width, box.height, 10).fill("#FFFFFF").stroke(CHART.line);
  doc.fillColor(CHART.ink).font("Helvetica-Bold").fontSize(9).text(title, box.x + 14, box.y + 12, {
    width: box.width - 28,
  });
  doc.restore();
}

/** Line + area chart: score over the ordered fix plan. */
export function drawTrajectory(doc: Doc, box: ChartBox, audit: GeoAuditResult, title = "Score trajectory"): void {
  frame(doc, box, title);
  const series = trajectorySeries(audit);
  const padLeft = 26;
  const padRight = 16;
  const padTop = 34;
  const padBottom = 22;
  const plotX = box.x + padLeft;
  const plotW = box.width - padLeft - padRight;
  const plotY = box.y + padTop;
  const plotH = box.height - padTop - padBottom;

  const min = Math.min(...series.map((p) => p.score)) - 2;
  const max = Math.max(...series.map((p) => p.score));
  const span = Math.max(1, max - min);
  const xAt = (step: number) => plotX + (step / (series.length - 1)) * plotW;
  const yAt = (value: number) => plotY + plotH - ((value - min) / span) * plotH;

  // gridlines + value axis
  doc.save();
  for (let i = 0; i <= 2; i++) {
    const value = min + (span / 2) * i;
    const y = yAt(value);
    doc.strokeColor(CHART.line).lineWidth(0.5).moveTo(plotX, y).lineTo(plotX + plotW, y).stroke();
    if (i > 0) {
      doc.fillColor(CHART.muted2).font("Helvetica").fontSize(6).text(String(Math.round(value)), box.x + 8, y - 3, {
        width: 16,
        align: "right",
      });
    }
  }

  // area
  const area = doc
    .moveTo(xAt(0), plotY + plotH)
    .lineTo(xAt(0), yAt(series[0].score));
  for (const point of series.slice(1)) area.lineTo(xAt(point.step), yAt(point.score));
  area.lineTo(xAt(series.length - 1), plotY + plotH).closePath();
  doc.fillColor(CHART.brand).fillOpacity(0.12).fill();
  doc.fillOpacity(1);

  // line
  doc.strokeColor(CHART.brand).lineWidth(1.8);
  const line = doc.moveTo(xAt(series[0].step), yAt(series[0].score));
  for (const point of series.slice(1)) line.lineTo(xAt(point.step), yAt(point.score));
  line.stroke();

  // end markers with values
  for (const step of [0, series.length - 1]) {
    const point = series[step];
    const x = xAt(point.step);
    const y = yAt(point.score);
    doc.circle(x, y, 3.2).fillColor("#FFFFFF").fillAndStroke(CHART.brand, CHART.brand);
    doc.fillColor(CHART.ink).font("Helvetica-Bold").fontSize(8).text(String(point.score), x - 14, y - 14, {
      width: 28,
      align: "center",
    });
  }

  // x labels: now, the midpoint fix, the last fix
  const lastStep = series.length - 1;
  const midStep = Math.round(lastStep / 2);
  const labels: [number, string][] = [
    [0, "now"],
    [midStep, `+${midStep} fixes`],
    [lastStep, `+${lastStep} fixes`],
  ];
  for (const [step, label] of labels) {
    doc.fillColor(CHART.muted).font("Helvetica").fontSize(6).text(label, xAt(step) - 24, plotY + plotH + 6, {
      width: 48,
      align: "center",
    });
  }
  doc.restore();
}

/** Radar: one polygon over five platform scores, with axis spokes and rings. */
export function drawRadar(doc: Doc, box: ChartBox, platforms: PlatformReadiness[], title = "Platform readiness"): void {
  frame(doc, box, title);
  if (platforms.length < 3) return;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2 + 16;
  const radius = Math.min(box.width * 0.4, box.height * 0.33);
  const count = platforms.length;
  const angle = (index: number) => (-Math.PI / 2) + (index * 2 * Math.PI) / count;
  const point = (index: number, ratio: number): [number, number] => [
    cx + radius * ratio * Math.cos(angle(index)),
    cy + radius * ratio * Math.sin(angle(index)),
  ];

  doc.save();
  // rings
  for (const ratio of [0.25, 0.5, 0.75, 1]) {
    doc.strokeColor(CHART.line).lineWidth(0.5);
    for (let i = 0; i < count; i++) {
      const [x, y] = point(i, ratio);
      if (i === 0) doc.moveTo(x, y);
      else doc.lineTo(x, y);
    }
    doc.closePath().stroke();
  }
  // spokes
  for (let i = 0; i < count; i++) {
    const [x, y] = point(i, 1);
    doc.strokeColor(CHART.line).lineWidth(0.5).moveTo(cx, cy).lineTo(x, y).stroke();
  }

  // polygon + vertices
  const vertices = platforms.map((platform, i) => point(i, Math.max(0, Math.min(1, platform.score / 100))));
  doc.fillColor(CHART.brand).fillOpacity(0.14);
  const shape = doc.moveTo(vertices[0][0], vertices[0][1]);
  for (const [x, y] of vertices.slice(1)) shape.lineTo(x, y);
  shape.closePath().fill();
  doc.fillOpacity(1);
  doc.strokeColor(CHART.brand).lineWidth(1.4);
  const outline = doc.moveTo(vertices[0][0], vertices[0][1]);
  for (const [x, y] of vertices.slice(1)) outline.lineTo(x, y);
  outline.closePath().stroke();
  for (const [x, y] of vertices) {
    doc.circle(x, y, 2.2).fillColor(CHART.brand).fill();
  }

  // axis labels
  for (const [index, platform] of platforms.entries()) {
    const [x, y] = point(index, 1.24);
    const anchor = Math.abs(x - cx) < 6 ? "center" : x > cx ? "left" : "right";
    const left = anchor === "center" ? x - 30 : anchor === "left" ? x : x - 60;
    doc.fillColor(CHART.muted).font("Helvetica").fontSize(5.4).text(
      `${platform.label.replace("Microsoft ", "").replace("Google AI Overviews", "Google AIO")} · ${platform.score}`,
      left,
      y - 3,
      { width: 60, align: anchor }
    );
  }
  doc.restore();
}

/** Horizontal bars: earned vs maximum, per category. */
export function drawCategoryBars(doc: Doc, box: ChartBox, audit: GeoAuditResult, title = "Where the points are"): void {
  frame(doc, box, title);
  const labels: Record<string, string> = {
    robots: "robots.txt",
    llms: "llms.txt",
    schema: "schema",
    meta: "meta",
    content: "content",
    brand_entity: "brand & entity",
    signals: "signals",
    ai_discovery: "AI discovery",
  };
  const keys = Object.keys(audit.scoreBreakdown) as (keyof GeoAuditResult["scoreBreakdown"])[];
  const rowH = (box.height - 34) / keys.length;
  const labelW = 82;
  const valueW = 42;
  const trackX = box.x + 14 + labelW;
  const trackW = box.width - 28 - labelW - valueW - 8;

  doc.save();
  keys.forEach((key, index) => {
    const points = audit.scoreBreakdown[key] ?? 0;
    const max = audit.scoreMax[key] ?? 0;
    const ratio = max ? points / max : 0;
    const y = box.y + 26 + index * rowH;
    doc.fillColor(CHART.muted).font("Helvetica").fontSize(6.2).text(labels[key] ?? key, box.x + 14, y + 2, {
      width: labelW - 6,
    });
    doc.roundedRect(trackX, y + 1, trackW, 7, 3.5).fill(CHART.track);
    if (ratio > 0) {
      doc.roundedRect(trackX, y + 1, Math.max(4, trackW * ratio), 7, 3.5).fill(bandColor(ratio));
    }
    doc.fillColor(CHART.ink).font("Helvetica-Bold").fontSize(6.2).text(`${points}/${max}`, trackX + trackW + 6, y + 1, {
      width: valueW,
      align: "right",
    });
  });
  doc.restore();
}

/** Twelve citability methods as micro-bars: the fastest route to a quote. */
export function drawCitability(doc: Doc, box: ChartBox, citability: CitabilityResult, title = "Citability, method by method"): void {
  frame(doc, box, title);
  const methods = citability.methods;
  const columns = 2;
  const perColumn = Math.ceil(methods.length / columns);
  const columnW = (box.width - 28) / columns;
  const rowH = 13;

  doc.save();
  methods.forEach((method, index) => {
    const column = Math.floor(index / perColumn);
    const row = index % perColumn;
    const x = box.x + 14 + column * columnW;
    const y = box.y + 26 + row * rowH;
    const ratio = method.max ? method.points / method.max : 0;
    const labelW = 74;
    const valueW = 22;
    const trackW = columnW - labelW - valueW - 16;

    doc.fillColor(CHART.muted).font("Helvetica").fontSize(5.4).text(method.label, x, y + 1, { width: labelW - 4 });
    doc.roundedRect(x + labelW, y + 1, trackW, 5, 2.5).fill(CHART.track);
    if (ratio > 0) {
      doc.roundedRect(x + labelW, y + 1, Math.max(3, trackW * ratio), 5, 2.5).fill(bandColor(ratio));
    }
    const valueColor = ratio === 1 ? "#0F6B4A" : ratio === 0 ? "#A5241A" : "#93500E";
    doc
      .fillColor(valueColor)
      .font("Helvetica-Bold")
      .fontSize(5.2)
      .text(`${method.points}/${method.max}`, x + labelW + trackW + 5, y + 1, { width: valueW });
  });
  doc.restore();
}

/** Height this citability grid needs for its methods, at the fixed row height. */
export function citabilityHeight(citability: CitabilityResult): number {
  const perColumn = Math.ceil(citability.methods.length / 2);
  return 34 + perColumn * 13;
}

/** Band ladder: where the score sits today, and where the fixes land it. */
export function drawBandLadder(doc: Doc, box: ChartBox, audit: GeoAuditResult, title = "Band ladder"): void {
  frame(doc, box, title);
  const trackX = box.x + 16;
  const trackW = box.width - 32;
  const trackY = box.y + box.height * 0.55;
  const xAt = (value: number) => trackX + (Math.max(0, Math.min(100, value)) / 100) * trackW;

  doc.save();
  const bands: [number, number, string, string][] = [
    [0, 60, CHART.red, "weak"],
    [60, 80, CHART.amber, "good"],
    [80, 100, CHART.green, "excellent"],
  ];
  for (const [from, to, color, label] of bands) {
    doc.rect(xAt(from), trackY, xAt(to) - xAt(from), 10).fill(color).fillOpacity(0.22).fillOpacity(1);
    doc.fillColor(color).font("Helvetica-Bold").fontSize(6).text(label, xAt(from) + 4, trackY + 18, {
      width: xAt(to) - xAt(from) - 8,
    });
  }

  const marker = (value: number, label: string, color: string, above: boolean) => {
    const x = xAt(value);
    doc.strokeColor(color).lineWidth(1.6).moveTo(x, trackY - 6).lineTo(x, trackY + 16).stroke();
    doc.circle(x, trackY + 5, 5).fillColor("#FFFFFF").fillAndStroke(color, color);
    doc
      .fillColor(color)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(label, x - 24, above ? trackY - 20 : trackY + 34, { width: 48, align: "center" });
  };
  marker(audit.score, `now · ${audit.score}`, CHART.brand, true);
  marker(audit.projectedScore, `fixed · ${audit.projectedScore}`, CHART.green, true);
  doc.restore();
}

export interface SchemaFacts {
  foundTypes: string[];
  hasArticle: boolean;
  hasSameAs: boolean;
  hasDateModified: boolean;
}

/** Entity graph: what an engine can resolve, and what is missing. */
export function drawEntityGraph(doc: Doc, box: ChartBox, facts: SchemaFacts, title = "Entity graph"): void {
  frame(doc, box, title);
  const nodes = facts.foundTypes.filter((type) => type !== "Organization").slice(0, 4);
  const missing: string[] = [];
  if (!facts.hasArticle) missing.push("Article");
  if (!facts.hasDateModified) missing.push("Person");
  if (!facts.hasSameAs) missing.push("sameAs");

  const cx = box.x + box.width * 0.44;
  const nodeW = 64;
  const nodeH = 15;
  const columnX = box.x + 14;
  const missX = box.x + box.width - 14 - nodeW;
  const rows = Math.max(nodes.length, missing.length, 1);
  const rowGap = Math.min(28, (box.height - 46) / rows);
  const firstY = box.y + 32;
  const cy = firstY + ((rows - 1) * rowGap) / 2 + nodeH / 2;

  const drawNode = (x: number, y: number, label: string, present: boolean) => {
    const color = present ? CHART.green : CHART.red;
    doc.lineWidth(0.9).roundedRect(x, y, nodeW, nodeH, 5).fillColor(present ? "#E7F7EF" : "#FFECEB").fillAndStroke(
      present ? "#E7F7EF" : "#FFECEB",
      color
    );
    doc.fillColor(present ? CHART.ink : "#A5241A").font("Helvetica-Bold").fontSize(5.8).text(label, x + 3, y + 4.5, {
      width: nodeW - 6,
      align: "center",
    });
  };

  doc.save();
  // central organisation node
  doc.lineWidth(1).roundedRect(cx - 34, cy - 9, 68, 18, 6).fillColor("#EEF4FF").fillAndStroke("#EEF4FF", CHART.brand);
  doc.fillColor(CHART.ink).font("Helvetica-Bold").fontSize(6.2).text("Organization", cx - 32, cy - 3.5, {
    width: 64,
    align: "center",
  });

  const edges: [number, number, number, number, boolean][] = [];
  nodes.forEach((type, index) => {
    const y = firstY + index * rowGap;
    drawNode(columnX, y, type, true);
    edges.push([cx - 34, cy, columnX + nodeW, y + nodeH / 2, true]);
  });
  missing.forEach((label, index) => {
    const y = firstY + index * rowGap;
    drawNode(missX, y, label, false);
    edges.push([cx + 34, cy, missX, y + nodeH / 2, false]);
  });

  for (const [x1, y1, x2, y2, present] of edges) {
    if (present) doc.strokeColor("#C9D8F5").lineWidth(0.9);
    else doc.strokeColor("#F0A8A2").lineWidth(0.9).dash(3, { space: 2 });
    doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
    doc.undash();
  }
  doc.restore();
}
