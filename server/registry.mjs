import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

export const home = () => process.env.PLAN_LIVE_HOME ?? join(homedir(), '.claude', 'plan-live');
const dir = () => join(home(), 'servers');
const fileFor = plan => join(dir(), createHash('sha1').update(resolve(plan)).digest('hex') + '.json');
const alive = pid => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

export function register(entry) {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  writeFileSync(fileFor(entry.plan), JSON.stringify({ ...entry, plan: resolve(entry.plan) }), { mode: 0o600 });
}

export function unregister(plan) {
  rmSync(fileFor(plan), { force: true });
}

export function list() {
  let files;
  try { files = readdirSync(dir()); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const p = join(dir(), f);
    try {
      const e = JSON.parse(readFileSync(p, 'utf8'));
      if (alive(e.pid)) out.push(e); else rmSync(p, { force: true });
    } catch {
      rmSync(p, { force: true });
    }
  }
  return out;
}

export const lookup = plan => list().find(e => e.plan === resolve(plan)) ?? null;

export function forCwd(cwd) {
  const root = resolve(cwd) + sep;
  return list().filter(e => e.plan.startsWith(root));
}
