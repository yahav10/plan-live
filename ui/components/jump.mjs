import { esc } from '../lib.mjs';

export function parseHeading(heading, index) {
  const m = heading.match(/^(\d+)[.)]?\s+(.+)$/);
  return m ? { n: Number(m[1]), title: m[2] } : { n: index + 1, title: heading };
}

export function filterSections(sections, query) {
  const q = query.trim().toLowerCase();
  const all = sections.map((_, i) => i);
  if (!q) return all;
  return all.filter(i => {
    const { n, title } = parseHeading(sections[i].heading, i);
    return String(n) === q || title.toLowerCase().includes(q);
  });
}

const count = s => (s.progress.total ? `${s.progress.done}/${s.progress.total}` : '');
const isDone = s => s.progress.total > 0 && s.progress.done === s.progress.total;

export function renderPill({ sections, active, progress = 0, open = false }) {
  const i = sections.findIndex(s => s.id === active);
  const s = sections[i];
  const { n, title } = s ? parseHeading(s.heading, i) : { n: 0, title: '' };
  const label = s ? `${n} · ${title}` : 'Sections';
  const aria = s ? `Jump to section. Now in ${n}. ${title}` : 'Jump to section';
  return `<button class="pill" data-act="jump-toggle" aria-haspopup="dialog" aria-expanded="${open}" aria-label="${esc(aria)}" style="--scroll:${Math.min(1, Math.max(0, progress)).toFixed(3)}"><svg class="arc" viewBox="0 0 20 20" aria-hidden="true"><circle class="bg" cx="10" cy="10" r="7.5"/><circle class="fg" cx="10" cy="10" r="7.5" transform="rotate(-90 10 10)"/></svg><span class="ptxt">${esc(label)}</span>${s && count(s) ? `<small>${count(s)}</small>` : ''}<span class="kbd">Ctrl K</span></button>`;
}

export function renderJumpRows({ sections, active, matches, act }) {
  if (!matches.length) return '<div class="jempty">No section matches that. Clear the filter to see all.</div>';
  return matches.map((i, k) => {
    const s = sections[i];
    const { n, title } = parseHeading(s.heading, i);
    const cls = ['jrow', k === act ? 'act' : '', s.id === active ? 'cur' : ''].filter(Boolean).join(' ');
    const tail = isDone(s) ? '<i class="ck" aria-hidden="true">✓</i><span class="sr">done</span>' : `<span class="c">${count(s)}</span>`;
    return `<button class="${cls}" role="option" tabindex="-1" data-jump="${esc(s.id)}"${s.id === active ? ' aria-current="true"' : ''}><span class="n">${n}</span><span class="t">${esc(title)}</span>${tail}</button>`;
  }).join('');
}

export function renderSpine({ sections, weights, active }) {
  return sections.map((s, i) => {
    const { n, title } = parseHeading(s.heading, i);
    return `<button class="tick${s.id === active ? ' cur' : ''}" data-jump="${esc(s.id)}" style="flex:${Math.max(1, Math.round(weights[i] ?? 1))} 1 0" aria-label="${esc(`${n}. ${title}`)}"><i></i></button>`;
  }).join('');
}
