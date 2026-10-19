import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, sep, win32 } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

export const home = () => process.env.PLAN_LIVE_HOME ?? join(homedir(), '.claude', 'plan-live');
const dir = () => join(home(), 'servers');
const abs = (p, plat) => (plat === 'win32' ? win32.resolve(p) : resolve(p));
// Windows paths are case-insensitive and tools disagree on the drive letter's case, so compare them folded.
export const pathKey = (p, plat = process.platform) => (plat === 'win32' ? abs(p, plat).toLowerCase() : abs(p, plat));
const fileFor = (plan, plat) => join(dir(), createHash('sha1').update(pathKey(plan, plat)).digest('hex') + '.json');
const alive = pid => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

export function register(entry, plat = process.platform) {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  writeFileSync(fileFor(entry.plan, plat), JSON.stringify({ ...entry, plan: abs(entry.plan, plat) }), { mode: 0o600 });
}

export function unregister(plan, plat = process.platform) {
  rmSync(fileFor(plan, plat), { force: true });
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

export const lookup = (plan, plat = process.platform) => list().find(e => pathKey(e.plan, plat) === pathKey(plan, plat)) ?? null;

export function forCwd(cwd, plat = process.platform) {
  const s = plat === 'win32' ? '\\' : sep;
  const base = pathKey(cwd, plat);
  const root = base.endsWith(s) ? base : base + s;
  return list().filter(e => pathKey(e.plan, plat).startsWith(root));
}
