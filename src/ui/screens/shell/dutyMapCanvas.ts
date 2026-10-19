// Valvekaart: the duty map's shapes painted once into a <canvas> (DutyMap.tsx puts the dots, pin and names on
// top as SVG). A full-screen SVG of these layers (the land path stroked six times wide for the waterlines,
// clipped and hatched sectors, every coast vertex) is re-rasterized by the browser whenever anything near it
// repaints, which without GPU raster starves the rest of the page (the game's WebGL start-up among it); a canvas
// is rasterized once per view, size, theme and pixel ratio, and then only composited.
// The look follows the SVG it replaced: the colours are vk.css's map tokens, read from the element, and the
// widths, dashes and opacities below are in view px (the viewBox units), scaled with the view like SVG strokes.
import type { BaseMap, DutyInput, DutyOverlay, SectorShape } from './dutyMap';

/** The map tokens the canvas paints with (vk.css, per theme). */
const TOKENS = [
  'sea',
  'grat',
  'waterline',
  'nb',
  'nb-line',
  'land',
  'home',
  'coast',
  'border',
  'pref-line',
  'sector-line',
  'road',
  'acc',
  'amb',
] as const;
type Token = (typeof TOKENS)[number];
export type MapColours = Record<Token, string> & { hatchOpacity: number };

/** The map colours as the element sees them (its theme). */
export function readColours(el: Element): MapColours {
  const cs = getComputedStyle(el);
  const out = {} as MapColours;
  for (const k of TOKENS) out[k] = cs.getPropertyValue(`--vk-${k}`).trim() || '#000';
  const op = parseFloat(cs.getPropertyValue('--vk-hatch-opacity'));
  out.hatchOpacity = Number.isFinite(op) ? op : 0.55;
  return out;
}

/** Widths, dashes and opacities of the full map and of the phone strip (view px). */
const STYLE = {
  full: {
    waterlines: [
      { line: 25.2, gap: 24, opacity: 0.3 },
      { line: 15.2, gap: 14, opacity: 0.5 },
      { line: 6.8, gap: 5.6, opacity: 0.75 },
    ],
    road: 1.25,
    pref: { width: 1.1, dash: [7, 2.5, 1.5, 2.5] },
    hatch: { size: 4, bar: 1.1 },
    offer: { width: 1.3, dash: [4, 2.5] },
    coast: 1,
    border: { width: 1.8, dash: [8, 3] },
    mine: 7,
    mineLarge: 1.5,
  },
  strip: {
    waterlines: [
      { line: 13, gap: 12, opacity: 0.3 },
      { line: 7.5, gap: 6.5, opacity: 0.5 },
      { line: 3.4, gap: 2.4, opacity: 0.75 },
    ],
    road: 0.8,
    pref: { width: 0.9, dash: [5, 2, 1.2, 2] },
    hatch: { size: 3, bar: 0.9 },
    offer: { width: 1, dash: [3, 2] },
    coast: 0.8,
    border: { width: 1.4, dash: [5, 2] },
    // The strip's rule came after the large one in the CSS: its sectors keep the 5 px band.
    mine: 5,
    mineLarge: 5,
  },
};

/** Path2D per path string, shared by every canvas (the strings are cached per view in dutyMap.ts). */
const pathCache = new Map<string, Path2D>();
function path(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
    if (pathCache.size > 400) pathCache.delete(pathCache.keys().next().value!);
  }
  return p;
}

/** The view's place on the canvas: device px per view px, and its offset (device px). */
export interface PaintFrame {
  scale: number;
  offX: number;
  offY: number;
}

/** Where the view sits in a box of cw × ch: SVG's xMidYMid slice (full) or meet (strip). */
export function frameOf(viewW: number, viewH: number, cw: number, ch: number, slice: boolean): PaintFrame {
  const sx = cw / viewW;
  const sy = ch / viewH;
  const scale = slice ? Math.max(sx, sy) : Math.min(sx, sy);
  return { scale, offX: (cw - viewW * scale) / 2, offY: (ch - viewH * scale) / 2 };
}

/** The hatch of an offered sector: 45° bars, `size` view px apart, as a pattern in view px. */
function hatch(ctx: CanvasRenderingContext2D, c: MapColours, size: number, bar: number, ratio: number) {
  const px = Math.max(2, Math.round(size * ratio));
  const tile = document.createElement('canvas');
  tile.width = px;
  tile.height = px;
  const tc = tile.getContext('2d');
  if (!tc) return null;
  tc.globalAlpha = c.hatchOpacity;
  tc.fillStyle = c.acc;
  tc.fillRect(0, 0, (bar / size) * px, px);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return null;
  // Tile px → view px, turned like the SVG pattern's rotate(45).
  const k = size / px;
  pattern.setTransform(new DOMMatrix().rotate(45).scale(k, k));
  return pattern;
}

