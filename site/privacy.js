/* Optional audience measurement is loaded only after an explicit choice. */
(() => {
  const key = "gtm-growth-privacy-v1";
  const fr = document.documentElement.lang.toLowerCase().startsWith("fr");
  const text = (a, b) => fr ? a : b;
  let choice = null;
  try { const stored = JSON.parse(localStorage.getItem(key) || "null"); if (stored && Date.now() - stored.at < 180 * 86400000 && ["accepted", "rejected"].includes(stored.choice)) choice = stored.choice; } catch { /* No storage means no remembered consent. */ }
  let loaded = false;
  function loadClarity() {
    if (loaded) return; loaded = true;
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    const script = document.createElement("script"); script.async = true; script.src = "https://www.clarity.ms/tag/z8ln1th2sn"; document.head.append(script);
  }
  function clearCookies() {
    const hosts = location.hostname.split(".");
    for (const name of ["_clck", "_clsk"]) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      for (let i = 0; i < hosts.length - 1; i++) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${hosts.slice(i).join(".")}; SameSite=Lax`;
    }
  }
  function openSettings() {
    document.querySelector(".privacy-banner")?.remove();
    const box = document.createElement("section"); box.className = "privacy-banner"; box.setAttribute("role", "region"); box.setAttribute("aria-label", text("Préférences de confidentialité", "Privacy preferences"));
    const title = document.createElement("strong"); title.textContent = text("Vos préférences de confidentialité", "Your privacy preferences");
    const note = document.createElement("p"); note.textContent = text("Avec votre accord, Microsoft Clarity mesure l’utilisation du site. Vous pouvez refuser et modifier ce choix à tout moment.", "With your permission, Microsoft Clarity measures how the site is used. You can refuse and change your choice at any time.");
    const link = document.createElement("a"); link.href = fr ? "/fr/confidentialite.html" : "/privacy.html"; link.textContent = text("En savoir plus", "Learn more");
    const actions = document.createElement("div"); actions.className = "privacy-actions";
    const save = (value) => {
      const wasLoaded = loaded; choice = value;
      try { localStorage.setItem(key, JSON.stringify({ choice: value, at: Date.now() })); } catch { /* Choice remains valid for this page only. */ }
      box.remove(); if (value === "accepted") loadClarity(); else { clearCookies(); if (wasLoaded) location.reload(); }
    };
    for (const [label, value] of [[text("Refuser", "Reject"), "rejected"], [text("Accepter", "Accept"), "accepted"]]) { const btn = document.createElement("button"); btn.type = "button"; btn.className = value === "accepted" ? "btn btn-small" : "btn btn-small btn-ghost"; btn.textContent = label; btn.onclick = () => save(value); actions.append(btn); }
    box.append(title, note, link, actions); document.body.append(box); actions.querySelector("button").focus();
  }
  document.querySelectorAll(".privacy-settings").forEach((button) => button.addEventListener("click", openSettings));
  document.querySelectorAll(".nav-menu").forEach((menu) => { menu.addEventListener("toggle", () => { if (menu.open) document.querySelectorAll(".nav-menu").forEach((other) => { if (other !== menu) other.open = false; }); }); menu.addEventListener("keydown", (event) => { if (event.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } }); menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { menu.open = false; })); });
  if (choice === "accepted") loadClarity(); else if (!choice) openSettings();
})();
