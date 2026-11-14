/**
 * Everything painted in the camera's street, on one sheet made at start (no image files): house fronts the way
 * Estonian streets look (plastered town houses, panel blocks with their seams and balcony doors, white and red
 * brick, boarded wooden houses, glass-and-panel offices, the sandwich panels of shops and warehouses), roof
 * coverings, garage doors, fences, shop boards, road signs, and the cards of leaves and twigs trees are made of.
 *
 * The sheet is a grid of square cells. A house front is laid bay by bay and floor by floor, each bay one cell, so a
 * building chooses per bay what stands there (a window, a balcony door, a stairwell, a shop) and whether its light
 * is on. `lit` is the same sheet at night: black, with the lights.
 *
 * In the upper half of the sheet (walls) a pixel's alpha says how much of the wall's own colour it takes: the wall
 * itself is painted near white and takes the colour of its building, while windows, doors and signs keep theirs. In
 * the lower half (cut-outs) alpha is a plain mask: holes between the pickets of a fence or the leaves of a tree.
 */
import { ClampToEdgeWrapping, CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';
import { rand, type Rand, type V2 } from '../math';

export type FacadeKind = 'plaster' | 'panel' | 'brick' | 'wood' | 'modern' | 'hall';

export const FACADE_KINDS: FacadeKind[] = ['plaster', 'panel', 'brick', 'wood', 'modern', 'hall'];

/** Width of one window bay, metres. */
export const BAY_M: Record<FacadeKind, number> = { plaster: 3.0, panel: 3.2, brick: 3.0, wood: 2.8, modern: 3.4, hall: 6 };
/** Height of a ground floor, metres. */
export const GROUND_M = 3.1;

/** Cells across and down the sheet, and the size of one in pixels. */
export const ATLAS_N = 16;
const CELL = 96;
const SIZE = ATLAS_N * CELL;
/** Rows from here down are cut-outs. */
const CUT_ROW = 8;

/** Painting coordinates of a face's four corners: bottom left, bottom right, top right, top left. */
export type UV4 = [V2, V2, V2, V2];

/**
 * The corners of a cell (or of `w` by `h` cells) of the sheet. `u0` and `u1` (0..1) take only a part of its width:
 * a narrow piece of wall shows a narrow piece of the painting instead of a squeezed one. `v0` and `v1` likewise
 * from the bottom up.
 */
export function cellUV(col: number, row: number, w = 1, h = 1, u0 = 0, u1 = 1, v0 = 0, v1 = 1): UV4 {
  const inset = 0.6 / SIZE;
  const left = (col + w * u0) / ATLAS_N + inset;
  const right = (col + w * u1) / ATLAS_N - inset;
  const bottom = (row + h * (1 - v0)) / ATLAS_N - inset;
  const top = (row + h * (1 - v1)) / ATLAS_N + inset;
  return [[left, bottom], [right, bottom], [right, top], [left, top]];
}

/** Where each kind of house front has its sixteen cells. */
const BLOCK: Record<FacadeKind, readonly [number, number]> = { plaster: [0, 0], panel: [4, 0], brick: [8, 0], wood: [12, 0], modern: [0, 4], hall: [4, 4] };

/**
 * A cell of a house front. Rows: 0 an upper floor's bay, 1 the same with its light on at night, 2 the ground floor
 * (door, window, shop or gate, blank), 3 extras (see UPPER, GROUND and EXTRA below).
 */
export const facadeCell = (kind: FacadeKind, variant: number, row: number): readonly [number, number] => [BLOCK[kind][0] + variant, BLOCK[kind][1] + row];

/** Upper-floor bays (rows 0 and 1): what the four variants of each kind are. */
export const UPPER = { window: 0, second: 1, balcony: 2, blank: 3 } as const;
/** Ground-floor bays (row 2). */
export const GROUND = { door: 0, window: 1, shop: 2, blank: 3 } as const;
/** Row 3: a ground-floor window with its light on, a second shop bay (a window without a door), a small gable window, a plain wall. */
export const EXTRA = { litWindow: 0, shopWindow: 1, attic: 2, plain: 3 } as const;

/** Single cells outside the house fronts. */
export const CELLS = {
  roofTile: [8, 4],
  roofSeam: [9, 4],
  roofSlate: [10, 4],
  roofFelt: [11, 4],
  garageDoor: [12, 4],
  shutter: [13, 4],
  concreteFence: [14, 4],
  plankFence: [15, 4],
  hedge: [8, 5],
  birchBark: [9, 5],
  bark: [10, 5],
  poster: [11, 5],
  poster2: [12, 5],
  pump: [13, 5],
  price: [14, 5],
  white: [15, 5],
  /** Shop boards: three cells, four boards in each (see boardUV). */
  boards: [8, 6],
  shedDoor: [11, 6],
  timetable: [12, 6],
  cabinet: [13, 6],
  binFront: [14, 6],
  plate: [15, 6],
  // Cut-outs.
  signPriority: [0, 8],
  signGiveWay: [1, 8],
  signStop: [2, 8],
  sign50: [3, 8],
  sign30: [4, 8],
  signNoEntry: [5, 8],
  signCrossing: [6, 8],
  signParking: [7, 8],
  signBus: [8, 8],
  signNoParking: [9, 8],
  signYard: [10, 8],
  signKeepRight: [11, 8],
  signOneWay: [12, 8],
  sign70: [13, 8],
  sign90: [14, 8],
  signDeadEnd: [15, 8],
  backDisc: [0, 9],
  backSquare: [1, 9],
  backDiamond: [2, 9],
  backTriangle: [3, 9],
  backOctagon: [4, 9],
  picket: [5, 9],
  meshFence: [6, 9],
  railing: [7, 9],
  bikeStand: [8, 9],
  grass: [9, 9],
  reeds: [10, 9],
  leaves: [0, 10],
  leaves2: [1, 10],
  birch: [2, 10],
  pine: [3, 10],
  spruce: [4, 10],
  twigs: [5, 10],
  twigs2: [6, 10],
  bush: [7, 10],
  birchTwigs: [8, 10],
  thuja: [9, 10],
} as const satisfies Record<string, readonly [number, number]>;

export type CellName = keyof typeof CELLS;

export const uvOf = (name: CellName, u0 = 0, u1 = 1, v0 = 0, v1 = 1): UV4 => cellUV(CELLS[name][0], CELLS[name][1], 1, 1, u0, u1, v0, v1);

/** How many shop boards there are, and the painting of one. */
export const BOARDS = 12;
export function boardUV(i: number): UV4 {
  const k = ((i % BOARDS) + BOARDS) % BOARDS;
  return cellUV(CELLS.boards[0] + Math.floor(k / 4), CELLS.boards[1], 1, 1, 0, 1, 1 - ((k % 4) + 1) / 4, 1 - (k % 4) / 4);
}

type G = CanvasRenderingContext2D;

/** What a painting is made with: the colours, the mask of what keeps its own colour, the night sheet, and chance. */
interface Pen {
  g: G;
  m: G;
  l: G;
  r: Rand;
}

function sheet(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** A rectangle that keeps its own colour whatever the wall's is. */
function own(p: Pen, x: number, y: number, w: number, h: number, style: string | CanvasGradient) {
  p.g.fillStyle = style;
  p.g.fillRect(x, y, w, h);
  p.m.fillStyle = '#000000';
  p.m.fillRect(x, y, w, h);
}

/** A shade or a light laid over whatever is there (the wall's colour shows through). */
function wash(p: Pen, x: number, y: number, w: number, h: number, style: string | CanvasGradient) {
  p.g.fillStyle = style;
  p.g.fillRect(x, y, w, h);
}

/** A light at night. */
function glow(p: Pen, x: number, y: number, w: number, h: number, style: string, alpha = 1) {
  p.l.globalAlpha = alpha;
  p.l.fillStyle = style;
  p.l.fillRect(x, y, w, h);
  p.l.globalAlpha = 1;
}

/** Weathering: faint darker and lighter patches over a wall. */
function blotches(p: Pen, x0: number, y0: number, w: number, h: number, n: number, strength = 0.1) {
  const { g, r } = p;
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  for (let i = 0; i < n; i++) {
    const x = x0 + r.range(0, w);
    const y = y0 + r.range(0, h);
    const rad = r.range(8, 34);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, r.chance(0.7) ? `rgba(60,55,50,${strength})` : `rgba(255,255,255,${strength})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
}

/** Fine speckle: the grain of plaster, of washed concrete, of a tiled roof. */
function speckle(p: Pen, x0: number, y0: number, w: number, h: number, depth: number) {
  const img = p.g.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 - p.r() * depth;
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  }
  p.g.putImageData(img, x0, y0);
}

/** Rain streaks under a sill or a joint. */
function streak(p: Pen, x: number, y: number, w: number, len = 16, strength = 0.16) {
  const grad = p.g.createLinearGradient(0, y, 0, y + len);
  grad.addColorStop(0, `rgba(50,48,44,${strength})`);
  grad.addColorStop(1, 'rgba(50,48,44,0)');
  wash(p, x, y, w, len, grad);
}

const WARM = ['#ffd9a0', '#ffe6bd', '#ffcf8a', '#fff0d2', '#ffdcae', '#f4f0e4', '#ffe9c4'];

interface WinOpt {
  frame?: string;
  /** How the frame divides the glass. */
  panes?: 'one' | 'two' | 'three' | 'six' | 'tee';
  /** The light is on at night. */
  lit?: boolean;
  sill?: boolean;
  /** A casing of boards round the opening (wooden houses), in this colour. */
  casing?: string;
  curtains?: number;
}

/**
 * A window: the shade of its reveal, the frame, glass that mirrors the sky at its top, glazing bars, perhaps
 * curtains or a blind, a sill with the streak of rain under it; on the night sheet its light, when it is on.
 */
function win(p: Pen, x: number, y: number, w: number, h: number, o: WinOpt = {}) {
  const { g, r } = p;
  const frame = o.frame ?? '#e9e8e2';
  if (o.casing) own(p, x - 5, y - 6, w + 10, h + 11, o.casing);
  // The reveal: the opening is set back in the wall, its top and one side in shade.
  wash(p, x - 3, y - 3, w + 6, h + 5, 'rgba(30,28,26,0.32)');
  own(p, x - 1, y - 1, w + 2, h + 2, frame);
  const glass = g.createLinearGradient(0, y, 0, y + h);
  const tone = r();
  if (tone < 0.3) {
    glass.addColorStop(0, '#5c6874');
    glass.addColorStop(1, '#232b34');
  } else if (tone < 0.85) {
    glass.addColorStop(0, '#8496a7');
    glass.addColorStop(0.5, '#465261');
    glass.addColorStop(1, '#2b343f');
  } else {
    glass.addColorStop(0, '#a9b9c8');
    glass.addColorStop(0.6, '#62717f');
    glass.addColorStop(1, '#3a4652');
  }
  own(p, x + 1, y + 1, w - 2, h - 2, glass);
  // What hangs behind the glass.
  const hang = r();
  const share = o.curtains ?? 0.55;
  let drape: 'none' | 'sides' | 'blind' | 'net' = 'none';
  if (hang < share * 0.45) drape = 'sides';
  else if (hang < share * 0.75) drape = 'blind';
  else if (hang < share) drape = 'net';
  const cloth = `rgba(${r.int(200, 240)},${r.int(195, 232)},${r.int(180, 222)},${r.range(0.45, 0.8)})`;
  const sideW = Math.round(w * r.range(0.16, 0.3));
  const blindH = Math.round(h * r.range(0.25, 0.75));
  g.fillStyle = cloth;
  if (drape === 'sides') {
    g.fillRect(x + 1, y + 1, sideW, h - 2);
    g.fillRect(x + w - 1 - sideW, y + 1, sideW, h - 2);
  } else if (drape === 'blind') g.fillRect(x + 1, y + 1, w - 2, blindH);
  else if (drape === 'net') {
    g.fillStyle = 'rgba(235,235,230,0.38)';
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
  }
  // A pot plant on the sill inside.
  if (r.chance(0.18)) own(p, x + r.int(4, Math.max(5, w - 10)), y + h - 7, 5, 6, '#3f6b3a');
  const panes = o.panes ?? 'two';
  const bar = (bx: number, by: number, bw: number, bh: number) => own(p, bx, by, bw, bh, frame);
  if (panes === 'two' || panes === 'six' || panes === 'tee') bar(x + Math.round(w / 2) - 1, y, 2, h);
  if (panes === 'three') {
    bar(x + Math.round(w * 0.3) - 1, y, 2, h);
    bar(x + Math.round(w * 0.7) - 1, y, 2, h);
  }
  if (panes === 'tee') bar(x, y + Math.round(h * 0.3), w, 2);
  if (panes === 'six') {
    bar(x, y + Math.round(h * 0.34), w, 1);
    bar(x, y + Math.round(h * 0.67), w, 1);
  }
  // A glint where the glass catches the sky.
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.beginPath();
  g.moveTo(x + 2, y + h * 0.55);
  g.lineTo(x + w * 0.45, y + 2);
  g.lineTo(x + w * 0.7, y + 2);
  g.lineTo(x + 2, y + h * 0.9);
  g.fill();
  if (o.sill !== false) {
    own(p, x - 4, y + h + 1, w + 8, 3, '#d9d8d2');
    wash(p, x - 4, y + h + 4, w + 8, 2, 'rgba(30,28,26,0.34)');
    streak(p, x - 2, y + h + 6, w + 4);
  }
  if (o.lit) {
    const colour = r.chance(0.12) ? '#cfe0ff' : r.pick(WARM);
    const power = r.range(0.55, 1);
    glow(p, x + 1, y + 1, w - 2, h - 2, colour, power);
    // Curtains hold some of the light back; the frame's bars stay dark.
    if (drape === 'sides') {
      glow(p, x + 1, y + 1, sideW, h - 2, '#000000', 0.45);
      glow(p, x + w - 1 - sideW, y + 1, sideW, h - 2, '#000000', 0.45);
    } else if (drape === 'blind') glow(p, x + 1, y + 1, w - 2, blindH, '#000000', 0.5);
    else if (drape === 'net') glow(p, x + 1, y + 1, w - 2, h - 2, '#000000', 0.25);
    if (panes !== 'one') glow(p, x + Math.round(w / 2) - 1, y, 2, h, '#000000');
    if (panes === 'three') {
      glow(p, x + Math.round(w * 0.3) - 1, y, 2, h, '#000000');
      glow(p, x + Math.round(w * 0.7) - 1, y, 2, h, '#000000');
    }
  }
}

/** A sheet of shop glass down to a low sill: dark inside by day with a hint of shelves, bright at night. */
function shopGlass(p: Pen, x: number, y: number, w: number, h: number, frame: string, lit = 0.85) {
  const { g, r } = p;
  own(p, x - 2, y - 2, w + 4, h + 4, frame);
  const glass = g.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, '#8fa1b1');
  glass.addColorStop(0.35, '#46525f');
  glass.addColorStop(1, '#262e37');
  own(p, x, y, w, h, glass);
  // Things on show behind the glass.
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(${r.int(120, 230)},${r.int(110, 210)},${r.int(90, 190)},0.32)`;
    g.fillRect(x + 3 + r.range(0, w - 14), y + h * r.range(0.45, 0.8), r.range(5, 12), r.range(5, 12));
  }
  g.fillStyle = 'rgba(255,255,255,0.09)';
  g.beginPath();
  g.moveTo(x, y + h * 0.7);
  g.lineTo(x + w * 0.5, y);
  g.lineTo(x + w * 0.75, y);
  g.lineTo(x, y + h);
  g.fill();
  if (lit > 0) {
    // At night the shop shows its inside: a ceiling of light, rows of shelves with goods on them, never a white card.
    const k = Math.min(0.7, lit);
    glow(p, x, y, w, h, '#f6ecd8', k * 0.75);
    glow(p, x, y, w, h * 0.18, '#fff6e6', k * 0.35);
    for (let sy = y + h * 0.3; sy < y + h - 4; sy += h * 0.17) {
      // A shelf's dark edge and the goods standing on it in blocks of colour.
      glow(p, x + 1, sy, w - 2, 2, '#000000', 0.6);
      for (let gx = x + 2; gx < x + w - 4; gx += r.range(4, 9)) {
        const c = r.pick(['#c84a3a', '#3a6ac8', '#e8c040', '#4a9a4a', '#e8e0d0', '#7a4a8a', '#202020']);
        glow(p, gx, sy - r.range(3, 7), r.range(2.5, 6), r.range(3, 6), c, 0.4);
      }
    }
    for (let i = 0; i < 3; i++) glow(p, x + 3 + r.range(0, w - 14), y + h * r.range(0.5, 0.8), r.range(4, 9), r.range(10, 18), '#000000', 0.45);
  }
}

/** The darker foot of a wall, dirtier towards the ground. */
function plinth(p: Pen, x: number, y: number, w: number, foot: number, strength = 0.42) {
  wash(p, x, y + CELL - foot, w, foot, `rgba(62,60,57,${strength})`);
  wash(p, x, y + CELL - foot, w, 1, 'rgba(255,255,255,0.18)');
  const dirt = p.g.createLinearGradient(0, y + CELL - 26, 0, y + CELL);
  dirt.addColorStop(0, 'rgba(40,36,30,0)');
  dirt.addColorStop(1, 'rgba(40,36,30,0.3)');
  wash(p, x, y + CELL - 26, w, 26, dirt);
}

/** A door leaf with its panels, in a frame. */
function door(p: Pen, x: number, y: number, w: number, h: number, colour: string, o: { frame?: string; panes?: boolean; glass?: boolean; double?: boolean } = {}) {
  const frame = o.frame ?? '#dcdad2';
  wash(p, x - 4, y - 4, w + 8, h + 4, 'rgba(30,28,26,0.3)');
  own(p, x - 2, y - 2, w + 4, h + 2, frame);
  own(p, x, y, w, h, colour);
  if (o.double) own(p, x + Math.round(w / 2), y, 1, h, 'rgba(0,0,0,0.5)');
  const leaves = o.double ? 2 : 1;
  const lw = w / leaves;
  for (let i = 0; i < leaves; i++) {
    const lx = x + i * lw;
    if (o.glass) {
      const glass = p.g.createLinearGradient(0, y, 0, y + h);
      glass.addColorStop(0, '#7b8b9b');
      glass.addColorStop(1, '#2b343f');
      own(p, lx + 3, y + 4, lw - 6, h * 0.55, glass);
    } else if (o.panes) {
      wash(p, lx + 3, y + 5, lw - 6, h * 0.36, 'rgba(0,0,0,0.2)');
      wash(p, lx + 3, y + h * 0.5, lw - 6, h * 0.4, 'rgba(0,0,0,0.2)');
      wash(p, lx + 4, y + 6, lw - 8, 1, 'rgba(255,255,255,0.18)');
    }
  }
  // The handle.
  own(p, x + (o.double ? Math.round(w / 2) + 2 : w - 6), y + Math.round(h * 0.5), 2, 5, '#b9b7ae');
}

// ---------------------------------------------------------------------------- the six kinds of house front

function plaster(p: Pen, X: number, Y: number) {
  const { r } = p;
  speckle(p, X, Y, CELL * 4, CELL * 4, 0.05);
  blotches(p, X, Y, CELL * 4, CELL * 4, 46, 0.09);
  for (let row = 0; row < 2; row++) {
    for (let v = 0; v < 4; v++) {
      const x = X + v * CELL;
      const y = Y + row * CELL;
      const lit = row === 1;
      // The band between floors, and a hairline crack now and then.
      wash(p, x, y, CELL, 2, 'rgba(255,255,255,0.3)');
      wash(p, x, y + 2, CELL, 1, 'rgba(40,38,34,0.2)');
      if (v === UPPER.window) win(p, x + 27, y + 24, 42, 50, { panes: 'tee', lit });
      else if (v === UPPER.second) win(p, x + 20, y + 26, 56, 48, { panes: 'three', lit });
      else if (v === UPPER.balcony) {
        // A door to a small balcony beside a window.
        win(p, x + 12, y + 20, 24, 68, { panes: 'one', lit, sill: false });
        win(p, x + 46, y + 24, 36, 48, { panes: 'two', lit });
      } else {
        p.g.strokeStyle = 'rgba(50,46,40,0.25)';
        p.g.lineWidth = 1;
        p.g.beginPath();
        let cx = x + r.range(20, 70);
        let cy = y + 8;
        p.g.moveTo(cx, cy);
        for (let k = 0; k < 6; k++) {
          cx += r.range(-7, 7);
          cy += r.range(8, 15);
          p.g.lineTo(cx, cy);
        }
        p.g.stroke();
      }
    }
  }
  const gy = Y + 2 * CELL;
  const ey = Y + 3 * CELL;
  for (let v = 0; v < 4; v++) {
    // A rusticated ground floor: wide joints along it.
    for (const j of [22, 44, 66]) wash(p, X + v * CELL, gy + j, CELL, 1, 'rgba(40,38,34,0.14)');
    plinth(p, X + v * CELL, gy, CELL, 16);
    plinth(p, X + v * CELL, ey, CELL, 16);
  }
  // The door: two leaves and a light over them, a stone step.
  let x = X + GROUND.door * CELL;
  own(p, x + 30, gy + 16, 36, 12, '#3d4955');
  door(p, x + 30, gy + 30, 36, 60, r.pick(['#4a3528', '#3b4a3c', '#5a2a24', '#2f3a45']), { double: true, panes: true });
  own(p, x + 24, gy + 90, 48, 6, '#8f8f8a');
  glow(p, x + 30, gy + 16, 36, 12, '#ffe6bd', 0.6);
  win(p, X + GROUND.window * CELL + 26, gy + 20, 44, 50, { panes: 'tee' });
  // A shop: its door beside a pane of glass. The board over it is laid on by the street (boardUV).
  x = X + GROUND.shop * CELL;
  shopGlass(p, x + 8, gy + 30, 50, 44, '#2a2b2e');
  door(p, x + 66, gy + 30, 22, 60, '#2a2b2e', { glass: true, frame: '#2a2b2e' });
  glow(p, x + 69, gy + 34, 16, 32, '#fff0d2', 0.6);
  // A gateway to the yard: wooden gates in an arch.
  x = X + GROUND.blank * CELL;
  wash(p, x + 12, gy + 14, 72, 82, 'rgba(30,28,26,0.3)');
  own(p, x + 16, gy + 18, 64, 78, '#4b3a2c');
  for (let k = 0; k < 8; k++) own(p, x + 16 + k * 8, gy + 18, 1, 78, 'rgba(0,0,0,0.35)');
  own(p, x + 47, gy + 18, 2, 78, 'rgba(0,0,0,0.6)');
  win(p, X + EXTRA.litWindow * CELL + 26, ey + 20, 44, 50, { panes: 'tee', lit: true });
  shopGlass(p, X + EXTRA.shopWindow * CELL + 8, ey + 30, 80, 44, '#2a2b2e');
  win(p, X + EXTRA.attic * CELL + 34, ey + 30, 28, 30, { panes: 'two' });
}

function panel(p: Pen, X: number, Y: number) {
  const { r } = p;
  // Washed concrete: coarse grain, and the seams between the panels (one panel is a bay wide and a floor high).
  speckle(p, X, Y, CELL * 4, CELL * 4, 0.13);
  blotches(p, X, Y, CELL * 4, CELL * 4, 30, 0.08);
  for (let row = 0; row < 4; row++) {
    for (let v = 0; v < 4; v++) {
      const x = X + v * CELL;
      const y = Y + row * CELL;
      wash(p, x, y, CELL, 2, 'rgba(34,34,38,0.42)');
      wash(p, x, y + 2, CELL, 1, 'rgba(255,255,255,0.16)');
      wash(p, x, y, 2, CELL, 'rgba(34,34,38,0.42)');
      wash(p, x + 2, y, 1, CELL, 'rgba(255,255,255,0.14)');
      streak(p, x + r.range(4, 60), y + 3, r.range(8, 30), 22, 0.1);
    }
  }
  const frames = ['#eceae4', '#eceae4', '#d9d2c2', '#7a5a44'];
  for (let row = 0; row < 2; row++) {
    const lit = row === 1;
    const y = Y + row * CELL;
    win(p, X + UPPER.window * CELL + 18, y + 26, 60, 46, { panes: 'three', lit, frame: r.pick(frames) });
    win(p, X + UPPER.second * CELL + 26, y + 26, 44, 46, { panes: 'two', lit, frame: r.pick(frames) });
    // A balcony door and its window.
    let x = X + UPPER.balcony * CELL;
    win(p, x + 14, y + 22, 24, 68, { panes: 'one', lit, sill: false, frame: r.pick(frames) });
    win(p, x + 42, y + 26, 40, 46, { panes: 'two', lit, frame: r.pick(frames) });
    // The stairwell: a pair of small windows between the floors, always lit a little at night.
    x = X + UPPER.blank * CELL;
    win(p, x + 30, y + 8, 36, 30, { panes: 'two', curtains: 0, frame: '#d9d2c2' });
    if (lit) glow(p, x + 31, y + 9, 34, 28, '#ffe9c4', 0.5);
  }
  const gy = Y + 2 * CELL;
  const ey = Y + 3 * CELL;
  for (let v = 0; v < 4; v++) {
    plinth(p, X + v * CELL, gy, CELL, 22, 0.36);
    plinth(p, X + v * CELL, ey, CELL, 22, 0.36);
  }
  // The stair door: steel, a small pane, the entry phone beside it, the house number over it.
  let x = X + GROUND.door * CELL;
  door(p, x + 32, gy + 28, 32, 66, r.pick(['#5a5f66', '#6a4a3a', '#3f5a4a', '#2f4a66']), { frame: '#8d8f90' });
  own(p, x + 40, gy + 36, 10, 16, '#2b343f');
  own(p, x + 68, gy + 54, 5, 8, '#c9c7bd');
  own(p, x + 38, gy + 12, 20, 10, '#f4f2ea');
  own(p, x + 42, gy + 15, 12, 4, '#2a2b2e');
  glow(p, x + 40, gy + 36, 10, 16, '#ffe6bd', 0.7);
  win(p, X + GROUND.window * CELL + 18, gy + 22, 60, 44, { panes: 'three', frame: r.pick(frames) });
  // A ground-floor shop cut into the block: glass and a door.
  x = X + GROUND.shop * CELL;
  shopGlass(p, x + 8, gy + 28, 50, 42, '#55585c');
  door(p, x + 66, gy + 28, 22, 62, '#55585c', { glass: true, frame: '#55585c' });
  // A blank panel with the cellar's small window in its foot.
  x = X + GROUND.blank * CELL;
  own(p, x + 34, gy + 78, 28, 10, '#22262b');
  own(p, x + 47, gy + 78, 2, 10, '#8d8f90');
  win(p, X + EXTRA.litWindow * CELL + 18, ey + 22, 60, 44, { panes: 'three', lit: true, frame: r.pick(frames) });
  shopGlass(p, X + EXTRA.shopWindow * CELL + 8, ey + 28, 80, 42, '#55585c');
  win(p, X + EXTRA.attic * CELL + 30, ey + 30, 36, 30, { panes: 'two', curtains: 0 });
  // A gable end's plain panel carries a faded scribble.
  x = X + EXTRA.plain * CELL;
  p.g.strokeStyle = 'rgba(40,60,90,0.3)';
  p.g.lineWidth = 2;
  p.g.beginPath();
  p.g.moveTo(x + 20, ey + 70);
  p.g.bezierCurveTo(x + 30, ey + 50, x + 44, ey + 84, x + 56, ey + 62);
  p.g.bezierCurveTo(x + 62, ey + 52, x + 70, ey + 74, x + 78, ey + 66);
  p.g.stroke();
}

function bricks(p: Pen, x0: number, y0: number, w: number, h: number) {
  const { g, r } = p;
  // Courses three pixels high, a brick eight long, every brick a shade of its own.
  for (let y = 0; y < h; y += 3) {
    const shift = (y / 3) % 2 ? 4 : 0;
    for (let x = -shift; x < w; x += 8) {
      const k = r.range(-0.07, 0.05);
      g.fillStyle = k < 0 ? `rgba(40,30,24,${-k})` : `rgba(255,255,255,${k})`;
      g.fillRect(x0 + Math.max(0, x), y0 + y, Math.min(8, w - x), 3);
      g.fillStyle = 'rgba(60,52,46,0.22)';
      if (x > 0) g.fillRect(x0 + x, y0 + y, 1, 3);
    }
    g.fillStyle = 'rgba(60,52,46,0.24)';
    g.fillRect(x0, y0 + y, w, 1);
  }
}

function brick(p: Pen, X: number, Y: number) {
  const { r } = p;
  bricks(p, X, Y, CELL * 4, CELL * 4);
  blotches(p, X, Y, CELL * 4, CELL * 4, 30, 0.08);
  const frames = ['#eceae4', '#eceae4', '#7a5a44', '#d9d2c2'];
  for (let row = 0; row < 2; row++) {
    const lit = row === 1;
    const y = Y + row * CELL;
    // Concrete lintels over the openings.
    let x = X + UPPER.window * CELL;
    own(p, x + 20, y + 20, 56, 5, '#cfcdc4');
    win(p, x + 25, y + 27, 46, 46, { panes: 'two', lit, frame: r.pick(frames) });
    x = X + UPPER.second * CELL;
    own(p, x + 14, y + 20, 68, 5, '#cfcdc4');
    win(p, x + 19, y + 27, 58, 46, { panes: 'three', lit, frame: r.pick(frames) });
    x = X + UPPER.balcony * CELL;
    own(p, x + 8, y + 16, 80, 5, '#cfcdc4');
    win(p, x + 14, y + 23, 24, 67, { panes: 'one', lit, sill: false, frame: r.pick(frames) });
    win(p, x + 42, y + 27, 40, 46, { panes: 'two', lit, frame: r.pick(frames) });
    // A blank bay: an air brick.
    x = X + UPPER.blank * CELL;
    own(p, x + 42, y + 60, 12, 8, '#3a3632');
  }
  const gy = Y + 2 * CELL;
  const ey = Y + 3 * CELL;
  for (let v = 0; v < 4; v++) {
    plinth(p, X + v * CELL, gy, CELL, 18, 0.4);
    plinth(p, X + v * CELL, ey, CELL, 18, 0.4);
  }
  let x = X + GROUND.door * CELL;
  own(p, x + 24, gy + 18, 48, 6, '#cfcdc4');
  door(p, x + 31, gy + 28, 34, 64, r.pick(['#5a3a2a', '#3f4f5a', '#4a4a48', '#6a2f2a']), { panes: true });
  own(p, x + 36, gy + 34, 10, 14, '#2b343f');
  glow(p, x + 36, gy + 34, 10, 14, '#ffe6bd', 0.7);
  own(p, x + 24, gy + 92, 48, 4, '#8f8f8a');
  x = X + GROUND.window * CELL;
  own(p, x + 20, gy + 18, 56, 5, '#cfcdc4');
  win(p, x + 25, gy + 25, 46, 44, { panes: 'two', frame: r.pick(frames) });
  x = X + GROUND.shop * CELL;
  shopGlass(p, x + 8, gy + 30, 50, 42, '#3a3b3e');
  door(p, x + 66, gy + 30, 22, 60, '#3a3b3e', { glass: true, frame: '#3a3b3e' });
  x = X + GROUND.blank * CELL;
  own(p, x + 36, gy + 76, 24, 9, '#22262b');
  x = X + EXTRA.litWindow * CELL;
  own(p, x + 20, ey + 18, 56, 5, '#cfcdc4');
  win(p, x + 25, ey + 25, 46, 44, { panes: 'two', lit: true, frame: r.pick(frames) });
  shopGlass(p, X + EXTRA.shopWindow * CELL + 8, ey + 30, 80, 42, '#3a3b3e');
  win(p, X + EXTRA.attic * CELL + 32, ey + 30, 32, 30, { panes: 'two', curtains: 0 });
}

function boards(p: Pen, x0: number, y0: number, w: number, h: number, upright = false) {
  const { g, r } = p;
  const step = upright ? 5 : 5;
  for (let k = 0; k < (upright ? w : h); k += step) {
    const tone = r.range(-0.06, 0.05);
    g.fillStyle = tone < 0 ? `rgba(30,24,18,${-tone})` : `rgba(255,255,255,${tone})`;
    if (upright) g.fillRect(x0 + k, y0, step, h);
    else g.fillRect(x0, y0 + k, w, step);
    g.fillStyle = 'rgba(30,24,18,0.34)';
    if (upright) g.fillRect(x0 + k, y0, 1, h);
    else g.fillRect(x0, y0 + k + step - 1, w, 1);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    if (upright) g.fillRect(x0 + k + 1, y0, 1, h);
    else g.fillRect(x0, y0 + k, w, 1);
  }
}

function wood(p: Pen, X: number, Y: number) {
  const { r } = p;
  boards(p, X, Y, CELL * 4, CELL * 3);
  boards(p, X, Y + 3 * CELL, CELL * 3, CELL);
  boards(p, X + 3 * CELL, Y + 3 * CELL, CELL, CELL, true);
  blotches(p, X, Y, CELL * 4, CELL * 4, 40, 0.1);
  const trim = '#f1f0ea';
  for (let row = 0; row < 2; row++) {
    const lit = row === 1;
    const y = Y + row * CELL;
    win(p, X + UPPER.window * CELL + 30, y + 24, 36, 48, { panes: 'six', lit, frame: trim, casing: trim });
    win(p, X + UPPER.second * CELL + 22, y + 24, 52, 48, { panes: 'three', lit, frame: trim, casing: trim });
    win(p, X + UPPER.balcony * CELL + 34, y + 28, 28, 40, { panes: 'two', lit, frame: trim, casing: trim });
  }
  const gy = Y + 2 * CELL;
  const ey = Y + 3 * CELL;
  // A plinth of limestone under the boards.
  for (let v = 0; v < 4; v++) {
    for (const yy of [gy, ey]) {
      const x = X + v * CELL;
      own(p, x, yy + CELL - 14, CELL, 14, '#9d9a90');
      for (let k = 0; k < CELL; k += 16) own(p, x + k + ((yy / CELL) % 2 ? 6 : 0), yy + CELL - 14, 1, 14, 'rgba(40,38,34,0.3)');
      own(p, x, yy + CELL - 7, CELL, 1, 'rgba(40,38,34,0.25)');
      own(p, x, yy + CELL - 15, CELL, 2, trim);
    }
  }
  let x = X + GROUND.door * CELL;
  own(p, x + 27, gy + 12, 42, 70, trim);
  door(p, x + 32, gy + 28, 32, 54, r.pick(['#5a3a2a', '#3d4f3f', '#6a2f2a', '#3a4654', '#7a6a4a']), { double: true, panes: true, frame: trim });
  own(p, x + 32, gy + 16, 32, 9, '#3d4955');
  own(p, x + 47, gy + 16, 2, 9, trim);
  glow(p, x + 32, gy + 16, 32, 9, '#ffe6bd', 0.6);
  win(p, X + GROUND.window * CELL + 30, gy + 22, 36, 46, { panes: 'six', frame: trim, casing: trim });
  // A glazed porch for the third bay.
  x = X + GROUND.shop * CELL;
  win(p, x + 12, gy + 22, 30, 46, { panes: 'six', frame: trim, casing: trim, curtains: 0.8 });
  win(p, x + 54, gy + 22, 30, 46, { panes: 'six', frame: trim, casing: trim, curtains: 0.8 });
  win(p, X + EXTRA.litWindow * CELL + 30, ey + 22, 36, 46, { panes: 'six', lit: true, frame: trim, casing: trim });
  win(p, X + EXTRA.shopWindow * CELL + 22, ey + 22, 52, 46, { panes: 'three', frame: trim, casing: trim });
  win(p, X + EXTRA.attic * CELL + 36, ey + 34, 24, 28, { panes: 'two', frame: trim, casing: trim, curtains: 0.2 });
}

function modern(p: Pen, X: number, Y: number) {
  const { g, r } = p;
  speckle(p, X, Y, CELL * 4, CELL * 4, 0.03);
  blotches(p, X, Y, CELL * 4, CELL * 4, 10, 0.05);
  // Cladding panels: a joint every half bay and at every floor.
  for (let row = 0; row < 4; row++) {
    for (let v = 0; v < 4; v++) {
      const x = X + v * CELL;
      const y = Y + row * CELL;
      wash(p, x, y, CELL, 1, 'rgba(20,22,26,0.4)');
      wash(p, x, y, 1, CELL, 'rgba(20,22,26,0.4)');
      wash(p, x + 48, y, 1, CELL, 'rgba(20,22,26,0.28)');
    }
  }
  const dark = '#2f3338';
  const sky = (y: number, h: number) => {
    const glass = g.createLinearGradient(0, y, 0, y + h);
    glass.addColorStop(0, '#93a6b8');
    glass.addColorStop(0.5, '#4d5a69');
    glass.addColorStop(1, '#2c3642');
    return glass;
  };
  for (let row = 0; row < 2; row++) {
    const lit = row === 1;
    const y = Y + row * CELL;
    // A ribbon of glass along the floor.
    let x = X + UPPER.window * CELL;
    own(p, x, y + 24, CELL, 50, dark);
    own(p, x + 1, y + 26, CELL - 2, 46, sky(y + 26, 46));
    for (let k = 1; k < 4; k++) own(p, x + k * 24, y + 26, 2, 46, dark);
    if (lit) glow(p, x + 1, y + 26, CELL - 2, 46, r.pick(['#fff4dc', '#eaf2ff', '#fff0d2']), r.range(0.5, 0.9));
    // Glass from floor to ceiling.
    x = X + UPPER.second * CELL;
    own(p, x + 6, y + 8, 84, 86, dark);
    own(p, x + 8, y + 10, 80, 82, sky(y + 10, 82));
    own(p, x + 47, y + 10, 2, 82, dark);
    own(p, x + 8, y + 64, 80, 2, dark);
    if (lit) glow(p, x + 8, y + 10, 80, 54, r.pick(['#fff4dc', '#ffe9c4']), r.range(0.5, 0.85));
    // A tall window with a glass rail in front: a flat's door to the air.
    x = X + UPPER.balcony * CELL;
    own(p, x + 16, y + 12, 34, 80, dark);
    own(p, x + 18, y + 14, 30, 76, sky(y + 14, 76));
    own(p, x + 16, y + 60, 34, 2, '#c9ced2');
    own(p, x + 60, y + 30, 24, 40, dark);
    own(p, x + 62, y + 32, 20, 36, sky(y + 32, 36));
    if (lit) {
      glow(p, x + 18, y + 14, 30, 76, r.pick(WARM), r.range(0.5, 0.9));
      glow(p, x + 62, y + 32, 20, 36, r.pick(WARM), r.range(0.4, 0.8));
    }
    // A blank bay faced with wooden slats.
    x = X + UPPER.blank * CELL;
    own(p, x + 50, y + 2, 44, 92, '#8a6a4a');
    for (let k = 0; k < 44; k += 4) own(p, x + 50 + k, y + 2, 1, 92, 'rgba(30,20,10,0.4)');
  }
  const gy = Y + 2 * CELL;
  const ey = Y + 3 * CELL;
  for (let v = 0; v < 4; v++) {
    plinth(p, X + v * CELL, gy, CELL, 8, 0.4);
    plinth(p, X + v * CELL, ey, CELL, 8, 0.4);
  }
  // The entrance: glass doors under a thin canopy line.
  let x = X + GROUND.door * CELL;
  own(p, x + 14, gy + 20, 68, 74, dark);
  own(p, x + 16, gy + 22, 64, 72, sky(gy + 22, 72));
  own(p, x + 47, gy + 22, 2, 72, dark);
  own(p, x + 16, gy + 38, 64, 2, dark);
  own(p, x + 42, gy + 58, 2, 12, '#c9ced2');
  own(p, x + 52, gy + 58, 2, 12, '#c9ced2');
  glow(p, x + 16, gy + 22, 64, 72, '#fff4dc', 0.75);
  x = X + GROUND.window * CELL;
  own(p, x + 6, gy + 18, 84, 70, dark);
  own(p, x + 8, gy + 20, 80, 66, sky(gy + 20, 66));
  own(p, x + 47, gy + 20, 2, 66, dark);
  x = X + GROUND.shop * CELL;
  shopGlass(p, x + 6, gy + 26, 54, 62, dark);
  door(p, x + 66, gy + 26, 24, 66, dark, { glass: true, frame: dark });
  glow(p, x + 69, gy + 30, 18, 36, '#fff0d2', 0.6);
  // A plant room's louvres.
  x = X + GROUND.blank * CELL;
  own(p, x + 20, gy + 34, 56, 36, '#55595e');
  for (let k = 0; k < 36; k += 4) own(p, x + 20, gy + 34 + k, 56, 1, 'rgba(0,0,0,0.45)');
  x = X + EXTRA.litWindow * CELL;
  own(p, x + 6, ey + 18, 84, 70, dark);
  own(p, x + 8, ey + 20, 80, 66, sky(ey + 20, 66));
  own(p, x + 47, ey + 20, 2, 66, dark);
  glow(p, x + 8, ey + 20, 80, 66, '#fff4dc', 0.7);
  shopGlass(p, X + EXTRA.shopWindow * CELL + 6, ey + 26, 84, 62, dark);
  x = X + EXTRA.attic * CELL;
  own(p, x + 30, ey + 30, 36, 30, dark);
  own(p, x + 32, ey + 32, 32, 26, sky(ey + 32, 26));
}

function hall(p: Pen, X: number, Y: number) {
  const { g, r } = p;
  // Sandwich panels laid along the wall: a joint every 1.1 m of height, fine ribs across.
  for (let x = 0; x < CELL * 4; x += 3) wash(p, X + x, Y, 1, CELL * 4, 'rgba(30,30,34,0.07)');
  for (let y = 0; y < CELL * 4; y += 32) {
    wash(p, X, Y + y, CELL * 4, 1, 'rgba(24,24,28,0.4)');
    wash(p, X, Y + y + 1, CELL * 4, 1, 'rgba(255,255,255,0.2)');
  }
  for (let v = 0; v < 16; v++) wash(p, X + (v % 4) * CELL, Y + Math.floor(v / 4) * CELL, 1, CELL, 'rgba(24,24,28,0.25)');
  blotches(p, X, Y, CELL * 4, CELL * 4, 16, 0.06);
  for (let row = 0; row < 2; row++) {
    const y = Y + row * CELL;
    // A dark band under the eaves.
    let x = X + UPPER.second * CELL;
    own(p, x, y, CELL, 14, '#34383e');
    // A strip of high windows.
    x = X + UPPER.balcony * CELL;
    own(p, x + 4, y + 30, 88, 24, '#3a3e44');
    const glass = g.createLinearGradient(0, y + 32, 0, y + 52);
    glass.addColorStop(0, '#8496a6');
    glass.addColorStop(1, '#34404c');
    own(p, x + 6, y + 32, 84, 20, glass);
    for (let k = 1; k < 4; k++) own(p, x + 6 + k * 21, y + 32, 1, 20, '#3a3e44');
    if (row === 1) glow(p, x + 6, y + 32, 84, 20, '#eaf2ff', 0.6);
    // Louvres and a duct.
    x = X + UPPER.blank * CELL;
    own(p, x + 30, y + 40, 30, 24, '#6a6e73');
    for (let k = 0; k < 24; k += 4) own(p, x + 30, y + 40 + k, 30, 1, 'rgba(0,0,0,0.4)');
  }
  const gy = Y + 2 * CELL;
  const ey = Y + 3 * CELL;
  for (let v = 0; v < 4; v++) {
    for (const yy of [gy, ey]) {
      own(p, X + v * CELL, yy + CELL - 12, CELL, 12, '#8a8a86');
      own(p, X + v * CELL, yy + CELL - 12, CELL, 1, 'rgba(0,0,0,0.3)');
    }
  }
  // The way in: sliding glass doors in a glazed porch, lit.
  let x = X + GROUND.door * CELL;
  own(p, x + 10, gy + 22, 76, 74, '#2f3338');
  const glass = g.createLinearGradient(0, gy + 24, 0, gy + 94);
  glass.addColorStop(0, '#93a6b8');
  glass.addColorStop(0.4, '#4d5a69');
  glass.addColorStop(1, '#2c3642');
  own(p, x + 12, gy + 24, 72, 70, glass);
  for (const k of [30, 47, 64]) own(p, x + k, gy + 24, 2, 70, '#2f3338');
  own(p, x + 12, gy + 40, 72, 2, '#2f3338');
  glow(p, x + 12, gy + 24, 72, 70, '#fff4dc', 0.85);
  // Shop glass with offer posters stuck inside.
  x = X + GROUND.window * CELL;
  shopGlass(p, x + 6, gy + 30, 84, 52, '#2f3338', 0.8);
  for (let k = 0; k < 3; k++) {
    own(p, x + 12 + k * 27, gy + 40, 18, 24, r.pick(['#d8342a', '#f2c81e', '#f4f2ea', '#2a6fb0']));
    own(p, x + 15 + k * 27, gy + 46, 12, 3, 'rgba(20,20,20,0.6)');
    own(p, x + 15 + k * 27, gy + 53, 9, 3, 'rgba(20,20,20,0.6)');
  }
  // A goods door for lorries, with its guard posts.
  x = X + GROUND.shop * CELL;
  own(p, x + 20, gy + 14, 56, 70, '#8f9296');
  for (let k = 0; k < 70; k += 5) own(p, x + 20, gy + 14 + k, 56, 1, 'rgba(0,0,0,0.3)');
  own(p, x + 18, gy + 12, 60, 3, '#55595e');
  for (const k of [14, 78]) {
    own(p, x + k, gy + 62, 4, 22, '#e3c21c');
    own(p, x + k, gy + 68, 4, 4, '#1c1c1e');
    own(p, x + k, gy + 76, 4, 4, '#1c1c1e');
  }
  // A staff door.
  x = X + EXTRA.litWindow * CELL;
  door(p, x + 38, ey + 30, 22, 54, '#6a6e73', { frame: '#55595e' });
  shopGlass(p, X + EXTRA.shopWindow * CELL + 6, ey + 30, 84, 52, '#2f3338', 0.8);
}

// ---------------------------------------------------------------------------- roofs, doors, fences, boards

const BOARD_NAMES = ['TOIDUPOOD', 'APTEEK', 'KOHVIK', 'JUUKSUR', 'LILLED', 'PAGARIÄRI', 'KINGAD', 'PANDIMAJA', 'OPTIKA', 'RAAMATUD', 'KEBAB', 'ILUSALONG'];
const BOARD_COLOURS: [string, string][] = [
  ['#1f4a8a', '#f4f2ea'],
  ['#1f6a3a', '#f4f2ea'],
  ['#2a2a2e', '#e8c860'],
  ['#8a1f24', '#f4f2ea'],
  ['#e9e6dc', '#3f6b3a'],
  ['#6a4a2a', '#f2e6c8'],
  ['#2a2a2e', '#f4f2ea'],
  ['#e3c21c', '#1c1c1e'],
  ['#0f5a66', '#f4f2ea'],
  ['#e9e6dc', '#2a2a2e'],
  ['#b0401a', '#f6e8c0'],
  ['#5a2a7a', '#f4f2ea'],
];

function misc(p: Pen) {
  const { g, r } = p;
  const at = (name: CellName): [number, number] => [CELLS[name][0] * CELL, CELLS[name][1] * CELL];
  // Clay tiles: courses with a shadow under each, every tile a shade of its own.
  let [x, y] = at('roofTile');
  for (let cy = 0; cy < CELL; cy += 8) {
    for (let cx = 0; cx < CELL; cx += 6) {
      const k = r.range(-0.12, 0.08);
      g.fillStyle = k < 0 ? `rgba(20,10,6,${-k})` : `rgba(255,255,255,${k})`;
      g.fillRect(x + cx, y + cy, 6, 8);
      g.fillStyle = 'rgba(20,10,6,0.16)';
      g.fillRect(x + cx, y + cy, 1, 8);
    }
    wash(p, x, y + cy + 6, CELL, 2, 'rgba(20,10,6,0.3)');
    wash(p, x, y + cy, CELL, 1, 'rgba(255,255,255,0.12)');
  }
  // Sheet metal with standing seams running up the slope.
  [x, y] = at('roofSeam');
  for (let cx = 0; cx < CELL; cx += 16) {
    wash(p, x + cx, y, 1, CELL, 'rgba(255,255,255,0.3)');
    wash(p, x + cx + 1, y, 2, CELL, 'rgba(10,10,12,0.3)');
    wash(p, x + cx + 4, y, 12, CELL, `rgba(10,10,12,${r.range(0, 0.07)})`);
  }
  blotches(p, x, y, CELL, CELL, 6, 0.08);
  // Fibre-cement sheets: wide waves, grey with moss.
  [x, y] = at('roofSlate');
  for (let cx = 0; cx < CELL; cx += 6) {
    wash(p, x + cx, y, 2, CELL, 'rgba(10,10,12,0.2)');
    wash(p, x + cx + 3, y, 2, CELL, 'rgba(255,255,255,0.12)');
  }
  for (let cy = 31; cy < CELL; cy += 32) wash(p, x, y + cy, CELL, 2, 'rgba(10,10,12,0.3)');
  for (let i = 0; i < 9; i++) wash(p, x + r.range(0, 86), y + r.range(0, 86), r.range(4, 12), r.range(4, 12), 'rgba(70,90,40,0.16)');
  // Roofing felt in strips.
  [x, y] = at('roofFelt');
  speckle(p, x, y, CELL, CELL, 0.2);
  for (let cy = 23; cy < CELL; cy += 24) wash(p, x, y + cy, CELL, 1, 'rgba(0,0,0,0.3)');
  blotches(p, x, y, CELL, CELL, 8, 0.12);
  // A garage's sectional door.
  [x, y] = at('garageDoor');
  for (let cy = 0; cy < CELL; cy += 16) {
    wash(p, x, y + cy, CELL, 1, 'rgba(0,0,0,0.35)');
    wash(p, x, y + cy + 1, CELL, 1, 'rgba(255,255,255,0.2)');
    for (let cx = 6; cx < CELL; cx += 30) wash(p, x + cx, y + cy + 4, 24, 9, 'rgba(0,0,0,0.07)');
  }
  wash(p, x, y, 2, CELL, 'rgba(0,0,0,0.4)');
  wash(p, x + CELL - 2, y, 2, CELL, 'rgba(0,0,0,0.4)');
  own(p, x + 44, y + 78, 8, 3, '#2a2a2c');
  // A roller shutter.
  [x, y] = at('shutter');
  for (let cy = 0; cy < CELL; cy += 4) wash(p, x, y + cy, CELL, 1, 'rgba(0,0,0,0.3)');
  wash(p, x, y, CELL, 6, 'rgba(0,0,0,0.3)');
  // A fence of cast concrete slabs with their diamond pattern.
  [x, y] = at('concreteFence');
  speckle(p, x, y, CELL, CELL, 0.12);
  for (let cx = 0; cx < CELL; cx += 24) {
    for (let cy = 12; cy < CELL - 12; cy += 24) {
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.beginPath();
      g.moveTo(x + cx + 12, y + cy);
      g.lineTo(x + cx + 23, y + cy + 12);
      g.lineTo(x + cx + 12, y + cy + 24);
      g.lineTo(x + cx + 1, y + cy + 12);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.moveTo(x + cx + 12, y + cy + 3);
      g.lineTo(x + cx + 20, y + cy + 12);
      g.lineTo(x + cx + 12, y + cy + 12);
      g.fill();
    }
  }
  wash(p, x, y, 2, CELL, 'rgba(0,0,0,0.4)');
  wash(p, x, y, CELL, 4, 'rgba(0,0,0,0.18)');
  streak(p, x, y + 4, CELL, 30, 0.14);
  // A fence of upright planks, a rail showing through.
  [x, y] = at('plankFence');
  boards(p, x, y, CELL, CELL, true);
  wash(p, x, y + 20, CELL, 2, 'rgba(0,0,0,0.12)');
  wash(p, x, y + 70, CELL, 2, 'rgba(0,0,0,0.12)');
  blotches(p, x, y, CELL, CELL, 8, 0.1);
  // A clipped hedge: leaves light and dark.
  [x, y] = at('hedge');
  for (let i = 0; i < 900; i++) {
    const k = r.range(-0.28, 0.16);
    g.fillStyle = k < 0 ? `rgba(0,10,0,${-k})` : `rgba(230,255,200,${k})`;
    g.fillRect(x + r.range(0, CELL - 3), y + r.range(0, CELL - 3), r.range(2, 5), r.range(2, 5));
  }
  const dusk = g.createLinearGradient(0, y, 0, y + CELL);
  dusk.addColorStop(0, 'rgba(255,255,220,0.1)');
  dusk.addColorStop(1, 'rgba(0,10,0,0.3)');
  wash(p, x, y, CELL, CELL, dusk);
  // A birch's bark: white with dark scars.
  [x, y] = at('birchBark');
  own(p, x, y, CELL, CELL, '#e4e2d8');
  for (let i = 0; i < 46; i++) {
    const w = r.range(4, 22);
    own(p, x + r.range(0, CELL - w), y + r.range(0, CELL - 2), w, r.range(1, 3.5), `rgba(34,32,30,${r.range(0.4, 0.9)})`);
  }
  for (let i = 0; i < 5; i++) own(p, x + r.range(0, CELL - 14), y + r.range(0, CELL - 12), r.range(8, 14), r.range(6, 12), 'rgba(34,32,30,0.75)');
  // Other bark: furrowed.
  [x, y] = at('bark');
  for (let cx = 0; cx < CELL; cx += 3) wash(p, x + cx, y, r.range(1, 2), CELL, `rgba(0,0,0,${r.range(0.08, 0.4)})`);
  blotches(p, x, y, CELL, CELL, 6, 0.14);
  // Posters for an advertising column and a bus shelter: blocks of colour, lines of text.
  for (const name of ['poster', 'poster2'] as const) {
    [x, y] = at(name);
    own(p, x, y, CELL, CELL, '#e9e6dc');
    for (let k = 0; k < 2; k++) {
      const px = x + 3 + k * 47;
      const bg = r.pick(['#1f4a8a', '#b0401a', '#2a2a2e', '#1f6a3a', '#d8b21e', '#7a1f4a']);
      own(p, px, y + 3, 43, 90, bg);
      g.fillStyle = r.pick(['#f4f2ea', '#f6e8c0']);
      g.beginPath();
      g.arc(px + 21, y + 36, 13, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 4; i++) own(p, px + 6, y + 60 + i * 7, r.range(18, 31), 3, 'rgba(244,242,234,0.85)');
    }
    glow(p, x, y, CELL, CELL, '#f4f0e4', name === 'poster2' ? 0.7 : 0);
  }
  // A fuel pump's face: a screen, the hoses' holsters.
  [x, y] = at('pump');
  own(p, x, y, CELL, CELL, '#d9dcdf');
  own(p, x, y, CELL, 20, '#c8102e');
  own(p, x + 14, y + 26, 68, 26, '#15181c');
  own(p, x + 18, y + 30, 40, 7, '#8fd08a');
  own(p, x + 18, y + 41, 30, 6, '#8fd08a');
  for (let k = 0; k < 3; k++) {
    own(p, x + 14 + k * 24, y + 58, 20, 34, '#2a2d31');
    own(p, x + 18 + k * 24, y + 62, 12, 8, ['#2f8f4a', '#1c1c1e', '#d8b21e'][k]);
  }
  glow(p, x + 14, y + 26, 68, 26, '#9fe89a', 0.8);
  // A filling station's price sign: three fuels, three prices.
  [x, y] = at('price');
  own(p, x, y, CELL, CELL, '#1c2026');
  own(p, x, y, CELL, 22, '#c8102e');
  g.font = '700 15px Arial, Helvetica, sans-serif';
  g.textBaseline = 'middle';
  ['95', '98', 'D'].forEach((fuel, i) => {
    const yy = y + 36 + i * 22;
    own(p, x + 5, yy - 9, 24, 18, ['#2f8f4a', '#2a6fb0', '#2a2a2e'][i]);
    g.fillStyle = '#f4f2ea';
    g.textAlign = 'center';
    g.fillText(fuel, x + 17, yy + 1);
    g.fillStyle = '#ffd24a';
    g.textAlign = 'right';
    g.fillText(`1.${r.int(4, 7)}${r.int(0, 9)}9`, x + 92, yy + 1);
  });
  glow(p, x, y, CELL, CELL, '#ffffff', 0.25);
  glow(p, x + 36, y + 26, 58, 66, '#ffd24a', 0.5);
  // Plain white: untextured things drawn with the sheet's material.
  [x, y] = at('white');
  own(p, x, y, CELL, CELL, '#ffffff');
  // Shop boards.
  g.font = '700 14px Arial, Helvetica, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < BOARDS; i++) {
    const bx = (CELLS.boards[0] + Math.floor(i / 4)) * CELL;
    const by = CELLS.boards[1] * CELL + (i % 4) * 24;
    const [bg, fg] = BOARD_COLOURS[i];
    own(p, bx, by, CELL, 24, bg);
    own(p, bx, by, CELL, 1, 'rgba(0,0,0,0.35)');
    own(p, bx, by + 23, CELL, 1, 'rgba(0,0,0,0.35)');
    g.fillStyle = fg;
    g.fillText(BOARD_NAMES[i], bx + 48, by + 13, 88);
    glow(p, bx, by, CELL, 24, i % 3 === 0 ? '#ffffff' : '#8a8a8a', 0.5);
  }
  // A shed's door of planks with a cross brace.
  [x, y] = at('shedDoor');
  boards(p, x, y, CELL, CELL, true);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(x + 8, y + 12);
  g.lineTo(x + 88, y + 12);
  g.lineTo(x + 8, y + 84);
  g.lineTo(x + 88, y + 84);
  g.stroke();
  own(p, x + 80, y + 46, 6, 8, '#2a2a2c');
  // A bus stop's timetable board.
  [x, y] = at('timetable');
  own(p, x, y, CELL, CELL, '#f4f2ea');
  own(p, x, y, CELL, 22, '#1f4a8a');
  for (let i = 0; i < 9; i++) own(p, x + 8, y + 30 + i * 7, r.range(40, 80), 2, 'rgba(30,30,34,0.7)');
  // A utility cabinet's door: grey, a vent, a warning label.
  [x, y] = at('cabinet');
  own(p, x, y, CELL, CELL, '#9a9d98');
  own(p, x + 47, y + 4, 2, 88, 'rgba(0,0,0,0.4)');
  for (let k = 0; k < 16; k += 4) own(p, x + 10, y + 12 + k, 28, 1, 'rgba(0,0,0,0.4)');
  own(p, x + 60, y + 14, 20, 18, '#e3c21c');
  g.fillStyle = '#1c1c1e';
  g.beginPath();
  g.moveTo(x + 70, y + 17);
  g.lineTo(x + 77, y + 29);
  g.lineTo(x + 63, y + 29);
  g.fill();
  own(p, x + 42, y + 50, 3, 9, '#2a2a2c');
  blotches(p, x, y, CELL, CELL, 6, 0.1);
  // A litter bin's front.
  [x, y] = at('binFront');
  own(p, x, y, CELL, CELL, '#3a4a3e');
  own(p, x + 20, y + 14, 56, 14, '#111314');
  for (let cx = 6; cx < CELL; cx += 8) own(p, x + cx, y + 36, 1, 56, 'rgba(0,0,0,0.3)');
  // A house number plate.
  [x, y] = at('plate');
  own(p, x, y, CELL, CELL, '#1f4a8a');
  own(p, x + 3, y + 3, CELL - 6, CELL - 6, '#f4f2ea');
  g.fillStyle = '#1c1c1e';
  g.font = '700 52px Arial, Helvetica, sans-serif';
  g.fillText(String(r.int(2, 48)), x + 48, y + 52);
}

// ---------------------------------------------------------------------------- cut-outs: signs, fences, leaves

function cutouts(g: G, r: Rand) {
  const at = (name: CellName): [number, number] => [CELLS[name][0] * CELL, CELLS[name][1] * CELL];
  g.clearRect(0, CUT_ROW * CELL, SIZE, SIZE - CUT_ROW * CELL);
  const RED = '#c8201e';
  const BLUE = '#1456a8';
  const WHITE = '#f2f2ee';
  const YELLOW = '#f2c81e';
  const BLACK = '#18181a';
  const disc = (cx: number, cy: number, rad: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
  };
  const poly = (pts: [number, number][], fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.closePath();
    g.fill();
  };
  const text = (s: string, cx: number, cy: number, px: number, fill: string) => {
    g.fillStyle = fill;
    g.font = `700 ${px}px Arial, Helvetica, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s, cx, cy);
  };
  /** A little walking figure, the way signs draw one. */
  const walker = (cx: number, cy: number, s: number, fill: string) => {
    disc(cx + s * 0.1, cy - s * 0.42, s * 0.11, fill);
    g.strokeStyle = fill;
    g.lineCap = 'round';
    g.lineWidth = s * 0.13;
    g.beginPath();
    g.moveTo(cx + s * 0.08, cy - s * 0.28);
    g.lineTo(cx, cy + s * 0.05);
    g.lineTo(cx - s * 0.2, cy + s * 0.42);
    g.moveTo(cx, cy + s * 0.05);
    g.lineTo(cx + s * 0.22, cy + s * 0.42);
    g.moveTo(cx + s * 0.06, cy - s * 0.2);
    g.lineTo(cx - s * 0.18, cy - s * 0.02);
    g.moveTo(cx + s * 0.06, cy - s * 0.2);
    g.lineTo(cx + s * 0.26, cy - s * 0.04);
    g.stroke();
  };
  const limit = (name: CellName, n: string) => {
    const [x, y] = at(name);
    disc(x + 48, y + 48, 46, RED);
    disc(x + 48, y + 48, 35, WHITE);
    text(n, x + 48, y + 51, 40, BLACK);
  };
  // Priority road: a yellow diamond with a white rim.
  let [x, y] = at('signPriority');
  poly([[x + 48, y + 2], [x + 94, y + 48], [x + 48, y + 94], [x + 2, y + 48]], WHITE);
  poly([[x + 48, y + 16], [x + 80, y + 48], [x + 48, y + 80], [x + 16, y + 48]], YELLOW);
  // Give way: a white triangle on its point, a red rim.
  [x, y] = at('signGiveWay');
  poly([[x + 2, y + 8], [x + 94, y + 8], [x + 48, y + 90]], RED);
  poly([[x + 20, y + 19], [x + 76, y + 19], [x + 48, y + 69]], WHITE);
  // Stop.
  [x, y] = at('signStop');
  const oct: [number, number][] = [];
  for (let i = 0; i < 8; i++) oct.push([x + 48 + Math.cos(((i + 0.5) / 8) * Math.PI * 2) * 47, y + 48 + Math.sin(((i + 0.5) / 8) * Math.PI * 2) * 47]);
  poly(oct, WHITE);
  poly(oct.map((q) => [x + 48 + (q[0] - x - 48) * 0.93, y + 48 + (q[1] - y - 48) * 0.93] as [number, number]), RED);
  text('STOP', x + 48, y + 50, 27, WHITE);
  limit('sign50', '50');
  limit('sign30', '30');
  limit('sign70', '70');
  limit('sign90', '90');
  // No entry.
  [x, y] = at('signNoEntry');
  disc(x + 48, y + 48, 46, RED);
  g.fillStyle = WHITE;
  g.fillRect(x + 14, y + 39, 68, 18);
  // A pedestrian crossing: a blue square, a white triangle, a walker; on a yellow-green board, as many are hung.
  [x, y] = at('signCrossing');
  g.fillStyle = '#c8e616';
  g.fillRect(x, y, CELL, CELL);
  g.fillStyle = BLUE;
  g.fillRect(x + 9, y + 9, 78, 78);
  poly([[x + 48, y + 15], [x + 82, y + 80], [x + 14, y + 80]], WHITE);
  walker(x + 47, y + 56, 40, BLACK);
  g.fillStyle = BLACK;
  for (let k = 0; k < 4; k++) g.fillRect(x + 26 + k * 12, y + 74, 7, 4);
  // Parking.
  [x, y] = at('signParking');
  g.fillStyle = WHITE;
  g.fillRect(x, y, CELL, CELL);
  g.fillStyle = BLUE;
  g.fillRect(x + 4, y + 4, 88, 88);
  text('P', x + 48, y + 53, 76, WHITE);
  // A bus stop.
  [x, y] = at('signBus');
  g.fillStyle = WHITE;
  g.fillRect(x, y, CELL, CELL);
  g.fillStyle = BLUE;
  g.fillRect(x + 4, y + 4, 88, 88);
  g.fillStyle = WHITE;
  g.fillRect(x + 16, y + 18, 64, 60);
  g.fillStyle = BLACK;
  g.fillRect(x + 22, y + 30, 52, 30);
  g.fillStyle = WHITE;
  for (let k = 0; k < 4; k++) g.fillRect(x + 26 + k * 12, y + 34, 8, 10);
  disc(x + 34, y + 62, 6, BLACK);
  disc(x + 62, y + 62, 6, BLACK);
  // No parking.
  [x, y] = at('signNoParking');
  disc(x + 48, y + 48, 46, RED);
  disc(x + 48, y + 48, 35, BLUE);
  g.strokeStyle = RED;
  g.lineWidth = 10;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(x + 22, y + 22);
  g.lineTo(x + 74, y + 74);
  g.stroke();
  // A home zone: a house, a walker and a car on blue.
  [x, y] = at('signYard');
  g.fillStyle = WHITE;
  g.fillRect(x, y, CELL, CELL);
  g.fillStyle = BLUE;
  g.fillRect(x + 4, y + 4, 88, 88);
  poly([[x + 52, y + 44], [x + 70, y + 26], [x + 88, y + 44]], WHITE);
  g.fillStyle = WHITE;
  g.fillRect(x + 57, y + 44, 26, 20);
  walker(x + 26, y + 46, 34, WHITE);
  g.fillRect(x + 18, y + 72, 34, 10);
  disc(x + 26, y + 84, 4, WHITE);
  disc(x + 44, y + 84, 4, WHITE);
  // Keep right.
  [x, y] = at('signKeepRight');
  disc(x + 48, y + 48, 46, WHITE);
  disc(x + 48, y + 48, 42, BLUE);
  g.strokeStyle = WHITE;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(x + 30, y + 28);
  g.lineTo(x + 62, y + 62);
  g.stroke();
  poly([[x + 74, y + 74], [x + 50, y + 68], [x + 68, y + 50]], WHITE);
  // One way.
  [x, y] = at('signOneWay');
  g.fillStyle = WHITE;
  g.fillRect(x, y + 24, CELL, 48);
  g.fillStyle = BLUE;
  g.fillRect(x + 3, y + 27, 90, 42);
  g.fillStyle = WHITE;
  g.fillRect(x + 14, y + 43, 46, 10);
  poly([[x + 84, y + 48], [x + 58, y + 32], [x + 58, y + 64]], WHITE);
  // A dead end.
  [x, y] = at('signDeadEnd');
  g.fillStyle = WHITE;
  g.fillRect(x, y, CELL, CELL);
  g.fillStyle = BLUE;
  g.fillRect(x + 4, y + 4, 88, 88);
  g.fillStyle = WHITE;
  g.fillRect(x + 40, y + 34, 16, 50);
  g.fillStyle = RED;
  g.fillRect(x + 24, y + 18, 48, 16);
  // The backs of signs: bare grey metal with its two clamps.
  const metal = '#8d9094';
  [x, y] = at('backDisc');
  disc(x + 48, y + 48, 46, metal);
  [x, y] = at('backSquare');
  g.fillStyle = metal;
  g.fillRect(x, y, CELL, CELL);
  [x, y] = at('backDiamond');
  poly([[x + 48, y + 2], [x + 94, y + 48], [x + 48, y + 94], [x + 2, y + 48]], metal);
  [x, y] = at('backTriangle');
  poly([[x + 2, y + 8], [x + 94, y + 8], [x + 48, y + 90]], metal);
  [x, y] = at('backOctagon');
  poly(oct.map((q) => [q[0] - CELLS.signStop[0] * CELL + x, q[1] - CELLS.signStop[1] * CELL + y] as [number, number]), metal);
  for (const name of ['backDisc', 'backSquare', 'backDiamond', 'backTriangle', 'backOctagon'] as const) {
    [x, y] = at(name);
    g.fillStyle = '#5c5f63';
    g.fillRect(x + 36, y + 28, 24, 5);
    g.fillRect(x + 36, y + 60, 24, 5);
  }
  // A picket fence: pointed pales on two rails.
  [x, y] = at('picket');
  g.fillStyle = '#d8d6cc';
  g.fillRect(x, y + 30, CELL, 6);
  g.fillRect(x, y + 70, CELL, 6);
  for (let cx = 2; cx < CELL; cx += 12) {
    const k = r.range(0.86, 1);
    g.fillStyle = `rgb(${Math.round(240 * k)},${Math.round(238 * k)},${Math.round(230 * k)})`;
    g.fillRect(x + cx, y + 12, 8, 84);
    poly([[x + cx, y + 12], [x + cx + 4, y + 4], [x + cx + 8, y + 12]], g.fillStyle as string);
  }
  // A welded mesh panel fence: thin wires, a post at the cell's edge.
  [x, y] = at('meshFence');
  g.fillStyle = 'rgba(210,214,210,0.95)';
  for (let cx = 0; cx < CELL; cx += 6) g.fillRect(x + cx, y + 6, 1.4, 90);
  for (let cy = 6; cy < CELL; cy += 18) g.fillRect(x, y + cy, CELL, 1.6);
  g.fillRect(x, y + 4, 4, 92);
  // A railing: uprights between two rails.
  [x, y] = at('railing');
  g.fillStyle = '#d0d0cc';
  g.fillRect(x, y + 4, CELL, 5);
  g.fillRect(x, y + 84, CELL, 4);
  for (let cx = 4; cx < CELL; cx += 12) g.fillRect(x + cx, y + 4, 3, 84);
  // A bicycle stand: a hoop.
  [x, y] = at('bikeStand');
  g.strokeStyle = '#c8cacc';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(x + 14, y + 96);
  g.lineTo(x + 14, y + 30);
  g.quadraticCurveTo(x + 14, y + 8, x + 36, y + 8);
  g.lineTo(x + 60, y + 8);
  g.quadraticCurveTo(x + 82, y + 8, x + 82, y + 30);
  g.lineTo(x + 82, y + 96);
  g.stroke();
  // Tufts of long grass, and reeds.
  [x, y] = at('grass');
  for (let i = 0; i < 130; i++) {
    const bx = x + r.range(2, 94);
    const h = r.range(20, 70);
    const k = r.range(0.6, 1);
    g.strokeStyle = `rgb(${Math.round(230 * k)},${Math.round(240 * k)},${Math.round(200 * k)})`;
    g.lineWidth = r.range(1.2, 2.4);
    g.beginPath();
    g.moveTo(bx, y + 96);
    g.quadraticCurveTo(bx + r.range(-4, 4), y + 96 - h * 0.6, bx + r.range(-12, 12), y + 96 - h);
    g.stroke();
  }
  [x, y] = at('reeds');
  for (let i = 0; i < 60; i++) {
    const bx = x + r.range(3, 93);
    const h = r.range(50, 92);
    const k = r.range(0.6, 1);
    g.strokeStyle = `rgb(${Math.round(235 * k)},${Math.round(225 * k)},${Math.round(180 * k)})`;
    g.lineWidth = r.range(1.2, 2);
    g.beginPath();
    g.moveTo(bx, y + 96);
    g.lineTo(bx + r.range(-6, 6), y + 96 - h);
    g.stroke();
  }
  // Leaves: a clump of small blobs, light above and dark below, ragged at its edge.
  const clump = (name: CellName, n: number, size: [number, number], spread: number, squash = 1) => {
    const [cx0, cy0] = at(name);
    g.save();
    g.beginPath();
    g.rect(cx0, cy0, CELL, CELL);
    g.clip();
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = Math.pow(r(), 0.7) * spread;
      const px = cx0 + 48 + Math.cos(a) * d;
      const py = cy0 + 48 + Math.sin(a) * d * squash;
      const up = 1 - (py - cy0) / CELL;
      const k = Math.min(1, 0.5 + 0.45 * up + r.range(-0.14, 0.14));
      g.fillStyle = `rgb(${Math.round(250 * k)},${Math.round(255 * k)},${Math.round(235 * k)})`;
      g.beginPath();
      g.ellipse(px, py, r.range(size[0], size[1]), r.range(size[0], size[1]) * 0.7, r.range(0, Math.PI), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  clump('leaves', 330, [3, 6.5], 43);
  clump('leaves2', 240, [3.5, 8], 44, 0.8);
  clump('bush', 420, [2.5, 5.5], 46);
  // A birch's leaves hang in strands.
  [x, y] = at('birch');
  for (let s = 0; s < 22; s++) {
    let px = x + r.range(8, 88);
    let py = y + r.range(2, 30);
    const len = r.int(8, 20);
    for (let i = 0; i < len && py < y + 94; i++) {
      const k = Math.min(1, 0.62 + 0.38 * (1 - (py - y) / CELL) + r.range(-0.1, 0.1));
      g.fillStyle = `rgb(${Math.round(250 * k)},${Math.round(255 * k)},${Math.round(230 * k)})`;
      g.beginPath();
      g.ellipse(px, py, r.range(2, 3.6), r.range(1.6, 2.6), r.range(0, 3), 0, Math.PI * 2);
      g.fill();
      px += r.range(-2.4, 2.4);
      py += r.range(2.4, 4.6);
    }
  }
  // A pine's needles: tufts on short twigs.
  [x, y] = at('pine');
  for (let t = 0; t < 34; t++) {
    const px = x + 48 + r.range(-38, 38);
    const py = y + 48 + r.range(-30, 30);
    const k = r.range(0.62, 1);
    g.strokeStyle = `rgb(${Math.round(240 * k)},${Math.round(255 * k)},${Math.round(235 * k)})`;
    g.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const a = r.range(0, Math.PI * 2);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(a) * r.range(5, 10), py + Math.sin(a) * r.range(5, 10));
      g.stroke();
    }
  }
  // A spruce's bough: a fan of needles hanging from its tip (the tip at the top middle).
  [x, y] = at('spruce');
  for (let i = 0; i < 520; i++) {
    const v = Math.pow(r(), 0.6);
    const half = 6 + v * 42;
    const px = x + 48 + r.range(-half, half);
    const py = y + 2 + v * 92 + r.range(-3, 3);
    const edge = Math.abs(px - x - 48) / half;
    if (py > y + 94 || (v > 0.86 && r.chance(edge))) continue;
    const k = Math.min(1, 0.55 + 0.4 * (1 - v) + r.range(-0.12, 0.12));
    g.fillStyle = `rgb(${Math.round(235 * k)},${Math.round(255 * k)},${Math.round(235 * k)})`;
    g.fillRect(px, py, r.range(1.5, 3), r.range(3, 6));
  }
  // Bare twigs: limbs that fork and fork again, for the months without leaves.
  const twigs = (name: CellName, hanging: boolean) => {
    const [tx, ty] = at(name);
    g.save();
    g.beginPath();
    g.rect(tx, ty, CELL, CELL);
    g.clip();
    g.lineCap = 'round';
    const grow = (px: number, py: number, a: number, len: number, wide: number, depth: number) => {
      const ex = px + Math.cos(a) * len;
      const ey = py + Math.sin(a) * len;
      g.strokeStyle = `rgba(245,240,235,${Math.min(1, 0.55 + wide * 0.2)})`;
      g.lineWidth = wide;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(ex, ey);
      g.stroke();
      if (depth <= 0) return;
      const kids = depth > 2 ? 2 : r.int(2, 3);
      for (let i = 0; i < kids; i++) {
        const turn = r.range(0.25, 0.75) * (i % 2 ? 1 : -1) + (hanging && depth < 3 ? 0.5 * Math.sign(Math.cos(a) || 1) : 0);
        grow(ex, ey, a + turn, len * r.range(0.62, 0.8), Math.max(0.9, wide * 0.68), depth - 1);
      }
    };
    for (let i = 0; i < 4; i++) grow(tx + 48 + r.range(-10, 10), ty + 94, -Math.PI / 2 + r.range(-0.7, 0.7), r.range(20, 27), 2.6, 5);
    g.restore();
  };
  twigs('twigs', false);
  twigs('twigs2', false);
  twigs('birchTwigs', true);
  // A thuja's scaly sprays: dense, upright.
  [x, y] = at('thuja');
  for (let i = 0; i < 700; i++) {
    const px = x + r.range(0, 93);
    const py = y + r.range(0, 92);
    const k = Math.min(1, 0.5 + 0.4 * (1 - (py - y) / CELL) + r.range(-0.15, 0.15));
    g.fillStyle = `rgb(${Math.round(235 * k)},${Math.round(255 * k)},${Math.round(225 * k)})`;
    g.fillRect(px, py, r.range(2, 4), r.range(4, 8));
  }
}

/** The painted sheet and its night twin. */
export interface Atlas {
  map: Texture;
  lit: Texture;
}

export function makeAtlas(seed: number): Atlas {
  const [cg, g] = sheet(SIZE, SIZE);
  const [, m] = sheet(SIZE, SIZE);
  // The night sheet at half the size: lights are soft.
  const [cl, l] = sheet(SIZE / 2, SIZE / 2);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, SIZE, SIZE);
  m.fillStyle = '#ffffff';
  m.fillRect(0, 0, SIZE, SIZE);
  l.fillStyle = '#000000';
  l.fillRect(0, 0, SIZE / 2, SIZE / 2);
  l.scale(0.5, 0.5);
  const p: Pen = { g, m, l, r: rand(seed) };
  const painters: Record<FacadeKind, (p: Pen, x: number, y: number) => void> = { plaster, panel, brick, wood, modern, hall };
  for (const kind of FACADE_KINDS) painters[kind](p, BLOCK[kind][0] * CELL, BLOCK[kind][1] * CELL);
  misc(p);
  cutouts(g, rand(seed ^ 0x51ed270b));

  const img = g.getImageData(0, 0, SIZE, SIZE);
  const mask = m.getImageData(0, 0, SIZE, CUT_ROW * CELL).data;
  const data = img.data;
  // Walls: alpha 255 takes the building's colour, 128 keeps the painted one. Cut-outs keep the alpha they were drawn with.
  for (let i = 0; i < mask.length; i += 4) data[i + 3] = 128 + (mask[i] >> 1);
  const map = new DataTexture(new Uint8Array(data.buffer), SIZE, SIZE, RGBAFormat, UnsignedByteType);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = ClampToEdgeWrapping;
  map.wrapT = ClampToEdgeWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 1;
  map.needsUpdate = true;
  cg.width = 0;
  const lit = new CanvasTexture(cl);
  lit.flipY = false;
  lit.colorSpace = SRGBColorSpace;
  lit.wrapS = ClampToEdgeWrapping;
  lit.wrapT = ClampToEdgeWrapping;
  lit.magFilter = LinearFilter;
  lit.minFilter = LinearMipmapLinearFilter;
  return { map, lit };
}
