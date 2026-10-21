import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parse, slug, shortLabel } from '../../server/parse.mjs';
import { splitLines, lineHash } from '../../server/diff.mjs';

const fx = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('mini: title, eyebrow and preamble fields', () => {
  const m = parse(fx('mini.md'));
  assert.equal(m.title, 'Mini Plan');
  assert.equal(m.meta.eyebrow, 'rev 1 (2026-10-08)');
  assert.deepEqual(m.meta.fields.map(f => f.label), ['Ticket', 'Repo']);
  assert.equal(m.preamble.at(-1).type, 'paragraph');
});

test('mini: sections include promoted Task headings with short labels', () => {
  const m = parse(fx('mini.md'));
  assert.deepEqual(m.sections.map(s => s.short), ['Goals', 'T1', 'T2', 'T3', 'Options', 'Architecture', 'Notes']);
  assert.deepEqual(m.progress, { done: 1, total: 4 });
  assert.deepEqual(m.sections[1].progress, { done: 1, total: 2 });
});

test('mini: tasks carry 1-based lines and the hash of that exact line', () => {
  const text = fx('mini.md'), lines = splitLines(text).lines, m = parse(text);
  for (const t of m.tasks) {
    assert.match(lines[t.line - 1], /\[( |x)\]/);
    assert.equal(t.hash, lineHash(lines[t.line - 1]));
  }
  assert.equal(m.tasks.find(t => t.text === 'Implement parse').checked, false);
});

test('mini: dependency graph from reference phrases', () => {
  const m = parse(fx('mini.md'));
  assert.deepEqual(m.graph.nodes.map(n => n.key), ['T1', 'T2', 'T3']);
  assert.deepEqual(m.graph.edges, [['T1', 'T2'], ['T2', 'T3'], ['T1', 'T3']]);
});

test('mini: approaches and architecture fences become structured blocks', () => {
  const m = parse(fx('mini.md'));
  const ap = m.sections.find(s => s.short === 'Options').blocks[0];
  assert.equal(ap.type, 'approaches');
  assert.deepEqual(ap.items[0], { name: 'Local server', effort: 'M', pick: true, pros: ['Live reload'], cons: ['One more process'] });
  const ar = m.sections.find(s => s.short === 'Architecture').blocks[0];
  assert.deepEqual(ar.edges, [['Browser', 'Server', 'SSE'], ['Server', 'Plan', 'fs.watch'], ['Claude', 'Plan', 'Edit']]);
  assert.deepEqual(ar.nodes.map(n => n.key), ['Browser', 'Server', 'Plan', 'Claude']);
});

test('fence-aware: headings, tasks and tables inside code fences stay code', () => {
  const m = parse(fx('mini.md'));
  const notes = m.sections.find(s => s.short === 'Notes');
  assert.equal(notes.blocks[0].type, 'code');
  assert.match(notes.blocks[0].code, /- \[ \] not a task/);
  assert.equal(notes.blocks[1].type, 'table');
  assert.equal(notes.progress.total, 0);
  assert.ok(!m.sections.some(s => s.heading === 'not a heading'));
});

test('superpowers-style: Task headings become sections; code lines stay code', () => {
  const m = parse(fx('superpowers-style.md'));
  assert.deepEqual(m.sections.map(s => s.short), ['Global', 'T1', 'T2', 'T3', 'Follow-ups']);
  assert.equal(m.tasks.length, 5);
  assert.deepEqual(m.graph.edges, [['T1', 'T2'], ['T2', 'T3']]);
  assert.ok(!m.sections.some(s => s.heading === 'not a section'));
});

test('freeform-style: tables, no tasks, eyebrow from the last dash', () => {
  const m = parse(fx('freeform-style.md'));
  assert.equal(m.title, 'Checkout Bug — Remediation Plan');
  assert.equal(m.meta.eyebrow, 'rev 2 (2026-01-15)');
  assert.equal(m.sections.length, 3);
  assert.equal(m.tasks.length, 0);
  assert.deepEqual(m.sections[1].blocks.find(b => b.type === 'table').head, ['#', 'decision', 'consequence']);
});

const priv = name => new URL(`../fixtures/private/${name}`, import.meta.url);
test('private real plans (local only): known section and step counts', { skip: !existsSync(priv('superpowers-checkbox.md')) && 'test/fixtures/private not present' }, () => {
  const count = name => { const m = parse(readFileSync(priv(name), 'utf8')); return [m.sections.length, m.tasks.length]; };
  assert.deepEqual(count('superpowers-checkbox.md'), [7, 25]);
  assert.deepEqual(count('freeform-tables.md'), [15, 0]);
  assert.deepEqual(count('staging-checklist.md'), [7, 0]);
});

