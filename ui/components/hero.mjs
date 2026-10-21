import { esc, inline } from '../lib.mjs';
import { icon } from '../icons.mjs';
import { summary, STATUS_LABEL } from './status.mjs';

const keysCell = keys => (keys.length > 6 ? `${keys.slice(0, 6).join(', ')} +${keys.length - 6}` : keys.join(', '));

function renderOverview(model) {
  const p = model.progress;
  if (!p.total) return '';
  const s = summary(model);
  const tiles = s.tasks
    ? `<div class="tiles">${['done', 'progress', 'blocked', 'todo'].map(k => `<button class="tile st-${k}" data-act="tile" data-status="${k}"${s.tiles[k].length ? '' : ' disabled'}><b>${s.tiles[k].length}</b><span>${STATUS_LABEL[k]}</span><small>${esc(keysCell(s.tiles[k]))}</small></button>`).join('')}</div>`
    : '';
  const now = s.now ? `<div class="now"><span class="now-l">Now</span><button class="link now-name" data-goto="${esc(s.now.sectionId)}">${esc(s.now.key)} · ${esc(s.now.label.replace(/^(?:Task\s+|T)\d+\s*[:.—-]?\s*/i, ''))}</button><button class="btn" data-act="focus">Focus</button></div>` : '';
  return `<div class="overview"><div class="ov-progress"><b class="ov-pct">${s.pct}%</b><div class="ov-bar" style="--p:${s.pct}"><i></i></div><span class="ov-steps">${p.done} of ${p.total} steps</span></div>${tiles}${now}</div>`;
}

export function renderHero({ plan, review }) {
  const { model } = plan;
  const pending = review.comments.filter(c => c.status === 'draft' || c.status === 'queued').length;
  const chips = model.meta.fields.map(f => {
    const url = f.value.match(/https?:\/\/[^\s)]+/)?.[0];
    return url
      ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(f.value)}">${esc(f.label)} ${icon('external', 11)}</a>`
      : `<span class="chip" title="${esc(f.value)}">${esc(f.label)}: ${esc(f.value.slice(0, 40))}</span>`;
  });
  if (pending) chips.push(`<span class="chip warn"><i class="pdot"></i>${pending} comment${pending === 1 ? '' : 's'} pending</span>`);
  return `<div class="hero-text">
${model.meta.eyebrow ? `<div class="eyebrow">${esc(model.meta.eyebrow)}</div>` : ''}
<h1 class="title">${inline(model.title || plan.file)}</h1>
${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
<div class="file" title="${esc(plan.path)}">${esc(plan.file)}</div></div>${renderOverview(model)}`;
}
