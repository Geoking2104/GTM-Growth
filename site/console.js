/**
 * Console behaviour: tab switching only.
 *
 * The panels are static markup with measured sample values — no fetch, nothing to
 * fabricate. This module exists so the console behaves like a product surface
 * (keyboard, ARIA) instead of five stacked tables.
 */

export function initConsole() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  if (!tabs.length || !panels.length) return;

  const crumb = document.querySelector("#app-crumb-current");

  const select = (index) => {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("is-active", active);
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
    });
    // The breadcrumb names the view you are actually looking at.
    if (crumb && tabs[index]) crumb.textContent = tabs[index].textContent.trim();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(index));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
      select(next);
      tabs[next].focus();
    });
  });

  select(0);
}
