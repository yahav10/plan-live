import { test, expect, openJump } from './fixture.mjs';

test('renders strip, hero and visuals', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('.pill .ptxt')).toHaveText('1 · Goals');
  await openJump(page);
  await expect(page.locator('#jump .jrow')).toHaveCount(7);
  await page.keyboard.press('Escape');
  await expect(page.locator('h1.title')).toHaveText('Mini Plan');
  await expect(page.locator('.ring b')).toHaveText('25%');
  await expect(page.locator('.graph-card .node')).toHaveCount(3);
  await expect(page.locator('.approach.pick .ribbon')).toHaveText('Recommended');
  await expect(page.locator('.arch svg.dag .node')).toHaveCount(4);
});

test('an external edit shows up within one second without reload', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toHaveText('Mini Plan');
  await openJump(page);
  plan.write(plan.read().replace('## Notes', '## Rollout\n- [ ] Ship it\n\n## Notes'));
  await expect(page.locator('#jump .jrow', { hasText: 'Rollout' })).toBeVisible({ timeout: 1000 });
  await expect(page.locator('.block.pulse').first()).toBeVisible();
});

test('clicking a checkbox writes [x] to the file', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.locator('[data-task="task-1-parser/implement-parse"] .cb').click();
  await expect.poll(() => plan.read()).toContain('- [x] Implement parse');
  await expect(page.locator('.ring b')).toHaveText('50%');
});

test('the pill follows the section in view and the panel jumps to a section', async ({ page, plan }) => {
  await page.goto(plan.url);
  await openJump(page);
  await page.locator('#jump .jrow', { hasText: 'Architecture' }).click();
  await expect(page.locator('.pill .ptxt')).toContainText('Architecture');
  await expect(page.locator('#jump')).toBeHidden();
});

test('Ctrl+K opens the panel, typing filters, Enter jumps, Esc closes and returns focus', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await page.keyboard.press('Control+K');
  await expect(page.locator('#jump .jq')).toBeFocused();
  await page.keyboard.type('arch');
  await expect(page.locator('#jump .jrow')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.pill .ptxt')).toContainText('Architecture');
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Escape');
  await expect(page.locator('#jump')).toBeHidden();
  await expect(page.locator('.pill')).toBeFocused();
});

test('typing j or k in the filter does not move between sections', async ({ page, plan }) => {
  await page.goto(plan.url);
  await openJump(page);
  await page.keyboard.type('jkjk');
  await expect(page.locator('#jump .jq')).toHaveValue('jkjk');
  await expect(page.locator('#jump .jempty')).toBeVisible();
  await expect(page.locator('.pill .ptxt')).toHaveText('1 · Goals');
});

test('the panel keeps its filter when the plan changes underneath it', async ({ page, plan }) => {
  await page.goto(plan.url);
  await openJump(page);
  await page.keyboard.type('task');
  await expect(page.locator('#jump .jrow')).toHaveCount(3);
  plan.write(plan.read().replace('## Notes', '## Task extra\n- [ ] one\n\n## Notes'));
  await expect(page.locator('#jump .jrow')).toHaveCount(4);
  await expect(page.locator('#jump .jq')).toHaveValue('task');
  await expect(page.locator('#jump .jq')).toBeFocused();
});

test('offline indicator when the server stops', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('.live')).not.toHaveClass(/off/);
  await plan.close();
  await expect(page.locator('.live')).toHaveClass(/off/, { timeout: 10_000 });
});
