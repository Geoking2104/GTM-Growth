import { el } from './render.js';
import { LANG } from './i18n.js';
import { API_BASE } from './config.js';
const L = (fr, en) => LANG === 'fr' ? fr : en;

/** Platform operators see only server-authorized client data. */
export async function renderPlatformDashboard(accessToken, openTenant) {
  const token = await accessToken();
  if (!token) throw new Error(L('Session expirée.', 'Session expired.'));
  const res = await fetch(API_BASE.replace(/\/console$/, '/platform/tenants'), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  const tenants = data.tenants || []; const root = el('section', 'c-platform');
  root.append(el('h2', '', L('Administration de la plateforme', 'Platform administration')),
    el('p', 'c-note', L('Clients, accès et connecteurs configurés. Les chiffres décrivent la configuration, pas une vérification de connexion.', 'Clients, access and configured connectors. Counts reflect configuration, not connection checks.')));
  const cards = el('div', 'c-platform-metrics');
  for (const [label, value] of [[L('Clients', 'Clients'), tenants.length], [L('Actifs', 'Active'), tenants.filter(t => t.status === 'active').length], [L('Entreprises', 'Companies'), tenants.filter(t => t.usageType === 'company').length], [L('Agences', 'Agencies'), tenants.filter(t => t.usageType === 'agency').length]]) {
    const card = el('div', 'c-platform-metric'); card.append(el('strong', '', String(value)), el('span', '', label)); cards.append(card);
  }
  root.append(cards);
  const search = el('input'); search.type = 'search'; search.placeholder = L('Rechercher un client ou un domaine', 'Search clients or domains'); search.setAttribute('aria-label', search.placeholder); root.append(search);
  const list = el('div', 'c-platform-list'); root.append(list);
  function draw() {
    list.replaceChildren(); const query = search.value.trim().toLowerCase();
    const filtered = tenants.filter(t => [t.id, t.name, ...(t.domains || [])].some(v => String(v).toLowerCase().includes(query)));
    if (!filtered.length) list.append(el('p', 'c-note', L('Aucun client trouvé.', 'No clients found.')));
    for (const t of filtered) {
      const row = el('article', 'c-platform-row'); const details = el('div');
      details.append(el('strong', '', t.name || t.id), el('p', 'c-note', `${t.id} · ${t.status} · ${t.usageType || L('segment non renseigné', 'segment not set')}`), el('p', 'c-note', `${(t.domains || []).join(', ') || '—'} · GSC ${t.gscProperties?.length || 0} · GA4 ${t.ga4Properties?.length || 0} · GTM ${t.gtmContainers?.length || 0}`));
      const button = el('button', 'btn btn-small', L('Ouvrir cet espace', 'Open workspace')); button.type = 'button'; button.onclick = () => openTenant(t.id);
      row.append(details, button); list.append(row);
    }
  }
  search.oninput = draw; draw(); return root;
}
