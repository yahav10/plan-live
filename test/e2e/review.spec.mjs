import { test, expect } from './fixture.mjs';

async function addComment(page, text) {
  await page.locator('[data-task="task-1-parser/implement-parse"] .t').click();
  await page.keyboard.press('c');
  await page.locator('#composer-body').fill(text);
  await page.locator('#composer button[type=submit]').click();
}

test('comment → Apply → Claude edits and resolves → Accept', async ({ page, plan }) => {
  await page.goto(plan.url);
  await addComment(page, 'call it parseUnsafe');
  await expect(page.locator('#rail-top .cmt')).toHaveCount(1);
  await expect(page.locator('#rail-top .cmt .anchor')).toContainText('T1 › “Implement parse”');
  await page.locator('.apply').click();
  await expect(page.locator('.rail-h', { hasText: 'With Claude' })).toBeVisible();

  const batch = await plan.api('GET', '/api/wait?nowait=1');
  plan.write(plan.read().replace('Implement parse', 'Implement parseUnsafe'));
  await plan.api('POST', '/api/resolve', { commentId: batch.comments[0].id, status: 'resolved', note: 'renamed' });

  const card = page.locator('.cmt.rev');
  await expect(card.locator('.add')).toHaveText('+ - [ ] Implement parseUnsafe');
  await card.locator('[data-act=accept]').click();
  await expect(card).toHaveCount(0);
  expect(plan.read()).toContain('Implement parseUnsafe');
  await expect(page.locator('details.history summary')).toHaveText('1 resolved');
});

test('Reject reverts the change in the file', async ({ page, plan }) => {
  await page.goto(plan.url);
  await addComment(page, 'rename');
  await expect(page.locator('#rail-top .cmt')).toHaveCount(1);
  await page.keyboard.press('Enter');
  const batch = await plan.api('GET', '/api/wait?nowait=1');
  plan.write(plan.read().replace('Implement parse', 'Implement parse v2'));
  await plan.api('POST', '/api/resolve', { commentId: batch.comments[0].id, status: 'resolved', note: 'v2' });
  await page.locator('.cmt.rev [data-act=reject]').click();
  await expect.poll(() => plan.read()).toContain('- [ ] Implement parse\n');
});

test('selecting text offers a suggestion with the quote pre-filled', async ({ page, plan }) => {
  await page.goto(plan.url);
  await page.locator('#intro p').click({ clickCount: 3 });
  await page.locator('#sel-comment').click();
  await expect(page.locator('#sugg-toggle')).toBeVisible();
  await page.locator('#composer-suggest').check();
  await expect(page.locator('#composer-replacement')).toHaveValue(/Intro paragraph/);
  await page.locator('#composer-body').fill('tighten');
  await page.locator('#composer-body').press('Meta+Enter');
  await expect(page.locator('#rail-top .cmt .del')).toContainText('Intro paragraph');
});

test('composer is hidden on load and closes after saving a draft', async ({ page, plan }) => {
  await page.goto(plan.url);
  await expect(page.locator('#add-comment')).toBeVisible();
  await expect(page.locator('#composer')).toBeHidden();
  await addComment(page, 'x');
  await expect(page.locator('#rail-top .cmt')).toHaveCount(1);
  await expect(page.locator('#composer')).toBeHidden();
});
