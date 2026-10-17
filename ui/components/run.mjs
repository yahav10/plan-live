import { esc } from '../lib.mjs';

const unfinished = p => p.total > 0 && p.done < p.total;
const nodeOf = (model, sectionId) => model.graph.nodes.find(n => n.sectionId === sectionId);

export const runnable = (model, sectionId) => {
  const n = nodeOf(model, sectionId);
  return !!n && unfinished(n.progress);
};

export function blockedBy(model, sectionId) {
  const n = nodeOf(model, sectionId);
  if (!n) return [];
  return model.graph.edges.filter(e => e[1] === n.key)
    .map(e => model.graph.nodes.find(x => x.key === e[0]))
    .filter(x => x && unfinished(x.progress))
    .map(x => x.key);
}

export function runState(comments, sectionId) {
  const open = comments.find(c => c.kind === 'run' && c.anchor.sectionId === sectionId && (c.status === 'draft' || c.status === 'queued'));
  return open ? open.status : null;
}

export function renderRunButton({ model, sectionId, comments }) {
  if (!runnable(model, sectionId)) return '';
  const st = runState(comments, sectionId);
  const label = st === 'draft' ? 'Queued' : st === 'queued' ? 'Running…' : '▶ Run';
  return `<button class="run${st ? ' on' : ''}" data-act="run" data-sec="${esc(sectionId)}"${st ? ' disabled' : ''}>${label}</button>`;
}
