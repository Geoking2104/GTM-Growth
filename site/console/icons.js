/* Icônes de la console (mêmes tracés que la démo publique). */
const P = {
  overview: '<path d="M3 17l5-6 4 4 5-7 4 5"/><path d="M3 21h18"/>',
  geo: '<path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="8"/><rect x="12" y="7" width="3" height="12"/><rect x="17" y="13" width="3" height="6"/>',
  citability: '<path d="M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6z"/><path d="M9 12l2 2 4-4"/>',
  indexnow: '<path d="M13 3L5 14h5l-1 7 8-11h-6z"/>',
  sitemap: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
  performance: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 15l4-5"/><path d="M4 19h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  keywords: '<path d="M4 7h16M4 12h10M4 17h6"/><circle cx="18" cy="16" r="3"/>',
  tracking: '<path d="M3 12h4l2-6 3 12 2-6h5"/>',
  audit: '<path d="M9 4h6l1 2h3v14H5V6h3z"/><path d="M9 13l2 2 4-4"/>',
  generators: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  calculators: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>',
  report: '<path d="M6 4h8l4 4v12H6z"/><path d="M14 4v5h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2"/>',
  google: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/><path d="M8 12.5l2-2 1.5 1.5L14 9"/>',
  ga4: '<rect x="4" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/>',
  bing: '<path d="M6 3l4 1.5v11l5-2.8-2.4-1.1-1.4-3.4L18 11v4.5L10 20l-4-2.2z"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
};
export const icon = (name, cls = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${P[name] ?? P.report}</svg>`;
