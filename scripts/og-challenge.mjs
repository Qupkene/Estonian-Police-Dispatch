#!/usr/bin/env node
// The link previews of the challenges (docs/CHALLENGE.md, 2.38.0): one 1200 x 630 PNG per prefecture,
// public/og/challenge-<region>.png, the prefecture lit on the map of Estonia. The dynamic part of a preview (who, how
// many points) is in its og:title and og:description (server/lib/challenges.php); the picture stays static, so no
// player ever uploads one.
//
//   node scripts/og-challenge.mjs        (needs the Playwright Chromium the project uses for its end-to-end tests)
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public', 'og');

const REGIONS = {
  pohja: { name: 'Põhja prefektuur', counties: ['Harju maakond'] },
  ida: { name: 'Ida prefektuur', counties: ['Ida-Viru maakond', 'Lääne-Viru maakond'] },
  louna: {
    name: 'Lõuna prefektuur',
    counties: ['Tartu maakond', 'Jõgeva maakond', 'Põlva maakond', 'Valga maakond', 'Viljandi maakond', 'Võru maakond'],
  },
  laane: {
    name: 'Lääne prefektuur',
    counties: ['Pärnu maakond', 'Lääne maakond', 'Saare maakond', 'Hiiu maakond', 'Rapla maakond', 'Järva maakond'],
  },
};

// Estonia's bounds, as the menus' map (src/ui/screens/shell/helpers.ts ESTONIA_BOUNDS).
const [W, S, E, N] = [21.7, 57.45, 28.25, 59.75];
const MAP_W = 500;
const kx = Math.cos(((S + N) / 2) * (Math.PI / 180));
const scale = MAP_W / ((E - W) * kx);
const MAP_H = Math.round((N - S) * scale);
const project = ([lon, lat]) => [(lon - W) * kx * scale, (N - lat) * scale];

/** SVG path of a county, its rings simplified to points at least 1.4 px apart; tiny islets left out. */
function countyPath(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let d = '';
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = [];
      for (const c of ring) {
        const p = project(c);
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.4) pts.push(p);
      }
      if (pts.length < 4) continue;
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        a += x1 * y2 - x2 * y1;
      }
      if (Math.abs(a) / 2 < 6) continue;
      d += 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';
    }
  }
  return d;
}

const counties = JSON.parse(readFileSync(join(ROOT, 'src/data/geo/counties.json'), 'utf8')).features.map((f) => ({
  name: f.properties.name,
  d: countyPath(f.geometry),
}));

// The menus' fonts, inlined (a page set from a string may not load file:// URLs).
const font = (pkg, file) =>
  `url("data:font/woff2;base64,${readFileSync(join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', file)).toString('base64')}") format("woff2")`;

function card(id) {
  const r = REGIONS[id];
  const paths = counties
    .map((c) => `<path d="${c.d}" class="${r.counties.includes(c.name) ? 'on' : ''}"/>`)
    .join('');
  return `<!doctype html><html lang="et"><head><meta charset="utf-8"><style>
@font-face { font-family: Archivo; src: ${font('archivo', 'archivo-latin-ext-wdth-normal.woff2')}; font-stretch: 62% 125%; font-weight: 100 900; }
@font-face { font-family: Archivo; src: ${font('archivo', 'archivo-latin-wdth-normal.woff2')}; font-stretch: 62% 125%; font-weight: 100 900; }
@font-face { font-family: Instrument; src: ${font('instrument-sans', 'instrument-sans-latin-ext-wdth-normal.woff2')}; font-weight: 400 700; }
@font-face { font-family: Instrument; src: ${font('instrument-sans', 'instrument-sans-latin-wdth-normal.woff2')}; font-weight: 400 700; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #11161d; color: #eef2f6; font-family: Instrument, sans-serif; }
.card { position: relative; display: grid; grid-template-columns: 1fr ${MAP_W}px; align-items: center; gap: 24px; width: 1200px; height: 630px; padding: 56px 56px 56px 64px; }
.card::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 39px, rgba(140, 170, 200, 0.05) 39px 40px), repeating-linear-gradient(90deg, transparent 0 39px, rgba(140, 170, 200, 0.05) 39px 40px); }
.brand { display: flex; align-items: center; gap: 14px; font-family: Archivo, sans-serif; font-weight: 700; font-size: 26px; letter-spacing: 0.06em; }
.kicker { margin-top: 54px; display: inline-block; padding: 6px 14px; border: 2px solid #f2a33a; border-radius: 4px; color: #f2a33a; font-family: Archivo, sans-serif; font-weight: 800; font-size: 26px; letter-spacing: 0.18em; }
h1 { margin-top: 22px; font-family: Archivo, sans-serif; font-stretch: 88%; font-weight: 800; font-size: 76px; line-height: 0.98; }
.region { margin-top: 22px; font-size: 30px; font-weight: 600; color: #8fd0ff; }
.line { margin-top: 10px; font-size: 24px; color: #b8c4d0; }
.site { position: absolute; left: 64px; bottom: 44px; font-family: Archivo, sans-serif; font-size: 22px; letter-spacing: 0.08em; color: #8d9aa8; }
.map { position: relative; justify-self: end; }
.map svg path { fill: #1d2632; stroke: #3a4757; stroke-width: 1.2; stroke-linejoin: round; }
.map svg path.on { fill: #2f7fd8; stroke: #9bd2ff; stroke-width: 1.6; }
.text { position: relative; }
</style></head><body><div class="card">
<div class="text">
  <div class="brand"><svg width="44" height="44" viewBox="0 0 64 64"><clipPath id="i"><path d="M12 8H52V33C52 44 43.6 51.6 32 56C20.4 51.6 12 44 12 33Z"/></clipPath><path d="M8 4H56V33C56 46.6 45.6 55.2 32 60C18.4 55.2 8 46.6 8 33Z" fill="#0072CE"/><g clip-path="url(#i)"><rect y="24" width="64" height="16" fill="#000"/><rect y="40" width="64" height="24" fill="#fff"/></g></svg>EPD · EESTI POLITSEI DISPETŠER</div>
  <div class="kicker">VÄLJAKUTSE</div>
  <h1>Kas teed<br>paremini?</h1>
  <div class="region">${r.name}</div>
  <div class="line">Sama vahetus, samad väljakutsed.<br>Tulemused kõrvuti.</div>
</div>
<div class="map"><svg width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">${paths}</svg></div>
<div class="site">politsei.eu</div>
</div></body></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const id of Object.keys(REGIONS)) {
    await page.setContent(card(id), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const file = join(OUT, `challenge-${id}.png`);
    await page.screenshot({ path: file, type: 'png' });
    console.log(file);
  }
} finally {
  await browser.close();
}
