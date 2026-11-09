/**
 * Landing page behaviour: free read (URL checks + server tables), lead capture,
 * copy buttons.
 *
 * The free read has two layers, and the UI says which one ran:
 *  - always: ten checks on the URL itself, in the browser, no fetch;
 *  - when an API base is configured: the server-side read adds the SEO tables
 *    and the GA4 / Search Console blocks.
 *
 * The lead form never opens a mail client. It POSTs to the API, and when the
 * network is down it queues the submission on the device and retries.
 */

import { auditUrlShape, normalizeTarget, verdict } from "./preview.js";
import { dictFor } from "./i18n.js";
import { renderTables, sampleTables } from "./tables.js";
import { initConsole } from "./console.js";
import { renderSitemapMap } from "./sitemap-map.js";

const dict = dictFor(document.documentElement.lang);

const metaContent = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? "";
const CONFIG = {
  /** Base URL of the public API (`/api/free-read`, `/api/lead`). Empty = URL checks only. */
  apiBase: (metaContent("gg-api") || window.GG_API_BASE || "").replace(/\/$/, ""),
  /**
   * Any endpoint that accepts `POST` JSON (Formspree, Basin, your own worker).
   * Used only for the lead form, so a static-only deploy can still send.
   */
  formEndpoint: metaContent("gg-form") || window.GG_FORM_ENDPOINT || "",
  queueKey: "gg.lead.queue.v1",
  timeoutMs: 20_000,
};

const $ = (selector, root = document) => root.querySelector(selector);

const checkForm = $("#check-form");
const urlInput = $("#site-url");
const errorBox = $("#check-error");
const resultSection = $("#free-read");
const resultHost = $("#result-host");
const resultVerdict = $("#result-verdict");
const checkList = $("#check-list");
const scoreEl = $("#score");
const scoreValue = $("#score-value");
const tableHost = $("#result-tables");
const tableNote = $("#result-tables-note");
const sitemapMapHost = $("#sitemap-map");
const priorityPanel = $("#geo-priority-panel");
const priorityList = $("#geo-priority-list");
const breakdownPanel = $("#geo-breakdown-panel");
const breakdownList = $("#geo-breakdown-list");

const leadForm = $("#lead-form");
const leadStatus = $("#lead-status");
const leadSite = $("#lead-site");
const leadStartedAt = Date.now();

let lastUrl = "";

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

function renderChecks(checks) {
  checkList.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.className = check.status;

      const mark = document.createElement("span");
      mark.className = "mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = check.status === "pass" ? "✓" : "!";

      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = check.label;
      const evidence = document.createElement("div");
      evidence.className = "evidence";
      evidence.textContent = check.evidence;
      body.append(title, evidence);

      if (check.status !== "pass" && check.fix) {
        const fix = document.createElement("div");
        fix.className = "fix";
        fix.textContent = check.fix;
        body.append(fix);
      }

      item.append(mark, body);
      return item;
    })
  );
}

function setTablesNote(text, tone = "") {
  if (!tableNote) return;
  tableNote.textContent = text;
  tableNote.dataset.tone = tone;
  tableNote.hidden = !text;
}

function renderTopFixes(fixes) {
  if (!priorityPanel || !priorityList) return;
  const items = Array.isArray(fixes) ? fixes.slice(0, 3) : [];
  priorityPanel.hidden = items.length === 0;
  priorityList.replaceChildren(...items.map((fix) => {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = fix.action || fix.checkId || "Review this check";
    const points = document.createElement("span");
    points.className = "geo-priority-points";
    points.textContent = Number.isFinite(fix.points) ? `+${fix.points} pts recoverable` : "Review";
    li.append(name, points);
    return li;
  }));
}

const CATEGORY_LABELS = {
  robots: "Robots.txt", llms: "llms.txt", schema: "Schema JSON-LD",
  meta: "Meta tags", content: "Content", brand_entity: "Brand & Entity",
  signals: "Signals", ai_discovery: "AI discovery",
};

