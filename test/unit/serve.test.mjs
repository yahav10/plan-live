import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { createPlanServer } from '../../server/serve.mjs';
import { parse } from '../../server/parse.mjs';
import { tempPlan, client, sse, sleep } from './helpers.mjs';

let srv;
afterEach(async () => { await srv?.close(); srv = null; });
const start = async (fixture, opts = {}) => {
  const t = tempPlan(fixture);
  srv = await createPlanServer({ planPath: t.plan, waitTimeoutMs: 300, ...opts });
  return { ...t, api: client(srv) };
};
const taskByText = (text, plan) => parse(readFileSync(plan, 'utf8')).tasks.find(t => t.text === text);
const anchorOf = (task) => ({ sectionId: task.sectionId, taskId: task.id, quote: task.text });

test('binds 127.0.0.1 and rejects requests without the key', async () => {
  await start();
  assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+\/\?key=[0-9a-f]{64}$/);
  assert.equal((await fetch(`http://127.0.0.1:${srv.port}/api/plan`)).status, 401);
  const viaQuery = await fetch(srv.url);
  assert.equal(viaQuery.status, 200);
  const cookie = viaQuery.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`plk_${srv.port}=[0-9a-f]{64}; HttpOnly; SameSite=Strict`));
  assert.equal((await fetch(`http://127.0.0.1:${srv.port}/api/plan`, { headers: { cookie: cookie.split(';')[0] } })).status, 200);
});

test('GET /api/plan returns the parsed model', async () => {
  const { api } = await start();
  const { data } = await api('GET', '/api/plan');
  assert.equal(data.model.title, 'Mini Plan');
  assert.equal(data.file, 'plan.md');
  assert.deepEqual(data.defaults, {});
});

test('static files are served and path traversal is refused', async () => {
  const { api } = await start();
  assert.equal((await api('GET', '/')).status, 200);
  assert.equal((await api('GET', '/..%2fpackage.json')).status, 403);
  assert.equal((await api('GET', '/nope.js')).status, 404);
});

test('apply wakes a pending long-poll; drafts alone never do', async () => {
  const { api, plan } = await start();
  const t = taskByText('Implement parse', plan);
  await api('POST', '/api/comments', { anchor: anchorOf(t), body: 'use the helper' });
  assert.equal((await api('GET', '/api/wait?nowait=1')).status, 204);
  const waiting = api('GET', '/api/wait');
  await sleep(50);
  assert.equal((await api('GET', '/api/status')).data.watcherConnected, true);
  assert.equal((await api('POST', '/api/apply')).status, 201);
  const r = await waiting;
  assert.equal(r.status, 200);
  assert.match(r.data.text, /plan-live review batch b_[0-9a-f]+ .* 1 comment/);
  assert.equal((await api('GET', '/api/status')).data.unresolvedInPicked, 1);
  assert.equal((await api('POST', '/api/apply')).status, 409);
});

test('wait times out with 204 so the watcher can re-poll', async () => {
  const { api } = await start();
  assert.equal((await api('GET', '/api/wait')).status, 204);
});

test('toggle flips the checkbox when the line hash matches, 409 otherwise', async () => {
  const { api, plan } = await start();
  const t = taskByText('Implement parse', plan);
  assert.equal((await api('POST', `/api/tasks/${encodeURIComponent(t.id)}/toggle`, { lineHash: 'stale0000000' })).status, 409);
  assert.equal((await api('POST', `/api/tasks/${encodeURIComponent(t.id)}/toggle`, { lineHash: t.hash })).status, 200);
  assert.match(readFileSync(plan, 'utf8'), /- \[x\] Implement parse/);
  assert.equal((await api('POST', '/api/tasks/nope/toggle', { lineHash: 'x' })).status, 404);
});

test('toggle right after an external edit keeps that edit (re-reads before writing)', async () => {
  const { api, plan } = await start();
  writeFileSync(plan, 'Edited by Claude just now\n' + readFileSync(plan, 'utf8'));
  const t = taskByText('Implement parse', plan);
  assert.equal((await api('POST', `/api/tasks/${encodeURIComponent(t.id)}/toggle`, { lineHash: t.hash })).status, 200);
  const text = readFileSync(plan, 'utf8');
  assert.match(text, /^Edited by Claude just now\n/);
  assert.match(text, /- \[x\] Implement parse/);
});

