import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHeading, filterSections, renderPill, renderJumpRows, renderSpine } from '../../ui/components/jump.mjs';

const sec = (id, heading, done = 0, total = 0) => ({ id, heading, progress: { done, total } });
const secs = [sec('goal', '1. Goal', 3, 3), sec('scope', '2. Scope', 1, 4), sec('risks', '12. Risks')];

test('numbered headings keep their number and drop it from the title', () => {
  assert.deepEqual(parseHeading('1. Goal', 0), { n: 1, title: 'Goal', label: '1' });
  assert.deepEqual(parseHeading('10) Rollout plan', 9), { n: 10, title: 'Rollout plan', label: '10' });
  assert.deepEqual(parseHeading('Architecture', 5), { n: 6, title: 'Architecture', label: '6' });
  assert.deepEqual(parseHeading('7.', 6), { n: 7, title: '7.', label: '7' });
});

test('task headings use the task number as T-label, like the dependency graph', () => {
  assert.deepEqual(parseHeading('Task 2: Checkout API', 3), { n: 2, title: 'Checkout API', label: 'T2' });
  assert.deepEqual(parseHeading('Task 12 - Wire hooks', 14), { n: 12, title: 'Wire hooks', label: 'T12' });
  assert.deepEqual(parseHeading('Task 5', 6), { n: 5, title: 'Task 5', label: 'T5' });
});

test('filter matches title text or the section number', () => {
  assert.deepEqual(filterSections(secs, 'sc'), [1]);
  assert.deepEqual(filterSections(secs, '12'), [2]);
  assert.deepEqual(filterSections(secs, ''), [0, 1, 2]);
  assert.deepEqual(filterSections(secs, '  GOAL '), [0]);
  assert.deepEqual(filterSections(secs, 'zzz'), []);
  const tasks = [sec('a', 'Goals'), sec('b', 'Task 1: Parser'), sec('c', 'Task 2: Server')];
  assert.deepEqual(filterSections(tasks, 'task'), [1, 2]);
  assert.deepEqual(filterSections(tasks, 't2'), [2]);
  assert.deepEqual(filterSections(tasks, 'parser'), [1]);
});

test('pill shows number, title and progress, without doubling the number', () => {
  const html = renderPill({ sections: secs, active: 'scope', progress: 0.5 });
  assert.match(html, /2 · Scope/);
  assert.match(html, /1\/4/);
  assert.ok(!/2 · 2\./.test(html));
  assert.match(html, /aria-label="Jump to section\. Now in 2\. Scope"/);
});

test('pill labels a task section with its T-number and title', () => {
  const html = renderPill({ sections: [sec('a', 'Goals'), sec('t2', 'Task 2: Checkout API', 1, 3)], active: 't2', progress: 0 });
  assert.match(html, /T2 · Checkout API/);
  assert.match(html, /aria-label="Jump to section\. Now in T2\. Checkout API"/);
});

test('pill renders safely with no sections and escapes titles', () => {
  assert.doesNotThrow(() => renderPill({ sections: [], active: null, progress: 0 }));
  assert.match(renderPill({ sections: [], active: null, progress: 0 }), /Sections/);
  const html = renderPill({ sections: [sec('x', '1. <img src=x onerror=alert(1)>')], active: 'x', progress: 0 });
  assert.ok(!html.includes('<img'));
});

test('rows mark done sections with a check and the active and highlighted rows', () => {
  const html = renderJumpRows({ sections: secs, active: 'scope', matches: [0, 1, 2], act: 2 });
  assert.match(html, /data-jump="goal"[^>]*>[\s\S]*?class="ck"/);
  assert.match(html, /data-jump="scope"[^>]*aria-current="true"/);
  assert.match(html, /class="jrow act"[^>]*data-jump="risks"/);
});

test('rows explain an empty filter', () => {
  assert.match(renderJumpRows({ sections: secs, active: 'goal', matches: [], act: 0 }), /No section matches/);
});

test('spine has one labelled tick per section sized by weight', () => {
  const html = renderSpine({ sections: secs, weights: [100, 300, 100], active: 'scope' });
  assert.equal((html.match(/class="tick/g) ?? []).length, 3);
  assert.match(html, /aria-label="2\. Scope"/);
  assert.match(html, /class="tick cur"[^>]*data-jump="scope"/);
  assert.match(html, /style="flex:300 1 0"/);
});
