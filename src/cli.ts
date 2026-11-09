#!/usr/bin/env node
/**
 * GTM Growth CLI — one command per workflow step
 *
 * Usage:
 *   npx ga-to-grok-cli <command> [options]
 *   npm run cli -- <command> [options]
 */

import { config } from "dotenv";
config();

import { readFileSync, writeFileSync } from "fs";

import { initRedis } from "./cache/redis.js";

initRedis();

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [, , command, ...rest] = argv;
  const args: Args = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }

  return { command: command || "help", args };
}

function str(args: Args, key: string, fallback?: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === true) return fallback;
  return String(v);
}

function req(args: Args, key: string): string {
  const v = str(args, key);
  if (!v) {
    throw new Error(`Missing required option --${key}`);
  }
  return v;
}

function bool(args: Args, key: string): boolean {
  return args[key] === true || args[key] === "true" || args[key] === "1";
}

function print(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function help() {
  console.log(`
GTM Growth CLI — workflow commands

Usage:
  ga-to-grok-cli <command> [options]
  npm run cli -- <command> [options]

── Discovery ──────────────────────────────────────────
  list-properties
  list-sgtm
  list-search-sites
  list-streams              --property <id>
  list-clients              --account <id> --container <id> --workspace <id>

── Search Console ──────────────────────────────────
  search-overview           --site <siteUrl> [--start <date>] [--end <date>]
  top-queries               --site <siteUrl> [--limit <n>] [--start <date>] [--end <date>]
  inspect-url               --site <siteUrl> --url <inspectionUrl>

── Performance ────────────────────────────────────
  pagespeed                 --url <url> [--strategy mobile|desktop]
  crux                      (--origin <origin> | --url <url>) [--form-factor PHONE|DESKTOP|TABLET]

── Step 1 · Web audit ─────────────────────────────────
  audit-web                 --account <id> --container <id> [--workspace <id>] [--property <id>]

── Step 2 · sGTM audit ────────────────────────────────
  audit-sgtm                --account <id> --container <id> [--workspace <id>]
  audit-mp-client           --account <id> --container <id> [--workspace <id>] [--client <id>]

── Step 3 · Secrets & Measurement Protocol ────────────
  verify-secrets            --property <id> [--reveal]
  suggest-mp                --property <id> [--stream <id>] [--mode direct|sgtm|both] [--sgtm-url <url>]
  configure-mp              --property <id> [--stream <id>] [--mode ...] [--sgtm-url <url>]
                            [--create-secret <name>] [--dry-run] [--confirm]
  create-mp-secret          --property <id> --stream <id> --name <displayName> [--dry-run] [--confirm]

── Step 4 · Dual-tagging comparison (S3) ──────────────
  compare-dual
      --web-account <id> --web-container <id> [--web-workspace <id>]
      --server-account <id> --server-container <id> [--server-workspace <id>]
      --property <id> [--start <date>] [--end <date>]

── Step 5 · Cutover checklist (S4) ────────────────────
  cutover-checklist
      --web-account <id> --web-container <id>
      --server-account <id> --server-container <id>
      --property <id> [--health-url <url>] [--start <date>] [--end <date>]

── Step 6 · Health / observability (S5) ───────────────
  health                    --url <sgtm-base-or-health-url> [--timeout <ms>]
  observability             --url <sgtm-url> [--property <id>]

── Analytics ────────────────────────────────────────
  analyze-ecommerce         --property <id> [--start <date>] [--end <date>]
  traffic                   --property <id> [--start <date>] [--end <date>]

── GEO / AEO · AI search readiness ──────────────────
  geo-audit                 --url <url> [--no-ai-discovery]
  geo-snapshot              --url <url> --out <snapshot.json>    captured evidence (not Score v2)
  geo-score-v2              --in <evidence.json> [--out <score.json>]  deterministic evidence replay
  geo-replay                --in <snapshot.json>                  offline legacy audit replay
  geo-sitemap               --url <url> [--sitemap <url>] [--max-urls <n>]
  geo-llms                  --url <url> [--sitemap <url>] [--name <site>]
                            [--description <text>] [--out <file>]
  geo-schema                --kind website|organization|faq|article|product|localbusiness
                            --name <name> --url <url> [--description <text>] [--logo <url>]
                            [--same-as <url,url>] [--author <name>] [--faq-file <json>] [--out <file>]
  geo-robots                --url <url> [--sitemap <url>] [--out <file>]
  geo-citability            --url <url>
  geo-crawlers              --url <url>
  geo-drift                 --url <url> [--sitemap <url>] [--max-urls <n>]   (exit 1 when stale)
  geo-risks                 --url <url>
  geo-positioning           --url <url> --competitors <url,url,…> [--max-terms <n>]
  geo-platforms             --url <url>
  geo-report                --url <url> [--out <file.pdf>] [--contact <url>]
  geo-free-read             --url <url> [--json]   SEO tables + GA4/GSC readiness
  indexnow-keygen           --host <host>          generate the key + key file
  indexnow-verify           --host <host> --key <key>
  indexnow-submit           --host <host> --key <key> --urls <a,b> --confirm=true
  indexnow-explain          --status <code>       decode an IndexNow response
  poppy-check               --url <url>            well-known/poppy.json check
  poppy-generate            --name <n> --domain <d> [--issuer <url>] [--mcp <url>]
  sitemap-build             --url <url> [--max-urls <n>] [--out <file>]
  analysis-board            --url <url> [--indexnow-key <key>]
  leads                     [--file <jsonl>] [--limit <n>]   read captured leads

── Server ───────────────────────────────────────────
  serve-http                Start MCP HTTP/SSE server
  serve-stdio               Start MCP STDIO server

Examples:
  npm run cli -- list-search-sites
  npm run cli -- top-queries --site https://example.com/
  npm run cli -- pagespeed --url https://example.com/ --strategy mobile
  npm run cli -- crux --origin https://example.com --form-factor PHONE
`);
}

async function main() {
  const { command, args } = parseArgs(process.argv);

  try {
    switch (command) {
      case "help":
      case "--help":
      case "-h":
        help();
        break;

      case "list-properties": {
        const { listProperties } = await import("./google/admin-api.js");
        print(await listProperties());
        break;
      }
      case "list-sgtm": {
        const { listSgtmContainers } = await import("./google/sgtm-api.js");
        print(await listSgtmContainers());
        break;
      }
      case "list-search-sites": {
        const { listSearchConsoleSites } = await import("./google/search-console.js");
        print(await listSearchConsoleSites());
        break;
      }
      case "search-overview": {
        const { querySearchAnalytics } = await import("./google/search-console.js");
        print(
          await querySearchAnalytics({
            siteUrl: req(args, "site"),
            startDate: str(args, "start") || "28daysAgo",
            endDate: str(args, "end") || "3daysAgo",
            dimensions: [],
            rowLimit: 1,
          })
        );
        break;
      }
      case "top-queries": {
        const { querySearchAnalytics } = await import("./google/search-console.js");
        print(
          await querySearchAnalytics({
            siteUrl: req(args, "site"),
            startDate: str(args, "start") || "28daysAgo",
            endDate: str(args, "end") || "3daysAgo",
            dimensions: ["query"],
            rowLimit: str(args, "limit") ? parseInt(String(str(args, "limit")), 10) : 20,
          })
        );
        break;
      }
      case "inspect-url": {
        const { inspectUrl } = await import("./google/search-console.js");
        print(
          await inspectUrl({
            siteUrl: req(args, "site"),
            inspectionUrl: req(args, "url"),
          })
        );
        break;
      }
      case "pagespeed": {
        const { runPagespeed } = await import("./google/pagespeed.js");
        print(
          await runPagespeed({
            url: req(args, "url"),
            strategy: (str(args, "strategy") as "mobile" | "desktop") || "mobile",
          })
        );
        break;
      }
      case "crux": {
        const { queryCrux } = await import("./google/crux.js");
        print(
          await queryCrux({
            origin: str(args, "origin"),
            url: str(args, "url"),
            formFactor: str(args, "form-factor") as any,
          })
        );
        break;
      }
      case "list-streams": {
        const { listDataStreams } = await import("./google/mp-secrets.js");
        print(await listDataStreams(req(args, "property")));
        break;
      }
      case "list-clients": {
        const { listGtmClients } = await import("./google/sgtm-api.js");
        print(
          await listGtmClients(
            req(args, "account"),
            req(args, "container"),
            req(args, "workspace")
          )
        );
        break;
      }

      case "audit-web": {
        const { auditGa4SetupV2 } = await import("./google/gtm-audit-v2.js");
        print(
          await auditGa4SetupV2({
            accountId: req(args, "account"),
            containerId: req(args, "container"),
            workspaceId: str(args, "workspace"),
            propertyId: str(args, "property"),
            startDate: str(args, "start"),
            endDate: str(args, "end"),
          })
        );
        break;
      }
      case "audit-sgtm": {
        const { auditSgtmSetup } = await import("./google/sgtm-api.js");
        print(
          await auditSgtmSetup({
            accountId: req(args, "account"),
            containerId: req(args, "container"),
            workspaceId: str(args, "workspace"),
          })
        );
        break;
      }
      case "audit-mp-client": {
        const { auditMeasurementProtocolClient } = await import(
          "./google/mp-client-audit.js"
        );
        print(
          await auditMeasurementProtocolClient({
            accountId: req(args, "account"),
            containerId: req(args, "container"),
            workspaceId: str(args, "workspace"),
            clientId: str(args, "client"),
          })
        );
        break;
      }
      case "verify-secrets": {
        const { verifyGa4Secrets } = await import("./google/mp-secrets.js");
        print(
          await verifyGa4Secrets({
            propertyId: req(args, "property"),
            revealSecrets: bool(args, "reveal"),
          })
        );
        break;
      }
      case "suggest-mp": {
        const { suggestMeasurementProtocolConfig } = await import(
          "./google/mp-config.js"
        );
        print(
          await suggestMeasurementProtocolConfig({
            propertyId: req(args, "property"),
            dataStreamId: str(args, "stream"),
            mode: (str(args, "mode") as any) || "both",
            sgtmBaseUrl: str(args, "sgtm-url"),
          })
        );
        break;
      }
      case "configure-mp": {
        const { configureMeasurementProtocol } = await import(
          "./google/mp-config.js"
        );
        print(
          await configureMeasurementProtocol({
            propertyId: req(args, "property"),
            dataStreamId: str(args, "stream"),
            mode: (str(args, "mode") as any) || "both",
            sgtmBaseUrl: str(args, "sgtm-url"),
            createSecretName: str(args, "create-secret"),
            dryRun: bool(args, "dry-run"),
            confirm: bool(args, "confirm"),
          })
        );
        break;
      }
      case "create-mp-secret": {
        const { createMeasurementProtocolSecret } = await import(
          "./google/mp-config.js"
        );
        print(
          await createMeasurementProtocolSecret({
            propertyId: req(args, "property"),
            dataStreamId: req(args, "stream"),
            displayName: req(args, "name"),
            dryRun: bool(args, "dry-run"),
            confirm: bool(args, "confirm"),
          })
        );
        break;
      }
      case "compare-dual": {
        const { compareDualTagging } = await import(
          "./google/sgtm-dual-tagging.js"
        );
        print(
          await compareDualTagging({
            webAccountId: req(args, "web-account"),
            webContainerId: req(args, "web-container"),
            webWorkspaceId: str(args, "web-workspace"),
            serverAccountId: req(args, "server-account"),
            serverContainerId: req(args, "server-container"),
            serverWorkspaceId: str(args, "server-workspace"),
            propertyId: req(args, "property"),
            startDate: str(args, "start"),
            endDate: str(args, "end"),
          })
        );
        break;
      }
      case "cutover-checklist": {
        const { cutoverChecklist } = await import("./google/sgtm-cutover.js");
        print(
          await cutoverChecklist({
            webAccountId: req(args, "web-account"),
            webContainerId: req(args, "web-container"),
            webWorkspaceId: str(args, "web-workspace"),
            serverAccountId: req(args, "server-account"),
            serverContainerId: req(args, "server-container"),
            serverWorkspaceId: str(args, "server-workspace"),
            propertyId: req(args, "property"),
            sgtmHealthUrl: str(args, "health-url"),
            startDate: str(args, "start"),
            endDate: str(args, "end"),
          })
        );
        break;
      }
      case "health": {
        const { checkSgtmHealth } = await import("./google/sgtm-health.js");
        print(
          await checkSgtmHealth({
            url: req(args, "url"),
            timeoutMs: str(args, "timeout")
              ? parseInt(String(str(args, "timeout")), 10)
              : undefined,
          })
        );
        break;
      }
      case "observability": {
        const { sgtmObservabilitySnapshot } = await import(
          "./google/sgtm-health.js"
        );
        print(
          await sgtmObservabilitySnapshot({
            sgtmHealthUrl: req(args, "url"),
            propertyId: str(args, "property"),
          })
        );
        break;
      }
      case "analyze-ecommerce": {
        const { analyzeEcommerceData } = await import(
          "./google/ecommerce-data.js"
        );
        print(
          await analyzeEcommerceData({
            propertyId: req(args, "property"),
            startDate: str(args, "start"),
            endDate: str(args, "end"),
          })
        );
        break;
      }
      case "traffic": {
        const { getTrafficOverview } = await import("./tools/business.js");
        const result = await getTrafficOverview({
          propertyId: req(args, "property"),
          startDate: str(args, "start"),
          endDate: str(args, "end"),
        });
        if (result?.content?.[0]?.text) {
          console.log(result.content[0].text);
        } else {
          print(result);
        }
        break;
      }
      case "geo-score-v2": {
        const { calculateV2Score } = await import("./geo/score/v2/calculate.js");
        const { CATEGORY_WEIGHTS, GRID_VERSION } = await import("./geo/score/v2/rubric.js");
        const input = JSON.parse(readFileSync(req(args, "in"), "utf8")) as {
          grid?: import("./geo/score/v2/rubric.js").ScoreGrid;
          snapshot?: unknown;
          observations?: import("./geo/score/v2/calculate.js").ObservedControl[];
        };
        if (!input || typeof input !== "object" || !input.grid ||
            !Object.prototype.hasOwnProperty.call(input, "snapshot") ||
            !Array.isArray(input.observations)) {
          throw new Error("Evidence file must contain grid, snapshot and observations");
        }
        if (input.grid.version !== GRID_VERSION ||
            Object.entries(CATEGORY_WEIGHTS).some(([key, weight]) =>
              input.grid?.categoryWeights?.[key as keyof typeof CATEGORY_WEIGHTS] !== weight)) {
          throw new Error("Evidence grid must use the approved GEO v2.0.0 category weights");
        }
        const result = await calculateV2Score(input.grid, input.snapshot, input.observations);
        const report = { ...result, evidenceStatus: "user_supplied_unverified" as const };
        const output = str(args, "out");
        if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\\n", "utf8");
        print(report);
        break;
      }
      case "geo-audit": {
        const { runGeoAudit } = await import("./geo/audit.js");
        const { summarizeAudit } = await import("./geo/report.js");
        const result = await runGeoAudit({
          url: req(args, "url"),
          includeAiDiscovery: !bool(args, "no-ai-discovery"),
        });
        print(summarizeAudit(result));
        break;
      }
      case "geo-snapshot": {
        const { captureAuditSnapshot } = await import("./geo/proof/snapshot.js");
        const { fetchPublicPage } = await import("./http/public-fetch.js");
        const envelope = await captureAuditSnapshot(req(args, "url"), fetchPublicPage, new Date().toISOString());
        const output = req(args, "out");
        writeFileSync(output, JSON.stringify(envelope, null, 2) + "\n", { flag: "wx", mode: 0o600 });
        print({ output, snapshotHash: envelope.snapshotHash, resources: envelope.snapshot.resources.length,
          scripts: envelope.snapshot.scriptAssets?.length ?? 0, skippedScripts: envelope.snapshot.skippedScripts?.length ?? 0,
          note: "Evidence snapshot only; no official GEO Score v2 computed" });
        break;
      }
      case "geo-replay": {
        const { replaySnapshot } = await import("./geo/proof/snapshot.js");
        const { runGeoAudit } = await import("./geo/audit.js");
        const { summarizeAudit } = await import("./geo/report.js");
        const file = req(args, "in");
        const { statSync } = await import("node:fs");
        if (statSync(file).size > 20 * 1024 * 1024) throw new Error("Snapshot file exceeds 20 MiB");
        const envelope = JSON.parse(readFileSync(file, "utf8"));
        const fetcher = await replaySnapshot(envelope);
        const audit = await runGeoAudit({ url: envelope.snapshot.url, fetcher });
        print({ snapshotHash: envelope.snapshotHash, verified: true, mode: "offline",
          note: "Legacy GEO audit replay; not official GEO Score v2", audit: summarizeAudit(audit) });
        break;
      }
      case "geo-sitemap": {
        const { runSiteGeoAudit } = await import("./geo/site.js");
        print(
          await runSiteGeoAudit({
            url: req(args, "url"),
            sitemapUrl: str(args, "sitemap"),
            maxUrls: str(args, "max-urls")
              ? parseInt(String(str(args, "max-urls")), 10)
              : undefined,
          })
        );
        break;
      }
      case "geo-llms": {
        const { collectSitemapEntries } = await import("./geo/site.js");
        const { generateLlmsTxt } = await import("./geo/generate/llms.js");
        const url = req(args, "url");
        const origin = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).origin;
        const collected = await collectSitemapEntries({
          url,
          sitemapUrl: str(args, "sitemap"),
        });
        const content = generateLlmsTxt({
          baseUrl: origin,
          entries: collected.entries,
          siteName: str(args, "name"),
          description: str(args, "description"),
          maxLinksPerSection: str(args, "max-links")
            ? parseInt(String(str(args, "max-links")), 10)
            : undefined,
        });
        const out = str(args, "out");
        if (out) {
          writeFileSync(out, content, "utf8");
          print({
            output: out,
            sitemapUrl: collected.sitemapUrl,
            entriesFound: collected.entries.length,
            bytes: Buffer.byteLength(content, "utf8"),
          });
        } else {
          console.log(content);
        }
        break;
      }
      case "geo-schema": {
        const { generateJsonLd, renderJsonLdScript } = await import(
          "./geo/generate/schema.js"
        );
        const schema = generateJsonLd({
          kind: req(args, "kind") as any,
          name: req(args, "name"),
          url: req(args, "url"),
          description: str(args, "description"),
          logo: str(args, "logo"),
          author: str(args, "author"),
          headline: str(args, "headline"),
          datePublished: str(args, "published"),
          dateModified: str(args, "modified"),
          faqs: str(args, "faq-file")
            ? JSON.parse(readFileSync(String(str(args, "faq-file")), "utf8"))
            : undefined,
          sameAs: str(args, "same-as")
            ?.split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        });
        const script = renderJsonLdScript(schema);
        const out = str(args, "out");
        if (out) {
          writeFileSync(out, script, "utf8");
          print({ output: out, script });
        } else {
          console.log(script);
        }
        break;
      }
      case "geo-robots": {
        const { generateRobotsFix } = await import("./geo/generate/robots.js");
        const { fetchText } = await import("./geo/http.js");
        const url = req(args, "url");
        const origin = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).origin;
        const robotsUrl = new URL("/robots.txt", origin).toString();
        const response = await fetchText(robotsUrl, { accept: "text/plain,*/*" }).catch(
          () => null
        );
        const existing = response && response.status === 200 ? response.body : null;
        const fix = generateRobotsFix({
          baseUrl: origin,
          existing,
          sitemaps: str(args, "sitemap") ? [String(str(args, "sitemap"))] : undefined,
        });
        const out = str(args, "out");
        if (out) {
          writeFileSync(out, fix.content, "utf8");
          print({ output: out, ...fix });
        } else {
          console.log(fix.content);
        }
        break;
      }
      case "geo-citability": {
        const { runCitability } = await import("./geo/citability.js");
        print(await runCitability({ url: req(args, "url") }));
        break;
      }
      case "geo-crawlers": {
        const { getCrawlerAccess } = await import("./geo/crawlers.js");
        print(await getCrawlerAccess({ url: req(args, "url") }));
        break;
      }
      case "geo-drift": {
        const { checkLlmsDrift } = await import("./geo/drift.js");
        const drift = await checkLlmsDrift({
          url: req(args, "url"),
          sitemapUrl: str(args, "sitemap"),
          maxUrls: str(args, "max-urls")
            ? parseInt(String(str(args, "max-urls")), 10)
            : undefined,
        });
        print(drift);
        if (!drift.inSync) process.exitCode = 1;
        break;
      }
      case "geo-risks": {
        const { runContentRiskScan } = await import("./geo/risks.js");
        print(await runContentRiskScan({ url: req(args, "url") }));
        break;
      }
      case "geo-positioning": {
        const { analyzePositioning } = await import("./geo/positioning.js");
        const competitors = String(str(args, "competitors") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        print(
          await analyzePositioning({
            url: req(args, "url"),
            competitors,
            maxTerms: str(args, "max-terms")
              ? parseInt(String(str(args, "max-terms")), 10)
              : undefined,
          })
        );
        break;
      }
      case "geo-platforms": {
        const { runGeoAudit } = await import("./geo/audit.js");
        const { buildPlatformReadiness } = await import("./geo/platforms.js");
        const audit = await runGeoAudit({ url: req(args, "url") });
        print({
          url: audit.url,
          score: audit.score,
          projectedScore: audit.projectedScore,
          platforms: buildPlatformReadiness(audit),
        });
        break;
      }
      case "geo-report": {
        const { runGeoAudit } = await import("./geo/audit.js");
        const { buildPlatformReadiness } = await import("./geo/platforms.js");
        const { runCitability } = await import("./geo/citability.js");
        const { writeGeoReportPdf } = await import("./report/pdf.js");
        const url = req(args, "url");
        const audit = await runGeoAudit({ url });
        const platforms = buildPlatformReadiness(audit);
        let citability;
        try {
          citability = await runCitability({ url });
        } catch {
          citability = undefined;
        }
        const outPath = str(args, "out") ?? "geo-report.pdf";
        const result = await writeGeoReportPdf({
          audit,
          platforms,
          citability,
          outPath,
          contactUrl: str(args, "contact"),
        });
        print({
          ...result,
          url: audit.url,
          score: audit.score,
          projectedScore: audit.projectedScore,
        });
        break;
      }
      case "geo-free-read": {
        const { runFreeRead } = await import("./freeread/index.js");
        const result = await runFreeRead({ url: req(args, "url") });
        print(result);
        break;
      }
      case "leads": {
        const { readLeads } = await import("./leads/store.js");
        const file = str(args, "file") ?? process.env.LEADS_PATH ?? "data/leads.jsonl";
        const limit = Number(str(args, "limit") ?? 50);
        const rows = readLeads(file, Number.isFinite(limit) ? limit : 50);
        print({ file, count: rows.length, leads: rows });
        break;
      }
      case "indexnow-keygen": {
        const { generateKey, keyMaterial, hostOf } = await import("./indexnow/client.js");
        const host = hostOf(req(args, "host"));
        const key = generateKey();
        print({ ...keyMaterial(key, host), next: "host the file, then run indexnow-verify" });
        break;
      }
      case "indexnow-verify": {
        const { verifyKeyFile, hostOf } = await import("./indexnow/client.js");
        const result = await verifyKeyFile(req(args, "key"), hostOf(req(args, "host")), { keyLocation: str(args, "keyLocation") });
        print(result);
        if (!result.ok) process.exitCode = 1;
        break;
      }
      case "indexnow-submit": {
        const { submitUrls, hostOf } = await import("./indexnow/client.js");
        const urls = req(args, "urls").split(",").map((value) => value.trim()).filter(Boolean);
        const result = await submitUrls({
          host: hostOf(req(args, "host")),
          key: req(args, "key"),
          urls,
          keyLocation: str(args, "keyLocation"),
          endpoint: str(args, "endpoint") ?? "indexnow",
          confirm: args.confirm === "true" || args.confirm === true,
        });
        print(result);
        if (!result.submitted) process.exitCode = 1;
        break;
      }
      case "poppy-check": {
        const { probePoppy } = await import("./geosuite/poppy.js");
        const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(req(args, "url")) ? req(args, "url") : `https://${req(args, "url")}`).hostname;
        const report = await probePoppy(host);
        print(report);
        if (!report.valid) process.exitCode = 1;
        break;
      }
      case "poppy-generate": {
        const { generatePoppy } = await import("./geosuite/poppy.js");
        print(
          generatePoppy({
            name: req(args, "name"),
            domain: req(args, "domain"),
            issuer: str(args, "issuer"),
            mcp: str(args, "mcp") ? [str(args, "mcp") as string] : undefined,
            agent: str(args, "agent"),
          })
        );
        break;
      }
      case "sitemap-build": {
        const { buildSitemap } = await import("./geosuite/sitemap-builder.js");
        const maxUrls = Number(str(args, "maxUrls") ?? 50);
        const result = await buildSitemap({ url: req(args, "url"), maxUrls: Number.isFinite(maxUrls) ? maxUrls : 50 });
        const out = str(args, "out");
        if (out) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(out, result.xml, "utf8");
          print({ ...result, xml: undefined, written: out });
        } else {
          print(result);
        }
        break;
      }
      case "indexnow-explain": {
        const { explainStatus } = await import("./indexnow/client.js");
        const status = Number(req(args, "status"));
        print({ status, ...explainStatus(status) });
        break;
      }
      case "analysis-board": {
        const { runGeoAudit } = await import("./geo/audit.js");
        const { buildPlatformReadiness } = await import("./geo/platforms.js");
        const { buildAnalysisBoard } = await import("./analysis/board.js");
        const { auditIndexNow } = await import("./indexnow/readiness.js");
        const audit = await runGeoAudit({ url: req(args, "url") });
        const host = new URL(audit.finalUrl).hostname;
        let citability;
        try {
          const { runCitability } = await import("./geo/citability.js");
          citability = await runCitability({ url: audit.finalUrl });
        } catch {
          citability = undefined;
        }
        const indexnow = await auditIndexNow({
          host,
          https: audit.finalUrl.startsWith("https:"),
          audit,
          key: str(args, "indexnow-key") ?? null,
        });
        print(buildAnalysisBoard({ audit, platforms: buildPlatformReadiness(audit), citability, indexnow }));
        break;
      }
      case "serve-http": {
        const { startServer } = await import("./server.js");
        await startServer("http");
        break;
      }
      case "serve-stdio": {
        const { startServer } = await import("./server.js");
        await startServer("stdio");
        break;
      }

      default:
        console.error(`Unknown command: ${command}\n`);
        help();
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message || err}`);
    process.exit(1);
  }
}

main();
