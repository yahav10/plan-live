import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../server/parse.mjs';
import { taskStatuses, summary } from '../../ui/components/status.mjs';
import { renderHero } from '../../ui/components/hero.mjs';
import { renderSections } from '../../ui/components/sections.mjs';

const PLAN = `# P

### Task 1: A
- [x] a
- [x] b

### Task 2: B
Depends on Task 1.
- [x] a
- [ ] b

### Task 3: C
Depends on Task 2.
- [ ] a

### Task 4: D
- [ ] a

### Task 5: E
Depends on Task 3, 4.
- [ ] a
`;
const model = parse(PLAN);
const st = key => taskStatuses(model).byId.get(model.graph.nodes.find(n => n.key === key).sectionId);

test('a task is done, in progress, blocked or to do, in that order of precedence', () => {
  assert.equal(st('T1').status, 'done');
  assert.equal(st('T2').status, 'progress');
  assert.equal(st('T3').status, 'blocked');
  assert.equal(st('T4').status, 'todo');
  assert.equal(st('T5').status, 'blocked');
});

test('the task holding the next unticked step is in progress even with nothing ticked yet', () => {
  const m = parse(PLAN.replace('- [ ] b', '- [x] b'));
  const t3 = taskStatuses(m).byId.get(m.graph.nodes.find(n => n.key === 'T3').sectionId);
  assert.equal(t3.status, 'progress');
  assert.equal(taskStatuses(m).now.key, 'T3');
  const t4 = taskStatuses(m).byId.get(m.graph.nodes.find(n => n.key === 'T4').sectionId);
  assert.equal(t4.status, 'todo', 'the next one in line is not in progress until it is reached');
});

test('a task with no steps is never done, and a plan with every task done has no current task', () => {
  const none = parse('### Task 1: A\nNo steps here.\n');
  assert.equal(taskStatuses(none).byId.get(none.graph.nodes[0].sectionId).status, 'progress');
  const all = parse('### Task 1: A\n- [x] a\n### Task 2: B\nAfter T1.\n- [x] b\n');
  assert.equal(taskStatuses(all).now, null);
});

test('each task lists what it needs and whether that is finished', () => {
  const needs = st('T5').needs;
  assert.deepEqual(needs.map(n => [n.key, n.done]), [['T3', false], ['T4', false]]);
  assert.equal(st('T2').needs[0].done, true);
  assert.equal(st('T2').needs[0].sectionId, model.graph.nodes.find(n => n.key === 'T1').sectionId);
});

test('the summary groups task numbers by status and names the current task', () => {
  const s = summary(model);
  assert.deepEqual(s.tiles, { done: ['T1'], progress: ['T2'], blocked: ['T3', 'T5'], todo: ['T4'] });
  assert.equal(s.now.key, 'T2');
  assert.equal(s.pct, 43);
  assert.deepEqual([s.steps.done, s.steps.total], [3, 7]);
});

const state = (m, comments = []) => ({ plan: { model: m, file: 'p.md', path: '/p.md' }, review: { comments, batches: [], revisions: [] } });

test('the overview shows a progress bar, four tiles with task numbers, and the current task with a Focus button', () => {
  const html = renderHero(state(model));
  assert.ok(!html.includes('class="ring"'));
  assert.match(html, /<b class="ov-pct">43%<\/b>/);
  assert.match(html, /style="--p:43"/);
  assert.match(html, /3 of 7 steps/);
  for (const [s, label, keys] of [['done', 'Done', 'T1'], ['progress', 'In progress', 'T2'], ['blocked', 'Blocked', 'T3, T5'], ['todo', 'To do', 'T4']]) {
    assert.match(html, new RegExp(`data-act="tile" data-status="${s}"[^>]*>\\s*<b>\\d+</b><span>${label}</span><small>${keys}</small>`));
  }
  assert.match(html, /<span class="now-l">Now<\/span><button class="link now-name" data-goto="task-2-b">T2 · B<\/button><button class="btn" data-act="focus">Focus<\/button>/);
});

test('with no tasks there are no tiles, and with everything done there is no Now bar', () => {
  assert.ok(!renderHero(state(parse('## A\n- [ ] x\n'))).includes('data-act="tile"'));
  assert.ok(!renderHero(state(parse('## A\n- [ ] x\n'))).includes('class="now"'));
  assert.ok(!renderHero(state(parse('### Task 1: A\n- [x] a\n'))).includes('class="now"'));
  assert.ok(!renderHero(state(parse('# Only a title\n'))).includes('class="overview"'));
});

test('a long list of task numbers in a tile is cut with a count', () => {
  const m = parse(Array.from({ length: 9 }, (_, i) => `### Task ${i + 1}: T\n- [ ] a\n`).join('\n'));
  assert.match(renderHero(state(m)), /<small>T2, T3, T4, T5, T6, T7 \+2<\/small>/);
});

test('a task card shows its status, its count, what it needs and a progress bar; other cards do not', () => {
  const html = renderSections(state(model));
  const card = id => html.match(new RegExp(`<section class="card[^"]*" id="${id}"[\\s\\S]*?</section>`))[0];
  const t5 = card('task-5-e');
  assert.match(t5, /<span class="st st-blocked">Blocked<\/span>/);
  assert.match(t5, /<span class="needs-l">Needs<\/span><button class="need" data-goto="task-3-c">T3<\/button><button class="need" data-goto="task-4-d">T4<\/button>/);
  assert.match(t5, /<span class="h-count">0\/1<\/span>/);
  const t2 = card('task-2-b');
  assert.match(t2, /<button class="need ok" data-goto="task-1-a">T1<\/button>/);
  assert.match(t2, /class="tm-bar st-progress" style="--p:50"/);
  assert.match(card('task-1-a'), /<span class="st st-done">Done<\/span>/);
  assert.match(card('task-1-a'), /<span class="h-count ok">2\/2<\/span>/);
});
