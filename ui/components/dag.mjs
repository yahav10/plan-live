import { esc } from '../lib.mjs';

const W = 180, H = 56, GX = 70, GY = 22, PAD = 32;
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function layout(nodes, edges) {
  const depth = new Map(nodes.map(n => [n.key, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const [a, b] of edges) {
      if (a === b || !depth.has(a) || !depth.has(b)) continue;
      const d = depth.get(a) + 1;
      if (d > depth.get(b) && d < nodes.length) { depth.set(b, d); changed = true; }
    }
    if (!changed) break;
  }
  const cols = [];
  for (const n of nodes) (cols[depth.get(n.key)] ??= []).push(n);
  const pos = new Map();
  const dense = cols.filter(Boolean);
  dense.forEach((col, c) => col.forEach((n, r) => pos.set(n.key, { x: c * (W + GX), y: r * (H + GY), w: W, h: H })));
  const width = Math.max(1, dense.length) * (W + GX) - GX;
  const height = Math.max(1, ...dense.map(c => c.length)) * (H + GY) - GY;
  return { pos, width, height };
}

const stateOf = (n, active) => {
  if (!n.progress) return '';
  if (n.progress.total && n.progress.done === n.progress.total) return 'done';
  return n.key === active ? 'doing' : '';
};

export function renderDag(nodes, edges, { active, zoomable = false } = {}) {
  const { pos, width, height } = layout(nodes, edges);
  const edge = ([a, b, label]) => {
    const s = pos.get(a), t = pos.get(b);
    if (a === b || !s || !t) return '';
    const x1 = s.x + s.w, y1 = s.y + s.h / 2, x2 = t.x, y2 = t.y + t.h / 2, mx = (x1 + x2) / 2;
    const path = `<path class="edge${b === active ? ' flow' : ''}"${b === active ? '' : ' pathLength="1"'} data-from="${esc(a)}" data-to="${esc(b)}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
    return label ? `${path}<text class="elabel" x="${mx}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">${esc(label)}</text>` : path;
  };
  const node = n => {
    const p = pos.get(n.key);
    const title = n.sectionId ? `${n.key} · ${n.label.replace(/^(?:Task\s+|T)\d+\s*[:.—-]?\s*/i, '')}` : n.label;
    const sub = n.progress ? (n.progress.total ? `${n.progress.done}/${n.progress.total}` : '') : '';
    return `<g class="node ${stateOf(n, active)}" data-node="${esc(n.key)}"${n.sectionId ? ` data-goto="${esc(n.sectionId)}"` : ''}>`
      + `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10"/>`
      + `<text x="${p.x + 14}" y="${p.y + (sub ? 24 : 33)}">${esc(trunc(title, 24))}</text>`
      + `${sub ? `<text class="m" x="${p.x + 14}" y="${p.y + 42}">${esc(sub)}</text>` : ''}<title>${esc(n.label)}</title></g>`;
  };
  return `<svg class="dag${zoomable ? ' zoomable' : ''}" viewBox="${-PAD} ${-PAD} ${width + 2 * PAD} ${height + 2 * PAD}" role="img">`
    + `${edges.map(edge).join('')}${nodes.map(node).join('')}</svg>`;
}

export function attachPanZoom(svg) {
  if (svg._pz) return;
  svg._pz = true;
  let [x, y, w, h] = svg.getAttribute('viewBox').split(' ').map(Number), drag = null;
  const set = () => svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const k = e.deltaY > 0 ? 1.1 : 0.9, r = svg.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    x += w * (1 - k) * fx; y += h * (1 - k) * fy; w *= k; h *= k;
    set();
  }, { passive: false });
  svg.addEventListener('pointerdown', e => { drag = { cx: e.clientX, cy: e.clientY, x, y }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    x = drag.x - ((e.clientX - drag.cx) * w) / r.width;
    y = drag.y - ((e.clientY - drag.cy) * h) / r.height;
    set();
  });
  svg.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('click', e => {
    const key = e.target.closest('[data-node]')?.dataset.node;
    svg.classList.toggle('focus', !!key);
    svg.querySelectorAll('.edge').forEach(p => p.classList.toggle('hl', !!key && (p.dataset.from === key || p.dataset.to === key)));
  });
}
