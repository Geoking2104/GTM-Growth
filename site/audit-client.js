/** Resumable public reads. The random capability stays in session storage, never in URLs. */
const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export const auditStatusText = (status, lang = "en") => ({
  pending: ["Analyse enregistrée, en attente…", "Analysis saved, waiting…"],
  queued: ["Analyse en attente de traitement…", "Analysis queued…"],
  running: ["Analyse de la page en cours…", "Analysing the page…"],
  reconnecting: ["Reconnexion au suivi de votre analyse…", "Reconnecting to your analysis…"],
}[status] || ["Récupération du rapport…", "Retrieving your report…"])[lang === "fr" ? 0 : 1];
export function requestPublicRead(url, { endpoint = "/api/free-read", onStatus = () => {} } = {}) {
  const canonical = new URL(url); canonical.hash = "";
  const key = `gtm-audit:${endpoint}:${canonical.href}`;
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(key) || "null"); } catch { /* Optional browser storage. */ }
    if (!saved || !/^[A-Za-z0-9_-]{43}$/.test(saved.token) || saved.expiresAt <= Date.now()) {
      saved = { token: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), expiresAt: Date.now() + 24 * 3600_000 };
    }
    try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch { /* In-memory coalescing still applies. */ }
    const statusUrlFor = id => new URL(`/api/audits/${encodeURIComponent(id)}`, new URL(endpoint, location.href));
    const persist = () => { try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch { /* Optional. */ } };
    let job;
    if (saved.id) {
      try {
        const resumed = await fetch(statusUrlFor(saved.id), { headers: { Authorization: `Bearer ${saved.token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (resumed.ok) job = await resumed.json();
      } catch { onStatus("reconnecting"); }
    }
    if (!job) {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Prefer: "respond-async", "Idempotency-Key": saved.token },
        body: JSON.stringify({ url: canonical.href }), signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.auditJob) return data; // Existing Node and stateless Worker deployments.
      job = data.auditJob;
      saved.id = job.id; saved.expiresAt = job.expiresAt || saved.expiresAt; persist();
    }
    const deadline = Date.now() + 120_000;
    const statusUrl = statusUrlFor(job.id);
    while (true) {
      if (job.status === "completed" && job.result) return { ...job.result, auditJob: { id: job.id, token: saved.token } };
      if (job.status === "failed") {
        try { sessionStorage.removeItem(key); } catch { /* Explicit next submission can create a new analysis. */ }
        throw new Error("audit_unavailable");
      }
      if (Date.now() >= deadline) throw new Error("audit_still_running"); // Keep capability for the next visit.
      onStatus(job.status);
      await pause(2000);
      try {
        const polled = await fetch(statusUrl, { headers: { Authorization: `Bearer ${saved.token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!polled.ok) throw new Error(`HTTP ${polled.status}`);
        job = await polled.json();
      } catch { onStatus("reconnecting"); }
    }
  })().finally(() => pending.delete(key));
  pending.set(key, work); return work;
}
