/**
 * Regenerate the SVG figures in the sample report from the audit snapshot.
 *
 * The charts are drawn from site/reports/opendpe.json — the same numbers the
 * CLI produces — so a stale chart is impossible: run this after
 * `node scripts/collect-sample.mjs`.
 *
 *   node scripts/render-figures.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "site/reports/opendpe.html");
const snapPath = path.join(root, "site/reports/opendpe.json");

const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
const audit = snap.audit;

const GREEN = "#12B76A";
const AMBER = "#F79009";
const RED = "#D92D20";
const BRAND = "#2563EB";
const INK = "#0B1220";
const MUTED = "#5A6B83";
const LINE = "#E2E8F2";
const TRACK = "#EEF1F6";
const FONT = 'font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"';

const band = (ratio) => (ratio >= 0.8 ? GREEN : ratio >= 0.6 ? AMBER : RED);

function trajectorySvg() {
  let score = audit.score;
  const series = [{ step: 0, score }];
  for (const rec of audit.recommendations) {
    score += rec.points;
    series.push({ step: series.length, score });
  }
  const steps = series.length - 1;
  const X = (step) => 64 + (step / steps) * 452;
  const min = Math.min(...series.map((p) => p.score)) - 3;
  const max = Math.max(...series.map((p) => p.score));
  const Y = (value) => 168 - ((value - min) / (max - min)) * 132;

  const points = series.map((p) => `${X(p.step).toFixed(1)},${Y(p.score).toFixed(1)}`).join(" ");
  const grid = [min, (min + max) / 2, max]
    .map((value, index) => {
      const y = Y(value).toFixed(1);
      const showLabel = index !== 0;
      const label = showLabel
        ? `<text x="52" y="${(Number(y) + 3).toFixed(1)}" text-anchor="end" fill="${MUTED}" font-size="9">${Math.round(value)}</text>`
        : "";
      return `          <line x1="64" y1="${y}" x2="516" y2="${y}" stroke="${LINE}"${index === 0 ? "" : ' stroke-dasharray="3 4"'} />\n${label}`;
    })
    .join("\n");

  const marks = [0, Math.round(steps / 2), steps]
    .map((step) => {
      const point = series[step];
      const x = X(step).toFixed(1);
      const y = Y(point.score).toFixed(1);
      const anchor = step === 0 ? "start" : step === steps ? "end" : "middle";
      const lx = step === 0 ? Number(x) - 4 : step === steps ? Number(x) + 4 : Number(x);
      return (
        `          <circle cx="${x}" cy="${y}" r="4.5" fill="#fff" stroke="${BRAND}" stroke-width="2" />\n` +
        `          <text x="${lx}" y="${(Number(y) - 11).toFixed(1)}" text-anchor="${anchor}" fill="${INK}" font-size="12" font-weight="700">${point.score}</text>\n` +
        `          <text x="${x}" y="190" text-anchor="${anchor}" fill="${MUTED}" font-size="9">${step === 0 ? "now" : `+${step} fixes`}</text>`
      );
    })
    .join("\n");

  return `<svg viewBox="0 0 560 200" role="img" aria-label="Score rises from ${series[0].score} to ${series[steps].score} across the ${steps} recommended fixes">
          <defs>
            <linearGradient id="trajectoryArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${BRAND}" stop-opacity=".26" />
              <stop offset="1" stop-color="${BRAND}" stop-opacity="0" />
            </linearGradient>
          </defs>
          <g ${FONT}>
${grid}
          </g>
          <path d="M${points.split(" ").join(" L")} L516,168 L64,168 Z" fill="url(#trajectoryArea)" />
          <polyline points="${points}" fill="none" stroke="${BRAND}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
          <g ${FONT}>
${marks}
          </g>
        </svg>`;
}

function categorySvg() {
  const maxima = audit.scoreMax;
  const labels = {
    robots: "robots.txt",
    llms: "llms.txt",
    schema: "schema",
    meta: "meta",
    content: "content",
    brand_entity: "brand & entity",
    signals: "signals",
    ai_discovery: "AI discovery",
  };
  const keys = Object.keys(audit.scoreBreakdown);
  const trackW = 250;
  const rows = keys
    .map((key, index) => {
      const points = audit.scoreBreakdown[key];
      const max = maxima[key];
      const ratio = max ? points / max : 0;
      const y = 18 + index * 27;
      const width = Math.max(ratio > 0 ? 4 : 0, trackW * ratio).toFixed(1);
      return (
        `          <text x="0" y="${y + 10}" fill="${MUTED}" font-size="10">${labels[key] ?? key}</text>\n` +
        `          <rect x="92" y="${y}" width="${trackW}" height="13" rx="6.5" fill="${TRACK}" />\n` +
        `          <rect x="92" y="${y}" width="${width}" height="13" rx="6.5" fill="${band(ratio)}" />\n` +
        `          <text x="${92 + trackW + 10}" y="${y + 10}" fill="${INK}" font-size="10" font-weight="700">${points}/${max}</text>`
      );
    })
    .join("\n");
  const height = 18 + keys.length * 27;
  return `<svg viewBox="0 0 470 ${height}" role="img" aria-label="Category scores: ${keys
    .map((key) => `${labels[key] ?? key} ${audit.scoreBreakdown[key]} of ${maxima[key]}`)
    .join(", ")}">
          <g ${FONT}>
${rows}
          </g>
        </svg>`;
}

function radarSvg() {
  const platforms = snap.platforms ?? [];
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 84;
  const count = platforms.length;
  const angle = (index) => -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const point = (index, ratio) => [
    (cx + radius * ratio * Math.cos(angle(index))).toFixed(1),
    (cy + radius * ratio * Math.sin(angle(index))).toFixed(1),
  ];

  const rings = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const polygon = platforms.map((_, index) => point(index, ratio).join(",")).join(" ");
      return `          <polygon points="${polygon}" fill="none" stroke="${LINE}" />`;
    })
    .join("\n");

  const spokes = platforms
    .map((_, index) => {
      const [x, y] = point(index, 1);
      return `          <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${LINE}" />`;
    })
    .join("\n");

  const shape = platforms.map((platform, index) => point(index, Math.min(1, platform.score / 100)).join(",")).join(" ");
  const dots = platforms
    .map((platform, index) => {
      const [x, y] = point(index, Math.min(1, platform.score / 100));
      return `          <circle cx="${x}" cy="${y}" r="4" fill="${BRAND}" />`;
    })
    .join("\n");

  const labels = platforms
    .map((platform, index) => {
      const [x, y] = point(index, 1.3);
      const value = Number(x);
      const anchor = Math.abs(value - cx) < 8 ? "middle" : value > cx ? "start" : "end";
      const name = platform.label.replace("Microsoft ", "").replace("Google AI Overviews", "Google AIO");
      return `          <text x="${x}" y="${(Number(y) + 4).toFixed(1)}" text-anchor="${anchor}" fill="${MUTED}" font-size="10">${name} · ${platform.score}</text>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 340 340" role="img" aria-label="Platform readiness radar: ${platforms
    .map((platform) => `${platform.label} ${platform.score}`)
    .join(", ")}">
          <g>
${rings}
${spokes}
          </g>
          <polygon points="${shape}" fill="${BRAND}" fill-opacity="0.16" stroke="${BRAND}" stroke-width="2" />
${dots}
          <g ${FONT}>
${labels}
          </g>
        </svg>`;
}

function citabilitySvg() {
  const methods = snap.citability?.methods ?? [];
  const perColumn = Math.ceil(methods.length / 2);
  const rows = methods
    .map((method, index) => {
      const column = Math.floor(index / perColumn);
      const row = index % perColumn;
      const ratio = method.max ? method.points / method.max : 0;
      const x = column * 258;
      const y = 8 + row * 19;
      const width = Math.max(ratio > 0 ? 3 : 0, 84 * ratio).toFixed(1);
      const color = ratio === 1 ? "#0F6B4A" : ratio === 0 ? "#A5241A" : "#93500E";
      return (
        `          <text x="${x}" y="${y + 9}" fill="${MUTED}" font-size="9.5">${method.label}</text>\n` +
        `          <rect x="${x + 126}" y="${y + 2}" width="84" height="8" rx="4" fill="${TRACK}" />\n` +
        `          <rect x="${x + 126}" y="${y + 2}" width="${width}" height="8" rx="4" fill="${band(ratio)}" />\n` +
        `          <text x="${x + 216}" y="${y + 10}" fill="${color}" font-size="9" font-weight="700">${method.points}/${method.max}</text>`
      );
    })
    .join("\n");
  return `<svg viewBox="0 0 500 ${8 + perColumn * 19 + 6}" role="img" aria-label="Citability by method, ${snap.citability?.points} of ${snap.citability?.max}">
          <g ${FONT}>
${rows}
          </g>
        </svg>`;
}

function ladderSvg() {
  const x0 = 46;
  const width = 404;
  const y = 52;
  const at = (value) => (x0 + (Math.max(0, Math.min(100, value)) / 100) * width).toFixed(1);
  const bands = [
    [0, 60, RED, "weak"],
    [60, 80, AMBER, "good"],
    [80, 100, GREEN, "excellent"],
  ]
    .map(([from, to, color, label]) => {
      const x = at(from);
      const w = (Number(at(to)) - Number(x)).toFixed(1);
      return (
        `          <rect x="${x}" y="${y}" width="${w}" height="12" fill="${color}" fill-opacity="0.22" />\n` +
        `          <text x="${Number(x) + 6}" y="${y + 26}" fill="${color}" font-size="9" font-weight="700">${label}</text>`
      );
    })
    .join("\n");

  const marker = (value, label, color) =>
    `          <line x1="${at(value)}" y1="${y - 8}" x2="${at(value)}" y2="${y + 18}" stroke="${color}" stroke-width="2" />\n` +
    `          <circle cx="${at(value)}" cy="${y + 6}" r="5.5" fill="#fff" stroke="${color}" stroke-width="2" />\n` +
    `          <text x="${at(value)}" y="${y - 14}" text-anchor="middle" fill="${color}" font-size="10" font-weight="700">${label}</text>`;

  return `<svg viewBox="0 0 496 104" role="img" aria-label="Band ladder: now ${audit.score}, after fixes ${audit.projectedScore}">
          <g ${FONT}>
${bands}
${marker(audit.score, `now · ${audit.score}`, BRAND)}
${marker(audit.projectedScore, `fixed · ${audit.projectedScore}`, GREEN)}
          </g>
        </svg>`;
}

function entitySvg() {
  const schema = audit.details.schema;
  const present = schema.foundTypes.filter((type) => type !== "Organization").slice(0, 4);
  const missing = [];
  if (!schema.hasArticle) missing.push("Article");
  if (!schema.hasDateModified) missing.push("Person");
  if (!schema.hasSameAs) missing.push("sameAs");

  const width = 720;
  const nodeW = 150;
  const nodeH = 34;
  const leftX = 16;
  const rightX = width - 16 - nodeW;
  const hubW = 156;
  const hubX = (width - hubW) / 2;
  const rowGap = 46;
  const firstY = 26;
  const rows = Math.max(present.length, missing.length, 1);
  const hubY = firstY + ((rows - 1) * rowGap) / 2 + nodeH / 2 - 17;
  const height = firstY + (rows - 1) * rowGap + nodeH + 20;

  const node = (x, y, label, ok) =>
    `          <rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="9" fill="${ok ? "#E7F7EF" : "#FFECEB"}" stroke="${ok ? GREEN : RED}"${ok ? "" : ' stroke-dasharray="5 4"'} />\n` +
    `          <text x="${x + nodeW / 2}" y="${y + 21}" text-anchor="middle" fill="${ok ? INK : "#A5241A"}" font-size="12">${label}</text>`;

  const edges = [];
  present.forEach((_, index) => {
    const y = firstY + index * rowGap + nodeH / 2;
    edges.push(
      `          <line x1="${leftX + nodeW}" y1="${y}" x2="${hubX}" y2="${hubY + 17}" stroke="#C9D8F5" stroke-width="1.6" />`,
    );
    edges.push(
      `          <circle cx="${leftX + nodeW}" cy="${y}" r="2.4" fill="#7FA6EC" />`,
    );
  });
  missing.forEach((_, index) => {
    const y = firstY + index * rowGap + nodeH / 2;
    edges.push(
      `          <line x1="${hubX + hubW}" y1="${hubY + 17}" x2="${rightX}" y2="${y}" stroke="#F0A8A2" stroke-width="1.6" stroke-dasharray="5 4" />`,
    );
  });

  const leftNodes = present.map((type, index) => node(leftX, firstY + index * rowGap, type, true)).join("\n");
  const rightNodes = missing.map((label, index) => node(rightX, firstY + index * rowGap, label, false)).join("\n");

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Entity graph: ${present.join(", ")} present; ${missing.join(", ")} missing">
          <g>
${edges.join("\n")}
          </g>
          <rect x="${hubX}" y="${hubY}" width="${hubW}" height="34" rx="9" fill="#EEF4FF" stroke="${BRAND}" stroke-width="1.6" />
${leftNodes}
${rightNodes}
          <g ${FONT}>
          <text x="${hubX + hubW / 2}" y="${hubY + 21}" text-anchor="middle" fill="${INK}" font-size="12" font-weight="700">Organization</text>
          </g>
        </svg>`;
}

const figures = {
  trajectory: trajectorySvg,
  categories: categorySvg,
  radar: radarSvg,
  citability: citabilitySvg,
  ladder: ladderSvg,
  entity: entitySvg,
};

let html = fs.readFileSync(reportPath, "utf8");
let rendered = 0;

for (const [name, render] of Object.entries(figures)) {
  const open = `<!-- figure:${name} -->`;
  const close = `<!-- /figure:${name} -->`;
  const start = html.indexOf(open);
  const end = html.indexOf(close);
  if (start === -1 || end === -1) throw new Error(`missing markers for figure:${name}`);
  html = `${html.slice(0, start + open.length)}\n${render()}\n          ${html.slice(end)}`;
  rendered += 1;
}

fs.writeFileSync(reportPath, html, "utf8");
console.log(`rendered ${rendered} figures into site/reports/opendpe.html (${fs.statSync(reportPath).size} bytes)`);
