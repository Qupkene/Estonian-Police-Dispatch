// Juhtimiskeskuse saal: the pictures on the room's screens, painted into 2D canvases that room3d.ts uses as
// textures. The video wall (the duty map from the menu's own painter, the board in its middle, the facts in its
// wing) and the two monitors of a console (who sits there, and the seat's duty and state). Every word comes with
// the description (scene.ts), which took it from the dictionary. Part of the lazy lobby3d chunk.
import { REGIONS } from '@/data/regions';
import { faceUrl } from '@/gen/face';
import { nameSeed, playerPicture } from '@/gen/faceSearch';
import type { LngLat } from '@/sim/types';
import { playerDrawing } from '@/ui/components/Avatar';
import { baseMap, fitView, sectorShape, type DutyInput, type MapView } from '@/ui/screens/shell/dutyMap';
import { frameOf, paintMap, type MapColours } from '@/ui/screens/shell/dutyMapCanvas';
import { LED_COLOUR, PALETTE, type SeatDesc, type WallDesc, type WallHero, type WallMap } from './scene';

/** The wall's picture in its own px: three times as wide as high and a bit, like the wall. */
export const WALL_W = 2048;
export const WALL_H = 640;
/** A monitor's picture. */
export const MONITOR_W = 256;
export const MONITOR_H = 160;

const DISPLAY = "'Archivo Variable', Archivo, 'Helvetica Neue', 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

/** The game's faces, loaded for the letters the screens use (Estonian's among them), before any text is painted. */
export async function fontsReady(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts) return;
  const sample = 'EPD Aa09 õäöüšž';
  await Promise.all(
    [`600 24px ${DISPLAY}`, `800 24px ${DISPLAY}`, `500 24px ${MONO}`].map((f) =>
      fonts.load(f, sample).catch(() => []),
    ),
  );
  await fonts.ready;
}

/** The wall's map colours: vk.css's dark map tokens, whatever the page's theme (the room is always a dark room). */
const MAP_COLOURS: MapColours = {
  sea: 'oklch(0.175 0.026 248)',
  grat: 'oklch(0.235 0.026 245)',
  waterline: 'oklch(0.42 0.05 236)',
  nb: 'oklch(0.215 0.014 250)',
  'nb-line': 'oklch(0.31 0.016 250)',
  land: 'oklch(0.255 0.016 250)',
  home: 'oklch(0.285 0.022 248)',
  coast: 'oklch(0.66 0.04 236)',
  border: 'oklch(0.74 0.03 240)',
  'pref-line': 'oklch(0.64 0.026 245)',
  'sector-line': 'oklch(0.56 0.022 245)',
  road: 'oklch(0.5 0.02 250)',
  acc: 'oklch(0.79 0.12 232)',
  amb: 'oklch(0.79 0.12 75)',
  hatchOpacity: 0.55,
};

/** Estonia with a little sea around it. */
const COUNTRY: [LngLat, LngLat] = [
  [21.7, 57.5],
  [28.25, 59.7],
];

/** The header strip's height, and the three parts of the wall under it: the map's wing, the board, the facts. */
const HEADER_H = 60;
const WING = { x: 20, y: HEADER_H + 16, w: 600, h: WALL_H - HEADER_H - 32 };
const BOARD = { x: 660, w: 728 };
const SIDE = { x: 1470, w: 540 };

/** Where the map sits on the wall (wall px) and its view. */
interface MapPlace {
  x: number;
  y: number;
  w: number;
  h: number;
  view: MapView;
}

function mapPlace(map: WallMap): MapPlace {
  const bounds = (map.zoom === 'region' && map.regionId && REGIONS[map.regionId]?.bounds) || COUNTRY;
  if (map.span === 'wing') return { ...WING, view: fitView(bounds, WING.w, WING.h, 18) };
  // Over the whole wall: the land under the title, clear of the facts at the right.
  const h = WALL_H - HEADER_H;
  return {
    x: 0,
    y: HEADER_H,
    w: WALL_W,
    h,
    view: fitView(bounds, WALL_W, h, { top: 150, right: SIDE.w + 80, bottom: 26, left: 80 }),
  };
}

/**
 * Where each of the map's sectors is on the wall, as fractions of its width and height from the top left (the light
 * lines from the consoles end there).
 */
export function sectorAnchors(map: WallMap): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!map.sectors.length) return out;
  const place = mapPlace(map);
  for (const s of map.sectors) {
    const shape = sectorShape(place.view, s.id);
    if (shape) out[s.id] = [(place.x + shape.label[0]) / WALL_W, (place.y + shape.label[1]) / WALL_H];
  }
  return out;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Text cut with an ellipsis to fit `max` px in the context's font. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/**
 * Sets the context's font to the largest size from `size` down (to `least`) at which `text` fits `max` px: the
 * wall's big lines are shown whole, not cut.
 */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  weight: number,
  family: string,
  size: number,
  least: number,
) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > least && ctx.measureText(text).width > max) {
    px -= 4;
    ctx.font = `${weight} ${px}px ${family}`;
  }
}

