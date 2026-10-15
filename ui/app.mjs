import { api, toast } from './lib.mjs';
import { resolveChoice, applyTheme, nextMode, nextTheme, remember } from './theme.mjs';
import { renderStrip, fmtAge } from './components/strip.mjs';
import { renderHero } from './components/hero.mjs';
import { renderSections } from './components/sections.mjs';
import { visual } from './components/visual.mjs';
import { hydrateMermaid } from './components/mermaid.mjs';
import { attachPanZoom } from './components/dag.mjs';
import { renderRail, anchorLabel } from './components/review.mjs';

export const state = { plan: null, review: { comments: [], batches: [], revisions: [] }, choice: null, online: false, active: null, anchor: null, selAnchor: null, composing: null, prev: new Map() };
export const hooks = {
  visual,
  afterSections: (root, mode) => {
    hydrateMermaid(root, mode);
    root.querySelectorAll('svg.dag.zoomable').forEach(attachPanZoom);
  },
  renderRail,
};
const $ = id => document.getElementById(id);

function setHTML(el, html) {
  if (el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
}

function markChanged() {
  const first = state.prev.size === 0;
  for (const el of document.querySelectorAll('#sections [data-key]')) {
    const { key, sig } = el.dataset;
    if (!first && state.prev.get(key) !== sig) el.classList.add('pulse');
    state.prev.set(key, sig);
  }
}

function trackActive() {
  const cards = [...document.querySelectorAll('#sections section[data-sec]:not(#intro):not(#graph)')];
  const passed = cards.filter(c => c.getBoundingClientRect().top <= 120);
  const current = passed.at(-1) ?? cards[0];
  if (current) setActive(current.dataset.sec);
}
let scrollTick = false;
addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => { scrollTick = false; trackActive(); });
}, { passive: true });

