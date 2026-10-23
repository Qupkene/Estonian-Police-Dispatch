#!/usr/bin/env node
// Add a drawing to the newspaper's photo slot (src/ui/screens/shell/paper/drawings.ts).
//   node scripts/paper-drawing.mjs <image> <id>
// Writes paper-<id>.webp (800 px wide, for 2x screens and phones) and paper-<id>-sm.webp (480 px) next to the
// registry and prints the line to add to DRAWINGS. Needs ImageMagick (`convert` or `magick`).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [src, id] = process.argv.slice(2);
if (!src || !id || !/^[a-z][a-z0-9]*$/.test(id) || !existsSync(src)) {
  console.error('usage: node scripts/paper-drawing.mjs <image> <id>   (id: lowercase letters and digits)');
  process.exit(1);
}

const dir = fileURLToPath(new URL('../src/ui/screens/shell/paper/', import.meta.url));
const im = (() => {
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' });
      return bin;
    } catch {
      /* try the next name */
    }
  }
  console.error('ImageMagick not found (magick or convert)');
  process.exit(1);
})();

const SIZES = [
  { file: `paper-${id}.webp`, width: 800 },
  { file: `paper-${id}-sm.webp`, width: 480 },
];
for (const { file, width } of SIZES) {
  // `>` only shrinks; -strip drops metadata; method 6 is the slowest, smallest encoding.
  execFileSync(im, [
    src,
    '-resize',
    `${width}x>`,
    '-strip',
    '-quality',
    '78',
    '-define',
    'webp:method=6',
    path.join(dir, file),
  ]);
}
const identify = ['-format', '%w %h', path.join(dir, SIZES[0].file)];
const [w, h] = (
  im === 'magick'
    ? execFileSync(im, ['identify', ...identify], { encoding: 'utf8' })
    : execFileSync('identify', identify, { encoding: 'utf8' })
)
  .trim()
  .split(' ')
  .map(Number);
console.log(`Wrote ${SIZES.map((s) => s.file).join(', ')}. Add to DRAWINGS:`);
console.log(`  { id: '${id}', w: ${w}, h: ${h}, alt: { et: '', en: '' }, tags: [] },`);