test('toggle preserves CRLF endings and the missing trailing newline', async () => {
  const { api, plan } = await start('crlf.md');
  const t = taskByText('one', plan);
  await api('POST', `/api/tasks/${encodeURIComponent(t.id)}/toggle`, { lineHash: t.hash });
  assert.equal(readFileSync(plan, 'utf8'), '# CRLF plan\r\n\r\n## Steps\r\n- [x] one\r\n- [ ] two');
});

async function reviseOnce(api, plan, edit) {
  const t = taskByText('Implement parse', plan);
  const { data: c } = await api('POST', '/api/comments', { anchor: anchorOf(t), body: 'rename it' });
  await api('POST', '/api/apply');
  await api('GET', '/api/wait?nowait=1');
  writeFileSync(plan, edit(readFileSync(plan, 'utf8')));
  await api('POST', '/api/resolve', { commentId: c.id, status: 'resolved', note: 'renamed' });
  return { c, review: (await api('GET', '/api/review')).data };
}

test('resolve immediately after an edit still records the edit as a linked revision', async () => {
  const { api, plan } = await start();
  const { c, review } = await reviseOnce(api, plan, s => s.replace('Implement parse', 'Implement parse with fences'));
  assert.equal(review.revisions.length, 1);
  assert.equal(review.revisions[0].commentId, c.id);
  assert.deepEqual(review.revisions[0].hunk.bLines, ['- [ ] Implement parse with fences']);
});

test('reject reverts the hunk in the file; accept leaves it', async () => {
  const { api, plan } = await start();
  const { review } = await reviseOnce(api, plan, s => s.replace('Implement parse', 'Implement parse v2'));
  const r = await api('POST', `/api/revisions/${review.revisions[0].id}`, { action: 'reject' });
  assert.equal(r.data.status, 'rejected');
  assert.match(readFileSync(plan, 'utf8'), /- \[ \] Implement parse\n/);
  const rj = await api('GET', '/api/rejections');
  assert.match(rj.data.text, /rejected your change/);
  assert.equal((await api('GET', '/api/rejections')).data.text, '');
});

test('reject after the user edited the same lines again becomes a conflict and leaves the file', async () => {
  const { api, plan } = await start();
  const { review } = await reviseOnce(api, plan, s => s.replace('Implement parse', 'Implement parse v2'));
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('Implement parse v2', 'Implement parse v3'));
  const before = readFileSync(plan, 'utf8');
  const r = await api('POST', `/api/revisions/${review.revisions[0].id}`, { action: 'reject' });
  assert.equal(r.data.status, 'conflict');
  assert.equal(readFileSync(plan, 'utf8'), before);
});

test('a user toggle during an open batch is not reported as Claude’s revision', async () => {
  const { api, plan } = await start();
  const t = taskByText('Implement parse', plan);
  const { data: c } = await api('POST', '/api/comments', { anchor: { sectionId: 'goals' }, body: 'x' });
  await api('POST', '/api/apply');
  await api('GET', '/api/wait?nowait=1');
  await api('POST', `/api/tasks/${encodeURIComponent(t.id)}/toggle`, { lineHash: t.hash });
  await api('POST', '/api/resolve', { commentId: c.id, status: 'declined', note: 'no change' });
  assert.equal((await api('GET', '/api/review')).data.revisions.length, 0);
});

test('SSE pushes a plan event within 1s of an external edit, and gone on delete', async () => {
  const { plan } = await start();
  const ev = await sse(srv);
  await ev.next('plan');
  writeFileSync(plan, readFileSync(plan, 'utf8') + '\n## Added\n');
  const p = await ev.next('plan', 1000);
  assert.ok(p.model.sections.some(s => s.heading === 'Added'));
  assert.equal(p.changedBy, 'Claude');
  unlinkSync(plan);
  await ev.next('gone', 1000);
  ev.close();
});

test('bad JSON body is a 400, not a crash', async () => {
  await start();
  const res = await fetch(`http://127.0.0.1:${srv.port}/api/comments`, { method: 'POST', headers: { 'x-plan-live-key': srv.key }, body: '{' });
  assert.equal(res.status, 400);
});

