import { readFileSync } from 'node:fs';
import { test, expect } from './fixture.mjs';

async function grab(page, fmt) {
  await page.locator('[data-act=export-menu]').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-fmt=${fmt}]`).click()]);
  return { name: d.suggestedFilename(), buf: readFileSync(await d.path()) };
}
const ready = async (page, plan, query = '') => {
  await page.goto(plan.url + query);
  await expect(page.locator('h1.title')).toBeVisible();
};

test('export menu lists every format and closes on outside click', async ({ page, plan }) => {
  await ready(page, plan);
  await page.locator('[data-act=export-menu]').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  await expect(page.locator('#export-menu [data-fmt]')).toHaveCount(8);
  await page.locator('h1.title').click();
  await expect(page.locator('#export-menu')).toBeHidden();
});

test('Markdown export is the plan file byte for byte', async ({ page, plan }) => {
  await ready(page, plan);
  const { name, buf } = await grab(page, 'md');
  expect(name).toBe('plan.md');
  expect(buf.toString('utf8')).toBe(plan.read());
});

test('CSV export lists the tasks with their sections', async ({ page, plan }) => {
  await ready(page, plan);
  const { name, buf } = await grab(page, 'csv');
  expect(name).toBe('plan-tasks.csv');
  const text = buf.toString('utf8').replace(/^﻿/, '');
  expect(text.split('\n')[0]).toBe('section,task,done,line');
  expect(text).toContain('Task 1: Parser,Implement parse,no,');
});

test('JSON export carries the parsed plan model', async ({ page, plan }) => {
  await ready(page, plan);
  const { name, buf } = await grab(page, 'json');
  expect(name).toBe('plan-plan.json');
  const model = JSON.parse(buf.toString('utf8'));
  expect(model.title).toBe('Mini Plan');
  expect(model.tasks).toHaveLength(4);
});

test('review exports contain the comments and decisions', async ({ page, plan }) => {
  await ready(page, plan);
  await page.locator('[data-task="task-1-parser/implement-parse"] .t').click();
  await page.keyboard.press('c');
  await page.locator('#composer-body').fill('export me please');
  await page.locator('#composer button[type=submit]').click();
  await expect(page.locator('#rail-top .cmt')).toHaveCount(1);
  const md = await grab(page, 'review-md');
  expect(md.name).toBe('plan-review.md');
  expect(md.buf.toString('utf8')).toMatch(/## Drafts \(1\)[\s\S]*export me please/);
  const json = await grab(page, 'review-json');
  expect(json.name).toBe('plan-review.json');
  expect(JSON.parse(json.buf.toString('utf8')).comments[0].body).toBe('export me please');
});

test('standalone HTML export renders on its own with fonts inlined and no scripts', async ({ page, plan, browser }) => {
  await ready(page, plan, '&theme=editorial&mode=light');
  const { name, buf } = await grab(page, 'html');
  expect(name).toBe('plan.html');
  const html = buf.toString('utf8');
  expect(html).toContain('<title>Mini Plan</title>');
  expect(html).toContain('data-theme="editorial"');
  expect(html).toMatch(/@font-face[^}]*base64,/);
  expect(html).not.toMatch(/<script/i);
  expect(html).toContain('http-equiv="Content-Security-Policy"');
  expect(html).not.toContain('Apply comments');
  expect(html).not.toContain('class="rail"');
  const offline = await browser.newPage();
  await offline.setContent(html);
  await expect(offline.locator('h1.title')).toHaveText('Mini Plan');
  await expect(offline.locator('.task')).toHaveCount(4);
  await expect(offline.locator('.graph-card .node')).toHaveCount(3);
  await offline.close();
});

test('each diagram gets SVG and PNG buttons that export a styled, standalone image', async ({ page, plan }) => {
  await ready(page, plan);
  await expect(page.locator('.xtools')).toHaveCount(2);
  const grabDiagram = async (host, kind) => {
    await page.locator(host).hover();
    const [d] = await Promise.all([page.waitForEvent('download'), page.locator(`${host} .xtools [data-xport=${kind}]`).click()]);
    return { name: d.suggestedFilename(), buf: readFileSync(await d.path()) };
  };
  const svg = await grabDiagram('.graph-card', 'svg');
  expect(svg.name).toBe('plan-graph.svg');
  const text = svg.buf.toString('utf8');
  expect(text).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect(text).toMatch(/<rect[^>]*fill="rgb/);
  expect(text).toMatch(/stroke:rgb/);
  const png = await grabDiagram('.graph-card', 'png');
  expect(png.name).toBe('plan-graph.png');
  expect([...png.buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const arch = await grabDiagram('.block:has(.arch)', 'svg');
  expect(arch.name).toBe('plan-diagram-1.svg');
});

test('PDF export prints, print styles hide the chrome, and printing switches to light', async ({ page, plan }) => {
  await ready(page, plan, '&theme=aurora&mode=dark');
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.locator('[data-act=export-menu]').click();
  await page.locator('[data-fmt=pdf]').click();
  expect(await page.evaluate(() => window.__printed)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.strip')).toBeHidden();
  await expect(page.locator('.rail')).toBeHidden();
  await expect(page.locator('.card').first()).toBeVisible();
});

test('Copy as Markdown puts the source on the clipboard and confirms with a toast', async ({ page, plan, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page, plan);
  await page.locator('[data-act=export-menu]').click();
  await page.locator('[data-fmt=copy-md]').click();
  await expect(page.locator('#toast')).toContainText('Copied');
  // The Windows clipboard hands text back with CRLF line endings, whatever was written.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(plan.read());
});

test('a Mermaid diagram exports as SVG and as a real PNG', async ({ page, plan }) => {
  plan.write(plan.read() + '\n## Flow\n```mermaid\nflowchart LR\n  A[Cart] --> B{Signed in?}\n  B -- yes --> C[Pay]\n```\n');
  await ready(page, plan);
  const host = page.locator('.block:has(.mermaid-block)');
  await expect(host.locator('svg').first()).toBeVisible();
  await host.hover();
  const [svg] = await Promise.all([page.waitForEvent('download'), host.locator('.xtools [data-xport=svg]').click()]);
  expect(readFileSync(await svg.path(), 'utf8')).toMatch(/^<svg/);
  const [png] = await Promise.all([page.waitForEvent('download'), host.locator('.xtools [data-xport=png]').click()]);
  expect(png.suggestedFilename()).toBe('plan-diagram-2.png');
  expect([...readFileSync(await png.path()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});
