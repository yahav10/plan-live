import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl, renderImage, renderEmbed } from '../../ui/components/media.mjs';

test('relative image paths become plan-asset URLs, one encoded segment at a time', () => {
  assert.equal(assetUrl('docs/flow chart.png'), '/plan-assets/docs/flow%20chart.png');
  assert.equal(assetUrl('./a.png'), '/plan-assets/a.png');
  assert.equal(assetUrl('/a.png'), '/plan-assets/a.png');
});

test('remote and data URLs are never loaded', () => {
  for (const u of ['https://x.dev/a.png', 'http://x.dev/a.png', '//x.dev/a.png', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'file:///etc/passwd']) assert.equal(assetUrl(u), null, u);
});

test('an image renders as a lazy figure with escaped alt and caption', () => {
  const h = renderImage({ alt: 'a "b" <c>', src: 'x.png', title: 'cap <i>' });
  assert.match(h, /<figure class="plan-img"><img src="\/plan-assets\/x\.png" alt="a &quot;b&quot; &lt;c&gt;" loading="lazy">/);
  assert.match(h, /<figcaption>cap &lt;i&gt;<\/figcaption>/);
});

test('a remote image shows why it did not load and does not emit an img tag', () => {
  const h = renderImage({ alt: 'x', src: 'https://t.example/pixel.png', title: '' });
  assert.ok(!h.includes('<img'));
  assert.match(h, /Remote image not loaded/);
  assert.match(h, /https:\/\/t\.example\/pixel\.png/);
});

test('an embed is a click-to-run placeholder that never inlines its code or an iframe', () => {
  const h = renderEmbed({ id: 'abc123def456', height: 280, code: '<script>alert("pwn")</script><div id=x>SECRET</div>' });
  assert.match(h, /data-embed="abc123def456"/);
  assert.match(h, /--h:280px/);
  assert.match(h, /data-act="embed-play"/);
  assert.match(h, /sandboxed/i);
  assert.ok(!h.includes('<iframe'));
  assert.ok(!h.includes('pwn') && !h.includes('SECRET'));
});
