/**
 * IndexNow + analysis-board tools.
 *
 * Three exposure levels, deliberately different:
 *   indexnow_keygen   no network, no write — pure local generation
 *   indexnow_verify   read-only fetch of the key file
 *   indexnow_submit   write to a third party — requires confirm=true
 *   analysis_board    read-only aggregation of what the other panels measured
 */

import { z } from "zod";
import { hostOf, submitUrls, verifyKeyFile, keyMaterial, generateKey, explainStatus } from "../indexnow/client.js";
import { scoreIndexNowReadiness, auditIndexNow } from "../indexnow/readiness.js";
import { buildAnalysisBoard } from "../analysis/board.js";
import { runGeoAudit } from "../geo/audit.js";
import { buildPlatformReadiness } from "../geo/platforms.js";
import { runCitability } from "../geo/citability.js";
import { success, fail } from "./response.js";
import { strict } from "./schema.js";

export const indexNowTools = [
  {
    name: "indexnow_keygen",
    description:
      "Generate an IndexNow key (32 hex characters, inside the protocol grammar) and everything needed to publish it: the file name, the exact URL to serve, the file content, the response headers and a copy-paste verification command. Local only — no request is sent.",
    schema: strict({
      host: z.string(),
    }),
    handler: async (args: any) => {
      try {
        const key = generateKey();
        const material = keyMaterial(key, hostOf(args.host));
        return success({
          ...material,
          steps: [
            `1. Create ${material.fileName} at the site root (or anywhere, then pass keyLocation).`,
            `2. Serve it as text/plain, UTF-8, containing exactly the key.`,
            `3. Verify: curl -s ${material.fileUrl}`,
            `4. Submit: indexnow_submit with host, key and the changed URLs, confirm=true.`,
          ],
          warning: "Keep the key file: deleting it makes every later submission return 403.",
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "indexnow_verify",
    description:
      "Fetch the IndexNow key file and check that it is published, reachable and contains exactly the key — the only ownership proof the protocol accepts. Read-only. Returns the HTTP status, the content found and the fix for each failure mode.",
    schema: strict({
      host: z.string(),
      key: z.string(),
      keyLocation: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        const result = await verifyKeyFile(args.key, hostOf(args.host), { keyLocation: args.keyLocation });
        return success(result);
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "indexnow_submit",
    description:
      'Announce changed URLs to IndexNow (Bing, Yandex, Seznam, Naver) in one POST, up to 10 000 URLs. WRITE to a third party that consumes crawl quota: requires confirm=true. Returns the documented status code with its meaning and fix — 200/202 mean received, never indexed.',
    schema: strict({
      host: z.string(),
      key: z.string(),
      urls: z.array(z.string()),
      keyLocation: z.string().optional(),
      endpoint: z.enum(["indexnow", "bing", "yandex"]).optional(),
      confirm: z.boolean().optional(),
    }),
    handler: async (args: any) => {
      try {
        if (args.confirm !== true) {
          return success({
            submitted: false,
            reason: "confirm=true is required: this notifies external search engines and consumes crawl quota.",
            preview: { host: args.host, urlCount: args.urls?.length ?? 0, endpoint: args.endpoint ?? "indexnow" },
          });
        }
        const result = await submitUrls({
          host: hostOf(args.host),
          key: args.key,
          urls: args.urls,
          keyLocation: args.keyLocation,
          endpoint: args.endpoint,
          confirm: true,
        });
        return success(result);
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "analysis_board",
    description:
      "The analysis board: one payload combining GEO score, platform readiness, citability and IndexNow readiness, plus a ranked action list that adapts to what is actually blocking. IndexNow blockers come first (they cost minutes), then GEO recoverable points, then citability zeroes. Deterministic: same inputs, same order.",
    schema: strict({
      url: z.string(),
      indexnowKey: z.string().optional(),
      includeCitability: z.boolean().optional(),
      includePlatforms: z.boolean().optional(),
    }),
    handler: async (args: any) => {
      try {
        const audit = await runGeoAudit({ url: args.url });
        const platforms = args.includePlatforms === false ? undefined : buildPlatformReadiness(audit);
        let citability;
        if (args.includeCitability !== false) {
          try {
            citability = await runCitability({ url: audit.finalUrl });
          } catch {
            citability = undefined;
          }
        }
        const host = new URL(audit.finalUrl).hostname;
        const indexnow = await auditIndexNow({
          host,
          https: audit.finalUrl.startsWith("https:"),
          audit,
          key: args.indexnowKey ?? null,
        });

        return success({
          board: buildAnalysisBoard({ audit, platforms, citability, indexnow }),
          indexnow: {
            score: indexnow.score,
            band: indexnow.band,
            checks: indexnow.checks,
            keyFileUrl: indexnow.keyFileUrl,
          },
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "indexnow_readiness",
    description:
      "Score IndexNow readiness 0-100 outside the GEO rubric: key grammar, published key file, key file content, Bing verification, Bingbot access, sitemap declaration, HTTPS. Each check carries its evidence and its fix.",
    schema: strict({
      url: z.string(),
      key: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        const audit = await runGeoAudit({ url: args.url });
        const host = new URL(audit.finalUrl).hostname;
        const readiness = await auditIndexNow({
          host,
          https: audit.finalUrl.startsWith("https:"),
          audit,
          key: args.key ?? null,
        });
        return success(readiness);
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "indexnow_explain",
    description:
      "Explain an IndexNow HTTP status code (200, 202, 400, 403, 422, 429) without sending anything: what it means and what to change before the next submission.",
    schema: strict({
      status: z.number(),
    }),
    handler: async (args: any) => success({ status: args.status, ...explainStatus(args.status) }),
  },
];

export { scoreIndexNowReadiness };
