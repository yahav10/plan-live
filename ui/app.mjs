import { api, toast } from './lib.mjs';
import { resolveChoice, applyTheme, nextMode, nextTheme, remember, recall } from './theme.mjs';
import { renderStrip, fmtAge } from './components/strip.mjs';
import { renderHero } from './components/hero.mjs';
import { renderSections } from './components/sections.mjs';
import { visual } from './components/visual.mjs';
import { hydrateMermaid } from './components/mermaid.mjs';
import { attachPanZoom } from './components/dag.mjs';
import { renderRail, anchorLabel } from './components/review.mjs';
import { filterSections, renderJumpRows, renderSpine, renderPill } from './components/jump.mjs';
import { exportName, toCsv, reviewMarkdown, download, diagramSvg, svgToPng, standaloneHtml } from './export.mjs';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = () => (calm() ? 'auto' : 'smooth');

export const state = { plan: null, review: { comments: [], batches: [], revisions: [] }, choice: null, online: false, active: null, anchor: null, selAnchor: null, composing: null, jump: { open: false, q: '', act: 0 }, scroll: 0, spine: false, prev: new Map(), checked: new Map(), seen: new Set() };
export const hooks = {
  visual,
  afterSections: (root, mode) => {
    hydrateMermaid(root, mode);
    root.querySelectorAll('svg.dag.zoomable').forEach(attachPanZoom);
    addDiagramTools(root);
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

function markMotion() {
  const first = state.checked.size === 0 && state.seen.size === 0;
  for (const li of document.querySelectorAll('#sections [data-task]')) {
    const now = li.classList.contains('done');
    if (!first && state.checked.has(li.dataset.task) && state.checked.get(li.dataset.task) !== now) {
      li.classList.add('flip');
      setTimeout(() => li.classList.remove('flip'), 700);
    }
    state.checked.set(li.dataset.task, now);
  }
  for (const el of document.querySelectorAll('#rail-top .cmt[data-comment], #rail-top .cmt[data-revision], #rail-bottom .cmt[data-comment], #rail-bottom .cmt[data-revision]')) {
    const id = el.dataset.comment ?? el.dataset.revision;
    if (state.seen.has(id)) continue;
    state.seen.add(id);
    if (document.body.classList.contains('intro')) continue;
    el.classList.add('enter');
    el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
    setTimeout(() => el.classList.remove('enter'), 1200);
  }
}

function countUp(el, to) {
  if (!el || calm()) return;
  const t0 = performance.now(), dur = 1000;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = `${Math.round(to * (1 - (1 - k) ** 3))}%`;
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = '0%';
  requestAnimationFrame(step);
}

function flash(el) {
  if (!el || calm()) return;
  el.classList.remove('landed');
  void el.offsetWidth;
  el.classList.add('landed');
  setTimeout(() => el.classList.remove('landed'), 1300);
}

function trackActive() {
  const cards = [...document.querySelectorAll('#sections section[data-sec]:not(#intro):not(#graph)')];
  const passed = cards.filter(c => c.getBoundingClientRect().top <= 120);
  const atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
  const current = (atBottom && cards.at(-1)) || passed.at(-1) || cards[0];
  if (current) setActive(current.dataset.sec);
  const max = document.documentElement.scrollHeight - innerHeight;
  state.scroll = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  paintScroll();
}

function refreshPill() {
  const pill = document.querySelector('.pill');
  if (!pill || !state.plan) return;
  pill.outerHTML = renderPill({ sections: state.plan.model.sections, active: state.active, open: state.jump.open });
  paintScroll();
}

function paintScroll() {
  document.querySelector('.pill')?.style.setProperty('--scroll', state.scroll.toFixed(3));
  paintSpineFill();
}

function paintSpine() {
  const spine = $('spine');
  spine.hidden = !state.spine || !state.plan?.model.sections.length;
  if (spine.hidden) return;
  const { sections } = state.plan.model;
  const weights = sections.map(s => $(s.id)?.offsetHeight ?? 1);
  spine.innerHTML = renderSpine({ sections, weights, active: state.active });
  paintSpineFill();
}

function paintSpineFill() {
  if (!state.spine) return;
  const { sections } = state.plan?.model ?? { sections: [] };
  $('spine').querySelectorAll('.tick').forEach((tick, i) => {
    const r = $(sections[i]?.id)?.getBoundingClientRect();
    if (r) tick.firstElementChild.style.height = `${Math.round(Math.min(1, Math.max(0, (120 - r.top) / r.height)) * 100)}%`;
  });
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
  if (!state.plan) return;
  const swap = () => {
    refreshPill();
    paintSpine();
    paintScroll();
    if (state.jump.open) paintJump();
  };
  const label = document.querySelector('.pill .ptxt');
  if (calm() || !label) { swap(); return; }
  label.classList.add('swap');
  setTimeout(() => {
    swap();
    const next = document.querySelector('.pill .ptxt');
    next?.classList.add('swap');
    requestAnimationFrame(() => requestAnimationFrame(() => next?.classList.remove('swap')));
  }, 120);
}

const jumpMatches = () => filterSections(state.plan.model.sections, state.jump.q);

function paintJump() {
  const { sections } = state.plan.model;
  const matches = jumpMatches();
  state.jump.act = Math.min(state.jump.act, Math.max(0, matches.length - 1));
  const list = $('jump').querySelector('.jlist');
  list.innerHTML = renderJumpRows({ sections, active: state.active, matches, act: state.jump.act });
  list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
}

function openJump() {
  if (!state.plan) return;
  const matches = filterSections(state.plan.model.sections, '');
  state.jump = { open: true, q: '', act: Math.max(0, matches.findIndex(i => state.plan.model.sections[i].id === state.active)) };
  const panel = $('jump');
  panel.hidden = false;
  panel.querySelector('.jq').value = '';
  $('spine-toggle').checked = !!state.spine;
  paintJump();
  refreshPill();
  placeJump();
  panel.classList.remove('in');
  requestAnimationFrame(() => panel.classList.add('in'));
  panel.querySelector('.jq').focus();
}

function placeJump() {
  const pill = document.querySelector('.pill');
  if (!pill) return;
  const r = pill.getBoundingClientRect(), half = Math.min(340, innerWidth - 24) / 2;
  $('jump').style.left = `${Math.min(innerWidth - half - 12, Math.max(half + 12, r.left + r.width / 2))}px`;
}

function closeJump(returnFocus = true) {
  if (!state.jump.open) return;
  state.jump.open = false;
  $('jump').hidden = true;
  $('jump').classList.remove('in');
  refreshPill();
  if (returnFocus) document.querySelector('.pill')?.focus();
}

const toggleJump = () => (state.jump.open ? closeJump() : openJump());

function jumpTo(id) {
  closeJump();
  setActive(id);
  go(id);
}

$('jump').addEventListener('keydown', e => {
  const matches = jumpMatches();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    state.jump.act = Math.min(matches.length - 1, Math.max(0, state.jump.act + (e.key === 'ArrowDown' ? 1 : -1)));
    paintJump();
  } else if (e.key === 'Enter' && matches.length) {
    e.preventDefault();
    jumpTo(state.plan.model.sections[matches[state.jump.act]].id);
  }
});
$('spine-toggle').addEventListener('change', e => {
  state.spine = e.target.checked;
  remember('spine', state.spine ? '1' : '0');
  paintSpine();
});
addEventListener('resize', () => { if (state.spine) paintSpine(); if (state.jump.open) placeJump(); });
$('jump').querySelector('.jq').addEventListener('input', e => {
  state.jump.q = e.target.value;
  state.jump.act = 0;
  paintJump();
});

export function render() {
  if (!state.plan) return;
  state.choice ??= resolveChoice(state.plan.defaults);
  state.active ??= state.plan.model.sections[0]?.id ?? null;
  applyTheme(state.choice);
  document.title = state.plan.model.title || state.plan.file;
  setHTML($('strip'), renderStrip(state));
  paintScroll();
  setHTML($('hero'), renderHero(state));
  if (setHTML($('sections'), renderSections(state, hooks.visual))) {
    markChanged();
    hooks.afterSections($('sections'), document.documentElement.dataset.mode);
  }
  const rail = hooks.renderRail(state);
  setHTML($('rail-top'), rail.top);
  setHTML($('rail-bottom'), rail.bottom);
  markMotion();
  paintSpine();
  if (state.jump.open) paintJump();
}

function updateLive() {
  const el = $('age');
  if (el && state.plan && state.online) el.textContent = fmtAge(Date.now() - state.plan.changedAt);
}

export function setChoice(k, v) {
  document.documentElement.classList.add('theming');
  setTimeout(() => document.documentElement.classList.remove('theming'), 600);
  state.choice[k] = v;
  remember(k, v);
  $('sections')._html = null;
  render();
}

function go(id) {
  const el = $(id);
  el?.scrollIntoView({ behavior: smooth() });
  flash(el);
}

function jump(dir) {
  const ids = state.plan.model.sections.map(s => s.id);
  const next = ids[Math.min(ids.length - 1, Math.max(0, ids.indexOf(state.active) + dir))];
  go(next);
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

function toggleMenu(id) {
  document.querySelectorAll('.menu').forEach(m => { if (m.id !== id) m.hidden = true; });
  $(id).hidden = !$(id).hidden;
}

const fileName = () => state.plan.file;
const saved = name => toast(`Saved ${name}`);
const diagramHosts = root => [...root.querySelectorAll('.graph-card, .block:has(.arch), .block:has(.mermaid-block)')];

function addDiagramTools(root) {
  for (const host of diagramHosts(root)) {
    if (host.querySelector(':scope > .xtools')) continue;
    host.insertAdjacentHTML('afterbegin', '<div class="xtools"><button data-xport="svg" title="Download as SVG">SVG</button><button data-xport="png" title="Download as PNG">PNG</button></div>');
  }
}

async function exportDiagram(btn) {
  const host = btn.closest('.graph-card, .block');
  const svg = host.querySelector('svg:not(.xtools svg)');
  if (!svg) { toast('This diagram is not rendered yet'); return; }
  const hosts = diagramHosts(document.getElementById('sections'));
  const suffix = host.classList.contains('graph-card') ? 'graph' : `diagram-${hosts.filter(h => !h.classList.contains('graph-card')).indexOf(host) + 1}`;
  try {
    const out = diagramSvg(svg);
    if (btn.dataset.xport === 'png') {
      const name = exportName(fileName(), suffix, 'png');
      download(name, await svgToPng(out), 'image/png');
      saved(name);
    } else {
      const name = exportName(fileName(), suffix, 'svg');
      download(name, out.text, 'image/svg+xml');
      saved(name);
    }
  } catch (e) {
    toast(`Export failed: ${e.message}`);
  }
}

async function runExport(fmt) {
  const file = fileName(), plan = state.plan, review = state.review;
  try {
    if (fmt === 'pdf') { print(); return; }
    if (fmt === 'copy-md' || fmt === 'md') {
      const { text } = await api('GET', '/api/source');
      if (fmt === 'copy-md') { await navigator.clipboard.writeText(text); toast('Copied Markdown to the clipboard'); return; }
      download(exportName(file, '', 'md'), text, 'text/markdown;charset=utf-8');
      saved(exportName(file, '', 'md'));
      return;
    }
    const jobs = {
      html: async () => [exportName(file, '', 'html'), await standaloneHtml(file), 'text/html;charset=utf-8'],
      json: () => [exportName(file, 'plan', 'json'), JSON.stringify(plan.model, null, 2) + '\n', 'application/json'],
      csv: () => [exportName(file, 'tasks', 'csv'), '\uFEFF' + toCsv(plan.model), 'text/csv;charset=utf-8'],
      'review-md': () => [exportName(file, 'review', 'md'), reviewMarkdown(review, plan.model, file), 'text/markdown;charset=utf-8'],
      'review-json': () => [exportName(file, 'review', 'json'), JSON.stringify({ comments: review.comments, batches: review.batches, revisions: review.revisions }, null, 2) + '\n', 'application/json'],
    };
    const [name, data, mime] = await jobs[fmt]();
    download(name, data, mime);
    saved(name);
  } catch (e) {
    toast(`Export failed: ${e.message}`);
  }
}

let beforePrintMode = null;
addEventListener('beforeprint', () => {
  beforePrintMode = document.documentElement.dataset.mode;
  document.documentElement.dataset.mode = 'light';
});
addEventListener('afterprint', () => {
  if (beforePrintMode) document.documentElement.dataset.mode = beforePrintMode;
  beforePrintMode = null;
});

export const actions = {
  'jump-toggle': toggleJump,
  'theme-menu': () => toggleMenu('theme-menu'),
  'export-menu': () => toggleMenu('export-menu'),
  export: el => { $('export-menu').hidden = true; runExport(el.dataset.fmt); },
  'set-theme': el => setChoice('theme', el.dataset.themeId),
  mode: () => setChoice('mode', nextMode(state.choice.mode)),
  toggle: el => toggleTask(el.closest('[data-task]')),
};

document.addEventListener('click', e => {
  const xp = e.target.closest('[data-xport]');
  if (xp) { e.preventDefault(); exportDiagram(xp); return; }
  const actEl = e.target.closest('[data-act]');
  document.querySelectorAll('.menu').forEach(m => { if (!m.parentElement.contains(e.target)) m.hidden = true; });
  if (actEl && actions[actEl.dataset.act]) { e.preventDefault(); actions[actEl.dataset.act](actEl, e); return; }
  const goto = e.target.closest('[data-goto]');
  if (goto) { go(goto.dataset.goto); return; }
  const row = e.target.closest('#jump [data-jump]');
  if (row) { jumpTo(row.dataset.jump); return; }
  const tick = e.target.closest('#spine [data-jump]');
  if (tick) { setActive(tick.dataset.jump); go(tick.dataset.jump); return; }
  if (state.jump.open && !e.target.closest('#jump')) closeJump(false);
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleJump(); return; }
  if (e.key === 'Escape' && state.jump.open) { e.preventDefault(); closeJump(); return; }
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
  const params = new URLSearchParams(location.search);
  if (params.has('key')) {
    params.delete('key');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
  }
  try {
    state.plan = await api('GET', '/api/plan');
    state.review = await api('GET', '/api/review');
    state.online = true;
  } catch (e) {
    toast(`Could not load the plan: ${e.message}`);
  }
  state.spine = recall('spine') === '1';
  if (!calm()) document.body.classList.add('intro');
  render();
  document.querySelectorAll('#sections > section').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
  countUp(document.querySelector('.ring b'), parseInt(document.querySelector('.ring b')?.textContent ?? '0', 10));
  setTimeout(() => document.body.classList.remove('intro'), 1800);
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
  if (e.target.closest('[data-act], [data-goto], [data-xport], .rail, .strip')) return;
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
