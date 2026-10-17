import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const THEMES = ['aurora', 'editorial', 'blueprint', 'fluid'], MODES = ['light', 'dark'];
const TOKENS = ['--bg', '--card', '--rail', '--ink', '--ink-2', '--muted', '--line', '--line-strong', '--accent', '--accent-ink', '--accent-soft', '--ok', '--warn', '--note', '--note-soft', '--chip', '--hover', '--track', '--node', '--node-stroke', '--edge', '--del', '--del-bg', '--add', '--add-bg', '--apply-bg', '--apply-ink', '--apply-shadow'];
const TEXT = ['--ink', '--ink-2', '--muted', '--accent-ink', '--ok', '--warn', '--note', '--del', '--add'];

function tokens(theme, mode) {
  const css = readFileSync(new URL(`../../ui/themes/${theme}.css`, import.meta.url), 'utf8');
  const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\[data-mode="${mode}"\\]\\s*\\{([^}]*)\\}`));
  assert.ok(block, `${theme}/${mode} block missing`);
  return Object.fromEntries([...block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

function rgba(v) {
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error(`unsupported colour ${v}`);
}
const over = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const theme of THEMES) for (const mode of MODES) {
  test(`${theme}/${mode} defines every token`, () => {
    const t = tokens(theme, mode);
    for (const k of TOKENS) assert.ok(t[k], `${theme}/${mode} missing ${k}`);
  });
  test(`${theme}/${mode} text tokens pass AA on bg and card`, () => {
    const t = tokens(theme, mode), bg = rgba(t['--bg']), card = over(rgba(t['--card']), bg);
    for (const k of TEXT) for (const [name, surface] of [['bg', bg], ['card', card]]) {
      const r = ratio(over(rgba(t[k]), surface), surface);
      assert.ok(r >= 4.5, `${theme}/${mode} ${k} on ${name}: ${r.toFixed(2)}`);
    }
  });
}
