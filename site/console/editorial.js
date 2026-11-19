import { el } from './render.js';
import { LANG } from './i18n.js';

const L = (fr, en) => LANG === 'fr' ? fr : en;
const note = message => el('p', 'c-note', message);
const field = (label, input) => { const wrapper = el('label', 'decision-field', label); wrapper.append(input); return wrapper; };
const status = () => { const result = note(''); result.setAttribute('role', 'status'); return result; };
const button = (label, action, feedback) => {
  const result = el('button', 'btn btn-small', label);
  result.type = 'button';
  result.onclick = async () => {
    result.disabled = true;
    try { await action(); }
    catch (error) { feedback.textContent = describeError(error.message); }
    finally { result.disabled = false; }
  };
  return result;
};
const date = value => new Intl.DateTimeFormat(L('fr-FR', 'en-GB'), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
const rate = value => new Intl.NumberFormat(L('fr-FR', 'en-GB'), { maximumFractionDigits: 1 }).format(value);

function describeError(code) {
  return ({
    DECISION_CHANGED: L('Le brief ou sa validation a changé. Rouvrez le brief pour reprendre la dernière version.', 'The brief or its review changed. Reopen the brief to load the latest version.'),
    DECISION_EVIDENCE_EXPIRED: L('Cette preuve épinglée est indisponible dans cet espace.', 'This pinned evidence is unavailable in this workspace.'),
    DECISION_PAGE_SCOPE: L('La page doit appartenir à cet espace et correspondre au site WordPress configuré.', 'The page must belong to this workspace and match its configured WordPress site.'),
    WORDPRESS_NOT_CONFIGURED: L('Configurez la connexion WordPress de cet espace.', 'Configure WordPress for this workspace.'),
    WORDPRESS_PUBLICATION_UNVERIFIED: L('WordPress doit renvoyer une page publique à cette URL avec le titre et le contenu exacts de la version approuvée.', 'WordPress must return a public page at this URL with the exact approved title and body.'),
    WORDPRESS_VERIFICATION_UNAVAILABLE: L('La réponse de WordPress est indisponible. Réessayez.', 'WordPress could not be reached. Try again.'),
    report_scope_unavailable: L('Vérifiez l’identifiant du rapport, son destinataire, sa disponibilité et l’URL exacte.', 'Check the report ID, recipient, availability, and exact URL.'),
    private_report_unavailable: L('Les rapports privés sont indisponibles sur cette instance.', 'Private reports are unavailable on this instance.'),
    report_evidence_limit: L('Ce rapport a atteint sa limite de preuves partagées.', 'This report has reached its shared evidence limit.'),
  })[code] ?? code;
}

export function evidenceCitation(url) {
  const link = el('a', 'decision-link', url);
  if (/^https?:\/\//i.test(url)) link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

export function editorialEvidenceSharing({ api, pin }) {
  const details = el('details', 'decision-details'), feedback = status(), report = el('input');
  report.required = true;
  report.pattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  details.append(el('summary', '', pin ? L('Partager dans un rapport privé', 'Share in a private report') : L('Retirer les preuves d’un rapport privé', 'Revoke evidence from a private report')),
    field(L('Identifiant du rapport (paramètre id du lien)', 'Report ID (id parameter in its link)'), report));
  if (!pin) {
    details.append(button(L('Révoquer les preuves de cet espace', 'Revoke this workspace’s evidence'), async () => {
      if (!report.reportValidity()) return;
      await api('/decision/editorial/revoke-evidence', { reportId: report.value.trim().toLowerCase() });
      feedback.textContent = L('Accès aux preuves retiré pour ce rapport.', 'Evidence access revoked for this report.');
    }, feedback), feedback);
    return details;
  }
  const email = el('input'), excerpt = el('input'), preview = el('details');
  email.type = 'email'; email.required = true; email.autocomplete = 'off'; excerpt.type = 'checkbox';
  preview.append(el('summary', '', L('Aperçu de l’extrait partageable', 'Preview the shareable excerpt')), el('p', '', pin.evidence.ai.answer.slice(0, 2000)));
  details.append(field(L('E-mail du destinataire', 'Recipient email'), email), field(L('Autoriser cet extrait de réponse', 'Allow this answer excerpt'), excerpt), preview);
  const citationChoices = pin.evidence.ai.citations.map(url => {
    const input = el('input'); input.type = 'checkbox';
    details.append(field(url, input));
    return input;
  });
  details.append(button(L('Autoriser la sélection', 'Allow selected evidence'), async () => {
    if (!report.reportValidity() || !email.reportValidity()) return;
    const citations = citationChoices.flatMap((choice, index) => choice.checked ? [index] : []);
    if ((!excerpt.checked && !citations.length) || citations.length > 10) {
      feedback.textContent = L('Choisissez l’extrait ou des citations (10 maximum).', 'Choose the excerpt or citations (up to 10).'); return;
    }
    await api('/decision/editorial/share-evidence', { pinId: pin.id, reportId: report.value.trim().toLowerCase(), email: email.value.trim(), includeExcerpt: excerpt.checked, citations });
    feedback.textContent = L('Sélection autorisée pour ce rapport privé.', 'Selected evidence allowed for this private report.');
  }, feedback), feedback);
  return details;
}

function renderEditorialFollowUps({ api, review, admin, reload }) {
  const row = el('article', 'decision-observation'), feedback = status(), measurement = el('div');
  const statuses = { proposed: L('En validation', 'In review'), approved: L('Approuvé', 'Approved'), rejected: L('Refusé', 'Rejected'), executing: L('Transfert en cours', 'Sending'), completed: L('Brouillon WordPress créé', 'WordPress draft created'), uncertain: L('Transfert à vérifier', 'Check dispatch') };
  row.append(el('strong', '', `v${review.revision} · ${statuses[review.status] ?? review.status}`));
  if (review.intervention) {
    row.append(note(`${L('Version vérifiée dans WordPress', 'Version verified in WordPress')} · ${date(review.intervention.effectiveAt)} UTC`));
    row.append(button(L('Calculer J+14 / J+28', 'Calculate day 14 / day 28'), async () => {
      const data = await api('/decision/editorial/follow-ups', { reviewId: review.id });
      const reasons = {
        window_open: L('Fenêtre UTC en cours ou à venir.', 'The UTC window is open or upcoming.'),
        panel_unavailable: L('Panel de référence indisponible.', 'The reference panel is unavailable.'),
        no_matching_cohort: L('Aucune cohorte de même contexte sur les deux fenêtres.', 'No cohort with the same context exists in both windows.'),
        insufficient: L('Trop peu de réponses dans la cohorte comparable.', 'Too few answers in the matching cohort.'),
      };
      measurement.replaceChildren(note(`${data.brand} · ${data.source}`));
      for (const item of data.followUps) {
        const { comparison } = item;
        const line = `${item.label} · ${date(item.dueAt)} UTC`;
        const visibility = comparison?.visibility;
        measurement.append(el('strong', '', line), note(item.state === 'comparable'
          ? `${L('Visibilité observée', 'Observed visibility')} ${rate(visibility.previous)} % → ${rate(visibility.current)} % (${rate(visibility.delta)} ${L('points', 'points')})`
          : reasons[item.state] ?? reasons.window_open));
        if (comparison) measurement.append(note(`${L('Réponses comparables', 'Matched answers')} ${visibility.included.join(' / ')} · ${L('minimum par fenêtre', 'minimum per window')} ${comparison.minimumPerWindow}`));
        if (item.state === 'comparable' && comparison.windows.some(window => window.withoutContext)) {
          measurement.append(note(L('Confiance limitée. Le rapprochement repose sur la source déclarée.', 'Limited confidence. Matching relies on the declared source.')));
        }
      }
      if (data.followUps.some(item => item.state === 'comparable')) measurement.append(note(L('Variation observée dans la cohorte. Attribution non établie.', 'Observed change within the cohort. Attribution is unestablished.')));
    }, feedback), measurement);
  } else if (review.status === 'completed' && admin) {
    const postId = el('input'), postType = el('select');
    postId.type = 'number'; postId.min = '1'; postId.step = '1';
    for (const [value, label] of [['posts', L('Article', 'Post')], ['pages', 'Page']]) { const option = el('option', '', label); option.value = value; postType.append(option); }
    const target = el('details');
    target.append(el('summary', '', L('Version appliquée à un contenu WordPress existant', 'Version applied to existing WordPress content')),
      field(L('Identifiant du contenu publié', 'Published content ID'), postId), field(L('Type de contenu', 'Content type'), postType));
    row.append(target, button(L('Vérifier la publication dans WordPress', 'Verify publication in WordPress'), async () => {
      if (!postId.reportValidity()) return;
      await api('/decision/editorial/verify', { reviewId: review.id, ...(postId.value ? { publishedPostId: Number(postId.value), postType: postType.value } : {}) });
      await reload();
    }, feedback));
  }
  row.append(feedback);
  return row;
}

export function renderVisibilityEditorial({ api, pinId, admin, onExit }) {
  const root = el('section', 'app-strip ops-articles'), content = el('div'), feedback = status();
  root.append(el('h3', '', L('Brief éditorial lié à une réponse IA', 'Editorial brief linked to an AI answer')), content, feedback,
    button(L('Retour à Intention', 'Back to Intent'), onExit, feedback));
  let revision = 0;
  async function load() {
    const data = await api('/decision/editorial/brief', { pinId });
    const { pin, brief, reviews } = data;
    revision = brief?.revision ?? 0;
    const target = evidenceCitation(pin.targetUrl);
    content.replaceChildren(note(`${pin.evidence.query} · ${pin.evidence.ai.source}`), target);
    const inputs = {};
    for (const [key, label, limit, multiline] of [
      ['title', L('Titre', 'Title'), 200], ['slug', L('Identifiant d’URL', 'URL slug'), 200],
      ['metaDescription', L('Méta-description', 'Meta description'), 500], ['body', L('Contenu', 'Body'), 100000, true],
    ]) {
      const input = el(multiline ? 'textarea' : 'input'); input.maxLength = limit; input.disabled = !admin;
      if (multiline) { input.rows = 14; input.style.width = '100%'; }
      input.value = brief?.draft[key] ?? ({ title: pin.evidence.query.slice(0, 200), slug: new URL(pin.targetUrl).pathname.split('/').filter(Boolean).at(-1)?.slice(0, 200) ?? '' })[key] ?? '';
      input.required = key !== 'metaDescription';
      inputs[key] = input;
      content.append(field(label, input));
    }
    const outline = el('textarea'); outline.rows = 5; outline.disabled = !admin;
    outline.value = (brief?.draft.outline ?? []).flatMap(section => [section.h2, ...section.bullets.map(bullet => `- ${bullet}`)]).join('\n');
    const gates = el('ul', 'tracked-list'), metadata = note('');
    function drawGates(items) {
      metadata.textContent = revision ? `${L('Version enregistrée', 'Saved version')} v${revision}` : L('Brief à enregistrer', 'Unsaved brief');
      gates.replaceChildren(...items.map(gate => el('li', '', `${gate.passed ? '✓' : '✗'} ${gate.check} · ${gate.detail}`)));
    }
    content.append(field(L('Plan · un titre par ligne, puces précédées de « - »', 'Outline · one heading per line, bullets start with “-”'), outline), metadata, gates);
    drawGates(data.gates);
    async function save() {
      if (!Object.values(inputs).every(input => input.reportValidity())) return null;
      const sections = [];
      for (const line of outline.value.split('\n').map(value => value.trim()).filter(Boolean)) {
        if (line.startsWith('- ') && sections.length) sections.at(-1).bullets.push(line.slice(2));
        else sections.push({ h2: line, bullets: [] });
      }
      const draft = { ...Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])), outline: sections,
        entities: brief?.draft.entities ?? [pin.evidence.ai.brand] };
      const saved = await api('/decision/editorial/save', { pinId, revision, draft });
      revision = saved.brief.revision;
      drawGates(saved.gates);
      return revision;
    }
    if (admin) content.append(button(L('Enregistrer le brief', 'Save brief'), async () => {
      if (await save()) feedback.textContent = L('Brief enregistré.', 'Brief saved.');
    }, feedback), button(L('Soumettre à validation', 'Submit for review'), async () => {
      const saved = await save();
      if (!saved) return;
      await api('/decision/propose', { kind: 'wordpress', payload: null, editorial: { pinId, revision: saved } });
      await load();
      feedback.textContent = L('Version disponible dans la boîte de validation.', 'Version available in the review inbox.');
    }, feedback));
    const inbox = el('a', 'decision-link', L('Ouvrir la boîte de validation', 'Open the review inbox')); inbox.href = '#ops'; content.append(inbox);
    for (const review of reviews.slice().reverse()) content.append(renderEditorialFollowUps({ api, review, admin, reload: load }));
  }
  void load().catch(error => { feedback.textContent = describeError(error.message); });
  return root;
}
