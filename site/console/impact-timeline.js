/** Impact timeline and J+14/J+28 reminders on the public read.
 * Evidence-first: each step compares one consecutive pair of the requestor's
 * own snapshots, outcome counters stay per step (never summed across steps,
 * scopes or clients) and points and scores remain withheld. Follow-ups are
 * surfaced dates only; nothing is sent or scheduled from the browser. */
const TEXT = {
  fr: {
    badge: "TRAJECTOIRE D’IMPACT", title: "Impact relevé entre vos observations",
    intro: "Chaque étape compare deux de vos propres relevés consécutifs de cette même page. Les compteurs restent propres à chaque étape : ils ne sont jamais additionnés entre étapes, pages ni clients.",
    step: "Étape", days: "jours", confidence: "Confiance",
    high: "Haute", medium: "Moyenne", low: "Basse",
    reasons: "Raisons de la confiance",
    improved: "améliorés", regressed: "dégradés", unchanged: "inchangés",
    newlyObserved: "nouvellement observés", newlyUnavailable: "nouvellement indisponibles",
    newlyApplicable: "nouvellement applicables", noLongerApplicable: "non applicables",
    actionsResolved: "actions résolues", actionsNew: "actions nouvelles", actionsUnchanged: "actions inchangées",
    notComparable: "Paire non comparable",
    followUps: "Vos prochains rappels (J+14, J+28)",
    due: "à faire", upcoming: "à venir",
    insufficient: "Pas encore assez de vos relevés comparables pour une trajectoire d’impact.",
    observations: "Relevés de cette page enregistrés pour vous :",
  },
  en: {
    badge: "IMPACT TRAJECTORY", title: "Measured impact across your observations",
    intro: "Each step compares two of your own consecutive reads of this same page. Outcome counters stay per step: they are never summed across steps, pages or clients.",
    step: "Step", days: "days", confidence: "Confidence",
    high: "High", medium: "Medium", low: "Low",
    reasons: "Confidence reasons",
    improved: "improved", regressed: "regressed", unchanged: "unchanged",
    newlyObserved: "newly observed", newlyUnavailable: "newly unavailable",
    newlyApplicable: "newly applicable", noLongerApplicable: "no longer applicable",
    actionsResolved: "actions resolved", actionsNew: "new actions", actionsUnchanged: "actions unchanged",
    notComparable: "Pair not comparable",
    followUps: "Your next follow-ups (J+14, J+28)",
    due: "due", upcoming: "upcoming",
    insufficient: "Not enough of your comparable reads yet for an impact trajectory.",
    observations: "Reads of this page recorded for you:",
  },
};

const el = (tag, cls, value) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value !== undefined) node.textContent = value;
  return node;
};

const dateText = (value, lang) => new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const numberText = (value, lang) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 }).format(value);

function followUps(list, copy, lang) {
  const group = el("div", "impact-followups");
  group.append(el("h3", "", copy.followUps));
  for (const followUp of list) {
    const item = el("div", "impact-followup");
    item.append(el("strong", "", followUp.label), document.createTextNode(` · ${dateText(followUp.dueAt, lang)} · ${followUp.status === "due" ? copy.due : copy.upcoming}`));
    item.append(el("p", "public-description", followUp.suggestion?.[lang] ?? ""));
    group.append(item);
  }
  return group;
}

function stepBlock(step, index, copy, lang) {
  const block = el("div", "impact-step");
  const head = el("div", "impact-step-head");
  head.append(
    el("span", "impact-step-index", `${copy.step} ${index + 1}`),
    el("span", "impact-step-dates", `${dateText(step.previousObservedAt, lang)} → ${dateText(step.currentObservedAt, lang)} · ${numberText(step.intervalDays, lang)} ${copy.days}`),
    el("span", `impact-chip impact-chip-${step.confidence}`, `${copy.confidence} : ${copy[step.confidence]}`),
  );
  block.append(head);
  const reasons = el("details", "impact-reasons");
  reasons.append(el("summary", "", copy.reasons));
  reasons.append(el("p", "public-micro", (Array.isArray(step.confidenceReasons) ? step.confidenceReasons : []).join(" · ")));
  block.append(reasons);
  const comparison = step.comparison;
  if (comparison?.status === "compared") {
    const counters = el("ul", "impact-counters");
    for (const [key, value] of Object.entries(comparison.summary ?? {})) counters.append(el("li", `impact-counter impact-counter-${key}`, `${copy[key] ?? key} : ${value}`));
    block.append(counters);
    const actions = el("p", "impact-actions", `${copy.actionsResolved} : ${comparison.actions?.resolved?.length ?? 0} · ${copy.actionsNew} : ${comparison.actions?.new?.length ?? 0} · ${copy.actionsUnchanged} : ${comparison.actions?.unchanged ?? 0}`);
    block.append(actions);
  } else {
    block.append(el("p", "public-description", `${copy.notComparable} : ${comparison?.note ?? ""}`));
  }
  return block;
}

function renderTimeline(section, data, copy, lang) {
  if (data.status === "timeline") {
    for (const [index, step] of (Array.isArray(data.steps) ? data.steps : []).entries()) section.append(stepBlock(step, index, copy, lang));
    if (Array.isArray(data.followUps) && data.followUps.length) section.append(followUps(data.followUps, copy, lang));
    section.append(el("p", "public-micro", data.note));
    return;
  }
  if (data.status === "insufficient_observations") {
    section.append(
      el("p", "public-description", copy.insufficient),
      el("p", "", `${copy.observations} ${data.observationCount}`),
    );
    if (Array.isArray(data.followUps) && data.followUps.length) section.append(followUps(data.followUps, copy, lang));
    section.append(el("p", "public-micro", data.note));
    return;
  }
  if (data.status === "scope_mismatch") {
    section.append(el("p", "public-description", data.note));
    return;
  }
  section.remove();
}

/** Mount the impact timeline of the requestor's own snapshots for one audit job. */
export function renderImpactTimeline(auditJob = null, language = "fr") {
  if (!auditJob?.id || !auditJob?.token) return null;
  const lang = language === "en" ? "en" : "fr";
  const copy = TEXT[lang];
  const section = el("section", "public-panel impact-timeline");
  section.append(el("p", "public-eyebrow", copy.badge), el("h2", "", copy.title), el("p", "public-description", copy.intro));
  void fetch(`/api/audits/${encodeURIComponent(auditJob.id)}/timeline`, {
    headers: { Authorization: `Bearer ${auditJob.token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
    .then(response => (response.ok ? response.json() : null))
    .then(data => {
      if (!data) { section.remove(); return; }
      renderTimeline(section, data, copy, lang);
    })
    .catch(() => section.remove());
  return section;
}
