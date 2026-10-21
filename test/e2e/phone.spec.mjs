import { test, expect } from './fixture.mjs';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a phone gets a bottom bar with Plan, Now and Review, and hides the keyboard-only buttons', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await expect(page.locator('#bottombar')).toBeVisible();
  await expect(page.locator('#bottombar .bb-tab')).toHaveText(['Plan', 'Now', 'Review']);
  await expect(page.locator('#bottombar .bb-tab[aria-selected=true]')).toHaveText('Plan');
  await expect(page.locator('[data-act=keys]')).toBeHidden();
  await expect(page.locator('[data-act=export-menu]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the tabs switch between the plan, the focus page and the review panel', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.locator('[data-view=review]').click();
  await expect(page.locator('#rail-top')).toBeVisible();
  await expect(page.locator('main')).toBeHidden();
  await page.locator('[data-view=now]').click();
  await expect(page.locator('.card.focus')).toBeVisible();
  await expect(page.locator('#rail-top')).toBeHidden();
  await expect(page.locator('#bottombar .bb-tab[aria-selected=true]')).toHaveText('Now');
  await page.locator('[data-view=plan]').click();
  await expect(page.locator('h1.title')).toBeVisible();
  await expect(page.locator('.card.focus')).toHaveCount(0);
});

test('the status line says what is waiting and opens the review panel', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('#statusbar')).toBeHidden();
  await page.locator('.task').first().locator('.t').tap();
  await page.locator('[data-act=phone-comment]').tap();
  const sheet = page.locator('#composer');
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el => getComputedStyle(el).position)).toBe('fixed');
  const box = await sheet.boundingBox();
  expect(box.y + box.height).toBeGreaterThan(800);
  await page.locator('#composer-body').fill('from my phone');
  await page.locator('#composer button[type=submit]').tap();
  await expect(page.locator('#statusbar')).toContainText('1 draft ready');
  await expect(page.locator('#bottombar .bb-n')).toHaveText('1');
  await page.locator('#statusbar button').tap();
  await expect(page.locator('#rail-top')).toContainText('from my phone');
});

test('a table collapses to rows, and tapping a row shows every column', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('.table-wrap').first()).toBeHidden();
  const row = page.locator('.rows-m .trow').first();
  await expect(row).toBeVisible();
  await expect(row.locator('summary b')).toHaveText('1');
  await row.locator('summary').tap();
  await expect(row.locator('dl')).toBeVisible();
  await expect(row.locator('dd')).toHaveText(['1', '2']);
});

test('selecting text on a phone docks a Comment bar above the tabs', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.evaluate(() => { const p = document.querySelector('main .card .block p, main .card .list li'); getSelection().selectAllChildren(p); });
  const bar = page.locator('#sel-comment');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect(box.y).toBeGreaterThan(700);
  await bar.tap();
  await expect(page.locator('#composer')).toBeVisible();
});

test('the alerts switch is remembered and a new answer from Claude raises a toast', async ({ page, plan }) => {
  await page.goto(plan.url);
  const bell = page.locator('[data-act=alerts]');
  await expect(bell).toHaveAttribute('aria-pressed', 'false');
  await bell.tap();
  await expect(bell).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('[data-act=alerts]')).toHaveAttribute('aria-pressed', 'true');
  const c = await plan.api('POST', '/api/comments', { anchor: { sectionId: 'goals' }, body: 'phone alert test' });
  await plan.api('POST', '/api/apply');
  await plan.api('GET', '/api/wait?nowait=1');
  await expect(page.locator('#statusbar')).toContainText('working on 1 comment');
  await plan.api('POST', '/api/resolve', { commentId: c.id, status: 'resolved', note: 'done' });
  await expect(page.locator('#toast')).toContainText('Claude answered 1 comment');
});

test('a long plan with a wide graph and long names never makes the page wider than the phone', async ({ page, plan }) => {
  const tasks = Array.from({ length: 10 }, (_, i) => `### Task ${i + 1}: A fairly long task title number ${i + 1} that keeps going\n${i ? `Depends on Task ${i}${i > 2 ? ', 1' : ''}.\n` : ''}- [ ] a step\n`).join('\n');
  plan.write(`# A plan with a rather long title that will need to wrap on a narrow screen\n\n${tasks}`);
  await page.goto(plan.url);
  await expect(page.locator('.overview .now-name')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#bottombar')).toBeVisible();
  const box = await page.locator('#bottombar').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844 + 1);
  await page.locator('[data-view=now]').tap();
  await expect(page.locator('.card.focus')).toBeVisible();
});

test('a comment written on the Now tab is anchored to the task on screen', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.locator('[data-view=now]').tap();
  await expect(page.locator('.card.focus')).toBeVisible();
  await page.locator('[data-act=phone-comment]').tap();
  await expect(page.locator('#composer-anchor')).toContainText('T1');
  await expect(page.locator('.card.focus .run')).toBeVisible();
  const run = await page.locator('.card.focus .run').boundingBox();
  expect(run.height).toBeLessThan(40);
});
