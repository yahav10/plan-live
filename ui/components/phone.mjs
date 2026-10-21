import { esc, inline } from '../lib.mjs';
import { icon } from '../icons.mjs';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const count = (list, status) => list.filter(x => x.status === status).length;

export function statusLine(review) {
  const proposed = count(review.revisions, 'proposed'), queued = count(review.comments, 'queued'), drafts = count(review.comments, 'draft');
  if (proposed) return { text: `${plural(proposed, 'change', 'changes')} from Claude to review`, kind: 'review' };
  if (queued) return { text: `Claude is working on ${plural(queued, 'comment', 'comments')}…`, kind: 'working' };
  if (drafts) return { text: `${plural(drafts, 'draft', 'drafts')} ready`, kind: 'draft' };
  return null;
}

export function renderBottombar({ view, review, alerts }) {
  const waiting = count(review.comments, 'draft') + count(review.revisions, 'proposed');
  const tab = (id, label, extra = '') => `<button class="bb-tab" data-act="view" data-view="${id}" role="tab" aria-selected="${view === id}">${label}${extra}</button>`;
  return `<div class="bb-tabs" role="tablist">${tab('plan', 'Plan')}${tab('now', 'Now')}${tab('review', 'Review', waiting ? `<span class="bb-n">${waiting}</span>` : '')}</div>`
    + `<button class="bb-btn" data-act="phone-comment" aria-label="Add a comment">${icon('comment', 20)}</button>`
    + `<button class="bb-btn" data-act="alerts" aria-label="Alerts" aria-pressed="${!!alerts}">${icon('bell', 20)}</button>`;
}

export function diffAlerts(prev, next) {
  if (!prev) return null;
  const was = new Map(prev.comments.map(c => [c.id, c.status]));
  const proposedBefore = new Set(prev.revisions.filter(r => r.status === 'proposed').map(r => r.id));
  const proposed = next.revisions.filter(r => r.status === 'proposed' && !proposedBefore.has(r.id)).length;
  const answered = next.comments.filter(c => (c.status === 'resolved' || c.status === 'declined') && was.get(c.id) === 'queued').length;
  const parts = [];
  if (proposed) parts.push(`proposed ${plural(proposed, 'change', 'changes')}`);
  if (answered) parts.push(`answered ${plural(answered, 'comment', 'comments')}`);
  return parts.length ? `Claude ${parts.join(' and ')}` : null;
}

export function renderTableRows({ head, rows }) {
  const rowHtml = r => {
    const first = `<b>${inline(r[0] ?? '')}</b>`;
    const preview = r.length >= 3 ? `<span class="tprev">${inline(r[1])}</span>` : '';
    const chip = r.length >= 2 ? `<span class="tchip">${inline(r.at(-1))}</span>` : '';
    const dl = `<dl>${r.map((c, i) => `<dt>${esc(head[i] ?? '')}</dt><dd>${inline(c)}</dd>`).join('')}</dl>`;
    return `<details class="trow"><summary>${first}${preview}${chip}</summary>${dl}</details>`;
  };
  return rows.map(rowHtml).join('');
}
