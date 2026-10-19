import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveAsset, MAX_ASSET } from '../../server/assets.mjs';

let root, outside;
beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'plan-live-assets-'));
  root = join(base, 'plan'); outside = join(base, 'outside');
  mkdirSync(join(root, 'sub'), { recursive: true }); mkdirSync(outside);
  writeFileSync(join(root, 'a.png'), 'png'); writeFileSync(join(root, 'sub', 'b.JPG'), 'jpg');
  writeFileSync(join(root, 'plan.md'), '# x'); writeFileSync(join(root, 'plan.review.json'), '{}');
  writeFileSync(join(outside, 'secret.png'), 'secret');
  symlinkSync(join(outside, 'secret.png'), join(root, 'link.png'));
  symlinkSync(outside, join(root, 'dir-link'));
});

test('an image inside the plan folder resolves with its type, case-insensitively', async () => {
  const a = await resolveAsset(root, 'a.png');
  assert.equal(a.ok, true);
  assert.equal(a.type, 'image/png');
  assert.equal((await resolveAsset(root, 'sub/b.JPG')).type, 'image/jpeg');
  assert.equal((await resolveAsset(root, './a.png')).ok, true);
});

test('only image types are served, so the plan and its review data stay private', async () => {
  for (const f of ['plan.md', 'plan.review.json']) assert.deepEqual(await resolveAsset(root, f), { ok: false, code: 403 });
});

test('paths that leave the plan folder are refused, by dots, by absolute path and by symlink', async () => {
  for (const p of ['../outside/secret.png', 'sub/../../outside/secret.png', '/etc/passwd.png', `${outside}/secret.png`, 'link.png', 'dir-link/secret.png', 'a.png\0.md']) {
    const r = await resolveAsset(root, p);
    assert.equal(r.ok, false, p);
    assert.ok([400, 403, 404].includes(r.code), `${p} -> ${r.code}`);
  }
});

test('missing files are 404 and oversized files are 413', async () => {
  assert.deepEqual(await resolveAsset(root, 'nope.png'), { ok: false, code: 404 });
  writeFileSync(join(root, 'huge.png'), Buffer.alloc(MAX_ASSET + 1));
  assert.deepEqual(await resolveAsset(root, 'huge.png'), { ok: false, code: 413 });
});

test('svg is served as an image but flagged so the server can sandbox it', async () => {
  writeFileSync(join(root, 'd.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const r = await resolveAsset(root, 'd.svg');
  assert.equal(r.type, 'image/svg+xml');
  assert.equal(r.sandbox, true);
});

test('embed theme tokens are filtered to known names and safe values before they reach the page', async () => {
  const { sanitizeTokens, embedPage } = await import('../../server/embed.mjs');
  const t = sanitizeTokens(JSON.stringify({
    '--accent': '#0071e3', '--font-body': "-apple-system, 'SF Pro Text', sans-serif", '--ink': 'rgba(0,0,0,.8)',
    '--bg': 'red;}body{display:none', '--card': '</style><script>alert(1)</script>', '--evil': 'x', '--muted': 'url(https://x.dev/a)',
  }));
  assert.deepEqual(Object.keys(t).sort(), ['--accent', '--font-body', '--ink']);
  assert.deepEqual(sanitizeTokens('not json'), {});
  assert.deepEqual(sanitizeTokens('[1]'), {});
  const html = embedPage('<p>x</p>', t);
  assert.match(html, /:root\{[^}]*--accent:#0071e3/);
  assert.ok(!html.includes('display:none') && !html.includes('alert(1)') && !html.includes('https://x.dev'));
});

test('the folder check ignores case on Windows only', async () => {
  const { inside } = await import('../../server/assets.mjs');
  assert.equal(inside('C:\\Plans', 'c:\\plans\\a.png', 'win32'), true);
  assert.equal(inside('C:\\Plans', 'c:\\plans2\\a.png', 'win32'), false);
  assert.equal(inside('C:\\Plans', 'D:\\plans\\a.png', 'win32'), false);
  assert.equal(inside('/plans', '/plans/a.png', 'linux'), true);
  assert.equal(inside('/Plans', '/plans/a.png', 'linux'), false);
  assert.equal(inside('/plans', '/plans2/a.png', 'linux'), false);
});