function renderCategoryBreakdown(breakdown, caps) {
  if (!breakdownPanel || !breakdownList) return;
  const entries = Object.entries(CATEGORY_LABELS).filter(([key]) =>
    Number.isFinite(breakdown?.[key]) && Number.isFinite(caps?.[key]) && caps[key] > 0);
  breakdownPanel.hidden = entries.length === 0;
  breakdownList.replaceChildren(...entries.map(([key, label]) => {
    const row = document.createElement("div");
    row.className = "geo-breakdown-row";
    const name = document.createElement("span");
    name.className = "geo-breakdown-label";
    name.textContent = label;
    const track = document.createElement("div");
    track.className = "geo-breakdown-track";
    track.setAttribute("role", "meter");
    track.setAttribute("aria-label", label);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(caps[key]));
    track.setAttribute("aria-valuenow", String(Math.max(0, Math.min(caps[key], breakdown[key]))));
    const fill = document.createElement("span");
    fill.className = "geo-breakdown-fill";
    fill.style.width = `${Math.max(0, Math.min(100, 100 * breakdown[key] / caps[key]))}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "geo-breakdown-value";
    value.textContent = `${breakdown[key]} / ${caps[key]}`;
    row.append(name, track, value);
    return row;
  }));
}

/** Server read: real rows, real score, top fixes. Falls back to samples. */
async function loadServerTables(url) {
  if (!CONFIG.apiBase) {
    renderTables(tableHost, sampleTables(dict), dict);
    renderTopFixes([]);
    renderCategoryBreakdown(null, null);
    setTablesNote(dict.tables.noApi, "sample");
    return;
  }

  setTablesNote(dict.tables.loading, "loading");
  try {
    const response = await fetch(`${CONFIG.apiBase}/api/free-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(CONFIG.timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();

    if (typeof payload.score === "number") {
      scoreEl.style.setProperty("--score", String(payload.score));
      scoreValue.textContent = String(payload.score);
      scoreEl.setAttribute("aria-label", dict.scoreLabel(payload.score));
      scoreEl.querySelector(".score-label").textContent = payload.scoreVersion === "v1"
        ? `${dict.tables.geoScore} · v1` : dict.tables.geoScore;
    }
    if (payload.finalUrl) resultHost.textContent = new URL(payload.finalUrl).hostname.replace(/^www\./, "");
    if (Array.isArray(payload.headline) && payload.headline.length) {
      resultVerdict.textContent = payload.headline.map((item) => `${item.label}: ${item.value}`).join(" · ");
    }

    renderTopFixes(payload.topFixes);
    renderCategoryBreakdown(payload.scoreBreakdown, payload.scoreMax);
    renderTables(tableHost, payload.tables ?? [], dict);
    renderSitemapMap(sitemapMapHost, payload.sitemapMap ?? null, document.documentElement.lang);
    const measuredAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const seconds = typeof payload.durationMs === "number" ? (payload.durationMs / 1000).toFixed(1) : null;
    setTablesNote(dict.tables.serverNote({ at: measuredAt, seconds }), "live");
  } catch (error) {
    renderTables(tableHost, sampleTables(dict), dict);
    renderTopFixes([]);
    renderCategoryBreakdown(null, null);
    renderSitemapMap(sitemapMapHost, null, document.documentElement.lang);
    setTablesNote(dict.tables.unavailable(error.message), "sample");
  }
}

function renderResult(input) {
  clearError();
  const parsed = normalizeTarget(input, dict);
  if (!parsed.ok) {
    showError(parsed.error);
    urlInput.focus();
    return;
  }

  const report = auditUrlShape(parsed.url, dict);
  lastUrl = parsed.url.href;

  resultHost.textContent = report.host;
  resultVerdict.textContent = `${verdict(report.score, dict)} ${dict.summary(
    report.passed,
    report.total
  )}`;
  scoreEl.style.setProperty("--score", String(report.score));
  scoreValue.textContent = String(report.score);
  scoreEl.setAttribute("aria-label", dict.scoreLabel(report.score));
  renderChecks(report.checks);

  if (leadSite && !leadSite.value) leadSite.value = parsed.url.href;

  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#result-heading")?.focus?.();

  void loadServerTables(lastUrl);
}

checkForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  renderResult(urlInput.value);
});

urlInput?.addEventListener("input", () => {
  if (!errorBox.hidden) clearError();
});

// Prefill the lead form when the visitor arrives from the result card.
for (const link of document.querySelectorAll('a[href="#talk"]')) {
  link.addEventListener("click", () => {
    if (lastUrl && leadSite && !leadSite.value) leadSite.value = lastUrl;
  });
}

/* ── Lead capture ─────────────────────────────────────────── */

function readQueue() {
  try {
    const raw = localStorage.getItem(CONFIG.queueKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(CONFIG.queueKey, JSON.stringify(items.slice(-20)));
  } catch {
    /* storage full or blocked: nothing else to do */
  }
}

async function postLead(payload) {
  const target = CONFIG.apiBase ? `${CONFIG.apiBase}/api/lead` : CONFIG.formEndpoint;
  if (!target) throw new Error("no endpoint configured");
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const fields = Array.isArray(detail.errors)
      ? detail.errors.map((item) => item?.message).filter(Boolean).join("; ")
      : "";
    throw new Error(fields || detail.error || `HTTP ${response.status}`);
  }
  return response.status;
}

/** Send whatever the device kept from a failed attempt. */
export async function flushQueue() {
  if (!CONFIG.apiBase) return;
  const queue = readQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await postLead(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

leadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!leadForm.reportValidity()) return;

  const payload = {
    name: $("#lead-name").value.trim(),
    email: $("#lead-email").value.trim(),
    website: ($("#lead-site").value || lastUrl).trim(),
    goal: $("#lead-goal").value,
    source: "landing",
    company: $("#lead-company")?.value ?? "",
    elapsedMs: Date.now() - leadStartedAt,
    // Form backends use this as the notification subject; our own API ignores it.
    _subject: `GEO report request — ${($("#lead-site").value || lastUrl || "no website").trim()}`,
  };

  if (!CONFIG.apiBase && !CONFIG.formEndpoint) {
    writeQueue([...readQueue(), { ...payload, queuedAt: new Date().toISOString() }]);
    leadStatus.dataset.tone = "queued";
    leadStatus.textContent = dict.lead.noApi;
    return;
  }

  leadStatus.dataset.tone = "pending";
  leadStatus.textContent = dict.lead.sending;
  const button = leadForm.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  try {
    await postLead(payload);
    leadStatus.dataset.tone = "ok";
    leadStatus.textContent = dict.lead.sent;
    leadForm.reset();
    if (payload.website) leadSite.value = payload.website;
  } catch (error) {
    writeQueue([...readQueue(), { ...payload, queuedAt: new Date().toISOString() }]);
    leadStatus.dataset.tone = "queued";
    leadStatus.textContent = dict.lead.queued(error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

void flushQueue();

initConsole();

// Copy-to-clipboard buttons
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const text = button.getAttribute("data-copy") ?? "";
    try {
      await navigator.clipboard.writeText(text);
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = original), 1600);
    } catch {
      button.textContent = "Copy failed";
    }
  });
}
