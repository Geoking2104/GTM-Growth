import { icon } from './icons.js';
const assets = {
  google: '/assets/ai-engines/google.svg', ga4: '/assets/providers/google-analytics.svg',
  bing: '/assets/ai-engines/bing.svg', copilot: '/assets/ai-engines/copilot.svg',
  chatgpt: '/assets/ai-engines/openai.svg', gemini: '/assets/ai-engines/gemini.svg',
  claude: '/assets/ai-engines/claude.svg', perplexity: '/assets/ai-engines/perplexity.png',
};
const aliases = {
  gsc: 'google', search: 'google', keywords: 'google', gtm: 'google',
  'google search console': 'google', 'search console': 'google', 'google search': 'google',
  'google business profile': 'google', 'google ai overviews': 'google', 'google ai overview': 'google',
  'google analytics': 'ga4', 'google analytics 4': 'ga4', 'google tag manager': 'google',
  openai: 'chatgpt', 'microsoft copilot': 'copilot', 'bing webmaster': 'bing',
};
export function providerAsset(label = '') {
  const key = String(label).trim().toLowerCase();
  const name = Object.hasOwn(aliases, key) ? aliases[key] : key;
  return Object.hasOwn(assets, name) ? assets[name] : null;
}
/** A provider mark identifies a source, never a connection status. Unknown sources keep their label. */
export function providerMark(label, { symbolOnly = false } = {}) {
  const wrap = document.createElement('span'); wrap.className = 'v-provider';
  const badge = document.createElement('span'); badge.className = 'v-provider-logo'; badge.setAttribute('aria-hidden', 'true');
  const fallback = document.createElement('span'); fallback.innerHTML = icon('globe'); badge.append(fallback);
  const src = providerAsset(label);
  if (src) {
    const img = document.createElement('img'); img.src = src; img.alt = ''; img.width = 24; img.height = 24; img.decoding = 'async';
    img.onerror = () => img.remove(); badge.append(img);
  }
  wrap.append(badge);
  if (!symbolOnly) { const name = document.createElement('span'); name.textContent = label; wrap.append(name); }
  else { wrap.setAttribute('aria-label', label); wrap.setAttribute('role', 'img'); }
  return wrap;
}