function setActive(id) {
  if (id === 'intro' || state.active === id) return;
  state.active = id;
  document.querySelectorAll('.secs a').forEach(a => a.classList.toggle('on', a.dataset.sec === id));
  document.querySelector(`.secs a[data-sec="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function render() {
  if (!state.plan) return;
  state.choice ??= resolveChoice(state.plan.defaults);
  state.active ??= state.plan.model.sections[0]?.id ?? null;
  applyTheme(state.choice);
  document.title = state.plan.model.title || state.plan.file;
  setHTML($('strip'), renderStrip(state));
  setHTML($('hero'), renderHero(state));
  if (setHTML($('sections'), renderSections(state, hooks.visual))) {
    markChanged();
    hooks.afterSections($('sections'), document.documentElement.dataset.mode);
  }
  const rail = hooks.renderRail(state);
  setHTML($('rail-top'), rail.top);
  setHTML($('rail-bottom'), rail.bottom);
}

function updateLive() {
  const el = $('age');
  if (el && state.plan && state.online) el.textContent = fmtAge(Date.now() - state.plan.changedAt);
}

export function setChoice(k, v) {
  state.choice[k] = v;
  remember(k, v);
  $('sections')._html = null;
  render();
}

function jump(dir) {
  const ids = state.plan.model.sections.map(s => s.id);
  const next = ids[Math.min(ids.length - 1, Math.max(0, ids.indexOf(state.active) + dir))];
  $(next)?.scrollIntoView({ behavior: 'smooth' });
}

export const keymap = {
  j: () => jump(1),
  k: () => jump(-1),
  t: () => setChoice('theme', nextTheme(state.choice.theme)),
  d: () => setChoice('mode', nextMode(state.choice.mode)),
};

async function toggleTask(li) {
  try {
    await api('POST', `/api/tasks/${encodeURIComponent(li.dataset.task)}/toggle`, { lineHash: li.dataset.hash });
  } catch (e) {
    toast(e.status === 409 ? 'Plan changed — refreshed' : e.message);
  }
}

export const actions = {
  'theme-menu': () => { $('theme-menu').hidden = !$('theme-menu').hidden; },
  'set-theme': el => setChoice('theme', el.dataset.themeId),
  mode: () => setChoice('mode', nextMode(state.choice.mode)),
  toggle: el => toggleTask(el.closest('[data-task]')),
};

document.addEventListener('click', e => {
  const actEl = e.target.closest('[data-act]');
  const menu = $('theme-menu');
  if (menu && !e.target.closest('.tw')) menu.hidden = true;
  if (actEl && actions[actEl.dataset.act]) { e.preventDefault(); actions[actEl.dataset.act](actEl, e); return; }
  const goto = e.target.closest('[data-goto]');
  if (goto) { $(goto.dataset.goto)?.scrollIntoView({ behavior: 'smooth' }); return; }
  const stripTab = e.target.closest('.secs a');
  if (stripTab) { e.preventDefault(); setActive(stripTab.dataset.sec); $(stripTab.dataset.sec)?.scrollIntoView({ behavior: 'smooth' }); }
});

document.addEventListener('keydown', e => {
  if (!state.plan || e.target.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  const fn = keymap[e.key.toLowerCase()] ?? (e.key === 'Enter' ? keymap.enter : null);
  if (fn) { e.preventDefault(); fn(); }
});

function connect() {
  const es = new EventSource('/events');
  es.addEventListener('plan', e => { state.plan = JSON.parse(e.data); state.online = true; document.body.classList.remove('gone'); render(); });
  es.addEventListener('review', e => {
    const r = JSON.parse(e.data);
    if (r.notice) toast(r.notice);
    state.review = r;
    render();
  });
  es.addEventListener('gone', () => { document.body.classList.add('gone'); toast('Plan file is gone — showing the last version'); });
  es.onopen = () => { state.online = true; render(); };
  es.onerror = () => { state.online = false; if (state.plan) render(); };
}

async function boot() {
  try {
    state.plan = await api('GET', '/api/plan');
    state.review = await api('GET', '/api/review');
    state.online = true;
  } catch (e) {
    toast(`Could not load the plan: ${e.message}`);
  }
  render();
  connect();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.choice?.mode === 'auto') { $('sections')._html = null; render(); }
  });
  setInterval(updateLive, 1000);
}

function setAnchor(anchor, el) {
  state.anchor = anchor;
  document.querySelectorAll('.anchored').forEach(x => x.classList.remove('anchored'));
  el?.classList.add('anchored');
  if (state.composing && !state.composing.editing) {
    state.composing.anchor = anchor;
    $('composer-anchor').textContent = `↳ ${anchorLabel(anchor, state.plan.model)}`;
  }
}

function openComposer(anchor, editing = null) {
  anchor ??= state.anchor ?? { sectionId: state.active ?? 'intro' };
  state.composing = { anchor, editing: editing?.id ?? null };
  $('composer-anchor').textContent = `↳ ${anchorLabel(anchor, state.plan.model)}`;
  $('composer-body').value = editing?.body ?? '';
  $('sugg-toggle').hidden = !anchor.quote;
  $('composer-suggest').checked = editing?.kind === 'suggestion';
  $('composer-replacement').hidden = !$('composer-suggest').checked;
  $('composer-replacement').value = editing?.replacement ?? anchor.quote ?? '';
  $('composer').hidden = false;
  $('add-comment').hidden = true;
  $('sel-comment').hidden = true;
  $('composer-body').focus();
}

function closeComposer() {
  state.composing = null;
  $('composer').hidden = true;
  $('add-comment').hidden = false;
}

async function saveComment() {
  const body = $('composer-body').value.trim();
  if (!body || !state.composing) return;
  const kind = $('composer-suggest').checked ? 'suggestion' : 'comment';
  const payload = { anchor: state.composing.anchor, kind, body, ...(kind === 'suggestion' ? { replacement: $('composer-replacement').value } : {}) };
  try {
    if (state.composing.editing) await api('PATCH', `/api/comments/${state.composing.editing}`, payload);
    else await api('POST', '/api/comments', payload);
    closeComposer();
  } catch (e) {
    toast(e.message);
  }
}

async function applyBatch() {
  const n = state.review.comments.filter(c => c.status === 'draft').length;
  if (!n) return;
  try {
    await api('POST', '/api/apply');
    toast(`Sent ${n} comment${n === 1 ? '' : 's'} to Claude`);
  } catch (e) {
    toast(e.message);
  }
}

const revisionAction = action => async el => {
  try { await api('POST', `/api/revisions/${el.dataset.id}`, { action }); } catch (e) { toast(e.message); }
};

Object.assign(actions, {
  apply: applyBatch,
  'open-composer': () => openComposer(),
  'cancel-comment': closeComposer,
  'comment-selection': () => openComposer(state.selAnchor),
  'edit-comment': el => openComposer(null, state.review.comments.find(c => c.id === el.dataset.id)),
  'delete-comment': async el => { try { await api('DELETE', `/api/comments/${el.dataset.id}`); } catch (e) { toast(e.message); } },
  accept: revisionAction('accept'),
  reject: revisionAction('reject'),
});
Object.assign(keymap, { c: () => openComposer(), enter: applyBatch });

$('composer').addEventListener('submit', e => { e.preventDefault(); saveComment(); });
$('composer-body').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveComment(); }
  if (e.key === 'Escape') closeComposer();
});
$('composer-suggest').addEventListener('change', e => { $('composer-replacement').hidden = !e.target.checked; });

document.addEventListener('click', e => {
  if (e.target.closest('[data-act], [data-goto], .rail, .strip')) return;
  const task = e.target.closest('main [data-task]');
  const sec = e.target.closest('main section[data-sec]');
  if (task) setAnchor({ sectionId: task.dataset.sec, taskId: task.dataset.task, quote: task.dataset.text }, task);
  else if (sec) setAnchor({ sectionId: sec.dataset.sec }, sec);
});

document.addEventListener('mouseup', e => {
  if (e.target.closest('#sel-comment')) return;
  const sel = getSelection(), text = sel?.toString().trim(), btn = $('sel-comment');
  const host = sel?.anchorNode?.parentElement;
  const sec = host?.closest('main section[data-sec]');
  if (!text || !sec) { btn.hidden = true; return; }
  const task = host.closest('[data-task]');
  state.selAnchor = { sectionId: sec.dataset.sec, ...(task ? { taskId: task.dataset.task } : {}), quote: text.slice(0, 300) };
  const r = sel.getRangeAt(0).getBoundingClientRect();
  btn.style.top = `${scrollY + r.top - 38}px`;
  btn.style.left = `${scrollX + r.left}px`;
  btn.hidden = false;
});

queueMicrotask(boot);
