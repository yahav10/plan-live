import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { sectionText } from './parse.mjs';

export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const reviewPathFor = planPath => planPath.replace(/\.md$/i, '') + '.review.json';
const empty = () => ({ version: 1, comments: [], batches: [], revisions: [] });
const rid = prefix => `${prefix}_${randomBytes(4).toString('hex')}`;
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function createStore(planPath, { now = () => new Date().toISOString() } = {}) {
  const file = reviewPathFor(planPath);
  let state = empty(), notice = null;

  const save = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
    renameSync(tmp, file);
  };

  if (existsSync(file)) {
    try {
      const s = JSON.parse(readFileSync(file, 'utf8'));
      if (s?.version !== 1 || !Array.isArray(s.comments) || !Array.isArray(s.batches) || !Array.isArray(s.revisions)) throw new Error('shape');
      state = s;
    } catch {
      const bak = `${file}.bak-${Date.now()}`;
      renameSync(file, bak);
      notice = `review file was unreadable; moved to ${bak}`;
      save();
    }
  }

  const comment = id => {
    const c = state.comments.find(x => x.id === id);
    if (!c) throw new StoreError(404, `no comment ${id}`);
    return c;
  };
  const draft = id => {
    const c = comment(id);
    if (c.status !== 'draft') throw new StoreError(409, 'only draft comments can change');
    return c;
  };
  const openBatches = () => state.batches.filter(b => b.status !== 'done');

  return {
    file,
    get state() { return state; },
    takeNotice() { const n = notice; notice = null; return n; },

    addComment({ anchor, kind = 'comment', body, replacement } = {}) {
      if (!anchor?.sectionId) throw new StoreError(400, 'anchor.sectionId is required');
      if (!String(body ?? '').trim()) throw new StoreError(400, 'body is required');
      if (!['comment', 'suggestion'].includes(kind)) throw new StoreError(400, 'kind must be comment|suggestion');
      const c = { id: rid('c'), anchor, kind, body: String(body).trim(), status: 'draft', orphaned: false, createdAt: now() };
      if (kind === 'suggestion') c.replacement = String(replacement ?? '');
      state.comments.push(c);
      save();
      return c;
    },
    updateComment(id, patch = {}) {
      const c = draft(id);
      for (const k of ['body', 'kind', 'replacement']) if (k in patch) c[k] = patch[k];
      save();
      return c;
    },
    deleteComment(id) {
      draft(id);
      state.comments = state.comments.filter(c => c.id !== id);
      save();
    },

    apply(snapshot) {
      const drafts = state.comments.filter(c => c.status === 'draft');
      if (!drafts.length) return null;
      for (const c of drafts) c.status = 'queued';
      const b = { id: rid('b'), commentIds: drafts.map(c => c.id), status: 'pending', snapshot, createdAt: now() };
      state.batches.push(b);
      save();
      return b;
    },
    pickPending() {
      const b = state.batches.find(x => x.status === 'pending');
      if (!b) return null;
      b.status = 'picked';
      save();
      return b;
    },
    resolve(commentId, status, note = '') {
      if (!['resolved', 'declined'].includes(status)) throw new StoreError(400, 'status must be resolved|declined');
      const c = comment(commentId);
      if (c.status !== 'queued') throw new StoreError(409, `comment ${commentId} is ${c.status}, not queued`);
      c.status = status;
      c.resolution = { note: String(note), at: now() };
      const b = state.batches.find(x => x.commentIds.includes(commentId));
      let batchDone = null;
      if (b && b.commentIds.every(id => comment(id).status !== 'queued')) { b.status = 'done'; batchDone = b; }
      save();
      return { comment: c, batchDone };
    },

    addRevisions(batchId, items) {
      for (const { hunk, commentId } of items) {
        state.revisions.push({ id: rid('r'), batchId, commentId, hunk, status: 'proposed', reported: true });
      }
      save();
    },
    setRevision(id, status) {
      const r = state.revisions.find(x => x.id === id);
      if (!r) throw new StoreError(404, `no revision ${id}`);
      if (r.status !== 'proposed') throw new StoreError(409, `revision ${id} is already ${r.status}`);
      r.status = status;
      if (status !== 'accepted') r.reported = false;
      save();
      return r;
    },
    takeUnreported() {
      const rs = state.revisions.filter(r => !r.reported);
      for (const r of rs) r.reported = true;
      if (rs.length) save();
      return rs;
    },
    patchSnapshots(fn) {
      const open = openBatches();
      for (const b of open) b.snapshot = fn(b.snapshot);
      if (open.length) save();
    },

    reanchor(model) {
      let changed = false;
      for (const c of state.comments) {
        if (c.status !== 'draft' && c.status !== 'queued') continue;
        const a = c.anchor, q = norm(a.quote), was = JSON.stringify([a, c.orphaned]);
        if (a.taskId && !model.tasks.some(t => t.id === a.taskId)) {
          const t = q && model.tasks.find(x => norm(x.text).includes(q));
          if (t) { a.taskId = t.id; a.sectionId = t.sectionId; } else delete a.taskId;
        }
        if (a.sectionId !== 'intro' && !model.sections.some(s => s.id === a.sectionId)) {
          const s = q && model.sections.find(x => norm(sectionText(x)).includes(q));
          if (s) a.sectionId = s.id;
        }
        c.orphaned = a.sectionId !== 'intro' && !model.sections.some(s => s.id === a.sectionId);
        if (JSON.stringify([a, c.orphaned]) !== was) changed = true;
      }
      if (changed) save();
    },

    status() {
      const picked = state.batches.filter(b => b.status === 'picked').flatMap(b => b.commentIds);
      const unresolvedIds = picked.filter(id => state.comments.find(c => c.id === id)?.status === 'queued');
      return {
        drafts: state.comments.filter(c => c.status === 'draft').length,
        pendingBatches: state.batches.filter(b => b.status === 'pending').length,
        unresolvedInPicked: unresolvedIds.length,
        unresolvedIds,
      };
    },
  };
}

export function linkHunks(hunks, comments, model) {
  const range = c => {
    const t = c.anchor?.taskId && model.tasks.find(x => x.id === c.anchor.taskId);
    if (t) return [t.line, t.line];
    const s = model.sections.find(x => x.id === c.anchor?.sectionId);
    return s ? [s.line, s.endLine] : null;
  };
  return hunks.map(hunk => {
    const lo = hunk.bStart + 1, hi = hunk.bStart + Math.max(hunk.bLines.length, 1);
    const c = comments.find(x => { const r = range(x); return r && r[0] <= hi && lo <= r[1]; });
    return { hunk, commentId: c?.id ?? null };
  });
}
