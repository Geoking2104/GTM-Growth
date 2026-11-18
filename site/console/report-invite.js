/** Request a single-use report access code after the public page diagnosis. */
const TEXT = {
  fr: {
    badge: "RECEVOIR MON RAPPORT", title: "Envoyez-moi mon rapport complet",
    intro: "Recevez un code à usage unique par e-mail, revenez sur la page du rapport et téléchargez les versions PDF et Markdown.",
    email: "Votre e-mail professionnel", action: "Envoyer mon invitation", wait: "Préparation et envoi du code…",
    disabled: "L'envoi sécurisé par e-mail n'est pas encore activé sur ce serveur. Le rapport visible ci-dessus reste consultable et imprimable.",
    error: "Impossible d'envoyer l'invitation pour le moment. Réessayez plus tard.",
    limit: "Trop de demandes. Réessayez plus tard.",
    info: "Un code de six chiffres, valable 15 minutes. Aucun compte ni abonnement requis.",
  },
  en: {
    badge: "GET MY REPORT", title: "Email me the complete report",
    intro: "Receive a single-use code, return to the report page, and download the PDF and Markdown versions.",
    email: "Your work email", action: "Email my invitation", wait: "Preparing the report and sending your code…",
    disabled: "Secure email delivery is not yet activated on this server. The summary above remains visible and printable.",
    error: "The invitation could not be sent right now. Please try again later.",
    limit: "Too many requests. Please try again later.",
    info: "A six-digit code valid for 15 minutes. No account or subscription required.",
  },
};
const el = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; };

export function renderReportInvitation(report, language = "fr", auditJob = null) {
  if (report?.schemaVersion !== 1 || typeof report.sourceUrl !== "string") return null;
  const lang = language === "en" ? "en" : "fr", copy = TEXT[lang];
  let requestKey = null;
  const section = el("section", "public-panel report-invite");
  section.append(el("p", "public-eyebrow", copy.badge), el("h2", "", copy.title), el("p", "public-description", copy.intro));
  const form = el("form", "report-invite-form");
  const label = el("label", "", copy.email); const input = el("input");
  input.type = "email"; input.name = "email"; input.autocomplete = "email"; input.required = true; input.maxLength = 254;
  input.addEventListener("input", () => { requestKey = null; });
  label.append(input);
  const button = el("button", "public-url-button", copy.action); button.type = "submit"; button.disabled = true;
  const status = el("p", "report-invite-feedback", copy.info); status.setAttribute("role", "status");
  form.append(label, button); section.append(form, status);
  void fetch("/api/report-access/status", { cache: "no-store" }).then(r => r.ok ? r.json() : { enabled: false }).then(data => {
    if (data.enabled) button.disabled = false;
    else status.textContent = copy.disabled;
  }).catch(() => { status.textContent = copy.disabled; });
  form.onsubmit = async event => {
    event.preventDefault(); if (!form.reportValidity() || button.disabled) return;
    button.disabled = true; status.textContent = copy.wait;
    try {
      const response = await fetch("/api/report-access/invite", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": requestKey ||= btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") },
        body: JSON.stringify({ url: report.sourceUrl, email: input.value.trim(), language: lang, ...(auditJob ? { auditId: auditJob.id, auditToken: auditJob.token } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) { status.textContent = response.status === 429 ? copy.limit : copy.error; return; }
      const result = await response.json();
      if (!/^[0-9a-f-]{36}$/.test(result.id || "")) throw new Error("Invalid invitation");
      try { sessionStorage.setItem("gtm-report-email", input.value.trim()); } catch { /* Optional convenience only. */ }
      window.location.assign(`/report/?id=${encodeURIComponent(result.id)}&lang=${lang}`);
    } catch { status.textContent = copy.error; }
    finally { button.disabled = false; }
  };
  return section;
}
