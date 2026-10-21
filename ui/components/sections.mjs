import { esc, inline, hashStr } from '../lib.mjs';
import { icon } from '../icons.mjs';
import { renderRunButton } from './run.mjs';
import { renderImage, renderEmbed } from './media.mjs';
import { taskStatuses, foldedSections, STATUS_LABEL } from './status.mjs';
import { renderTableRows } from './phone.mjs';
import { trustState } from './trust.mjs';

export const openCount = (comments, pred) => comments.filter(c => (c.status === 'draft' || c.status === 'queued') && pred(c)).length;
export const badge = n => (n ? `<span class="pill c">${icon('comment', 12)} ${n}</span>` : '');

function renderTask(item, ctx) {
  const t = item.task;
  const cls = ['task', t.checked ? 'done' : '', t.id === ctx.doing ? 'doing' : '', t.id === ctx.next ? 'next' : ''].filter(Boolean).join(' ');
  const n = openCount(ctx.comments, c => c.anchor.taskId === t.id);
  return `<li class="${cls}" data-task="${esc(t.id)}" data-hash="${t.hash}" data-sec="${esc(t.sectionId)}" data-text="${esc(t.text)}" style="--indent:${item.indent}">`
    + `<button class="cb" data-act="toggle" aria-label="${t.checked ? 'Mark not done' : 'Mark done'}">${t.checked ? icon('check', 13) : ''}</button>`
    + `<div class="t">${inline(t.text)}</div>${n ? `<span class="marker"></span>` : ''}${badge(n)}</li>`;
}

const CALLOUT = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
const CALLOUT_ICON = { note: 'info', tip: 'bulb', important: 'flag', warning: 'alert', caution: 'stop' };

export function renderBlock(b, ctx) {
  const key = `${ctx.sectionId}:${ctx.index}`, sig = hashStr(JSON.stringify(b));
  const wrap = html => `<div class="block" data-key="${esc(key)}" data-sig="${sig}">${html}</div>`;
  switch (b.type) {
    case 'paragraph': return wrap(`<p>${inline(b.text)}</p>`);
    case 'heading': return wrap(`<h${Math.min(b.level + 1, 5)} class="sub-h">${inline(b.text)}</h${Math.min(b.level + 1, 5)}>`);
    case 'list': return wrap(`<ul class="list">${b.items.map(it => (it.task ? renderTask(it, ctx) : `<li style="--indent:${it.indent}">${inline(it.text)}</li>`)).join('')}</ul>`);
    case 'table': return wrap(`<div class="table-wrap"><table><thead><tr>${b.head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="rows-m">${renderTableRows(b)}</div>`);
    case 'callout': { const k = CALLOUT[b.kind] ? b.kind : 'note'; return wrap(`<div class="callout callout-${k}" role="note"><div class="callout-title">${icon(CALLOUT_ICON[k], 14)}${esc(b.title || CALLOUT[k])}</div>${b.paras.map(t => `<p>${inline(t)}</p>`).join('')}</div>`); }
    case 'quote': return wrap(`<blockquote class="quote">${b.paras.map(t => `<p>${inline(t)}</p>`).join('')}</blockquote>`);
    case 'image': return wrap(renderImage(b));
    case 'embed': return wrap(renderEmbed(b, { trust: ctx.trust?.(b.id) ?? 'off' }));
    case 'code': return wrap(`<pre class="code"><code>${esc(b.code)}</code></pre>${b.error ? `<div class="block-error">Couldn't parse ${esc(b.lang)} block: ${esc(b.error)}</div>` : ''}`);
    default: return ctx.visual?.(b, wrap) ?? wrap(`<pre class="code"><code>${esc(JSON.stringify(b, null, 2))}</code></pre>`);
  }
}

export function renderTaskMeta(t) {
  const needs = t.needs.length
    ? `<span class="needs-l">Needs</span>${t.needs.map(d => `<button class="need${d.done ? ' ok' : ''}" data-goto="${esc(d.sectionId)}">${esc(d.key)}</button>`).join('')}`
    : '';
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
  return `<div class="task-meta"><span class="st st-${t.status}">${STATUS_LABEL[t.status]}</span>${needs}<span class="tm-bar st-${t.status}" style="--p:${pct}"><i></i></span></div>`;
}

export function renderSections({ plan, review, fold = {}, trusted = new Set() }, visual) {
  const { model } = plan;
  const comments = review.comments;
  const doing = model.tasks.find(t => !t.checked)?.id;
  const trust = id => trustState(trusted, id);
  const ctxFor = (sectionId, index) => ({ sectionId, index, comments, doing, visual, model, trust });
  const intro = model.preamble.filter(b => !(b.type === 'paragraph' && /^\*\*[^*]+?:\*\*/.test(b.text)));
  const introHtml = intro.length ? `<section class="card intro" id="intro" data-sec="intro">${intro.map((b, i) => renderBlock(b, ctxFor('intro', i))).join('')}</section>` : '';
  const graphHtml = visual?.graph?.(model) ?? '';
  const statuses = taskStatuses(model), { byId } = statuses;
  const folded = foldedSections(statuses, comments, fold);
  const cards = model.sections.map((s, n) => {
    const count = openCount(comments, c => c.anchor.sectionId === s.id && !c.anchor.taskId);
    const t = byId.get(s.id);
    const hcount = t?.total ? `<span class="h-count${t.status === 'done' ? ' ok' : ''}">${t.done}/${t.total}</span>` : '';
    const foldable = t?.status === 'done';
    const fl = foldable ? ` data-act="fold" data-sec="${esc(s.id)}" aria-expanded="${!folded.has(s.id)}"` : '';
    return `<section class="card${folded.has(s.id) ? ' folded' : ''}" id="${esc(s.id)}" data-sec="${esc(s.id)}"><h2 data-n="${String(n + 1).padStart(2, '0')}"${fl}>${inline(s.heading)}${hcount}${badge(count)}${renderRunButton({ model, sectionId: s.id, comments })}</h2>`
      + `${t ? renderTaskMeta(t) : ''}${s.blocks.map((b, i) => renderBlock(b, ctxFor(s.id, i))).join('')}</section>`;
  }).join('');
  return introHtml + graphHtml + cards;
}
