import { esc } from '../lib.mjs';
import { resist, releaseVelocity, decayed } from './momentum.mjs';

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
  const home = svg.getAttribute('viewBox').split(' ').map(Number);
  let [x, y, w, h] = home, drag = null, raf = 0, swallow = false;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const set = () => svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  const bounds = () => ({ x: [home[0] - w / 2, home[0] + home[2] - w / 2], y: [home[1] - h / 2, home[1] + home[3] - h / 2] });
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const settle = (vx, vy) => {
    stop();
    let last = performance.now();
    const step = now => {
      const dt = Math.min(now - last, 50); last = now;
      const b = bounds();
      [vx, vy] = [decayed(vx, dt), decayed(vy, dt)];
      x += (vx * dt) / 1000; y += (vy * dt) / 1000;
      const pull = () => 1 - Math.exp(-dt / 90);
      if (x < b.x[0] || x > b.x[1]) { x += (Math.min(Math.max(x, b.x[0]), b.x[1]) - x) * pull(); vx = 0; }
      if (y < b.y[0] || y > b.y[1]) { y += (Math.min(Math.max(y, b.y[0]), b.y[1]) - y) * pull(); vy = 0; }
      set();
      const inside = x >= b.x[0] - .5 && x <= b.x[1] + .5 && y >= b.y[0] - .5 && y <= b.y[1] + .5;
      raf = Math.hypot(vx, vy) < 2 && inside ? 0 : requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    stop();
    const k = Math.min(Math.max(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0016), 0.8), 1.25);
    const nw = Math.min(Math.max(w * k, home[2] * 0.25), home[2] * 3), f = nw / w;
    const r = svg.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    x += w * (1 - f) * fx; y += h * (1 - f) * fy; w *= f; h *= f;
    set();
  }, { passive: false });
  svg.addEventListener('pointerdown', e => {
    stop();
    drag = { cx: e.clientX, cy: e.clientY, x, y, moved: false, hist: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return;
    if (!drag.moved) svg.setPointerCapture(e.pointerId);
    drag.moved = true;
    drag.hist.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    drag.hist = drag.hist.slice(-8);
    const r = svg.getBoundingClientRect(), b = bounds();
    x = resist(drag.x - ((e.clientX - drag.cx) * w) / r.width, b.x[0], b.x[1], w);
    y = resist(drag.y - ((e.clientY - drag.cy) * h) / r.height, b.y[0], b.y[1], h);
    set();
  });
  const release = e => {
    if (!drag) return;
    const { moved, hist } = drag;
    drag = null;
    if (!moved) return;
    swallow = true;
    setTimeout(() => { swallow = false; }, 0);
    const r = svg.getBoundingClientRect(), v = releaseVelocity(hist, e.timeStamp);
    if (calm()) { const b = bounds(); x = Math.min(Math.max(x, b.x[0]), b.x[1]); y = Math.min(Math.max(y, b.y[0]), b.y[1]); set(); return; }
    settle((-v.x * w) / r.width, (-v.y * h) / r.height);
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('click', e => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  svg.addEventListener('click', e => {
    const key = e.target.closest('[data-node]')?.dataset.node;
    svg.classList.toggle('focus', !!key);
    svg.querySelectorAll('.edge').forEach(p => p.classList.toggle('hl', !!key && (p.dataset.from === key || p.dataset.to === key)));
  });
}
