import { realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep, isAbsolute } from 'node:path';

export const MAX_ASSET = 25 * 1024 * 1024;
const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
};

export async function resolveAsset(root, rel) {
  if (!rel || rel.includes('\0') || isAbsolute(rel)) return { ok: false, code: 403 };
  const type = TYPES[extname(rel).toLowerCase()];
  if (!type) return { ok: false, code: 403 };
  let rootReal, real;
  try {
    rootReal = await realpath(root);
    real = await realpath(resolve(rootReal, rel));
  } catch {
    return { ok: false, code: 404 };
  }
  if (!real.startsWith(rootReal + sep)) return { ok: false, code: 403 };
  const info = await stat(real).catch(() => null);
  if (!info?.isFile()) return { ok: false, code: 404 };
  if (info.size > MAX_ASSET) return { ok: false, code: 413 };
  return { ok: true, abs: real, type, sandbox: type === 'image/svg+xml' };
}