test('duplicate headings get unique ids; ids survive inserting a section above', () => {
  const m = parse('## A\n- [ ] x\n## A\n- [ ] y\n');
  assert.deepEqual(m.sections.map(s => s.id), ['a', 'a-2']);
  const before = parse(fx('mini.md')).tasks.find(t => t.text === 'Implement parse').id;
  const after = parse(fx('mini.md').replace('## Goals', '## Inserted\ntext\n\n## Goals')).tasks.find(t => t.text === 'Implement parse').id;
  assert.equal(after, before);
});

test('bad approaches block renders as code with an error', () => {
  const m = parse('## X\n```approaches\njust words\n```\n');
  assert.equal(m.sections[0].blocks[0].type, 'code');
  assert.match(m.sections[0].blocks[0].error, /name:/);
});

test('short labels and slugs', () => {
  assert.equal(shortLabel('The bug, in one screen'), 'Bug');
  assert.equal(shortLabel('Task 12: Wire hooks'), 'T12');
  assert.equal(shortLabel('1. Goal'), '1 Goal');
  assert.equal(shortLabel('10. Rollout and risks'), '10 Rollout');
  assert.equal(shortLabel('2) The bug, in one screen'), '2 Bug');
  assert.equal(shortLabel('7.'), '7');
  assert.equal(shortLabel('⚠️ Before you start — read this'), 'Start');
  assert.equal(slug('⚠️'), 'x');
  assert.equal(slug('Decisions (Tom, 2026-09-09)'), 'decisions-tom-2026-09-09');
});

test('<!-- short: X --> overrides the strip label', () => {
  assert.equal(parse('## Dependency graph\n<!-- short: Graph -->\n').sections[0].short, 'Graph');
});

test('never throws on random markdown-ish input', () => {
  const parts = ['#', '## ', '### Task 1', '- [ ] ', '- [x] ', '|', '|---|', '```', '~~~', 'mermaid', 'approaches', '\n', '\r\n', ' ', 'after T1', '**L:** v', '-> ', ':'];
  let seed = 7;
  const rnd = n => (seed = (seed * 48271) % 2147483647) % n;
  for (let i = 0; i < 300; i++) {
    let s = '';
    for (let k = 0; k < 40; k++) s += parts[rnd(parts.length)];
    assert.doesNotThrow(() => parse(s));
  }
});

test('fences indented under a list item stay code; a one-line triple-backtick span is not a fence', () => {
  const md = '## A\n- item\n\n    ```bash\n    - [ ] not a task\n    | a | b |\n    |---|---|\n    ```\n\n- [ ] real\n\nuse ```js``` inline\n\n- [ ] after\n';
  const m = parse(md);
  assert.deepEqual(m.tasks.map(t => t.text), ['real', 'after']);
  assert.ok(!m.sections[0].blocks.some(b => b.type === 'table'));
});

test('an image on its own line becomes an image block, but not inside code or mid-sentence', () => {
  const m = parse('## A\n![Flow chart](docs/flow.png "The flow")\n\nSee ![x](y.png) inline.\n\n```md\n![no](z.png)\n```\n');
  const blocks = m.sections[0].blocks;
  assert.deepEqual(blocks[0], { type: 'image', alt: 'Flow chart', src: 'docs/flow.png', title: 'The flow', line: 2 });
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[2].type, 'code');
  assert.equal(blocks.filter(b => b.type === 'image').length, 1);
});

test('an embed fence becomes an embed block with a content id and a clamped height', () => {
  const m = parse('## A\n```embed height=240\n<div>hi</div>\n```\n\n```embed\n<div>hi</div>\n```\n\n```embed height=5000\n<p>big</p>\n```\n\n```embed height=3\n<p>small</p>\n```\n');
  const [a, b, c, d] = m.sections[0].blocks;
  assert.equal(a.type, 'embed');
  assert.equal(a.code, '<div>hi</div>');
  assert.equal(a.height, 240);
  assert.equal(b.height, 320);
  assert.equal(a.id, b.id, 'the id comes from the code, not the position');
  assert.match(a.id, /^[0-9a-f]{12}$/);
  assert.notEqual(a.id, c.id);
  assert.equal(c.height, 900);
  assert.equal(d.height, 320, 'a height too small to parse as 3 digits falls back to the default');
});

