/* Démarrage guidé : wizard plein écran en 5 étapes (site → profil → accès →
 * concurrents → premier audit), inspiré de geoptie.com/app/onboarding et de la
 * pédagogie rea.tools/get-started (critère binaire vérifiable par étape).
 * Aucune donnée n'est cochée côté client sans preuve API : chaque étape lit le
 * statut réel (/tracking/status, /onboarding/profile, /overview). */
import { el } from "./render.js";
import { t, LANG } from "./i18n.js";

const WIZ_KEY = "gtm-console-wizard-done";
export const wizardRedo = () => { localStorage.removeItem(WIZ_KEY); };

export const wizardNeeded = (me) => {
  if (localStorage.getItem(WIZ_KEY) === "1") return false;
  const tenant = me?.tenant;
  if (!tenant) return false;
  // Un tenant déjà configuré (domaines + un accès) n'a pas besoin du wizard :
  // la checklist « Démarrage » reprend le rôle de rappel permanent.
  return !(tenant.domains?.length && (tenant.gscProperties?.length || tenant.ga4Properties?.length));
};

const httpUrl = (v) => { try { const u = new URL(/^https?:\/\//.test(v) ? v : `https://${v}`); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; } };

function shell({ step, title, lead, body, onBack, onNext, nextLabel, nextDisabled, onExit, onSkip, skipLabel, error }) {
  const wrap = el("div", "wiz");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", title);
  const head = el("header", "wiz-head");
  const brand = el("span", "wiz-brand", "GTM Growth");
  const exit = el("button", "wiz-exit", t("wizExit")); exit.type = "button"; exit.onclick = onExit;
  head.append(brand, exit);
  const parts = [head];
  if (step) parts.push(el("p", "wiz-step", `${t("wizStep")} ${step} ${t("wizOf")}`));
  parts.push(el("h2", "wiz-title", title));
  if (lead) parts.push(el("p", "wiz-lead", lead));
  const main = el("div", "wiz-body");
  main.append(...[body].flat());
  parts.push(main);
  const nav = el("footer", "wiz-nav");
  const back = el("button", "wiz-btn", t("wizBack")); back.type = "button"; back.disabled = !onBack; back.onclick = onBack;
  nav.append(back);
  if (onSkip) { const skip = el("button", "wiz-btn wiz-btn-skip", skipLabel ?? t("wizSkip")); skip.type = "button"; skip.onclick = onSkip; nav.append(skip); }
  const next = el("button", "wiz-btn wiz-btn-primary", nextLabel ?? t("wizNext")); next.type = "button"; next.disabled = Boolean(nextDisabled); next.onclick = onNext;
  nav.append(next);
  parts.push(nav);
  if (error) parts.push(el("p", "wiz-error", error));
  wrap.append(...parts);
  return wrap;
}

/** Étape 1 — le domaine : doit appartenir au tenant (le picker la validera). */
function stepDomain(state, me) {
  const box = el("div", "wiz-field");
  const label = el("label", "", t("wizS1Field"));
  const input = el("input"); input.type = "url";
  input.value = state.url || (me?.tenant?.domains?.[0] ? `https://${me.tenant.domains[0]}` : "");
  input.placeholder = "https://www.exemple.fr";
  label.append(input); box.append(label);
  let error = "";
  const body = [box];
  const read = () => { const u = httpUrl(input.value.trim()); if (!u) error = t("wizS1Error"); else error = ""; return u; };
  return { body, read, get error() { return error; } };
}

/** Étape 2 — profil lu sur la page d'accueil (route /onboarding/profile). */
function stepProfile(api, url) {
  const box = el("div", "wiz-field");
  const msg = el("p", "wiz-note", t("wizS2Analyzing"));
  const name = el("input"); name.placeholder = t("wizS2Name");
  const desc = el("textarea"); desc.rows = 3; desc.placeholder = t("wizS2Desc");
  const langBox = el("p", "wiz-note"); langBox.textContent = t("wizS2Lang");
  const schemaBox = el("p", "wiz-note"); schemaBox.textContent = t("wizS2Schema");
  box.append(msg, name, desc, langBox, schemaBox);
  let profile = null;
  (async () => {
    try {
      const r = await api("/onboarding/profile", { url });
      profile = r.profile;
      name.value = profile.siteName ?? profile.title ?? "";
      desc.value = (profile.description ?? "").slice(0, 500);
      langBox.textContent = `${t("wizS2Lang")} : ${profile.lang ?? t("wizS2None")}`;
      schemaBox.textContent = `${t("wizS2Schema")} : ${profile.schemaTypes.join(", ") || t("wizS2None")}`;
      msg.textContent = profile.siteNameSource === "schema"
        ? (LANG === "en" ? `Read from structured data (HTTP ${profile.httpStatus}).` : `Lu dans les données structurées (HTTP ${profile.httpStatus}).`)
        : (LANG === "en" ? `Read from the homepage (HTTP ${profile.httpStatus}).` : `Lu dans la page d’accueil (HTTP ${profile.httpStatus}).`);
    } catch (e) {
      profile = null;
      msg.textContent = e.message;
      msg.className = "wiz-error";
    }
  })();
  return { body: [box], get profile() { return profile; }, get values() { return { siteName: name.value.trim(), description: desc.value.trim() }; } };
}

/** Étape 3 — accès : critère binaire par source, au moins un vrai accès ou skip. */
function stepAccess(api, scope, onChange) {
  const box = el("div", "wiz-access");
  let status = null;
  const checking = () => el("p", "wiz-note", t("wizS3Checking"));
  const draw = () => {
    box.replaceChildren();
    if (!status) { box.append(checking()); return; }
    const email = status.serviceAccount?.email;
    if (email) {
      const grant = el("p", "wiz-note");
      grant.append(`${t("wizS3Grant")} `);
      grant.append(el("code", "", email));
      box.append(grant);
    }
    const sources = [
      { key: "gsc", label: "Search Console", ok: status.gsc?.hasAccess === true, how: t("wizS3GscSteps") },
      { key: "ga4", label: "Google Analytics 4", ok: status.ga4?.hasAccess === true, how: t("wizS3Ga4Steps") },
      { key: "bing", label: "Bing Webmaster", ok: Boolean(status.bing?.keyConfigured) && status.bing?.hasAccess !== false && !status.bing?.error, how: (LANG === "en" ? "Settings → Bing API key (free)." : "Paramètres → clé API Bing (gratuite).") },
    ];
    for (const s of sources) {
      const line = el("div", `wiz-access-line${s.ok ? " is-ok" : ""}`);
      line.append(el("span", `pill ${s.ok ? "ok" : "warn"}`, s.ok ? "✓" : "…"), el("strong", "", s.label));
      if (!s.ok) line.append(el("span", "wiz-how", s.how));
      box.append(line);
    }
    const redo = el("button", "wiz-btn", t("wizS3Recheck")); redo.type = "button";
    redo.onclick = () => check();
    box.append(redo);
  };
  const check = async () => {
    box.replaceChildren(checking());
    try { status = await api("/tracking/status", scope()); } catch (e) { status = { error: e.message }; }
    draw();
    onChange?.();
  };
  check();
  return { body: [box], recheck: check, get ok() { return Boolean(status && (status.gsc?.hasAccess === true || status.ga4?.hasAccess === true)); } };
}

/** Étape 4 — concurrents (0–5 URLs), sauvegardés dans les paramètres du tenant. */
function stepCompetitors(existing) {
  const box = el("div", "wiz-field");
  const list = el("div", "wiz-chips");
  const urls = new Set((existing ?? []).filter((x) => typeof x === "string"));
  const input = el("input"); input.type = "url"; input.placeholder = t("wizS4Placeholder");
  const add = el("button", "wiz-btn", t("wizS4Add")); add.type = "button";
  const note = el("p", "wiz-note", t("wizS4Max"));
  const draw = () => {
    list.replaceChildren();
    for (const u of urls) {
      const chip = el("span", "wiz-chip"); chip.append(el("span", "", u));
      const rm = el("button", "", "×"); rm.type = "button"; rm.setAttribute("aria-label", t("wizS4Remove"));
      rm.onclick = () => { urls.delete(u); draw(); };
      chip.append(rm); list.append(chip);
    }
    add.disabled = urls.size >= 5;
  };
  const push = () => { const u = httpUrl(input.value.trim()); if (u && urls.size < 5) { urls.add(u); input.value = ""; draw(); } };
  add.onclick = push;
  input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); push(); } };
  draw();
  box.append(list, input, add, note);
  return { body: [box], get urls() { return [...urls]; } };
}

