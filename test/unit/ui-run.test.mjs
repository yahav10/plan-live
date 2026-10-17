import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../../server/parse.mjs';
import { runnable, blockedBy, runState, renderRunButton } from '../../ui/components/run.mjs';

const model = parse(readFileSync(new URL('../fixtures/mini.md', import.meta.url), 'utf8'));
const sec = key => model.sections.find(s => s.node?.key === key);

test('only task sections with unfinished steps can run', () => {
  assert.equal(runnable(model, sec('T1').id), true);
  assert.equal(runnable(model, sec('T3').id), true);
  assert.equal(runnable(model, 'goals'), false);
  const done = parse('### Task 1: A\n- [x] one\n');
  assert.equal(runnable(done, done.sections[0].id), false);
  assert.equal(runnable(model, 'nope'), false);
});

test('a section is blocked by the unfinished tasks it depends on', () => {
  assert.deepEqual(blockedBy(model, sec('T1').id), []);
  assert.deepEqual(blockedBy(model, sec('T2').id), ['T1']);
  assert.deepEqual(blockedBy(model, sec('T3').id).sort(), ['T1', 'T2']);
  const m2 = parse('### Task 1: A\n- [x] one\n### Task 2: B\nDepends on Task 1.\n- [ ] two\n');
  assert.deepEqual(blockedBy(m2, m2.sections[1].id), [], 'a finished dependency does not block');
});

test('run state follows the open run request for that section', () => {
  const c = (status, sectionId = 't') => ({ kind: 'run', status, anchor: { sectionId } });
  assert.equal(runState([], 't'), null);
  assert.equal(runState([c('draft')], 't'), 'draft');
  assert.equal(runState([c('queued')], 't'), 'queued');
  assert.equal(runState([c('resolved')], 't'), null);
  assert.equal(runState([c('draft', 'other')], 't'), null);
  assert.equal(runState([{ kind: 'comment', status: 'draft', anchor: { sectionId: 't' } }], 't'), null);
});

test('the run button is absent, ready, queued or running', () => {
  const id = sec('T1').id;
  assert.equal(renderRunButton({ model, sectionId: 'goals', comments: [] }), '');
  const ready = renderRunButton({ model, sectionId: id, comments: [] });
  assert.match(ready, new RegExp(`<button class="run" data-act="run" data-sec="${id}"[^>]*>▶ Run</button>`));
  assert.ok(!ready.includes('disabled'));
  assert.match(renderRunButton({ model, sectionId: id, comments: [{ kind: 'run', status: 'draft', anchor: { sectionId: id } }] }), /class="run on" [^>]*disabled[^>]*>Queued</);
  assert.match(renderRunButton({ model, sectionId: id, comments: [{ kind: 'run', status: 'queued', anchor: { sectionId: id } }] }), /disabled[^>]*>Running…</);
});
