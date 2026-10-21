import { test, expect, openJump } from './fixture.mjs';

test('renders strip, hero and visuals', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('.pill .ptxt')).toHaveText('1 · Goals');
  await openJump(page);
  await expect(page.locator('#jump .jrow')).toHaveCount(7);
  await page.keyboard.press('Escape');
  await expect(page.locator('h1.title')).toHaveText('Mini Plan');
  await expect(page.locator('.ov-pct')).toHaveText('25%');
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
  await expect(page.locator('.ov-pct')).toHaveText('50%');
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

test('the reading spine toggles from the panel, jumps on click and remembers the choice', async ({ page, plan }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await expect(page.locator('#spine')).toBeHidden();
  await openJump(page);
  await page.locator('#spine-toggle').check();
  await expect(page.locator('#spine .tick')).toHaveCount(7);
  await expect(page.locator('#spine .tick.cur')).toHaveAttribute('aria-label', '1. Goals');
  await page.keyboard.press('Escape');
  await page.locator('#spine .tick[aria-label$="Notes"]').click();
  await expect(page.locator('.pill .ptxt')).toContainText('Notes');
  await expect(page.locator('#spine .tick.cur')).toHaveAttribute('aria-label', /Notes/);
  await page.reload();
  await expect(page.locator('#spine .tick')).toHaveCount(7);
  await openJump(page);
  await expect(page.locator('#spine-toggle')).toBeChecked();
  await page.locator('#spine-toggle').uncheck();
  await expect(page.locator('#spine')).toBeHidden();
});

test('the pill arc follows the scroll position', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  const arc = () => page.locator('.pill').evaluate(el => el.style.getPropertyValue('--scroll'));
  await expect.poll(arc).toBe('0.000');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(arc).toBe('1.000');
});

test('the panel opens centred under the pill', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await openJump(page);
  await expect(page.locator('#jump.in')).toBeVisible();
  const mid = async sel => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
  expect(Math.abs((await mid('#jump')) - (await mid('.pill')))).toBeLessThan(2);
});

test('scrolling to a new section keeps an open Export menu open', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await page.locator('[data-act="export-menu"]').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.pill .ptxt')).toContainText('Notes');
  await expect(page.locator('#export-menu')).toBeVisible();
});

test('dragging the architecture graph pans it, glides on release and never counts as a node click', async ({ page, plan }) => {
  await page.goto(plan.url);
  const svg = page.locator('.arch svg.dag');
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  const vb = () => svg.getAttribute('viewBox');
  const before = vb();
  const node = await page.locator('.arch svg.dag .node').first().boundingBox();
  await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
  await page.mouse.down();
  await page.mouse.move(node.x + node.width / 2 - 20, node.y + node.height / 2, { steps: 4 });
  await page.mouse.move(node.x + node.width / 2 - 120, node.y + node.height / 2, { steps: 4 });
  await page.mouse.up();
  const atRelease = await vb();
  expect(atRelease).not.toBe(before);
  await page.waitForTimeout(250);
  expect(await vb()).not.toBe(atRelease);
  await expect(svg).not.toHaveClass(/focus/);
  expect(box.width).toBeGreaterThan(0);
});

test('a small wobble under 4px is still a click on the node', async ({ page, plan }) => {
  await page.goto(plan.url);
  const svg = page.locator('.arch svg.dag');
  await svg.scrollIntoViewIfNeeded();
  const node = await page.locator('.arch svg.dag .node').first().boundingBox();
  const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 2, cy + 1);
  await page.mouse.up();
  await expect(svg).toHaveClass(/focus/);
});

test('? opens the shortcut list, and the key hints follow the platform', async ({ page, plan }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }); });
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await expect(page.locator('.pill .kbd')).toHaveText('Ctrl K');
  await page.keyboard.press('?');
  await expect(page.locator('#keys')).toBeVisible();
  await expect(page.locator('#keys')).toContainText('Jump to a section');
  await expect(page.locator('#keys kbd', { hasText: 'Ctrl' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#keys')).toBeHidden();
  await page.locator('[data-act=keys]').click();
  await expect(page.locator('#keys')).toBeVisible();
  await page.locator('#keys').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#keys')).toBeHidden();
});

test('on a Mac the hint shows the command key and ? is ignored while typing', async ({ page, plan }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); });
  await page.goto(plan.url);
  await expect(page.locator('.pill .kbd')).toHaveText('⌘ K');
  await page.keyboard.press('c');
  await page.locator('#composer-body').pressSequentially('what is this?');
  await expect(page.locator('#keys')).toBeHidden();
  await expect(page.locator('#composer-body')).toHaveValue('what is this?');
});

