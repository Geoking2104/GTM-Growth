/* The self-hosted Apache-2.0 engine remains free; only operated Cloud is billed. */
import { el } from "./render.js";

const when = (v, fr) => v ? new Date(v).toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

export async function renderBilling({ me, request, fr = true }) {
  const root = el("section", "c-billing");
  root.append(el("h3", "", fr ? "Abonnement Cloud" : "Cloud subscription"));
  root.append(el("p", "c-note", fr ? "Le moteur open source reste gratuit. Seul le service Cloud est facturé ; clés IA tierces BYOK." : "The open-source engine stays free. Only Cloud hosting is billed; third-party AI keys are BYOK."));
  const output = el("p", "c-note");
  let status;
  try { status = await request("/status"); }
  catch {
    try { status = await request("/plans"); }
    catch { root.append(el("p", "c-error", fr ? "Facturation indisponible." : "Billing unavailable.")); return root; }
  }
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  if (status.plan) {
    const card = el("div", "c-card");
    card.append(el("h4", "", `${fr ? "Offre actuelle" : "Current plan"} : ${status.plan === "solo" ? "Cloud Solo" : "Cloud Agence"}`));
    card.append(el("p", "", `${fr ? "Statut" : "Status"} : ${status.status} · ${fr ? "Accès" : "Access"} : ${status.cloudAccess}`));
    card.append(el("p", "c-note", `${fr ? "Payé jusqu'au" : "Paid until"} ${when(status.paidUntil, fr)} · ${fr ? "Prochaine échéance" : "Next charge"} : ${status.nextPaymentDate || "—"}`));
    if (status.pendingPlan) card.append(el("p", "c-note", fr ? `Passage à ${status.pendingPlan} prévu au prochain renouvellement.` : `Switch to ${status.pendingPlan} scheduled at renewal.`));
    if (status.cancelRequested) card.append(el("p", "c-note", fr ? "Résiliation demandée : aucun nouveau débit ne doit être programmé." : "Cancellation requested: no new charge should be scheduled."));
    if (admin && !status.cancelRequested && ["active", "past_due", "setup_pending"].includes(status.status)) {
      const cancel = el("button", "btn btn-small", fr ? "Résilier mon abonnement" : "Cancel subscription"); cancel.type = "button";
      cancel.onclick = async () => {
        if (!window.confirm(fr ? `Résilier ? Le mois payé reste accessible jusqu'au ${when(status.paidUntil, fr)}.` : `Cancel? Paid access lasts until ${when(status.paidUntil, fr)}.`)) return;
        cancel.disabled = true;
        try { await request("/cancel", { confirm: "CANCEL_SUBSCRIPTION" }); root.replaceWith(await renderBilling({ me, request, fr })); }
        catch (error) { output.textContent = error.message; cancel.disabled = false; }
      }; card.append(cancel);
    }
    if (admin && status.status === "active" && !status.cancelRequested && !status.pendingPlan) {
      const other = status.plan === "solo" ? "agency" : "solo";
      const change = el("button", "btn btn-small", fr ? `Passer à ${other === "solo" ? "Solo" : "Agence"} au renouvellement` : `Switch to ${other} at renewal`);
      change.type = "button";
      change.onclick = async () => {
        if (!window.confirm(fr ? "Le nouveau montant s'applique au prochain renouvellement, sans prorata immédiat. Confirmer ?" : "The new amount applies at renewal, without immediate proration. Continue?")) return;
        change.disabled = true;
        try { await request("/change-plan", { planKey: other }); root.replaceWith(await renderBilling({ me, request, fr })); }
        catch (error) { output.textContent = error.message; change.disabled = false; }
      }; card.append(change);
    }
    root.append(card);
  } else if (status.latestAttempt) {
    root.append(el("p", "c-note", fr ? `Paiement ${status.latestAttempt.status} : confirmation Mollie attendue avant l'accès payant.` : `Payment ${status.latestAttempt.status}: waiting for Mollie confirmation.`));
  } else root.append(el("p", "c-note", fr ? "Aucun abonnement Cloud actif." : "No active Cloud subscription."));

  const cards = el("div", "c-billing-plans");
  for (const plan of status.plans ?? []) {
    const card = el("div", "c-card"); card.append(el("h4", "", plan.name));
    const price = plan.chargeCents ?? plan.pilotPriceCents;
    const suffix = plan.chargeCents === null ? (fr ? " · prix pilote, TVA à confirmer" : " · pilot price, tax TBD")
      : plan.priceIncludesTax ? (fr ? " TTC" : " incl. tax") : (fr ? " HT" : " excl. tax");
    card.append(el("p", "c-billing-price", `${(price / 100).toLocaleString(fr ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" })}/${fr ? "mois" : "month"}${suffix}`));
    if (status.checkoutEnabled && !status.plan && admin && status.termsVersion) {
      const form = el("form", "c-form"); const consent = el("label", "c-billing-consent");
      const check = el("input"); check.type = "checkbox"; check.required = true;
      consent.append(check, document.createTextNode(fr ? " J'accepte le tarif, les CGV et le renouvellement automatique mensuel. " : " I accept the price, terms and monthly automatic renewal. "));
      const terms = el("a", "", fr ? "Conditions d'abonnement" : "Subscription terms");
      terms.href = fr ? "/fr/conditions-abonnement.html" : "/subscription-terms.html";
      terms.target = "_blank"; terms.rel = "noopener"; consent.append(terms);
      const button = el("button", "btn btn-small", fr ? "Continuer vers Mollie" : "Continue to Mollie"); button.type = "submit";
      form.append(consent, button);
      form.onsubmit = async (event) => {
        event.preventDefault(); if (!check.checked) return;
        button.disabled = true; output.textContent = fr ? "Préparation du paiement…" : "Preparing checkout…";
        try { const result = await request("/checkout", { planKey: plan.key, termsVersion: status.termsVersion, acceptedRecurring: true }); window.location.assign(result.checkoutUrl); }
        catch (error) { output.textContent = error.message; button.disabled = false; }
      }; card.append(form);
    }
    cards.append(card);
  }
  root.append(cards, output);
  if (!status.checkoutEnabled) root.append(el("p", "c-note", fr ? "Souscriptions non ouvertes : validations Mollie, fiscales et contractuelles encore requises." : "Subscriptions are not open pending Mollie, tax and legal approvals."));
  if (!admin) root.append(el("p", "c-note", fr ? "Seul un administrateur de cet espace peut gérer l'abonnement." : "Only a workspace administrator can manage billing."));
  return root;
}
