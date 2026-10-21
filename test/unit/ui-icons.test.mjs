import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icon, ICONS } from '../../ui/icons.mjs';
import { modeIcon, MODES } from '../../ui/theme.mjs';
import { badge, renderBlock } from '../../ui/components/sections.mjs';
import { renderRunButton } from '../../ui/components/run.mjs';
import { parse } from '../../server/parse.mjs';

test('an icon is a 24 unit line drawing that takes its colour from the text and hides from screen readers', () => {
  const svg = icon('check', 14);
  assert.match(svg, /^<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">/);
  assert.ok(!/fill="#|stroke="#/.test(svg));
  for (const name of Object.keys(ICONS)) assert.match(icon(name), /<svg[\s\S]+<\/svg>$/, name);
  assert.throws(() => icon('nope'), /unknown icon/);
});

test('each colour scheme setting has its own icon', () => {
  const seen = new Set(MODES.map(m => modeIcon(m)));
  assert.equal(seen.size, MODES.length);
  assert.ok([...seen].every(s => s.startsWith('<svg')));
});

test('the pieces that used emoji and symbols now draw icons', () => {
  assert.match(badge(3), /<span class="pill c"><svg class="ic"[\s\S]*<\/svg> 3<\/span>/);
  const m = parse('### Task 1: A\n- [x] done\n- [ ] open\n');
  const html = renderBlock(m.sections[0].blocks[0], { sectionId: 's', index: 0, comments: [], model: m });
  assert.match(html, /<button class="cb"[^>]*><svg class="ic"/);
  assert.match(html, /<button class="cb"[^>]*><\/button>/);
  assert.match(renderRunButton({ model: m, sectionId: m.sections[0].id, comments: [] }), />\s*<svg class="ic"[\s\S]*<\/svg> Run<\/button>/);
});

const UI = fileURLToPath(new URL('../../ui/', import.meta.url));
const walk = d => readdirSync(d).flatMap(f => (f === 'vendor' ? [] : statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('no emoji or symbol glyphs in the interface: they look different on every system, so use an icon', () => {
  const bad = /\p{Extended_Pictographic}|[✓✔✕✗☀☾◐◇●⚠⛔]/gu;
  const allowed = new Set(['⌘', '⏎']);
  const hits = [];
  for (const f of walk(UI).filter(f => /\.(mjs|css|html)$/.test(f))) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(bad)) if (!allowed.has(m[0])) hits.push(`${f.slice(UI.length)}:${i + 1} ${m[0]}`);
    });
  }
  assert.deepEqual(hits, []);
});
