#!/usr/bin/env node
/**
 * Collect a full audit bundle for a URL and write it next to the sample report.
 *
 *   node scripts/collect-sample.mjs [url] [outfile]
 *
 * Requires `npm run build` first. The JSON is the evidence behind
 * `site/reports/opendpe.html`; regenerate both when copying the report.
 */
import fs from "node:fs";
import path from "node:path";
import { runGeoAudit } from "../dist/geo/audit.js";
import { buildPlatformReadiness } from "../dist/geo/platforms.js";
import { runCitability } from "../dist/geo/citability.js";
import { getCrawlerAccess } from "../dist/geo/crawlers.js";
import { checkLlmsDrift } from "../dist/geo/drift.js";
import { runContentRiskScan } from "../dist/geo/risks.js";

const url = process.argv[2] ?? "https://www.opendpe.net";
const out = process.argv[3] ?? "site/reports/opendpe.json";

const audit = await runGeoAudit({ url });
const platforms = buildPlatformReadiness(audit);
const citability = await runCitability({ url });
const crawlers = await getCrawlerAccess({ url });
const drift = await checkLlmsDrift({ url, maxUrls: 30 });
const risks = await runContentRiskScan({ url });

const snapshot = {
  generatedAt: new Date().toISOString(),
  url,
  audit: {
    ...audit,
    // Raw JSON-LD objects are large and not needed for the report.
    details: { ...audit.details, schema: { ...audit.details.schema, objects: [] } },
  },
  platforms,
  citability,
  crawlers,
  drift,
  risks,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

console.log(`score ${audit.score} (${audit.band}) · projected ${audit.projectedScore} · recoverable ${audit.recoverablePoints}`);
console.log(platforms.map((p) => `${p.id}:${p.score}`).join(" "));
console.log(`wrote ${out} (${fs.statSync(out).size} bytes)`);
