import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusLine, renderBottombar, diffAlerts, renderTableRows } from '../../ui/components/phone.mjs';

const R = (over = {}) => ({ comments: [], batches: [], revisions: [], ...over });

test('the status line says what needs you, most urgent first, and is silent when nothing does', () => {
  assert.equal(statusLine(R()), null);
  assert.deepEqual(statusLine(R({ comments: [{ status: 'draft' }, { status: 'draft' }] })), { text: '2 drafts ready', kind: 'draft' });
  assert.deepEqual(statusLine(R({ comments: [{ status: 'draft' }, { status: 'queued' }] })), { text: 'Claude is working on 1 comment…', kind: 'working' });
  assert.deepEqual(statusLine(R({ comments: [{ status: 'queued' }], revisions: [{ status: 'proposed' }, { status: 'proposed' }, { status: 'accepted' }] })), { text: '2 changes from Claude to review', kind: 'review' });
  assert.equal(statusLine(R({ revisions: [{ status: 'proposed' }] })).text, '1 change from Claude to review');
  assert.equal(statusLine(R({ comments: [{ status: 'draft' }] })).text, '1 draft ready');
});

test('the bottom bar has the Plan, Now and Review tabs, a comment button and an alerts switch', () => {
  const html = renderBottombar({ view: 'now', review: R({ comments: [{ status: 'draft' }], revisions: [{ status: 'proposed' }] }), alerts: true });
  assert.match(html, /<button class="bb-tab" data-act="view" data-view="plan" role="tab" aria-selected="false">Plan<\/button>/);
  assert.match(html, /data-view="now" role="tab" aria-selected="true"/);
  assert.match(html, /data-view="review"[^>]*>Review<span class="bb-n">2<\/span><\/button>/);
  assert.match(html, /data-act="phone-comment" aria-label="Add a comment"/);
  assert.match(html, /data-act="alerts" aria-label="Alerts" aria-pressed="true"/);
  assert.match(renderBottombar({ view: 'plan', review: R(), alerts: false }), /aria-pressed="false"/);
  assert.ok(!renderBottombar({ view: 'plan', review: R(), alerts: false }).includes('bb-n'), 'no count when nothing is waiting');
});

test('an alert fires only for something new: a proposed change or an answered comment', () => {
  const prev = R({ comments: [{ id: 'a', status: 'queued' }, { id: 'b', status: 'queued' }], revisions: [{ id: 'r1', status: 'proposed' }] });
  assert.equal(diffAlerts(null, prev), null, 'the first load is never an alert');
  assert.equal(diffAlerts(prev, prev), null);
  assert.equal(diffAlerts(prev, R({ ...prev, revisions: [...prev.revisions, { id: 'r2', status: 'proposed' }] })), 'Claude proposed 1 change');
  assert.equal(diffAlerts(prev, R({ comments: [{ id: 'a', status: 'resolved' }, { id: 'b', status: 'declined' }], revisions: prev.revisions })), 'Claude answered 2 comments');
  assert.equal(diffAlerts(prev, R({ comments: [{ id: 'a', status: 'resolved' }, { id: 'b', status: 'queued' }], revisions: [...prev.revisions, { id: 'r2', status: 'proposed' }, { id: 'r3', status: 'proposed' }] })), 'Claude proposed 2 changes and answered 1 comment');
  assert.equal(diffAlerts(prev, R({ comments: prev.comments, revisions: [{ id: 'r1', status: 'accepted' }] })), null, 'your own accept is not news');
});

test('a table becomes one-line rows on a phone: first column, a preview, the last column as a chip, and every column when opened', () => {
  const html = renderTableRows({ head: ['#', 'Decision', 'Consequence', 'Status'], rows: [['D1', 'Guard totals <b>x</b>', 'No client trust', 'Agreed'], ['D2', 'One page', 'Fewer steps', 'Open']] });
  assert.equal((html.match(/<details class="trow">/g) ?? []).length, 2);
  assert.match(html, /<summary><b>D1<\/b><span class="tprev">Guard totals &lt;b&gt;x&lt;\/b&gt;<\/span><span class="tchip">Agreed<\/span><\/summary>/);
  assert.match(html, /<dl><dt>#<\/dt><dd>D1<\/dd><dt>Decision<\/dt><dd>Guard totals &lt;b&gt;x&lt;\/b&gt;<\/dd>/);
  assert.ok(!html.includes('<b>x</b>'));
  assert.match(renderTableRows({ head: ['A', 'B'], rows: [['1', '2']] }), /<summary><b>1<\/b><span class="tchip">2<\/span><\/summary>/);
  assert.match(renderTableRows({ head: ['A'], rows: [['1']] }), /<summary><b>1<\/b><\/summary>/);
});