/** Capitals with tracking, as the game's section heads are set. */
function tracked(ctx: CanvasRenderingContext2D, em: number) {
  ctx.letterSpacing = `${em}em`;
}

/** The wall's map as last painted, kept by the room: the clock's minute repaints the wall, not the map. */
export interface WallLayer {
  key: string;
  canvas: HTMLCanvasElement | null;
}

/** The map alone, on a canvas of its place's size. */
function mapLayer(map: WallMap, place: MapPlace): HTMLCanvasElement | null {
  const layer = makeCanvas(place.w, place.h);
  const lc = layer.getContext('2d');
  if (!lc) return null;
  const input: DutyInput = {
    mine: [],
    whole: map.regionId && !map.sectors.length ? [map.regionId] : [],
    offered: [],
    challenge: null,
    home: map.regionId,
  };
  const base = baseMap(place.view);
  const empty = { mine: [], offered: [], challenge: null, challengePin: null, towns: [], labels: [] };
  paintMap(lc, frameOf(place.w, place.h, place.w, place.h, false), base, empty, input, true, MAP_COLOURS);
  lc.setTransform(1, 0, 0, 1, 0, 0);
  for (const s of map.sectors) {
    const shape = sectorShape(place.view, s.id);
    if (!shape) continue;
    lc.save();
    if (shape.clip) lc.clip(new Path2D(shape.clip));
    const d = new Path2D(shape.d);
    lc.globalAlpha = 0.5;
    lc.fillStyle = s.colour;
    lc.fill(d);
    lc.globalAlpha = 1;
    lc.strokeStyle = s.colour;
    lc.lineWidth = 2.5;
    lc.lineJoin = 'round';
    lc.stroke(d);
    lc.restore();
    lc.fillStyle = s.colour;
    lc.beginPath();
    lc.arc(shape.label[0], shape.label[1], 6, 0, Math.PI * 2);
    lc.fill();
  }
  lc.fillStyle = MAP_COLOURS.border;
  for (const town of base.towns) {
    if (town.size > 1) continue;
    lc.beginPath();
    lc.arc(town.x, town.y, town.size === 0 ? 4 : 3, 0, Math.PI * 2);
    lc.fill();
  }
  return layer;
}

function paintWallMap(ctx: CanvasRenderingContext2D, map: WallMap, dim: boolean, cache: WallLayer) {
  const place = mapPlace(map);
  const key = JSON.stringify(map);
  if (cache.key !== key || !cache.canvas) {
    cache.key = key;
    cache.canvas = mapLayer(map, place);
  }
  const layer = cache.canvas;
  if (!layer) return;
  ctx.save();
  ctx.globalAlpha = dim ? 0.5 : 1;
  ctx.drawImage(layer, place.x, place.y);
  if (map.span === 'wing') {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(place.x, place.y, place.w, place.h);
  }
  ctx.restore();
}

