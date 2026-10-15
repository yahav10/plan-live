import { test as base } from '@playwright/test';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPlanServer } from '../../server/serve.mjs';

export const test = base.extend({
  plan: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'plan-live-e2e-'));
    const path = join(dir, 'plan.md');
    copyFileSync(new URL('../fixtures/mini.md', import.meta.url), path);
    const srv = await createPlanServer({ planPath: path, waitTimeoutMs: 500 });
    const api = async (method, p, body) => {
      const res = await fetch(`http://127.0.0.1:${srv.port}${p}`, { method, headers: { 'x-plan-live-key': srv.key }, body: body && JSON.stringify(body) });
      return res.status === 204 ? null : res.json();
    };
    let closed = false;
    const close = async () => { if (!closed) { closed = true; await srv.close(); } };
    await use({
      url: srv.url,
      path,
      api,
      close,
      read: () => readFileSync(path, 'utf8'),
      write: text => writeFileSync(path, text),
    });
    await close();
  },
});
export { expect } from '@playwright/test';
