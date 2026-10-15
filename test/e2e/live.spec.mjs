import { test, expect } from './fixture.mjs';

test('renders strip, hero and visuals', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('.secs a')).toHaveCount(7);
  await expect(page.locator('h1.title')).toHaveText('Mini Plan');
  await expect(page.locator('.ring b')).toHaveText('25%');
  await expect(page.locator('.graph-card .node')).toHaveCount(3);
  await expect(page.locator('.approach.pick .ribbon')).toHaveText('Recommended');
  await expect(page.locator('.arch svg.dag .node')).toHaveCount(4);
});

test('an external edit shows up within one second without reload', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toHaveText('Mini Plan');
  plan.write(plan.read().replace('## Notes', '## Rollout\n- [ ] Ship it\n\n## Notes'));
  await expect(page.locator('.secs a', { hasText: 'Rollout' })).toBeVisible({ timeout: 1000 });
  await expect(page.locator('.block.pulse').first()).toBeVisible();
});

test('clicking a checkbox writes [x] to the file', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.locator('[data-task="task-1-parser/implement-parse"] .cb').click();
  await expect.poll(() => plan.read()).toContain('- [x] Implement parse');
  await expect(page.locator('.ring b')).toHaveText('50%');
});

test('strip highlights the section in view and tabs scroll to sections', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.locator('.secs a', { hasText: 'Architecture' }).click();
  await expect(page.locator('.secs a.on')).toHaveText('Architecture');
});

test('offline indicator when the server stops', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('.live')).not.toHaveClass(/off/);
  await plan.close();
  await expect(page.locator('.live')).toHaveClass(/off/, { timeout: 10_000 });
});
