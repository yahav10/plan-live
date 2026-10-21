import { esc, modLabel } from '../lib.mjs';
import { THEMES, modeIcon } from '../theme.mjs';
import { renderPill } from './jump.mjs';

export function fmtAge(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const EXPORTS = [
  ['Plan', [['md', 'Markdown', '.md'], ['html', 'Web page', '.html'], ['html-auto', 'Web page, autoplay', 'plays on open'], ['pdf', 'PDF', 'print'], ['copy-md', 'Copy as Markdown', 'clipboard']]],
  ['Data', [['json', 'Plan model', '.json'], ['csv', 'Tasks', '.csv']]],
  ['Review', [['review-md', 'Notes', '.md'], ['review-json', 'Data', '.json']]],
];

export function renderStrip({ plan, choice, online, active, jump }) {
  const age = fmtAge(Date.now() - plan.changedAt);
  const menu = Object.entries(THEMES).map(([id, name]) =>
    `<button data-act="set-theme" data-theme-id="${id}" class="${id === choice.theme ? 'on' : ''}"><span class="sw sw-${id}"></span>${name}</button>`).join('');
  return `<span class="live${online ? '' : ' off'}" title="${online ? `Updated ${age} ago by ${esc(plan.changedBy)}` : 'Offline — reconnecting'}"><i></i><span id="age">${online ? `Updated ${age} ago` : 'offline'}</span></span>
<span class="sp"></span>${renderPill({ sections: plan.model.sections, active, open: !!jump?.open, mod: modLabel() })}<span class="sp"></span>
<div class="tw tw-export"><button class="tbtn" data-act="export-menu" title="Export"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v7M3 5.5L6 8.5l3-3M1.5 10.5h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="name">Export</span></button><div class="menu" id="export-menu" hidden>${EXPORTS.map(([h, items]) => `<div class="menu-h">${h}</div>${items.map(([fmt, label, hint]) => `<button data-act="export" data-fmt="${fmt}"><span>${label}</span><small>${hint}</small></button>`).join('')}`).join('')}</div></div>
<div class="tw"><button class="tbtn" data-act="theme-menu" title="Theme (T)"><span class="sw sw-${choice.theme}"></span><span class="name">${THEMES[choice.theme]}</span><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="menu" id="theme-menu" hidden>${menu}</div></div>
<button class="ibtn keys-btn" data-act="keys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
<button class="ibtn" data-act="mode" title="Mode: ${choice.mode} (D)">${modeIcon(choice.mode)}</button>`;
}
