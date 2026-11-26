/** Lightweight product reel. No network requests, tracking, or third-party player. */
const demo = document.querySelector('[data-product-demo]');
if (demo) {
  const tabs = [...demo.querySelectorAll('[role="tab"]')];
  const panels = [...demo.querySelectorAll('[role="tabpanel"]')];
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0;
  let manuallyPaused = false;
  let focused = false;
  let visible = true;
  let timer;
  function schedule() {
    clearTimeout(timer);
    const rotating = !manuallyPaused && !preference.matches && visible && !document.hidden && !focused;
    demo.classList.toggle('vh-playing', rotating);
    if (rotating) timer = setTimeout(() => select((active + 1) % tabs.length), 6500);
  }
  function select(index, focus = false) {
    active = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === active));
      tab.tabIndex = i === active ? 0 : -1;
      panels[i].hidden = i !== active;
    });
    if (focus) tabs[index].focus();
    schedule();
  }
  demo.addEventListener('click', event => {
    manuallyPaused = true;
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tabs.indexOf(tab));
    else schedule();
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      manuallyPaused = true;
      select(target, true);
    });
  });
  demo.addEventListener('focusin', () => { focused = true; schedule(); });
  demo.addEventListener('focusout', event => { focused = demo.contains(event.relatedTarget); schedule(); });
  document.addEventListener('visibilitychange', schedule);
  preference.addEventListener('change', schedule);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }, { threshold: .15 }).observe(demo);
  schedule();
}
// Open native disclosures for linked features, including old bookmarks and guides.
function revealTarget(hash) {
  let id;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
  const target = id && document.getElementById(id);
  if (!target) return;
  let revealed = false;
  for (let node = target.parentElement; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS' && !node.open) { node.open = true; revealed = true; }
  }
  if (revealed) target.scrollIntoView({ behavior: 'instant' });
}
window.addEventListener('hashchange', () => revealTarget(location.hash));
document.addEventListener('click', event => {
  const anchor = event.target.closest?.('a[href^="#"]');
  if (anchor) revealTarget(anchor.getAttribute('href'));
});
revealTarget(location.hash);
