/**
 * IndexNow key helpers — used by the authenticated console key generator.
 *
 * Runs entirely in the browser: crypto.randomUUID() → 32 hex characters, inside
 * the protocol grammar ([A-Za-z0-9-], 8–128). Nothing is sent anywhere.
 */

const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/** 32 hex characters — inside the grammar, unambiguous in a filename. */
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

export function initIndexNow() {
  const generate = document.querySelector("#ink-generate");
  const output = document.querySelector("#ink-out");
  const keyEl = document.querySelector("#ink-key");
  const fileEl = document.querySelector("#ink-file");
  const downloadButton = document.querySelector("#ink-download");
  const hostInput = document.querySelector("#ink-host");

  if (!generate || !output) return;

  let current = null;

  const render = () => {
    if (!current) return;
    const host = normalizeHost(hostInput?.value ?? "");
    const material = keyFile(current, host);
    keyEl.textContent = current;
    fileEl.textContent = host ? `→ ${material.url}` : `→ ${material.name} at your site root`;
    output.hidden = false;
    if (downloadButton) downloadButton.hidden = false;
  };

  generate.addEventListener("click", () => {
    const candidate = makeKey();
    if (!KEY_PATTERN.test(candidate)) {
      generate.textContent = "Try again";
      return;
    }
    current = candidate;
    render();
  });

  hostInput?.addEventListener("input", () => {
    if (current) render();
  });

  downloadButton?.addEventListener("click", () => {
    if (!current) return;
    const host = normalizeHost(hostInput?.value ?? "");
    const material = keyFile(current, host);
    download(material.name, material.content);
  });
}