/** Étape 5 — premier audit : lance /overview et montre le résultat attendu. */
function stepAudit(api, url) {
  const box = el("div", "wiz-field");
  const expectations = el("ul", "wiz-expect");
  for (const s of [t("wizS5ExpectScore"), t("wizS5ExpectPlan"), t("wizS5ExpectEngines")]) expectations.append(el("li", "", s));
  const out = el("div", "wiz-result");
  box.append(expectations, out);
  let data = null;
  (async () => {
    out.append(el("p", "wiz-note", t("wizS5Running")));
    try {
      data = await api("/overview", { url });
      out.replaceChildren();
      const row = el("p", "wiz-score-row");
      const big = el("strong", "wiz-score", String(data.geo.score));
      row.append(el("span", "", `${t("kGeo")} : `), big, el("span", "wiz-note", ` → ${data.geo.projectedScore}/100`));
      out.append(row);
      const top = el("ol", "wiz-expect");
      for (const r of (data.geo.recommendations ?? []).slice(0, 3)) top.append(el("li", "", `${r.action} (+${r.points})`));
      out.append(top, el("p", "wiz-note", t("wizS5Done")));
    } catch (e) {
      out.replaceChildren(el("p", "wiz-error", e.message));
    }
  })();
  return { body: [box], get data() { return data; } };
}

