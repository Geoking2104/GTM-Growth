/* Optional analytics for the public GTM Growth website. Never load a vendor before a choice. */
(() => {
  const key = "gtm-growth-privacy-v2";
  const legacyKey = "gtm-growth-privacy-v1";
  const lifetime = 180 * 86400000;
  const host = "gtm.kayroslab.com";
  const measurement = "G-75DZ33J5QP";
  const publicPath = /^\/(?:fr\/)?(?:(?:index\.html)?|guides\/(?:marketing|technical)\/(?:index\.html)?)$|^\/(?:privacy|fr\/confidentialite)\.html$/;
  const fr = document.documentElement.lang.toLowerCase().startsWith("fr");
  const text = (french, english) => fr ? french : english;
  const off = { google: false, clarity: false };
  let active = { ...off };
  let expiryTimer;
  let opener;

  function recent(record) {
    return record && Number.isFinite(record.at) && record.at <= Date.now() && Date.now() - record.at < lifetime;
  }

  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (recent(saved) && typeof saved.google === "boolean" && typeof saved.clarity === "boolean") return saved;
      const old = JSON.parse(localStorage.getItem(legacyKey));
      if (recent(old) && old.choice === "rejected") return { ...off, at: old.at };
    } catch { /* A blocked or malformed store grants no permission. */ }
    return null;
  }

  function clearCookies(provider) {
    if (location.hostname !== host) return;
    for (const item of document.cookie.split(";")) {
      const name = item.trim().split("=")[0];
      if (!(provider === "google" ? /^_ga(?:$|_75DZ33J5QP$)/ : /^_cl(?:ck|sk)$/).test(name)) continue;
      // GA cookies are explicitly host-scoped. Legacy Clarity can use the parent domain.
      const domains = provider === "google" ? ["", host] : ["", host, "kayroslab.com"];
      for (const domain of domains) {
        document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax" + (domain ? "; Domain=" + domain : "");
      }
    }
  }

  function publicVisit() {
    if (location.protocol !== "https:" || location.hostname !== host || !publicPath.test(location.pathname) || location.search) return false;
    if (location.hash && !document.getElementById(location.hash.slice(1))) return false;
    if (!document.referrer) return true;
    const from = new URL(document.referrer);
    return !from.search && !from.hash && (from.origin !== location.origin ? from.pathname === "/" : publicPath.test(from.pathname));
  }

  function script(src) {
    const el = document.createElement("script");
    el.async = true;
    el.referrerPolicy = "no-referrer";
    el.src = src;
    document.head.append(el);
  }

  function startGoogle() {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    gtag("set", {
      page_location: location.origin + location.pathname,
      page_referrer: document.referrer ? new URL(document.referrer).origin + "/" : "",
      cookie_domain: host, cookie_expires: lifetime / 1000, cookie_update: false,
      allow_google_signals: false, allow_ad_personalization_signals: false
    });
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    script("https://www.googletagmanager.com/gtm.js?id=GTM-MTLJ6WSM");
  }

  function startClarity() {
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    window.clarity("consentv2", { analytics_Storage: "granted", ad_Storage: "denied" });
    script("https://www.clarity.ms/tag/z8ln1th2sn");
  }

  function apply(choice) {
    const wanted = choice || off;
    clearTimeout(expiryTimer);
    if (!wanted.google) { window["ga-disable-" + measurement] = true; clearCookies("google"); }
    if (!wanted.clarity) clearCookies("clarity");
    if ((active.google && !wanted.google) || (active.clarity && !wanted.clarity)) {
      if (active.clarity && !wanted.clarity) window.clarity("consentv2", { analytics_Storage: "denied", ad_Storage: "denied" });
      location.reload();
      return;
    }
    if (choice) {
      const remaining = choice.at + lifetime - Date.now();
      // Browser timers accept at most a signed 32-bit delay.
      expiryTimer = setTimeout(() => { if (recent(choice)) apply(choice); else { apply(null); openSettings(); } }, Math.min(remaining, 2147483647));
    }
    if (!publicVisit()) return;
    if (wanted.google && !active.google) { active.google = true; window["ga-disable-" + measurement] = false; startGoogle(); }
    if (wanted.clarity && !active.clarity) { active.clarity = true; startClarity(); }
  }

  let choice = readChoice();
  function openSettings(event) {
    document.querySelector(".privacy-banner")?.remove();
    opener = event?.currentTarget;
    const box = document.createElement("section");
    box.className = "privacy-banner";
    box.setAttribute("role", "region");
    box.setAttribute("aria-labelledby", "privacy-title");
    const title = document.createElement("strong");
    title.id = "privacy-title";
    title.textContent = text("Vos préférences de confidentialité", "Your privacy preferences");
    const note = document.createElement("p");
    note.textContent = text("GA4 compte les visites via Google Tag Manager. Microsoft Clarity analyse les clics et les défilements et peut enregistrer les sessions. Ces deux outils sont facultatifs.", "GA4 counts visits through Google Tag Manager. Microsoft Clarity analyses clicks and scrolling and can record sessions. Both tools are optional.");
    const link = document.createElement("a");
    link.href = fr ? "/fr/confidentialite.html#cookies" : "/privacy.html#cookies";
    link.textContent = text("Détails sur les cookies", "Cookie details");
    const choices = document.createElement("div");
    const controls = {};
    for (const [name, label] of [["google", "Google Analytics 4"], ["clarity", "Microsoft Clarity"]]) {
      const item = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(choice?.[name]);
      controls[name] = input;
      item.append(input, " " + label);
      choices.append(item);
    }
    const actions = document.createElement("div");
    actions.className = "privacy-actions";
    function save(google, clarity) {
      choice = { google, clarity, at: Date.now() };
      try { localStorage.setItem(key, JSON.stringify(choice)); localStorage.removeItem(legacyKey); } catch { /* Apply for this page only. */ }
      box.remove();
      opener?.focus();
      apply(choice);
    }
    for (const [label, act] of [
      [text("Refuser", "Reject"), () => save(false, false)],
      [text("Accepter", "Accept"), () => save(true, true)],
      [text("Enregistrer ma sélection", "Save selection"), () => save(controls.google.checked, controls.clarity.checked)]
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-small";
      button.textContent = label;
      button.onclick = act;
      actions.append(button);
    }
    box.append(title, note, link, choices, actions);
    document.body.append(box);
    if (opener) actions.querySelector("button").focus();
  }
  document.querySelectorAll(".privacy-settings").forEach(button => button.addEventListener("click", openSettings));
  window.addEventListener("storage", event => {
    if (event.key !== key && event.key !== null) return;
    choice = readChoice();
    document.querySelector(".privacy-banner")?.remove();
    apply(choice);
    if (!choice) openSettings();
  });
  document.querySelectorAll(".nav-menu").forEach((menu) => { menu.addEventListener("toggle", () => { if (menu.open) document.querySelectorAll(".nav-menu").forEach((other) => { if (other !== menu) other.open = false; }); }); menu.addEventListener("keydown", (event) => { if (event.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } }); menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { menu.open = false; })); });
  apply(choice);
  if (!choice) openSettings();
})();
