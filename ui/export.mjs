import { anchorLabel } from './components/review.mjs';

export const exportName = (file, suffix, ext) => {
  const base = String(file || 'plan').replace(/\.md$/i, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
  return `${base}${suffix ? `-${suffix}` : ''}.${ext}`;
};

const cell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(model) {
  const heading = id => (id === 'intro' ? '(intro)' : model.sections.find(s => s.id === id)?.heading ?? id);
  const rows = model.tasks.map(t => [heading(t.sectionId), t.text, t.checked ? 'yes' : 'no', t.line]);
  return [['section', 'task', 'done', 'line'], ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n';
}

export function reviewMarkdown(review, model, file) {
  const { comments = [], revisions = [] } = review;
  const head = `# Review: ${model.title || file} (${file})`;
  if (!comments.length && !revisions.length) return `${head}\n\nNo review comments yet.\n`;
  const where = c => `\`${anchorLabel(c.anchor, model)}\``;
  const item = c => [
    `- **[${c.id}] ${c.kind === 'suggestion' ? 'Suggestion' : 'Comment'}** on ${where(c)}`,
    ...c.body.split('\n').map(l => `  > ${l}`),
    ...(c.kind === 'suggestion' ? [`  - Replace “${c.anchor.quote ?? ''}” with “${c.replacement ?? ''}”`] : []),
    ...(c.resolution?.note ? [`  - Claude: ${c.resolution.note}`] : []),
  ].join('\n');
  const group = (title, list, fn = item) => (list.length ? `## ${title} (${list.length})\n\n${list.map(fn).join('\n\n')}\n` : '');
  const by = s => comments.filter(c => c.status === s);
  const rev = r => {
    const c = comments.find(x => x.id === r.commentId);
    return [`- **[${r.id}] ${r.status}**${c ? ` for ${where(c)}` : ''}`, '', '  ```diff', ...r.hunk.aLines.map(l => `  - ${l}`), ...r.hunk.bLines.map(l => `  + ${l}`), '  ```'].join('\n');
  };
  return [
    head, '',
    `_Exported ${new Date().toISOString().slice(0, 10)}_`, '',
    group('Resolved', by('resolved')), group('Declined', by('declined')), group('With Claude', by('queued')), group('Drafts', by('draft')),
    group('Claude’s changes', revisions, rev),
  ].filter(Boolean).join('\n');
}

export function download(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor', 'dominant-baseline'];

export function diagramSvg(svg) {
  const pad = 24;
  const clone = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i].setAttribute('style', SVG_PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
  clone.querySelectorAll('title').forEach(t => t.remove());
  const b = svg.getBBox();
  const vb = [b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad].map(n => Math.round(n * 100) / 100);
  const w = Math.max(1, Math.ceil(vb[2])), h = Math.max(1, Math.ceil(vb[3]));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', vb.join(' '));
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  clone.removeAttribute('class');
  clone.removeAttribute('role');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [k, v] of Object.entries({ x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: getComputedStyle(document.body).backgroundColor })) bg.setAttribute(k, v);
  clone.prepend(bg);
  return { text: new XMLSerializer().serializeToString(clone), w, h };
}

export async function svgToPng({ text, w, h }, scale = 2) {
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('could not rasterise the diagram')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    g.drawImage(img, 0, 0, w, h);
    return await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('could not encode the PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBase64 = buf => {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function inlineFonts(fontsCss, themeCss) {
  const faces = fontsCss.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  const used = faces.filter(f => themeCss.includes(f.match(/font-family:\s*'([^']+)'/)[1]));
  return (await Promise.all(used.map(async f => {
    const url = f.match(/url\(([^)]+)\)/)[1];
    const buf = await (await fetch(url)).arrayBuffer();
    return f.replace(/url\([^)]+\)/, `url(data:font/woff2;base64,${toBase64(buf)})`);
  }))).join('\n');
}

const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function standaloneHtml(file) {
  const { theme, mode } = document.documentElement.dataset;
  const get = async u => (await fetch(u)).text();
  const [base, themeCss, fontsCss] = await Promise.all([get('/base.css'), get(`/themes/${theme}.css`), get('/vendor/fonts.css')]);
  const fonts = await inlineFonts(fontsCss, themeCss);
  const main = document.querySelector('main').cloneNode(true);
  main.querySelectorAll('.xtools, .pill.c, .chip.warn, .marker').forEach(n => n.remove());
  main.querySelectorAll('.pulse, .anchored, .flip, .landed, .enter').forEach(n => n.classList.remove('pulse', 'anchored', 'flip', 'landed', 'enter'));
  main.querySelectorAll('[data-act]').forEach(n => n.removeAttribute('data-act'));
  const title = document.title || file;
  const extra = '.grid.export { display: block; max-width: 980px; } .export-foot { max-width: 980px; margin: 0 auto; padding: 0 34px 40px; font: 12px var(--font-mono); color: var(--muted); } main { padding-bottom: 20px; }';
  return `<!doctype html>\n<html lang="en" data-theme="${theme}" data-mode="${mode}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="generator" content="plan-live">\n<title>${escHtml(title)}</title>\n<style>\n${fonts}\n${base}\n${themeCss}\n${extra}\n</style>\n</head>\n<body>\n<div class="grid export"><main>${main.innerHTML}</main></div>\n<footer class="export-foot">Exported from plan-live · ${new Date().toISOString().slice(0, 10)} · ${escHtml(file)}</footer>\n</body>\n</html>\n`;
}
