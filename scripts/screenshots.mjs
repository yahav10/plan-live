import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { demoServer } from './demo-state.mjs';

const out = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const { srv } = await demoServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });

const open = async (theme, mode) => {
  await page.goto(`${srv.url}&theme=${theme}&mode=${mode}`);
  await page.locator('h1.title').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
};
const shot = async (name, target) => {
  await (target ?? page).screenshot({ path: `${out}${name}.png` });
  console.log(name);
};

await open('aurora', 'dark');
await shot('hero-aurora-dark');
await shot('graph', page.locator('.graph-card'));
await shot('tasks', page.locator('#task-2-checkout-api'));
await shot('approaches', page.locator('#options'));
await shot('architecture', page.locator('#architecture'));
await shot('flow', page.locator('#flow'));
await shot('review-rail', page.locator('.rail'));
await page.locator('#task-2-checkout-api').scrollIntoViewIfNeeded();
await page.evaluate(() => scrollTo(0, document.getElementById('task-2-checkout-api').offsetTop - 80));
await page.locator('.pill .ptxt', { hasText: 'Checkout API' }).waitFor();
await page.keyboard.press('Control+K');
await page.locator('#spine-toggle').check();
await page.waitForTimeout(500);
await shot('jump-panel', { screenshot: o => page.screenshot({ ...o, clip: { x: 0, y: 0, width: 1440, height: 560 } }) });
await page.keyboard.press('Escape');
await page.evaluate(() => scrollTo(0, 0));
await page.locator('#spine-toggle').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change')); });
await page.locator('[data-act=export-menu]').click();
await page.waitForTimeout(300);
await shot('export-menu', { screenshot: o => page.screenshot({ ...o, clip: { x: 980, y: 0, width: 460, height: 470 } }) });

await open('editorial', 'light');
await shot('hero-editorial-light');
await open('blueprint', 'dark');
await shot('hero-blueprint-dark');
await open('fluid', 'light');
await shot('hero-fluid-light');
await open('slate', 'light');
await shot('hero-slate-light');
await open('aurora', 'light');
await shot('hero-aurora-light');

await open('aurora', 'light');
await page.evaluate(() => scrollTo(0, 0));
await shot('overview', { screenshot: o => page.screenshot({ ...o, clip: { x: 0, y: 0, width: 1440, height: 640 } }) });

{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const p = await phone.newPage();
  await p.goto(`${srv.url}&theme=fluid&mode=light`);
  await p.locator('.overview').waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}phone.png` });
  console.log('phone');
  await p.locator('[data-view=now]').tap();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}phone-now.png` });
  console.log('phone-now');
  await phone.close();
}

{
  const { mkdtempSync, copyFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { createPlanServer } = await import('../server/serve.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'plan-live-media-'));
  for (const f of ['media-plan.md', 'pipeline.svg']) copyFileSync(fileURLToPath(new URL(`../docs/examples/${f}`, import.meta.url)), join(dir, f));
  const media = await createPlanServer({ planPath: join(dir, 'media-plan.md') });
  await page.goto(`${media.url}&theme=fluid&mode=light`);
  await page.locator('h1.title').waitFor();
  await page.waitForTimeout(500);
  while (await page.locator('.embed-play').count()) await page.locator('.embed-play').first().click();
  await page.locator('.embed').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.evaluate(() => scrollTo(0, document.querySelector('#a-picture-from-the-plan-s-folder')?.offsetTop - 70 || 300));
  await page.waitForTimeout(600);
  await shot('media');
  await media.close();
}

await browser.close();
await srv.close();
