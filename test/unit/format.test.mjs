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
