/* AI-crawler analytics console panel (R6): crawl coverage per site section from
 * tenant-supplied server/CDN access logs, plus Apply-Mode dry-run drafts of the
 * AI-bot robots policy and an llms.txt skeleton. Evidence-first: the analysis
 * covers only the supplied lines (unknown stays "—", never zero) and the
 * policy drafts never override existing rules. Analysis is free: no partner
 * call, nothing stored. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (text, callback) => { const b = el("button", "btn btn-small", text); b.type = "button"; b.onclick = callback; return b; };
const dash = (value) => value === null || value === undefined ? "—" : String(value);
/** The four R6 crawlers plus the citation/on-demand fetchers verified in the registry. */
const POLICY_BOTS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "ChatGPT-User"];

function diffBlock(summary, diff) {
  const details = el("details", "ai-crawlers-diff");
  details.append(el("summary", "", summary), (() => {
    const pre = el("pre", "apply-diff");
    for (const line of (diff || L("Aucune différence.", "No difference.")).split("\n")) {
      const cls = line.startsWith("+") && !line.startsWith("+++") ? "apply-added" : line.startsWith("-") && !line.startsWith("---") ? "apply-removed" : "";
      pre.append(el("span", cls, line));
    }
    return pre;
  })());
  return details;
}

export function renderOpsAiCrawlers({ api, me }) {
  const box = el("section", "app-strip ops-ai-crawlers");
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const content = el("div"); const message = el("p", "c-note"); message.setAttribute("role", "status");
  box.append(
    el("h3", "", L("Analytics crawlers IA", "AI crawler analytics")),
    el("p", "c-note", L("Collez un extrait de journaux d'accès (format nginx combiné) : la couverture de crawl de GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot et des autres crawlers IA est mesurée par section du site. Analyse fondée uniquement sur les lignes fournies ; rien n'est stocké ni inventé.", "Paste an extract of server/CDN access logs (nginx combined format): the crawl coverage of GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and the other AI crawlers is measured per site section. The analysis covers the supplied lines only; nothing is stored or invented.")),
    content, message,
  );

  /* Log analysis. */
  const logsInput = el("textarea"); logsInput.rows = 6; logsInput.style.width = "100%";
  logsInput.setAttribute("aria-label", L("Journaux d'accès (format nginx combiné)", "Access logs (nginx combined format)"));
  const logsResult = el("div");
  const analyzeButton = button(L("Analyser les logs", "Analyze logs"), async () => {
    message.textContent = L("Analyse des lignes fournies…", "Analysing the supplied lines…");
    try {
      const stats = await api("/ai-crawlers/analyze", { logs: logsInput.value });
      message.textContent = "";
      const wrap = el("div");
      wrap.append(el("p", "c-note",
        L("Origine : journaux fournis par le client", "Source: tenant-supplied logs") +
        ` · ${L("analysé le", "parsed on")} ${(stats.provenance?.parsedAt ?? "").slice(0, 16).replace("T", " ")}` +
        ` · ${L("lignes analysables", "parsable lines")} ${dash(stats.totals?.parsed)}/${dash(stats.totals?.lines)}` +
        ` · ${L("crawlers IA", "AI crawlers")} ${dash(stats.totals?.crawlerRequests)} / ${L("autres requêtes", "other requests")} ${dash(stats.totals?.otherRequests)}`));
      const crawlerTable = el("table", "c-table"); const head = el("tr");
      for (const h of [L("Crawler", "Crawler"), L("Propriétaire", "Owner"), L("Requêtes", "Requests"), L("Pages", "Pages"), L("Servies 2xx", "Served 2xx"), L("Erreurs", "Errors")]) head.append(el("th", "", h));
      crawlerTable.append(head);
      for (const r of stats.crawlers ?? []) {
        const tr = el("tr");
        for (const v of [r.bot, r.owner ?? "—", r.requests, r.pages, r.served, r.errors]) tr.append(el("td", "", String(v ?? "—")));
        crawlerTable.append(tr);
      }
      if (!(stats.crawlers ?? []).length) wrap.append(el("p", "c-note", L("Aucun crawler IA identifié dans les lignes fournies ; les sections non crawlées dans la période restent inconnues, jamais zéro.", "No AI crawler identified in the supplied lines; sections not crawled in the period stay unknown, never zero.")));
      else wrap.append(crawlerTable);
      const sectionTable = el("table", "c-table"); const sectionHead = el("tr");
      for (const h of [L("Section", "Section"), L("Requêtes IA", "AI requests"), L("Pages", "Pages"), L("Répartition crawlers", "Crawler split")]) sectionHead.append(el("th", "", h));
      sectionTable.append(sectionHead);
      for (const s of stats.sections ?? []) {
        const tr = el("tr");
        tr.append(el("td", "", s.section), el("td", "", String(s.requests)), el("td", "", String(s.pages)), el("td", "", Object.entries(s.byCrawler ?? {}).map(([bot, count]) => `${bot} ${count}`).join(" · ") || "—"));
        sectionTable.append(tr);
      }
      if ((stats.sections ?? []).length) wrap.append(sectionTable);
      wrap.append(el("p", "c-note", `${stats.note ?? ""} ${L("Période couverte", "Covered period")} : ${(stats.firstSeenAt ?? "").slice(0, 10)} → ${(stats.lastSeenAt ?? "").slice(0, 10)}`));
      logsResult.replaceChildren(wrap);
    } catch (error) { message.textContent = error.message; }
  });
  analyzeButton.disabled = true;
  const logsRow = el("p"); logsRow.append(logsInput, document.createTextNode(" "), analyzeButton);

  /* Apply-Mode policy drafts. */
  const urlInput = el("input"); urlInput.type = "url"; urlInput.size = 36;
  urlInput.value = me?.tenant?.domains?.[0] ? `https://${me.tenant.domains[0]}` : "";
  urlInput.setAttribute("aria-label", L("Site (origine HTTPS publique)", "Website (public HTTPS origin)"));
  const selects = [];
  const labels = [];
  for (const bot of POLICY_BOTS) {
    const label = el("label", "c-note");
    const select = el("select");
    for (const [value, text] of [["allow", L("autoriser", "allow")], ["disallow", L("refuser", "disallow")], ["none", L("ne rien faire", "leave untouched")]]) {
      const option = el("option", "", text); option.value = value; option.selected = value === "allow"; select.append(option);
    }
    label.append(el("span", "", bot), document.createTextNode(" "), select);
    selects.push({ bot, select }); labels.push(label);
  }
  const policyResult = el("div");
  const draftButton = button(L("Générer les projets (dry-run)", "Generate the drafts (dry-run)"), async () => {
    message.textContent = L("Construction des textes projetés…", "Building the draft texts…");
    try {
      const result = await api("/apply/ai-crawlers/policy", {
        url: urlInput.value,
        choices: selects.filter(({ select }) => select.value !== "none").map(({ bot, select }) => ({ agent: bot, action: select.value })),
      });
      message.textContent = "";
      const policy = result.policy;
      const wrap = el("div");
      wrap.append(el("p", "c-note", result.writesEnabled === false && result.requiresSeparateDomainVerificationAndApproval
        ? L("Simulation uniquement. Aucun writer n'est branché : la publication reste derrière la vérification de domaine, l'approbation et le rollback d'Apply Mode.", "Preview only. No writer is wired: publishing stays behind Apply Mode's domain verification, approval and rollback.")
        : L("Réponse importée invalide.", "Invalid draft response.")));
      if (policy.robots?.manualReview?.length) {
        const list = el("ul", "tracked-list");
        for (const item of policy.robots.manualReview) list.append(el("li", "", item));
        wrap.append(el("p", "c-note", L("Revue humaine :", "Manual review:")), list);
      }
      wrap.append(diffBlock(L("robots.txt — diff projeté", "robots.txt — proposed diff"), policy.robots?.diff));
      wrap.append(diffBlock(L("llms.txt — projet", "llms.txt — draft"), policy.llms?.diff ?? policy.llms?.after));
      const open = el("a", "decision-link", L("Ouvrir Apply Mode →", "Open Apply Mode →")); open.href = "#apply_mode";
      wrap.append(open);
      policyResult.replaceChildren(wrap);
    } catch (error) { message.textContent = error.message; }
  });
  draftButton.disabled = true;
  const policyRow = el("p"); policyRow.append(urlInput, document.createTextNode(" "), draftButton);
  const policyBox = el("div");
  policyBox.append(el("h4", "", L("Politique robots IA + squelette llms.txt (dry-run)", "AI robots policy + llms.txt skeleton (dry-run)")),
    el("p", "c-note", L("Un choix explicite par crawler ; vos règles robots existantes ne sont jamais réécrites et les descriptions llms.txt restent à compléter.", "One explicit choice per crawler; your existing robots rules are never rewritten and the llms.txt descriptions stay yours to fill in.")));
  for (const label of labels) policyBox.append(label);
  policyBox.append(policyRow, policyResult);

  content.append(el("h4", "", L("Couverture de crawl par IA", "AI crawl coverage")), logsRow, logsResult, policyBox);
  if (admin) { analyzeButton.disabled = false; draftButton.disabled = false; }
  else {
    analyzeButton.disabled = true; draftButton.disabled = true;
    box.append(el("p", "c-note", L("Seuls les administrateurs du client peuvent analyser des journaux ou générer des projets.", "Only tenant administrators can analyze logs or generate drafts.")));
  }
  return box;
}
