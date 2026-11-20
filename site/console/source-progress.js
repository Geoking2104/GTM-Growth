/**
 * Per-source loading progress for console views that combine several data
 * sources (Vue d'ensemble / Overview). Each source is fetched with at most two
 * requests in flight, in the declared order, and reports its real state:
 * queued → running → done | error | skipped. No percentage is ever invented:
 * the overall bar counts settled sources, a running source shows an
 * indeterminate gradient bar, and a settled source a full one.
 */

export const SOURCE_STATES = ["queued", "running", "done", "error", "skipped"];

/**
 * Run sources with bounded concurrency and dependencies.
 * @param {Array<{ id: string, after?: string[], skip?: (results: Record<string, unknown>) => string | false | null | undefined, run: (results: Record<string, unknown>) => Promise<unknown> }>} sources
 * @param {{ concurrency?: number, onChange?: (jobs: Array<{ id: string, state: string, detail: string }>) => void }} [options]
 * @returns {Promise<Record<string, unknown>>} results by source id (errors are `{ loadError }`).
 */
export async function runSources(sources, { concurrency = 2, onChange = () => {} } = {}) {
  const jobs = sources.map((source) => ({ id: source.id, state: "queued", detail: "" }));
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const results = {};
  const notify = () => onChange(jobs.map((job) => ({ ...job })));
  const settled = (id) => { const job = byId.get(id); return !job || !["queued", "running"].includes(job.state); };
  let active = 0;
  notify();
  await new Promise((resolve) => {
    const pump = () => {
      let changed = true;
      while (changed) {
        changed = false;
        for (let index = 0; index < sources.length; index++) {
          const source = sources[index], job = jobs[index];
          if (job.state !== "queued" || !(source.after ?? []).every(settled)) continue;
          // A source that is not connected settles at once, without using a slot.
          const skip = source.skip?.(results);
          if (skip) { job.state = "skipped"; job.detail = String(skip); results[source.id] = null; changed = true; notify(); continue; }
          if (active >= concurrency) continue;
          changed = true;
          job.state = "running"; active++; notify();
          Promise.resolve().then(() => source.run(results)).then(
            (value) => { results[source.id] = value; const problem = value && typeof value === "object" ? value.problem : null; job.state = problem ? "error" : "done"; job.detail = problem && typeof problem === "object" && problem.message ? String(problem.message) : ""; },
            (error) => { results[source.id] = { loadError: error }; job.state = "error"; job.detail = error?.message || String(error); },
          ).finally(() => { active--; notify(); pump(); });
        }
      }
      if (active > 0) return;
      // Nothing running and nothing runnable: any queued job has an unmet dependency cycle.
      const stuck = jobs.filter((job) => job.state === "queued");
      for (const job of stuck) { job.state = "skipped"; results[job.id] = null; }
      if (stuck.length) notify();
      resolve();
    };
    pump();
  });
  return results;
}

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Accessible progress panel. `copy` holds the localised strings:
 * { title, intro, overall(done,total), states: {queued,running,done,error,skipped}, sources: { [id]: { label, explain } } }.
 */
export function renderSourceProgress(jobs, copy, { compact = false } = {}) {
  const total = jobs.length;
  const done = jobs.filter((job) => !["queued", "running"].includes(job.state)).length;
  const root = node("section", `c-source-progress${compact ? " is-compact" : ""}`);
  root.setAttribute("aria-busy", String(done < total));
  root.append(node("h3", "c-source-progress-title", copy.title));
  if (!compact) root.append(node("p", "c-source-progress-intro", copy.intro));
  const overall = node("div", "c-source-bar is-overall");
  overall.setAttribute("role", "progressbar");
  overall.setAttribute("aria-label", copy.title);
  overall.setAttribute("aria-valuemin", "0");
  overall.setAttribute("aria-valuemax", String(total));
  overall.setAttribute("aria-valuenow", String(done));
  overall.setAttribute("aria-valuetext", copy.overall(done, total));
  const fill = node("span", "c-source-fill"); fill.style.width = total ? `${(done / total) * 100}%` : "0%"; overall.append(fill);
  const overallRow = node("div", "c-source-overall");
  overallRow.append(overall, node("span", "c-source-count", copy.overall(done, total)));
  root.append(overallRow);
  const list = node("ol", "c-source-list");
  for (const job of jobs) {
    const meta = copy.sources[job.id] ?? { label: job.id, explain: "" };
    const item = node("li", `c-source c-source-${job.state}`);
    item.dataset.source = job.id;
    const head = node("div", "c-source-head");
    head.append(node("strong", "c-source-label", meta.label), node("span", `c-source-state is-${job.state}`, copy.states[job.state]));
    const bar = node("div", "c-source-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", meta.label);
    bar.setAttribute("aria-valuetext", copy.states[job.state]);
    if (job.state !== "running") {
      bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", job.state === "queued" ? "0" : "100");
    }
    bar.append(node("span", "c-source-fill"));
    item.append(head, bar);
    if (!compact && meta.explain) item.append(node("p", "c-source-explain", meta.explain));
    if (job.detail && job.state === "error") item.append(node("p", "c-source-detail", job.detail));
    if (job.detail && job.state === "skipped") item.append(node("p", "c-source-detail", job.detail));
    list.append(item);
  }
  root.append(list);
  return root;
}
