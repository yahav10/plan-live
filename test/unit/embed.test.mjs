import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedPage, EMBED_CSP, INNER_CSP } from '../../server/embed.mjs';

test('every embed page carries its own strict policy, so it stays locked down inside an export too', () => {
  const html = embedPage('<p>x</p>', { '--accent': '#0071e3' });
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta, 'a policy meta is present');
  assert.equal(meta[1], INNER_CSP);
  assert.match(INNER_CSP, /default-src 'none'/);
  assert.match(INNER_CSP, /connect-src 'none'/);
  assert.match(INNER_CSP, /script-src 'unsafe-inline'/);
  assert.ok(!/frame-ancestors|sandbox/.test(INNER_CSP), 'those two directives only work as headers');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script>'), 'the policy comes before any script');
  assert.match(EMBED_CSP, /sandbox allow-scripts/);
  assert.match(EMBED_CSP, /frame-ancestors 'self'/);
});

test('a still embed page is flagged and has its animations and transitions switched off', () => {
  const still = embedPage('<i class="d"></i>', {}, { still: true });
  assert.match(still, /<html data-still="true">/);
  assert.match(still, /html\[data-still\] \*[^}]*animation:\s*none\s*!important/);
  assert.match(still, /transition:\s*none\s*!important/);
  const live = embedPage('<i class="d"></i>');
  assert.ok(!live.includes('data-still') && !/animation:\s*none/.test(live), 'a normal page is untouched');
});
