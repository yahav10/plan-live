import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, renderDag } from '../../ui/components/dag.mjs';
import { visual, renderApproaches } from '../../ui/components/visual.mjs';
import { parse } from '../../server/parse.mjs';

const model = parse(readFileSync(new URL('../fixtures/mini.md', import.meta.url), 'utf8'));

test('layout puts each node one column right of its deepest dependency', () => {
  const { pos } = layout(model.graph.nodes, model.graph.edges);
  assert.ok(pos.get('T1').x < pos.get('T2').x);
  assert.ok(pos.get('T2').x < pos.get('T3').x);
});

test('layout terminates on cycles', () => {
  const nodes = [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }];
  const { pos } = layout(nodes, [['A', 'B'], ['B', 'A']]);
  assert.equal(pos.size, 2);
});

test('renderDag marks the active node, animates its incoming edges, skips self-loops', () => {
  const svg = renderDag(model.graph.nodes, [...model.graph.edges, ['T2', 'T2']], { active: 'T2' });
  assert.match(svg, /<g class="node doing" data-node="T2" data-goto="task-2-server"/);
  assert.match(svg, /class="edge flow" data-from="T1" data-to="T2"/);
  assert.ok(!svg.includes('data-from="T2" data-to="T2"'));
  assert.match(svg, /^<svg class="dag"/);
});

test('graph card renders only when edges exist', () => {
  assert.match(visual.graph(model), /class="card graph-card"/);
  assert.equal(visual.graph(parse('## A\n')), '');
});

test('approaches render a recommended ribbon and an effort meter', () => {
  const html = renderApproaches(model.sections.find(s => s.short === 'Options').blocks[0].items);
  assert.match(html, /class="approach pick"/);
  assert.match(html, /Recommended/);
  assert.equal((html.match(/<i class="on">/g) ?? []).length, 3);
});

test('visual handles architecture and mermaid blocks, ignores others', () => {
  const wrap = h => `<div>${h}</div>`;
  assert.match(visual({ type: 'architecture', nodes: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }], edges: [['A', 'B', 'x']] }, wrap), /class="dag zoomable"/);
  assert.match(visual({ type: 'mermaid', code: 'graph TD; A-->B' }, wrap), /class="mermaid-block" data-code="graph TD; A--&gt;B"/);
  assert.equal(visual({ type: 'paragraph', text: 'x' }, wrap), undefined);
});

