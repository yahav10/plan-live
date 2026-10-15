import { test, expect } from './fixture.mjs';

test('the session key is stripped from the address bar and the app keeps working', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await expect.poll(() => page.url()).not.toContain('key=');
  await page.reload();
  await expect(page.locator('h1.title')).toHaveText('Mini Plan');
  await expect(page.locator('.pill')).toBeVisible();
});

test('the CSP blocks nothing the app needs: load, review, diagrams, exports and themes', async ({ page, plan }) => {
  const violations = [];
  page.on('console', m => { if (/content security policy|refused to/i.test(m.text())) violations.push(m.text()); });
  page.on('pageerror', e => violations.push(String(e)));
  await page.goto(plan.url);
  await expect(page.locator('.graph-card .node')).toHaveCount(3);
  await page.locator('[data-task="task-1-parser/implement-parse"] .t').click();
  await page.keyboard.press('c');
  await page.locator('#composer-body').fill('csp check');
  await page.locator('#composer button[type=submit]').click();
  await expect(page.locator('#rail-top .cmt')).toHaveCount(1);
  await page.keyboard.press('t');
  await page.keyboard.press('d');
  await page.locator('[data-act=export-menu]').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fmt=html]').click()]);
  expect(d.suggestedFilename()).toBe('plan.html');
  await page.locator('.graph-card').hover();
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('.graph-card .xtools [data-xport=png]').click()]);
  expect(png.suggestedFilename()).toBe('plan-graph.png');
  expect(violations).toEqual([]);
});

test('an inline script injected into the DOM does not execute', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  const ran = await page.evaluate(() => new Promise(res => {
    window.__pwned = false;
    const s = document.createElement('script');
    s.textContent = 'window.__pwned = true';
    document.body.append(s);
    setTimeout(() => res(window.__pwned), 200);
  }));
  expect(ran).toBe(false);
});

test('stripping the key keeps the other URL parameters such as theme and mode', async ({ page, plan }) => {
  await page.goto(plan.url + '&theme=blueprint&mode=dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint');
  await expect.poll(() => page.url()).not.toContain('key=');
  expect(page.url()).toContain('theme=blueprint');
  expect(page.url()).toContain('mode=dark');
});
