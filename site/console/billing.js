/* The self-hosted Apache-2.0 engine remains free; only operated Cloud is billed. */
import { el } from "./render.js";

const when = (v, fr) => v ? new Date(v).toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

export async function renderBilling({ me, request, fr = true }) {
  const root = el("section", "c-billing");
  root.append(el("h3", "", fr ? "Abonnement Cloud" : "Cloud subscription"));
  root.append(el("p", "c-note", fr ? "Le moteur open source reste gratuit. Seul le service Cloud est facturé ; clés IA tierces BYOK." : "The open-source engine stays free. Only Cloud hosting is billed; third-party AI keys are BYOK."));
  const output = el("p", "c-note"); output.setAttribute("role", "status");
  let status;
  try { status = await request("/status"); }
  catch (error) {
    if (error.status !== 503) { root.append(el("p", "c-error", fr ? "Statut indisponible. Reconnectez-vous puis réessayez." : "Status unavailable. Sign in again and retry.")); return root; }
    try { status = await request("/plans"); status.checkoutEnabled = false; }
    catch { root.append(el("p", "c-error", fr ? "Facturation indisponible." : "Billing unavailable.")); return root; }
  }
  const admin = me?.platformAdmin || me?.role === "tenant-admin";
  const labels = fr ? { active: "Actif", canceled: "Résilié", setup_pending: "Configuration en cours", past_due: "Renouvellement en retard", review_required: "Vérification requise", paid: "Payé", grace: "Délai de grâce", read_only: "Lecture seule", free: "Sans abonnement", open: "En attente", pending: "En cours", failed: "Échec", expired: "Expiré" } : { active: "Active", canceled: "Cancelled", setup_pending: "Setup pending", past_due: "Past due", review_required: "Review required", paid: "Paid", grace: "Grace period", read_only: "Read only", free: "No subscription", open: "Open", pending: "Pending", failed: "Failed", expired: "Expired" };
  const label = value => labels[value] || value;
  const name = key => key === "solo" ? "Cloud Solo" : fr ? "Cloud Agence" : "Cloud Agency";
  const money = cents => (cents / 100).toLocaleString(fr ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" });
  const amount = plan => plan.testChargeCents ?? plan.chargeCents ?? plan.pilotPriceCents;
  const consentBody = plan => ({ planKey: plan.key, amountCents: amount(plan), termsVersion: status.termsVersion, limitsVersion: status.limitsVersion, acceptedRecurring: true });
  if (status.mode === 'disabled' || status.checkoutEnabled === false) root.append(el('span', 'decision-badge', fr ? 'Indisponible · Souscription désactivée' : 'Unavailable · Subscription disabled'));
  else if (status.mode === 'test') root.append(el('span', 'decision-badge', fr ? 'Pilote · Paiement de test' : 'Pilot · Test payment'));
  if (status.mode === "test") root.append(el("p", "c-billing-banner", fr ? "MODE TEST — aucun paiement réel. Les accès de test sont séparés des abonnements réels." : "TEST MODE — no real payment. Test access is separate from live subscriptions."));
  const refresh = el("button", "btn btn-small", fr ? "Actualiser le statut" : "Refresh status"); refresh.type = "button";
  refresh.onclick = async () => { refresh.disabled = true; root.replaceWith(await renderBilling({ me, request, fr })); }; root.append(refresh);
  if (status.limits) {
    const used = (status.usage || []).find(u => u.period === status.usagePeriod && u.metric === "operations")?.quantity || 0;
    root.append(el("p", "c-note", fr ? `${used} / ${status.limits.monthlyOperations} opérations · ${status.usagePeriod} (UTC). Maximum ${status.limits.maxDomains} domaines.` : `${used} / ${status.limits.monthlyOperations} operations · ${status.usagePeriod} (UTC). Maximum ${status.limits.maxDomains} domains.`));
  }
  root.append(el("p", "c-note", fr ? "Les analyses automatiques et les appels aux agents comptent dans le quota mensuel. Une opération acceptée compte même en cas d’échec du fournisseur. Aucun dépassement facturé." : "Automatic analyses and agent requests count toward the monthly quota. Accepted operations count even if a provider fails. No overage charges."));
  if (me?.platformAdmin && status.mode !== "disabled") {
    const verify = el("button", "btn btn-small", fr ? "Vérifier la connexion Mollie" : "Check Mollie connection"); verify.type = "button";
    verify.onclick = async () => { verify.disabled = true; try { const result = await request("/connection"); output.textContent = result.providerReady ? (fr ? "Profil et moyens récurrents accessibles. Recette des webhooks et paiements encore requise." : "Profile and recurring methods reachable. Webhook and payment lifecycle testing is still required.") : (fr ? "Connexion incomplète : vérifiez le profil et les moyens récurrents." : "Connection incomplete: check the profile and recurring methods."); } catch (error) { output.textContent = error.message; } finally { verify.disabled = false; } }; root.append(verify);
  }
  if (status.plan) {
    const card = el("div", "c-card");
    card.append(el("h4", "", `${fr ? "Offre actuelle" : "Current plan"} : ${name(status.plan)}`));
    card.append(el("p", "", `${fr ? "Statut" : "Status"} : ${label(status.status)} · ${fr ? "Accès" : "Access"} : ${label(status.cloudAccess)}`));
    card.append(el("p", "c-note", `${fr ? "Payé jusqu'au" : "Paid until"} ${when(status.paidUntil, fr)} · ${fr ? "Prochaine échéance" : "Next charge"} : ${status.nextPaymentDate || "—"}`));
    if (status.pendingPlan) card.append(el("p", "c-note", fr ? `Passage à ${status.pendingPlan} prévu au prochain renouvellement.` : `Switch to ${status.pendingPlan} scheduled at renewal.`));
    if (status.status === "review_required" || (status.cancelRequested && status.cloudAccess === "read_only")) card.append(el("p", "c-note", fr ? "Contactez le support pour vérifier les paiements ou réactiver un abonnement expiré." : "Contact support to review payments or restart an expired subscription."));
    if (status.cancelRequested) card.append(el("p", "c-note", fr ? "Résiliation demandée : aucun nouveau débit ne doit être programmé." : "Cancellation requested: no new charge should be scheduled."));
    if (admin && !status.cancelRequested && ["active", "past_due", "setup_pending", "review_required"].includes(status.status)) {
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
      const nextPlan = status.plans.find(p => p.key === other);
      const change = el("button", "btn btn-small", fr ? `Passer à ${other === "solo" ? "Solo" : "Agence"} au renouvellement` : `Switch to ${other} at renewal`);
      change.type = "button";
      change.onclick = async () => {
        if (!window.confirm(fr ? `Accepter ${money(amount(nextPlan))}/mois, les conditions ${status.termsVersion} et limites ${status.limitsVersion} au prochain renouvellement ?` : `Accept ${money(amount(nextPlan))}/month, terms ${status.termsVersion} and limits ${status.limitsVersion} at the next renewal?`)) return;
        change.disabled = true;
        try { await request("/change-plan", consentBody(nextPlan)); root.replaceWith(await renderBilling({ me, request, fr })); }
        catch (error) { output.textContent = error.message; change.disabled = false; }
      }; card.append(change);
    }
    root.append(card);
  } else if (status.latestAttempt) {
    root.append(el("p", "c-note", fr ? `Paiement ${label(status.latestAttempt.status)} : confirmation Mollie attendue avant l'accès payant.` : `Payment ${label(status.latestAttempt.status)}: waiting for Mollie confirmation.`));
  } else root.append(el("p", "c-note", fr ? "Aucun abonnement Cloud actif." : "No active Cloud subscription."));

  const cards = el("div", "c-billing-plans");
  for (const plan of status.plans ?? []) {
    const card = el("div", "c-card"); card.append(el("h4", "", name(plan.key)));
    const price = amount(plan);
    const suffix = plan.chargeCents === null ? (fr ? " · prix pilote, TVA à confirmer" : " · pilot price, tax TBD")
      : plan.priceIncludesTax ? (fr ? " TTC" : " incl. tax") : (fr ? " HT" : " excl. tax");
    card.append(el("p", "c-billing-price", `${(price / 100).toLocaleString(fr ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" })}/${fr ? "mois" : "month"}${suffix}`));
    if (plan.limits) card.append(el("p", "c-note", fr ? `${plan.limits.monthlyOperations} opérations / mois UTC · ${plan.limits.maxDomains} domaines maximum` : `${plan.limits.monthlyOperations} operations / UTC month · ${plan.limits.maxDomains} domains maximum`));
    if (status.checkoutEnabled && status.enrolled && !status.plan && admin && status.termsVersion) {
      const form = el("form", "c-form"); const consent = el("label", "c-billing-consent");
      const check = el("input"); check.type = "checkbox"; check.required = true;
      const copy = el("span"); copy.append(document.createTextNode(fr ? " J'accepte le tarif, les CGV et le renouvellement automatique mensuel. " : " I accept the price, terms and monthly automatic renewal. "));
      const terms = el("a", "", fr ? "Conditions d'abonnement" : "Subscription terms");
      const termsUrl = status.termsUrls?.[fr ? "fr" : "en"];
      terms.href = termsUrl || "#";
      terms.target = "_blank"; terms.rel = "noopener"; if (termsUrl) copy.append(terms); consent.append(check, copy);
      const button = el("button", "btn btn-small", fr ? "Continuer vers Mollie" : "Continue to Mollie"); button.type = "submit";
      form.append(consent, button);
      form.onsubmit = async (event) => {
        event.preventDefault(); if (!check.checked) return;
        button.disabled = true; output.textContent = fr ? "Préparation du paiement…" : "Preparing checkout…";
        try { const result = await request("/checkout", consentBody(plan)); window.location.assign(result.checkoutUrl); }
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
