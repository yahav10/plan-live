import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPlanServer } from '../server/serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function demoServer({ seed = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'plan-live-demo-'));
  const planPath = join(dir, 'checkout-revamp.md');
  copyFileSync(`${root}docs/examples/demo-plan.md`, planPath);
  const srv = await createPlanServer({ planPath });
  const api = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${srv.port}${path}`, { method, headers: { 'x-plan-live-key': srv.key, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  if (seed) await seedReview(api, planPath);
  return { srv, api, planPath };
}

async function seedReview(api, planPath) {
  const { model } = await api('GET', '/api/plan');
  const task = (n, text) => model.tasks.find(t => t.sectionId.startsWith(`task-${n}-`) && t.text.includes(text));
  const sec = id => model.sections.find(s => s.id.startsWith(id)).id;
  const t2 = task(2, 'Implement the endpoint'), t3 = task(3, 'Layout and responsive');
  const a = await api('POST', '/api/comments', { anchor: { sectionId: t2.sectionId, taskId: t2.id, quote: t2.text }, body: 'Mention the idempotency key in this step.' });
  const b = await api('POST', '/api/comments', { anchor: { sectionId: sec('goals') }, body: 'Add a latency budget as a goal.' });
  const c = await api('POST', '/api/comments', { anchor: { sectionId: sec('decisions'), quote: 'One-page checkout' }, kind: 'suggestion', body: 'Use the product term.', replacement: 'Single-page checkout' });
  await api('POST', '/api/apply');
  await api('GET', '/api/wait?nowait=1');
  let text = readFileSync(planPath, 'utf8');
  text = text.replace('- [ ] **Step 2: Implement the endpoint**', '- [ ] **Step 2: Implement the endpoint and read the Idempotency-Key header**');
  text = text.replace('- Zero downtime rollout behind a flag', '- Zero downtime rollout behind a flag\n- p95 checkout latency under 400 ms');
  writeFileSync(planPath, text);
  await new Promise(r => setTimeout(r, 300));
  for (const [x, status, note] of [[a, 'resolved', 'Step now reads the Idempotency-Key header'], [b, 'resolved', 'Added a p95 latency goal'], [c, 'declined', 'Keeping the original wording']]) {
    await api('POST', '/api/resolve', { commentId: x.id, status, note });
  }
  await api('POST', '/api/comments', { anchor: { sectionId: t3.sectionId, taskId: t3.id, quote: t3.text }, body: 'Cover the 320px viewport explicitly.' });
  await api('POST', '/api/comments', { anchor: { sectionId: sec('options') }, body: 'Add a cost column to the options.' });
  await api('POST', '/api/apply');
  await api('GET', '/api/wait?nowait=1');
  await api('POST', '/api/comments', { anchor: { sectionId: sec('architecture') }, body: 'Show the retry path from Payments.' });
  await api('POST', '/api/comments', { anchor: { sectionId: sec('notes'), quote: 'Drop-off' }, kind: 'suggestion', body: 'Source this number.', replacement: 'Drop-off (analytics, Sep 2026)' });
}
