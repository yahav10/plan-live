import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../server/parse.mjs';
import { renderFocus, focusTarget } from '../../ui/components/focus.mjs';
import { SHORTCUTS } from '../../ui/components/keys.mjs';

const model = parse(`# P
## Goals
- [ ] goal step
### Task 1: A
- [x] a1
- [x] a2
### Task 2: B <i>x</i>
Depends on Task 1.
- [x] b1
- [ ] b2
- [ ] b3
### Task 3: C
After T2.
- [ ] c1
`);
const sid = k => model.graph.nodes.find(n => n.key === k).sectionId;
const state = (focus = {}) => ({ plan: { model, file: 'p.md' }, review: { comments: [] }, focus: { on: true, task: null, ...focus } });

test('the focus target follows the current task unless you browse to another', () => {
  assert.equal(focusTarget(state()).sectionId, sid('T2'));
  assert.equal(focusTarget(state({ task: sid('T3') })).sectionId, sid('T3'));
  assert.equal(focusTarget(state({ task: 'gone' })).sectionId, sid('T2'), 'an unknown task falls back to the current one');
  assert.equal(focusTarget({ ...state(), plan: { model: parse('## A\n- [ ] x\n') } }), null);
});

test('the focus page holds one task: its status, count, the next step highlighted, and its notes and steps', () => {
  const html = renderFocus(state());
  assert.equal((html.match(/<section class="card focus"/g) ?? []).length, 1);
  assert.ok(!html.includes('Task 1: A') && !html.includes('goal step'));
  assert.match(html, /<span class="st st-progress">In progress<\/span>/);
  assert.match(html, /<span class="h-count">1\/3<\/span>/);
  assert.match(html, /<div class="next-step"><span class="now-l">Next step<\/span>b2<\/div>/);
  assert.equal((html.match(/class="task next"|class="task doing next"/g) ?? []).length, 1);
  assert.match(html, /data-task="[^"]*b2[^"]*"/);
  assert.match(html, /<button class="need ok" data-goto="[^"]+">T1<\/button>/);
});

test('the bar lets you leave, step between tasks, and return to the current one only when you have wandered', () => {
  const home = renderFocus(state());
  assert.match(home, /data-act="focus-exit">Back to the plan</);
  assert.match(home, /data-act="focus-prev" aria-label="Previous task"/);
  assert.match(home, /data-act="focus-next" aria-label="Next task"/);
  assert.match(home, /2 of 3/);
  assert.ok(!home.includes('focus-follow'));
  const away = renderFocus(state({ task: sid('T3') }));
  assert.match(away, /data-act="focus-follow">Back to the current task</);
  assert.match(away, /3 of 3/);
  assert.match(away, /data-act="focus-next"[^>]*disabled/);
  assert.match(renderFocus(state({ task: sid('T1') })), /data-act="focus-prev"[^>]*disabled/);
});

test('task text in the focus page is escaped, and a finished task has no next step', () => {
  assert.ok(!renderFocus(state()).includes('<i>x</i>'));
  const done = renderFocus(state({ task: sid('T1') }));
  assert.ok(!done.includes('next-step'));
  assert.match(done, /<span class="st st-done">Done<\/span>/);
});

test('the shortcut list mentions the focus key', () => {
  assert.ok(SHORTCUTS.some(s => s.keys.includes('F')));
});
