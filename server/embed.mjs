export const EMBED_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts";

export const TOKEN_NAMES = ['--bg', '--card', '--ink', '--ink-2', '--muted', '--line', '--line-strong', '--accent', '--accent-ink', '--accent-soft', '--ok', '--warn', '--note', '--font-body', '--font-mono'];
const SAFE_VALUE = /^[\w\s#.,()%'"/-]{1,160}$/;

export function sanitizeTokens(raw) {
  let parsed;
  try { parsed = JSON.parse(raw ?? ''); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const name of TOKEN_NAMES) {
    const v = parsed[name];
    if (typeof v === 'string' && SAFE_VALUE.test(v.trim())) out[name] = v.trim();
  }
  return out;
}

const SHIM = `addEventListener('message',function(e){if(e.source!==parent)return;var t=e.data&&e.data.tokens;if(!t)return;for(var k in t)document.documentElement.style.setProperty(k,t[k]);});`;

export function embedPage(code, tokens = {}) {
  const vars = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{${vars}}html,body{margin:0;height:100%}body{font:14px/1.5 var(--font-body,system-ui,sans-serif);color:var(--ink,#1d1d1f);background:transparent}</style><script>${SHIM}</script></head><body>${code}</body></html>`;
}
