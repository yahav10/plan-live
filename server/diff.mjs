import { createHash } from 'node:crypto';

export function splitLines(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = text.endsWith('\n');
  const body = trailingNewline ? text.slice(0, text.endsWith('\r\n') ? -2 : -1) : text;
  const lines = body === '' && !trailingNewline ? [] : body.split(/\r?\n/);
  const doc = { lines, eol, trailingNewline };
  const ends = text.match(/\r?\n/g) ?? [];
  if (eol === '\r\n' && ends.includes('\n')) doc.eols = ends;
  return doc;
}

export function joinLines({ lines, eol, trailingNewline, eols }) {
  if (!eols) return lines.join(eol) + (trailingNewline ? eol : '');
  return lines.map((l, i) => l + (eols[i] ?? (i < lines.length - 1 || trailingNewline ? eol : ''))).join('');
}

export const lineHash = line => createHash('sha1').update(line).digest('hex').slice(0, 12);

// Context stops at neighbouring hunks so reverting one never invalidates another's match.
export function diffLines(a, b) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
  const n = A.length, m = B.length, w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  const hunks = [];
  let i = 0, j = 0, cur = null;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      if (cur) { hunks.push(cur); cur = null; }
      i++; j++;
      continue;
    }
    cur ??= { aStart: pre + i, aLines: [], bStart: pre + j, bLines: [] };
    if (j < m && (i === n || L[i * w + j + 1] >= L[(i + 1) * w + j])) cur.bLines.push(B[j++]);
    else cur.aLines.push(A[i++]);
  }
  if (cur) hunks.push(cur);
  hunks.forEach((h, k) => {
    const end = h.bStart + h.bLines.length;
    const floor = k ? hunks[k - 1].bStart + hunks[k - 1].bLines.length : 0;
    const ceil = k < hunks.length - 1 ? hunks[k + 1].bStart : b.length;
    h.ctxBefore = b.slice(Math.max(floor, h.bStart - 2), h.bStart);
    h.ctxAfter = b.slice(end, Math.min(ceil, end + 2));
  });
  return hunks;
}

export function revertHunk(text, hunk) {
  const doc = splitLines(text);
  const needle = [...hunk.ctxBefore, ...hunk.bLines, ...hunk.ctxAfter];
  const matches = [];
  for (let s = 0; s + needle.length <= doc.lines.length; s++) {
    if (needle.every((line, k) => doc.lines[s + k] === line)) matches.push(s);
  }
  if (matches.length !== 1) return { ok: false, reason: matches.length ? 'ambiguous' : 'conflict' };
  const at = matches[0] + hunk.ctxBefore.length;
  doc.lines.splice(at, hunk.bLines.length, ...hunk.aLines);
  if (doc.eols) doc.eols.splice(at + Math.min(hunk.aLines.length, hunk.bLines.length), Math.max(0, hunk.bLines.length - hunk.aLines.length), ...Array(Math.max(0, hunk.aLines.length - hunk.bLines.length)).fill(doc.eol));
  return { ok: true, text: joinLines(doc) };
}
