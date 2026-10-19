import { esc } from '../lib.mjs';

export const embedSrc = (id, tokens) => `/embed/${encodeURIComponent(id)}?tokens=${encodeURIComponent(JSON.stringify(tokens))}`;

export function assetUrl(src) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return null;
  return '/plan-assets/' + src.replace(/^(\.?\/)+/, '').split('/').map(encodeURIComponent).join('/');
}

export function renderImage({ alt, src, title }) {
  const url = assetUrl(src);
  if (!url) return `<div class="plan-img blocked">Remote image not loaded. plan-live keeps the page local, so it only shows images from the plan's folder. <code>${esc(src)}</code></div>`;
  return `<figure class="plan-img"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}</figure>`;
}

export function renderEmbed({ id, height }) {
  return `<div class="embed" data-embed="${esc(id)}" style="--h:${Number(height) || 320}px">`
    + '<div class="embed-head"><span>Embedded animation · sandboxed</span><span class="embed-tools"><button class="link" data-act="embed-replay" hidden>Replay</button><button class="link" data-act="embed-stop" hidden>Stop</button></span></div>'
    + '<div class="embed-stage"><button class="btn embed-play" data-act="embed-play">▶ Click to run</button></div></div>';
}

const TOKENS = ['--bg', '--card', '--ink', '--ink-2', '--muted', '--line', '--line-strong', '--accent', '--accent-ink', '--accent-soft', '--ok', '--warn', '--note', '--font-body', '--font-mono'];

export function embedTokens() {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKENS.map(k => [k, cs.getPropertyValue(k).trim()]));
}

export function pushEmbedTokens(root = document) {
  const tokens = embedTokens();
  root.querySelectorAll('iframe.embed-frame').forEach(f => f.contentWindow?.postMessage({ tokens }, '*'));
}

const setTools = (host, on) => host.querySelectorAll('.embed-tools button').forEach(b => { b.hidden = !on; });

export function playEmbed(host) {
  const frame = document.createElement('iframe');
  frame.className = 'embed-frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = 'Embedded animation';
  frame.src = embedSrc(host.dataset.embed, embedTokens());
  frame.addEventListener('load', () => pushEmbedTokens(host));
  host.querySelector('.embed-stage').replaceChildren(frame);
  setTools(host, true);
}

export function stopEmbed(host) {
  const play = document.createElement('button');
  play.className = 'btn embed-play';
  play.dataset.act = 'embed-play';
  play.textContent = '▶ Click to run';
  host.querySelector('.embed-stage').replaceChildren(play);
  setTools(host, false);
}
