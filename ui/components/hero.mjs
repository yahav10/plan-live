import { esc, inline } from '../lib.mjs';

export function renderHero({ plan, review }) {
  const { model } = plan, p = model.progress;
  const pctDone = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const pending = review.comments.filter(c => c.status === 'draft' || c.status === 'queued').length;
  const chips = model.meta.fields.map(f => {
    const url = f.value.match(/https?:\/\/[^\s)]+/)?.[0];
    return url
      ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(f.value)}">${esc(f.label)} ↗</a>`
      : `<span class="chip" title="${esc(f.value)}">${esc(f.label)}: ${esc(f.value.slice(0, 40))}</span>`;
  });
  if (pending) chips.push(`<span class="chip warn">● ${pending} comment${pending === 1 ? '' : 's'} pending</span>`);
  const ring = p.total ? `<div class="ring" style="--p:${pctDone}"><div><b>${pctDone}%</b><small>${p.done} of ${p.total}</small></div></div>` : '';
  return `${ring}<div class="hero-text">
${model.meta.eyebrow ? `<div class="eyebrow">${esc(model.meta.eyebrow)}</div>` : ''}
<h1 class="title">${inline(model.title || plan.file)}</h1>
${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
<div class="file" title="${esc(plan.path)}">${esc(plan.file)}</div></div>`;
}
