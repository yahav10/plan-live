import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(root + p, 'utf8');
const INTERNAL = /nexxen|tremor|amobee|turn\.com|bconsole|gitlab|\bAI-\d{3,5}\b|agents-api|ai-copilot|discovery-insights|dsp-copilot/i;

test('MIT licence and matching versions', () => {
  assert.match(read('LICENSE'), /^MIT License/);
  const pkg = JSON.parse(read('package.json')), plug = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.equal(plug.version, pkg.version);
  assert.equal(plug.license, 'MIT');
});

test('every vendored font family and mermaid ship a licence file', () => {
  const families = new Set(readdirSync(root + 'ui/vendor/fonts').map(f => f.replace(/-latin-.*$/, '')));
  const lic = readdirSync(root + 'ui/vendor/licenses');
  for (const f of families) assert.ok(lic.includes(`${f}-OFL.txt`), f);
  assert.ok(lic.includes('mermaid-MIT.txt'));
  assert.match(read('THIRD_PARTY_NOTICES.md'), /SIL Open Font License/);
});

test('no internal company content in tracked files', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter(f => f && f !== 'test/unit/publish.test.mjs' && !f.startsWith('ui/vendor/') && !/\.(woff2|png)$/.test(f));
  assert.deepEqual(files.filter(f => INTERNAL.test(read(f))), []);
});

test('README installs from the published repo, not a local path', () => {
  const md = read('README.md');
  assert.match(md, /\/plugin marketplace add [\w.-]+\/plan-live\b/);
  assert.ok(!md.includes('~/Documents'));
  assert.ok(!md.includes('OWNER'), 'OWNER placeholder replaced');
  for (const h of ['## Install', '## Quickstart', '## FAQ', '## Troubleshooting', '## License']) assert.ok(md.includes(h), h);
  for (const m of md.matchAll(/src="(docs\/screenshots\/[^"]+)"/g)) assert.ok(existsSync(root + m[1]), m[1]);
});
