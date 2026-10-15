import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = p => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));

test('plugin manifest names the plugin with a semver version', () => {
  const m = read('.claude-plugin/plugin.json');
  assert.equal(m.name, 'plan-live');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
});

test('marketplace lists the plugin from the repo root', () => {
  const m = read('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'plan-live');
  assert.equal(m.plugins[0].name, 'plan-live');
  assert.equal(m.plugins[0].source, './');
});

test('package has no runtime dependencies and requires node 20', () => {
  const p = read('package.json');
  assert.equal(p.dependencies, undefined);
  assert.equal(p.engines.node, '>=20');
  assert.equal(p.type, 'module');
});

test('fixtures are present', () => {
  for (const f of ['superpowers-style.md', 'freeform-style.md', 'mini.md']) {
    assert.ok(existsSync(new URL(`../fixtures/${f}`, import.meta.url)), f);
  }
});
