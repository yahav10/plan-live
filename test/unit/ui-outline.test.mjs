import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../server/parse.mjs';
import { taskStatuses, foldedSections } from '../../ui/components/status.mjs';
import { renderOutline } from '../../ui/components/outline.mjs';
import { renderTitlebar } from '../../ui/components/titlebar.mjs';
import { renderSections } from '../../ui/components/sections.mjs';

const PLAN = `# Big Plan
## Goals
- one
### Task 1: Parser
- [x] a
- [x] b
### Task 2: Server
Depends on Task 1.
- [x] a
- [ ] b
### Task 3: <b>UI</b>
- [ ] a
`;
const model = parse(PLAN);
const sid = key => model.graph.nodes.find(n => n.key === key).sectionId;

test('the outline lists every section with its status and count, and marks where you are', () => {
  const html = renderOutline({ model, active: sid('T2'), statuses: taskStatuses(model) });
  assert.equal((html.match(/class="orow/g) ?? []).length, model.sections.length);
  assert.match(html, new RegExp(`class="orow st-done" data-goto="${sid('T1')}"[^>]*><i class="odot"></i><span class="olabel"><b>T1</b> Parser</span><span class="ocount">2/2</span>`));
  assert.match(html, new RegExp(`class="orow st-progress cur" data-goto="${sid('T2')}" aria-current="true"`));
  assert.match(html, /class="orow" data-goto="goals"[^>]*><i class="odot"><\/i><span class="olabel"><b>1<\/b> Goals<\/span><span class="ocount"><\/span>/);
});

test('outline text from the plan is escaped', () => {
  const html = renderOutline({ model, active: null, statuses: taskStatuses(model) });
  assert.ok(!html.includes('<b>UI</b>'));
  assert.match(html, /&lt;b&gt;UI&lt;\/b&gt;/);
});

test('finished tasks fold unless they still have comments waiting, and a choice beats the default', () => {
  const st = taskStatuses(model);
  const comment = (id, status) => ({ status, anchor: { sectionId: id } });
  assert.deepEqual([...foldedSections(st, [], {})], [sid('T1')]);
  assert.deepEqual([...foldedSections(st, [comment(sid('T1'), 'draft')], {})], [], 'a draft keeps it open');
  assert.deepEqual([...foldedSections(st, [comment(sid('T1'), 'queued')], {})], []);
  assert.deepEqual([...foldedSections(st, [comment(sid('T1'), 'resolved')], {})], [sid('T1')]);
  assert.deepEqual([...foldedSections(st, [], { [sid('T1')]: 'open' })], [], 'you opened it');
  assert.deepEqual([...foldedSections(st, [comment(sid('T1'), 'draft')], { [sid('T1')]: 'closed' })], [sid('T1')], 'you closed it');
  assert.deepEqual([...foldedSections(st, [], { [sid('T3')]: 'closed' })], [sid('T1')], 'only finished tasks fold');
});

test('a folded card keeps its heading and count, and says it can be opened', () => {
  const html = renderSections({ plan: { model }, review: { comments: [] }, fold: {} });
  const card = html.match(new RegExp(`<section class="card[^"]*" id="${sid('T1')}"[\\s\\S]*?</section>`))[0];
  assert.match(card, /^<section class="card folded"/);
  assert.match(card, /<h2 [^>]*data-act="fold" data-sec="[^"]+" aria-expanded="false"/);
  assert.match(card, /<span class="h-count ok">2\/2<\/span>/);
  const open = html.match(new RegExp(`<section class="card[^"]*" id="${sid('T2')}"[\\s\\S]*?</section>`))[0];
  assert.ok(!open.includes('folded') && !open.includes('data-act="fold"'));
  const opened = renderSections({ plan: { model }, review: { comments: [] }, fold: { [sid('T1')]: 'open' } });
  assert.match(opened.match(new RegExp(`<section class="card[^"]*" id="${sid('T1')}"`))[0], /^<section class="card"/);
  assert.match(opened, /aria-expanded="true"/);
});

test('the sticky line shows the title, the percentage and the steps, and goes green at 100%', () => {
  const html = renderTitlebar(model);
  assert.match(html, /<span class="tb-title">Big Plan<\/span>/);
  assert.match(html, /<span class="tb-meta">50% · 3 of 6<\/span>|<span class="tb-meta">\d+% · \d+ of \d+<\/span>/);
  assert.ok(!html.includes('tb-full'));
  assert.match(renderTitlebar(parse('# Done\n- [x] a\n')), /tb-full/);
  assert.ok(!renderTitlebar(parse('# <img src=x onerror=1>\n- [ ] a\n')).includes('<img'));
  assert.equal(renderTitlebar(parse('# No steps\n')), '');
});
