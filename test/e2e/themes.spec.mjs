import { test, expect } from './fixture.mjs';

for (const theme of ['aurora', 'editorial', 'blueprint']) {
  for (const mode of ['light', 'dark']) {
    test(`${theme} ${mode} snapshot`, async ({ page, plan }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${plan.url}&theme=${theme}&mode=${mode}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${theme}-${mode}.png`, { fullPage: true, mask: [page.locator('#age')] });
    });
  }
}

test('theme menu and mode button persist the choice across reloads', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.locator('[data-act=theme-menu]').click();
  await page.locator('[data-theme-id=blueprint]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint');
  await page.locator('[data-act=mode]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint');
  await expect(page.locator('[data-act=mode]')).toHaveAttribute('title', /Mode: light/);
});

test('keyboard: T cycles theme, D cycles mode', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'editorial');
  await page.keyboard.press('d');
  await expect(page.locator('[data-act=mode]')).toHaveAttribute('title', /Mode: light/);
});
