import { esc, inline } from '../lib.mjs';

const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function anchorLabel(anchor, model) {
  const sec = anchor.sectionId === 'intro' ? 'Intro' : model.sections.find(s => s.id === anchor.sectionId)?.short ?? anchor.sectionId;
  return anchor.quote ? `${sec} › “${trunc(anchor.quote.replace(/\*\*|__|`/g, ""), 60)}”` : sec;
}

const diff = (minus, plus) => `<div class="diff">${minus.map(l => `<div class="del">- ${esc(l)}</div>`).join('')}${plus.map(l => `<div class="add">+ ${esc(l)}</div>`).join('')}</div>`;

function commentCard(c, model, { editable = false } = {}) {
  const suggestion = c.kind === 'suggestion' ? diff([c.anchor.quote ?? ''], [c.replacement ?? '']) : '';
  const resolution = c.resolution
    ? `<div class="reply"><div class="who"><span class="av ai">C</span>Claude · ${c.status}</div>${inline(c.resolution.note)}</div>` : '';
  const tools = editable
    ? `<div class="tools"><button class="link" data-act="edit-comment" data-id="${c.id}">Edit</button><button class="link" data-act="delete-comment" data-id="${c.id}">Delete</button></div>` : '';
  return `<div class="cmt${c.orphaned ? ' orphan' : ''}" data-comment="${c.id}">`
    + `<div class="who"><span class="av">You</span>${c.kind === 'suggestion' ? 'Suggestion' : 'Comment'}${tools}</div>`
    + `<div class="anchor" data-goto="${esc(c.anchor.sectionId)}">↳ ${esc(anchorLabel(c.anchor, model))}${c.orphaned ? ' · anchor no longer in the plan' : ''}</div>`
    + `<div class="body">${inline(c.body)}</div>${suggestion}${resolution}</div>`;
}

function revisionCard(r, comments, model) {
  const c = comments.find(x => x.id === r.commentId);
  const head = c ? `for ${esc(anchorLabel(c.anchor, model))}` : 'other change in this batch';
  const actions = r.status === 'proposed'
    ? `<div class="actions"><button class="btn yes" data-act="accept" data-id="${r.id}">Accept</button><button class="btn" data-act="reject" data-id="${r.id}">Reject</button></div>`
    : `<div class="block-error">Couldn't undo automatically. Claude has been asked to revert it by hand.</div>`;
  return `<div class="cmt rev" data-revision="${r.id}"><div class="who"><span class="av ai">C</span>Claude revised · ${head}</div>${diff(r.hunk.aLines, r.hunk.bLines)}${actions}</div>`;
}

export function renderRail({ plan, review }) {
  const { model } = plan;
  const by = s => review.comments.filter(c => c.status === s);
  const drafts = by('draft'), queued = by('queued');
  const done = review.comments.filter(c => c.status === 'resolved' || c.status === 'declined');
  const revs = review.revisions.filter(r => r.status === 'proposed' || r.status === 'conflict');
  const n = drafts.length;
  const top = `<div class="rail-h"><b>Review</b>${n ? `<span class="count">${n} draft${n === 1 ? '' : 's'}</span>` : ''}</div>`
    + drafts.map(c => commentCard(c, model, { editable: true })).join('');
  const bottom = `<button class="apply" data-act="apply"${n ? '' : ' disabled'}>Apply ${n || ''} comment${n === 1 ? '' : 's'} → Claude <span>⏎</span></button>`
    + (queued.length ? `<div class="rail-h"><b>With Claude</b><span class="pill">${queued.length}</span></div>${queued.map(c => commentCard(c, model)).join('')}` : '')
    + (revs.length ? `<div class="rail-h"><b>Claude revised</b><span class="pill">${revs.length}</span></div>${revs.map(r => revisionCard(r, review.comments, model)).join('')}` : '')
    + (done.length ? `<details class="history"><summary>${done.length} resolved</summary>${done.map(c => commentCard(c, model)).join('')}</details>` : '');
  return { top, bottom };
}
