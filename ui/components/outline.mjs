import { esc } from '../lib.mjs';
import { parseHeading } from './jump.mjs';

export function renderOutline({ model, active, statuses }) {
  return model.sections.map((s, i) => {
    const { label, title } = parseHeading(s.heading, i);
    const t = statuses.byId.get(s.id);
    const cls = ['orow', t ? `st-${t.status}` : '', s.id === active ? 'cur' : ''].filter(Boolean).join(' ');
    const count = t?.total ? `${t.done}/${t.total}` : '';
    return `<button class="${cls}" data-goto="${esc(s.id)}"${s.id === active ? ' aria-current="true"' : ''}><i class="odot"></i><span class="olabel"><b>${esc(label)}</b> ${esc(title)}</span><span class="ocount">${count}</span></button>`;
  }).join('');
}
