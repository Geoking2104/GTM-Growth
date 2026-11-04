/* Visual sitemap renderer. Layout conventions are adapted from SlickMap CSS v2
 * by Matt Everson / Astuteo: https://github.com/astuteo/slickmap/tree/master-v2-updated-skin */
const text = (value) => document.createTextNode(value);
function treeFrom(nodes) {
  const root = { children: new Map(), page: null };
  for (const node of nodes) {
    let cursor = root; const parts = new URL(node.url).pathname.split("/").filter(Boolean);
    if (!parts.length) { cursor.page = node; continue; }
    for (const part of parts) { if (!cursor.children.has(part)) cursor.children.set(part, { children: new Map(), page: null }); cursor = cursor.children.get(part); }
    cursor.page = node;
  }
  return root;
}
function branch(branchData, depth = 0) {
  const list = document.createElement("ul"); list.className = depth ? "slickmap-children" : "slickmap-tree";
  for (const [segment, child] of [...branchData.children.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const item = document.createElement("li"); const card = document.createElement(child.page ? "a" : "span");
    card.className = child.page ? "map-page" : "map-group";
    if (child.page) {
      card.href = child.page.url; card.target = "_blank"; card.rel = "noopener noreferrer"; card.title = child.page.url;
      card.append(text(child.page.label === "Home" ? "Home /" : child.page.label));
      const meta = document.createElement("small"); meta.textContent = child.page.lastmod ? `updated ${child.page.lastmod}` : "no lastmod"; card.append(meta);
    } else card.textContent = segment.replace(/[-_]+/g, " ");
    item.append(card); if (child.children.size) item.append(branch(child, depth + 1)); list.append(item);
  }
  return list;
}
function metric(label, value) { const el = document.createElement("div"); el.className = "map-metric"; const strong = document.createElement("strong"); strong.textContent = value; const span = document.createElement("span"); span.textContent = label; el.append(strong, span); return el; }
/** Render only observed sitemap architecture; this is not a traffic visualisation. */
export function renderSitemapMap(host, map, lang = "en") {
  if (!host) return; host.replaceChildren();
  if (!map) { const note = document.createElement("p"); note.className = "sitemap-map-note"; note.textContent = lang === "fr" ? "La carte devient disponible lorsqu’une lecture serveur trouve un sitemap XML public." : "The map becomes available when a server read finds a public XML sitemap."; host.append(note); return; }
  const metrics = document.createElement("div"); metrics.className = "sitemap-metrics";
  metrics.append(metric(lang === "fr" ? "URL déclarées" : "Declared URLs", String(map.nodeCount)), metric(lang === "fr" ? "Profondeur max." : "Max depth", String(map.metrics.maxDepth)), metric(lang === "fr" ? "Couverture lastmod" : "lastmod coverage", `${map.metrics.lastmodCoveragePercent}%`), metric(lang === "fr" ? "Sections" : "Sections", String(map.metrics.sections.length)));
  const sections = document.createElement("p"); sections.className = "sitemap-sections"; sections.textContent = map.metrics.sections.map((row) => `${row.label} (${row.pages})`).join(" · ");
  const shell = document.createElement("div"); shell.className = "slickmap"; const root = document.createElement("div"); root.className = "map-root"; root.textContent = new URL(map.nodes[0]?.url || map.sitemapUrl).hostname; shell.append(root, branch(treeFrom(map.nodes)));
  host.append(metrics, sections, shell);
  if (map.truncated) { const note = document.createElement("p"); note.className = "sitemap-map-note"; note.textContent = lang === "fr" ? `Vue limitée aux ${map.shownNodeCount} premières URL sur ${map.nodeCount}.` : `View limited to the first ${map.shownNodeCount} of ${map.nodeCount} URLs.`; host.append(note); }
}
