import { test, expect, openJump } from './fixture.mjs';

const style = (page, sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);

test('smooth scrolling is on by default and off under reduced motion', async ({ page, plan, browser }) => {
  await page.goto(plan.url);
  expect(await style(page, 'html', 'scrollBehavior')).toBe('smooth');
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const calm = await ctx.newPage();
  await calm.goto(plan.url);
  expect(await style(calm, 'html', 'scrollBehavior')).toBe('auto');
  await ctx.close();
});

test('cards rise in once on first load and never replay on live updates', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('body')).toHaveClass(/intro/);
  expect(await style(page, '#sections .card', 'animationName')).toBe('rise');
  await expect(page.locator('body')).not.toHaveClass(/intro/, { timeout: 4000 });
  plan.write(plan.read() + '\n## Later\ntext\n');
  await openJump(page);
  await expect(page.locator('#jump .jrow', { hasText: 'Later' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/intro/);
  expect(await style(page, '#sections .card', 'animationName')).not.toBe('rise');
});

test('reduced motion disables the entrance and progress bar animations', async ({ browser, plan }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  expect(await style(page, '#sections .card', 'animationName')).toBe('none');
  expect(await style(page, '.ov-bar i', 'animationName')).toBe('none');
  await ctx.close();
});

test('progress bar and pill arc sweep from zero on first load', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('body')).toHaveClass(/intro/);
  expect(await style(page, '.ov-bar i', 'animationName')).toBe('bar-sweep');
  expect(await style(page, '.pill', 'animationName')).toBe('pill-in');
});

test('a toggled checkbox pops once', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('body')).not.toHaveClass(/intro/, { timeout: 4000 });
  await expect(page.locator('.task.flip')).toHaveCount(0);
  await page.locator('[data-task="task-1-parser/implement-parse"] .cb').click();
  await expect(page.locator('.task.flip')).toHaveCount(1);
  await expect(page.locator('.task.flip')).toHaveCount(0, { timeout: 3000 });
});

test('dependency edges draw in; flowing edges keep their dash pattern', async ({ page, plan }) => {
  await page.goto(plan.url);
  const lengths = await page.locator('.graph-card svg.dag .edge').evaluateAll(els => els.map(e => [e.classList.contains('flow'), e.getAttribute('pathLength')]));
  expect(lengths.length).toBeGreaterThan(0);
  for (const [flow, len] of lengths) expect(len).toBe(flow ? null : '1');
});

test('a new comment slides into the rail once and the composer animates open', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('body')).not.toHaveClass(/intro/, { timeout: 4000 });
  await page.locator('[data-task="task-1-parser/implement-parse"] .t').click();
  await page.keyboard.press('c');
  expect(await style(page, '#composer', 'animationName')).toBe('expand');
  await page.locator('#composer-body').fill('x');
  await page.locator('#composer button[type=submit]').click();
  await expect(page.locator('#rail-top .cmt.enter')).toHaveCount(1);
  await expect(page.locator('#rail-top .cmt.enter')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#rail-top .cmt')).toHaveCount(1);
});

test('theme switch cross-fades colours briefly', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await page.keyboard.press('d');
  await expect(page.locator('html')).toHaveClass(/theming/);
  await expect(page.locator('html')).not.toHaveClass(/theming/, { timeout: 3000 });
});

test('jumping to a section flashes it', async ({ page, plan }) => {
  await page.goto(plan.url);
  await openJump(page);
  await page.locator('#jump .jrow', { hasText: 'Notes' }).click();
  await expect(page.locator('#notes.landed')).toHaveCount(1);
});
