import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportName, toCsv, reviewMarkdown } from '../../ui/export.mjs';
import { parse } from '../../server/parse.mjs';

const model = parse(readFileSync(new URL('../fixtures/mini.md', import.meta.url), 'utf8'));

test('exportName swaps the extension, adds a suffix and keeps names filesystem-safe', () => {
  assert.equal(exportName('plan.md', '', 'md'), 'plan.md');
  assert.equal(exportName('plan.md', 'tasks', 'csv'), 'plan-tasks.csv');
  assert.equal(exportName('my plan (v2).MD', 'graph', 'svg'), 'my-plan-v2-graph.svg');
});

test('toCsv lists every task with its section and line, escaping quotes, commas and newlines', () => {
  const csv = toCsv({ ...model, tasks: [...model.tasks, { id: 'x', sectionId: 'goals', text: 'say "hi", twice\nplease', checked: true, line: 99 }] });
  const rows = csv.split('\n');
  assert.equal(rows[0], 'section,task,done,line');
  assert.match(rows[1], /^Task 1: Parser,Write the failing test,yes,\d+$/);
  assert.match(csv, /"say ""hi"", twice\nplease"/);
  assert.equal(csv.split('\n').filter(r => r.startsWith('Task')).length, 4);
});

test('toCsv neutralises spreadsheet formula injection', () => {
  const csv = toCsv({ ...model, tasks: [{ id: 'x', sectionId: 'goals', text: '=HYPERLINK("http://evil")', checked: false, line: 1 }, { id: 'y', sectionId: 'goals', text: '@cmd', checked: false, line: 2 }] });
  assert.match(csv, /,"'=HYPERLINK\(""http:\/\/evil""\)",no,1/);
  assert.match(csv, /,'@cmd,no,2/);
});

test('reviewMarkdown groups comments by state with Claude’s notes and revision outcomes', () => {
  const review = {
    comments: [
      { id: 'c1', kind: 'comment', body: 'Rename it', anchor: { sectionId: 'task-1-parser', quote: 'Implement parse' }, status: 'resolved', resolution: { note: 'renamed', at: 'x' } },
      { id: 'c2', kind: 'suggestion', body: 'Use the term', replacement: 'Single-page', anchor: { sectionId: 'goals', quote: 'Ship the viewer' }, status: 'declined', resolution: { note: 'keeping wording', at: 'x' } },
      { id: 'c3', kind: 'comment', body: 'Still open', anchor: { sectionId: 'goals' }, status: 'queued' },
      { id: 'c4', kind: 'comment', body: 'Draft idea', anchor: { sectionId: 'goals' }, status: 'draft' },
    ],
    batches: [], revisions: [{ id: 'r1', commentId: 'c1', status: 'rejected', hunk: { aLines: ['old'], bLines: ['new'] } }],
  };
  const md = reviewMarkdown(review, model, 'plan.md');
  assert.match(md, /^# Review: Mini Plan \(plan\.md\)/);
  assert.match(md, /## Resolved \(1\)[\s\S]*Rename it[\s\S]*Claude: renamed/);
  assert.match(md, /## Declined \(1\)[\s\S]*Single-page[\s\S]*keeping wording/);
  assert.match(md, /## With Claude \(1\)[\s\S]*Still open/);
  assert.match(md, /## Drafts \(1\)[\s\S]*Draft idea/);
  assert.match(md, /## Claude’s changes \(1\)[\s\S]*rejected[\s\S]*new/);
});

test('reviewMarkdown says so when there is nothing to export', () => {
  assert.match(reviewMarkdown({ comments: [], batches: [], revisions: [] }, model, 'plan.md'), /No review comments yet\./);
});
