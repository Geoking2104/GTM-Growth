/* The server enforces tenant-admin authorization and tenant membership. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
export function renderAccessManagement(me, api) {
  const box = el("section", "app-strip"); box.append(el("h3", "", L("Accès à cet espace", "Workspace access")));
  box.append(el("p", "c-note", L("Les accès restent limités à cet espace. Les invitations sont envoyées par Keycloak.", "Access is limited to this workspace. Invitations are sent by Keycloak.")));
  if (!me?.tenant) { box.append(el("p", "c-note", L("Sélectionnez un client.", "Select a client workspace."))); return box; }
  if (!me.platformAdmin && me.role !== "tenant-admin") { box.append(el("p", "c-note", L("Pour modifier un accès, contactez un administrateur de votre espace.", "To change access, contact a workspace administrator."))); return box; }
  const form = el("form", "c-form"); const label = el("label", "c-field"); label.append(el("span", "", L("E-mail à inviter", "Email to invite"))); const email = el("input"); email.type = "email"; email.required = true; label.append(email);
  const roleLabel = el("label", "c-field"); roleLabel.append(el("span", "", L("Rôle", "Role"))); const role = el("select"); for (const [value, name] of [["tenant-user", L("Utilisateur", "User")], ["tenant-admin", L("Administrateur", "Administrator")]]) { const option = el("option", "", name); option.value = value; role.append(option); } roleLabel.append(role);
  const submit = el("button", "btn btn-small", L("Envoyer l’invitation", "Send invitation")); submit.type = "submit"; const status = el("p", "c-note"); status.setAttribute("role", "status");
  form.onsubmit = async (event) => { event.preventDefault(); if (!form.reportValidity()) return; submit.disabled = true; status.textContent = L("Envoi…", "Sending…"); try { await api("/tenant/users", { email: email.value.trim(), role: role.value }); status.textContent = L("Invitation demandée à Keycloak.", "Invitation requested from Keycloak."); form.reset(); } catch (error) { status.textContent = error.message; } finally { submit.disabled = false; } };
  form.append(label, roleLabel, submit, status); box.append(form, el("p", "c-note", L("Pour retirer ou modifier un accès existant, contactez l’administration de la plateforme. L’exercice des droits sur les données est possible à contact@kayroslab.com.", "To remove or change an existing access, contact platform administration. Data rights requests can be sent to contact@kayroslab.com."))); return box;
}
