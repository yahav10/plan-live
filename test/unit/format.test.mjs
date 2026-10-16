import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBatch, formatRejections } from '../../server/format.mjs';

const comments = [
  { id: 'c_1', kind: 'comment', body: 'Make it x20', anchor: { sectionId: 't3', taskId: 't3/run', quote: 'Run the eval x10' } },
  { id: 'c_2', kind: 'suggestion', body: 'link it', replacement: 'Gate (AI-X)', anchor: { sectionId: 'decisions', quote: 'Gate' } },
];

test('formatBatch lists every comment with its anchor and the exact resolve command', () => {
  const t = formatBatch({ batch: { id: 'b_9', commentIds: ['c_1', 'c_2'] }, comments, plan: '/p/plan.md', cli: '/plug/bin/plan-live.mjs' });
  assert.match(t, /^plan-live review batch b_9 for \/p\/plan\.md — 2 comments/);
  assert.match(t, /\[c_1\] comment on § t3 › task "Run the eval x10"/);
  assert.match(t, /\[c_2\] suggestion on § decisions/);
  assert.match(t, /replace: "Gate"\n\s+with:\s+"Gate \(AI-X\)"/);
  assert.match(t, /node "\/plug\/bin\/plan-live\.mjs" resolve '\/p\/plan\.md' <id> --status resolved\|declined --note "<one line>"/);
  assert.match(t, /node "\/plug\/bin\/plan-live\.mjs" watch '\/p\/plan\.md'/);
});

test('formatRejections names the comment and forbids re-applying', () => {
  const t = formatRejections({ plan: '/p/plan.md', comments, revisions: [
    { id: 'r1', commentId: 'c_1', status: 'rejected', hunk: { aLines: ['old'], bLines: ['new'] } },
    { id: 'r2', commentId: null, status: 'conflict', hunk: { aLines: ['a'], bLines: ['b'] } },
  ] });
  assert.match(t, /rejected your change for c_1 .*do not re-apply/);
  assert.match(t, /could not undo r2.*revert it by hand/);
});

test('a plan path with shell metacharacters is single-quoted so it cannot expand', () => {
  const plan = "/tmp/x$(touch pwned)`id`\"y'z.md";
  const t = formatBatch({ batch: { id: 'b_9', commentIds: ['c_1'] }, comments, plan, cli: '/plug/bin/plan-live.mjs' });
  const quoted = "'/tmp/x$(touch pwned)`id`\"y'\\''z.md'";
  assert.ok(t.includes(`resolve ${quoted} <id>`), t);
  assert.ok(t.includes(`watch ${quoted}`), t);
  assert.ok(!t.includes(`"${plan}"`));
});

const sections = [
  { id: 'goals', heading: 'Goals', line: 12, endLine: 39 },
  { id: 't2', heading: 'Task 2: Checkout API', line: 40, endLine: 67 },
];
const ctxComments = [
  { id: 'c_1', kind: 'comment', body: 'x', anchor: { sectionId: 't2', taskId: 't2/run', quote: 'Run it' } },
  { id: 'c_2', kind: 'comment', body: 'y', anchor: { sectionId: 'intro' } },
  { id: 'c_3', kind: 'comment', body: 'z', anchor: { sectionId: 'gone-section' }, orphaned: true },
];
const withModel = { batch: { id: 'b_1', commentIds: ['c_1', 'c_2', 'c_3'] }, comments: ctxComments, plan: '/p/plan.md', cli: '/plug/bin/plan-live.mjs', model: { sections }, lineCount: 80 };

test('formatBatch gives each comment the line range to read and an outline of the plan', () => {
  const t = formatBatch(withModel);
  assert.match(t, /Plan outline[^\n]*\n\s+1-11 intro\n\s+12-39 Goals\n\s+40-67 Task 2: Checkout API/);
  assert.match(t, /\[c_1\] comment[^\n]*\n\s+context: lines 40-67/);
  assert.match(t, /\[c_2\] comment[^\n]*\n\s+context: lines 1-11/);
  assert.match(t, /\[c_3\] comment[^\n]*\n\s+context: not found, read the whole plan/);
});

test('formatBatch gives the whole file as intro when the plan has no sections', () => {
  const t = formatBatch({ ...withModel, comments: [ctxComments[1]], batch: { id: 'b_1', commentIds: ['c_2'] }, model: { sections: [] }, lineCount: 9 });
  assert.match(t, /\s+1-9 intro/);
  assert.match(t, /context: lines 1-9/);
});

test('formatBatch caps a long outline', () => {
  const many = Array.from({ length: 70 }, (_, i) => ({ id: `s${i}`, heading: `Section ${i}`, line: 10 + i * 2, endLine: 11 + i * 2 }));
  const t = formatBatch({ ...withModel, model: { sections: many }, lineCount: 200 });
  assert.match(t, /\.\.\. and \d+ more sections/);
  assert.ok(t.split('\n').filter(l => /^\s+\d+-\d+ /.test(l)).length <= 61);
});

test('formatBatch without a model keeps the old output', () => {
  const { model, lineCount, ...bare } = withModel;
  const t = formatBatch(bare);
  assert.ok(!t.includes('Plan outline'));
  assert.ok(!t.includes('context:'));
});
