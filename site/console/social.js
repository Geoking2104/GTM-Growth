import { LANG } from "./i18n.js";
import { el } from "./render.js";
const L = (fr, en) => (LANG === "fr" ? fr : en);
const errors = {
  SOCIAL_CONTEXT_MISSING: [
    "Cette page ne fournit pas de produit avec description. Saisissez les faits vérifiés ou choisissez une fiche produit précise.",
    "This page has no product with a description. Enter verified facts or choose a specific product page.",
  ],
  SOCIAL_ACCESS: [
    "Accès non autorisé pour ce rôle.",
    "This role does not have access.",
  ],
  SOCIAL_INDEPENDENT_APPROVER_REQUIRED: [
    "Un autre administrateur doit valider cette demande.",
    "A different administrator must review this request.",
  ],
  SOCIAL_CHANGED: [
    "Le contenu ou le contexte a changé. Rechargez et demandez une nouvelle validation.",
    "Content or context changed. Reload and request a new approval.",
  ],
  SOCIAL_POLICY_REQUIRED: [
    "Corrigez les points signalés avant de demander une validation.",
    "Resolve the policy findings before requesting approval.",
  ],
  SOCIAL_SCHEDULE_WINDOW: [
    "Choisissez une date à venir dans les 7 prochains jours pour demander une validation.",
    "Choose a future date within the next 7 days to request approval.",
  ],
  SOCIAL_APPROVAL_REQUIRED: [
    "Une validation valide et à jour est requise.",
    "A valid current approval is required.",
  ],
  SOCIAL_CONNECTOR_UNAVAILABLE: [
    "Le connecteur doit être configuré par votre administrateur.",
    "Your administrator needs to configure the connector.",
  ],
  SOCIAL_WRITE_DISABLED: [
    "Publication désactivée. Votre administrateur doit activer le connecteur après vérification.",
    "Publishing is disabled. Your administrator must enable the connector after verification.",
  ],
  SOCIAL_VETTING_REQUIRED: [
    "Le créateur doit être validé avant de préparer une prise de contact.",
    "The creator must be vetted before preparing outreach.",
  ],
  SOCIAL_CAMPAIGN_INACTIVE: [
    "Activez la campagne avant de programmer une publication.",
    "Activate the campaign before scheduling a post.",
  ],
  SOCIAL_SOURCE_OUTSIDE_CLIENT: [
    "Les pages et médias doivent appartenir aux domaines autorisés du client.",
    "Pages and media must belong to the client’s authorised domains.",
  ],
  SOCIAL_APPROVAL_EXISTS: [
    "Une demande existe déjà pour cette version.",
    "A request already exists for this version.",
  ],
  SOCIAL_INVALID: [
    "Vérifiez les champs, dates et formats.",
    "Check fields, dates and formats.",
  ],
};
const names = {
  PARTIAL: ["Publication partielle", "Partially published"],
  FAILED: ["Refusé par la plateforme", "Rejected by platform"],
  DRAFT: ["Brouillon", "Draft"],
  ACTIVE: ["Active", "Active"],
  PAUSED: ["En pause", "Paused"],
  COMPLETED: ["Terminée", "Completed"],
  ARCHIVED: ["Archivée", "Archived"],
  PENDING_APPROVAL: ["À valider", "Awaiting review"],
  PENDING: ["À valider", "Pending"],
  APPROVED: ["Approuvé", "Approved"],
  SCHEDULED: ["Programmé", "Scheduled"],
  PUBLISHING: ["Envoi en cours", "Publishing"],
  ACCEPTED: ["Accepté, à vérifier", "Accepted, awaiting readback"],
  PUBLISHED: ["Publié et vérifié", "Published and verified"],
  UNCERTAIN: ["Résultat incertain", "Uncertain result"],
  REJECTED: ["Refusé", "Rejected"],
  NEEDS_REVISION: ["À réviser", "Needs revision"],
  CHANGES_REQUESTED: ["Modifications demandées", "Changes requested"],
  EXPIRED: ["Expiré", "Expired"],
  INVALIDATED: ["Validation invalidée", "Approval invalidated"],
  DISCOVERED: ["Découvert", "Discovered"],
  SCORED: ["Évalué", "Scored"],
  VETTED: ["Validé", "Vetted"],
  SENT: ["Envoi déclaré", "Reported as sent"],
  queued: ["En file", "Queued"],
  running: ["En cours", "Running"],
  completed: ["Terminé", "Completed"],
  failed: ["Échec", "Failed"],
  uncertain: ["À vérifier", "Needs verification"],
  revoked: ["Révoqué", "Revoked"],
};
const label = (v) => (names[v] ? L(...names[v]) : v);
const count = (v) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat(LANG, { maximumFractionDigits: 2 }).format(v);
function field(parent, title, value = "", type = "text") {
  const label = el("label", "social-field"),
    input = el(type === "textarea" ? "textarea" : "input");
  label.append(el("span", "", title));
  if (type !== "textarea") input.type = type;
  else input.rows = 4;
  input.value = value;
  label.append(input);
  parent.append(label);
  return input;
}
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const displayDate = (value) =>
  new Intl.DateTimeFormat(LANG, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value)) +
  " · " +
  timezone;
