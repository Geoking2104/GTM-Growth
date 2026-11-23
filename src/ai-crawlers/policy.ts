/**
 * AI-bot robots and llms.txt policy drafts (R6) for Apply Mode. Deterministic,
 * read-only text drafts: the tenant chooses "allow" or "disallow" per AI
 * crawler, existing robots groups are never overridden (kept and reported for
 * manual review), and the llms.txt draft is a bounded skeleton whose
 * descriptions must be filled by the operator — no content is invented. No
 * writer, no execution path: publishing stays behind the existing Apply Mode
 * domain-verification/approval discipline.
 */
import { boundedLcsDiff } from "../apply/preview.js";
import { AI_BOTS } from "../geo/config.js";
import { classifyBot, parseRobots } from "../geo/robots.js";

export const AI_CRAWLER_POLICY_VERSION = "ai-crawler-policy-draft-v1";
const ROBOTS_TEXT_BUDGET = 64 * 1024;
const ROBOTS_LINE_BUDGET = 400;

export interface AiCrawlerChoice {
  /** Exact AI_BOTS user-agent token, as documented in the platform registry. */
  agent: string;
  action: "allow" | "disallow";
}

export interface AiCrawlerPolicyDraft {
  version: typeof AI_CRAWLER_POLICY_VERSION;
  mode: "dry-run";
  robots: { before: string; after: string; diff: string; changed: boolean; manualReview: string[] };
  llms: { before: string | null; after: string; diff: string | null; changed: boolean };
  changed: boolean;
  note: string;
}

function bounded(value: string, label: string): string {
  if (Buffer.byteLength(value, "utf8") > ROBOTS_TEXT_BUDGET || value.includes("\0") ||
      value.split("\n").length > ROBOTS_LINE_BUDGET)
    throw new Error(`${label} dépasse le budget de texte sûr`);
  return value;
}

/** Parse and bound the crawler choices: exact registry tokens only, no duplicates. */
export function parseCrawlerChoices(raw: unknown): AiCrawlerChoice[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error("Choisissez au moins un crawler IA (autoriser ou refuser).");
  const seen = new Set<string>();
  const choices: AiCrawlerChoice[] = [];
  const registry = Object.keys(AI_BOTS);
  for (const item of raw) {
    const record = item as Record<string, unknown>;
    const agent = typeof record?.agent === "string" ? record.agent.trim() : "";
    const action = record?.action;
    if (!registry.includes(agent))
      throw new Error(`Crawler IA inconnu : ${agent || "(vide)"} ; utilisez les agents exacts du registre de la plateforme.`);
    if (action !== "allow" && action !== "disallow")
      throw new Error(`Action invalide pour ${agent} : autoriser ou refuser.`);
    if (seen.has(agent)) throw new Error(`Choix en double pour ${agent} ; un seul choix par crawler.`);
    seen.add(agent);
    choices.push({ agent, action });
  }
  return choices;
}

/** Build the per-crawler policy draft (robots + llms.txt) without touching existing rules. */
export function buildAiCrawlerPolicyDraft(input: {
  baseUrl: string;
  currentRobots: string;
  currentLlms: string | null;
  choices: AiCrawlerChoice[];
}): AiCrawlerPolicyDraft {
  const site = new URL(/^https?:\/\//i.test(input.baseUrl) ? input.baseUrl : `https://${input.baseUrl}`);
  if (site.protocol !== "https:" || site.port || site.username || site.password || site.search || site.hash || site.pathname !== "/" || !site.hostname.includes("."))
    throw new Error("Le projet exige une origine HTTPS publique sans identifiant ni paramètre.");
  const before = bounded(input.currentRobots ?? "", "robots.txt actuel");
  const choices = parseCrawlerChoices(input.choices ?? []);
  if (input.currentLlms !== null && input.currentLlms !== undefined && input.currentLlms.length)
    bounded(input.currentLlms, "llms.txt actuel");

  const groups = before.trim() ? parseRobots(before) : {};
  const manualReview: string[] = [];
  const blocks: string[] = [];
  for (const { agent, action } of choices) {
    const existing = classifyBot(agent, groups);
    if (existing.status === "missing" || existing.viaWildcard) {
      blocks.push(`User-agent: ${agent}`, action === "allow" ? "Allow: /" : "Disallow: /", "");
      if (existing.viaWildcard)
        manualReview.push(`${agent} n'a pas de règle explicite (couvert par le groupe générique *) : un groupe ${action === "allow" ? "Allow: /" : "Disallow: /"} propre est proposé en ajout, votre groupe générique reste inchangé ; vérifiez la précédence robots.`);
    } else {
      manualReview.push(`Règle robots existante conservée pour ${agent} ; aucun règlage automatique ne surcharge votre écriture, modifiez-la à la main si besoin.`);
    }
  }

  const header = [
    "# robots IA — projet généré par gtm-growth (Apply Mode, dry-run)",
    "# Une seule règle explicite par crawler choisi ; vos règles existantes ne sont jamais réécrites.",
    "",
  ].join("\n");
  const core = blocks.length ? `${before.trim() ? `${before.replace(/\s+$/, "")}\n\n` : ""}${header}${blocks.join("\n").replace(/\n+$/, "")}\n` : `${before.replace(/\s+$/, "")}\n`;
  const robotsAfter = bounded(core, "robots.txt projeté");
  const robotsDiff = boundedLcsDiff("/robots.txt", "/robots.txt", before, robotsAfter);

  const accessLines = choices.map(({ agent, action }) =>
    `- ${agent} (${AI_BOTS[agent]}) : ${action === "allow" ? "autorisé" : "refusé"} (règle robots explicite proposée)`);
  const skeleton = [
    `# ${site.hostname}`,
    "> Description du site à compléter par l'exploitant ; aucune description n'est inventée automatiquement.",
    "",
    "## Accès des crawlers IA",
    ...accessLines,
    `- Règles complètes : ${site.origin}/robots.txt`,
    "",
    "## Contenus à documenter",
    `- [Page d'accueil](${site.origin}/) : à compléter`,
    "",
    "## Politique",
    "- llms.txt est un plan lisible pour les crawlers IA ; il ne remplace ni robots.txt ni le consentement des personnes.",
    "",
  ].join("\n");
  const llmsAfter = bounded(skeleton, "llms.txt projeté");
  const llmsBefore = input.currentLlms && input.currentLlms.length ? input.currentLlms : null;
  if (!input.currentLlms && blocks.length === 0 && !llmsBefore)
    manualReview.push("Aucun changement robots proposé : chaque crawler choisi possède déjà une règle explicite.");
  manualReview.push("Complétez les descriptions llms.txt avant publication ; le squelette ne contient aucune invention de contenu.");

  const robotsChanged = before !== robotsAfter;
  const llmsChanged = llmsBefore !== llmsAfter;
  return {
    version: AI_CRAWLER_POLICY_VERSION,
    mode: "dry-run",
    robots: { before, after: robotsAfter, diff: robotsDiff, changed: robotsChanged, manualReview },
    llms: { before: llmsBefore, after: llmsAfter, changed: llmsChanged, diff: llmsBefore === null ? null : boundedLcsDiff("/llms.txt", "/llms.txt", llmsBefore, llmsAfter) },
    changed: robotsChanged || llmsChanged,
    note: "Simulation uniquement (dry-run). Aucun writer n'est branché : la publication reste derrière la vérification de domaine, l'approbation et le rollback d'Apply Mode.",
  };
}
