import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './fixture.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const EMBED = '<div id="out">starting</div><script>\n'
  + 'const r = {};\n'
  + 'try { r.parent = String(parent.document.title); } catch (e) { r.parent = "blocked"; }\n'
  + 'try { r.cookie = document.cookie; } catch (e) { r.cookie = "blocked"; }\n'
  + 'fetch("/api/status").then(x => { r.fetch = "status " + x.status; }).catch(() => { r.fetch = "blocked"; }).finally(() => {\n'
  + '  r.accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();\n'
  + '  document.getElementById("out").textContent = JSON.stringify(r);\n'
  + '});\n</script>';

const mediaPlan = base => base + '\n## Visuals\n![A pixel](pic.png "Caption here")\n\n![Gone](missing.png)\n\n![Remote](https://tracker.example/p.png)\n\n```embed height=160\n' + EMBED + '\n```\n';

test('images load from the plan folder, missing and remote ones explain themselves', async ({ page, plan }) => {
  writeFileSync(join(dirname(plan.path), 'pic.png'), PNG);
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url);
  const img = page.locator('.plan-img img[alt="A pixel"]');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate(i => i.naturalWidth)).toBe(1);
  await expect(page.locator('.plan-img figcaption')).toHaveText('Caption here');
  await expect(page.locator('.plan-img.blocked', { hasText: 'Image not found in the plan' })).toContainText('missing.png');
  await expect(page.locator('.plan-img.blocked', { hasText: 'Remote image not loaded' })).toHaveCount(1);
  const requested = [];
  page.on('request', r => requested.push(r.url()));
  await page.reload();
  await expect(img).toBeVisible();
  expect(requested.some(u => u.includes('tracker.example'))).toBe(false);
});

test('an embed waits for a click, then runs sandboxed with no access to the page, cookies or API', async ({ page, plan }) => {
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url + '&theme=fluid&mode=light');
  const host = page.locator('.embed');
  await expect(host).toBeVisible();
  await expect(host.locator('iframe')).toHaveCount(0);
  await expect(host.locator('.embed-play')).toBeVisible();
  expect(await page.content()).not.toContain('starting');
  await host.locator('.embed-play').click();
  const frame = host.locator('iframe.embed-frame');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  const out = page.frameLocator('iframe.embed-frame').locator('#out');
  await expect(out).toContainText('"parent":"blocked"');
  const text = await out.textContent();
  const r = JSON.parse(text);
  expect(r.cookie).toBe('blocked');
  expect(r.fetch).toBe('blocked');
  expect(r.accent).not.toBe('');
  await expect(host.locator('.embed-tools button').first()).toBeVisible();
});

test('the embed follows the theme, can be replayed and stopped, and survives a plan update', async ({ page, plan }) => {
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url + '&theme=fluid&mode=light');
  const host = page.locator('.embed');
  await host.locator('.embed-play').click();
  const out = page.frameLocator('iframe.embed-frame').locator('#out');
  await expect(out).toContainText('accent');
  const light = JSON.parse(await out.textContent()).accent;
  await page.locator('[data-act=mode]').click();
  await expect.poll(async () => page.frameLocator('iframe.embed-frame').locator('body').evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).not.toBe(light);
  plan.write(plan.read() + '\n- extra line\n');
  await expect(host.locator('iframe.embed-frame')).toHaveCount(1);
  await host.locator('[data-act=embed-replay]').click();
  await expect(page.frameLocator('iframe.embed-frame').locator('#out')).toContainText('parent');
  await host.locator('[data-act=embed-stop]').click();
  await expect(host.locator('iframe')).toHaveCount(0);
  await expect(host.locator('.embed-play')).toBeVisible();
});

test('the main page never executes plan script, even a plain html fence or inline markup', async ({ page, plan }) => {
  plan.write(plan.read() + '\n## Hostile\n```html\n<script>window.__pwned = 1</script>\n```\n\n<script>window.__pwned = 2</script>\n\n![x](javascript:alert(1))\n');
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator('#sections script')).toHaveCount(0);
});

test('HTML export inlines images, replaces embeds with a note and still has no scripts', async ({ page, plan }) => {
  writeFileSync(join(dirname(plan.path), 'pic.png'), PNG);
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url);
  await expect(page.locator('.plan-img img[alt="A pixel"]')).toBeVisible();
  await page.locator('[data-act=export-menu]').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fmt=html]').click()]);
  const html = readFileSync(await d.path(), 'utf8');
  expect(html).toContain('src="data:image/png;base64,');
  expect(html).not.toContain('/plan-assets/pic.png');
  expect(html).toContain('Embedded animation. It runs in plan-live only.');
  expect(html).not.toContain('<iframe');
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<img[^>]*tracker\.example/);
});
