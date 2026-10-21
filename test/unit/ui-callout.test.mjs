import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock } from '../../ui/components/sections.mjs';

const ctx = { sectionId: 's', index: 0, comments: [], doing: null, model: { graph: { nodes: [], edges: [] } } };

test('a callout renders with its label, kind class and inline formatting', () => {
  const html = renderBlock({ type: 'callout', kind: 'warning', title: '', paras: ['Use `--dry-run` **first**.', 'Second.'] }, ctx);
  assert.match(html, /class="callout callout-warning" role="note"/);
  assert.match(html, /<div class="callout-title"><svg class="ic"[\s\S]*?<\/svg>Warning<\/div>/);
  assert.match(html, /<p>Use <code>--dry-run<\/code> <strong>first<\/strong>\.<\/p><p>Second\.<\/p>/);
});

test('a custom title replaces the label, and every kind has one', () => {
  assert.match(renderBlock({ type: 'callout', kind: 'tip', title: 'Heads up', paras: ['x'] }, ctx), /callout-title"><svg class="ic"[\s\S]*?<\/svg>Heads up</);
  for (const [k, label] of [['note', 'Note'], ['tip', 'Tip'], ['important', 'Important'], ['warning', 'Warning'], ['caution', 'Caution']]) {
    assert.match(renderBlock({ type: 'callout', kind: k, title: '', paras: ['x'] }, ctx), new RegExp(`callout-title"><svg class="ic"[\\s\\S]*?</svg>${label}<`));
  }
});

test('hostile text in a callout is escaped, in the title, the body and the kind', () => {
  const html = renderBlock({ type: 'callout', kind: 'note"><img src=x onerror=alert(1)>', title: '<script>alert(1)</script>', paras: ['<img src=x onerror=alert(1)> and [x](javascript:alert(1))'] }, ctx);
  assert.ok(!html.includes('<img') && !html.includes('<script'));
  assert.match(html, /class="callout callout-note"/, 'an unknown kind falls back to note');
});

test('a blockquote renders as a quote with escaped paragraphs', () => {
  const html = renderBlock({ type: 'quote', paras: ['Use `x` **now**.', '<img src=x onerror=alert(1)>'] }, ctx);
  assert.match(html, /<blockquote class="quote"><p>Use <code>x<\/code> <strong>now<\/strong>\.<\/p><p>&lt;img src=x onerror=alert\(1\)&gt;<\/p><\/blockquote>/);
  assert.ok(!html.includes('<img'));
});
