import { el } from "./render.js";
import { LANG } from "./i18n.js";
import { API_BASE, CONSOLE_DOMAIN } from "./config.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (label, handler) => { const b = el("button", "btn btn-small", label); b.type = "button"; b.onclick = handler; return b; };

/** Guided provisioning is only displayed to platform admins; the API also enforces the role. */
export function renderPlatformSetup(accessToken) {
  const root = el("section", "app-strip platform-setup"); let stage = 0, data = null, busy = false;
  const draw = () => {
    root.replaceChildren(el("h3", "", L("Provisionner un client", "Provision a client")));
    if (stage === 0) {
      root.append(el("p", "c-note", L("1. Préparez les informations du client. La création configure Keycloak et envoie une invitation par e-mail à son administrateur.", "1. Prepare the client details. Creation configures Keycloak and emails an invitation to its administrator.")));
      const form = el("form", "c-form");
      const field = (name, label, required, placeholder, type = "text") => { const f = el("label", "c-field"); f.append(el("span", "", label)); const input = el("input"); input.name = name; input.type = type; input.required = required; input.placeholder = placeholder; if (data?.[name]) input.value = data[name]; f.append(input); form.append(f); };
      field("id", L("Identifiant client (minuscules, chiffres, tirets)", "Client ID (lowercase, numbers, hyphens)"), true, "acme");
      field("name", L("Nom du client", "Client name"), true, "Acme");
      field("domain", L("Domaine du site", "Website domain"), true, "acme.fr");
      field("emailDomain", L("Domaine des adresses e-mail", "Email domain"), true, "acme.fr");
      field("property", L("Propriété Search Console (facultatif)", "Search Console property (optional)"), false, "sc-domain:acme.fr");
      field("admin", L("E-mail du premier administrateur", "First administrator email"), true, "admin@acme.fr", "email");
      const mode = el("label", "c-field"); mode.append(el("span", "", L("Mode d’identité", "Identity mode"))); const select = el("select"); select.name = "mode"; for (const [value, name] of [["organization", L("Organisation dans le realm partagé", "Organization in shared realm")], ["realm", L("Realm dédié", "Dedicated realm")]]) { const option = el("option", "", name); option.value = value; select.append(option); } select.value = data?.mode || "organization"; mode.append(select); form.append(mode);
      const error = el("p", "c-error"); error.setAttribute("role", "alert"); const submit = el("button", "btn btn-small", L("Vérifier les informations", "Review details")); submit.type = "submit"; form.append(submit, error);
      form.onsubmit = (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); for (const k of Object.keys(values)) values[k] = String(values[k]).trim();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(values.id) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(values.domain) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(values.emailDomain)) { error.textContent = L("Vérifiez l’identifiant et les domaines : saisissez des noms de domaine sans URL.", "Check the ID and domains: enter domain names without URLs."); return; }
        if (values.mode === "organization" && values.admin.toLowerCase().split("@").at(-1) !== values.emailDomain.toLowerCase()) { error.textContent = L("L’e-mail administrateur doit appartenir au domaine e-mail de l’organisation.", "The administrator email must belong to the organization’s email domain."); return; }
        data = values; stage = 1; draw(); };
      root.append(form); return;
    }
    if (stage === 1) {
      root.append(el("p", "c-note", L("2. Vérifiez les informations. Confirmer crée les ressources Keycloak et envoie immédiatement un e-mail d’invitation valable 72 heures.", "2. Review the details. Confirming creates Keycloak resources and immediately sends an invitation email valid for 72 hours.")));
      const summary = el("dl"); for (const [k, label] of [["id", L("Identifiant", "ID")], ["name", L("Client", "Client")], ["domain", L("Site", "Website")], ["emailDomain", L("Domaine e-mail", "Email domain")], ["property", L("Propriété GSC", "GSC property")], ["admin", L("Administrateur invité", "Invited administrator")], ["mode", L("Mode", "Mode")]]) { summary.append(el("dt", "", label), el("dd", "", data[k] || "—")); } root.append(summary);
      const message = el("p", "c-error"); message.setAttribute("role", "alert");
      const back = button(L("Modifier", "Edit"), () => { stage = 0; draw(); });
      const confirm = button(L("Créer et envoyer l’invitation", "Create and send invitation"), async () => {
        if (busy) return; busy = true; confirm.disabled = true; back.disabled = true; message.textContent = L("Provisionnement en cours…", "Provisioning…");
        try { const token = await accessToken(); if (!token) throw new Error(L("Session expirée.", "Session expired.")); const response = await fetch(API_BASE.replace(/\/console$/, "/platform/tenants"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: data.id, name: data.name, mode: data.mode, domains: [data.domain], emailDomains: [data.emailDomain], gscProperties: data.property ? [data.property] : [], admin: { email: data.admin } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`); data.result = result; stage = 2; draw(); }
        catch (e) { message.textContent = `${e.message} ${L("Vérifiez les ressources Keycloak et le registre avant de réessayer : une création partielle est possible.", "Check Keycloak resources and the registry before retrying: partial provisioning is possible.")}`; confirm.disabled = false; back.disabled = false; } finally { busy = false; }
      }); root.append(back, confirm, message); return;
    }
    root.append(el("p", "", L("3. Client créé ; l’invitation a été demandée à Keycloak.", "3. Client created; the invitation was requested from Keycloak.")));
    const list = el("ul"); for (const step of data.result.steps || []) list.append(el("li", "", step)); root.append(list);
    const link = el("a", "", L("Ouvrir la console du client", "Open client console")); link.href = `https://${data.id}.${CONSOLE_DOMAIN}/console/`; link.target = "_blank"; link.rel = "noopener noreferrer"; root.append(link, el("p", "c-note", L("Le lien de l’invitation est envoyé par Keycloak ; la console ne le fournit pas.", "Keycloak sends the invitation link; the console does not provide it.")), button(L("Provisionner un autre client", "Provision another client"), () => { stage = 0; data = null; draw(); }));
  };
  draw(); return root;
}
