import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}ui/vendor`;
const FONTS = [
  ['inter', 'Inter', [400, 500, 600, 700], ['normal']],
  ['jetbrains-mono', 'JetBrains Mono', [400, 600], ['normal']],
  ['fraunces', 'Fraunces', [400, 600, 800], ['normal', 'italic']],
  ['source-serif-4', 'Source Serif 4', [400, 600], ['normal']],
  ['space-grotesk', 'Space Grotesk', [400, 500, 700], ['normal']],
  ['ibm-plex-mono', 'IBM Plex Mono', [400, 500, 600], ['normal']],
];

mkdirSync(`${out}/fonts`, { recursive: true });
const faces = [];
for (const [pkg, family, weights, styles] of FONTS) {
  for (const w of weights) for (const s of styles) {
    const file = `${pkg}-latin-${w}-${s}.woff2`;
    const src = `${root}node_modules/@fontsource/${pkg}/files/${file}`;
    if (!existsSync(src)) throw new Error(`missing ${src}`);
    copyFileSync(src, `${out}/fonts/${file}`);
    faces.push(`@font-face { font-family: '${family}'; font-style: ${s}; font-weight: ${w}; font-display: swap; src: url(/vendor/fonts/${file}) format('woff2'); }`);
  }
}
mkdirSync(`${out}/licenses`, { recursive: true });
for (const [pkg] of FONTS) copyFileSync(`${root}node_modules/@fontsource/${pkg}/LICENSE`, `${out}/licenses/${pkg}-OFL.txt`);
copyFileSync(`${root}node_modules/mermaid/LICENSE`, `${out}/licenses/mermaid-MIT.txt`);
writeFileSync(`${out}/fonts.css`, faces.join('\n') + '\n');
copyFileSync(`${root}node_modules/mermaid/dist/mermaid.min.js`, `${out}/mermaid.min.js`);
console.log(`vendored ${faces.length} font faces + mermaid into ui/vendor`);
