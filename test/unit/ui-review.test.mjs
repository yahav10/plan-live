import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderRail, anchorLabel } from '../../ui/components/review.mjs';
import { parse } from '../../server/parse.mjs';

const model = parse(readFileSync(new URL('../fixtures/mini.md', import.meta.url), 'utf8'));
const t = model.tasks.find(x => x.text === 'Implement parse');
const base = { plan: { model }, review: { comments: [], batches: [], revisions: [] } };
const c = (over) => ({ id: 'c1', kind: 'comment', body: 'Make it x20', anchor: { sectionId: t.sectionId, taskId: t.id, quote: t.text }, status: 'draft', orphaned: false, ...over });

test('anchor labels name the task, the quote or the section', () => {
  assert.equal(anchorLabel({ sectionId: t.sectionId, taskId: t.id, quote: t.text }, model), 'T1 › “Implement parse”');
  assert.equal(anchorLabel({ sectionId: 'goals', quote: 'markdown canonical' }, model), 'Goals › “markdown canonical”');
  assert.equal(anchorLabel({ sectionId: 'goals' }, model), 'Goals');
  assert.equal(anchorLabel({ sectionId: 'intro' }, model), 'Intro');
  assert.equal(anchorLabel({ sectionId: 'goals', quote: '**Step 1: Write** the `test`' }, model), 'Goals › “Step 1: Write the test”');
});

test('apply button is disabled without drafts and counts them otherwise', () => {
  assert.match(renderRail(base).bottom, /<button class="apply" data-act="apply" disabled>/);
  const r = renderRail({ ...base, review: { ...base.review, comments: [c(), c({ id: 'c2' })] } });
  assert.match(r.bottom, /Apply 2 comments → Claude/);
  assert.match(r.top, /data-act="edit-comment" data-id="c1"/);
});

test('suggestions show the replacement as a diff', () => {
  const r = renderRail({ ...base, review: { ...base.review, comments: [c({ kind: 'suggestion', replacement: 'Implement parse with fences' })] } });
  assert.match(r.top, /<div class="del">- Implement parse<\/div><div class="add">\+ Implement parse with fences<\/div>/);
});

test('queued comments show under "With Claude"; resolved ones collapse with the note', () => {
  const r = renderRail({ ...base, review: { ...base.review, comments: [c({ status: 'queued' }), c({ id: 'c3', status: 'resolved', resolution: { note: 'done it' } })] } });
  assert.match(r.bottom, /With Claude/);
  assert.match(r.bottom, /<details class="history"><summary>1 resolved<\/summary>/);
  assert.match(r.bottom, /done it/);
});

test('proposed revisions get accept/reject; conflicts are labelled', () => {
  const rev = (id, status) => ({ id, status, commentId: 'c1', hunk: { aLines: ['- [ ] Implement parse'], bLines: ['- [ ] Implement parse x2'] } });
  const r = renderRail({ ...base, review: { ...base.review, comments: [c({ status: 'resolved' })], revisions: [rev('r1', 'proposed'), rev('r2', 'conflict')] } });
  assert.match(r.bottom, /data-act="accept" data-id="r1"/);
  assert.match(r.bottom, /data-act="reject" data-id="r1"/);
  assert.match(r.bottom, /Couldn't undo automatically/);
});

test('orphaned comments are flagged', () => {
  const r = renderRail({ ...base, review: { ...base.review, comments: [c({ orphaned: true })] } });
  assert.match(r.top, /anchor no longer in the plan/);
});
