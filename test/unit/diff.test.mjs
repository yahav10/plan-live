import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitLines, joinLines, lineHash, diffLines, revertHunk } from '../../server/diff.mjs';

test('split/join round-trips LF, CRLF and missing trailing newline', () => {
  for (const t of ['a\nb\n', 'a\r\nb\r\n', 'a\nb', '', '\n', readFileSync(new URL('../fixtures/crlf.md', import.meta.url), 'utf8')]) {
    assert.equal(joinLines(splitLines(t)), t);
  }
  const d = splitLines('x\r\ny');
  assert.deepEqual(d, { lines: ['x', 'y'], eol: '\r\n', trailingNewline: false });
});

test('lineHash is 12 hex chars and content-sensitive', () => {
  assert.match(lineHash('- [ ] one'), /^[0-9a-f]{12}$/);
  assert.notEqual(lineHash('- [ ] one'), lineHash('- [x] one'));
});

test('diffLines reports modify, insert and delete hunks with context', () => {
  const a = ['h', 'one', 'two', 'three', 'four'];
  const b = ['h', 'one', 'TWO', 'three', 'new', 'four'];
  const hunks = diffLines(a, b);
  assert.equal(hunks.length, 2);
  assert.deepEqual([hunks[0].aLines, hunks[0].bLines, hunks[0].bStart], [['two'], ['TWO'], 2]);
  assert.deepEqual(hunks[0].ctxBefore, ['h', 'one']);
  assert.deepEqual([hunks[1].aLines, hunks[1].bLines], [[], ['new']]);
  assert.deepEqual(diffLines(['a', 'b'], ['a']).map(h => h.aLines), [['b']]);
  assert.deepEqual(diffLines(['same'], ['same']), []);
});

test('revertHunk restores the pre-image when the post-image is untouched', () => {
  const a = 'h\none\ntwo\nthree\n', b = 'h\none\nTWO\nthree\nextra\n';
  const hunks = diffLines(splitLines(a).lines, splitLines(b).lines);
  let text = b;
  for (const h of [...hunks].reverse()) {
    const r = revertHunk(text, h);
    assert.equal(r.ok, true);
    text = r.text;
  }
  assert.equal(text, a);
});

test('revertHunk still applies after unrelated lines shift the hunk', () => {
  const a = 'x\ny\nz\n', b = 'x\nY\nz\n';
  const [h] = diffLines(splitLines(a).lines, splitLines(b).lines);
  const r = revertHunk('inserted above\n' + b, h);
  assert.deepEqual(r, { ok: true, text: 'inserted above\n' + a });
});

test('revertHunk reports conflict when the changed lines were edited again', () => {
  const [h] = diffLines(['x', 'y', 'z'], ['x', 'Y', 'z']);
  assert.deepEqual(revertHunk('x\nY2\nz\n', h), { ok: false, reason: 'conflict' });
});

test('revertHunk preserves CRLF and missing trailing newline', () => {
  const a = 'a\r\nb\r\nc', b = 'a\r\nB\r\nc';
  const [h] = diffLines(splitLines(a).lines, splitLines(b).lines);
  assert.equal(revertHunk(b, h).text, a);
});

test('mixed line endings round-trip and revertHunk keeps untouched lines byte-identical', () => {
  const text = 'a\nb\r\nc\nd';
  assert.equal(joinLines(splitLines(text)), text);
  const [h] = diffLines(splitLines(text).lines, splitLines('a\nB\r\nc\nd').lines);
  assert.equal(revertHunk('a\nB\r\nc\nd', h).text, text);
});
