import { createHash } from 'node:crypto';
import { splitLines, lineHash } from './diff.mjs';

const TASK_HEADING = /^(?:Task\s+|T)(\d+)\b/i;
const ITEM = '(?:Task\\s*|T)\\d+';
const MORE = '\\s*(?:,|&|\\/|\\band\\b|\\bor\\b)(?:\\s*(?:and|or)\\b)?\\s*(?:(?:Task\\s*|T)?\\d+(?!\\d|\\s*(?:days?|hours?|weeks?|minutes?|mins?|steps?|items?|%)\\b))';
const REF = new RegExp('\\b(?:depends\\s+on|after|blocked\\s+(?:on|by))\\s+(' + ITEM + '(?:' + MORE + ')*)', 'gi');
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'to', 'for', 'on', 'what', 'how', 'one', 'is', 'are',
  'does', 'do', 'before', 'we', 'you', 'your', 'this', 'that', 'it', 'with', 'read']);
const EFFORT = new Set(['S', 'M', 'L']);

export function slug(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'x';
}

export function shortLabel(heading) {
  const t = heading.match(TASK_HEADING);
  if (t) return 'T' + t[1];
  const num = heading.match(/^(\d+)[.)]?(?:\s+(.*))?$/);
  if (num) return num[2] ? `${num[1]} ${shortLabel(num[2])}` : num[1];
  for (const w of heading.split(/[\s—–:,()·/]+/)) {
    const clean = w.replace(/[^\p{L}\p{N}-]/gu, '');
    if (clean && !STOP.has(clean.toLowerCase())) return clean[0].toUpperCase() + clean.slice(1);
  }
  return heading.slice(0, 12) || '§';
}

const blockText = b => {
  switch (b.type) {
    case 'paragraph': case 'heading': return b.text;
    case 'list': return b.items.map(i => i.text).join('\n');
    case 'table': return [b.head, ...b.rows].map(r => r.join(' ')).join('\n');
    default: return '';
  }
};

export const sectionText = s => [s.heading, ...s.blocks.map(blockText)].join('\n');

const cells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

function parseApproaches(body) {
  const items = [];
  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^name:\s*(.+)$/i))) items.push({ name: m[1], effort: null, pick: false, pros: [], cons: [] });
    else if (!items.length) throw new Error('expected "name:" lines to start each approach');
    else if ((m = line.match(/^effort:\s*([SML])$/i))) items.at(-1).effort = m[1].toUpperCase();
    else if ((m = line.match(/^pick:\s*(yes|true)$/i))) items.at(-1).pick = true;
    else if (line.startsWith('+ ')) items.at(-1).pros.push(line.slice(2));
    else if (line.startsWith('- ')) items.at(-1).cons.push(line.slice(2));
    else throw new Error(`unrecognised line "${line}" (use name:, effort: S|M|L, pick: yes, + pro, - con)`);
  }
  if (!items.length) throw new Error('expected "name:" lines to start each approach');
  for (const it of items) if (it.effort && !EFFORT.has(it.effort)) throw new Error('effort must be S, M or L');
  return items;
}

function parseArchitecture(body) {
  const nodes = new Map(), edges = [];
  for (const raw of body) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(.+?)\s*->\s*(.+?)(?:\s*:\s*(.+))?$/);
    if (!m) throw new Error(`expected "A -> B" or "A -> B : label", got "${line}"`);
    for (const k of [m[1], m[2]]) if (!nodes.has(k)) nodes.set(k, { key: k, label: k });
    edges.push([m[1], m[2], m[3] ?? '']);
  }
  if (!edges.length) throw new Error('expected at least one "A -> B" line');
  return { nodes: [...nodes.values()], edges: edges.map(e => (e[2] ? e : e.slice(0, 2))) };
}

function makeFence({ lang, line, body, info = '' }) {
  const code = body.join('\n');
  if (lang === 'mermaid') return { type: 'mermaid', line, code };
  if (lang === 'embed') {
    const h = Number(info.match(/\bheight=(\d{2,4})\b/)?.[1]);
    return { type: 'embed', line, code, id: createHash('sha1').update(code).digest('hex').slice(0, 12), height: Math.min(900, Math.max(80, h || 320)) };
  }
  try {
    if (lang === 'approaches') return { type: 'approaches', line, items: parseApproaches(body) };
    if (lang === 'architecture') return { type: 'architecture', line, ...parseArchitecture(body) };
  } catch (e) {
    return { type: 'code', line, lang, code, error: e.message };
  }
  return { type: 'code', line, lang, code };
}

export function parse(markdown) {
  try {
    return parseUnsafe(String(markdown ?? ''));
  } catch (e) {
    return { title: '', meta: { eyebrow: '', fields: [] }, preamble: [{ type: 'code', line: 1, lang: '', code: String(markdown ?? ''), error: `parser error: ${e.message}` }], sections: [], tasks: [], graph: { nodes: [], edges: [] }, progress: { done: 0, total: 0 } };
  }
}

