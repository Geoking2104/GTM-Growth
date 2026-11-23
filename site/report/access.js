import { renderFreeReport360 } from "../console/report360.js";

const params = new URLSearchParams(window.location.search);
const lang = params.get("lang") === "en" ? "en" : "fr";
const id = /^[0-9a-f-]{36}$/.test(params.get("id") || "") ? params.get("id") : "";
const API = "/api/report-access";
const L = (fr, en) => lang === "fr" ? fr : en;

const copy = {
  "report-brand-label": L("Rapport personnel", "Personal report"),
  "report-back": L("Retour au site", "Back to website"),
  "report-eyebrow": L("RAPPORT GTM GROWTH", "GTM GROWTH REPORT"),
  "report-title": L("Accédez à votre rapport 360°", "Access your 360° report"),
  "report-subtitle": L("Un code à usage unique protège votre rapport. Retrouvez-le dans l'e-mail reçu après votre demande.", "Your report is protected by a single-use code. Check the email you received after requesting it."),
  "report-gate-title": L("Vérifiez votre adresse e-mail", "Verify your email address"),
  "report-email-label": L("Adresse e-mail", "Email address"),
  "report-code-label": L("Code à six chiffres", "Six-digit code"),
  "report-verify": L("Vérifier et ouvrir le rapport", "Verify and open report"),
  "report-code-hint": L("Le code expire après 15 minutes. Il n'est pas inclus dans le lien e-mail.", "The code expires in 15 minutes and is not included in the email link."),
  "report-ready-label": L("RAPPORT DÉBLOQUÉ", "REPORT UNLOCKED"),
  "report-ready-title": L("Votre rapport est prêt", "Your report is ready"),
  "report-ready-desc": L("Consultez-le ici ou conservez les fichiers.", "Read it here or download a copy."),
  "report-download-pdf": L("Télécharger le PDF", "Download PDF"),
  "report-download-md": L("Télécharger le Markdown", "Download Markdown"),
};

document.documentElement.lang = lang;
document.title = L("GTM Growth - Rapport 360°", "GTM Growth - 360° report");
for (const [key, value] of Object.entries(copy)) { const n = document.getElementById(key); if (n) n.textContent = value; }
for (const a of document.querySelectorAll(".report-languages a")) {
  a.href = `/report/?${new URLSearchParams({ ...(id ? { id } : {}), lang: a.dataset.lang })}`;
  a.setAttribute("aria-current", a.dataset.lang === lang ? "page" : "false");
}
document.getElementById("report-back").href = lang === "fr" ? "/fr/" : "/";

const form = document.getElementById("report-code-form");
const feedback = document.getElementById("report-feedback");
const emailInput = document.getElementById("report-email");
const codeInput = document.getElementById("report-code");
const gate = document.getElementById("report-gate");
const ready = document.getElementById("report-ready");
const button = document.getElementById("report-verify");
try { emailInput.value = sessionStorage.getItem("gtm-report-email") || ""; } catch { /* Optional. */ }

async function loadReport() {
  const response = await fetch(`${API}/report?id=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return false;
  const payload = await response.json();
  const report = renderFreeReport360(payload.report360, lang);
  if (!report) return false;
  const content = document.getElementById("c-public-read");
  content.replaceChildren(report);
  if (payload.visibilityEvidence?.length) {
    const section = document.createElement('section'), heading = document.createElement('h2');
    heading.textContent = L('Preuves de visibilité IA partagées', 'Shared AI visibility evidence');
    const scope = document.createElement('p');
    scope.textContent = L('Consultez ces preuves dans le rapport en ligne.', 'View this evidence in the online report.');
    section.append(heading, scope);
    for (const item of payload.visibilityEvidence) {
      const entry = document.createElement('article'), source = document.createElement('h3');
      source.textContent = `${item.source} · ${item.observedAt.slice(0, 10)}`;
      entry.append(source);
      if (item.excerpt) {
        const text = document.createElement('p'); text.textContent = item.excerpt; entry.append(text);
      }
      const list = document.createElement('ul');
      for (const url of item.citations) {
        if (!/^https?:\/\//i.test(url)) continue;
        const line = document.createElement('li'), link = document.createElement('a');
        link.href = url; link.textContent = url; link.rel = 'noopener noreferrer'; link.target = '_blank';
        line.append(link); list.append(line);
      }
      if (list.childElementCount) entry.append(list);
      section.append(entry);
    }
    content.append(section);
  }
  const uri = `${API}/download?id=${encodeURIComponent(id)}`;
  document.getElementById("report-download-pdf").href = `${uri}&format=pdf`;
  document.getElementById("report-download-md").href = `${uri}&format=md`;
  gate.hidden = true; ready.hidden = false;
  return true;
}

form.addEventListener("submit", async event => {
  event.preventDefault(); if (!form.reportValidity() || !id) return;
  button.disabled = true;
  feedback.textContent = L("Vérification en cours…", "Verifying your code…");
  try {
    const response = await fetch(`${API}/verify`, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id, email: emailInput.value.trim(), code: codeInput.value.trim() }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) { feedback.textContent = L("Code incorrect, expiré ou déjà utilisé. Demandez un nouveau rapport si besoin.", "The code is invalid, expired or already used. Request another report if needed."); return; }
    codeInput.value = "";
    if (!await loadReport()) feedback.textContent = L("Votre session a expiré. Demandez un nouveau code.", "Your session expired. Request a new code.");
  } catch { feedback.textContent = L("Service momentanément indisponible. Réessayez.", "Service temporarily unavailable. Please retry."); }
  finally { button.disabled = false; }
});

if (!id) {
  feedback.textContent = L("Lien incomplet. Lancez une analyse gratuite et demandez un nouveau rapport.", "Incomplete link. Run a free analysis and request a new report.");
  button.disabled = true;
} else void loadReport().catch(() => { /* Email/code form remains available. */ });
