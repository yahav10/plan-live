import { esc, inline } from '../lib.mjs';

export function renderTitlebar(model) {
  const p = model.progress;
  if (!p.total) return '';
  const pct = Math.round((p.done / p.total) * 100);
  return `<button class="tb${pct === 100 ? ' tb-full' : ''}" data-act="top" aria-label="Back to the top of ${esc(model.title || 'the plan')}"><span class="tb-title">${esc(model.title || 'Plan')}</span><span class="tb-meta">${pct}% · ${p.done} of ${p.total}</span><span class="tb-bar" style="--p:${pct}"><i></i></span></button>`;
}
