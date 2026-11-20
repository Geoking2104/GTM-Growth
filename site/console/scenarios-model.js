/** Small pure editing helpers shared by the three Campaign Studio views. */
export const CHANNELS = ['seo', 'geo', 'content', 'local', 'social', 'email', 'paid', 'analytics', 'coordination'];
export const NODE_TYPES = ['action', 'objective', 'evidence', 'content', 'decision', 'approval', 'milestone', 'observation', 'wait', 'group'];
export const EDGE_TYPES = ['finish_to_start', 'start_to_start', 'approval_gate', 'measurement_feedback'];
export const clone = value => JSON.parse(JSON.stringify(value));
export const dayIndex = value => Date.parse(`${value}T00:00:00Z`) / 86400000;
export function addDays(value, amount) { return new Date((dayIndex(value) + amount) * 86400000).toISOString().slice(0, 10); }
export function todayIn(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year','month','day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}
export function draftOf(plan) {
  const draft = {};
  for (const key of ['name', 'objective', 'language', 'timezone', 'startDate', 'endDate', 'budgetCents', 'currency', 'channels', 'status', 'nodes', 'edges', 'evidence', 'layout']) if (plan[key] !== undefined) draft[key] = clone(plan[key]);
  return draft;
}
export function newDraft(language, timezone) {
  const startDate = todayIn(timezone);
  return { name: '', objective: '', language, timezone, startDate, endDate: addDays(startDate, 29), budgetCents: 0, currency: 'EUR', channels: ['seo', 'geo', 'content'], status: 'draft', nodes: [], edges: [], evidence: [], layout: { positions: {} } };
}
export function newNode(plan, type, channel, title) {
  return { id: crypto.randomUUID(), type, title, description: '', channel, startDate: plan.startDate, endDate: plan.startDate, owner: '', effortHours: 0, budgetCents: 0, status: 'todo', locked: false, evidenceIds: [], checklist: [] };
}
export function removeNode(draft, id) {
  const next = clone(draft);
  next.nodes = next.nodes.filter(n => n.id !== id);
  next.edges = next.edges.filter(e => e.source !== id && e.target !== id);
  delete next.layout.positions[id];
  return next;
}
export function summarize(draft) {
  if (draft.summary) return draft.summary;
  const actions = draft.nodes.filter(n => !['evidence', 'objective', 'group'].includes(n.type));
  return { count: actions.length, done: actions.filter(n => n.status === 'done').length, budget: actions.reduce((sum,n) => sum + n.budgetCents, 0), hours: actions.reduce((sum,n) => sum + n.effortHours, 0), assigned: actions.filter(n => n.owner || n.assigneeId).length };
}
export function filterNodes(nodes, { channel = '', owner = '', status = '', query = '' } = {}) {
  const normal = query.trim().toLocaleLowerCase();
  return nodes.filter(n => (!channel || n.channel === channel) && (!owner || n.owner === owner || n.assigneeId === owner) && (!status || n.status === status) && (!normal || `${n.title} ${n.description} ${n.owner}`.toLocaleLowerCase().includes(normal)));
}
export function layoutByChannel(draft) {
  const positions = {}, channels = CHANNELS.filter(c => draft.nodes.some(n => n.channel === c));
  channels.forEach((channel, row) => { draft.nodes.filter(n => n.channel === channel).forEach((node, col) => { positions[node.id] = { x: 28 + col * 300, y: 56 + row * 190 }; }); });
  return positions;
}
/** A bounded local edit history. A server save changes the version, not this history. */
export function createHistory(limit = 40) {
  const past = [], future = [];
  return {
    push(draft) { past.push(clone(draft)); if (past.length > limit) past.shift(); future.length = 0; },
    undo(current) { if (!past.length) return null; future.push(clone(current)); return past.pop(); },
    redo(current) { if (!future.length) return null; past.push(clone(current)); return future.pop(); },
    reset() { past.length = 0; future.length = 0; },
    get canUndo() { return Boolean(past.length); }, get canRedo() { return Boolean(future.length); }
  };
}
