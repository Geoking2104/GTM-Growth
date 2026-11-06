/** Bounded, session-only read-ahead. Only explicitly listed read operations may run automatically. */
export function createBackgroundLoader(fetchData, onChange = () => {}) {
  let generation = 0; const cache = new Map(); const pending = new Map(); let jobs = [];
  const key = (tenant, route, body) => JSON.stringify([tenant, route, body]);
  const snapshot = () => jobs.map(({ label, state, detail }) => ({ label, state, detail }));
  const notify = () => onChange(snapshot());
  async function request(tenant, route, body) {
    const k = key(tenant, route, body); const entry = cache.get(k);
    if (entry && Date.now() - entry.at < 300000) return entry.data;
    if (pending.has(k)) return pending.get(k);
    const started = generation;
    const run = fetchData(route, body).then((data) => { if (started === generation && !data?.problem) cache.set(k, { data, at: Date.now() }); return data; }).finally(() => { if (pending.get(k) === run) pending.delete(k); });
    pending.set(k, run); return run;
  }
  async function start(tenant, tasks, concurrency = 2) {
    const run = ++generation; jobs = tasks.map((task) => ({ ...task, state: task.skip ? 'skipped' : 'queued', detail: task.skip || '' })); notify();
    let next = 0;
    async function worker() {
      while (run === generation) {
        const index = next++; if (index >= jobs.length) break;
        const job = jobs[index]; if (job.skip) continue;
        job.state = 'running'; notify();
        try {
          const data = await request(tenant, job.route, job.body);
          if (run !== generation) return;
          job.state = data?.problem ? 'error' : 'done'; job.detail = data?.problem?.message || '';
        } catch (error) { if (run !== generation) return; job.state = 'error'; job.detail = error?.message || String(error); }
        notify();
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  }
  function reset() { generation++; cache.clear(); pending.clear(); jobs = []; notify(); }
  return { start, request, reset, snapshot };
}
