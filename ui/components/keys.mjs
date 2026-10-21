import { esc } from '../lib.mjs';

export const SHORTCUTS = [
  { keys: ['mod', 'K'], does: 'Jump to a section' },
  { keys: ['J'], does: 'Next section' },
  { keys: ['K'], does: 'Previous section' },
  { keys: ['C'], does: 'Add a comment' },
  { keys: ['Enter'], does: 'Apply comments to Claude' },
  { keys: ['T'], does: 'Switch theme' },
  { keys: ['D'], does: 'Switch light or dark' },
  { keys: ['?'], does: 'Show these shortcuts' },
  { keys: ['Esc'], does: 'Close a panel or dialog' },
];

export function renderKeys(mod) {
  const row = s => `<li><span class="keys">${s.keys.map(k => `<kbd>${esc(k === 'mod' ? mod : k)}</kbd>`).join(' ')}</span><span>${esc(s.does)}</span></li>`;
  return `<h3 id="keys-title">Keyboard shortcuts</h3><ul class="keylist">${SHORTCUTS.map(row).join('')}</ul><div class="actions"><button class="btn" data-act="keys-close">Close</button></div>`;
}
