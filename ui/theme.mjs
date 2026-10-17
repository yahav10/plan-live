export const THEMES = { aurora: 'Aurora', editorial: 'Editorial', blueprint: 'Blueprint', fluid: 'Fluid' };
export const MODES = ['auto', 'light', 'dark'];
const ICON = { auto: '◐', light: '☀', dark: '☾' };

const localStore = {
  get(k) { try { return localStorage.getItem(`plan-live.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`plan-live.${k}`, v); } catch { /* private mode: choice lasts the session only */ } },
};

export function resolveChoice(defaults = {}, search = globalThis.location?.search ?? '', storage = localStore) {
  const q = new URLSearchParams(search);
  const pick = (k, valid, fallback) => [q.get(k), storage.get(k), defaults[k], fallback].find(v => valid.includes(v));
  return { theme: pick('theme', Object.keys(THEMES), 'aurora'), mode: pick('mode', MODES, 'auto') };
}

export function applyTheme({ theme, mode }) {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = mode === 'auto' ? (dark ? 'dark' : 'light') : mode;
}

export const nextMode = m => MODES[(MODES.indexOf(m) + 1) % MODES.length];
export const nextTheme = t => { const k = Object.keys(THEMES); return k[(k.indexOf(t) + 1) % k.length]; };
export const modeIcon = m => ICON[m];
export const remember = (k, v) => localStore.set(k, v);
export const recall = k => localStore.get(k);