test('rejecting a revision does not resurface the rejected text as a new revision in an open batch', async () => {
  const { api, plan } = await start();
  const { review } = await reviseOnce(api, plan, s => s.replace('Implement parse', 'Implement parse v2'));
  const { data: second } = await api('POST', '/api/comments', { anchor: { sectionId: 'goals' }, body: 'second' });
  await api('POST', '/api/apply');
  await api('GET', '/api/wait?nowait=1');
  await api('POST', `/api/revisions/${review.revisions[0].id}`, { action: 'reject' });
  await api('POST', '/api/resolve', { commentId: second.id, status: 'declined', note: 'no change' });
  assert.equal((await api('GET', '/api/review')).data.revisions.length, 1);
});

const raw = (method, path, headers, body) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port: srv.port, method, path, headers: { 'x-plan-live-key': srv.key, ...headers } }, m => {
    m.resume();
    m.on('end', () => res(m.statusCode));
  });
  r.on('error', rej);
  r.end(body);
});

test('cross-origin writes and foreign Host headers are refused', async () => {
  await start();
  const body = JSON.stringify({ anchor: { sectionId: 'goals' }, body: 'x' });
  assert.equal(await raw('POST', '/api/comments', { origin: 'http://127.0.0.1:8080' }, body), 403);
  assert.equal(await raw('POST', '/api/comments', { origin: `http://127.0.0.1:${srv.port}` }, body), 201);
  assert.equal(await raw('POST', '/api/comments', {}, body), 201);
  assert.equal(await raw('GET', '/api/plan', { host: 'evil.example' }), 403);
  assert.equal(await raw('GET', '/api/plan', { host: `localhost:${srv.port}` }), 200);
});

test('toggle on a mixed line-ending file changes only the toggled line', async () => {
  const t = tempPlan('mini.md');
  writeFileSync(t.plan, '## S\n- [ ] a\r\n- [ ] b\nend');
  srv = await createPlanServer({ planPath: t.plan, waitTimeoutMs: 300 });
  const api = client(srv);
  const task = taskByText('a', t.plan);
  await api('POST', `/api/tasks/${encodeURIComponent(task.id)}/toggle`, { lineHash: task.hash });
  assert.equal(readFileSync(t.plan, 'utf8'), '## S\n- [x] a\r\n- [ ] b\nend');
});

test('the next batch carries earlier reject outcomes so a watcher-only user still reports them', async () => {
  const { api, plan } = await start();
  const { review } = await reviseOnce(api, plan, s => s.replace('Implement parse', 'Implement parse v2'));
  await api('POST', `/api/revisions/${review.revisions[0].id}`, { action: 'reject' });
  await api('POST', '/api/comments', { anchor: { sectionId: 'goals' }, body: 'again' });
  await api('POST', '/api/apply');
  const { data } = await api('GET', '/api/wait?nowait=1');
  assert.match(data.text, /rejected your change/);
  assert.equal((await api('GET', '/api/rejections')).data.text, '');
});

test('GET /api/source returns the plan file byte for byte, including CRLF', async () => {
  const { api, plan } = await start('crlf.md');
  const { status, data } = await api('GET', '/api/source');
  assert.equal(status, 200);
  assert.equal(data.text, readFileSync(plan, 'utf8'));
  writeFileSync(plan, 'edited\r\n');
  assert.equal((await api('GET', '/api/source')).data.text, 'edited\r\n');
});

