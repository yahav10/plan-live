#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { createPlanServer } from '../server/serve.mjs';
import { reviewPathFor } from '../server/review-store.mjs';
import * as registry from '../server/registry.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const k = rest[i].slice(2);
    flags[k] = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  } else args.push(rest[i]);
}

const die = (msg, code) => { console.error(`plan-live: ${msg}`); process.exit(code); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(entry, method, path, body, timeoutMs = 30_000) {
  const res = await fetch(`http://127.0.0.1:${entry.port}${path}`, {
    method,
    headers: { 'x-plan-live-key': entry.key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

async function need(plan, waitMs = 0) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const e = registry.lookup(plan);
    if (e) return e;
    if (Date.now() >= deadline) die(`no server for ${plan}. Start it with: plan-live serve "${plan}"`, 3);
    await sleep(200);
  }
}

function config() {
  try { return JSON.parse(readFileSync(join(homedir(), '.claude', 'plan-live.json'), 'utf8')); } catch { return {}; }
}

function openUrl(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
}

async function readStdin() {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

async function serve() {
  const plan = resolve(args[0] ?? '');
  if (!args[0] || !existsSync(plan)) die(`plan file not found: ${args[0] ?? '(none given)'}`, 2);
  const existing = registry.lookup(plan);
  if (existing) {
    console.log(JSON.stringify({ url: existing.url, reused: true }));
    if (flags.open) openUrl(existing.url);
    return;
  }
  const cfg = config();
  const firstRun = !existsSync(reviewPathFor(plan));
  let srv;
  const shutdown = async () => {
    registry.unregister(plan);
    await srv?.close();
    process.exit(0);
  };
  srv = await createPlanServer({
    planPath: plan,
    defaults: { theme: flags.theme ?? cfg.theme ?? 'aurora', mode: flags.mode ?? cfg.mode ?? 'auto' },
    onGone: () => setTimeout(() => { if (!existsSync(plan)) shutdown(); }, 60_000),
  });
  registry.register({ pid: process.pid, port: srv.port, key: srv.key, url: srv.url, plan });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(JSON.stringify({ url: srv.url }));
  if (firstRun) console.log('tip: *.review.json is personal review state; add it to .gitignore unless you want the history committed');
  if (flags.open) openUrl(srv.url);
}

async function watchBatch() {
  const plan = resolve(args[0] ?? '');
  const entry = await need(plan, 5000);
  for (;;) {
    let r;
    try { r = await api(entry, 'GET', '/api/wait', undefined, 60_000); } catch { die('server went away', 3); }
    if (r.status === 200) { console.log(r.data.text); process.exit(0); }
    if (r.status !== 204) die(`unexpected ${r.status} from server`, 3);
  }
}

async function resolveComment() {
  const plan = resolve(args[0] ?? '');
  const entry = await need(plan);
  const r = await api(entry, 'POST', '/api/resolve', { commentId: args[1], status: flags.status, note: typeof flags.note === 'string' ? flags.note : '' });
  if (r.status !== 200) die(r.data?.error ?? `HTTP ${r.status}`, 1);
  console.log(`resolved ${args[1]} as ${flags.status}`);
}

async function hook(kind) {
  const input = await readStdin();
  const parts = [];
  for (const e of registry.forCwd(input.cwd ?? process.cwd())) {
    try {
      const { data: st } = await api(e, 'GET', '/api/status', undefined, 300);
      if (kind === 'prompt') {
        if (st.pendingBatches > 0 && !st.watcherConnected) {
          const r = await api(e, 'GET', '/api/wait?nowait=1', undefined, 300);
          if (r.status === 200) parts.push(r.data.text);
        }
        const rj = await api(e, 'GET', '/api/rejections', undefined, 300);
        if (rj.data?.text) parts.push(rj.data.text);
      } else if (kind === 'stop' && !input.stop_hook_active && st.unresolvedInPicked > 0) {
        parts.push(`plan-live: ${st.unresolvedInPicked} comment(s) on ${e.plan} are still unresolved (${st.unresolvedIds.join(', ')}). Resolve or decline each with plan-live resolve before finishing.`);
      }
    } catch {
      // An unreachable server must never block the user's prompt or stop.
    }
  }
  if (!parts.length) return;
  if (kind === 'prompt') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: parts.join('\n\n') } }));
  } else {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: parts.join('\n') }));
  }
}

switch (cmd) {
  case 'serve': await serve(); break;
  case 'watch': await watchBatch(); break;
  case 'resolve': await resolveComment(); break;
  case 'status': {
    const entry = await need(resolve(args[0] ?? ''));
    console.log(JSON.stringify((await api(entry, 'GET', '/api/status')).data));
    break;
  }
  case 'stop': {
    const entry = await need(resolve(args[0] ?? ''));
    process.kill(entry.pid, 'SIGTERM');
    break;
  }
  case 'hook': await hook(args[0]); break;
  default:
    die('usage: plan-live serve|watch|resolve|status|stop <plan.md> … | hook prompt|stop', 2);
}
