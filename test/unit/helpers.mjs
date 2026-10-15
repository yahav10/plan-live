import { mkdtempSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tempPlan(fixture = 'mini.md') {
  const dir = mkdtempSync(join(tmpdir(), 'plan-live-'));
  const plan = join(dir, 'plan.md');
  copyFileSync(new URL(`../fixtures/${fixture}`, import.meta.url), plan);
  return { dir, plan };
}

export function client(srv) {
  return async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${srv.port}${path}`, {
      method,
      headers: { 'x-plan-live-key': srv.key, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    return { status: res.status, data, headers: res.headers };
  };
}

export async function sse(srv) {
  const ctrl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${srv.port}/events`, { headers: { 'x-plan-live-key': srv.key }, signal: ctrl.signal });
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', pending = null;
  return {
    async next(name, timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (chunk.startsWith(`event: ${name}\n`)) return JSON.parse(chunk.slice(chunk.indexOf('data: ') + 6));
        }
        if (Date.now() > deadline) throw new Error(`no ${name} event within ${timeoutMs}ms`);
        pending ??= reader.read();
        const tick = new Promise(r => setTimeout(() => r(null), 50));
        const got = await Promise.race([pending, tick]);
        if (!got) continue;
        pending = null;
        if (got.done) throw new Error('stream closed');
        buf += dec.decode(got.value, { stream: true });
      }
    },
    close: () => ctrl.abort(),
  };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
