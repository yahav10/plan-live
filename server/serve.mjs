import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, basename, join, extname, resolve, normalize } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from './parse.mjs';
import { splitLines, joinLines, lineHash, diffLines, revertHunk } from './diff.mjs';
import { createStore, linkHunks, StoreError } from './review-store.mjs';
import { formatBatch, formatRejections } from './format.mjs';

const UI_DIR = fileURLToPath(new URL('../ui/', import.meta.url));
const CLI = fileURLToPath(new URL('../bin/plan-live.mjs', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json',
};
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
const flip = line => line.replace(/\[( |x|X)\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));

function json(res, code, data) {
  if (code === 204) return res.writeHead(204).end();
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new StoreError(413, 'body too large');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new StoreError(400, 'invalid JSON body'); }
}

export async function createPlanServer({ planPath, port = 0, key = randomBytes(32).toString('hex'), defaults = {}, onGone = () => {}, waitTimeoutMs = 25_000 }) {
  planPath = resolve(planPath);
  const store = createStore(planPath);
  const clients = new Set(), waiters = new Set();
  let text = readFileSync(planPath, 'utf8');
  let model = parse(text), changedAt = Date.now(), changedBy = 'file', lastWaitAt = 0, gone = false, debounce = null;
  store.reanchor(model);

  const send = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };
  const planPayload = () => ({ model, fileHash: lineHash(text), changedAt, changedBy, path: planPath, file: basename(planPath), defaults });
  const reviewPayload = () => ({ ...store.state, notice: store.takeNotice() });
  const status = () => ({ ...store.status(), watcherConnected: waiters.size > 0 || Date.now() - lastWaitAt < 5000 });
  const broadcastReview = () => send('review', reviewPayload());

  function setText(next, by) {
    if (next === text) return;
    text = next;
    model = parse(text);
    changedAt = Date.now();
    changedBy = by;
    store.reanchor(model);
    send('plan', planPayload());
    broadcastReview();
  }
  function syncNow() {
    clearTimeout(debounce);
    if (!existsSync(planPath)) {
      if (!gone) { gone = true; send('gone', {}); onGone(); }
      return false;
    }
    gone = false;
    setText(readFileSync(planPath, 'utf8'), 'Claude');
    return true;
  }
  function writePlan(next) {
    writeFileSync(planPath, next);
    setText(next, 'you');
  }

  const fsWatcher = watch(dirname(planPath), (_event, name) => {
    if (name && name !== basename(planPath)) return;
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, 100);
  });

  const batchPayload = b => {
    const comments = b.commentIds.map(id => store.state.comments.find(c => c.id === id));
    const outcomes = store.takeUnreported();
    const tail = outcomes.length ? `\n\n${formatRejections({ revisions: outcomes, comments: store.state.comments, plan: planPath })}` : '';
    return { batch: b, comments, text: formatBatch({ batch: b, comments, plan: planPath, cli: CLI }) + tail };
  };
  function wake() {
    for (const w of [...waiters]) {
      const b = store.pickPending();
      if (!b) break;
      clearTimeout(w.timer);
      waiters.delete(w);
      json(w.res, 200, batchPayload(b));
      broadcastReview();
    }
  }
  function wait(res, nowait) {
    lastWaitAt = Date.now();
    const b = store.pickPending();
    if (b) { broadcastReview(); return json(res, 200, batchPayload(b)); }
    if (nowait) return json(res, 204);
    const w = { res, timer: setTimeout(() => { waiters.delete(w); lastWaitAt = Date.now(); json(res, 204); }, waitTimeoutMs) };
    waiters.add(w);
    res.on('close', () => { clearTimeout(w.timer); waiters.delete(w); });
  }

  function recordRevisions(batch) {
    const hunks = diffLines(splitLines(batch.snapshot).lines, splitLines(text).lines);
    const comments = batch.commentIds.map(id => store.state.comments.find(c => c.id === id));
    store.addRevisions(batch.id, linkHunks(hunks, comments, model));
  }

  function toggle(taskId, { lineHash: expected }, res) {
    if (!syncNow()) return json(res, 410, { error: 'plan file is gone' });
    const task = model.tasks.find(t => t.id === taskId);
    if (!task) return json(res, 404, { error: 'no such task' });
    const doc = splitLines(text), line = doc.lines[task.line - 1];
    if (lineHash(line) !== expected) return json(res, 409, { error: 'plan changed' });
    const flipped = flip(line);
    doc.lines[task.line - 1] = flipped;
    store.patchSnapshots(snap => {
      const s = splitLines(snap);
      const hits = s.lines.flatMap((l, i) => (l === line ? [i] : []));
      if (hits.length === 1) s.lines[hits[0]] = flipped;
      return joinLines(s);
    });
    writePlan(joinLines(doc));
    return json(res, 200, { ok: true });
  }

  function revision(id, { action }, res) {
    const r = store.state.revisions.find(x => x.id === id);
    if (!r) return json(res, 404, { error: `no revision ${id}` });
    if (action === 'accept') store.setRevision(id, 'accepted');
    else if (action === 'reject') {
      if (!syncNow()) return json(res, 410, { error: 'plan file is gone' });
      const out = revertHunk(text, r.hunk);
      store.setRevision(id, out.ok ? 'rejected' : 'conflict');
      if (out.ok) {
        store.patchSnapshots(snap => { const o = revertHunk(snap, r.hunk); return o.ok ? o.text : snap; });
        writePlan(out.text);
      }
    } else return json(res, 400, { error: 'action must be accept|reject' });
    broadcastReview();
    return json(res, 200, store.state.revisions.find(x => x.id === id));
  }

  async function serveStatic(pathname, res) {
    let rel;
    try { rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)); } catch { return json(res, 400, { error: 'bad path' }); }
    const abs = normalize(join(UI_DIR, rel));
    if (!abs.startsWith(UI_DIR)) return json(res, 403, { error: 'forbidden' });
    try {
      const buf = await readFile(abs);
      res.writeHead(200, { 'content-type': TYPES[extname(abs)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    } catch {
      json(res, 404, { error: 'not found' });
    }
  }

  const keyBuf = Buffer.from(key);
  const matches = v => { const b = Buffer.from(String(v ?? '')); return b.length === keyBuf.length && timingSafeEqual(b, keyBuf); };
  const cookieName = () => `plk_${server.address().port}`;
  const cookieKey = req => (req.headers.cookie ?? '').split(/;\s*/).find(c => c.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);

  async function handle(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url, 'http://127.0.0.1');
    const self = `127.0.0.1:${server.address().port}`;
    const host = req.headers.host;
    if ((host !== self && host !== `localhost:${server.address().port}`) || (req.headers.origin && req.headers.origin !== `http://${self}` && req.headers.origin !== `http://localhost:${server.address().port}`)) return json(res, 403, { error: 'forbidden origin' });
    const viaQuery = matches(url.searchParams.get('key'));
    if (!viaQuery && !matches(req.headers['x-plan-live-key']) && !matches(cookieKey(req))) return json(res, 401, { error: 'missing or wrong key' });
    if (viaQuery) res.setHeader('set-cookie', `${cookieName()}=${key}; HttpOnly; SameSite=Strict; Path=/`);
    const route = `${req.method} ${url.pathname}`;
    let m;
    try {
      if (route === 'GET /api/plan') return json(res, 200, planPayload());
      if (route === 'GET /api/review') return json(res, 200, reviewPayload());
      if (route === 'GET /api/status') return json(res, 200, status());
      if (route === 'GET /api/source') { syncNow(); return json(res, 200, { text }); }
      if (route === 'GET /events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: plan\ndata: ${JSON.stringify(planPayload())}\n\n`);
        res.write(`event: review\ndata: ${JSON.stringify(reviewPayload())}\n\n`);
        clients.add(res);
        res.on('close', () => clients.delete(res));
        return;
      }
      if (route === 'POST /api/comments') {
        const c = store.addComment(await readBody(req));
        broadcastReview();
        return json(res, 201, c);
      }
      if ((m = url.pathname.match(/^\/api\/comments\/([\w-]+)$/))) {
        if (req.method === 'PATCH') { const c = store.updateComment(m[1], await readBody(req)); broadcastReview(); return json(res, 200, c); }
        if (req.method === 'DELETE') { store.deleteComment(m[1]); broadcastReview(); return json(res, 204); }
      }
      if (route === 'POST /api/apply') {
        syncNow();
        const b = store.apply(text);
        if (!b) return json(res, 409, { error: 'no draft comments to apply' });
        broadcastReview();
        wake();
        return json(res, 201, b);
      }
      if (route === 'GET /api/wait') return wait(res, url.searchParams.has('nowait'));
      if (route === 'POST /api/resolve') {
        const { commentId, status: st, note } = await readBody(req);
        syncNow();
        const r = store.resolve(commentId, st, note ?? '');
        if (r.batchDone) recordRevisions(r.batchDone);
        broadcastReview();
        return json(res, 200, r.comment);
      }
      if ((m = url.pathname.match(/^\/api\/revisions\/([\w-]+)$/)) && req.method === 'POST') return revision(m[1], await readBody(req), res);
      if ((m = url.pathname.match(/^\/api\/tasks\/(.+)\/toggle$/)) && req.method === 'POST') return toggle(decodeURIComponent(m[1]), await readBody(req), res);
      if (route === 'GET /api/rejections') {
        const revisions = store.takeUnreported();
        return json(res, 200, { text: revisions.length ? formatRejections({ revisions, comments: store.state.comments, plan: planPath }) : '' });
      }
      if (req.method === 'GET') return serveStatic(url.pathname, res);
      return json(res, 404, { error: 'not found' });
    } catch (e) {
      if (e instanceof StoreError) return json(res, e.code, { error: e.message });
      return json(res, 500, { error: String(e?.message ?? e) });
    }
  }

  const server = http.createServer(handle);
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const actual = server.address().port;
  const ping = setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 15_000);

  return {
    port: actual,
    key,
    url: `http://127.0.0.1:${actual}/?key=${key}`,
    close: () => new Promise(r => {
      clearInterval(ping);
      clearTimeout(debounce);
      fsWatcher.close();
      for (const w of waiters) { clearTimeout(w.timer); w.res.end(); }
      for (const c of clients) c.end();
      server.close(() => r());
      server.closeAllConnections();
    }),
  };
}