const inputDate = (value) => new Date(value).toISOString();
function dateField(parent, title, value) {
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return field(parent, title + " · " + timezone, local, "datetime-local");
}
const findings = {
  PRODUCT_CONTEXT_REQUIRED: [
    "Choisissez un produit de cette campagne.",
    "Choose a product from this campaign.",
  ],
  DUPLICATE_ACCOUNT: [
    "Utilisez une seule variante par compte.",
    "Use one variant per account.",
  ],
  OUTSIDE_CAMPAIGN: [
    "Choisissez une date comprise dans la campagne.",
    "Choose a date within the campaign.",
  ],
  PRODUCT_NAME_REQUIRED: [
    "Nommez le produit concerné dans chaque variante.",
    "Name the relevant product in each variant.",
  ],
  CAPTION_TOO_LONG: [
    "Raccourcissez le texte, lien compris, pour ce réseau.",
    "Shorten the text, including its link, for this network.",
  ],
  MEDIA_REQUIRED: [
    "Ajoutez un média autorisé pour ce réseau.",
    "Add authorised media for this network.",
  ],
  UTM_REQUIRED: [
    "Reprenez le lien suivi du produit pour cette campagne.",
    "Use the tracked product link for this campaign.",
  ],
  NO_ATTRIBUTION_LINK: [
    "Sans lien suivi, les résultats de ce contenu ne pourront pas être attribués dans GA4.",
    "Without a tracked link, this content cannot be attributed in GA4.",
  ],
};
const finding = (value) => (findings[value] ? L(...findings[value]) : value);
function select(parent, title, rows) {
  const wrap = el("label", "social-field"),
    input = el("select");
  wrap.append(el("span", "", title));
  for (const [value, text] of rows) {
    const o = el("option", "", text);
    o.value = value;
    input.append(o);
  }
  input.value = rows[0]?.[0] || "";
  wrap.append(input);
  parent.append(wrap);
  return input;
}
function button(parent, title, action, primary = false) {
  const b = el("button", primary ? "btn btn-primary" : "btn btn-small", title);
  b.type = "button";
  b.onclick = action;
  parent.append(b);
  return b;
}
function card(parent, title, copy) {
  const n = el("section", "social-card");
  n.append(el("h3", "", title));
  if (copy) n.append(el("p", "c-note", copy));
  parent.append(n);
  return n;
}
function table(parent, headers, rows) {
  const wrap = el("div", "social-table-wrap"),
    t = el("table", "c-table app-table"),
    head = el("tr");
  for (const h of headers) {
    const th = el("th", "", h);
    th.scope = "col";
    head.append(th);
  }
  t.append(head);
  for (const row of rows) {
    const tr = el("tr");
    for (const v of row) {
      const td = el("td");
      td.textContent = String(v ?? "—");
      tr.append(td);
    }
    t.append(tr);
  }
  wrap.append(t);
  parent.append(wrap);
}
function link(parent, url, title) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return;
    const a = el("a", "", title || u.hostname);
    a.href = u.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    parent.append(a);
  } catch {}
}
export async function renderSocial({ api, me, tab = "campaigns" }) {
  const root = el("section", "social-workspace"),
    status = el("p", "social-status");
  status.setAttribute("role", "status");
  const content = el("div");
  root.append(
    el(
      "div",
      "social-eyebrow",
      L("PLANIFIER · VALIDER · MESURER", "PLAN · APPROVE · MEASURE"),
    ),
    el("h2", "", "Social Toolkit"),
    el(
      "p",
      "",
      L(
        "Un parcours commun pour vos contenus, vos résultats et vos collaborations. Chaque action reste dans l’espace client sélectionné.",
        "One workflow for your content, results and collaborations. Every action stays within the selected client workspace.",
      ),
    ),
    status,
    content,
  );
  const call = (path, body = {}) => api("/social/" + path, body);
  let busy = false;
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    status.textContent = L("Traitement…", "Working…");
    try {
      await fn();
      status.textContent = L("Enregistré.", "Saved.");
    } catch (e) {
      const code = Object.keys(errors).find((k) =>
        String(e.message).includes(k),
      );
      status.textContent = code
        ? L(...errors[code])
        : L(
            "Opération indisponible. Vérifiez les champs et les droits, puis réessayez.",
            "Operation unavailable. Check fields and access, then try again.",
          );
    } finally {
      busy = false;
      root.setAttribute("aria-busy", "false");
    }
  };
  const change = (path, input) =>
    run(async () => {
      await call(path, { key: crypto.randomUUID(), input });
      await load();
    });
  async function load() {
    const data = await call("state");
    content.replaceChildren();
    const admin = data.role === "admin",
      edit = ["admin", "strategist", "contributor"].includes(data.role),
      strategy = ["admin", "strategist"].includes(data.role),
      caps = data.capabilities || {},
      campaigns = data.campaigns || [];
    const banner = el("div", "social-connection");
    banner.append(
      el(
        "strong",
        "",
        L("Votre espace : ", "Your workspace: ") + (me?.tenant?.name || "—"),
      ),
      el(
        "span",
        "",
        `${caps.postiz ? L("Postiz configuré", "Postiz configured") : L("Postiz à connecter", "Connect Postiz")} · ${caps.zenml ? L("ZenML configuré", "ZenML configured") : L("Traitements en attente de configuration ZenML", "Processing needs ZenML setup")}`,
      ),
    );
    content.append(banner);
    const stats = el("div", "social-stats");
    for (const [title, value] of [
      [L("Campagnes", "Campaigns"), campaigns.length],
      [
        L("Brouillons", "Drafts"),
        data.posts.filter((p) => p.status === "DRAFT").length,
      ],
      [
        L("À valider", "Awaiting review"),
        data.approvals.filter((a) => a.status === "PENDING").length,
      ],
      [
        L("Publications vérifiées", "Verified publications"),
        data.posts.filter((p) => p.status === "PUBLISHED").length,
      ],
    ]) {
      const c = el("div");
      c.append(el("span", "", title), el("strong", "", String(value)));
      stats.append(c);
    }
    content.append(stats);
    const empty = (message) => content.append(el("p", "social-empty", message));
    if (tab === "campaigns") {
      const list = el("div", "social-grid");
      content.append(list);
      for (const c of campaigns) {
        const n = card(
          list,
          c.name,
          `${c.brand} · ${c.language} · ${label(c.status)}`,
        );
        n.append(
          el("p", "", c.brief),
          el("p", "c-note", L("Public : ", "Audience: ") + c.audience),
        );
        for (const product of c.products) link(n, product.url, product.name);
        if (strategy && !["COMPLETED", "ARCHIVED"].includes(c.status)) {
          button(
            n,
            c.status === "ACTIVE"
              ? L("Mettre en pause", "Pause")
              : L("Activer la campagne", "Activate campaign"),
            () =>
              change("campaign/status", {
                id: c.id,
                version: c.version,
                status: c.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
              }),
          );
        }
        const a = el(
          "a",
          "social-next",
          L("Préparer les contenus →", "Prepare content →"),
        );
        a.href = "#social/posts";
        n.append(a);
      }
      if (!campaigns.length)
        empty(
          L(
            "Commencez par une campagne : marque, produit, public et objectif. Ces informations encadrent tous les contenus.",
            "Start with a campaign: brand, product, audience and goal. This context guides all content.",
          ),
        );
      if (strategy) {
        const form = card(
          content,
          L("Créer une campagne", "Create a campaign"),
        );
        const name = field(form, L("Nom de campagne", "Campaign name")),
          brand = field(form, L("Marque", "Brand"), me?.tenant?.name || ""),
          website = field(
            form,
            L("Site du client", "Client website"),
            "https://" + (me?.tenant?.domains?.[0] || ""),
            "url",
          ),
          language = field(
            form,
            L("Langue du contenu", "Content language"),
            LANG,
          ),
          ga4 = select(
            form,
            L("Propriété GA4 pour les résultats", "GA4 property for results"),
            [
              ["", L("Non sélectionnée", "Not selected")],
              ...(me?.tenant?.ga4Properties || []).map((p) => [p, p]),
            ],
          ),
          objective = select(form, L("Objectif", "Goal"), [
            ["AWARENESS", L("Notoriété", "Awareness")],
            ["LEADS", "Leads"],
            ["SALES", L("Ventes", "Sales")],
            ["GEO_VISIBILITY", L("Visibilité GEO", "GEO visibility")],
            ["COMMUNITY", L("Communauté", "Community")],
          ]),
          audience = field(form, L("Public visé", "Target audience")),
          brief = field(
            form,
            L("Brief et ton de marque", "Brief and brand voice"),
            "",
            "textarea",
          ),
          product = field(form, L("Produit ou service", "Product or service")),
          source = field(
            form,
            L("Page source du produit", "Product source page"),
            website.value,
            "url",
          ),
          facts = field(
            form,
            L(
              "Faits produit confirmés par votre équipe",
              "Product facts confirmed by your team",
            ),
            "",
            "textarea",
          ),
          start = dateField(
            form,
            L("Début de campagne", "Campaign starts"),
            new Date().toISOString(),
          ),
          end = dateField(
            form,
            L("Fin de campagne", "Campaign ends"),
            new Date(Date.now() + 30 * 86400000).toISOString(),
          );
        button(
          form,
          L(
            "Lire les faits sur cette page produit",
            "Read facts from this product page",
          ),
          () =>
            run(async () => {
              const r = await api("/visual/catalog", { url: source.value });
              const normal = (u) => new URL(u).href.replace(/\/$/, "");
              const item = r.items?.find(
                (i) =>
                  i.kind === "product" &&
                  normal(i.url) === normal(source.value) &&
                  i.description,
              );
              if (!item) throw new Error("SOCIAL_CONTEXT_MISSING");
              product.value = item.name;
              facts.value = item.description;
              if (item.brand) brand.value = item.brand;
            }),
        );
        button(
          form,
          L("Créer le cadre éditorial", "Create editorial context"),
          () =>
            change("campaign", {
              name: name.value,
              brand: brand.value,
              website: website.value,
              language: language.value,
              ...(ga4.value ? { ga4Property: ga4.value } : {}),
              objective: objective.value,
              audience: audience.value,
              brief: brief.value,
              products: [
                { name: product.value, url: source.value, facts: facts.value },
              ],
              start: inputDate(start.value),
              end: inputDate(end.value),
              budgetCents: 0,
              currency: "EUR",
              utmRequired: true,
            }),
          true,
        );
      }
    }
    if (tab === "posts" || tab === "calendar") {
      if (!data.posts.length)
        empty(
          L(
            "Aucun contenu. Créez une campagne puis préparez votre premier brouillon.",
            "No content yet. Create a campaign, then prepare your first draft.",
          ),
        );
      if (tab === "calendar")
        table(
          content,
          [
            L("Date prévue", "Scheduled date"),
            L("Contenu", "Content"),
            L("Réseaux", "Networks"),
            L("État", "State"),
          ],
          [...data.posts]
            .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
            .map((p) => [
              displayDate(p.scheduledAt),
              p.title,
              p.variants.map((v) => v.platform).join(", "),
              label(p.status),
            ]),
        );
      for (const p of tab === "posts" ? data.posts : []) {
        const n = card(
          content,
          p.title,
          `${label(p.status)} · ${displayDate(p.scheduledAt)} · v${p.version}`,
        );
        for (const v of p.variants) {
          n.append(
            el("h4", "", v.platform),
            el("p", "social-caption", v.caption),
          );
          if (v.link) link(n, v.link);
        }
        if (p.policy.errors.length)
          n.append(
            el(
              "p",
              "social-warning",
              L("À corriger : ", "Resolve: ") +
                p.policy.errors.map(finding).join(" "),
            ),
          );
        if (
          edit &&
          ![
            "PUBLISHING",
            "PUBLISHED",
            "ACCEPTED",
            "UNCERTAIN",
            "PARTIAL",
          ].includes(p.status)
        ) {
          const d = el("details");
          d.append(
            el("summary", "", L("Modifier ce contenu", "Edit this content")),
          );
          const title = field(d, L("Titre interne", "Internal title"), p.title),
            date = dateField(
              d,
              L("Date de publication", "Publication date"),
              p.scheduledAt,
            ),
            fields = p.variants.map((v) => {
              const box = card(d, v.platform);
              const account = field(
                  box,
                  L("Identifiant du compte", "Account ID"),
                  v.accountId,
                ),
                caption = field(
                  box,
                  L("Texte proposé", "Proposed copy"),
                  v.caption,
                  "textarea",
                ),
                url = field(
                  box,
                  L("Lien du produit", "Product link"),
                  v.link || "",
                  "url",
                ),
                media = field(
                  box,
                  L("Médias JSON", "Media JSON"),
                  JSON.stringify(v.media, null, 2),
                  "textarea",
                );
              return { v, account, caption, url, media };
            });
          button(
            d,
            L(
              "Enregistrer et renouveler la validation",
              "Save and renew approval",
            ),
            () =>
              run(async () => {
                await call("post", {
                  key: crypto.randomUUID(),
                  input: {
                    id: p.id,
                    version: p.version,
                    post: {
                      campaignId: p.campaignId,
                      title: title.value,
                      productUrl: p.productUrl,
                      scheduledAt: inputDate(date.value),
                      variants: fields.map((f) => ({
                        ...f.v,
                        accountId: f.account.value,
                        caption: f.caption.value,
                        link: f.url.value || undefined,
                        media: JSON.parse(f.media.value),
                      })),
                    },
                  },
                });
                await load();
              }),
          );
          n.append(d);
        }
        if (
          edit &&
          ["DRAFT", "NEEDS_REVISION", "REJECTED", "EXPIRED", "FAILED"].includes(
            p.status,
          )
        )
          button(n, L("Demander une validation", "Request approval"), () =>
            change("approval/request", {
              type: "POST_APPROVE",
              entityId: p.id,
            }),
          );
        if (admin && p.status === "APPROVED")
          button(
            n,
            L(
              "Confirmer la programmation approuvée",
              "Confirm approved schedule",
            ),
            () => change("publish", { approvalId: p.approvalId }),
            true,
          );
        if (
          admin &&
          ["ACCEPTED", "UNCERTAIN", "PUBLISHED", "PARTIAL", "FAILED"].includes(
            p.status,
          )
        )
          button(
            n,
            L(
              "Vérifier la publication, sans renvoyer",
              "Check publication without resending",
            ),
            () =>
              run(async () => {
                await call("readback", { postId: p.id });
                await load();
              }),
          );
        for (const t of p.targets) {
          n.append(el("p", "c-note", t.platform + " · " + label(t.status)));
          if (t.url)
            link(n, t.url, L("Voir la publication", "View published post"));
        }
      }
      if (edit && campaigns.length && tab === "posts") {
        const form = card(
          content,
          L("Préparer un brouillon adapté", "Prepare a contextual draft"),
          L(
            "Les suggestions reprennent uniquement les faits saisis pour le produit. Relisez chaque variante avant de demander une validation.",
            "Suggestions use only the product facts you entered. Review each variant before requesting approval.",
          ),
        );
        form.append(
          el(
            "p",
            "c-note",
            L(
              "Pour un média : tableau JSON avec id Postiz, path HTTPS sur un domaine autorisé, alt, rights (OWNED ou LICENSED) et proof. Le compte doit correspondre au réseau choisi.",
              "For media: JSON array with Postiz id, HTTPS path on an authorised domain, alt, rights (OWNED or LICENSED) and proof. The account must match the selected network.",
            ),
          ),
        );
        const campaign = select(
            form,
            L("Campagne", "Campaign"),
            campaigns.map((c) => [c.id, c.name]),
          ),
          title = field(form, L("Titre interne", "Internal title")),
          product = select(form, L("Produit", "Product"), []),
          date = dateField(
            form,
            L("Publication prévue", "Planned publication"),
            new Date(Date.now() + 86400000).toISOString(),
          ),
          variants = el("div", "social-variants");
        form.append(variants);
        let variantFields = [];
        function draw() {
          const c = campaigns.find((c) => c.id === campaign.value);
          product.replaceChildren();
          for (const p of c.products) {
            const o = el("option", "", p.name);
            o.value = p.url;
            product.append(o);
          }
          product.value = c.products[0]?.url || "";
          variants.replaceChildren();
          variantFields = [];
          for (const network of [
            "linkedin",
            "linkedin-page",
            "x",
            "bluesky",
            "instagram",
            "instagram-standalone",
            "facebook",
            "threads",
            "tiktok",
            "youtube",
            "mastodon",
            "pinterest",
          ]) {
            const d = el("details");
            d.append(el("summary", "", network));
            const enabled = field(
                d,
                L("Inclure ce réseau", "Include this network"),
                "",
                "checkbox",
              ),
              available = (caps.accounts || []).filter(
                (a) => a.platform === network,
              ),
              account = select(
                d,
                L("Compte cible", "Target account"),
                available.length
                  ? available.map((a) => [a.id, a.id])
                  : [
                      [
                        "draft-" + network,
                        L(
                          "Brouillon — compte à connecter",
                          "Draft — connect an account",
                        ),
                      ],
                    ],
              ),
              caption = field(
                d,
                L("Texte proposé", "Proposed copy"),
                "",
                "textarea",
              ),
              linkField = field(
                d,
                L("Lien du produit avec UTM", "Product link with UTM"),
                "",
                "url",
              ),
              media = field(
                d,
                L(
                  "Médias déjà hébergés : JSON (facultatif)",
                  "Already hosted media: JSON (optional)",
                ),
                "[]",
                "textarea",
              );
            button(
              d,
              L("Reprendre les faits du produit", "Use product facts"),
              () => {
                const p = c.products.find((p) => p.url === product.value);
                caption.value = p.name + " — " + p.facts;
                const u = new URL(p.url);
                u.searchParams.set("utm_source", network);
                u.searchParams.set("utm_medium", "social");
                u.searchParams.set("utm_campaign", c.id);
                linkField.value = u.href;
                enabled.checked = true;
              },
            );
            variantFields.push({
              network,
              enabled,
              account,
              caption,
              linkField,
              media,
            });
            variants.append(d);
          }
        }
        campaign.onchange = draw;
        draw();
        button(
          form,
          L("Enregistrer le brouillon", "Save draft"),
          () => {
            let input;
            try {
              input = {
                campaignId: campaign.value,
                title: title.value,
                productUrl: product.value,
                scheduledAt: inputDate(date.value),
                variants: variantFields
                  .filter((v) => v.enabled.checked)
                  .map((v) => ({
                    platform: v.network,
                    accountId: v.account.value,
                    caption: v.caption.value,
                    ...(v.linkField.value ? { link: v.linkField.value } : {}),
                    media: JSON.parse(v.media.value),
                  })),
              };
            } catch {
              status.textContent = L(
                "JSON des médias invalide.",
                "Invalid media JSON.",
              );
              return;
            }
            return change("post", { post: input });
          },
          true,
        );
      }
    }
    if (tab === "approvals") {
      if (!data.approvals.length)
        empty(
          L(
            "Aucune demande. Les brouillons ne sont jamais publiés lors de leur création.",
            "No requests. Creating a draft never publishes it.",
          ),
        );
      for (const a of [...data.approvals].reverse()) {
        const context = a.context,
          n = card(
            content,
            L("Validation : ", "Approval: ") +
              (context?.post?.title ||
                context?.outreach?.subject ||
                context?.name ||
                a.type),
            `${label(a.status)} · ${L("Expire le ", "Expires ")}${displayDate(a.expiresAt)}`,
          );
        n.append(
          el("p", "c-note", L("Demandeur : ", "Requester: ") + a.requestedBy),
        );
        if (context?.post) {
          n.append(el("p", "", displayDate(context.post.scheduledAt)));
          for (const v of context.post.variants) {
            n.append(
              el("h4", "", v.platform + " · " + v.accountId),
              el("p", "social-caption", v.caption),
            );
            if (v.link) link(n, v.link);
            for (const media of v.media || [])
              link(n, media.path, media.alt + " · " + media.rights);
          }
        } else if (context?.outreach)
          n.append(
            el("p", "social-caption", context.outreach.body),
            el("p", "", context.outreach.consentEvidence),
          );
        else
          n.append(
            el("p", "", context?.name || ""),
            el(
              "p",
              "",
              L(
                "Vérifiez le profil et les preuves avant de valider.",
                "Review the profile and evidence before approving.",
              ),
            ),
          );
        const proof = el("details");
        proof.append(
          el(
            "summary",
            "",
            L("Contexte approuvé et empreinte", "Approval context and digest"),
          ),
          el(
            "pre",
            "",
            JSON.stringify({ digest: a.digest, context: a.context }, null, 2),
          ),
        );
        n.append(proof);
        if (admin && a.status === "PENDING") {
          const comment = field(
            n,
            L(
              "Commentaire de décision (obligatoire)",
              "Decision comment (required)",
            ),
          );
          for (const [decision, fr, en] of [
            ["APPROVE", "Approuver cette version", "Approve this version"],
            [
              "CHANGES_REQUESTED",
              "Demander des modifications",
              "Request changes",
            ],
            ["REJECT", "Refuser", "Reject"],
          ]) {
            const b = button(n, L(fr, en), () =>
              change("approval/decide", {
                id: a.id,
                digest: a.digest,
                decision,
                comment: comment.value,
              }),
            );
            b.disabled = a.requestedBy === data.actor;
            if (b.disabled)
              n.append(
                el(
                  "p",
                  "c-note",
                  L(
                    "Un autre administrateur doit décider.",
                    "A different administrator must decide.",
                  ),
                ),
              );
          }
        }
        if (a.decision) n.append(el("p", "", a.decision.comment));
      }
    }
    if (tab === "analytics") {
      const n = card(
        content,
        L("Mesurer les résultats", "Measure results"),
        L(
          "Les valeurs absentes restent inconnues. Les audiences de réseaux différents ne sont pas additionnées. Les imports sont identifiés comme déclarés.",
          "Missing values remain unknown. Audiences from different networks are not added together. Imports are labelled as declared.",
        ),
      );
      const campaign = select(n, L("Campagne", "Campaign"), [
          ["", L("Toutes les campagnes", "All campaigns")],
          ...campaigns.map((c) => [c.id, c.name]),
        ]),
        from = field(
          n,
          L("Du", "From"),
          new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          "date",
        ),
        to = field(
          n,
          L("Au", "To"),
          new Date().toISOString().slice(0, 10),
          "date",
        ),
        out = el("div");
      n.append(out);
      button(n, L("Afficher les observations", "Show observations"), () =>
        run(async () => {
          const r = await call("analytics", {
            ...(campaign.value ? { campaignId: campaign.value } : {}),
            from: from.value,
            to: to.value,
          });
          out.replaceChildren();
          table(
            out,
            [
              L("Date / source", "Date / source"),
              L("Publication", "Post"),
              "Impressions",
              L("Portée", "Reach"),
              "CTR",
              L("Engagement", "Engagement"),
              "GA4 sessions",
              L("Événements clés GA4", "GA4 key events"),
            ],
            r.rows.map((x) => [
              x.date + " · " + x.source + " · " + x.kind,
              x.postId,
              count(x.impressions),
              count(x.reach),
              count(x.ctr),
              count(x.engagementRate),
              count(x.ga4Sessions),
              count(x.ga4Conversions),
            ]),
          );
          for (const snapshot of r.providerMetrics || []) {
            const box = card(
              out,
              L("Mesures de la plateforme", "Platform measurements"),
              snapshot.postId +
                " · " +
                snapshot.accountId +
                " · " +
                snapshot.observedAt,
            );
            box.append(
              el(
                "p",
                "c-note",
                L(
                  "Valeurs rapportées par Postiz. Leur cumul et leur comparaison entre réseaux ne sont pas établis.",
                  "Values reported by Postiz. Their cumulative meaning and comparability across networks are not established.",
                ),
              ),
            );
            if (snapshot.error)
              box.append(
                el(
                  "p",
                  "social-warning",
                  L(
                    "Lecture indisponible pour ce compte. Vérifiez le connecteur ; aucune valeur ne remplace les données manquantes.",
                    "Reading unavailable for this account. Check the connector; no value replaces missing data.",
                  ),
                ),
              );
            table(
              box,
              [
                L("Mesure", "Metric"),
                L("Date", "Date"),
                L("Valeur observée", "Observed value"),
              ],
              snapshot.series.flatMap((m) =>
                m.data.map((v) => [m.label, v.date, v.total]),
              ),
            );
          }
          if (!r.rows.length && !(r.providerMetrics || []).length)
            out.append(
              el(
                "p",
                "social-empty",
                L(
                  "Aucune observation dans cette période.",
                  "No observations in this period.",
                ),
              ),
            );
        }),
      );
      if (strategy && campaigns.length)
        button(
          n,
          L(
            "Actualiser les sessions GA4 de la campagne",
            "Refresh campaign GA4 sessions",
          ),
          () =>
            change("queue", {
              pipeline: "social_analytics_daily",
              campaignId: campaign.value || campaigns[0].id,
            }),
        );
      if (strategy) {
        const d = el("details");
        d.append(
          el(
            "summary",
            "",
            L(
              "Importer des observations quotidiennes",
              "Import daily observations",
            ),
          ),
        );
        const input = field(
          d,
          L(
            "Lignes JSON avec source, date et valeurs null si absentes",
            "JSON rows with source, date and null for missing values",
          ),
          "[]",
          "textarea",
        );
        button(
          d,
          L("Importer les mesures déclarées", "Import declared measurements"),
          () =>
            run(async () => {
              await call("analytics/import", {
                key: crypto.randomUUID(),
                input: JSON.parse(input.value),
              });
              await load();
            }),
        );
        n.append(d);
      }
    }
    if (tab === "creators") {
      const n = card(
        content,
        L(
          "Découvrir et qualifier des créateurs",
          "Discover and review creators",
        ),
        L(
          "Recherche YouTube sur API officielle si configurée ; import sourcé pour les autres réseaux. La validation humaine précède toute prise de contact.",
          "Official YouTube API search when configured; sourced imports for other networks. Human vetting precedes all outreach.",
        ),
      );
      if (strategy && campaigns.length) {
        const c = select(
          n,
          L("Campagne de recherche", "Discovery campaign"),
          campaigns.map((c) => [c.id, c.name]),
        );
        const b = button(n, L("Rechercher sur YouTube", "Search YouTube"), () =>
          change("queue", {
            pipeline: "influencer_discovery",
            campaignId: c.value,
          }),
        );
        b.disabled = !caps.youtube;
      }
      for (const c of data.creators) {
        const n = card(content, c.name, `${c.platform} · ${label(c.status)}`);
        link(n, c.url, c.handle);
        n.append(
          el(
            "p",
            "",
            `${L("Abonnés", "Followers")}: ${count(c.followers)} · ${L("Engagement observé", "Observed engagement")}: ${count(c.score.engagement)}% · ${L("Adéquation évaluée", "Reviewed fit")}: ${count(c.score.fit)}/100`,
          ),
          el(
            "p",
            "c-note",
            L(
              "L’authenticité et la croissance ne sont pas établies ; aucun score global n’est inventé.",
              "Authenticity and growth are not established; no composite score is invented.",
            ),
          ),
        );
        if (strategy) {
          const d = el("details");
          d.append(
            el(
              "summary",
              "",
              L(
                "Compléter les preuves et l’évaluation",
                "Complete evidence and assessment",
              ),
            ),
          );
          const followers = field(
              d,
              L(
                "Abonnés observés (vide si inconnu)",
                "Observed followers (blank if unknown)",
              ),
              c.followers ?? "",
              "number",
            ),
            fit = field(
              d,
              L(
                "Adéquation évaluée sur 100 (facultatif)",
                "Reviewed fit out of 100 (optional)",
              ),
              c.fit ?? "",
              "number",
            ),
            evidence = field(
              d,
              L("Justification de l’adéquation", "Fit assessment evidence"),
              c.fitEvidence,
              "textarea",
            ),
            metrics = field(
              d,
              L(
                "Jusqu’à 20 publications : JSON date, likes, comments, shares, saves ; null si inconnu",
                "Up to 20 posts: JSON date, likes, comments, shares, saves; null if unknown",
              ),
              JSON.stringify(c.posts, null, 2),
              "textarea",
            ),
            source = field(
              d,
              L("Source des observations", "Observation source"),
              c.source,
              "url",
            );
          button(
            d,
            L("Enregistrer une nouvelle évaluation", "Save revised assessment"),
            () =>
              run(async () => {
                await call("creator/update", {
                  key: crypto.randomUUID(),
                  input: {
                    id: c.id,
                    version: c.version,
                    creator: {
                      campaignId: c.campaignId,
                      name: c.name,
                      platform: c.platform,
                      handle: c.handle,
                      url: c.url,
                      source: source.value,
                      observedAt: new Date().toISOString(),
                      followers:
                        followers.value === "" ? null : Number(followers.value),
                      posts: JSON.parse(metrics.value),
                      fit: fit.value === "" ? null : Number(fit.value),
                      fitEvidence: evidence.value,
                    },
                  },
                });
                await load();
              }),
          );
          n.append(d);
        }
        if (
          strategy &&
          [
            "DISCOVERED",
            "SCORED",
            "REJECTED",
            "EXPIRED",
            "NEEDS_REVISION",
          ].includes(c.status)
        )
          button(
            n,
            L("Demander la validation du créateur", "Request creator vetting"),
            () =>
              change("approval/request", {
                type: "CREATOR_VET",
                entityId: c.id,
              }),
          );
      }
      if (strategy && campaigns.length) {
        const form = card(
          content,
          L("Ajouter un profil sourcé", "Add a sourced profile"),
        );
        const c = select(
            form,
            L("Campagne", "Campaign"),
            campaigns.map((c) => [c.id, c.name]),
          ),
          name = field(form, L("Nom public", "Public name")),
          platform = select(
            form,
            L("Réseau", "Network"),
            ["youtube", "instagram", "tiktok", "linkedin", "x", "bluesky"].map(
              (x) => [x, x],
            ),
          ),
          handle = field(form, L("Identifiant du profil", "Profile handle")),
          url = field(
            form,
            L("URL publique et source", "Public profile and source URL"),
            "",
            "url",
          );
        button(form, L("Ajouter pour examen", "Add for review"), () =>
          change("creator", {
            campaignId: c.value,
            name: name.value,
            platform: platform.value,
            handle: handle.value,
            url: url.value,
            source: url.value,
            observedAt: new Date().toISOString(),
            followers: null,
            posts: [],
            fit: null,
            fitEvidence: "",
          }),
        );
      }
      if (strategy && data.creators.some((c) => c.status === "VETTED")) {
        const form = card(
          content,
          L("Préparer une prise de contact", "Prepare outreach"),
          L(
            "Aucun message envoyé depuis ce formulaire. Chaque message et chaque relance exigent leur propre validation.",
            "This form sends no message. Every message and follow-up requires its own approval.",
          ),
        );
        const c = select(
            form,
            L("Créateur validé", "Vetted creator"),
            data.creators
              .filter((c) => c.status === "VETTED")
              .map((c) => [c.id, c.name]),
          ),
          subject = field(form, L("Objet", "Subject")),
          body = field(
            form,
            L("Message exact", "Exact message"),
            "",
            "textarea",
          ),
          consent = field(
            form,
            L(
              "Preuve ou contexte autorisant ce contact",
              "Evidence or context authorising contact",
            ),
          );
        button(
          form,
          L(
            "Enregistrer le message à faire valider",
            "Save message for review",
          ),
          () =>
            change("outreach", {
              creatorId: c.value,
              campaignId: data.creators.find((x) => x.id === c.value)
                .campaignId,
              channel: "EMAIL",
              subject: subject.value,
              body: body.value,
              consentEvidence: consent.value,
            }),
        );
      }
      for (const o of data.outreach) {
        const n = card(content, o.subject, label(o.status));
        n.append(el("p", "social-caption", o.body));
        if (strategy && o.status !== "SENT") {
          const d = el("details");
          d.append(
            el("summary", "", L("Réviser ce message", "Revise this message")),
          );
          const subject = field(d, L("Objet", "Subject"), o.subject),
            body = field(
              d,
              L("Message exact", "Exact message"),
              o.body,
              "textarea",
            ),
            evidence = field(
              d,
              L(
                "Contexte autorisant ce contact",
                "Context authorising contact",
              ),
              o.consentEvidence,
            );
          button(
            d,
            L(
              "Enregistrer et renouveler la validation",
              "Save and renew approval",
            ),
            () =>
              change("outreach/update", {
                id: o.id,
                version: o.version,
                outreach: {
                  creatorId: o.creatorId,
                  campaignId: o.campaignId,
                  channel: o.channel,
                  subject: subject.value,
                  body: body.value,
                  consentEvidence: evidence.value,
                },
              }),
          );
          n.append(d);
        }
        if (strategy && o.status === "DRAFT")
          button(
            n,
            L("Demander la validation du message", "Request message approval"),
            () =>
              change("approval/request", {
                type: "OUTREACH_APPROVE",
                entityId: o.id,
              }),
          );
        if (admin && o.status === "APPROVED") {
          n.append(
            el(
              "p",
              "c-note",
              L(
                "Après l’envoi manuel autorisé, consignez la preuve. GTM n’envoie pas de séquence automatique.",
                "After the authorised manual send, record the evidence. GTM does not send an automatic sequence.",
              ),
            ),
          );
          const evidence = field(
            n,
            L("Lien de preuve d’envoi", "Delivery evidence URL"),
            "",
            "url",
          );
          button(
            n,
            L("Consigner l’envoi manuel", "Record manual delivery"),
            () =>
              change("outreach/receipt", {
                approvalId: o.approvalId,
                sentAt: new Date().toISOString(),
                deliveryEvidence: evidence.value,
              }),
          );
        }
      }
    }
    if (tab === "connections") {
      const n = card(
        content,
        L("Comptes et autorisations", "Accounts and permissions"),
        L(
          "Les comptes sont reliés dans Postiz puis autorisés par l’administrateur pour ce client. Aucun secret à coller dans la console.",
          "Connect accounts in Postiz, then have your administrator allow them for this client. Do not paste secrets into the console.",
        ),
      );
      table(
        n,
        [
          L("Compte", "Account"),
          L("Réseau", "Network"),
          L("État", "State"),
          L("Dernière lecture", "Last read"),
        ],
        data.accounts.map((a) => [
          a.name,
          a.platform,
          label(a.status),
          a.observedAt,
        ]),
      );
      if (strategy)
        button(
          n,
          L("Vérifier les comptes connectés", "Check connected accounts"),
          () => change("queue", { pipeline: "social_account_sync" }),
        );
      n.append(
        el(
          "p",
          "c-note",
          L(
            "Les publications attendent un connecteur Postiz autorisé et le worker ZenML. TikTok Research et Meta Content Library ne sont pas activés pour la prospection commerciale.",
            "Publishing waits for an authorised Postiz connector and the ZenML worker. TikTok Research and Meta Content Library are not enabled for commercial prospecting.",
          ),
        ),
      );
      if (admin) {
        const f = card(
            content,
            L("Déléguer un rôle Social", "Assign a Social role"),
          ),
          actor = field(
            f,
            L("Identifiant SSO de l’utilisateur", "User SSO subject"),
          ),
          r = select(f, L("Rôle", "Role"), [
            ["viewer", L("Lecture seule", "Viewer")],
            [
              "contributor",
              L("Contributeur : ses brouillons", "Contributor: own drafts"),
            ],
            [
              "strategist",
              L(
                "Stratège : campagnes et brouillons",
                "Strategist: campaigns and drafts",
              ),
            ],
          ]);
        button(f, L("Enregistrer les droits", "Save permissions"), () =>
          change("grant", { actor: actor.value, role: r.value }),
        );
      }
    }
    if (tab === "runs") {
      table(
        content,
        [
          L("Traitement", "Pipeline"),
          L("État", "State"),
          "ZenML run",
          L("Date", "Date"),
          L("Résultat", "Result"),
        ],
        data.jobs.map((j) => [
          j.pipeline,
          label(j.status),
          j.zenmlRunId ||
            L("Pas encore exécuté par ZenML", "Not executed by ZenML yet"),
          j.createdAt,
          j.error || j.resultHash || "—",
        ]),
      );
      table(
        content,
        [
          L("Date", "Date"),
          L("Acteur", "Actor"),
          L("Action", "Action"),
          L("Cible", "Target"),
        ],
        data.audit.map((a) => [a.at, a.actor, a.event, a.target]),
      );
    }
    button(
      content,
      L("Exporter mon périmètre Social", "Export my Social scope"),
      () =>
        run(async () => {
          const data = await call("export"),
            u = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            ),
            a = el("a");
          a.href = u;
          a.download = "gtm-social.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(u), 1000);
        }),
    );
  }
  try {
    await load();
  } catch {
    status.textContent = L(
      "Le module Social ne peut pas être chargé. Vérifiez votre espace et vos droits.",
      "Social could not be loaded. Check your workspace and permissions.",
    );
    button(content, L("Réessayer", "Retry"), () => run(load));
  }
  return root;
}
