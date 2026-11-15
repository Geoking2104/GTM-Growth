/** Lightweight product reel. No network requests, tracking, or third-party player. */
const demo = document.querySelector('[data-product-demo]');
if (demo) {
  const tabs = [...demo.querySelectorAll('[role="tab"]')];
  const panels = [...demo.querySelectorAll('[role="tabpanel"]')];
  const motion = document.getElementById('demo-motion');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0;
  let playing = !preference.matches;
  let hovered = false;
  let focused = false;
  let visible = true;
  let timer;
  function schedule() {
    clearTimeout(timer);
    demo.classList.toggle('vh-playing', playing && visible && !document.hidden && !hovered && !focused);
    motion.textContent = playing ? motion.dataset.pause : motion.dataset.play;
    motion.setAttribute('aria-pressed', String(playing));
    if (playing && visible && !document.hidden && !hovered && !focused) timer = setTimeout(() => select((active + 1) % tabs.length), 6500);
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
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { playing = false; select(index); });
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target === undefined) return;
      event.preventDefault(); playing = false; select(target, true);
    });
  });
  motion.addEventListener('click', () => { playing = !playing; schedule(); });
  demo.addEventListener('mouseenter', () => { hovered = true; schedule(); });
  demo.addEventListener('mouseleave', () => { hovered = false; schedule(); });
  demo.addEventListener('focusin', () => { focused = true; schedule(); });
  demo.addEventListener('focusout', event => { focused = demo.contains(event.relatedTarget); schedule(); });
  document.addEventListener('visibilitychange', schedule);
  preference.addEventListener('change', event => { if (event.matches) playing = false; schedule(); });
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
