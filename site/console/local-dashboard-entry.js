import { featureHandoff, workspaceHandoff } from './workspace-context.js';

/** The public planner needs a visible sign-in step, even at the same URL/hash. */
export function openLocalDashboard(language = 'en') {
  const hash = '#local_seo/network';
  featureHandoff({ hash, search: location.search }, sessionStorage);
  history.replaceState(null, '', hash);
  workspaceHandoff(location, sessionStorage);
  const form = document.getElementById('c-login-form');
  if (!form) return;
  let notice = document.getElementById('c-local-dashboard-login');
  if (!notice) { notice = document.createElement('p'); notice.id = 'c-local-dashboard-login'; notice.className = 'public-login-destination'; notice.setAttribute('role', 'status'); form.before(notice); }
  notice.textContent = language === 'fr' ? 'Connectez-vous pour ouvrir votre dashboard Google Business Profile. Vous retrouverez cette destination après la connexion.' : 'Sign in to open your Google Business Profile dashboard. You will return to this destination after signing in.';
  form.scrollIntoView({ block: 'center', behavior: 'instant' });
  document.getElementById('c-login-email')?.focus({ preventScroll: true });
}
