/** Operator-configured adapters. No third-party code or credentials in browser/state/artifacts. */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { validTenantId } from "../tenants/store.js";
import { updateState } from "./store.js";
import { id, platform, digest, type Post } from "./model.js";
const configSchema = z
  .object({
    postiz: z
      .object({
        baseUrl: z.string().url(),
        apiKey: z.string().min(10),
        writeEnabled: z.boolean().default(false),
        accounts: z
          .array(
            z
              .object({
                id,
                platform,
                settings: z.record(z.unknown()).default({}),
              })
              .strict(),
          )
          .max(100),
      })
      .strict()
      .optional(),
    youtubeKey: z.string().min(10).optional(),
    autoRefresh: z.boolean().default(false),
    requestsPerHour: z.number().int().min(1).max(1000).default(100),
  })
  .strict();
export type SocialConfig = z.infer<typeof configSchema>;
export function socialConfig(tenant: string): SocialConfig {
  if (!validTenantId(tenant) || !process.env.SOCIAL_CONNECTIONS_DIR)
    throw new Error("SOCIAL_CONNECTOR_UNAVAILABLE");
  try {
    return configSchema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(process.env.SOCIAL_CONNECTIONS_DIR, tenant + ".json"),
          "utf8",
        ),
      ),
    );
  } catch {
    throw new Error("SOCIAL_CONNECTOR_UNAVAILABLE");
  }
}
export function capabilities(tenant: string) {
  let c: SocialConfig | undefined;
  try {
    c = socialConfig(tenant);
  } catch {}
  return {
    postiz: !!c?.postiz,
    publishing: c?.postiz?.writeEnabled === true,
    youtube: !!c?.youtubeKey,
    zenml: workerConfigured(tenant),
    accounts:
      c?.postiz?.accounts.map((a) => ({ id: a.id, platform: a.platform })) ??
      [],
    outreachDelivery: "manual-after-approval",
    aiGeneration: false,
  };
}
function reserve(tenant: string, limit: number) {
  updateState(tenant, (s) => {
    const period = Math.floor(Date.now() / 3600000);
    if (s.quota?.period !== period) s.quota = { period, count: 0 };
    if (s.quota.count >= limit) throw new Error("SOCIAL_RATE_LIMIT");
    s.quota.count++;
  });
}
async function bounded(response: Response) {
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "SOCIAL_RATE_LIMIT"
        : [401, 403].includes(response.status)
          ? "SOCIAL_TOKEN_EXPIRED"
          : "SOCIAL_PROVIDER_ERROR",
    );
  if (!response.body) throw new Error("SOCIAL_PROVIDER_ERROR");
  let length = 0;
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2000000) {
      await reader.cancel();
      throw new Error("SOCIAL_PROVIDER_ERROR");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("SOCIAL_PROVIDER_ERROR");
  }
}
export class SocialProvider {
  constructor(
    readonly tenant: string,
    private fetcher: typeof fetch = fetch,
    private config: typeof socialConfig = socialConfig,
  ) {}
  private async postiz(method: "GET" | "POST", suffix: string, body?: unknown) {
    const c = this.config(this.tenant),
      p = c.postiz;
    if (!p) throw new Error("SOCIAL_CONNECTOR_UNAVAILABLE");
    const base = new URL(p.baseUrl);
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !["https:", "http:"].includes(base.protocol) ||
      (base.protocol === "http:" &&
        !["postiz", "localhost", "127.0.0.1"].includes(base.hostname))
    )
      throw new Error("SOCIAL_CONNECTOR_UNAVAILABLE");
    if (method === "POST" && !p.writeEnabled)
      throw new Error("SOCIAL_WRITE_DISABLED");
    reserve(this.tenant, c.requestsPerHour);
    try {
      return await bounded(
        await this.fetcher(p.baseUrl.replace(/\/$/, "") + suffix, {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: p.apiKey,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("SOCIAL_")) throw e;
      throw new Error(
        method === "POST" ? "SOCIAL_UNCERTAIN" : "SOCIAL_PROVIDER_ERROR",
      );
    }
  }
  async accounts() {
    const allowed = this.config(this.tenant).postiz?.accounts ?? [];
    const raw = await this.postiz("GET", "/integrations");
    const rows = z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          identifier: z.string(),
          disabled: z.boolean().optional(),
        }),
      )
      .max(1000)
      .parse(raw);
    return rows
      .filter((r) =>
        allowed.some((a) => a.id === r.id && a.platform === r.identifier),
      )
      .map((r) => ({
        id: r.id,
        platform: r.identifier,
        name: r.name,
        status: r.disabled ? "REVOKED" : "ACTIVE",
        observedAt: new Date().toISOString(),
      }));
  }
  async publish(post: Post, accountId: string) {
    const v = post.variants.find((v) => v.accountId === accountId),
      a = this.config(this.tenant).postiz?.accounts.find(
        (a) => a.id === accountId,
      );
    if (!v || !a || a.platform !== v.platform) throw new Error("SOCIAL_ACCESS");
    const rows = await this.postiz("POST", "/posts", {
      type: "now",
      date: post.scheduledAt,
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: accountId },
          value: [
            {
              content: v.caption + (v.link ? "\n" + v.link : ""),
              image: v.media.map((m) => ({
                id: m.id,
                path: m.path,
                alt: m.alt,
              })),
            },
          ],
          settings: { ...a.settings, __type: a.platform },
        },
      ],
    });
    const parsed = z
      .array(z.object({ postId: id, integration: id }))
      .min(1)
      .max(10)
      .safeParse(rows);
    if (
      !parsed.success ||
      parsed.data.length !== 1 ||
      parsed.data[0].integration !== accountId
    )
      throw new Error("SOCIAL_UNCERTAIN");
    return parsed.data[0].postId;
  }
  async readPosts(start: string, end: string) {
    const data = await this.postiz(
      "GET",
      "/posts?" + new URLSearchParams({ startDate: start, endDate: end }),
    );
    return data;
  }
  async metrics(postId: string) {
    const raw = await this.postiz(
      "GET",
      "/analytics/post/" + encodeURIComponent(postId) + "?date=30",
    );
    return z
      .array(
        z.object({
          label: z.string().max(100),
          data: z
            .array(
              z.object({
                date: z.string().max(100),
                total: z.string().max(100),
              }),
            )
            .max(1000),
        }),
      )
      .max(100)
      .parse(raw);
  }
  async discover(query: string) {
    const c = this.config(this.tenant);
    if (!c.youtubeKey) throw new Error("SOCIAL_DISCOVERY_UNAVAILABLE");
    reserve(this.tenant, c.requestsPerHour);
    let raw;
    try {
      raw = await bounded(
        await this.fetcher(
          "https://www.googleapis.com/youtube/v3/search?" +
            new URLSearchParams({
              part: "snippet",
              type: "channel",
              q: query,
              maxResults: "20",
              key: c.youtubeKey,
            }),
          { redirect: "error", signal: AbortSignal.timeout(15000) },
        ),
      );
    } catch {
      throw new Error("SOCIAL_DISCOVERY_UNAVAILABLE");
    }
    const rows = z
      .object({
        items: z
          .array(
            z.object({
              id: z.object({ channelId: z.string().regex(/^[a-zA-Z0-9_-]+$/) }),
              snippet: z.object({ title: z.string().max(160) }),
            }),
          )
          .max(20)
          .default([]),
      })
      .parse(raw);
    return rows.items.map((r) => ({
      name: r.snippet.title,
      handle: r.id.channelId,
      url: "https://www.youtube.com/channel/" + r.id.channelId,
    }));
  }
}

function workerConfigured(tenant: string) {
  try {
    return Object.values(
      JSON.parse(
        fs.readFileSync(process.env.SOCIAL_WORKERS_FILE || "", "utf8"),
      ),
    ).some((c: any) => c.tenant === tenant);
  } catch {
    return false;
  }
}

/** Binds a review to destinations/provider settings, while permitting credential rotation. */
export function publicationContext(
  tenant: string,
  post: Pick<Post, "variants">,
) {
  try {
    const p = socialConfig(tenant).postiz;
    if (!p) return "unconfigured";
    return digest({
      baseUrl: p.baseUrl,
      accounts: post.variants.map(
        (v) =>
          p.accounts.find(
            (a) => a.id === v.accountId && a.platform === v.platform,
          ) || null,
      ),
    });
  } catch {
    return "unconfigured";
  }
}
