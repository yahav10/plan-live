import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { tempPlan, sleep } from './helpers.mjs';
import { parse } from '../../server/parse.mjs';

const CLI = fileURLToPath(new URL('../../bin/plan-live.mjs', import.meta.url));
const env = { ...process.env, PLAN_LIVE_HOME: mkdtempSync(join(tmpdir(), 'plan-live-cli-')) };

function run(args, { input = '', timeoutMs = 10_000 } = {}) {
  return new Promise((resolveRun, reject) => {
    const p = spawn(process.execPath, [CLI, ...args], { env });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => (stdout += d));
    p.stderr.on('data', d => (stderr += d));
    const t = setTimeout(() => { p.kill(); reject(new Error(`timeout: ${args.join(' ')}`)); }, timeoutMs);
    p.on('close', code => { clearTimeout(t); resolveRun({ code, stdout, stderr }); });
    p.stdin.end(input);
  });
}

let server, plan, dir, url;
before(async () => {
  ({ plan, dir } = tempPlan());
  server = spawn(process.execPath, [CLI, 'serve', plan], { env });
  url = await new Promise(r => server.stdout.once('data', d => r(JSON.parse(String(d).split('\n')[0]).url)));
});
after(() => server.kill('SIGTERM'));

const api = async (method, path, body) => {
  const { origin, searchParams } = new URL(url);
  const res = await fetch(origin + path, { method, headers: { 'x-plan-live-key': searchParams.get('key') }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
};
const comment = body => api('POST', '/api/comments', { anchor: { sectionId: 'goals' }, body });

test('serve twice reuses the running server', async () => {
  const r = await run(['serve', plan]);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.stdout.split('\n')[0]), { url, reused: true });
});

test('status prints JSON', async () => {
  const r = await run(['status', plan]);
  assert.equal(JSON.parse(r.stdout).pendingBatches, 0);
});

test('watch exits 0 with the batch text after Apply', async () => {
  const w = run(['watch', plan]);
  await sleep(300);
  const c = await comment('watch me');
  await api('POST', '/api/apply');
  const r = await w;
  assert.equal(r.code, 0);
  assert.match(r.stdout, /plan-live review batch/);
  assert.match(r.stdout, new RegExp(c.id));
  const res = await run(['resolve', plan, c.id, '--status', 'resolved', '--note', 'done']);
  assert.equal(res.code, 0, res.stderr);
  const again = await run(['resolve', plan, c.id, '--status', 'resolved', '--note', 'done']);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /not queued/);
});

test('hook prompt is silent and fast when no server is registered for the cwd', async () => {
  const t0 = Date.now();
  const r = await run(['hook', 'prompt'], { input: JSON.stringify({ cwd: tmpdir() + '/nowhere' }) });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.ok(Date.now() - t0 < 1500);
});

test('hook prompt injects a pending batch when no watcher is connected; hook stop blocks once', async () => {
  await sleep(5200);
  const c = await comment('via hook');
  await api('POST', '/api/apply');
  const r = await run(['hook', 'prompt'], { input: JSON.stringify({ cwd: dir }) });
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, new RegExp(c.id));
  const stop = await run(['hook', 'stop'], { input: JSON.stringify({ cwd: dir, stop_hook_active: false }) });
  assert.equal(JSON.parse(stop.stdout).decision, 'block');
  assert.match(JSON.parse(stop.stdout).reason, new RegExp(c.id));
  const again = await run(['hook', 'stop'], { input: JSON.stringify({ cwd: dir, stop_hook_active: true }) });
  assert.equal(again.stdout, '');
  await run(['resolve', plan, c.id, '--status', 'declined', '--note', 'n/a']);
});

test('hook prompt reports a rejected revision once', async () => {
  const t = parse(readFileSync(plan, 'utf8')).tasks.find(x => x.text === 'Implement parse');
  const c = await api('POST', '/api/comments', { anchor: { sectionId: t.sectionId, taskId: t.id, quote: t.text }, body: 'rename' });
  await api('POST', '/api/apply');
  await api('GET', '/api/wait?nowait=1');
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('Implement parse', 'Implement parse v2'));
  await run(['resolve', plan, c.id, '--status', 'resolved', '--note', 'renamed']);
  const review = await api('GET', '/api/review');
  await api('POST', `/api/revisions/${review.revisions.at(-1).id}`, { action: 'reject' });
  const r = await run(['hook', 'prompt'], { input: JSON.stringify({ cwd: dir }) });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /do not re-apply/);
  assert.equal((await run(['hook', 'prompt'], { input: JSON.stringify({ cwd: dir }) })).stdout, '');
});

test('watch exits 3 when no server exists for the plan', async () => {
  const r = await run(['watch', join(tmpdir(), 'missing-plan.md')], { timeoutMs: 15_000 });
  assert.equal(r.code, 3);
});

test('hooks.json wires UserPromptSubmit and Stop only', () => {
  const h = JSON.parse(readFileSync(new URL('../../hooks/hooks.json', import.meta.url), 'utf8')).hooks;
  assert.deepEqual(Object.keys(h).sort(), ['Stop', 'UserPromptSubmit']);
  assert.match(h.UserPromptSubmit[0].hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/plan-live\.mjs" hook prompt$/);
});
