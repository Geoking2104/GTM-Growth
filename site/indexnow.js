/**
 * IndexNow key generator for the landing page.
 *
 * Runs entirely in the browser: crypto.randomUUID() → 32 hex characters, which
 * matches the protocol grammar ([A-Za-z0-9-], 8–128). Nothing is sent anywhere,
 * so a visitor can mint a key before deciding to trust the tool.
 */

const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/** 32 hex characters — inside the grammar, and unambiguous in a filename. */
export function makeKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Strip scheme, path and trailing slash: the protocol wants a host. */
export function normalizeHost(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  }
}

export function keyFile(key, host) {
  const name = `${key}.txt`;
  return {
    name,
    url: host ? `https://${host}/${name}` : name,
    content: `${key}\n`,
  };
}

export function submitPayload(host, key) {
  return JSON.stringify(
    {
      host: host || "example.com",
      key,
      urlList: [`https://${host || "example.com"}/your-changed-page`],
    },
    null,
    2,
  );
}

export function curlCommand(host, key) {
  return `curl -X POST https://api.indexnow.org/indexnow \\
  -H 'Content-Type: application/json; charset=utf-8' \\
  -d '${submitPayload(host, key)}'`;
}

function download(name, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copy(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => (button.textContent = original), 1600);
}

export function initIndexNow() {
  const hostInput = document.querySelector("#ink-host");
  const generate = document.querySelector("#ink-generate");
  const downloadButton = document.querySelector("#ink-download");
  const output = document.querySelector("#ink-out");
  const keyEl = document.querySelector("#ink-key");
  const fileEl = document.querySelector("#ink-file");
  const urlEl = document.querySelector("#ink-url");
  const contentEl = document.querySelector("#ink-content");
  const curlBlock = document.querySelector("#ink-curl");
  const curlCode = curlBlock?.querySelector("code");

  if (!generate || !output) return;

  let current = null;

  const render = () => {
    if (!current) return;
    const host = normalizeHost(hostInput?.value ?? "");
    const material = keyFile(current, host);
    keyEl.textContent = current;
    fileEl.textContent = material.name;
    urlEl.textContent = material.url;
    contentEl.textContent = current;
    if (curlCode) curlCode.textContent = curlCommand(host, current);
    output.hidden = false;
    if (downloadButton) downloadButton.hidden = false;
    if (curlBlock) curlBlock.hidden = false;
  };

  generate.addEventListener("click", () => {
    current = makeKey();
    if (!KEY_PATTERN.test(current)) {
      generate.textContent = "Generation failed — try again";
      return;
    }
    render();
  });

  hostInput?.addEventListener("change", render);
  hostInput?.addEventListener("input", () => {
    if (current) render();
  });

  downloadButton?.addEventListener("click", () => {
    if (!current) return;
    const material = keyFile(current, normalizeHost(hostInput?.value ?? ""));
    download(material.name, material.content);
  });

  for (const button of document.querySelectorAll("[data-ink-copy]")) {
    button.addEventListener("click", () => {
      if (!current) return;
      const host = normalizeHost(hostInput?.value ?? "");
      const material = keyFile(current, host);
      const target = button.getAttribute("data-ink-copy");
      const text =
        target === "curl" ? curlCommand(host, current) : target === "content" ? material.content.trim() : current;
      void copy(text, button);
    });
  }
}
