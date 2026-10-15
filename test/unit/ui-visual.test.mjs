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
