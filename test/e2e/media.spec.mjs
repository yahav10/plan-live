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

test('HTML export inlines images and keeps embeds out of the way until clicked', async ({ page, plan }) => {
  writeFileSync(join(dirname(plan.path), 'pic.png'), PNG);
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url);
  await expect(page.locator('.plan-img img[alt="A pixel"]')).toBeVisible();
  await page.locator('[data-act=export-menu]').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fmt=html]').click()]);
  const html = readFileSync(await d.path(), 'utf8');
  expect(html).toContain('src="data:image/png;base64,');
  expect(html).not.toContain('/plan-assets/pic.png');
  expect(html).toContain('<details');
  expect(html).not.toMatch(/<img[^>]*tracker\.example/);
});

test('HTML export keeps embeds as click-to-run sandboxed frames that cannot touch the page or the network', async ({ page, plan, browser }, info) => {
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url + '&theme=fluid&mode=light');
  await expect(page.locator('.embed')).toBeVisible();
  await page.locator('[data-act=export-menu]').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fmt=html]').click()]);
  const file = info.outputPath('export.html');
  await d.saveAs(file);
  const html = readFileSync(file, 'utf8');
  expect((html.match(/<script/gi) ?? []).length).toBe(1);
  expect(html.match(/<script>([\s\S]*?)<\/script>/)[1]).not.toContain('starting');
  expect(html).toContain('<details');
  expect(html).toContain('data-doc="');
  expect(html).not.toContain('srcdoc="');
  expect(html).toContain('sandbox="allow-scripts"');
  expect(html).not.toContain('allow-same-origin');
  expect(html).not.toContain('Embedded animation. It runs in plan-live only.');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
  expect(csp).toContain("script-src 'unsafe-inline'");
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toMatch(/connect-src (?!'none')/);
  const offline = await browser.newPage();
  await offline.goto('file://' + file);
  const frame = () => offline.frames().find(f => f !== offline.mainFrame());
  await expect.poll(async () => (await frame()?.locator('#out').count()) ?? 0).toBe(0);
  await offline.locator('.embed-export summary').click();
  const out = offline.frameLocator('iframe.embed-frame').locator('#out');
  await expect(out).toContainText('"parent":"blocked"');
  const r = JSON.parse(await out.textContent());
  expect(r.cookie).toBe('blocked');
  expect(r.fetch).toBe('blocked');
  expect(r.accent).not.toBe('');
  await offline.close();
});

test('an export without embeds keeps the strict policy with no script allowance', async ({ page, plan }, info) => {
  await page.goto(plan.url);
  await page.locator('[data-act=export-menu]').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fmt=html]').click()]);
  const html = readFileSync(await d.path(), 'utf8');
  expect(html).not.toContain('script-src');
  expect(html).not.toContain('<iframe');
});

test('PDF export swaps embeds for still frames in light colours, then restores them', async ({ page, plan }) => {
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url + '&theme=aurora&mode=dark');
  await page.evaluate(() => { window.__print = null; window.print = () => { window.__print = [...document.querySelectorAll('iframe.embed-frame')].map(f => f.getAttribute('src')); }; });
  await page.locator('[data-act=export-menu]').click();
  await page.locator('[data-fmt=pdf]').click();
  await expect.poll(() => page.evaluate(() => window.__print)).not.toBeNull();
  const srcs = await page.evaluate(() => window.__print);
  expect(srcs).toHaveLength(1);
  expect(srcs[0]).toContain('still=1');
  await expect(page.frameLocator('iframe.embed-frame').locator('html')).toHaveAttribute('data-still', 'true');
  const out = page.frameLocator('iframe.embed-frame').locator('#out');
  await expect(out).toContainText('accent');
  expect(JSON.parse(await out.textContent()).accent).toBe('#6a55ff');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.embed iframe')).toHaveCount(0);
  await expect(page.locator('.embed .embed-play')).toBeVisible();
});

test('PDF export puts a running embed back to running afterwards', async ({ page, plan }) => {
  plan.write(mediaPlan(plan.read()));
  await page.goto(plan.url + '&theme=fluid&mode=light');
  await page.locator('.embed-play').click();
  await expect(page.locator('iframe.embed-frame')).toHaveCount(1);
  await page.evaluate(() => { window.__done = false; window.print = () => { window.__done = true; }; });
  await page.locator('[data-act=export-menu]').click();
  await page.locator('[data-fmt=pdf]').click();
  await expect.poll(() => page.evaluate(() => window.__done)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('iframe.embed-frame')).toHaveAttribute('src', /^(?!.*still=1)/);
  await expect(page.locator('.embed-tools button').first()).toBeVisible();
});

test('callouts render with their kind and label, and hostile text in them stays inert', async ({ page, plan }) => {
  plan.write(plan.read() + '\n## Notices\n> [!NOTE]\n> A **plain** note.\n\n> [!WARNING] Careful\n> Never run `rm -rf` here.\n\n> [!CAUTION]\n> <img src=x onerror="window.__pwned=1"> and <script>window.__pwned=2</script>\n');
  await page.goto(plan.url);
  await expect(page.locator('.callout-note .callout-title')).toHaveText('Note');
  await expect(page.locator('.callout-note strong')).toHaveText('plain');
  await expect(page.locator('.callout-warning .callout-title')).toHaveText('Careful');
  await expect(page.locator('.callout-warning code')).toHaveText('rm -rf');
  await expect(page.locator('.callout-caution')).toContainText('<script>window.__pwned=2</script>');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator('.callout img, .callout script')).toHaveCount(0);
});

test('the dependency graph draws an arrowhead for every edge and a progress bar in every task box', async ({ page, plan }) => {
  await page.goto(plan.url);
  const card = page.locator('.graph-card');
  await expect(card.locator('.node')).toHaveCount(3);
  await expect(card.locator('.edge')).toHaveCount(3);
  await expect(card.locator('.head')).toHaveCount(3);
  await expect(card.locator('.bar-bg')).toHaveCount(3);
  await expect(card.locator('.node[data-node=T1] .bar')).toHaveCount(1);
});
