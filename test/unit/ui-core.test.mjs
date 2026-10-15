import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esc, inline } from '../../ui/lib.mjs';
import { resolveChoice, nextMode, nextTheme } from '../../ui/theme.mjs';
import { renderStrip, fmtAge } from '../../ui/components/strip.mjs';
import { renderHero } from '../../ui/components/hero.mjs';
import { renderSections } from '../../ui/components/sections.mjs';
import { parse } from '../../server/parse.mjs';

const model = parse(readFileSync(new URL('../fixtures/mini.md', import.meta.url), 'utf8'));
const state = (over = {}) => ({
  plan: { model, file: 'mini.md', path: '/p/mini.md', changedAt: Date.now() - 4000, changedBy: 'Claude', defaults: {} },
  review: { comments: [], batches: [], revisions: [] },
  choice: { theme: 'aurora', mode: 'auto' }, online: true, active: 'task-1-parser', ...over,
});

test('plan text with HTML and javascript: links renders inert', () => {
  const html = inline('<img src=x onerror=alert(1)> [click](javascript:alert(1)) [ok](https://a.dev/x) `<b>`');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /<a href="https:\/\/a\.dev\/x" target="_blank" rel="noopener noreferrer">ok<\/a>/);
  assert.match(html, /<code>&lt;b&gt;<\/code>/);
  assert.equal(esc(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
});

test('inline renders bold, italic, code and bare links', () => {
  assert.equal(inline('**b** *i* `c`'), '<strong>b</strong> <em>i</em> <code>c</code>');
  assert.match(inline('see https://x.dev/a'), /see <a href="https:\/\/x\.dev\/a"/);
});

test('theme choice precedence: url > storage > defaults > built-in', () => {
  const storage = { get: k => ({ theme: 'editorial' })[k] ?? null };
  assert.deepEqual(resolveChoice({ theme: 'blueprint', mode: 'dark' }, '?theme=aurora', storage), { theme: 'aurora', mode: 'dark' });
  assert.deepEqual(resolveChoice({ theme: 'blueprint' }, '', storage), { theme: 'editorial', mode: 'auto' });
  assert.deepEqual(resolveChoice({}, '?theme=nope', { get: () => null }), { theme: 'aurora', mode: 'auto' });
  assert.equal(nextMode('dark'), 'auto');
  assert.equal(nextTheme('blueprint'), 'aurora');
});

test('strip: one pill for the active section, no tab row, compact age', () => {
  const html = renderStrip(state());
  assert.equal((html.match(/class="pill"/g) ?? []).length, 1);
  assert.ok(!html.includes('data-sec='));
  assert.ok(!html.includes('class="secs"'));
  assert.match(html, /Task 1: Parser/);
  assert.match(html, /title="Updated 4s ago by Claude"/);
  assert.equal(fmtAge(4200), '4s');
  assert.equal(fmtAge(185_000), '3m');
  assert.equal(fmtAge(7_300_000), '2h');
});

test('hero: ring, eyebrow, title, field chips and file line', () => {
  const html = renderHero(state({ review: { comments: [{ status: 'draft' }, { status: 'queued' }], batches: [], revisions: [] } }));
  assert.match(html, /--p:25/);
  assert.match(html, /rev 1 \(2026-10-08\)/);
  assert.match(html, /<h1 class="title">Mini Plan<\/h1>/);
  assert.match(html, /<a class="chip" href="https:\/\/example\.com\/browse\/MINI-1"/);
  assert.match(html, /2 comments pending/);
  assert.match(html, /title="\/p\/mini\.md">mini\.md</);
});

test('sections: cards per section, tasks carry id/hash/text, first open task is doing', () => {
  const html = renderSections(state());
  assert.equal((html.match(/<section class="card" id=/g) ?? []).length, model.sections.length);
  const t = model.tasks.find(x => x.text === 'Implement parse');
  assert.match(html, new RegExp(`data-task="${t.id}"[^>]*data-hash="${t.hash}"`));
  assert.match(html, /class="task doing"[^>]*data-task="task-1-parser\/implement-parse"/);
  assert.match(html, /<table>/);
});
