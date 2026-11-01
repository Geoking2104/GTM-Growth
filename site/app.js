/**
 * Landing page behaviour: free URL read, lead capture, copy buttons.
 *
 * The free read is deliberately local: it never fetches the visitor's site, so
 * there is no CORS problem and nothing to fabricate. The full audit happens
 * server-side, through the MCP server or the CLI.
 */

import { auditUrlShape, normalizeTarget, verdict } from "./preview.js";
import { dictFor } from "./i18n.js";

const dict = dictFor(document.documentElement.lang);

/**
 * Set `leadEndpoint` to a form backend (Formspree, Basin, your own worker) that
 * accepts a JSON POST. When it is empty, the form falls back to a mailto: draft
 * addressed to `contactEmail`.
 */
const CONFIG = {
  leadEndpoint: "",
  contactEmail: "geoffroydelatournelle@gmail.com",
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

const leadForm = $("#lead-form");
const leadStatus = $("#lead-status");
const leadSite = $("#lead-site");

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
}

checkForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  renderResult(urlInput.value);
});

urlInput?.addEventListener("input", () => {
  if (!errorBox.hidden) clearError();
});

// Prefill the lead form when the visitor arrives from the result card.
$('a[href="#talk"]')?.addEventListener("click", () => {
  if (lastUrl && leadSite && !leadSite.value) leadSite.value = lastUrl;
});

function buildMailto(payload) {
  const subject = `GEO + GTM report request — ${payload.website}`;
  const body = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Website: ${payload.website}`,
    `Goal: ${payload.goal}`,
    "",
    "Sent from the Google Growth site.",
  ].join("\n");
  return `mailto:${CONFIG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitLead(payload) {
  if (CONFIG.leadEndpoint) {
    const response = await fetch(CONFIG.leadEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return "sent";
  }

  window.location.href = buildMailto(payload);
  return "mailto";
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
  };

  leadStatus.textContent = dict.lead.sending;
  try {
    const mode = await submitLead(payload);
    leadStatus.textContent = mode === "mailto" ? dict.lead.mailto : dict.lead.sent;
    leadForm.reset();
    if (payload.website) leadSite.value = payload.website;
  } catch (error) {
    leadStatus.textContent = dict.lead.failed(error.message);
  }
});

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
