/**
 * Phase 0.4 scoped writer: title+content only, on one existing WordPress REST
 * post or page. Never touches status, slug, author or theme files; never
 * logs credentials; every response is bounded before it reaches the engine.
 */
import { renderPost, parseRenderedPost, type PostRestType } from "../post-proposal.js";
import type { ApplyWriter } from "../execution.js";

export interface WordpressRestWriterConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
  restType: PostRestType;
  postId: number;
}

export type HttpTransport = (url: string, init: RequestInit) => Promise<Response>;

const POST_ID_MIN = 1, POST_ID_MAX = 10_000_000, TIMEOUT_MS = 30_000;

/** Builds one fail-closed writer. Throws before any network call if misconfigured. */
export function createWordpressRestWriter(
  config: WordpressRestWriterConfig,
  transport: HttpTransport = fetch,
): ApplyWriter {
  const url = /^https:\/\//i.test(config.siteUrl) ? config.siteUrl : `https://${config.siteUrl}`;
  let site: URL;
  try { site = new URL(url); }
  catch { throw new Error("WordPress writer requires a valid site URL"); }
  if (site.protocol !== "https:" || site.port || site.username || site.password ||
      site.hash || site.search || !site.hostname.includes(".") || site.pathname !== "/")
    throw new Error("WordPress writer requires a public HTTPS site origin only");
  if (typeof config.username !== "string" || !config.username ||
      typeof config.appPassword !== "string" || !config.appPassword)
    throw new Error("WordPress writer requires application-password credentials");
  // The writer is bound to exactly one bounded REST resource per instance.
  if ((config.restType !== "posts" && config.restType !== "pages") ||
      !Number.isInteger(config.postId) || config.postId < POST_ID_MIN || config.postId > POST_ID_MAX)
    throw new Error("WordPress writer requires a bounded posts|pages REST id");
  const endpoint = new URL(`/wp-json/wp/v2/${config.restType}/${config.postId}`, site.origin).href;
  const authorization = `Basic ${Buffer.from(`${config.username}:${config.appPassword}`).toString("base64")}`;

  const call = async (init: RequestInit, url: string = endpoint): Promise<Response> =>
    transport(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

  const readJson = async (response: Response): Promise<Record<string, unknown>> => {
    const text = await response.text().catch(() => "");
    try { return JSON.parse(text) as Record<string, unknown>; }
    catch { throw new Error(`WordPress returned an unparseable response (HTTP ${response.status})`); }
  };

  return {
    async inspect() {
      const response = await call({
        method: "GET",
        headers: { Authorization: authorization, Accept: "application/json" },
      }, `${endpoint}?context=edit`);
      if (response.status !== 200)
        throw new Error(`WordPress inspection failed (HTTP ${response.status})`);
      const post = await readJson(response);
      const title = post.title as { raw?: string } | undefined;
      const content = post.content as { raw?: string } | undefined;
      if (typeof title?.raw !== "string" || typeof content?.raw !== "string")
        throw new Error("WordPress inspection requires an authenticated edit context for title and content");
      return {
        content: renderPost(title.raw, content.raw),
        httpStatus: response.status,
        status: typeof post.status === "string" ? post.status : undefined,
      };
    },

    async write(rendered: string, idempotencyKey: string) {
      // The rendered representation is split back into the exact two fields
      // the proposal reviewed; nothing else is ever part of the request body.
      const { title, content } = parseRenderedPost(rendered);
      const response = await call({
        method: "PUT",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-GTM-Apply-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ title, content }),
      });
      if (response.status < 200 || response.status >= 300)
        throw new Error(`WordPress write failed (HTTP ${response.status})`);
      return { httpStatus: response.status };
    },
  };
}
