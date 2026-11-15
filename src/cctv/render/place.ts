/**
 * What makes the place an incident names look like itself in the camera's picture (docs/CCTV.md): the board with the
 * place's own name or the word for its kind, and what hangs on or stands against its own building's front by kind (a
 * cash machine in a bank's wall, a bar's awning, a hotel's or a hospital's canopy, flags, a station's clock, a
 * church's tower and tall door, a building site's scaffold). The renderer (world.ts) asks here what the own building
 * is dressed as and calls dressWall for each of its walls.
 *
 * The board and the few small paintings that go with it are painted when the street is built, on a sheet of their own
 * with a night twin (what is lit after dark), and drawn by one mesh with the house fronts' own program.
 *
 * Only what the director need not know is made here: things within 0.6 m of the front wall or higher than 2.6 m.
 * What stands on the ground where people walk (a canopy on posts, pumps, a fence) is in the street's data.
 */
import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace, type Color, type Texture } from 'three';
import type { PlaceKind } from '@/sim/types';
import { along, clamp, dist, dot, hash32, nearestOnSegment, norm, pointInRing, ringCentroid, segmentHitsRing, sub, type Box, type V2 } from '../math';
import { projectPoint } from '../site';
import type { Site, SitePlace, StreetData } from '../types';
import { uvOf, type FacadeKind, type UV4 } from './facades';
import { at, type MeshBuilder, shade, type P3 } from './mesh';

/** How the own building's ground floor is laid: shop glass, a public building's windows, closed walls, a hall's gates. */
type Ground = 'glass' | 'public' | 'blank' | 'gates';

type Extra =
  /** A cash machine in the wall by the door. */
  | 'atm'
  /** A striped awning over the door. */
  | 'awning'
  /** A wide canopy over the entrance, hung from the wall. */
  | 'canopy'
  /** A small sign standing out from the wall with the kind's word, read from along the street. */
  | 'blade'
  /** The Estonian flag on a pole by the board. */
  | 'flag'
  /** A foreign flag (an embassy). */
  | 'flag2'
  /** A row of three flags (a hotel). */
  | 'flags'
  | 'clock'
  /** Poster cases beside the door. */
  | 'posters'
  /** Scaffolding with its netting along the front. */
  | 'scaffold'
  /** A church: a tower with a spire over the front, a tall door, tall windows. */
  | 'tower'
  /** Lit strips beside the door (a night club). */
  | 'strip';

/** What a kind of place is dressed as. */
export interface Dress {
  /** The word on the board when the place has no name of its own. */
  word: string;
  /** The board's colours: its ground and its letters. */
  bg: string;
  fg: string;
  /** Lit from inside after dark. */
  lit: boolean;
  /** The board's height in metres with one line of text. */
  size: number;
  /** Over the ground floor (or on the roof's edge of a low building), or a plate beside the door. */
  form: 'over' | 'beside';
  ground: Ground;
  /** Drawn with a flat roof whatever the map says (a kiosk, a supermarket, a hall). */
  flat: boolean;
  /** No windows above the ground floor (a church, a stand). */
  plain: boolean;
  /** A band in the board's colour over the glass of every wall on a street. */
  band: boolean;
  emblem: 'cross' | 'p' | null;
  extras: readonly Extra[];
}

const dress = (
  word: string,
  bg: string,
  fg: string,
  lit: boolean,
  size: number,
  ground: Ground,
  extras: readonly Extra[] = [],
  more: Partial<Dress> = {},
): Dress => ({ word, bg, fg, lit, size, ground, extras, form: 'over', flat: false, plain: false, band: false, emblem: null, ...more });

const CREAM = '#f6f3ea';
const INK = '#26303a';

/**
 * Every kind of place that has something of its own to show. The kinds left out (a street, a housing estate, a
 * private house, a park, a road, a village and the like) are what the street already is.
 */
const DRESS: Partial<Record<PlaceKind, Dress>> = {
  bar: dress('BAAR', '#2a2420', '#f2c56a', true, 1.0, 'glass', ['awning', 'blade']),
  nightclub: dress('ÖÖKLUBI', '#15101c', '#ff5cc0', true, 1.1, 'blank', ['strip', 'blade']),
  mall: dress('KAUBANDUSKESKUS', '#b3261e', CREAM, true, 1.7, 'glass', ['canopy'], { flat: true, band: true }),
  shop: dress('POOD', '#1f6a3a', CREAM, true, 1.2, 'glass', [], { flat: true, band: true }),
  bank: dress('PANK', '#123a6b', CREAM, true, 1.0, 'glass', ['atm', 'blade'], { band: true }),
  school: dress('KOOL', '#ece8dc', '#1f3a5f', false, 1.0, 'public', ['flag']),
  kindergarten: dress('LASTEAED', '#ece8dc', '#b8501a', false, 1.0, 'public'),
  university: dress('ÜLIKOOL', INK, '#ece8dc', false, 1.0, 'public', ['flag']),
  hospital: dress('HAIGLA', CREAM, '#b3261e', true, 1.2, 'public', ['canopy'], { emblem: 'cross' }),
  trainstation: dress('RAUDTEEJAAM', '#1f3f7a', CREAM, true, 1.3, 'public', ['canopy', 'clock']),
  busstation: dress('BUSSIJAAM', '#1c1c1e', '#f2c81e', true, 1.3, 'glass', ['canopy', 'clock'], { flat: true }),
  port: dress('SADAM', '#12456b', CREAM, true, 1.3, 'glass', ['canopy'], { flat: true }),
  airport: dress('LENNUJAAM', INK, CREAM, true, 1.4, 'glass', ['canopy'], { flat: true }),
  stadium: dress('STAADION', INK, CREAM, false, 1.5, 'gates', [], { flat: true, plain: true }),
  concert: dress('KONTSERDIMAJA', '#2a2420', CREAM, true, 1.2, 'glass', ['canopy', 'posters']),
  museum: dress('MUUSEUM', '#3a2e22', '#ecdcae', false, 1.0, 'public', ['posters', 'flag']),
  office: dress('BÜROOHOONE', '#3a3f45', '#e8e8e4', false, 0.9, 'glass'),
  industrial: dress('TEHAS', '#e8e8e4', INK, false, 1.4, 'gates', [], { flat: true }),
  construction: dress('EHITUS', '#f2c81e', '#1c1c1e', false, 1.2, 'blank', ['scaffold']),
  parking: dress('PARKLA', '#1456a8', CREAM, false, 1.2, 'blank', [], { flat: true, plain: true, emblem: 'p' }),
  hotel: dress('HOTELL', '#2a2420', '#ecdcae', true, 1.1, 'public', ['canopy', 'flags', 'blade']),
  church: dress('KIRIK', '#3a2e22', '#ecdcae', false, 0.6, 'blank', ['tower'], { form: 'beside', plain: true }),
  cemetery: dress('KALMISTU', '#3a2e22', '#ecdcae', false, 0.6, 'blank', [], { form: 'beside' }),
  gasstation: dress('TANKLA', '#2a5a9a', CREAM, true, 1.1, 'glass', [], { flat: true, band: true }),
  government: dress('RIIGIASUTUS', INK, '#ece8dc', false, 0.9, 'public', ['flag']),
  embassy: dress('SAATKOND', '#3a2e22', '#ecdcae', false, 0.7, 'public', ['flag2'], { form: 'beside' }),
  prison: dress('VANGLA', '#ece8dc', INK, false, 1.0, 'blank'),
  border: dress('PIIRIPUNKT', '#1f3f7a', CREAM, true, 1.1, 'public', ['canopy', 'flag']),
};

