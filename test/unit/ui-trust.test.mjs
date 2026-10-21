import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../server/parse.mjs';
import { embedIds, trustState, parseTrusted, serializeTrusted } from '../../ui/components/trust.mjs';
import { renderEmbed } from '../../ui/components/media.mjs';
import { renderSections } from '../../ui/components/sections.mjs';

const model = parse('# P\n```embed\n<p>one</p>\n```\n\n## A\n```embed height=200\n<p>two</p>\n```\n\n## B\ntext\n');
const [one, two] = embedIds(model);

test('every embed in the plan, including the intro, has an id from its code', () => {
  assert.equal(embedIds(model).length, 2);
  assert.match(one, /^[0-9a-f]{12}$/);
  assert.notEqual(one, two);
  assert.deepEqual(embedIds(parse('## A\ntext\n')), []);
});

test('an animation is trusted only while its code is the one you trusted', () => {
  assert.equal(trustState(new Set(), one), 'off');
  assert.equal(trustState(new Set([one, two]), two), 'on');
  assert.equal(trustState(new Set([one]), two), 'changed', 'a new or edited animation asks again');
});

test('the trusted list survives storage, and anything that is not an embed id is dropped', () => {
  const set = new Set([one, two]);
  assert.deepEqual(parseTrusted(serializeTrusted(set)), set);
  assert.deepEqual(parseTrusted(null), new Set());
  assert.deepEqual(parseTrusted('not json'), new Set());
  assert.deepEqual(parseTrusted(JSON.stringify([one, '<script>', 7, { a: 1 }])), new Set([one]));
});

test('an embed shows how to turn autoplay on, that it is on, or that it changed', () => {
  const off = renderEmbed({ id: one, height: 200 }, { trust: 'off' });
  assert.match(off, /data-trust="off"/);
  assert.match(off, /<button class="link" data-act="trust">Autoplay animations in this plan<\/button>/);
  const on = renderEmbed({ id: one, height: 200 }, { trust: 'on' });
  assert.match(on, /data-trust="on"/);
  assert.match(on, /<button class="link" data-act="untrust">Autoplay on · turn off<\/button>/);
  const changed = renderEmbed({ id: one, height: 200 }, { trust: 'changed' });
  assert.match(changed, /Changed since you trusted this plan/);
  assert.match(changed, /data-act="trust">Trust again</);
  assert.match(renderEmbed({ id: one, height: 200 }), /data-trust="off"/, 'untrusted by default');
  assert.ok(!renderEmbed({ id: one, height: 200 }, { trust: 'on' }).includes('<iframe'), 'a trusted embed still starts as a placeholder; the page starts it');
});

test('the sections pass each embed its own trust state', () => {
  const html = renderSections({ plan: { model }, review: { comments: [] }, trusted: new Set([one]) });
  assert.match(html, new RegExp(`data-embed="${one}"[^>]*data-trust="on"|data-trust="on"[^>]*data-embed="${one}"`));
  assert.match(html, new RegExp(`data-embed="${two}"[^>]*data-trust="changed"|data-trust="changed"[^>]*data-embed="${two}"`));
});
