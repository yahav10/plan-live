const finished = p => p.total > 0 && p.done === p.total;

// One place decides a task's state, so the header, the cards, the outline and the focus page always agree.
export function taskStatuses(model) {
  const nodes = model.graph.nodes;
  const byKey = new Map(nodes.map(n => [n.key, n]));
  const firstOpen = model.tasks.find(t => !t.checked);
  const now = nodes.find(n => n.sectionId === firstOpen?.sectionId) ?? nodes.find(n => !finished(n.progress)) ?? null;
  const byId = new Map();
  for (const n of nodes) {
    const deps = model.graph.edges.filter(e => e[1] === n.key).map(e => byKey.get(e[0])).filter(Boolean);
    const p = n.progress;
    const status = finished(p) ? 'done' : p.done > 0 || n === now ? 'progress' : deps.some(d => !finished(d.progress)) ? 'blocked' : 'todo';
    byId.set(n.sectionId, {
      key: n.key, label: n.label, sectionId: n.sectionId, status, done: p.done, total: p.total,
      needs: deps.map(d => ({ key: d.key, sectionId: d.sectionId, done: finished(d.progress) })),
    });
  }
  return { byId, now: now ? byId.get(now.sectionId) : null };
}

export function summary(model) {
  const { byId, now } = taskStatuses(model);
  const keys = s => [...byId.values()].filter(v => v.status === s).map(v => v.key);
  const p = model.progress;
  return {
    pct: p.total ? Math.round((p.done / p.total) * 100) : 0,
    steps: p,
    tiles: { done: keys('done'), progress: keys('progress'), blocked: keys('blocked'), todo: keys('todo') },
    now: model.tasks.every(t => t.checked) ? null : now,
    tasks: byId.size,
  };
}

export const STATUS_LABEL = { done: 'Done', progress: 'In progress', blocked: 'Blocked', todo: 'To do' };

// Finished tasks fold away, unless comments on them are still waiting. A choice you made always wins.
export function foldedSections(statuses, comments, overrides = {}) {
  const pending = new Set(comments.filter(c => c.status === 'draft' || c.status === 'queued').map(c => c.anchor.sectionId));
  const out = new Set();
  for (const [id, t] of statuses.byId) {
    if (t.status !== 'done') continue;
    const choice = overrides[id];
    if (choice === 'closed' || (choice !== 'open' && !pending.has(id))) out.add(id);
  }
  return out;
}
