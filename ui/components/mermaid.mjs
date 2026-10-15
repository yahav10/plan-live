import { esc } from '../lib.mjs';

let loading;
const load = () => (loading ??= new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = '/vendor/mermaid.min.js';
  s.onload = () => res(window.mermaid);
  s.onerror = () => { loading = null; rej(new Error('mermaid failed to load')); };
  document.head.append(s);
}));

const fallback = (el, msg) => {
  el.innerHTML = `<pre class="code"><code>${esc(el.dataset.code)}</code></pre><div class="block-error">${esc(msg)}</div>`;
};

export async function hydrateMermaid(root, mode) {
  const els = [...root.querySelectorAll('.mermaid-block')];
  if (!els.length) return;
  let m;
  try { m = await load(); } catch (e) { els.forEach(el => fallback(el, e.message)); return; }
  m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: mode === 'dark' ? 'dark' : 'neutral', htmlLabels: false, flowchart: { htmlLabels: false } });
  for (const [i, el] of els.entries()) {
    try {
      const { svg } = await m.render(`mmd-${Date.now()}-${i}`, el.dataset.code);
      el.innerHTML = svg;
    } catch (e) {
      fallback(el, `Couldn't render diagram: ${e.message}`);
    }
  }
}
