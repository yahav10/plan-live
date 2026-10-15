import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const front = md => Object.fromEntries(md.split('---')[1].trim().split('\n').map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));

test('command has a description and starts server and watcher in the background', () => {
  const md = read('commands/plan-live.md');
  assert.ok(front(md).description);
  assert.match(md, /bin\/plan-live\.mjs" serve/);
  assert.match(md, /bin\/plan-live\.mjs" watch/);
  assert.match(md, /run_in_background/);
});

test('skill frontmatter names the trigger and the procedure resolves every comment', () => {
  const md = read('skills/plan-live/SKILL.md');
  const f = front(md);
  assert.equal(f.name, 'plan-live');
  assert.match(f.description, /plan-live review batch/);
  assert.match(md, /--status resolved/);
  assert.match(md, /--status declined/);
  assert.match(md, /never edit .*review\.json/i);
  assert.match(md, /restart the watcher/i);
});
