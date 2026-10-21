import { esc } from '../lib.mjs';
import { resist, releaseVelocity, decayed } from './momentum.mjs';

const W = 180, H = 66, GX = 70, GY = 22, PAD = 32, CHAR = 6.6, LINE = 21, BAR_W = 118;
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Greedy word wrap onto at most two lines; only the second line is ever shortened.
export function wrapTitle(title, n = LINE) {
  const words = String(title).split(/\s+/).filter(Boolean), lines = [''];
  for (let w of words) {
    while (w.length > n) { if (lines.at(-1)) lines.push(''); lines[lines.length - 1] = w.slice(0, n); w = w.slice(n); if (lines.length >= 2 && w) { lines[1] = trunc(lines[1] + w, n); w = ''; } }
    if (!w) continue;
    const cur = lines.at(-1);
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= n) lines[lines.length - 1] = cur + ' ' + w;
    else if (lines.length < 2) lines.push(w);
    else lines[1] = trunc(cur + ' ' + w, n);
  }
  return lines.filter(Boolean).length ? lines.filter(Boolean) : [''];
}

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
  const dense = cols.filter(Boolean);
  const colOf = new Map(dense.flatMap((col, c) => col.map(n => [n.key, c])));
  const rows = new Map(dense.flatMap(col => col.map((n, r) => [n.key, r])));
  const preds = new Map(nodes.map(n => [n.key, []])), succs = new Map(nodes.map(n => [n.key, []]));
  for (const [a, b] of edges) if (a !== b && colOf.has(a) && colOf.has(b)) { preds.get(b).push(a); succs.get(a).push(b); }
  const bary = (n, nb) => { const ns = nb.get(n.key); return ns.length ? ns.reduce((t, k) => t + rows.get(k), 0) / ns.length : rows.get(n.key); };
  const order = (col, nb) => {
    col.map((n, i) => ({ n, b: bary(n, nb), i })).sort((p, q) => p.b - q.b || p.i - q.i).forEach(({ n }, r) => { rows.set(n.key, r); });
    col.sort((p, q) => rows.get(p.key) - rows.get(q.key));
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let c = 1; c < dense.length; c++) order(dense[c], preds);
    for (let c = dense.length - 2; c >= 0; c--) order(dense[c], succs);
  }
  const need = dense.map(() => GX);
  for (const [a, b, label] of edges) {
    if (a === b || !label || !colOf.has(a) || !colOf.has(b) || colOf.get(b) - colOf.get(a) !== 1) continue;
    need[colOf.get(a)] = Math.max(need[colOf.get(a)], Math.ceil(String(label).length * CHAR + 26));
  }
  const xs = []; let x = 0;
  dense.forEach((_, c) => { xs.push(x); x += W + need[c]; });
  const pos = new Map();
  dense.forEach((col, c) => col.forEach((n, r) => pos.set(n.key, { x: xs[c], y: r * (H + GY), w: W, h: H })));
  const lanes = new Map();
  edges.forEach(([a, b], i) => { if (a !== b && colOf.has(a) && colOf.has(b) && colOf.get(b) - colOf.get(a) > 1) lanes.set(i, lanes.size); });
  const width = Math.max(W, x - (need.at(-1) ?? GX));
  const height = Math.max(1, ...dense.map(c => c.length)) * (H + GY) - GY;
  return { pos, width, height, lanes, top: lanes.size ? 12 + lanes.size * 10 : 0 };
}

const stateOf = (n, active) => {
  if (!n.progress) return '';
  if (n.progress.total && n.progress.done === n.progress.total) return 'done';
  return n.key === active ? 'doing' : '';
};

export function renderDag(nodes, edges, { active, zoomable = false } = {}) {
  const { pos, width, height, lanes, top } = layout(nodes, edges);
  const edge = ([a, b, label], i) => {
    const s = pos.get(a), t = pos.get(b);
    if (a === b || !s || !t) return '';
    const x1 = s.x + s.w, y1 = s.y + s.h / 2, x2 = t.x - 1, y2 = t.y + t.h / 2, mx = (x1 + x2) / 2;
    const flow = b === active ? ' flow' : '';
    const ids = `data-from="${esc(a)}" data-to="${esc(b)}"`;
    const lane = lanes.get(i);
    let d, lx, ly;
    if (lane === undefined) {
      d = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
      lx = mx; ly = (y1 + y2) / 2 - 6;
    } else {
      const yl = -(10 + lane * 10);
      d = `M${x1} ${y1} C${x1 + 28} ${y1} ${x1 + 28} ${yl} ${x1 + 56} ${yl} L${x2 - 56} ${yl} C${x2 - 28} ${yl} ${x2 - 28} ${y2} ${x2} ${y2}`;
      lx = mx; ly = yl - 5;
    }
    const path = `<path class="edge${flow}"${flow ? '' : ' pathLength="1"'} ${ids} d="${d}"/>`
      + `<path class="head${flow}" ${ids} d="M${x2 - 9} ${y2 - 5} L${x2} ${y2} L${x2 - 9} ${y2 + 5} Z"/>`;
    return label ? `${path}<text class="elabel" x="${lx}" y="${ly}" text-anchor="middle">${esc(label)}</text>` : path;
  };
  const node = n => {
    const p = pos.get(n.key);
    const title = n.sectionId ? `${n.key} · ${n.label.replace(/^(?:Task\s+|T)\d+\s*[:.—-]?\s*/i, '')}` : n.label;
    const lines = wrapTitle(title);
    const prog = n.progress?.total ? n.progress : null;
    const base = prog ? (lines.length === 2 ? 22 : 27) : (lines.length === 2 ? H / 2 - 4 : H / 2 + 5);
    const text = lines.map((l, i) => `<text class="t" x="${p.x + 14}" y="${p.y + base + i * 16}">${esc(l)}</text>`).join('');
    const bar = prog
      ? `<rect class="bar-bg" x="${p.x + 14}" y="${p.y + H - 18}" width="${BAR_W}" height="4" rx="2"/>`
        + `<rect class="bar${prog.done === prog.total ? ' ok' : ''}" x="${p.x + 14}" y="${p.y + H - 18}" width="${+(BAR_W * prog.done / prog.total).toFixed(2)}" height="4" rx="2"/>`
        + `<text class="m" x="${p.x + W - 14}" y="${p.y + H - 13}" text-anchor="end">${prog.done}/${prog.total}</text>`
      : '';
    return `<g class="node ${stateOf(n, active)}" data-node="${esc(n.key)}"${n.sectionId ? ` data-goto="${esc(n.sectionId)}"` : ''}>`
      + `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10"/>${text}${bar}<title>${esc(n.label)}</title></g>`;
  };
  const vw = width + 2 * PAD, vh = height + 2 * PAD + top;
  const style = zoomable ? '' : ` style="min-width:${Math.round(vw * 0.85)}px"`;
  return `<svg class="dag${zoomable ? ' zoomable' : ''}" viewBox="${-PAD} ${-PAD - top} ${vw} ${vh}" role="img"${style}>`
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
    svg.querySelectorAll('.edge, .head').forEach(p => p.classList.toggle('hl', !!key && (p.dataset.from === key || p.dataset.to === key)));
  });
}
