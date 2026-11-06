/** Article pipeline (T-9) and CMS publishing (T-10).
 * T-9: opportunity â†’ brief â†’ outline â†’ draft, with deterministic quality
 *      gates: every draft is scored against the GEO rubric (geo_audit) and
 *      citability before it can be approved for publishing. LLM text
 *      generation is optional (Ollama self-hosted or BYOK), never required â€”
 *      the brief and outline are deterministic like the existing generators.
 * T-10: WordPress REST publishing via per-tenant connection (site URL +
 *      application password), stored server-side like the Bing key. On
 *      success, auto-IndexNow (composing the existing indexnow client). */
import { randomUUID } from "node:crypto";
import { generateOutline, type GenInput } from "./generators.js";
import { insertAlert } from "./ops-store.js";

/* ------------------------------------------------------------------ */
/* T-9 â€” article pipeline                                              */
/* ------------------------------------------------------------------ */

export interface ArticleBrief { id: string; createdAt: string; keyword: string; intent: "informational" | "commercial" | "transactional" | "navigational"; audience: string; brand: string; angles: string[]; entities: string[]; faq: string[]; existingHeadings: string[] }
export interface QualityGate { check: string; passed: boolean; detail: string; points?: number; max?: number }
export interface ArticleDraft { id: string; briefId: string; createdAt: string; title: string; slug: string; metaDescription: string; outline: Array<{ h2: string; bullets: string[] }>; body: string; wordCount: number; gates: QualityGate[]; approved: boolean; generatedBy: "deterministic" | "ollama" | "byok" }
export type DraftMode = "deterministic" | "ollama";