/** A petrol station's colours: the kiosk's board and the canopy's band are one brand's (made up, no real one). */
const BRANDS: readonly (readonly [string, string])[] = [['#2a5a9a', CREAM], ['#c83a2a', CREAM], ['#2a8a4a', CREAM], ['#e8b020', '#1c1c1e']];

/** What a place is dressed as, or null when its kind has nothing of its own. `seed` picks a petrol station's brand. */
export function dressOf(kind: PlaceKind, seed: number): Dress | null {
  const d = DRESS[kind];
  if (!d) return null;
  if (kind !== 'gasstation') return d;
  const [bg, fg] = BRANDS[hash32('brand', seed) % BRANDS.length];
  return { ...d, bg, fg };
}

/** A '#rrggbb' colour as a number. */
export const hexOf = (css: string) => parseInt(css.slice(1), 16);

/**
 * The lines of a place's board: its own name without what the game adds in brackets ("Pank (Liivalaia)" is a board
 * that says PANK), in capitals, in two lines when it is long (`narrow`: already when it is longer than nine
 * letters, for a board that has little width); the kind's word when there is no name.
 */
export function boardLines(name: string | null, word: string, narrow = false): string[] {
  const s = ((name ?? '').replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() || word).toUpperCase();
  if (s.length <= (narrow ? 9 : 18) || !s.includes(' ')) return [s];
  let cut = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (cut < 0 || Math.abs(i - s.length / 2) < Math.abs(cut - s.length / 2))) cut = i;
  return [s.slice(0, cut), s.slice(cut + 1)];
}