function paintHero(ctx: CanvasRenderingContext2D, hero: WallHero, full: boolean, dim: boolean) {
  const cx = full ? (WALL_W - SIDE.w) / 2 : BOARD.x + BOARD.w / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = dim ? 0.7 : 1;
  if (hero.kind === 'title') {
    // Over a map the title sits in the strip of sea above the land; next to one it has the board to itself.
    const y = full ? HEADER_H + 100 : 330;
    const big = hero.big.toLocaleUpperCase();
    tracked(ctx, 0.08);
    fitFont(ctx, big, full ? 1100 : BOARD.w - 16, 800, DISPLAY, full ? 84 : 104, 48);
    ctx.fillStyle = PALETTE.text;
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = dim ? 14 : 28;
    ctx.fillText(big, cx, y);
    ctx.shadowBlur = 0;
    ctx.font = `500 34px ${MONO}`;
    tracked(ctx, 0.04);
    ctx.fillStyle = PALETTE.cyan;
    ctx.fillText(fit(ctx, hero.sub, full ? 1200 : BOARD.w), cx, y + (full ? 48 : 70));
  } else if (hero.kind === 'code') {
    ctx.font = `600 30px ${DISPLAY}`;
    tracked(ctx, 0.2);
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(hero.label.toLocaleUpperCase(), cx, 190);
    // As large as the board takes the whole code: it is what the others type in.
    tracked(ctx, 0.04);
    fitFont(ctx, hero.code, BOARD.w - 24, 500, MONO, 176, 80);
    ctx.fillStyle = PALETTE.text;
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = 34;
    ctx.fillText(hero.code, cx, 390);
    ctx.shadowBlur = 0;
    ctx.font = `600 40px ${DISPLAY}`;
    tracked(ctx, 0.04);
    ctx.fillStyle = PALETTE.cyan;
    ctx.fillText(fit(ctx, hero.sub, BOARD.w), cx, 486);
  } else {
    ctx.font = `700 40px ${DISPLAY}`;
    tracked(ctx, 0.14);
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(fit(ctx, hero.title.toLocaleUpperCase(), BOARD.w), cx, 142);
    tracked(ctx, 0);
    const rowH = 104;
    hero.rows.forEach((row, i) => {
      const y = 178 + i * rowH;
      const x = BOARD.x;
      ctx.fillStyle = row.me ? 'rgba(95, 200, 250, 0.16)' : 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(x, y, BOARD.w, rowH - 14);
      ctx.fillStyle = row.name ? (i === 0 ? PALETTE.gold : PALETTE.cyan) : PALETTE.grey;
      ctx.fillRect(x, y, 8, rowH - 14);
      ctx.textAlign = 'center';
      ctx.font = `600 56px ${MONO}`;
      ctx.fillStyle = row.name ? PALETTE.text : PALETTE.textFaint;
      ctx.fillText(row.rank, x + 62, y + 66);
      if (row.name) {
        ctx.textAlign = 'right';
        ctx.font = `500 48px ${MONO}`;
        const scoreW = ctx.measureText(row.score).width;
        ctx.fillText(row.score, x + BOARD.w - 24, y + 64);
        ctx.textAlign = 'left';
        ctx.font = `600 46px ${DISPLAY}`;
        ctx.fillText(fit(ctx, row.name, BOARD.w - 160 - scoreW), x + 120, y + 62);
      } else {
        // Nobody holds the rank yet: a rule where the name will be.
        ctx.fillStyle = PALETTE.grey;
        ctx.fillRect(x + 120, y + 42, BOARD.w - 170, 5);
      }
    });
  }
  ctx.restore();
}

function paintSide(ctx: CanvasRenderingContext2D, side: WallDesc['side']) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = HEADER_H + 62;
  for (const row of side) {
    if (row.colour) {
      // A desk of a sector room: its colour and its name.
      ctx.fillStyle = row.colour;
      ctx.fillRect(SIDE.x, y - 26, 30, 30);
      ctx.font = `600 34px ${DISPLAY}`;
      tracked(ctx, 0);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(fit(ctx, row.label, SIDE.w - 50), SIDE.x + 46, y);
      y += 52;
      continue;
    }
    ctx.font = `600 22px ${DISPLAY}`;
    tracked(ctx, 0.16);
    ctx.fillStyle = PALETTE.textFaint;
    ctx.fillText(fit(ctx, row.label.toLocaleUpperCase(), SIDE.w), SIDE.x, y - 14);
    ctx.font = `600 40px ${DISPLAY}`;
    tracked(ctx, 0);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(fit(ctx, row.value, SIDE.w), SIDE.x, y + 28);
    y += 96;
  }
  ctx.restore();
}

/** The whole wall for a description, on a canvas of WALL_W x WALL_H (scaled by `scale` for a small screen). */
export function paintWall(canvas: HTMLCanvasElement, wall: WallDesc, scale: number, cache: WallLayer): void {
  const w = Math.round(WALL_W * scale);
  const h = Math.round(WALL_H * scale);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.navy;
  ctx.fillRect(0, 0, WALL_W, WALL_H);
  const full = wall.map.span === 'full';
  paintWallMap(ctx, wall.map, wall.dim, cache);
  // The strip along the top: the room's name, and at the right its state and the clock.
  ctx.fillStyle = 'rgba(5, 9, 14, 0.82)';
  ctx.fillRect(0, 0, WALL_W, HEADER_H);
  ctx.fillStyle = wall.dim ? PALETTE.grey : PALETTE.cyan;
  ctx.fillRect(0, HEADER_H - 3, WALL_W, 3);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = wall.dim ? 0.7 : 1;
  ctx.font = `700 28px ${DISPLAY}`;
  tracked(ctx, 0.18);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(wall.header.toLocaleUpperCase(), 28, 40);
  ctx.textAlign = 'right';
  ctx.font = `500 28px ${MONO}`;
  tracked(ctx, 0.04);
  let right = WALL_W - 28;
  if (wall.clock) {
    ctx.fillText(wall.clock, right, 40);
    right -= ctx.measureText(wall.clock).width + 36;
  }
  ctx.font = `600 24px ${DISPLAY}`;
  tracked(ctx, 0.16);
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText(wall.state.toLocaleUpperCase(), right, 39);
  ctx.globalAlpha = 1;
  tracked(ctx, 0);
  paintHero(ctx, wall.hero, full, wall.dim);
  if (wall.side.length) {
    if (full) {
      // Over a map the facts get a plate of their own to be read on.
      ctx.fillStyle = 'rgba(5, 9, 14, 0.72)';
      ctx.fillRect(SIDE.x - 30, HEADER_H, WALL_W - SIDE.x + 30, WALL_H - HEADER_H);
    }
    paintSide(ctx, wall.side);
  }
  // The seams of the wall's cubes: eight across, three down.
  ctx.fillStyle = 'rgba(2, 5, 9, 0.6)';
  for (let i = 1; i < 8; i++) ctx.fillRect((WALL_W / 8) * i - 1.5, 0, 3, WALL_H);
  for (let j = 1; j < 3; j++) ctx.fillRect(0, (WALL_H / 3) * j - 1.5, WALL_W, 3);
}