test('the outline sits beside the plan on wide screens, follows your place and jumps on click', async ({ page, plan }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(plan.url);
  await expect(page.locator('#outline')).toBeVisible();
  await expect(page.locator('#outline .orow')).toHaveCount(7);
  await expect(page.locator('#outline .orow.st-progress')).toContainText('Parser');
  await page.locator('#outline .orow', { hasText: 'Architecture' }).click();
  await expect(page.locator('.pill .ptxt')).toContainText('Architecture');
  await expect(page.locator('#outline .orow.cur')).toContainText('Architecture');
  await expect(page.locator('#outline .orow.cur')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#spine')).toBeHidden();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.locator('#outline')).toBeHidden();
});

test('a slim title and progress line appears once the header scrolls away and takes you back up', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await expect(page.locator('#titlebar')).toBeHidden();
  await page.evaluate(() => scrollTo(0, 900));
  await expect(page.locator('#titlebar')).toBeVisible();
  await expect(page.locator('#titlebar .tb-title')).toHaveText('Mini Plan');
  await expect(page.locator('#titlebar .tb-meta')).toHaveText('25% · 1 of 4');
  await page.locator('#titlebar .tb').click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page.locator('#titlebar')).toBeHidden();
});

const FOLD_PLAN = '# Fold Plan\n\n### Task 1: Done already\n- [x] one\n- [x] two\n\n### Task 2: Still open\n- [ ] three\n';

test('a finished task folds to its heading, opens on click, and the choice is remembered', async ({ page, plan }) => {
  plan.write(FOLD_PLAN);
  await page.goto(plan.url);
  const card = page.locator('section.card', { has: page.locator('h2', { hasText: 'Done already' }) });
  await expect(card).toHaveClass(/folded/);
  await expect(card.locator('.task').first()).toBeHidden();
  await expect(card.locator('.h-count')).toHaveText('2/2');
  await expect(page.locator('section.card', { hasText: 'Still open' })).not.toHaveClass(/folded/);
  await card.locator('h2').click();
  await expect(card).not.toHaveClass(/folded/);
  await expect(card.locator('.task').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('section.card', { has: page.locator('h2', { hasText: 'Done already' }) })).not.toHaveClass(/folded/);
  await page.locator('section.card', { has: page.locator('h2', { hasText: 'Done already' }) }).locator('h2').click();
  await page.reload();
  await expect(page.locator('section.card', { has: page.locator('h2', { hasText: 'Done already' }) })).toHaveClass(/folded/);
});

test('a finished task with comments still waiting stays open', async ({ page, plan }) => {
  plan.write(FOLD_PLAN);
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toHaveText('Fold Plan');
  const id = (await plan.api('GET', '/api/plan')).model.sections.find(s => s.heading.includes('Done already')).id;
  await plan.api('POST', '/api/comments', { anchor: { sectionId: id }, body: 'one more thing' });
  const card = page.locator('section.card', { has: page.locator('h2', { hasText: 'Done already' }) });
  await expect(card.locator('.pill.c')).toBeVisible();
  await expect(card).not.toHaveClass(/folded/);
});

test('the top bar fits inside a narrow window even in the widest theme', async ({ page, plan }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(plan.url + '&theme=blueprint&mode=dark');
  await expect(page.locator('h1.title')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => { const s = document.querySelector('.strip'); return s.scrollWidth <= s.clientWidth + 1; })).toBe(true);
});

test('the focus page shows one task, highlights the next step, browses and follows the current task', async ({ page, plan }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(plan.url);
  await expect(page.locator('.overview .now-name')).toContainText('T1');
  await page.locator('[data-act=focus]').click();
  await expect(page.locator('#sections section.card')).toHaveCount(1);
  await expect(page.locator('h1.title')).toBeHidden();
  await expect(page.locator('.card.focus h2')).toContainText('Parser');
  await expect(page.locator('.next-step')).toContainText('Implement parse');
  await expect(page.locator('.task.next')).toHaveCount(1);
  await page.locator('[data-act=focus-next]').click();
  await expect(page.locator('.card.focus h2')).toContainText('Server');
  await expect(page.locator('[data-act=focus-follow]')).toBeVisible();
  await page.locator('[data-act=focus-follow]').click();
  await expect(page.locator('.card.focus h2')).toContainText('Parser');
  await page.locator('.task.next .cb').click();
  await expect(page.locator('.card.focus h2')).toContainText('Server');
  await page.keyboard.press('f');
  await expect(page.locator('h1.title')).toBeVisible();
  await expect(page.locator('#sections section.card').first()).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.locator('.card.focus')).toBeVisible();
  await page.locator('#outline .orow', { hasText: 'Goals' }).click();
  await expect(page.locator('.card.focus')).toHaveCount(0);
  await expect(page.locator('h1.title')).toBeVisible();
});

test('the sticky title line pushes the rail and the outline down instead of covering them', async ({ page, plan }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(plan.url);
  await expect(page.locator('h1.title')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 1200));
  await expect(page.locator('#titlebar')).toBeVisible();
  const bar = await page.locator('#titlebar').boundingBox();
  const rail = await page.locator('.rail').boundingBox();
  const outline = await page.locator('#outline').boundingBox();
  expect(rail.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(outline.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
});