test('other html fences stay plain code', () => {
  const m = parse('## A\n```html\n<script>alert(1)</script>\n```\n');
  assert.equal(m.sections[0].blocks[0].type, 'code');
});

const edgesFor = line => {
  const md = '### Task 1: A\n- [ ] a\n### Task 2: B\n- [ ] b\n### Task 3: C\n- [ ] c\n### Task 4: D\n- [ ] d\n### Task 5: E\n- [ ] e\n### Task 9: Z\n' + line + '\n- [ ] z\n';
  return parse(md).graph.edges.filter(e => e[1] === 'T9').map(e => e[0]).sort();
};

test('a dependency list links every task it names, in any common phrasing', () => {
  assert.deepEqual(edgesFor('Depends on Task 1, Task 2 and Task 3.'), ['T1', 'T2', 'T3']);
  assert.deepEqual(edgesFor('Depends on Task 1, 2 and 3.'), ['T1', 'T2', 'T3']);
  assert.deepEqual(edgesFor('Depends on T1 & T2.'), ['T1', 'T2']);
  assert.deepEqual(edgesFor('Blocked by Task 3, 4 or 5.'), ['T3', 'T4', 'T5']);
  assert.deepEqual(edgesFor('after T1, T2, and T4'), ['T1', 'T2', 'T4']);
  assert.deepEqual(edgesFor('Depends on Task 1 / Task 2.'), ['T1', 'T2']);
});

test('single dependencies, several triggers and look-alike phrases still behave', () => {
  assert.deepEqual(edgesFor('Depends on Task 1.'), ['T1']);
  assert.deepEqual(edgesFor('After T2 and blocked by T1.'), ['T1', 'T2']);
  assert.deepEqual(edgesFor('Runs after 2 days of soak.'), []);
  assert.deepEqual(edgesFor('Depends on Task 1 and 3 days of soak.'), ['T1']);
  assert.deepEqual(edgesFor('Depends on Task 1 and the vault.'), ['T1']);
  assert.deepEqual(edgesFor('Depends on Task 99.'), [], 'an unknown task adds no edge');
});

test('a GitHub-style alert becomes a callout block with its kind, title and paragraphs', () => {
  const m = parse('## A\n> [!WARNING]\n> Do not run this on prod.\n> Second line.\n>\n> New paragraph.\n\nAfter.\n\n> [!tip] Custom title\n> Short.\n');
  const [a, p, b] = m.sections[0].blocks;
  assert.deepEqual(a, { type: 'callout', kind: 'warning', title: '', paras: ['Do not run this on prod. Second line.', 'New paragraph.'], line: 2 });
  assert.equal(p.type, 'paragraph');
  assert.deepEqual([b.kind, b.title, b.paras], ['tip', 'Custom title', ['Short.']]);
});

test('only the five known alert kinds are callouts, and never inside code', () => {
  const m = parse('## A\n> [!FOO]\n> nope\n\n```md\n> [!NOTE]\n> still code\n```\n');
  assert.deepEqual(m.sections[0].blocks.map(b => b.type), ['quote', 'code'], 'an unknown kind is just a quote');
  for (const k of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) assert.equal(parse(`## A\n> [!${k}]\n> x\n`).sections[0].blocks[0].kind, k.toLowerCase());
});

test('an alert ends at the first line that is not part of the quote', () => {
  const m = parse('## A\n> [!NOTE]\n> inside\nplain line right after\n');
  assert.deepEqual(m.sections[0].blocks.map(b => b.type), ['callout', 'paragraph']);
});

test('a plain blockquote becomes a quote block, and checkboxes inside it are not plan steps', () => {
  const m = parse('## A\n> First line\n> still the first paragraph\n>\n> Second paragraph\n\nAfter.\n\n> - [ ] not a step\n');
  const [q, p, q2] = m.sections[0].blocks;
  assert.deepEqual(q, { type: 'quote', paras: ['First line still the first paragraph', 'Second paragraph'], line: 2 });
  assert.equal(p.type, 'paragraph');
  assert.deepEqual([q2.type, q2.paras], ['quote', ['- [ ] not a step']]);
  assert.equal(m.progress.total, 0);
});

test('an alert is still a callout and a quote right after it is its own block', () => {
  const m = parse('## A\n> [!NOTE]\n> inside\n\n> plain quote\n');
  assert.deepEqual(m.sections[0].blocks.map(b => b.type), ['callout', 'quote']);
});

test('a quote line inside a code fence stays code', () => {
  assert.deepEqual(parse('## A\n```\n> not a quote\n```\n').sections[0].blocks.map(b => b.type), ['code']);
});