/** A player's picture as PlayerAvatar shows it: the face they picked, else their drawing. Null when it will not load. */
export function loadPicture(picture: { avatar: string; name: string }): Promise<HTMLImageElement | null> {
  const pic = playerPicture(picture.avatar || undefined, picture.name);
  const load = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  // A face that does not load falls back to the drawing of the name, as PlayerAvatar does.
  if (pic.kind === 'face')
    return load(faceUrl(pic.face)).then((img) => img ?? load(playerDrawing(nameSeed(picture.name))));
  return load(playerDrawing(pic.seed));
}

function monitorBase(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (canvas.width !== MONITOR_W) canvas.width = MONITOR_W;
  if (canvas.height !== MONITOR_H) canvas.height = MONITOR_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, 0, 0, MONITOR_H);
  g.addColorStop(0, '#0d1b29');
  g.addColorStop(1, '#081019');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, MONITOR_W, MONITOR_H);
  ctx.textBaseline = 'alphabetic';
  return ctx;
}

/** A console's first monitor: who sits there (picture and name), or that the seat is free. */
export function paintIdentity(
  canvas: HTMLCanvasElement,
  seat: SeatDesc,
  picture: HTMLImageElement | null,
): void {
  const ctx = monitorBase(canvas);
  if (!ctx) return;
  const cx = MONITOR_W / 2;
  const cy = 62;
  const r = 46;
  const taken = seat.state === 'seated' || seat.state === 'invite';
  if (taken && picture) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = PALETTE.desk;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.drawImage(picture, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.lineWidth = seat.me ? 5 : 3;
  ctx.strokeStyle = taken ? (seat.me ? PALETTE.cyan : PALETTE.textDim) : PALETTE.grey;
  ctx.setLineDash(taken ? [] : [7, 7]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.font = `600 ${taken ? 27 : 23}px ${DISPLAY}`;
  ctx.fillStyle = taken ? PALETTE.text : PALETTE.textFaint;
  ctx.fillText(fit(ctx, seat.name, MONITOR_W - 20), cx, 146);
  if (seat.host) {
    ctx.font = `700 15px ${DISPLAY}`;
    tracked(ctx, 0.12);
    const word = seat.hostWord.toLocaleUpperCase();
    const w = ctx.measureText(word).width + 14;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(MONITOR_W - w - 8, 8, w, 22);
    ctx.fillStyle = PALETTE.off;
    ctx.fillText(word, MONITOR_W - 8 - w / 2 + 1, 24);
    tracked(ctx, 0);
  }
}

/** A console's second monitor: the seat's number, its duty (role, sector) and its player's state. */
export function paintStatus(canvas: HTMLCanvasElement, seat: SeatDesc): void {
  const ctx = monitorBase(canvas);
  if (!ctx) return;
  const colour = seat.tint ?? (seat.me ? PALETTE.cyan : PALETTE.textDim);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, MONITOR_W, 8);
  ctx.textAlign = 'right';
  ctx.font = `600 84px ${MONO}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillText(String(seat.index + 1), MONITOR_W - 12, 108);
  ctx.textAlign = 'left';
  ctx.font = `600 26px ${DISPLAY}`;
  ctx.fillStyle = seat.state === 'free' || seat.state === 'open' ? PALETTE.textDim : PALETTE.text;
  // A long duty ("Raadio ja registrid") takes two lines.
  const words = seat.title.split(' ');
  let line = '';
  let y = 46;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > MONITOR_W - 28 && y < 70) {
      ctx.fillText(line, 14, y);
      line = word;
      y += 30;
    } else line = next;
  }
  ctx.fillText(fit(ctx, line, MONITOR_W - 28), 14, y);
  if (seat.status) {
    ctx.fillStyle = LED_COLOUR[seat.led];
    ctx.beginPath();
    ctx.arc(24, 134, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 22px ${DISPLAY}`;
    tracked(ctx, 0.1);
    ctx.fillText(fit(ctx, seat.status.toLocaleUpperCase(), MONITOR_W - 56), 42, 142);
    tracked(ctx, 0);
  }
}