/** Écran final : checklist + prompt agent copiable (pattern rea.tools). */
function stepDone() {
  const box = el("div", "wiz-field");
  const prompt = t("wizAgentPrompt");
  const pre = el("pre", "wiz-prompt"); pre.textContent = prompt;
  const copy = el("button", "wiz-btn wiz-btn-primary", (LANG === "en" ? "Copy the prompt" : "Copier le prompt")); copy.type = "button";
  copy.onclick = () => { navigator.clipboard?.writeText(prompt); copy.textContent = (LANG === "en" ? "Copied ✓" : "Copié ✓"); };
  box.append(el("h3", "", t("wizAgentTitle")), el("p", "wiz-note", t("wizAgentLead")), pre, copy);
  return { body: [box] };
}

/**
 * Monte le wizard complet. `deps` : { api, state, scope, saveSettings, me, saveUrl, onExit }.
 * Le wizard est indépendant du routing de la console : il recouvre l'écran.
 */
export function mountWizard(deps) {
  const { api, state, scope, saveSettings, me, saveUrl, onExit } = deps;
  let current = 1;
  const data = { url: "", profile: null, competitors: [] };
  const root = document.querySelector("#c-app") ?? document.body;
  const holder = el("div", "wiz-overlay");
  root.append(holder);

  const close = () => { localStorage.setItem(WIZ_KEY, "1"); holder.remove(); onExit(); };

  const s1 = stepDomain(state, me);
  let s2 = null; let s3 = null; let s4 = null; let s5 = null;

  const toCompetitors = async () => {
    data.competitors = s4.urls;
    try { await saveSettings({ competitors: s4.urls }); } catch { /* non bloquant : modifiable dans les Paramètres */ }
    current = 5; s5 = stepAudit(api, data.url || state.url); draw();
  };

  const draw = () => {
    holder.replaceChildren();
    let view;
    if (current === 1) {
      view = shell({
        step: 1, title: t("wizS1Title"), lead: t("wizS1Lead"), body: s1.body, error: s1.error,
        onBack: null,
        onNext: () => { const u = s1.read(); if (!u) { draw(); return; } data.url = u; saveUrl(u); current = 2; s2 = stepProfile(api, u); draw(); },
        onExit: close,
      });
    } else if (current === 2) {
      view = shell({
        step: 2, title: t("wizS2Title"), lead: t("wizS2Lead"), body: s2.body,
        onBack: () => { current = 1; draw(); },
        onNext: () => { data.profile = s2.values; current = 3; s3 = stepAccess(api, scope, () => { if (current === 3) draw(); }); draw(); },
        onExit: close,
      });
    } else if (current === 3) {
      view = shell({
        step: 3, title: t("wizS3Title"), lead: t("wizS3Lead"), body: s3.body,
        onBack: () => { current = 2; draw(); },
        onNext: () => { current = 4; s4 = stepCompetitors(me?.tenant?.competitors); draw(); },
        nextDisabled: !s3.ok,
        onSkip: s3.ok ? undefined : () => { current = 4; s4 = stepCompetitors(me?.tenant?.competitors); draw(); },
        onExit: close,
      });
    } else if (current === 4) {
      view = shell({
        step: 4, title: t("wizS4Title"), lead: t("wizS4Lead"), body: s4.body,
        onBack: () => { current = 3; draw(); },
        onNext: toCompetitors,
        onExit: close,
      });
    } else if (current === 5) {
      view = shell({
        step: 5, title: t("wizS5Title"), lead: t("wizS5Lead"), body: s5.body,
        onBack: () => { current = 4; draw(); },
        onNext: () => { current = 6; draw(); },
        nextLabel: t("wizFinish"),
        onExit: close,
      });
    } else {
      view = shell({
        step: null, title: t("wizDoneTitle"), lead: t("wizDoneLead"), body: stepDone().body,
        onBack: null,
        onNext: close,
        nextLabel: t("wizFinish"),
        onExit: close,
      });
    }
    holder.append(view);
  };
  draw();
}