test('every response carries a strict CSP, no-referrer, nosniff and frame denial', async () => {
  const { api } = await start();
  for (const path of ['/', '/api/plan', '/nope.js']) {
    const { headers } = await api('GET', path);
    assert.match(headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(headers.get('content-security-policy'), /object-src 'none'/);
    assert.match(headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(headers.get('referrer-policy'), 'no-referrer');
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
  }
});

test('the batch from a real apply names the line range of each commented section and an outline', async () => {
  const { api, plan } = await start();
  const model = parse(readFileSync(plan, 'utf8'));
  const goals = model.sections.find(s => s.id === 'goals'), t2 = model.sections.find(s => s.id.startsWith('task-2'));
  const task = taskByText('Implement parse', plan);
  await api('POST', '/api/comments', { anchor: anchorOf(task), body: 'rename' });
  await api('POST', '/api/comments', { anchor: { sectionId: 'goals' }, body: 'more' });
  await api('POST', '/api/apply');
  const { data } = await api('GET', '/api/wait?nowait=1');
  assert.match(data.text, /Plan outline/);
  assert.ok(data.text.includes(`${goals.line}-${goals.endLine} Goals`));
  assert.ok(data.text.includes(`${t2.line}-${t2.endLine} ${t2.heading}`));
  const sec = model.sections.find(s => s.id === task.sectionId);
  assert.match(data.text, new RegExp(`\\[c_[^\\]]+\\] comment on § ${task.sectionId}[^\\n]*\\n\\s+context: lines ${sec.line}-${sec.endLine}`));
  assert.match(data.text, new RegExp(`§ goals\\n\\s+context: lines ${goals.line}-${goals.endLine}`));
});

test('a run request goes through the real server and reaches the watcher as an execute instruction', async () => {
  const { api, plan } = await start();
  const task1 = parse(readFileSync(plan, 'utf8')).sections.find(s => s.node?.key === 'T2');
  const made = await api('POST', '/api/comments', { anchor: { sectionId: task1.id }, kind: 'run' });
  assert.equal(made.status, 201);
  assert.equal(made.data.body, 'Run this section');
  assert.equal((await api('POST', '/api/comments', { anchor: { sectionId: task1.id }, kind: 'run' })).status, 409);
  assert.equal((await api('POST', '/api/apply')).status, 201);
  const r = await api('GET', '/api/wait?nowait=1');
  assert.match(r.data.text, new RegExp(`run on § ${task1.id}`));
  assert.match(r.data.text, /Execute this section: work through its unchecked steps in order/);
  assert.match(r.data.text, /context: lines \d+-\d+/);
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const rawGet = (srv, path, key = srv.key) => fetch(`http://127.0.0.1:${srv.port}${path}`, { headers: key ? { 'x-plan-live-key': key } : {} });

test('plan assets: an image beside the plan is served with its type and nosniff', async () => {
  const { dir } = await start();
  writeFileSync(join(dir, 'pic.png'), PNG);
  const r = await rawGet(srv, '/plan-assets/pic.png');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  assert.equal((await rawGet(srv, '/plan-assets/pic.png', '')).status, 401, 'the session key is still required');
  assert.equal((await rawGet(srv, '/plan-assets/missing.png')).status, 404);
});

test('plan assets: the plan, its review data and files outside the folder are never served', async () => {
  const { dir, plan } = await start();
  writeFileSync(join(dir, '..', 'secret.png'), 'SECRET');
  symlinkSync(join(dir, '..', 'secret.png'), join(dir, 'link.png'));
  for (const p of ['plan.md', 'plan.review.json', '..%2Fsecret.png', '%2e%2e/secret.png', 'link.png']) {
    const r = await rawGet(srv, `/plan-assets/${p}`);
    assert.notEqual(r.status, 200, p);
    assert.ok(!(await r.text()).includes('SECRET'), p);
  }
  assert.ok(readFileSync(plan, 'utf8').length > 0);
});

test('plan assets: svg is served inside a sandbox that cannot run script', async () => {
  const { dir } = await start();
  writeFileSync(join(dir, 'd.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const r = await rawGet(srv, '/plan-assets/d.svg');
  assert.equal(r.headers.get('content-type'), 'image/svg+xml');
  assert.match(r.headers.get('content-security-policy'), /^sandbox;.*default-src 'none'/);
});

test('embed route: serves the block code under a locked-down policy that only allows frames from the same origin', async () => {
  const { dir, plan, api } = await start();
  writeFileSync(plan, readFileSync(plan, 'utf8') + '\n## Motion\n```embed height=200\n<div id="out">hello</div><script>document.getElementById("out").textContent="ran"</script>\n```\n');
  await sleep(250);
  const model = (await api('GET', '/api/plan')).data.model;
  const block = model.sections.flatMap(s => s.blocks).find(b => b.type === 'embed');
  assert.ok(block, 'the embed block is in the model');
  const r = await rawGet(srv, `/embed/${block.id}`);
  assert.equal(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /sandbox allow-scripts/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /default-src 'none'/);
  assert.ok(!/allow-same-origin/.test(csp));
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(await r.text(), /<div id="out">hello<\/div><script>/);
  assert.equal((await rawGet(srv, '/embed/000000000000')).status, 404);
  assert.equal((await rawGet(srv, `/embed/${block.id}`, '')).status, 401);
  const main = await rawGet(srv, '/');
  assert.match(main.headers.get('content-security-policy'), /script-src 'self';/);
  assert.match(main.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(main.headers.get('x-frame-options'), 'DENY');
  assert.ok(dir);
});