/** Everything of the map but its dots, pin and text, in the SVG's paint order. */
export function paintMap(
  ctx: CanvasRenderingContext2D,
  frame: PaintFrame,
  base: BaseMap,
  overlay: DutyOverlay,
  input: DutyInput,
  full: boolean,
  c: MapColours,
): void {
  const st = full ? STYLE.full : STYLE.strip;
  const canvas = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.sea;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(frame.scale, 0, 0, frame.scale, frame.offX, frame.offY);
  // SVG's defaults: butt caps, miter joins at limit 4.
  ctx.miterLimit = 4;

  const stroke = (
    d: string | Path2D,
    colour: string,
    width: number,
    o: { alpha?: number; join?: CanvasLineJoin; cap?: CanvasLineCap; dash?: number[] } = {},
  ) => {
    if (!d) return;
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = o.join ?? 'miter';
    ctx.lineCap = o.cap ?? 'butt';
    ctx.setLineDash(o.dash ?? []);
    ctx.stroke(typeof d === 'string' ? path(d) : d);
  };
  const fill = (d: string | Path2D, colour: string | CanvasPattern, alpha = 1) => {
    if (!d) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.fill(typeof d === 'string' ? path(d) : d);
  };
  const clipped = (s: SectorShape, draw: () => void) => {
    ctx.save();
    if (s.clip) ctx.clip(path(s.clip));
    draw();
    ctx.restore();
  };

  if (full) stroke(base.graticule, c.grat, 1);
  // Waterlines: three bands along the coast, each a line with the sea's gap inside.
  if (base.land) {
    const land = path(base.land);
    for (const wl of st.waterlines) {
      stroke(land, c.waterline, wl.line, { alpha: wl.opacity, join: 'round' });
      stroke(land, c.sea, wl.gap, { join: 'round' });
    }
  }
  fill(base.neighbours, c.nb);
  stroke(base.neighbourCoast, c['nb-line'], 0.8, { join: 'round' });
  // Natural Earth's neighbours are coarse: the land border gets a band of their colour so no sea shows between.
  stroke(base.border, c.nb, 8, { join: 'round' });
  fill(base.land, c.land);
  if (input.home) {
    fill(base.prefectures[input.home], c.home);
    stroke(base.prefectures[input.home], c.home, 0.8);
  }
  for (const id of input.whole) {
    fill(base.prefectures[id], c.acc, 0.2);
    stroke(base.prefectures[id], c.acc, 1.3, { join: 'round' });
  }
  fill(base.lakes, c.sea);
  stroke(base.lakes, c.coast, 0.8);
  if (full) stroke(base.roadsLocal, c.road, 0.7, { join: 'round', cap: 'round' });
  stroke(base.roadsMain, c.road, st.road, { join: 'round', cap: 'round' });
  if (full && input.home)
    stroke(base.countyLines[input.home], c['sector-line'], 1, { cap: 'round', dash: [1, 2.4] });
  stroke(base.prefLines, c['pref-line'], st.pref.width, { dash: st.pref.dash });

  if (overlay.offered.length) {
    const pattern = hatch(ctx, c, st.hatch.size, st.hatch.bar, frame.scale);
    for (const s of overlay.offered)
      clipped(s, () => {
        if (pattern) fill(s.d, pattern);
        stroke(s.d, c.acc, st.offer.width, { join: 'round', dash: st.offer.dash });
      });
  }
  const ch = overlay.challenge;
  if (ch)
    clipped(ch, () => {
      fill(ch.d, c.amb, 0.16);
      stroke(ch.d, c.amb, 1.2, { join: 'round' });
    });
  stroke(base.coast, c.coast, st.coast, { join: 'round' });
  stroke(base.border, c.border, st.border.width, { dash: st.border.dash });
  // The player's sectors: a soft band under the fill (paint-order: stroke), a thin edge on the large ones.
  for (const s of overlay.mine) {
    const large = s.area > 2500;
    clipped(s, () => {
      stroke(s.d, c.acc, large ? st.mineLarge : st.mine, { alpha: large ? 1 : 0.3, join: 'round' });
      fill(s.d, c.acc, large ? 0.42 : 1);
    });
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}
