import { el, table } from "./render.js";
import { LANG } from "./i18n.js";
import { renderDataGuide } from "./data-guidance.js";
import { thumbnail, gauge, sourceBadge, safeImageUrl } from "./visuals.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (label, fn, cls = "c-btn") => { const b = el("button", cls, label); b.type = "button"; b.onclick = fn; return b; };
const ratio = (items, predicate) => items.length ? 100 * items.filter(predicate).length / items.length : null;
const complete = item => [item.name, item.description, item.url, item.imageUrl].filter(Boolean).length / 4 * 100;
export function renderCatalog({ api, state, me, onLoaded = () => {} }) {
  const root = el("section", "v-catalog"), output = el("div"), status = el("p", "c-note"); status.setAttribute("role", "status");
  root.append(el("p", "c-note", L("Retrouvez les visuels, produits et pages réellement publiés sur votre site. Les jauges mesurent la complétude des métadonnées de l’échantillon, pas la visibilité dans les réponses IA.", "Find the images, products and pages actually published on your site. Gauges measure metadata completeness in this sample, not visibility in AI answers.")), status, output);
  if (!state.url) { output.append(renderDataGuide("domain")); return root; }
  let data, query = "", filter = "all", mode = "cards", sort = "completeness";
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  async function load() {
    status.textContent = L("Lecture des images et du catalogue…", "Reading images and catalogue…");
    try { data = await api("/visual/catalog", { url: state.url }); status.textContent = ""; onLoaded(data); draw(); }
    catch (error) { status.textContent = ""; output.replaceChildren(renderDataGuide("catalog", { error, retry: load })); importForm(output); }
  }
  function detail(item) {
    const d = el("details", "v-item-detail"), summary = el("summary", "", L("Voir les informations et les images", "View information and images")); d.append(summary);
    const gallery = el("div", "v-gallery"); for (const src of item.images || []) { if (!safeImageUrl(src)) continue; const a = el("a"); a.href = src; a.target = "_blank"; a.rel = "noopener noreferrer"; a.append(thumbnail({ ...item, imageUrl: src }, "large")); gallery.append(a); } d.append(gallery);
    if (!item.imageUrl) d.append(el("p", "c-note", L("Aucune image fournie. Ajoutez image dans le balisage Product ou og:image dans la page, ou importez une URL d’image HTTPS ci-dessous.", "No image supplied. Add image to Product markup or og:image to the page, or import an HTTPS image URL below.")));
    d.append(el("p", "", item.description || L("Description non fournie.", "Description not supplied.")), table([{ brand: item.brand, sku: item.sku, gtin: item.gtin, availability: item.availability }], [["brand", L("Marque", "Brand")], ["sku", "SKU / MPN"], ["gtin", "GTIN"], ["availability", L("Disponibilité", "Availability")]]), sourceBadge(item.source), el("p", "c-note", `${L("Lu / importé le", "Read / imported on")} ${item.observedAt?.slice(0, 10) || "—"}`));
    const link = el("a", "v-context-link", L("Ouvrir la page source ↗", "Open source page ↗")); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; d.append(link); return d;
  }
  function draw() {
    output.replaceChildren();
    const items = data.items || [], products = items.filter(i => i.kind === "product"), gauges = el("div", "v-gauge-grid");
    gauges.append(gauge(L("Images disponibles", "Images supplied"), ratio(items, i => Boolean(i.imageUrl)), `${items.filter(i => i.imageUrl).length} / ${items.length} ${L("éléments", "items")}`), gauge(L("Informations essentielles", "Essential information"), items.length ? items.reduce((sum, i) => sum + complete(i), 0) / items.length : null, L("Nom, description, URL et image", "Name, description, URL and image")), gauge(L("Identifiants produits", "Product identifiers"), ratio(products, i => Boolean(i.brand && (i.gtin || i.sku))), L("Marque et GTIN, SKU ou MPN", "Brand and GTIN, SKU or MPN")), gauge(L("Offres renseignées", "Offer information"), ratio(products, i => Boolean(i.price && i.currency && i.availability)), L("Prix, devise et disponibilité", "Price, currency and availability")));
    output.append(gauges, el("p", "c-note", L(`${data.pagesRead || 0} pages lues, limite de ${data.pageLimit || 6} par lecture · ${data.imported || 0} éléments importés. Cet échantillon n’est pas un inventaire exhaustif.`, `${data.pagesRead || 0} pages read, limit ${data.pageLimit || 6} per scan · ${data.imported || 0} imported items. This sample is not an exhaustive inventory.`)));
    if (data.warnings?.length) { const warnings = el("details", "v-warning"); warnings.append(el("summary", "", L(`${data.warnings.length} pages non lues — voir pourquoi`, `${data.warnings.length} pages not read — see why`))); for (const w of data.warnings) warnings.append(el("p", "c-note", `${w.url} · ${w.reason}`)); output.append(warnings); }
    const controls = el("div", "v-catalog-controls"), tabs = el("div", "c-seg");
    for (const [value, label] of [["all", L("Tout", "All")], ["product", L("Produits", "Products")], ["page", "Pages"], ["missing", L("Images manquantes", "Missing images")]]) { const b = button(label, () => { filter = value; draw(); }, `c-seg-btn${filter === value ? " is-active" : ""}`); b.setAttribute("aria-pressed", String(filter === value)); tabs.append(b); }
    const search = el("input", "c-filter"); search.type = "search"; search.placeholder = L("Rechercher un produit ou une page…", "Search products or pages…"); search.setAttribute("aria-label", search.placeholder); search.value = query;
    const sortInput = el("select", "c-btn"); sortInput.setAttribute("aria-label", L("Trier le catalogue", "Sort catalogue")); for (const [value, label] of [["completeness", L("Complétude", "Completeness")], ["name", L("Nom", "Name")]]) { const option = el("option", "", label); option.value = value; sortInput.append(option); } sortInput.value = sort; sortInput.onchange = () => { sort = sortInput.value; drawItems(); };
    const toggle = button(mode === "cards" ? L("Vue tableau", "Table view") : L("Vue cartes", "Card view"), () => { mode = mode === "cards" ? "table" : "cards"; draw(); });
    controls.append(tabs, search, sortInput, toggle, button(L("Relire le site", "Read site again"), loadFresh));
    const list = el("div", "v-catalog-results"); search.oninput = () => { query = search.value; drawItems(); }; output.append(controls, list);
    function drawItems() {
      let rows = items.filter(i => (filter === "all" || filter === "missing" && !i.imageUrl || i.kind === filter) && `${i.name} ${i.brand} ${i.url}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      rows = [...rows].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, LANG) : complete(b) - complete(a) || a.name.localeCompare(b.name, LANG));
      list.replaceChildren(el("p", "c-note", `${rows.length} ${L("éléments affichés", "items shown")}`));
      if (!rows.length) { list.append(el("p", "c-note", L("Aucun élément ne correspond. Réinitialisez les filtres ou ajoutez votre catalogue par import.", "No matching items. Reset filters or add your catalogue by import.")), button(L("Réinitialiser les filtres", "Reset filters"), () => { query = ""; filter = "all"; draw(); })); return; }
      if (mode === "cards") {
        const grid = el("div", "v-product-grid");
        for (const item of rows) { const card = el("article", "v-product-card"), meta = el("div", "v-product-meta"); meta.append(sourceBadge(item.kind === "product" ? L("Produit", "Product") : "Page"), el("span", "v-completeness", `${complete(item)} % · ${L("complétude", "complete")}`)); card.append(meta, thumbnail(item, "hero"), el("h3", "", item.name), el("p", "c-note", item.brand || new URL(item.url).hostname), el("strong", "v-price", item.price ? `${item.price} ${item.currency}` : L("Prix non fourni", "Price not supplied")), detail(item)); grid.append(card); } list.append(grid);
      } else {
        list.append(table(rows, [[i => { const box = el("div"); const row = el("div", "v-entity"); row.append(thumbnail(i), el("strong", "", i.name)); box.append(row, detail(i)); return box; }, L("Produit / page", "Product / page")], [i => `${complete(i)} %`, L("Complétude", "Completeness")], ["brand", L("Marque", "Brand")], [i => i.price ? `${i.price} ${i.currency}` : "—", L("Prix publié", "Published price")], ["source", "Source"]]));
      }
    }
    drawItems();
    if (!products.length) output.append(el("p", "v-warning", L("Aucun Product JSON-LD détecté dans les pages lues. Ouvrez une fiche produit comme domaine analysé, ajoutez le balisage Product au site, ou importez votre catalogue. Les aperçus de pages restent disponibles.", "No Product JSON-LD found in the scanned pages. Open a product page as the analyzed URL, add Product markup to your site, or import your catalogue. Page previews remain available.")));
    importForm(output);
  }
  async function loadFresh() { await onLoaded(null); await load(); }
  function importForm(parent) {
    const help = el("details", "ai-import v-import"), summary = el("summary", "", L("Ajouter ou corriger les images et le catalogue", "Add or correct images and catalogue")); help.append(summary);
    const steps = el("ol", "c-list"); for (const line of [L("Publiez une image HTTPS accessible sans connexion ; les images restent hébergées sur votre site ou CDN.", "Publish an HTTPS image accessible without sign-in; images remain hosted on your site or CDN."), L("Ajoutez Product.image à vos fiches et og:image aux pages. Vous pouvez aussi importer un fichier JSON ci-dessous.", "Add Product.image to product pages and og:image to pages. You can also import a JSON file below."), L("Prévisualisez le fichier, puis enregistrez-le. L’import remplace les compléments précédemment importés pour ce site, sans modifier votre site.", "Preview the file, then save it. Import replaces the previously imported additions for this site without changing your website.")]) steps.append(el("li", "", line)); help.append(steps);
    if (!admin) { help.append(el("p", "c-note", L("Demandez à l’administrateur du client d’effectuer l’import.", "Ask the customer administrator to import the file."))); parent.append(help); return; }
    const input = el("textarea"); input.rows = 7; input.setAttribute("aria-label", L("Catalogue JSON", "JSON catalogue")); input.placeholder = JSON.stringify([{ kind: "product", name: L("Nom du produit", "Product name"), url: state.url, imageUrl: "https://cdn.example.com/product.jpg", description: "", brand: "", sku: "", price: "", currency: "EUR", availability: "" }], null, 2);
    const file = el("input"); file.type = "file"; file.accept = ".json,application/json"; file.setAttribute("aria-label", L("Importer un fichier JSON", "Import a JSON file"));
    const feedback = el("p", "c-note"); feedback.setAttribute("role", "status"); const preview = el("div"); let approved = null;
    const save = button(L("Enregistrer ce catalogue", "Save this catalogue"), async () => { if (!approved) return; save.disabled = true; try { await api("/visual/import", { url: state.url, items: approved }); await loadFresh(); } catch (error) { feedback.textContent = error.message; save.disabled = false; } }); save.disabled = true;
    input.oninput = () => { approved = null; save.disabled = true; preview.replaceChildren(); };
    file.onchange = async () => { try { const selected = file.files?.[0]; if (!selected) return; if (selected.size > 1000000) throw new Error(L("Fichier limité à 1 Mo.", "File limit: 1 MB.")); input.value = await selected.text(); input.oninput(); feedback.textContent = L("Fichier chargé. Prévisualisez avant d’enregistrer.", "File loaded. Preview before saving."); } catch (error) { feedback.textContent = error.message; } };
    const validate = button(L("Prévisualiser l’import", "Preview import"), async () => { approved = null; save.disabled = true; try { const value = JSON.parse(input.value), result = await api("/visual/import-preview", { url: state.url, items: Array.isArray(value) ? value : value.items }); approved = result.items; preview.replaceChildren(el("p", "", `${approved.length} ${L("éléments valides", "valid items")}`), ...approved.slice(0, 6).map(i => { const card = el("div", "v-entity"); card.append(thumbnail(i), el("span", "", i.name)); return card; })); save.disabled = false; feedback.textContent = ""; } catch (error) { feedback.textContent = error.message; } });
    help.append(file, input, validate, save, feedback, preview); parent.append(help);
  }
  load(); return root;
}
