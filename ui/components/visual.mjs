import { esc, inline } from '../lib.mjs';
import { renderDag } from './dag.mjs';

const EFFORT = { S: 1, M: 2, L: 3 };

export function renderApproaches(items) {
  return `<div class="approaches">${items.map(a => `<div class="approach${a.pick ? ' pick' : ''}">`
    + `${a.pick ? '<span class="ribbon">Recommended</span>' : ''}<h4>${inline(a.name)}</h4>`
    + `${a.effort ? `<div class="effort" title="Effort ${a.effort}">${[1, 2, 3].map(i => `<i class="${i <= EFFORT[a.effort] ? 'on' : ''}"></i>`).join('')}<span>${a.effort}</span></div>` : ''}`
    + `<ul class="pros">${a.pros.map(p => `<li>${inline(p)}</li>`).join('')}</ul>`
    + `<ul class="cons">${a.cons.map(c => `<li>${inline(c)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}

export function visual(b, wrap) {
  if (b.type === 'approaches') return wrap(renderApproaches(b.items));
  if (b.type === 'architecture') return wrap(`<div class="arch">${renderDag(b.nodes, b.edges, { zoomable: true })}<div class="arch-hint">Scroll to zoom · drag to pan · click a box to trace it</div></div>`);
  if (b.type === 'mermaid') return wrap(`<div class="mermaid-block" data-code="${esc(b.code)}"></div>`);
  return undefined;
}

visual.graph = model => {
  if (!model.graph.edges.length) return '';
  const firstOpen = model.tasks.find(t => !t.checked);
  const active = model.graph.nodes.find(n => n.sectionId === firstOpen?.sectionId)?.key;
  return `<section class="card graph-card" id="graph" data-sec="graph"><h2 data-n="◇">Dependency graph</h2>`
    + `<div class="sub">From “depends on / after / blocked by” in the plan. Click a box to jump to it.</div><div class="dag-scroll">${renderDag(model.graph.nodes, model.graph.edges, { active })}</div></section>`;
};