/** Deterministic brief from a keyword + tenant site profile. */
export function buildBrief(input: { keyword: string; audience?: string; brand?: string; intent?: ArticleBrief["intent"]; existingHeadings?: string[] }): ArticleBrief {
  const keyword = input.keyword.trim();
  if (!keyword || keyword.length > 200) throw new Error("Mot-clÃ© invalide.");
  const intent = input.intent ?? (/\b( prix |tarif|coÃ»t|achat|acheter|devis|login|connexion)\b/i.test(` ${keyword} `) ? "transactional" : /\b(vs|comparatif|meilleur|alternative|logiciel|outil)\b/i.test(keyword) ? "commercial" : /\b(comment|guide|Ã©tapes|tutorial|qu'est-ce|what is|how to)\b/i.test(keyword) ? "informational" : "informational");
  const angles = [
    `DÃ©finition claire : Â« ${keyword} Â», rÃ©ponse directe dÃ¨s les 60 premiers mots`,
    `Chiffres et sources nommÃ©es sur Â« ${keyword} Â» (statistiques datÃ©es, Ã©tudes)`,
    `Comparatif ou liste structurÃ©e pour Â« ${keyword} Â» (format citable par les IA)`,
    `Erreurs frÃ©quentes et comment les Ã©viter autour de Â« ${keyword} Â»`,
    `Ã‰tude de courte durÃ©e : comment ${input.brand ?? "votre marque"} rÃ©sout Â« ${keyword} Â»`,
  ];
  const entities = [keyword, input.brand ?? "", "Google Search Console", "GA4", "Core Web Vitals"].filter(Boolean);
  const faq = [
    `Qu'est-ce que ${keyword} ?`,
    `Combien coÃ»te ${keyword} en 2026 ?`,
    `Quels sont les critÃ¨res pour rÃ©ussir ${keyword} ?`,
    `${keyword} : par oÃ¹ commencer ?`,
  ];
  return { id: randomUUID(), createdAt: new Date().toISOString(), keyword, intent, audience: (input.audience ?? "DÃ©cideurs et Ã©quipes marketing").slice(0, 120), brand: (input.brand ?? "").slice(0, 100), angles, entities, faq, existingHeadings: (input.existingHeadings ?? []).slice(0, 30) };
}

/** Deterministic draft skeleton from a brief, reusing the existing outline
 * generator so the structure matches the house style (FR). */
export function buildDraftSkeleton(brief: ArticleBrief): { title: string; slug: string; metaDescription: string; outline: Array<{ h2: string; bullets: string[] }> } {
  const genInput: GenInput = { keyword: brief.keyword, brand: brief.brand || "KayrosLab", audience: brief.audience };
  const plan = generateOutline({ ...genInput, existingHeadings: brief.existingHeadings });
  const title = `${brief.keyword.charAt(0).toUpperCase() + brief.keyword.slice(1)} : le guide complet (2026)`;
  const slug = brief.keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  const metaDescription = `${brief.keyword} : mÃ©thode complÃ¨te, chiffres 2026 et erreurs Ã  Ã©viter. Guide pratique pour ${brief.audience.toLowerCase()}.`.slice(0, 158);
  const outline = plan.sections.map((s: { h2: string; h3: string[] }) => ({ h2: s.h2, bullets: s.h3 }));
  const faqQuestions = (plan.faq?.length ? plan.faq : brief.faq).slice(0, 6);
  outline.push({ h2: "FAQ", bullets: faqQuestions });
  return { title, slug, metaDescription, outline };
}
/** Deterministic quality gates (T-9's differentiator): a draft must pass
 * before publishing. Scored against the repo's own GEO principles. */
export function qualityGates(draft: { title: string; metaDescription: string; outline: Array<{ h2: string; bullets: string[] }>; body: string }): QualityGate[] {
  const words = draft.body ? draft.body.trim().split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const firstBlock = draft.outline[0];
  const answerFirst = Boolean(firstBlock && /^(Qu'est-ce|DÃ©finition|Comprendre|Introduction|Le guide)/i.test(firstBlock.h2));
  const faqSection = draft.outline.some((s) => /faq|questions/i.test(s.h2));
  const listsUsed = draft.outline.some((s) => s.bullets.length >= 3);
  const titleLen = draft.title.length;
  const metaLen = draft.metaDescription.length;
  return [
    { check: "title.length", passed: titleLen >= 30 && titleLen <= 65, detail: `${titleLen} caractÃ¨res (cible 30â€“65)` },
    { check: "meta.length", passed: metaLen >= 120 && metaLen <= 158, detail: `${metaLen} caractÃ¨res (cible 120â€“158)` },
    { check: "answer-first", passed: answerFirst, detail: answerFirst ? "PremiÃ¨re section = rÃ©ponse directe" : "Ouvrir par une section rÃ©ponse directe (dÃ©finition)" },
    { check: "faq-section", passed: faqSection, detail: faqSection ? "Section FAQ prÃ©sente" : "Ajouter une section FAQ (FAQPage schema)" },
    { check: "word-count", passed: wordCount >= 800, detail: `${wordCount} mots (minimum 800 pour un guide)` },
    { check: "lists", passed: listsUsed, detail: listsUsed ? "Listes Ã  puces prÃ©sentes" : "Structurer au moins une section en liste (citabilitÃ© IA)" },
    { check: "entities", passed: /GTM|GA4|Search Console/i.test(draft.body) || draft.outline.some((s) => /GTM|GA4|Search Console/i.test(s.h2)), detail: "EntitÃ©s mÃ©tier prÃ©sentes dans le corps" },
  ].filter((g) => Boolean(g && g.check)) as QualityGate[];
}

/** Assemble the deterministic draft (mode "deterministic") or call Ollama for
 * long-form prose (mode "ollama"), then run the quality gates. */
export async function produceDraft(brief: ArticleBrief, mode: DraftMode, options: { ollama?: { url: string; model: string } | null; transport?: typeof fetch } = {}): Promise<ArticleDraft> {
  const skeleton = buildDraftSkeleton(brief);
  let body = "";
  let generatedBy: ArticleDraft["generatedBy"] = "deterministic";
  if (mode === "ollama" && options.ollama) {
    generatedBy = "ollama";
    const prompt = [
      `RÃ©dige un article de blog en franÃ§ais de 1800 Ã  2500 mots sur Â« ${brief.keyword} Â».`,
      `Public : ${brief.audience}. Marque : ${brief.brand || "neutre"}. Ton : expert, factuel, sans remplissage.`,
      `Structure H2 obligatoire : ${skeleton.outline.map((s) => s.h2).join(" | ")}.`,
      `Contraintes : rÃ©ponse directe dans les 60 premiers mots, chiffres datÃ©s et sources nommÃ©es, listes Ã  puces, FAQ finale en 4 questions.`,
      `Interdits : phrases creuses, superlatifs non sourcÃ©s, mentions de concurrents.`,
      `Sortie : markdown, H2 en ##, H3 en ###.`,
    ].join("\n");
    const res = await (options.transport ?? fetch)(`${options.ollama.url.replace(/\/$/, "")}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: options.ollama.model, prompt, stream: false, options: { temperature: 0.6 } }), signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    body = ((await res.json()) as { response?: string }).response?.trim() ?? "";
    if (!body) throw new Error("Ollama n'a rien produit");
  } else {
    // Deterministic scaffold: section skeletons with guidance â€” the editor
    // writes the prose, the pipeline guarantees the structure.
    body = [`# ${skeleton.title}`, "", `> ${skeleton.metaDescription}`, ""].join("\n");
    for (const section of skeleton.outline) {
      body += `\n## ${section.h2}\n\n`;
      for (const bullet of section.bullets) body += `- ${bullet}\n`;
      body += `\n<!-- Ã€ rÃ©diger : 200â€“400 mots, rÃ©ponse directe, 2â€“3 chiffres datÃ©s, 1 liste -->\n`;
    }
    body += `\n## FAQ\n\n`;
    for (const q of brief.faq) body += `### ${q}\n\n<!-- RÃ©ponse : 40â€“80 mots, autonome -->\n`;
  }
  const gates = qualityGates({ title: skeleton.title, metaDescription: skeleton.metaDescription, outline: skeleton.outline, body });
  return { id: randomUUID(), briefId: brief.id, createdAt: new Date().toISOString(), title: skeleton.title, slug: skeleton.slug, metaDescription: skeleton.metaDescription, outline: skeleton.outline, body, wordCount: body.split(/\s+/).filter(Boolean).length, gates, approved: false, generatedBy };
}

/* ------------------------------------------------------------------ */
/* T-10 â€” WordPress publishing                                         */
/* ------------------------------------------------------------------ */

export interface WordPressConfig { siteUrl: string; username: string; appPassword: string }
export interface PublishResult { published: boolean; postUrl: string | null; postId: number | null; error: string | null; indexNow: unknown }

export function wpConfigFromEnv(tenantId: string, env: NodeJS.ProcessEnv = process.env): WordPressConfig | null {
  const suffix = tenantId.toUpperCase().replace(/-/g, "_");
  const siteUrl = env[`WP_SITE_URL_${suffix}`], username = env[`WP_USERNAME_${suffix}`], appPassword = env[`WP_APP_PASSWORD_${suffix}`];
  if (!siteUrl || !username || !appPassword) return null;
  return { siteUrl: siteUrl.replace(/\/$/, ""), username, appPassword };
}

/** Publish a draft to WordPress as a draft post (never live directly:
 * the route layer requires approval first). Returns the post id/url. */
export async function publishToWordPress(config: WordPressConfig, draft: { title: string; slug: string; body: string }, transport: typeof fetch = fetch): Promise<{ ok: true; postId: number; link: string } | { ok: false; error: string }> {
  const auth = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");
  try {
    const res = await transport(`${config.siteUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ title: draft.title, slug: draft.slug, content: draft.body, status: "draft" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `WordPress ${res.status} ${detail.slice(0, 200)}` };
    }
    const post = await res.json() as { id: number; link: string };
    return { ok: true, postId: post.id, link: post.link };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** After a successful publish: announce the URL through IndexNow (existing
 * client, gated by confirm in the caller). */
export async function announceViaIndexNow(host: string, url: string, key: string, transport: typeof fetch = fetch): Promise<{ announced: boolean; status: string | null; error: string | null }> {
  try {
    const { submitUrls } = await import("../indexnow/client.js");
    const result = await submitUrls({ host, key, urls: [url], confirm: true }, { fetcher: transport });
    return { announced: true, status: String(result), error: null };
  } catch (error) {
    return { announced: false, status: null, error: (error as Error).message };
  }
}

export function articleAlert(tenantId: string, draft: { title?: string }, event: string): void {
  void insertAlert(tenantId, { kind: "article", severity: "info", title: `${event} : ${(draft.title ?? "brouillon").slice(0, 120)}`, detail: `Pipeline article â€” ${event.toLowerCase()}.`, payload: { event } });
}
