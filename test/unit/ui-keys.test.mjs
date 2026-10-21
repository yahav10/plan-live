import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modLabel } from '../../ui/lib.mjs';
import { SHORTCUTS, renderKeys } from '../../ui/components/keys.mjs';
import { renderPill } from '../../ui/components/jump.mjs';

test('Apple platforms get the command key and everyone else gets Ctrl', () => {
  for (const p of ['MacIntel', 'macOS', 'darwin', 'iPhone', 'iPad']) assert.equal(modLabel(p), '⌘', p);
  for (const p of ['Win32', 'Windows', 'Linux x86_64', 'Android', 'CrOS', '']) assert.equal(modLabel(p), 'Ctrl', p);
});

test('the section pill shows the key for the platform', () => {
  const sections = [{ id: 'a', heading: '1. A', progress: { done: 0, total: 0 } }];
  assert.match(renderPill({ sections, active: 'a', mod: '⌘' }), /<span class="kbd">⌘ K<\/span>/);
  assert.match(renderPill({ sections, active: 'a' }), /<span class="kbd">Ctrl K<\/span>/);
});

test('the shortcut list covers every key the page responds to, once each', () => {
  const keys = SHORTCUTS.flatMap(s => s.keys).filter(k => k !== 'mod');
  for (const k of ['K', 'J', 'C', 'T', 'D', 'Enter', '?', 'Esc']) assert.ok(keys.includes(k), k);
  assert.equal(new Set(SHORTCUTS.map(s => s.does)).size, SHORTCUTS.length);
});

test('the overlay writes the platform key, labels every row and escapes nothing it should not', () => {
  const html = renderKeys('⌘');
  assert.match(html, /<kbd>⌘<\/kbd>\s*<kbd>K<\/kbd>/);
  assert.match(html, /Jump to a section/);
  assert.equal((html.match(/<li>/g) ?? []).length, SHORTCUTS.length);
  assert.ok(renderKeys('Ctrl').includes('<kbd>Ctrl</kbd>'));
  assert.ok(!renderKeys('<b>').includes('<b>'));
});
