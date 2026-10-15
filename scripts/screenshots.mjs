import { mkdtempSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createPlanServer } from '../server/serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'plan-live-shots-'));
const plan = join(dir, 'plan.md');
copyFileSync(`${root}test/fixtures/superpowers-style.md`, plan);

const srv = await createPlanServer({ planPath: plan });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const shoot = async (name, theme, mode, prep) => {
  await page.goto(`${srv.url}&theme=${theme}&mode=${mode}`);
  await page.locator('h1.title').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await prep?.();
  await page.screenshot({ path: `${root}docs/screenshots/${name}.png` });
  console.log(name);
};

await shoot('hero-aurora-dark', 'aurora', 'dark');
await shoot('hero-editorial-light', 'editorial', 'light');
await shoot('hero-blueprint-dark', 'blueprint', 'dark');
await shoot('graph', 'aurora', 'light', () => page.locator('svg.dag').first().scrollIntoViewIfNeeded());
await shoot('review-rail', 'aurora', 'dark', async () => {
  await page.locator('[data-task] .t').first().click();
  await page.keyboard.press('c');
  await page.locator('#composer-body').fill('Add a streaming option to the export endpoint');
  await page.locator('#composer button[type=submit]').click();
  await page.locator('#rail-top .cmt').waitFor();
  await page.locator('#composer').waitFor({ state: 'hidden' });
});

await browser.close();
await srv.close();
