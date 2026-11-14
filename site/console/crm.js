import { LANG } from "./i18n.js";
import { el } from "./render.js";
const L = (fr, en) => (LANG === "fr" ? fr : en);
const channelNames = {
  all: L("Tous les canaux", "All channels"),
  web: "Web",
  social: L("Réseaux sociaux", "Social"),
  manual: L("Manuel", "Manual"),
  shopify: "Shopify",
  prestashop: "PrestaShop",
};
const kindNames = {
  crm_id: "CRM",
  web_user: L("Compte web", "Web account"),
  web_session: L("Session web", "Web session"),
  social_user: L("Compte social", "Social account"),
  shopify_customer: L("Client Shopify", "Shopify customer"),
  prestashop_customer: L("Client PrestaShop", "PrestaShop customer"),
  gtm_contact: L("Contact GTM", "GTM contact"),
  event_only: L("Cet événement uniquement", "This event only"),
};
const provenance = {
  human_declared: L("Déclaration humaine", "Human declaration"),
  source_asserted: L("Déclaré par la source", "Source assertion"),
  commerce_observed: L("Observé dans la boutique", "Store observation"),
  native: L("Fiche GTM", "GTM record"),
};
const orderStatusLabel = (value) =>
  ({
    pending: L("En attente", "Pending"),
    paid: L("Payée", "Paid"),
    fulfilled: L("Traitée", "Fulfilled"),
    cancelled: L("Annulée", "Cancelled"),
    refunded: L("Remboursée", "Refunded"),
    partial_refund: L("Remboursement partiel", "Partial refund"),
  })[value] || value;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const date = (v) =>
  new Intl.DateTimeFormat(LANG, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
const errors = {
  CRM_BINDING_PROOF_CONFLICT: L(
    "Cette liaison possède une autre preuve. Révoquez-la avant de la remplacer.",
    "This link has different evidence. Revoke it before replacing it.",
  ),
  CRM_ACCESS: L(
    "Votre administrateur doit vous attribuer un accès CRM.",
    "Your administrator must grant you CRM access.",
  ),
  CRM_DISABLED: L(
    "Activez la collecte dans Connexions.",
    "Enable collection in Connections.",
  ),
  CRM_IDENTITY_CONFLICT: L(
    "Cet identifiant appartient déjà à une autre fiche. Vérifiez les preuves et révoquez la liaison erronée avant de réessayer.",
    "This identifier already belongs to another contact. Review the evidence and revoke the incorrect link before retrying.",
  ),
  CRM_COLLECTION_BLOCKED: L(
    "La collecte est suspendue ou cet identifiant a été effacé.",
    "Collection is paused or this identity has been erased.",
  ),
  CRM_CHANGED: L(
    "Cette fiche a changé. Rechargez-la avant de réessayer.",
    "This contact changed. Reload before retrying.",
  ),
  CRM_SOURCE_SCOPE: L(
    "Le domaine, la boutique ou la source ne sont pas autorisés dans cet espace.",
    "The domain, store or source is not authorised in this workspace.",
  ),
  CRM_SESSION_INTERVAL_REQUIRED: L(
    "Une session nécessite un début et une fin, espacés de 24 h maximum.",
    "A session needs start and end times, at most 24 hours apart.",
  ),
  CRM_EVENT_CONFLICT: L(
    "Un événement différent utilise déjà cet identifiant.",
    "A different event already uses this identifier.",
  ),
  CRM_INVALID_INTERVAL: L(
    "La date de fin doit suivre la date de début.",
    "The end date must follow the start date.",
  ),
  CRM_FUTURE_EVENT: L(
    "La date de cet événement est dans le futur.",
    "This event is dated in the future.",
  ),
};
function field(parent, label, type = "text", value = "", required = false) {
  const wrap = el("label", "crm-field");
  const input = el("input");
  input.type = type;
  input.setAttribute("aria-label", label);
  input.value = value;
  input.required = required;
  input.maxLength = type === "url" ? 2048 : 500;
  wrap.append(el("span", "", label), input);
  parent.append(wrap);
  return input;
}
function select(parent, label, options) {
  const wrap = el("label", "crm-field"),
    input = el("select");
  input.setAttribute("aria-label", label);
  wrap.append(el("span", "", label), input);
  for (const [value, title] of options) {
    const option = el("option", "", title);
    option.value = value;
    input.append(option);
  }
  parent.append(wrap);
  return input;
}
function button(parent, title, fn, primary = false) {
  const b = el("button", primary ? "btn btn-primary" : "btn btn-small", title);
  b.type = "button";
  b.onclick = fn;
  parent.append(b);
  return b;
}
function panel(parent, title, copy) {
  const s = el("section", "crm-panel");
  s.append(el("h3", "", title));
  if (copy) s.append(el("p", "crm-muted", copy));
  parent.append(s);
  return s;
}
function disclosure(parent, title) {
  const d = el("details", "crm-disclosure");
  d.append(el("summary", "", title));
  parent.append(d);
  return d;
}
function source(parent, url, title) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return;
    const a = el("a", "crm-source", title + " ↗");
    a.href = u.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    parent.append(a);
  } catch {}
}
function localDate(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function form(parent, title, run, handler) {
  const f = el("form", "crm-form");
  const fields = el("div", "crm-fields");
  f.append(fields);
  const submit = el("button", "btn btn-primary", title);
  submit.type = "submit";
  f.append(submit);
  f.onsubmit = (e) => {
    e.preventDefault();
    if (f.reportValidity()) run(() => handler());
  };
  parent.append(f);
  return fields;
}
function proofFields(parent, session = false) {
  const reference = field(
    parent,
    L(
      "Preuve de la liaison (référence vérifiée)",
      "Link evidence (reviewed reference)",
    ),
    "text",
    "",
    true,
  );
  const url = field(
    parent,
    L("Lien vers la preuve (facultatif)", "Evidence URL (optional)"),
    "url",
  );
  const times = el("div", "crm-fields");
  parent.append(times);
  times.hidden = !session;
  const from = field(
      times,
      L("Début de session", "Session start") + " · " + timezone,
      "datetime-local",
    ),
    until = field(
      times,
      L("Fin de session", "Session end") + " · " + timezone,
      "datetime-local",
    );
  return {
    times,
    read: () => ({
      reference: reference.value,
      ...(url.value ? { url: url.value } : {}),
      ...(!times.hidden
        ? {
            validFrom: new Date(from.value).toISOString(),
            validUntil: new Date(until.value).toISOString(),
          }
        : {}),
    }),
  };
}
export async function renderCrm({ api, me, tab = "timeline" }) {
  const root = el("section", "crm-workspace"),
    status = el("p", "crm-status"),
    body = el("div");
  status.setAttribute("role", "status");
  root.append(
    el(
      "div",
      "crm-eyebrow",
      L("IDENTIFIER · RELIER · COMPRENDRE", "IDENTIFY · CONNECT · UNDERSTAND"),
    ),
    el("h2", "", L("CRM & parcours réels", "CRM & observed journeys")),
    el(
      "p",
      "crm-intro",
      L(
        "Une fiche, les points de contact documentés. Retrouvez les interactions web, sociales, commerciales et manuelles associées à une identité précise.",
        "One contact, documented touchpoints. See web, social, commerce and manual interactions linked to an exact identity.",
      ),
    ),
    el(
      "p",
      "crm-muted",
      (me?.tenant?.name ||
        L("Espace client sélectionné", "Selected client workspace")) +
        " · " +
        L("Heures affichées : ", "Times shown: ") +
        timezone,
    ),
    status,
    body,
  );
  const call = (path, input = {}) => api("/crm/" + path, input);
  const write = (path, input) =>
    call(path, { key: crypto.randomUUID(), input });
  let busy = false,
    data,
    selected = null,
    view = "contact",
    search = "",
    offset = 0,
    contacts = [],
    filters = { channel: "all" },
    cursor = null,
    events = [],
    request = 0;
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    status.textContent = L("Chargement…", "Loading…");
    try {
      await fn();
      status.textContent = "";
    } catch (e) {
      const code = Object.keys(errors).find((k) =>
        String(e.message).includes(k),
      );
      status.textContent = code
        ? errors[code]
        : L(
            "Action indisponible. Vérifiez les champs et les droits, puis réessayez.",
            "Action unavailable. Check the fields and access, then retry.",
          );
    } finally {
      busy = false;
      root.setAttribute("aria-busy", "false");
    }
  };
  const reload = async (append = false) => {
    if (!append) offset = 0;
    data = await call("overview", { search, offset });
    contacts = append ? [...contacts, ...data.contacts] : data.contacts;
    render();
    if (tab !== "connections" && data.settings.enabled) await loadTimeline();
  };
  let timelineHost, contactHost;
  async function loadTimeline(more = false) {
    if (!timelineHost) return;
    const ticket = ++request;
    const query = {
      ...filters,
      ...(view === "unlinked"
        ? { unlinked: true }
        : view === "contact" && selected
          ? { profileId: selected }
          : {}),
    };
    const result = await call("timeline", {
      ...query,
      ...(more && cursor ? { cursor } : {}),
    });
    if (ticket !== request) return;
    cursor = result.nextCursor;
    events = more ? [...events, ...result.events] : result.events;
    drawTimeline(result.sync);
    if (selected && view === "contact") {
      const detail = await call("contact/detail", { profileId: selected });
      if (ticket !== request) return;
      drawContact(detail);
    } else contactHost.replaceChildren();
  }
  function render() {
    body.replaceChildren();
    if (tab === "connections") {
      drawConnections();
      return;
    }
    const stats = el("div", "crm-stats");
    for (const [label, value] of [
      [L("Contacts", "Contacts"), data.counts.contacts],
      [L("Événements reliés", "Linked events"), data.counts.linked],
      [L("À rapprocher", "Unlinked events"), data.counts.unlinked],
    ]) {
      const s = el("div");
      s.append(el("strong", "", String(value)), el("span", "", label));
      stats.append(s);
    }
    body.append(stats);
    if (!data.settings.enabled) {
      const p = panel(
        body,
        L("Choisissez votre CRM pour commencer", "Choose your CRM to begin"),
        L(
          "Activez le CRM intégré ou connectez le CRM du client. La collecte CRM est désactivée.",
          "Enable the built-in CRM or connect the client’s CRM. CRM collection is disabled.",
        ),
      );
      const a = el(
        "a",
        "btn btn-primary",
        L("Configurer le CRM", "Set up CRM"),
      );
      a.href = "#crm/connections";
      p.append(a);
      return;
    }
    const grid = el("div", "crm-layout"),
      aside = el("aside", "crm-contacts"),
      main = el("div", "crm-main");
    body.append(grid);
    grid.append(aside, main);
    aside.append(el("h3", "", L("Vos contacts", "Your contacts")));
    const find = form(aside, L("Rechercher", "Search"), run, async () => {
      search = query.value;
      offset = 0;
      await reload();
    });
    const query = field(
      find,
      L("Libellé ou ID de fiche", "Contact label or ID"),
      "search",
      search,
    );
    query.maxLength = 120;
    const list = el("div", "crm-contact-list");
    aside.append(list);
    for (const c of contacts) {
      const b = button(list, c.label, () =>
        run(async () => {
          selected = c.id;
          view = "contact";
          render();
          await loadTimeline();
        }),
      );
      b.classList.add("crm-contact");
      b.setAttribute(
        "aria-pressed",
        String(selected === c.id && view === "contact"),
      );
      b.append(
        el(
          "small",
          "",
          c.mode === "plugin"
            ? L("CRM client", "Client CRM")
            : L("CRM intégré", "Built-in CRM"),
        ),
      );
      if (c.status === "paused")
        b.append(el("small", "", L("Collecte en pause", "Collection paused")));
    }
    if (!contacts.length)
      list.append(
        el(
          "p",
          "crm-muted",
          L(
            "Aucune fiche. Créez un contact ou importez-le depuis votre CRM.",
            "No contacts. Create one or import from your CRM.",
          ),
        ),
      );
    if (data.hasMore)
      button(aside, L("Contacts suivants", "More contacts"), () =>
        run(async () => {
          offset += 100;
          await reload(true);
        }),
      );
    if (["admin", "editor"].includes(data.role)) {
      const create = disclosure(
        aside,
        L("Créer une fiche", "Create a contact"),
      );
      let label, url;
      const f = form(
        create,
        L("Créer le contact", "Create contact"),
        run,
        async () => {
          const result = await write("contact", {
            label: label.value,
            ...(url.value ? { externalUrl: url.value } : {}),
          });
          selected = result.profileId;
          view = "contact";
          search = "";
          offset = 0;
          await reload();
        },
      );
      label = field(
        f,
        L("Libellé de la fiche", "Contact label"),
        "text",
        "",
        true,
      );
      label.maxLength = 120;
      url = field(
        f,
        L("Fiche CRM externe (facultatif)", "External CRM record (optional)"),
        "url",
      );
    }
    const tools = el("div", "crm-toolbar");
    main.append(tools);
    for (const [v, title] of [
      ["contact", L("Parcours du contact", "Contact journey")],
      ["all", L("Tous les événements", "All events")],
      ["unlinked", L("À rapprocher", "Unlinked")],
    ]) {
      const b = button(tools, title, () =>
        run(async () => {
          view = v;
          render();
          await loadTimeline();
        }),
      );
      b.setAttribute("aria-pressed", String(view === v));
    }
    contactHost = el("div");
    main.append(contactHost);
    timelineHost = el("section", "crm-timeline-host");
    main.append(timelineHost);
  }
  function drawTimeline(sync) {
    timelineHost.replaceChildren();
    timelineHost.append(
      el(
        "h3",
        "",
        view === "unlinked"
          ? L("Événements sans liaison valide", "Events without a valid link")
          : view === "contact" && selected
            ? L("Timeline du contact", "Contact timeline")
            : L("Timeline de l’espace", "Workspace timeline"),
      ),
    );
    if (view === "contact" && !selected)
      timelineHost.append(
        el(
          "p",
          "crm-muted",
          L(
            "Sélectionnez une fiche pour isoler son parcours. Les événements ci-dessous couvrent tout l’espace.",
            "Select a contact to isolate its journey. Events below cover the whole workspace.",
          ),
        ),
      );
    const f = form(
      timelineHost,
      L("Filtrer", "Apply filters"),
      run,
      async () => {
        filters = {
          channel: ch.value,
          ...(from.value ? { from: new Date(from.value).toISOString() } : {}),
          ...(to.value ? { to: new Date(to.value).toISOString() } : {}),
        };
        await loadTimeline();
      },
    );
    const ch = select(f, L("Canal", "Channel"), Object.entries(channelNames));
    ch.value = filters.channel;
    const from = field(
      f,
      L("Du", "From"),
      "datetime-local",
      filters.from ? localDate(new Date(filters.from)) : "",
    );
    const to = field(
      f,
      L("Au", "To"),
      "datetime-local",
      filters.to ? localDate(new Date(filters.to)) : "",
    );
    if (sync?.hasMore || sync?.failed)
      timelineHost.append(
        el(
          "p",
          "crm-warning",
          L(
            "Import boutique incomplet. Rechargez pour poursuivre ; les événements déjà reçus restent disponibles.",
            "Store import incomplete. Reload to continue; received events remain available.",
          ),
        ),
      );
    if (!events.length)
      timelineHost.append(
        el(
          "p",
          "crm-empty",
          L(
            "Aucun événement pour cette sélection. Reliez un identifiant exact ou ajoutez une interaction manuelle.",
            "No events for this selection. Link an exact identifier or add a manual interaction.",
          ),
        ),
      );
    const list = el("ol", "crm-timeline");
    timelineHost.append(list);
    for (const e of events) {
      const li = el("li", "crm-event");
      li.dataset.channel = e.channel;
      const d = el("details");
      const summary = el("summary");
      const meta = el("div", "crm-event-meta");
      meta.append(
        el("span", "crm-badge", channelNames[e.channel] || e.channel),
        el("time", "", date(e.occurredAt)),
      );
      summary.append(
        meta,
        el(
          "strong",
          "",
          e.provenance === "commerce_observed" && e.details?.orderNumber
            ? L("Commande ", "Order ") +
                e.details.orderNumber +
                " · " +
                (e.type === "order_created"
                  ? L("Créée", "Created")
                  : orderStatusLabel(e.details.orderStatus || ""))
            : e.summary,
        ),
        el(
          "span",
          "crm-muted",
          (provenance[e.provenance] || e.provenance) +
            " · " +
            (e.match
              ? L("Identité reliée", "Linked identity")
              : L("Non relié", "Unlinked")),
        ),
      );
      d.append(summary);
      li.append(d);
      list.append(li);
      const detail = el("div", "crm-event-detail");
      d.append(detail);
      detail.append(
        el("p", "", L("Source : ", "Source: ") + e.source),
        el(
          "p",
          "",
          L("Horodatage : ", "Timestamp: ") +
            (e.timeBasis === "observed"
              ? L(
                  "date d’observation, date source indisponible",
                  "observation time; source date unavailable",
                )
              : L("date fournie par la source", "date supplied by source")),
        ),
        el("p", "", L("Reçu le : ", "Received: ") + date(e.receivedAt)),
        el(
          "p",
          "",
          L("Preuve de l’événement : ", "Event evidence: ") + e.proof.reference,
        ),
      );
      if (e.authorization)
        detail.append(
          el(
            "p",
            "",
            L("Autorisation déclarée : ", "Declared authorisation: ") +
              e.authorization,
          ),
        );
      if (e.match)
        detail.append(
          el(
            "p",
            "",
            L("Liaison : ", "Identity link: ") +
              (provenance[e.match.method] || e.match.method) +
              " · " +
              e.match.proof.reference,
          ),
        );
      if (e.supersedes)
        detail.append(
          el(
            "p",
            "crm-warning",
            L("Corrige l’événement source : ", "Corrects source event: ") +
              e.supersedes,
          ),
        );
      if (e.details?.note) detail.append(el("p", "", e.details.note));
      if (e.details?.orderNumber)
        detail.append(
          el(
            "p",
            "",
            L("Commande : ", "Order: ") +
              e.details.orderNumber +
              (e.details.orderStatus
                ? " · " + orderStatusLabel(e.details.orderStatus)
                : ""),
          ),
        );
      if (e.details?.amount !== undefined)
        detail.append(
          el(
            "p",
            "",
            new Intl.NumberFormat(LANG, { maximumFractionDigits: 2 }).format(
              e.details.amount,
            ) +
              " " +
              (e.details.currency ||
                L("devise non fournie", "currency unavailable")),
          ),
        );
      if (e.details?.campaignId)
        detail.append(
          el("p", "", L("Campagne : ", "Campaign: ") + e.details.campaignId),
        );
      source(detail, e.sourceUrl, L("Ouvrir la source", "Open source"));
      source(detail, e.proof.url, L("Consulter la preuve", "View evidence"));
      source(detail, e.details?.pageUrl, L("Ouvrir la page", "Open page"));
      source(
        detail,
        e.details?.productUrl,
        L("Ouvrir le produit", "Open product"),
      );
      if (!e.match && data.role === "admin" && contacts.length) {
        const link = disclosure(
          detail,
          L("Relier après vérification", "Link after review"),
        );
        link.append(
          el(
            "p",
            "crm-muted",
            L(
              "Vérifiez l’identité dans la source. Cette liaison concerne le même identifiant et la portée indiquée : ",
              "Verify the identity in the source. This link covers the same identifier and scope: ",
            ) +
              (kindNames[e.identityKind] || e.identityKind) +
              " · " +
              e.identityScope,
          ),
        );
        let choice, proof;
        const fields = form(
          link,
          L("Enregistrer la liaison", "Save link"),
          run,
          async () => {
            await write("event/link", {
              profileId: choice.value,
              eventId: e.id,
              proof: proof.read(),
            });
            await reload();
          },
        );
        choice = select(
          fields,
          L("Contact vérifié", "Verified contact"),
          contacts.map((c) => [c.id, c.label]),
        );
        if (selected) choice.value = selected;
        proof = proofFields(fields, e.identityKind === "web_session");
      }
    }
    if (cursor)
      button(timelineHost, L("Événements précédents", "Earlier events"), () =>
        run(() => loadTimeline(true)),
      );
  }
  function drawContact({ contact: c, bindings }) {
    contactHost.replaceChildren();
    const p = panel(contactHost, c.label, c.id);
    const actions = el("div", "crm-toolbar");
    p.append(actions);
    source(
      actions,
      c.externalUrl,
      L("Ouvrir dans le CRM client", "Open client CRM"),
    );
    button(actions, L("Exporter cette fiche", "Export this contact"), () =>
      run(async () => {
        const result = await call("export", { profileId: c.id });
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(result, null, 2)], {
            type: "application/json",
          }),
        );
        const a = el("a");
        a.href = url;
        a.download = "gtm-contact-" + c.id + ".json";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    );
    p.append(
      el(
        "p",
        "crm-muted",
        c.status === "paused"
          ? L(
              "Collecte suspendue pour les identifiants reliés.",
              "Collection paused for linked identifiers.",
            )
          : L(
              "Les rapprochements exigent un identifiant exact et une preuve. Les statistiques agrégées restent hors de cette fiche.",
              "Links require an exact identifier and evidence. Aggregate statistics stay outside this contact.",
            ),
      ),
    );
    if (["admin", "editor"].includes(data.role) && c.status === "active") {
      const manual = disclosure(
        p,
        L(
          "Ajouter un appel, un rendez-vous ou une note",
          "Add a call, meeting or note",
        ),
      );
      let type, at, title, proof, note;
      const f = form(
        manual,
        L("Ajouter l’interaction", "Add interaction"),
        run,
        async () => {
          await write("manual", {
            profileId: c.id,
            type: type.value,
            occurredAt: new Date(at.value).toISOString(),
            summary: title.value,
            proof: { reference: proof.value },
            ...(note.value ? { note: note.value } : {}),
          });
          await reload();
        },
      );
      type = select(f, L("Interaction", "Interaction"), [
        ["call", L("Appel", "Call")],
        ["meeting", L("Rendez-vous", "Meeting")],
        ["note", L("Note", "Note")],
      ]);
      at = field(
        f,
        L("Date", "Date") + " · " + timezone,
        "datetime-local",
        localDate(),
        true,
      );
      title = field(f, L("Résumé", "Summary"), "text", "", true);
      title.maxLength = 280;
      proof = field(
        f,
        L("Référence de la déclaration", "Declaration reference"),
        "text",
        "",
        true,
      );
      note = field(f, L("Précisions (facultatif)", "Details (optional)"));
      note.maxLength = 1500;
    }
    const ids = disclosure(
      p,
      L("Identifiants et preuves de liaison", "Identifiers and link evidence"),
    );
    if (!bindings.length)
      ids.append(el("p", "", L("Aucune liaison.", "No links.")));
    for (const b of bindings) {
      const line = el("div", "crm-binding");
      line.append(
        el("strong", "", (kindNames[b.kind] || b.kind) + " · " + b.scope),
        el("p", "", b.proof.reference),
        el(
          "small",
          "crm-muted",
          (provenance[b.method] || b.method) + " · " + date(b.at),
        ),
      );
      if (b.proof.validFrom || b.proof.validUntil)
        line.append(
          el(
            "p",
            "",
            L("Validité : ", "Valid: ") +
              (b.proof.validFrom ? date(b.proof.validFrom) : "—") +
              " → " +
              (b.proof.validUntil ? date(b.proof.validUntil) : "—"),
          ),
        );
      source(line, b.proof.url, L("Preuve", "Evidence"));
      ids.append(line);
      if (data.role === "admin" && b.kind !== "gtm_contact") {
        let reason;
        const f = form(
          line,
          L("Révoquer cette liaison", "Revoke this link"),
          run,
          async () => {
            await write("identity/unlink", {
              profileId: c.id,
              bindingId: b.id,
              reason: reason.value,
            });
            await reload();
          },
        );
        reason = field(
          f,
          L("Motif de révocation", "Revocation reason"),
          "text",
          "",
          true,
        );
      }
    }
    if (data.role === "admin" && c.status === "active") {
      const add = disclosure(
        p,
        L("Relier un identifiant exact", "Link an exact identifier"),
      );
      add.append(
        el(
          "p",
          "crm-muted",
          L(
            "Utilisez un ID de compte, de plateforme ou de client boutique. Une adresse IP, un nom ou une campagne ne constitue pas une preuve d’identité. Les ID saisis sont pseudonymisés côté serveur.",
            "Use an account, platform or store customer ID. An IP address, name or campaign is not identity evidence. Submitted IDs are pseudonymised on the server.",
          ),
        ),
      );
      let kind, scope, value, proof;
      const f = form(
        add,
        L("Relier l’identifiant", "Link identifier"),
        run,
        async () => {
          await write("identity/link", {
            profileId: c.id,
            identity: {
              kind: kind.value,
              scope: scope.value,
              value: value.value,
            },
            proof: proof.read(),
          });
          await reload();
        },
      );
      kind = select(
        f,
        L("Type d’identifiant", "Identifier type"),
        Object.entries(kindNames).filter(
          ([k]) => !["gtm_contact", "event_only"].includes(k),
        ),
      );
      scope = field(
        f,
        L(
          "Portée : domaine web, compte social, ID boutique ou plugin",
          "Scope: web domain, social account, store or plugin ID",
        ),
        "text",
        "",
        true,
      );
      value = field(
        f,
        L("ID exact (sans email)", "Exact ID (no email)"),
        "text",
        "",
        true,
      );
      value.maxLength = 240;
      proof = proofFields(f);
      kind.onchange = () => {
        proof.times.hidden = kind.value !== "web_session";
      };
    }
    if (data.role === "admin") {
      const controls = disclosure(
        p,
        L(
          "Contrôler la collecte et les données",
          "Control collection and data",
        ),
      );
      button(
        controls,
        c.status === "paused"
          ? L("Reprendre la collecte", "Resume collection")
          : L("Suspendre la collecte", "Pause collection"),
        () =>
          run(async () => {
            await write("contact/status", {
              profileId: c.id,
              version: c.version,
              status: c.status === "paused" ? "active" : "paused",
            });
            await reload();
          }),
      );
      controls.append(
        el(
          "p",
          "crm-muted",
          L(
            "L’effacement supprime cette fiche, ses liaisons actuelles et leurs événements dans GTM. Les données du CRM ou de la boutique source restent à gérer dans ces outils. Saisissez ERASE pour confirmer.",
            "Erasure removes this contact, its current links and their events from GTM. Manage data in the source CRM or store separately. Type ERASE to confirm.",
          ),
        ),
      );
      let confirmation;
      const f = form(
        controls,
        L("Effacer la fiche", "Erase contact"),
        run,
        async () => {
          await write("contact/erase", {
            profileId: c.id,
            version: c.version,
            confirmation: confirmation.value,
          });
          selected = null;
          offset = 0;
          await reload();
        },
      );
      confirmation = field(
        f,
        L("Confirmation", "Confirmation"),
        "text",
        "",
        true,
      );
      confirmation.pattern = "ERASE";
    }
  }
  function drawConnections() {
    const p = panel(
      body,
      L("Deux modes, une timeline", "Two modes, one timeline"),
      L(
        "Le CRM intégré conserve vos fiches dans GTM Growth. Le mode CRM client conserve votre outil comme source principale et reçoit ses ID et activités via un plugin serveur. Les deux modes peuvent partager les mêmes fiches reliées.",
        "The built-in CRM stores contacts in GTM Growth. Client CRM mode keeps your tool as the primary source and receives IDs and activities through a server plugin. Both modes can share the same linked contacts.",
      ),
    );
    if (data.role === "admin") {
      let mode, enabled;
      const f = form(
        p,
        L("Enregistrer le mode et la collecte", "Save mode and collection"),
        run,
        async () => {
          await write("configure", {
            mode: mode.value,
            enabled: enabled.value === "yes",
          });
          await reload();
        },
      );
      mode = select(f, L("Mode principal", "Primary mode"), [
        ["native", L("CRM dans GTM Growth", "CRM inside GTM Growth")],
        ["plugin", L("CRM client avec plugin", "Client CRM with plugin")],
      ]);
      mode.value = data.settings.mode;
      enabled = select(f, L("Collecte CRM", "CRM collection"), [
        ["no", L("Désactivée", "Disabled")],
        ["yes", L("Activée par l’administrateur", "Enabled by administrator")],
      ]);
      enabled.value = data.settings.enabled ? "yes" : "no";
    } else
      p.append(
        el(
          "p",
          "",
          data.settings.enabled
            ? L("Collecte activée", "Collection enabled")
            : L("Collecte désactivée", "Collection disabled"),
        ),
      );
    const plugins = panel(
      body,
      L("Plugins du CRM client", "Client CRM plugins"),
      L(
        "Un adaptateur serveur est requis dans votre CRM. Il envoie les contacts, les liaisons explicites et les événements autorisés. Aucun jeton n’est saisi dans le navigateur.",
        "Your CRM requires a server adapter. It sends contacts, explicit links and authorised events. No token is entered in the browser.",
      ),
    );
    if (!data.capabilities?.plugins?.length)
      plugins.append(
        el(
          "p",
          "crm-empty",
          L(
            "Aucun plugin configuré. Transmettez le guide d’intégration à votre administrateur.",
            "No plugin configured. Share the integration guide with your administrator.",
          ),
        ),
      );
    for (const p of data.capabilities?.plugins || []) {
      const row = el("div", "crm-binding");
      row.append(
        el("strong", "", p.name),
        el(
          "p",
          "crm-muted",
          p.channels.map((c) => channelNames[c]).join(" · "),
        ),
        el(
          "p",
          "",
          L(
            "Configuration présente ; connectivité non testée dans cet écran.",
            "Configuration present; connectivity is not tested on this screen.",
          ),
        ),
      );
      plugins.append(row);
    }
    source(
      plugins,
      "https://github.com/Geoking2104/GTM-Growth/tree/main/integrations/crm-plugin",
      L("Guide et client de référence", "Guide and reference client"),
    );
    const commerce = panel(
      body,
      L("Shopify et PrestaShop", "Shopify and PrestaShop"),
      L(
        "Connectez la boutique dans E-commerce, importez ses commandes, puis reliez l’ID client exact à une fiche. Un compte boutique ne prouve pas une connexion web authentifiée.",
        "Connect the store in E-commerce, import its orders, then link its exact customer ID to a contact. A store customer record does not prove an authenticated web login.",
      ),
    );
    const a = el(
      "a",
      "btn btn-small",
      L("Ouvrir E-commerce", "Open E-commerce"),
    );
    a.href = "#commerce";
    commerce.append(a);
    if (["admin", "editor"].includes(data.role) && data.settings.enabled)
      button(
        commerce,
        L("Importer les commandes déjà reçues", "Import received orders"),
        () =>
          run(async () => {
            const r = await call("sync");
            const note = el(
              "p",
              "crm-warning",
              L("Import borné : ", "Bounded import: ") +
                r.seeded +
                L(" commandes examinées ; ", " orders checked; ") +
                r.legacySkipped +
                L(
                  " anciennes références à resynchroniser depuis la boutique.",
                  " legacy references require store resync.",
                ),
            );
            commerce.append(note);
            if (r.hasMore || r.failed)
              commerce.append(
                el(
                  "p",
                  "crm-warning",
                  L(
                    "Import restant ou en erreur : ouvrez la timeline pour continuer.",
                    "Import pending or failed: open the timeline to continue.",
                  ),
                ),
              );
          }),
      );
    if (data.role === "admin") {
      const roles = panel(
        body,
        L("Accès à cet espace CRM", "Access to this CRM workspace"),
        L(
          "Les administrateurs du client gèrent les identités. Accordez une lecture ou une contribution explicite aux autres utilisateurs.",
          "Client administrators manage identities. Grant explicit read or edit access to other users.",
        ),
      );
      for (const [actor, role] of Object.entries(data.settings.roles || {}))
        roles.append(
          el(
            "p",
            "",
            actor +
              " · " +
              (role === "reader"
                ? L("Lecteur", "Reader")
                : L("Contributeur", "Editor")),
          ),
        );
      let actor, role;
      const f = form(
        roles,
        L("Enregistrer l’accès", "Save access"),
        run,
        async () => {
          await write("grant", { actor: actor.value, role: role.value });
          await reload();
        },
      );
      actor = field(
        f,
        L("ID utilisateur Keycloak exact", "Exact Keycloak user ID"),
        "text",
        "",
        true,
      );
      role = select(f, L("Rôle CRM", "CRM role"), [
        ["reader", L("Lecture", "Read")],
        [
          "editor",
          L(
            "Créer des fiches et interactions",
            "Create contacts and interactions",
          ),
        ],
        ["none", L("Retirer l’accès", "Remove access")],
      ]);
      const audit = disclosure(
        body,
        L("Historique des opérations", "Operation history"),
      );
      for (const row of data.audit || [])
        audit.append(
          el(
            "p",
            "crm-muted",
            date(row.at) +
              " · " +
              row.actor +
              " · " +
              row.action +
              (row.detail ? " · " + row.detail : ""),
          ),
        );
    }
  }
  await run(reload);
  return root;
}