/** The own building of a place: its index in the street's buildings, or -1. */
export function ownBuildingOf(street: StreetData, place: SitePlace): number {
  if (place.building === null) return -1;
  const mid: V2 | null = place.front ? [(place.front.a[0] + place.front.b[0]) / 2, (place.front.a[1] + place.front.b[1]) / 2] : null;
  let best = -1;
  let bestD = Infinity;
  street.buildings.forEach((b, i) => {
    if (b.id !== place.building || b.open || b.ring.length < 3) return;
    // Parts of one building can share its id: the one the front lies on.
    let d = 0;
    if (mid) {
      d = Infinity;
      for (let k = 0; k < b.ring.length; k++) d = Math.min(d, nearestOnSegment(mid, b.ring[k], b.ring[(k + 1) % b.ring.length]).d);
    }
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * The wall of a footprint (anticlockwise) that is the place's front, and the stretch of it that faces the scene, in
 * metres along the wall: the wall the site's `front` lies on, or, without one, the wall the camera sees best near
 * the spot. `at` is the point of that stretch nearest to where it happens: the entrance is there. Null when the
 * building has no wall worth a board.
 */
export function frontEdgeOf(site: Site, ring: readonly V2[], front: SitePlace['front']): { i: number; s0: number; s1: number; at: number } | null {
  const cam = site.camera.pos;
  let best: { i: number; s0: number; s1: number; at: number } | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const d = ring[(i + 1) % ring.length];
    const len = dist(a, d);
    if (len < 2.5) continue;
    const t = norm(sub(d, a));
    const n: V2 = [t[1], -t[0]];
    const mid: V2 = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2];
    if (front) {
      const fm: V2 = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
      const hit = nearestOnSegment(fm, a, d);
      if (hit.d > 1.5 || dot(n, front.out) < 0.5) continue;
      const ta = nearestOnSegment(front.a, a, d).t * len;
      const tb = nearestOnSegment(front.b, a, d).t * len;
      if (-hit.d > bestScore) {
        bestScore = -hit.d;
        const [s0, s1] = [Math.min(ta, tb), Math.max(ta, tb)];
        best = { i, s0, s1, at: clamp(nearestOnSegment(site.spot, a, d).t * len, s0, s1) };
      }
      continue;
    }
    const facing = dot(n, norm(sub(cam, mid)));
    if (facing < 0.15) continue;
    const door = site.door && nearestOnSegment(site.door, a, d).d < 0.8 ? 1.5 : 1;
    const score = (Math.min(len, 16) * facing * door) / (1 + nearestOnSegment(site.spot, a, d).d / 15);
    if (score > bestScore) {
      bestScore = score;
      best = { i, s0: 0, s1: len, at: nearestOnSegment(site.spot, a, d).t * len };
    }
  }
  // A front that lies on no wall of this footprint (the data moved on): the best seen wall instead.
  return best ?? (front ? frontEdgeOf(site, ring, null) : null);
}

/** The front the own building takes: its own where that has what the kind needs, else the nearest that does. */
export function ownFacade(d: Dress, kind: FacadeKind, gable: boolean): FacadeKind {
  if (d.ground === 'gates') return 'hall';
  if (d.plain) return kind === 'brick' || kind === 'hall' ? kind : 'plaster';
  if (d.ground !== 'glass') return kind;
  if (kind === 'modern' || kind === 'hall') return kind;
  if (d.flat && !gable) return 'modern';
  // Boarded houses have no shop fronts painted.
  return kind === 'wood' ? 'plaster' : kind;
}

// ---------------------------------------------------------------------------- the sheet

const SHEET_W = 1024;
const SHEET_H = 256;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The small paintings under the board, each with room around it (the sheet is drawn from far away too). */
const PARTS = {
  word: { x: 0, y: 158, w: 288, h: 96 },
  atm: { x: 296, y: 158, w: 64, h: 96 },
  awning: { x: 368, y: 158, w: 64, h: 96 },
  flag: { x: 440, y: 158, w: 96, h: 60 },
  flag2: { x: 544, y: 158, w: 96, h: 60 },
  clock: { x: 648, y: 158, w: 96, h: 96 },
  door: { x: 752, y: 158, w: 64, h: 96 },
  window: { x: 824, y: 158, w: 40, h: 96 },
  bg: { x: 872, y: 158, w: 40, h: 40 },
  fg: { x: 920, y: 158, w: 40, h: 40 },
  dark: { x: 968, y: 158, w: 40, h: 40 },
  net: { x: 872, y: 206, w: 40, h: 40 },
  white: { x: 920, y: 206, w: 40, h: 40 },
} as const satisfies Record<string, Rect>;

type Part = keyof typeof PARTS;

const uvRect = (r: Rect, inset = 0.75): UV4 => {
  const u0 = (r.x + inset) / SHEET_W;
  const u1 = (r.x + r.w - inset) / SHEET_W;
  const v0 = 1 - (r.y + r.h - inset) / SHEET_H;
  const v1 = 1 - (r.y + inset) / SHEET_H;
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
};

/** A place's own paintings on the graphics card, and where each lies on the sheet. */
export interface PlaceSheet {
  map: Texture;
  lit: Texture;
  /** The board: its painting, how wide it is for its height, and how many lines it has. */
  board: UV4;
  aspect: number;
  lines: number;
  part: Record<Part, UV4>;
}

const FONT = 'Arial, Helvetica, sans-serif';

/** Paint the board: its ground, an emblem, the lines of text as large as fit. Returns the piece of the sheet it took. */
function paintBoard(g: CanvasRenderingContext2D, lines: readonly string[], d: Dress): Rect {
  const two = lines.length > 1;
  let px = two ? 58 : 98;
  const widest = () => {
    g.font = `700 ${px}px ${FONT}`;
    return Math.max(...lines.map((l) => g.measureText(l).width));
  };
  const high = () => Math.ceil(two ? px * 2.5 : px * 1.5);
  const emblem = () => (d.emblem ? high() : 0);
  let tw = widest();
  const room = SHEET_W - 2 - px * 0.9 - emblem();
  if (tw > room) {
    px = Math.floor((px * room) / tw);
    tw = widest();
  }
  const h = high();
  const ew = emblem();
  const w = Math.min(SHEET_W, Math.ceil(tw + px * 0.9 + ew));
  g.fillStyle = d.bg;
  g.fillRect(0, 0, w, h);
  // The board's frame: a darker edge, so that it reads as a thing standing out from the wall.
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = d.fg;
  if (d.emblem === 'cross') {
    const c = ew / 2 + px * 0.15;
    const arm = h * 0.3;
    g.fillRect(c - arm, h / 2 - arm / 3, arm * 2, (arm * 2) / 3);
    g.fillRect(c - arm / 3, h / 2 - arm, (arm * 2) / 3, arm * 2);
  } else if (d.emblem === 'p') {
    const s = h * 0.68;
    g.lineWidth = Math.max(3, h * 0.05);
    g.strokeStyle = d.fg;
    g.strokeRect(px * 0.3, (h - s) / 2, s, s);
    g.font = `700 ${Math.round(s * 0.8)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('P', px * 0.3 + s / 2, h / 2 + s * 0.29);
  }
  g.font = `700 ${px}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  // Capitals are 0.72 of the size high: each line's capitals are centred on its share of the board.
  lines.forEach((l, i) => g.fillText(l, ew + (w - ew) / 2, (h * (i + 0.5)) / lines.length + px * 0.36 + (two ? (i ? -px * 0.06 : px * 0.06) : 0)));
  return { x: 0, y: 0, w, h };
}

/** Paint the small parts: the word sign, the cash machine, the awning's cloth, the flags, a clock, a church's door and window, plain colours. */
function paintParts(g: CanvasRenderingContext2D, d: Dress) {
  const fill = (r: Rect, style: string, x = 0, y = 0, w = r.w, h = r.h) => {
    g.fillStyle = style;
    g.fillRect(r.x + x, r.y + y, w, h);
  };
  // The word of the kind, for the sign that stands out from the wall.
  let r: Rect = PARTS.word;
  fill(r, d.bg);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 4;
  g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  let px = 62;
  g.font = `700 ${px}px ${FONT}`;
  const tw = g.measureText(d.word).width;
  if (tw > r.w - 28) px = Math.floor((px * (r.w - 28)) / tw);
  g.font = `700 ${px}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = d.fg;
  g.fillText(d.word, r.x + r.w / 2, r.y + r.h / 2 + px * 0.36);
  // A cash machine: a lit header, a screen, the keys, the slots.
  r = PARTS.atm;
  fill(r, '#c4c7cb');
  fill(r, d.bg, 0, 0, r.w, 20);
  g.font = `700 14px ${FONT}`;
  g.fillStyle = d.fg;
  g.fillText('ATM', r.x + r.w / 2, r.y + 15);
  fill(r, '#22262b', 6, 26, 52, 30);
  fill(r, '#3d7fc4', 9, 29, 46, 24);
  fill(r, '#cfe2f4', 13, 34, 26, 3);
  fill(r, '#cfe2f4', 13, 41, 34, 3);
  for (let k = 0; k < 9; k++) fill(r, '#3a3e44', 10 + (k % 3) * 9, 62 + Math.floor(k / 3) * 7, 7, 5);
  fill(r, '#1c1e21', 42, 62, 16, 4);
  fill(r, '#5fd07a', 42, 70, 6, 3);
  fill(r, '#1c1e21', 8, 86, 48, 5);
  // An awning's cloth: stripes of the board's two colours.
  r = PARTS.awning;
  for (let k = 0; k < 8; k++) fill(r, k % 2 ? d.fg : d.bg, k * 8, 0, 8, r.h);
  fill(r, 'rgba(0,0,0,0.18)', 0, r.h - 10, r.w, 10);
  // The Estonian flag, and a foreign one of two bands.
  r = PARTS.flag;
  fill(r, '#0072ce', 0, 0, r.w, 20);
  fill(r, '#0c0c0e', 0, 20, r.w, 20);
  fill(r, '#f4f4f0', 0, 40, r.w, 20);
  r = PARTS.flag2;
  fill(r, '#f4f4f0', 0, 0, r.w, 30);
  fill(r, '#c8201e', 0, 30, r.w, 30);
  // A clock on its plate, at ten past ten.
  r = PARTS.clock;
  fill(r, d.bg);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  g.fillStyle = '#f4f2ea';
  g.beginPath();
  g.arc(cx, cy, 42, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1c1c1e';
  g.lineWidth = 4;
  g.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.fillStyle = '#1c1c1e';
    g.fillRect(cx + Math.cos(a) * 35 - 2, cy + Math.sin(a) * 35 - 2, 4, 4);
  }
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx - 17, cy - 12);
  g.moveTo(cx, cy);
  g.lineTo(cx + 26, cy - 16);
  g.stroke();
  // A church's door: two leaves of dark planks under a pointed arch, in a stone surround (the wall's own colour).
  r = PARTS.door;
  fill(r, '#ffffff');
  const arch = (x0: number, x1: number, spring: number, top: number, bottom: number) => {
    g.beginPath();
    g.moveTo(x0, bottom);
    g.lineTo(x0, spring);
    g.quadraticCurveTo(x0, top + (spring - top) * 0.25, (x0 + x1) / 2, top);
    g.quadraticCurveTo(x1, top + (spring - top) * 0.25, x1, spring);
    g.lineTo(x1, bottom);
    g.closePath();
  };
  g.fillStyle = '#b8b4a8';
  arch(r.x + 4, r.x + r.w - 4, r.y + 40, r.y + 2, r.y + r.h);
  g.fill();
  g.fillStyle = '#3e2c1e';
  arch(r.x + 10, r.x + r.w - 10, r.y + 42, r.y + 10, r.y + r.h);
  g.fill();
  for (let x = 14; x < r.w - 10; x += 6) fill(r, 'rgba(0,0,0,0.28)', x, 30, 1, r.h - 30);
  fill(r, '#18120c', r.w / 2 - 1, 12, 2, r.h - 12);
  for (const y of [52, 80]) fill(r, '#15130f', 11, y, r.w - 22, 3);
  // A church's window: tall, pointed, leaded.
  r = PARTS.window;
  fill(r, '#ffffff');
  g.fillStyle = '#a8a498';
  arch(r.x + 3, r.x + r.w - 3, r.y + 26, r.y + 2, r.y + r.h - 3);
  g.fill();
  g.fillStyle = '#1e2832';
  arch(r.x + 7, r.x + r.w - 7, r.y + 28, r.y + 8, r.y + r.h - 7);
  g.fill();
  fill(r, '#6a7884', r.w / 2 - 1, 10, 2, r.h - 17);
  for (let y = 30; y < r.h - 10; y += 14) fill(r, '#6a7884', 7, y, r.w - 14, 1);
  // Plain colours: the board's own two, a dark one, a building site's green netting, white.
  fill(PARTS.bg, d.bg);
  fill(PARTS.fg, d.fg);
  fill(PARTS.dark, '#2c2f33');
  r = PARTS.net;
  fill(r, '#3f7a52');
  for (let k = 0; k < r.w; k += 4) fill(r, 'rgba(0,0,0,0.12)', k, 0, 1, r.h);
  fill(PARTS.white, '#ffffff');
}

/**
 * The sheet of a place: its board with `lines` on it and the small parts in its colours, and the night twin with
 * what is lit. Two small canvases and their textures, made once when the street is built; the caller disposes of
 * `map` and `lit` with the street.
 */
export function makePlaceSheet(d: Dress, lines: readonly string[]): PlaceSheet {
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_W;
  canvas.height = SHEET_H;
  const g = canvas.getContext('2d')!;
  // Between the paintings: the board's ground, so that what a far-away board blurs with is its own colour.
  g.fillStyle = d.bg;
  g.fillRect(0, 0, SHEET_W, SHEET_H);
  const board = paintBoard(g, lines, d);
  paintParts(g, d);
  const night = document.createElement('canvas');
  night.width = SHEET_W / 2;
  night.height = SHEET_H / 2;
  const l = night.getContext('2d')!;
  l.fillStyle = '#000000';
  l.fillRect(0, 0, night.width, night.height);
  const light = (r: Rect, x = 0, y = 0, w = r.w, h = r.h) => l.drawImage(canvas, r.x + x, r.y + y, w, h, (r.x + x) / 2, (r.y + y) / 2, w / 2, h / 2);
  if (d.lit) {
    light(board);
    light(PARTS.word);
    light(PARTS.clock);
  }
  light(PARTS.atm, 0, 0, PARTS.atm.w, 20);
  light(PARTS.atm, 6, 26, 52, 30);
  const tex = (c: HTMLCanvasElement) => {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    return t;
  };
  const part = {} as Record<Part, UV4>;
  for (const k of Object.keys(PARTS) as Part[]) part[k] = uvRect(PARTS[k], PARTS[k].w <= 40 ? 6 : 0.75);
  const map = tex(canvas);
  // A board is read from the side as often as from the front.
  map.anisotropy = 4;
  return { map, lit: tex(night), board: uvRect(board), aspect: board.w / board.h, lines: lines.length, part };
}

// ---------------------------------------------------------------------------- the front

/** What dressWall draws with: the street's own builders and the place's sheet. */
export interface DressCtx {
  site: Site;
  dress: Dress;
  sheet: PlaceSheet;
  /** The index of the own building in the street's buildings. */
  own: number;
  /** Everything painted on the place's sheet. */
  signs: MeshBuilder;
  /** The house fronts' sheet (posters). */
  walls: MeshBuilder;
  solids: MeshBuilder;
  /** Lamps: grey by day, bright when the street's lamps are on. */
  heads: MeshBuilder;
  /** Light spilt on the ground in front of a lit opening, from a to b along a wall, `deep` metres out. */
  spill: (a: V2, b: V2, n: V2, deep: number, h: number, c: Color) => void;
}

/** One wall of the own building, as the renderer laid it. */
export interface OwnWall {
  /** Its ends in the footprint's order (anticlockwise), the unit vector along it, the one out of it, its length. */
  a: V2;
  t: V2;
  n: V2;
  len: number;
  /** The stretch that faces the scene, metres along the wall. */
  s0: number;
  s1: number;
  /** The middle of the bay with the entrance, and the point nearest to where it happens, metres along the wall (the front only). */
  door: number;
  at: number;
  /** Does it look onto a street? */
  street: boolean;
  /** Heights: where the wall starts, the top of the ground floor, the eaves, the top of the parapet. */
  base: number;
  g1: number;
  eaves: number;
  top: number;
  /** Floors above the ground floor. */
  uppers: number;
  wall: Color;
  kind: FacadeKind;
  /** The footprint's rectangle, and how far the ridge of a pitched roof rises over the eaves (0: a flat roof). */
  bb: Box;
  rise: number;
  /** The painting of a plain piece of this building's wall on the house fronts' sheet. */
  plain: UV4;
}

/**
 * Does the straight line from `a` to `b` cross a footprint further than `skip` metres from `a`? A wall the line
 * only grazes (under about 12 degrees) does not count: a camera on a wall looks along that wall.
 */
function crossesBeyond(a: V2, b: V2, ring: readonly V2[], skip: number): boolean {
  const d = sub(b, a);
  const long = Math.hypot(d[0], d[1]);
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const e = sub(ring[(i + 1) % ring.length], p);
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 0.2 * long * Math.hypot(e[0], e[1])) continue;
    const ap = sub(p, a);
    const t = (ap[0] * e[1] - ap[1] * e[0]) / den;
    const u = (ap[0] * d[1] - ap[1] * d[0]) / den;
    if (u >= 0 && u <= 1 && t < 1 && t * long > skip) return true;
  }
  return false;
}

/** A point of the ground plan as a three.js direction. */
const dir3 = (v: V2, up = 0): P3 => [v[0], up, -v[1]];

/** Dress the place's own building, wall by wall as the renderer laid them (`main`: the front). */
export function dressOwn(c: DressCtx, walls: readonly { w: OwnWall; main: boolean }[]): void {
  const sides = walls.filter((x) => !x.main).map((x) => x.w);
  for (const x of walls) dressWall(c, x.w, x.main, sides);
}

/**
 * Dress one wall of the place's own building: on every wall what runs round the house (a shop's band, a church's
 * windows), on the front (`front`) the board where the camera sees it and what the kind hangs beside it. `sides`
 * are the building's other walls: the board goes on one of them when the front has no place the camera sees.
 */
function dressWall(c: DressCtx, w: OwnWall, front: boolean, sides: readonly OwnWall[]): void {
  const { dress: d, sheet, signs, solids, heads } = c;
  const white = shade(0xffffff);
  const dark = shade(0x34373b);
  const P = (s: number, off: number): V2 => along(along(w.a, w.t, s), w.n, off);
  const out3 = dir3(w.n);
  const yaw = Math.atan2(w.t[1], w.t[0]);
  /** A painting of the sheet flat on the wall: from s0 to s1 along it and h0 to h1 up, `off` metres out of it. */
  const face = (s0: number, s1: number, h0: number, h1: number, off: number, uv: UV4, col: Color = white) =>
    signs.quad(at(P(s0, off), h0), at(P(s1, off), h0), at(P(s1, off), h1), at(P(s0, off), h1), col, out3, uv);
  const has = (e: Extra) => d.extras.includes(e);
  // The band of a shop's colour over its glass, on every wall that has glass.
  if (d.band && (front || w.street) && w.g1 - w.base > 2.6) face(0, w.len, w.g1 - 0.5, w.g1 - 0.05, 0.08, sheet.part.bg);
  if (has('tower') && w.len > 5 && w.eaves - w.base > 5.2) {
    // Tall windows between the buttresses of the wall, not where the door is.
    const n = Math.max(1, Math.round(w.len / 4.2));
    const h1 = Math.min(w.eaves - 0.8, w.base + 5.6);
    for (let k = 0; k < n; k++) {
      const s = ((k + 0.5) / n) * w.len;
      if (front && Math.abs(s - w.door) < 2.4) continue;
      face(s - 0.55, s + 0.55, w.base + 1.7, h1, 0.04, sheet.part.window, w.wall);
    }
  }
  if (!front) return;

  const cam = c.site.camera;
  const ground = w.base > 0.2 ? w.base : 0.16;
  const sDoor = clamp(w.door, Math.min(1.2, w.len / 2), Math.max(w.len - 1.2, w.len / 2));
  /** The side of the door the camera is on: what is read from the side hangs there. */
  const camSide = dot(sub(cam.pos, P(sDoor, 0)), w.t) >= 0 ? 1 : -1;
  /** The lowest the board may start: over what hangs above the door. */
  let floor = -Infinity;
  /** Half the width of what hangs over the door. */
  let over = 1.1;
  /** The entrance canopy, when the kind has one: its middle along the wall, its width, its depth, its underside. */
  let canopy: { s: number; wide: number; deep: number; h: number } | null = null;
  /** What hangs over the door and hides the wall under it from a camera above: the canopy, or the awning. */
  let cover: { s: number; wide: number; deep: number; h: number } | null = null;

  if (has('canopy')) {
    // A slab hung from the wall on two rods, its edge in the board's letter colour, lamps under it.
    const wide = clamp(w.len * 0.5, Math.min(3.2, w.len), d.ground === 'glass' ? 9 : 6.5);
    const deep = 2.2;
    const h = w.base + clamp(w.g1 - w.base - 0.35, 2.7, 3.3);
    const s = clamp(sDoor, wide / 2, Math.max(wide / 2, w.len - wide / 2));
    solids.box(P(s, deep / 2 + 0.02), yaw, wide, deep, h, h + 0.3, dark);
    face(s - wide / 2, s + wide / 2, h + 0.02, h + 0.28, deep + 0.03, sheet.part.fg);
    for (const e of [-1, 1]) {
      const q = s + e * (wide / 2 - 0.35);
      solids.tube(at(P(q, 0.04), h + 1.7), at(P(q, deep - 0.3), h + 0.3), 0.03, 0.03, dark, 4);
      heads.box(P(s + (e * wide) / 4, deep * 0.55), yaw, 0.6, 0.6, h - 0.03, h, white);
    }
    c.spill(P(s - wide / 2, 0), P(s + wide / 2, 0), w.n, deep + 2.2, ground, shade(0xd8c8a0, 0.5));
    floor = h + 0.55;
    over = wide / 2;
    canopy = { s, wide, deep, h };
    cover = canopy;
  }
  if (has('awning')) {
    // Cloth on a frame, sloping out from the wall over the door and the window beside it, with its hanging edge.
    const wide = clamp(w.len * 0.45, Math.min(2.6, w.len), 5);
    const deep = 1.1;
    // Its hanging edge ends 2.6 m up: nobody and nothing on the pavement reaches it.
    const lo = Math.max(w.base + 2.8, w.g1 - 0.5);
    const hi = lo + 0.5;
    const s = clamp(sDoor, wide / 2, Math.max(wide / 2, w.len - wide / 2));
    signs.quad(at(P(s - wide / 2, 0.04), hi), at(P(s + wide / 2, 0.04), hi), at(P(s + wide / 2, deep), lo), at(P(s - wide / 2, deep), lo), white, dir3(w.n, 2), sheet.part.awning);
    face(s - wide / 2, s + wide / 2, lo - 0.2, lo, deep, sheet.part.awning);
    const cloth = shade(hexOf(d.bg));
    for (const e of [-1, 1]) {
      const q = s + (e * wide) / 2;
      solids.tri(at(P(q, 0.04), hi), at(P(q, deep), lo), at(P(q, 0.04), lo), cloth);
      solids.tri(at(P(q, 0.04), hi), at(P(q, 0.04), lo), at(P(q, deep), lo), cloth);
    }
    floor = hi + 0.12;
    over = wide / 2;
    cover = { s, wide, deep, h: lo };
  }

  // ── The board ──
  let H = 0;
  let W = 0;
  /** The board's size at a share `k` of its full one, no wider than `room`. */
  const size = (k: number, room: number) => {
    H = d.size * (sheet.lines > 1 ? 1.55 : 1) * k;
    W = H * sheet.aspect;
    if (W > room) {
      W = room;
      H = W / sheet.aspect;
    }
  };
  const ownRing = c.site.street.buildings[c.own].ring;
  /** How squarely the camera sees a wall at a point of it: 1 straight on, 0 along the wall. */
  const facing = (v: OwnWall, s: number) => dot(v.n, norm(sub(cam.pos, along(v.a, v.t, s))));
  /** Seen less squarely than this (about 17 degrees off the wall's own line), a board on the wall is not read. */
  const FACING = 0.3;
  const roofs = c.site.street.buildings.filter((b) => b.open && b.area >= 30 && b.ring.length > 2);
  // The houses that can stand between the camera and this front: those near the line from the one to the other.
  const blockers = c.site.street.buildings.filter((b, i) => {
    if (i === c.own || b.open || b.base >= 2.5 || b.ring.length < 3) return false;
    const m = ringCentroid(b.ring);
    return nearestOnSegment(m, cam.pos, P(sDoor, 0)).d < 30 + Math.sqrt(b.area);
  });
  /** How much of a board on wall `v`, centred at `s` along it, its foot at `h`, `off` metres out of it, the camera sees (0..5). */
  const seen = (v: OwnWall, s: number, h: number, off: number) => {
    let k = 0;
    // A board the camera looks along is not read.
    if (facing(v, s) < FACING) return 0;
    for (const f of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const p = along(along(v.a, v.t, s + f * W), v.n, off);
      const lo = projectPoint(cam, p, h);
      const hi = projectPoint(cam, p, h + H);
      // Inside the picture, and clear of the text the recorder burns into its top corners.
      if (!(lo.z > 1 && hi.z > 1 && Math.abs(lo.x) < 0.93 && Math.abs(hi.x) < 0.93 && lo.y > -0.9 && hi.y < (Math.abs(hi.x) < 0.42 ? 0.92 : 0.8))) continue;
      // Not behind another house, nor behind another wing of its own (a camera on its own wall looks past that
      // wall's first metres), nor under the canopy or the awning as the camera looks down on them.
      const to = along(p, v.n, 0.4);
      if (blockers.some((b) => segmentHitsRing(cam.pos, to, b.ring)) || crossesBeyond(cam.pos, to, ownRing, 3)) continue;
      const mid = h + H / 2;
      /** The point of the line of sight to the board's middle that is `z` metres above the ground. */
      const sightAt = (z: number): V2 => {
        const f1 = (cam.height - z) / (cam.height - mid);
        return [cam.pos[0] + (p[0] - cam.pos[0]) * f1, cam.pos[1] + (p[1] - cam.pos[1]) * f1];
      };
      // Nor behind a roof on posts (a petrol station's canopy stands before its kiosk).
      if (roofs.some((b) => [b.height, b.height - 0.85].some((z) => (z - mid) * (z - cam.height) < 0 && pointInRing(sightAt(z), b.ring)))) continue;
      if (cover && cam.height > cover.h && mid < cover.h) {
        const x = sub(sightAt(cover.h), w.a);
        if (Math.abs(dot(x, w.t) - cover.s) < cover.wide / 2 && dot(x, w.n) > -0.2 && dot(x, w.n) < cover.deep) continue;
      }
      k++;
    }
    return k;
  };
  const roomOf = (v: OwnWall) => Math.max(1.4, v.len - 0.5);
  /** Where the board is: the wall, its middle along it, its foot, how far it stands out. */
  let board: { v: OwnWall; s: number; h: number; off: number };
  if (d.form === 'beside') {
    // A plate on the wall beside the door, at eye level.
    size(1, roomOf(w));
    const off = (has('tower') ? 1.5 : 1.0) + W / 2;
    let s = sDoor + camSide * off;
    if (s - W / 2 < 0.2 || s + W / 2 > w.len - 0.2) s = sDoor - camSide * off;
    board = { v: w, s: clamp(s, W / 2 + 0.1, Math.max(W / 2 + 0.1, w.len - W / 2 - 0.1)), h: w.base + 1.5, off: 0.145 };
  } else {
    // On the front over the ground floor (on a building of one floor: on the edge of its roof), at the entrance.
    // When the camera's picture does not hold all of it there: lower on the wall, on the front edge of the canopy,
    // at eye level beside the entrance, on a wall round the corner, and then all of that smaller. The first place
    // that is seen whole is taken; if none is, the place along the front seen most.
    const heights = (v: OwnWall, fl: number) =>
      v.uppers === 0 ? [Math.max(v.top - 0.3, fl), Math.max(v.top - H - 0.08, fl)] : [Math.max(v.g1 - H * 0.3, fl), Math.max(v.g1 - H - 0.05, fl)];
    /** Places for the board's middle along a wall: at `want`, then step by step further from it, from `skip` to `reach` metres. */
    const tries = (v: OwnWall, want: number, reach: number, skip = 0) => {
      const lo = W / 2 + 0.2;
      const hi = Math.max(lo, v.len - W / 2 - 0.2);
      const out = skip ? [] : [clamp(want, lo, hi)];
      for (let e = Math.max(0.5, skip); e <= reach; e += 0.5) for (const sg of [camSide, -camSide]) if (want + sg * e >= lo && want + sg * e <= hi) out.push(want + sg * e);
      return out;
    };
    const doorAt = P(sDoor, 0);
    // The walls round the corner that look towards the camera, the nearest to the entrance first.
    const near = sides
      .filter((v) => v.len >= 3 && dot(v.n, sub(cam.pos, v.a)) > 0)
      .map((v) => ({ v, hit: nearestOnSegment(doorAt, v.a, along(v.a, v.t, v.len)) }))
      .filter((x) => x.hit.d < 18)
      .sort((x, y) => x.hit.d - y.hit.d)
      .slice(0, 4);
    // A long front whose entrance is far from where it happens carries the board where the camera looks.
    const want = Math.abs(w.at - sDoor) > 6 ? w.at : sDoor;
    const eye = (k: number) => Math.min(k, 1.45 / (d.size * (sheet.lines > 1 ? 1.55 : 1)));
    let found: typeof board | null = null;
    /** The place seen most of those tried and not seen whole, with the board's size there. */
    let part: { at: typeof board; n: number; W: number; H: number } | null = null;
    /** Is a board here seen whole? Remembers the best of the others. */
    const whole = (v: OwnWall, s: number, h: number, off: number) => {
      const n = seen(v, s, h, off);
      if (n < 5 && n > (part?.n ?? 0)) part = { at: { v, s, h, off }, n, W, H };
      return n === 5;
    };
    for (const k of [1, 0.78, 0.6]) {
      size(k, roomOf(w));
      for (const h of heights(w, floor)) {
        const q = tries(w, want, Math.max(3, W)).find((x) => whole(w, x, h, 0.145));
        if (q !== undefined) found = { v: w, s: q, h, off: 0.145 };
        if (found) break;
      }
      if (found) break;
      if (canopy) {
        size(k, canopy.wide - 0.3);
        if (whole(w, canopy.s, canopy.h + 0.3, canopy.deep)) found = { v: w, s: canopy.s, h: canopy.h + 0.3, off: canopy.deep };
        if (found) break;
      }
      // On the wall beside the entrance, clear of the door and of what hangs over it (the camera looks down on that).
      size(eye(k), Math.min(roomOf(w), 3.6));
      const q = tries(w, sDoor, W + 6, Math.max(1.4, over + 0.3) + W / 2).find((x) => whole(w, x, w.base + 2.5 - H, 0.145));
      if (q !== undefined) found = { v: w, s: q, h: w.base + 2.5 - H, off: 0.145 };
      for (const { v, hit } of found ? [] : near) {
        size(k, roomOf(v));
        for (const h of heights(v, -Infinity)) {
          const q1 = tries(v, hit.t * v.len, Math.max(3, W)).find((x) => whole(v, x, h, 0.145));
          if (q1 !== undefined) found = { v, s: q1, h, off: 0.145 };
          if (found) break;
        }
        if (found) break;
        size(eye(k), Math.min(roomOf(v), 3.6));
        const q2 = tries(v, hit.t * v.len, W + 4).find((x) => whole(v, x, v.base + 2.5 - H, 0.145));
        if (q2 !== undefined) found = { v, s: q2, h: v.base + 2.5 - H, off: 0.145 };
        if (found) break;
      }
      if (found) break;
    }
    if (!found) {
      const best = part as { at: typeof board; n: number; W: number; H: number } | null;
      if (best) {
        [W, H] = [best.W, best.H];
        found = best.at;
      } else {
        size(1, roomOf(w));
        found = { v: w, s: clamp(want, W / 2 + 0.2, Math.max(W / 2 + 0.2, w.len - W / 2 - 0.2)), h: heights(w, floor)[0], off: 0.145 };
      }
    }
    board = found;
  }
  {
    // A box that stands out from the wall (or stands on the canopy's edge), its face the painting.
    const { v, s, h, off } = board;
    const p0 = along(along(v.a, v.t, s - W / 2), v.n, off);
    const p1 = along(along(v.a, v.t, s + W / 2), v.n, off);
    solids.box(along(along(v.a, v.t, s), v.n, off - 0.07), Math.atan2(v.t[1], v.t[0]), W, 0.13, h, h + H, dark);
    signs.quad(at(p0, h), at(p1, h), at(p1, h + H), at(p0, h + H), white, dir3(v.n), sheet.board);
    if (d.lit) c.spill(p0, p1, v.n, 3.6, v.base > 0.2 ? v.base : 0.16, shade(hexOf(d.fg)).lerp(shade(hexOf(d.bg)), 0.4).multiplyScalar(0.55));
  }
  // What hangs beside the board on the front keeps clear of it; with the board elsewhere, of what is over the door.
  const onFront = board.v === w && board.off < 1;
  const sc = onFront ? board.s : sDoor;
  const h0 = onFront ? board.h : w.g1 - 0.4;
  if (!onFront) {
    W = over * 2;
    H = 1;
  }

  // A sign standing out from the wall, read from along the street: the word of the kind where the kind has one, and
  // the board itself once more where the camera looks along the wall its board is on.
  const along2 = d.form === 'over' && facing(board.v, board.s) < FACING;
  if (along2 || (has('blade') && w.len > 4)) {
    const wide = along2 ? Math.min(1.8, 0.8 * sheet.aspect) : 1.35;
    const high = along2 ? wide / sheet.aspect : 0.45;
    const uv = along2 ? sheet.board : sheet.part.word;
    const s = clamp(sDoor + camSide * (over + 0.7), 0.5, w.len - 0.5);
    const hb = Math.max(w.base + 2.75, Math.min(floor, w.g1 - 0.1 - high));
    const [i0, i1] = [0.22, 0.22 + wide];
    solids.tube(at(P(s, 0.03), hb + high + 0.07), at(P(s, i1), hb + high + 0.07), 0.022, 0.022, dark, 4);
    const tt = dir3(w.t);
    signs.quad(at(P(s + 0.03, i1), hb), at(P(s + 0.03, i0), hb), at(P(s + 0.03, i0), hb + high), at(P(s + 0.03, i1), hb + high), white, tt, uv);
    signs.quad(at(P(s - 0.03, i0), hb), at(P(s - 0.03, i1), hb), at(P(s - 0.03, i1), hb + high), at(P(s - 0.03, i0), hb + high), white, [-tt[0], 0, -tt[2]], uv);
  }
  if (has('atm')) {
    // A cash machine set in the wall, on the far side of the door from the sign.
    let s = sDoor - camSide * 2.0;
    if (s < 0.7 || s > w.len - 0.7) s = sDoor + camSide * 2.0;
    if (s >= 0.7 && s <= w.len - 0.7) {
      solids.box(P(s, 0.03), yaw, 1.0, 0.06, w.base + 0.72, w.base + 2.2, shade(0x8a8d92));
      face(s - 0.45, s + 0.45, w.base + 0.8, w.base + 2.15, 0.07, sheet.part.atm);
      c.spill(P(s - 0.5, 0), P(s + 0.5, 0), w.n, 1.6, ground, shade(0x6088b0, 0.5));
    }
  }
  if (has('strip')) {
    // Lit strips up both sides of the door and across its head.
    for (const e of [-1, 1]) heads.box(P(sDoor + e * 1.05, 0.05), yaw, 0.1, 0.06, w.base + 0.3, w.base + 2.65, white);
    heads.box(P(sDoor, 0.05), yaw, 2.2, 0.06, w.base + 2.6, w.base + 2.7, white);
    c.spill(P(sDoor - 1.2, 0), P(sDoor + 1.2, 0), w.n, 2.6, ground, shade(hexOf(d.fg), 0.4));
  }
  if (has('posters')) {
    // Poster cases on the wall beside the door, lit from inside.
    for (const e of [-1, 1]) {
      const s = sDoor + e * 2.3;
      if (s < 0.8 || s > w.len - 0.8) continue;
      solids.box(P(s, 0.03), yaw, 1.3, 0.06, w.base + 0.55, w.base + 2.45, dark);
      c.walls.quad(at(P(s - 0.58, 0.07), w.base + 0.62), at(P(s + 0.58, 0.07), w.base + 0.62), at(P(s + 0.58, 0.07), w.base + 2.38), at(P(s - 0.58, 0.07), w.base + 2.38), white, out3, uvOf('poster2'));
    }
  }
  if (has('clock') && onFront) {
    // Beside the board, at its height.
    const size = Math.min(1.3, Math.max(0.9, H));
    let s = sc + W / 2 + 0.3 + size / 2;
    if (s + size / 2 > w.len - 0.1) s = sc - W / 2 - 0.3 - size / 2;
    if (s - size / 2 >= 0.1 && s + size / 2 <= w.len - 0.1) {
      solids.box(P(s, 0.06), yaw, size, 0.1, h0 + H / 2 - size / 2, h0 + H / 2 + size / 2, dark);
      face(s - size / 2, s + size / 2, h0 + H / 2 - size / 2, h0 + H / 2 + size / 2, 0.115, sheet.part.clock);
    }
  }
  const flags: UV4[] = has('flags') ? [sheet.part.flag, sheet.part.flag2, sheet.part.flag] : has('flag') ? [sheet.part.flag] : has('flag2') ? [sheet.part.flag2] : [];
  flags.forEach((uv, k) => {
    // A pole on brackets up the wall, clear of the board, the flag flying along the wall.
    const side = k === 1 ? 1 : -1;
    const s = d.form === 'beside' ? sDoor - camSide * (1.4 + k) : sc + side * (W / 2 + 0.7 + (k === 2 ? 1.5 : 0));
    if (s < 0.3 || s > w.len - 0.3) return;
    const foot = Math.max(w.base + 2.9, d.form === 'beside' ? 0 : h0);
    const tip = foot + 3.4;
    const p = P(s, 0.45);
    solids.tube(at(p, foot), at(p, tip), 0.035, 0.025, shade(0xd8d8d4), 5, true);
    for (const h of [foot + 0.15, foot + 1.3]) solids.tube(at(P(s, 0.02), h), at(p, h), 0.02, 0.02, dark, 4);
    const fly = d.form === 'beside' ? -camSide : side;
    const q = P(s + fly * 1.65, 0.45);
    signs.card(at(p, tip - 1.1), at(q, tip - 1.18), at(q, tip - 0.13), at(p, tip - 0.05), out3, white, fly > 0 ? uv : [uv[1], uv[0], uv[3], uv[2]]);
  });
  if (has('scaffold')) {
    // Tube scaffolding hard against the wall: standards in pairs, decks of planks, guard rails, netting over most of it.
    const steel = shade(0x9a9c9e);
    const plank = shade(0xb09060);
    const topH = Math.max(w.base + 3.2, w.top - 0.4);
    const n = Math.max(1, Math.round(w.len / 2.5));
    for (let k = 0; k <= n; k++) {
      const s = clamp((k / n) * w.len, 0.1, w.len - 0.1);
      for (const off of [0.1, 0.56]) solids.tube(at(P(s, off), w.base), at(P(s, off), topH + 1), 0.028, 0.028, steel, 4);
    }
    for (let h = w.base + 2.7; h < topH + 0.2; h += 2.1) {
      solids.box(P(w.len / 2, 0.33), yaw, w.len - 0.2, 0.5, h, h + 0.05, plank);
      solids.tube(at(P(0.1, 0.56), h + 1.0), at(P(w.len - 0.1, 0.56), h + 1.0), 0.022, 0.022, steel, 4);
    }
    // The netting leaves the board's bays open.
    const from = sc + W / 2 + 0.6 < w.len - 2 ? sc + W / 2 + 0.6 : 0;
    const to = from > 0 ? w.len : Math.max(0, sc - W / 2 - 0.6);
    if (to - from > 2) signs.card(at(P(from, 0.6), w.base + 2.75), at(P(to, 0.6), w.base + 2.75), at(P(to, 0.6), topH + 1), at(P(from, 0.6), topH + 1), out3, white, sheet.part.net);
  }
  if (has('tower')) {
    // The tall door in its pointed arch.
    const dh = Math.min(3.6, w.eaves - w.base - 0.6);
    face(sDoor - 1.2, sDoor + 1.2, w.base, w.base + dh, 0.05, sheet.part.door, w.wall);
    tower(c, w, sDoor);
  }
}

/**
 * A church's tower over its front: square, standing on the roof behind the front wall (over the gable when the
 * front is one), with sound openings, a four-sided spire and a cross.
 */
function tower(c: DressCtx, w: OwnWall, sDoor: number) {
  const { solids, walls } = c;
  const side = clamp(Math.min(w.len, w.bb.short) * 0.42, 2.6, 4.4);
  const half = side / 2;
  const centre = along(along(w.a, w.t, clamp(sDoor, half + 0.1, Math.max(half + 0.1, w.len - half - 0.1))), w.n, -(half + 0.15));
  const h0 = w.eaves - 0.4;
  const h1 = w.eaves + Math.max(w.rise, 1.5) + side * 1.25;
  const plain = w.plain;
  const stone = w.wall;
  const u = w.t;
  const v = w.n;
  const corner = (su: number, sv: number): V2 => along(along(centre, u, su * half), v, sv * half);
  const faces: [V2, V2, V2][] = [
    [corner(-1, 1), corner(1, 1), v],
    [corner(1, 1), corner(1, -1), u],
    [corner(1, -1), corner(-1, -1), [-v[0], -v[1]]],
    [corner(-1, -1), corner(-1, 1), [-u[0], -u[1]]],
  ];
  const shadeC = shade(0x1c1e22);
  for (const [p0, p1, n] of faces) {
    walls.quad(at(p0, h0), at(p1, h0), at(p1, h1), at(p0, h1), stone, dir3(n), plain);
    // The sound opening under the spire: a dark louvred slot.
    const m: V2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const t = norm(sub(p1, p0));
    const q0 = along(along(m, t, -side * 0.16), n, 0.03);
    const q1 = along(along(m, t, side * 0.16), n, 0.03);
    solids.quad(at(q0, h1 - side * 0.75), at(q1, h1 - side * 0.75), at(q1, h1 - side * 0.2), at(q0, h1 - side * 0.2), shadeC, dir3(n));
  }
  // The spire: four faces of dark sheet metal to a point, its eaves a little out over the tower.
  const tipH = h1 + side * 1.7;
  const tip = at(centre, tipH);
  const roof = shade(0x3c4a46);
  const e = 1.12;
  const rim: V2[] = [corner(-e, e), corner(e, e), corner(e, -e), corner(-e, -e)];
  for (let k = 0; k < 4; k++) {
    const p0 = rim[k];
    const p1 = rim[(k + 1) % 4];
    const a = at(p0, h1);
    const b = at(p1, h1);
    // Both ways round: the spire is seen from every side, whichever way the footprint runs.
    solids.tri(a, b, tip, roof);
    solids.tri(b, a, tip, roof);
  }
  // The cross.
  const yaw = Math.atan2(u[1], u[0]);
  solids.box(centre, yaw, 0.09, 0.09, tipH - 0.1, tipH + 1.3, shade(0x2a2a2c));
  solids.box(centre, yaw, 0.7, 0.09, tipH + 0.75, tipH + 0.85, shade(0x2a2a2c));
}