function parseUnsafe(markdown) {
  const { lines } = splitLines(markdown);
  const model = { title: '', meta: { eyebrow: '', fields: [] }, preamble: [], sections: [], tasks: [], graph: { nodes: [], edges: [] }, progress: { done: 0, total: 0 } };
  const used = new Map();
  const uniq = base => {
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  let section = null, fence = null, para = null, list = null, table = null, callout = null, gap = false;
  const endBlocks = () => { para = list = table = callout = null; };
  const push = b => (section ? section.blocks : model.preamble).push(b);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], ln = i + 1;
    if (section) section.endLine = ln;

    if (fence) {
      const t = raw.trim();
      if (t.length >= fence.marker.length && t === fence.marker[0].repeat(t.length)) { push(makeFence(fence)); fence = null; }
      else fence.body.push(raw);
      continue;
    }
    const f = raw.match(/^\s*(`{3,}|~{3,})\s*([\w-]*)(.*)$/);
    if (f && !(f[1][0] === '`' && f[3].includes('`'))) { endBlocks(); fence = { marker: f[1], lang: f[2].toLowerCase(), line: ln, body: [], info: f[3].trim() }; continue; }

    const h = raw.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length, text = h[2];
      endBlocks();
      if (level === 1 && !model.title) {
        const cut = text.lastIndexOf(' — ');
        model.title = cut > 0 ? text.slice(0, cut) : text;
        model.meta.eyebrow = cut > 0 ? text.slice(cut + 3) : '';
      } else if (level === 2 || (level === 3 && TASK_HEADING.test(text))) {
        const tm = text.match(TASK_HEADING);
        section = { id: uniq(slug(text)), heading: text, short: shortLabel(text), line: ln, endLine: ln, level, blocks: [], progress: { done: 0, total: 0 }, node: null };
        if (tm) section.node = { key: 'T' + tm[1], label: text, sectionId: section.id };
        model.sections.push(section);
      } else push({ type: 'heading', level, text, line: ln });
      continue;
    }

    const short = raw.match(/^<!--\s*short:\s*(.+?)\s*-->\s*$/);
    if (short && section) { section.short = short[1]; continue; }
    if (/^\s*$/.test(raw) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(raw)) { endBlocks(); continue; }

    const ca = raw.match(/^>\s?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(.*)$/i);
    if (ca) { endBlocks(); callout = { type: 'callout', kind: ca[1].toLowerCase(), title: ca[2].trim(), paras: [], line: ln }; gap = false; push(callout); continue; }
    if (callout) {
      const q = raw.match(/^>\s?(.*)$/);
      if (q) {
        const t = q[1].trim();
        if (!t) gap = true;
        else if (gap || !callout.paras.length) { callout.paras.push(t); gap = false; }
        else callout.paras[callout.paras.length - 1] += ' ' + t;
        continue;
      }
      callout = null;
    }

    if (/^\s*\|/.test(raw)) {
      if (table) { table.rows.push(cells(raw)); continue; }
      if (/^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
        endBlocks();
        table = { type: 'table', line: ln, head: cells(raw), rows: [] };
        push(table);
        i++;
        if (section) section.endLine = i + 1;
        continue;
      }
    }

    const im = raw.match(/^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)\s*$/);
    if (im) { endBlocks(); push({ type: 'image', alt: im[1], src: im[2], title: im[3] ?? '', line: ln }); continue; }

    const li = raw.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      if (!list) { endBlocks(); list = { type: 'list', line: ln, items: [] }; push(list); }
      const cb = li[2].match(/^\[( |x|X)\]\s+(.*)$/);
      const item = { text: cb ? cb[2] : li[2], indent: li[1].length, line: ln };
      if (cb) {
        const sectionId = section?.id ?? 'intro';
        const words = slug(cb[2].split(/\s+/).slice(0, 6).join(' '));
        item.task = { id: uniq(`${sectionId}/${words}`), sectionId, text: cb[2], checked: cb[1] !== ' ', line: ln, hash: lineHash(raw) };
        model.tasks.push(item.task);
        const p = section?.progress;
        model.progress.total++;
        if (p) p.total++;
        if (item.task.checked) { model.progress.done++; if (p) p.done++; }
      }
      list.items.push(item);
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) { list.items.at(-1).text += ' ' + raw.trim(); continue; }

    if (para) para.text += ' ' + raw.trim();
    else { endBlocks(); para = { type: 'paragraph', text: raw.trim(), line: ln }; push(para); }
  }
  if (fence) push(makeFence(fence));

  for (const b of model.preamble) {
    const m = b.type === 'paragraph' && b.text.match(/^\*\*([^*]+?):\*\*\s*(.+)$/);
    if (m) model.meta.fields.push({ label: m[1], value: m[2] });
  }

  const nodes = model.sections.filter(s => s.node).map(s => ({ ...s.node, progress: s.progress }));
  const keys = new Set(nodes.map(n => n.key));
  for (const s of model.sections) {
    if (!s.node) continue;
    for (const m of sectionText(s).matchAll(REF)) {
      for (const n of m[1].match(/\d+/g)) {
        const from = 'T' + n;
        if (keys.has(from) && from !== s.node.key && !model.graph.edges.some(e => e[0] === from && e[1] === s.node.key)) {
          model.graph.edges.push([from, s.node.key]);
        }
      }
    }
  }
  model.graph.nodes = nodes;
  return model;
}