test('the viewBox leaves room for the node glow on every side', () => {
  const svg = renderDag(model.graph.nodes, model.graph.edges, { active: 'T2' });
  const [vx, vy, vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const rects = [...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
  const GLOW = 28;
  assert.ok(Math.min(...rects.map(r => r[0])) - vx >= GLOW);
  assert.ok(Math.min(...rects.map(r => r[1])) - vy >= GLOW);
  assert.ok(vx + vw - Math.max(...rects.map(r => r[0] + r[2])) >= GLOW);
  assert.ok(vy + vh - Math.max(...rects.map(r => r[1] + r[3])) >= GLOW);
});

test('layout never leaves empty columns, so cyclic graphs still get a finite size', () => {
  const nodes = ['Browser', 'Web', 'API', 'Vault', 'Payments'].map(key => ({ key, label: key }));
  const edges = [['Browser', 'Web'], ['Web', 'API'], ['API', 'Vault'], ['API', 'Payments'], ['Payments', 'API']];
  const { width, height, pos } = layout(nodes, edges);
  assert.ok(Number.isFinite(width) && Number.isFinite(height));
  const cols = [...new Set([...pos.values()].map(p => p.x))].sort((a, b) => a - b);
  cols.forEach((x, i) => assert.equal(x, i * 250));
  assert.ok(!renderDag(nodes, edges).includes('NaN'));
});

const mk = keys => keys.map(key => ({ key, label: key }));
const crossings = (pos, edges) => {
  let n = 0;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const [a, b] = edges[i], [c, d] = edges[j];
    if (pos.get(a).x !== pos.get(c).x || pos.get(b).x !== pos.get(d).x) continue;
    if ((pos.get(a).y - pos.get(c).y) * (pos.get(b).y - pos.get(d).y) < 0) n++;
  }
  return n;
};

test('every edge ends in an arrowhead that follows its highlight state, and self-loops get none', () => {
  const svg = renderDag(model.graph.nodes, [...model.graph.edges, ['T2', 'T2']], { active: 'T2' });
  const heads = [...svg.matchAll(/<path class="head([^"]*)" data-from="(\w+)" data-to="(\w+)" d="([^"]+)"/g)];
  assert.equal(heads.length, model.graph.edges.length);
  assert.ok(heads.every(m => /^M[\d. -]+L[\d. -]+L[\d. -]+Z$/.test(m[4])));
  assert.ok(heads.find(m => m[2] === 'T1' && m[3] === 'T2')[1].includes('flow'), 'the active edge head flows too');
});

test('long titles wrap onto two lines instead of being cut off, and only the second line is ever shortened', () => {
  const nodes = [{ key: 'T1', label: 'Task 1: Wire the checkout form to the payments API', sectionId: 's', progress: { done: 1, total: 2 } },
    { key: 'T2', label: 'Task 2: Short', sectionId: 's2', progress: { done: 0, total: 1 } },
    { key: 'T3', label: 'Task 3: ' + 'Extraordinarily '.repeat(6), sectionId: 's3', progress: { done: 0, total: 1 } }];
  const svg = renderDag(nodes, []);
  const lines = key => [...svg.match(new RegExp(`data-node="${key}"[\\s\\S]*?</g>`))[0].matchAll(/<text class="t"[^>]*>([^<]*)</g)].map(m => m[1]);
  assert.equal(lines('T1').length, 2);
  assert.ok(lines('T1').every(l => l.length <= 22));
  assert.ok(lines('T1').join(' ').includes('Wire the'));
  assert.equal(lines('T2').length, 1);
  assert.equal(lines('T3').length, 2);
  assert.ok(lines('T3')[1].endsWith('…'));
  assert.ok(!lines('T1')[0].endsWith('…'));
});

test('a task box carries a progress bar sized by its done share, green when finished', () => {
  const nodes = [{ key: 'T1', label: 'Task 1: A', sectionId: 'a', progress: { done: 1, total: 4 } }, { key: 'T2', label: 'Task 2: B', sectionId: 'b', progress: { done: 3, total: 3 } }, { key: 'T3', label: 'Task 3: C', sectionId: 'c', progress: { done: 0, total: 0 } }];
  const svg = renderDag(nodes, []);
  const bar = key => svg.match(new RegExp(`data-node="${key}"[\\s\\S]*?</g>`))[0].match(/<rect class="bar-bg" [^>]*width="([\d.]+)"[^>]*\/><rect class="bar[^"]*" [^>]*width="([\d.]+)"/);
  const t1 = bar('T1'), t2 = bar('T2');
  assert.ok(Math.abs(Number(t1[2]) / Number(t1[1]) - 0.25) < 0.01);
  assert.equal(Number(t2[2]), Number(t2[1]));
  assert.ok(!/class="bar-bg"/.test(svg.match(/data-node="T3"[\s\S]*?<\/g>/)[0]), 'no steps, no bar');
});

test('boxes are reordered inside a column so dependency lines cross less', () => {
  const nodes = mk(['A', 'B', 'X', 'Y']);
  const edges = [['A', 'Y'], ['B', 'X']];
  const { pos } = layout(nodes, edges);
  assert.equal(crossings(pos, edges), 0);
  assert.ok(pos.get('Y').y === pos.get('A').y && pos.get('X').y === pos.get('B').y);
  const wide = mk(['a', 'b', 'c', 'd', 'e', 'f']);
  const e2 = [['a', 'f'], ['b', 'e'], ['c', 'd']];
  assert.equal(crossings(layout(wide, e2).pos, e2), 0);
});

test('an edge that skips a column runs above every box instead of behind them', () => {
  const nodes = mk(['A', 'B', 'C']);
  const edges = [['A', 'B'], ['B', 'C'], ['A', 'C']];
  const svg = renderDag(nodes, edges);
  const { pos } = layout(nodes, edges);
  const topY = Math.min(...[...pos.values()].map(p => p.y));
  const d = ([a, b]) => svg.match(new RegExp(`class="edge[^"]*"[^>]*data-from="${a}" data-to="${b}" d="([^"]+)"`))[1];
  const ys = p => [...p.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(m => Number(m[2]));
  assert.ok(Math.min(...ys(d(['A', 'C']))) < topY, 'the long edge has a lane above the boxes');
  assert.ok(Math.min(...ys(d(['A', 'B']))) >= topY, 'a neighbour edge stays between the boxes');
  const [, vy] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(vy < topY - 32, 'the viewBox grows upward to hold the lane');
});

test('a long edge label gets a column gap wide enough to hold it', () => {
  const nodes = mk(['A', 'B']);
  const near = layout(nodes, [['A', 'B', 'x']]).pos;
  const far = layout(nodes, [['A', 'B', 'webhook callback to vendor']]).pos;
  assert.equal(near.get('B').x - near.get('A').x, 250);
  assert.ok(far.get('B').x - far.get('A').x >= 180 + 26 * 6.6);
});

test('the dependency graph keeps its text readable by scrolling instead of shrinking', () => {
  const nodes = Array.from({ length: 8 }, (_, i) => ({ key: `T${i + 1}`, label: `Task ${i + 1}: Step`, sectionId: `s${i}`, progress: { done: 0, total: 1 } }));
  const edges = nodes.slice(1).map((n, i) => [`T${i + 1}`, n.key]);
  const svg = renderDag(nodes, edges);
  const [, , vw] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const min = Number(svg.match(/style="min-width:(\d+)px"/)[1]);
  assert.ok(min >= vw * 0.84 && min <= vw * 0.86);
  assert.ok(!/min-width/.test(renderDag(nodes, edges, { zoomable: true })), 'the zoomable diagram scales instead');
});
