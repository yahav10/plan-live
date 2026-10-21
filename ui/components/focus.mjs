import { esc, inline } from '../lib.mjs';
import { icon } from '../icons.mjs';
import { renderBlock, renderTaskMeta, openCount, badge } from './sections.mjs';
import { renderRunButton } from './run.mjs';
import { taskStatuses, STATUS_LABEL } from './status.mjs';
import { trustState } from './trust.mjs';

export function focusTarget({ plan, focus }) {
  const { byId, now } = taskStatuses(plan.model);
  return byId.get(focus?.task) ?? now ?? null;
}

export function renderFocus(state, visual = null) {
  const { plan, review } = state, { model } = plan;
  const target = focusTarget(state);
  if (!target) return '';
  const { byId, now } = taskStatuses(model);
  const order = [...byId.keys()], i = order.indexOf(target.sectionId);
  const s = model.sections.find(x => x.id === target.sectionId);
  const next = model.tasks.find(t => t.sectionId === s.id && !t.checked);
  const comments = review.comments;
  const ctxFor = (index) => ({ sectionId: s.id, index, comments, doing: model.tasks.find(t => !t.checked)?.id, next: next?.id, visual, model, trust: id => trustState(state.trusted ?? new Set(), id) });
  const away = now && now.sectionId !== target.sectionId;
  const nav = `<span class="focus-nav"><button class="ibtn" data-act="focus-prev" aria-label="Previous task"${i <= 0 ? ' disabled' : ''}>${icon('chev-left', 14)}</button><span class="focus-pos">${i + 1} of ${order.length}</span><button class="ibtn" data-act="focus-next" aria-label="Next task"${i >= order.length - 1 ? ' disabled' : ''}>${icon('chev-right', 14)}</button></span>`;
  const bar = `<div class="focus-bar"><button class="btn" data-act="focus-exit">Back to the plan</button>${nav}${away ? '<button class="link" data-act="focus-follow">Back to the current task</button>' : ''}</div>`;
  const count = target.total ? `<span class="h-count${target.status === 'done' ? ' ok' : ''}">${target.done}/${target.total}</span>` : '';
  const pending = openCount(comments, c => c.anchor.sectionId === s.id && !c.anchor.taskId);
  return `${bar}<section class="card focus" id="${esc(s.id)}" data-sec="${esc(s.id)}"><h2>${inline(s.heading)}${count}${badge(pending)}${renderRunButton({ model, sectionId: s.id, comments })}</h2>`
    + `${renderTaskMeta(target)}${next ? `<div class="next-step"><span class="now-l">Next step</span>${inline(next.text)}</div>` : ''}`
    + `${s.blocks.map((b, n) => renderBlock(b, ctxFor(n))).join('')}</section>`;
}

export { STATUS_LABEL };
