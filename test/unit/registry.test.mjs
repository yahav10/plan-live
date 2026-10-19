import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as reg from '../../server/registry.mjs';

beforeEach(() => { process.env.PLAN_LIVE_HOME = mkdtempSync(join(tmpdir(), 'plan-live-home-')); });

test('register + lookup by absolute or relative path', () => {
  const plan = join(process.cwd(), 'test/fixtures/mini.md');
  reg.register({ pid: process.pid, port: 1, key: 'k', url: 'u', plan });
  assert.equal(reg.lookup(plan).port, 1);
  assert.equal(reg.lookup('test/fixtures/mini.md').port, 1);
});

test('dead pids and garbage files are pruned', () => {
  reg.register({ pid: 2 ** 22 + 12345, port: 2, key: 'k', url: 'u', plan: '/tmp/dead.md' });
  writeFileSync(join(reg.home(), 'servers', 'junk.json'), '{');
  assert.deepEqual(reg.list(), []);
  assert.deepEqual(readdirSync(join(reg.home(), 'servers')), []);
});

test('forCwd returns plans under the directory only', () => {
  reg.register({ pid: process.pid, port: 3, key: 'k', url: 'u', plan: '/work/repo/docs/p.md' });
  reg.register({ pid: process.pid, port: 4, key: 'k', url: 'u', plan: '/work/other/p.md' });
  assert.deepEqual(reg.forCwd('/work/repo').map(e => e.port), [3]);
  assert.deepEqual(reg.forCwd('/work/repo-two'), []);
});

test('unregister removes the entry', () => {
  reg.register({ pid: process.pid, port: 5, key: 'k', url: 'u', plan: '/x/p.md' });
  reg.unregister('/x/p.md');
  assert.equal(reg.lookup('/x/p.md'), null);
});

test('missing registry directory is an empty list', () => {
  process.env.PLAN_LIVE_HOME = join(tmpdir(), 'plan-live-never-created-' + Date.now());
  assert.deepEqual(reg.list(), []);
});

// Windows has no POSIX permission bits; the files live under the user's profile, which only they can read.
test('registry entries holding the session key are owner-only', { skip: process.platform === 'win32' && 'no POSIX file modes on Windows' }, () => {
  reg.register({ pid: process.pid, port: 9, key: 'k', url: 'u', plan: '/x/secret.md' });
  const dir = join(reg.home(), 'servers');
  assert.equal(statSync(dir).mode & 0o077, 0);
  for (const f of readdirSync(dir)) assert.equal(statSync(join(dir, f)).mode & 0o077, 0);
});

test('on Windows a plan is found whatever the case of the drive letter and folders', () => {
  reg.register({ pid: process.pid, port: 6, key: 'k', url: 'u', plan: 'C:\\Users\\Tom\\Plans\\p.md' }, 'win32');
  assert.equal(reg.lookup('c:\\users\\tom\\plans\\p.md', 'win32')?.port, 6);
  assert.equal(reg.lookup('C:\\USERS\\Tom\\plans\\P.MD', 'win32')?.port, 6);
  assert.equal(reg.lookup('c:/Users/Tom/Plans/p.md', 'win32')?.port, 6, 'forward slashes name the same file');
  assert.equal(reg.lookup('C:\\Users\\Tom\\Plans\\other.md', 'win32'), null);
  assert.equal(reg.list().find(e => e.port === 6).plan, 'C:\\Users\\Tom\\Plans\\p.md', 'the stored path keeps its original case');
  reg.unregister('c:\\users\\tom\\plans\\p.md', 'win32');
  assert.equal(reg.lookup('C:\\Users\\Tom\\Plans\\p.md', 'win32'), null, 'unregister also ignores case');
});

test('on Windows the hooks find servers under a cwd reported in another case', () => {
  reg.register({ pid: process.pid, port: 7, key: 'k', url: 'u', plan: 'C:\\Work\\Repo\\docs\\p.md' }, 'win32');
  reg.register({ pid: process.pid, port: 8, key: 'k', url: 'u', plan: 'C:\\Work\\Repo-two\\p.md' }, 'win32');
  assert.deepEqual(reg.forCwd('c:\\work\\repo', 'win32').map(e => e.port), [7]);
  assert.deepEqual(reg.forCwd('C:\\WORK\\REPO\\', 'win32').map(e => e.port), [7]);
  assert.deepEqual(reg.forCwd('c:\\work', 'win32').map(e => e.port).sort(), [7, 8]);
  assert.deepEqual(reg.forCwd('c:\\', 'win32').map(e => e.port).sort(), [7, 8], 'a drive root works too');
});

test('on Linux and macOS paths stay case-sensitive', () => {
  reg.register({ pid: process.pid, port: 9, key: 'k', url: 'u', plan: '/Work/Plans/p.md' }, 'linux');
  assert.equal(reg.lookup('/Work/Plans/p.md', 'linux')?.port, 9);
  assert.equal(reg.lookup('/work/plans/p.md', 'linux'), null);
  assert.deepEqual(reg.forCwd('/work', 'linux'), []);
});
