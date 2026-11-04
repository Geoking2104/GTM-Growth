/** Phase 3 console routes: technical audit (in-house crawler), SERP preview, content generators. */

import { checkTarget } from "../http/public-api.js";
import { HtmlDoc } from "../geo/html.js";
import { fetchQuiet, fetchText } from "../geo/http.js";
import { runTechAudit, serpPreview } from "./crawler.js";
import { generateMetaDescriptions, generateOutline, generateTitles, generateWithOllama, ollamaFromEnv, type GenInput } from "./generators.js";
import { num, str, type Body, type ConsoleRoute } from "./util.js";

const guard = async (url: string) => (await checkTarget(url)).ok;

async function pageContext(url: string | undefined) {
  if (!url) return {};
  const page = await fetchQuiet(fetchText, url);
  if (!page || page.status !== 200) return {};
  const doc = HtmlDoc.parse(page.body);
  return {
    title: doc.title()?.trim() ?? "",
    description: doc.metaByName("description")?.attrs.content?.trim() ?? "",
    headings: doc.all("h2").map((h) => doc.textOf(h).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8),
    text: doc.bodyText().replace(/\s+/g, " ").slice(0, 1500),
    finalUrl: page.url,
  };
}

async function genInput(body: Body, url: string): Promise<GenInput> {
  const keyword = str(body.keyword);
  if (!keyword) throw new Error("Mot-clé requis.");
  const ctx = str(body.url) && body.usePage !== "non" ? await pageContext(url) : {};
  return { keyword, brand: str(body.brand), audience: str(body.audience), benefit: str(body.benefit), existingTitle: ctx.title, existingHeadings: ctx.headings, topic: ctx.text };
}

async function generate(kind: "titles" | "meta" | "outline", body: Body, url: string) {
  const input = await genInput(body, url);
  const templates = kind === "titles" ? generateTitles(input) : kind === "meta" ? generateMetaDescriptions(input) : generateOutline(input);
  const ollama = ollamaFromEnv();
  let llm: { model: string; text: string } | { error: string } | null = null;
  if (body.engine === "ollama") {
    if (!ollama) llm = { error: "Ollama non configuré (OLLAMA_URL)." };
    else llm = await generateWithOllama(kind, input, ollama).then((text) => ({ model: ollama.model, text })).catch((e: Error) => ({ error: e.message }));
  }
  return { engine: llm ? "ollama" : "modèles", templates, llm, ollamaAvailable: Boolean(ollama) };
}

export const phase3Routes: ConsoleRoute[] = [
  { path: "/audit/technical", handler: async ({ url, body }) => runTechAudit({ url, maxPages: num(body.maxPages, 30, 1, 200), maxExternalChecks: num(body.maxExternal, 40, 0, 200), guard }) },
  {
    path: "/audit/serp-preview",
    handler: async ({ url, body }) => {
      const ctx = await pageContext(url);
      return serpPreview({ url: ctx.finalUrl ?? url, title: str(body.title) ?? ctx.title ?? "", description: str(body.description) ?? ctx.description ?? "" });
    },
  },
  // Generators accept an optional url (page context); the guard still applies when given.
  { path: "/generate/titles", needsUrl: false, handler: async ({ body }) => generate("titles", body, await safeUrl(body)) },
  { path: "/generate/meta", needsUrl: false, handler: async ({ body }) => generate("meta", body, await safeUrl(body)) },
  { path: "/generate/outline", needsUrl: false, handler: async ({ body }) => generate("outline", body, await safeUrl(body)) },
];

async function safeUrl(body: Body): Promise<string> {
  if (!str(body.url) || body.usePage === "non") return "";
  const check = await checkTarget(body.url);
  if (!check.ok || !check.url) throw new Error(check.reason ?? "url invalide");
  return check.url;
}
