import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore, reviewPathFor, linkHunks, StoreError } from '../../server/review-store.mjs';
import { parse } from '../../server/parse.mjs';
import { diffLines, splitLines } from '../../server/diff.mjs';

let dir, plan;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plan-live-store-'));
  plan = join(dir, 'p.md');
  writeFileSync(plan, '## A\n- [ ] alpha task\n## B\ntext\n');
});
const anchorA = { sectionId: 'a', taskId: 'a/alpha-task', quote: 'alpha task' };

test('reviewPathFor swaps .md for .review.json', () => {
  assert.equal(reviewPathFor('/x/p.md'), '/x/p.review.json');
});

test('full lifecycle: draft → queued → picked → resolved → batch done', () => {
  const s = createStore(plan);
  const c1 = s.addComment({ anchor: anchorA, body: 'one' });
  const c2 = s.addComment({ anchor: { sectionId: 'b' }, kind: 'suggestion', body: 'two', replacement: 'TEXT' });
  assert.equal(c1.status, 'draft');
  assert.equal(c2.replacement, 'TEXT');
  const b = s.apply('snapshot');
  assert.deepEqual([b.status, b.commentIds], ['pending', [c1.id, c2.id]]);
  assert.equal(s.apply('again'), null);
  assert.equal(s.pickPending().id, b.id);
  assert.equal(s.pickPending(), null);
  assert.deepEqual(s.status(), { drafts: 0, pendingBatches: 0, unresolvedInPicked: 2, unresolvedIds: [c1.id, c2.id] });
  assert.equal(s.resolve(c1.id, 'resolved', 'done').batchDone, null);
  const r = s.resolve(c2.id, 'declined', 'no');
  assert.equal(r.batchDone.id, b.id);
  assert.equal(r.batchDone.status, 'done');
  assert.equal(s.status().unresolvedInPicked, 0);
});

test('only drafts can be edited or deleted; unknown ids are 404', () => {
  const s = createStore(plan);
  const c = s.addComment({ anchor: anchorA, body: 'x' });
  s.updateComment(c.id, { body: 'y' });
  assert.equal(s.state.comments[0].body, 'y');
  s.apply('snap');
  assert.throws(() => s.updateComment(c.id, { body: 'z' }), e => e instanceof StoreError && e.code === 409);
  assert.throws(() => s.deleteComment('nope'), e => e.code === 404);
  assert.throws(() => s.resolve(c.id, 'maybe', ''), e => e.code === 400);
});

test('comments require a body and a section anchor', () => {
  const s = createStore(plan);
  assert.throws(() => s.addComment({ anchor: {}, body: 'x' }), e => e.code === 400);
  assert.throws(() => s.addComment({ anchor: anchorA, body: '  ' }), e => e.code === 400);
});

test('writes are atomic and persisted', () => {
  const s = createStore(plan);
  s.addComment({ anchor: anchorA, body: 'x' });
  assert.equal(JSON.parse(readFileSync(reviewPathFor(plan), 'utf8')).comments.length, 1);
  assert.ok(!readdirSync(dir).some(f => f.endsWith('.tmp')));
  assert.equal(createStore(plan).state.comments.length, 1);
});

test('corrupt review file is backed up and replaced', () => {
  writeFileSync(reviewPathFor(plan), 'not json');
  const s = createStore(plan);
  assert.equal(s.state.comments.length, 0);
  assert.match(s.takeNotice(), /unreadable/);
  assert.equal(s.takeNotice(), null);
  assert.ok(readdirSync(dir).some(f => f.includes('.review.json.bak-')));
});

test('reanchor: renamed task falls back to its section; vanished section moves by quote or orphans', () => {
  const s = createStore(plan);
  const c = s.addComment({ anchor: anchorA, body: 'x' });
  const q = s.addComment({ anchor: { sectionId: 'b', quote: 'text' }, body: 'y' });
  const o = s.addComment({ anchor: { sectionId: 'b', quote: 'gone forever' }, body: 'z' });
  s.reanchor(parse('## A\n- [ ] renamed task\n## C\ntext\n'));
  const get = id => s.state.comments.find(x => x.id === id);
  assert.deepEqual(get(c.id).anchor, { sectionId: 'a', quote: 'alpha task' });
  assert.equal(get(q.id).anchor.sectionId, 'c');
  assert.equal(get(q.id).orphaned, false);
  assert.equal(get(o.id).orphaned, true);
});

test('linkHunks attaches a hunk to the comment whose anchor it overlaps', () => {
  const before = '## A\n- [ ] alpha task\n## B\ntext\n';
  const after = '## A\n- [ ] alpha task x20\n## B\ntext\nnew\n';
  const model = parse(after);
  const hunks = diffLines(splitLines(before).lines, splitLines(after).lines);
  const comments = [
    { id: 'c1', anchor: { sectionId: 'a', taskId: model.tasks[0].id } },
    { id: 'c2', anchor: { sectionId: 'zzz' } },
  ];
  assert.deepEqual(linkHunks(hunks, comments, model).map(x => x.commentId), ['c1', null]);
});

test('rejected and conflicted revisions are reported exactly once', () => {
  const s = createStore(plan);
  s.addRevisions('b1', [{ hunk: { aLines: [], bLines: ['x'] }, commentId: null }, { hunk: { aLines: [], bLines: ['y'] }, commentId: null }]);
  const [r1, r2] = s.state.revisions;
  s.setRevision(r1.id, 'rejected');
  s.setRevision(r2.id, 'accepted');
  assert.throws(() => s.setRevision(r2.id, 'rejected'), e => e.code === 409);
  assert.deepEqual(s.takeUnreported().map(r => r.id), [r1.id]);
  assert.deepEqual(s.takeUnreported(), []);
});

test('patchSnapshots rewrites open batch snapshots only', () => {
  const s = createStore(plan);
  s.addComment({ anchor: anchorA, body: 'x' });
  s.apply('- [ ] alpha task');
  s.patchSnapshots(t => t.replace('[ ]', '[x]'));
  assert.equal(s.state.batches[0].snapshot, '- [x] alpha task');
});
