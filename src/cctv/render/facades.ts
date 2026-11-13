/**
 * House fronts for the camera picture, painted the way Estonian streets look: plastered town houses, panel blocks
 * with their loggias and seams, white and red brick, boarded wooden houses, glass-and-panel offices and the ribbed
 * sheet walls of shops and warehouses. Each kind is three small paintings made at start (no image files): the upper
 * floors (four window bays by four floors, repeated along and up a wall), the same with the lights on, and the ground
 * floor (a door, a window, a shop front, a blank bay).
 *
 * A wall's own colour comes from its vertices: the paintings are near white where the wall is, so they only add the
 * windows, the joints and the dirt.
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { rand, type Rand } from '../math';

export type FacadeKind = 'plaster' | 'panel' | 'brick' | 'wood' | 'modern' | 'hall';

export const FACADE_KINDS: FacadeKind[] = ['plaster', 'panel', 'brick', 'wood', 'modern', 'hall'];

/** Width of one window bay, metres. */
export const BAY_M: Record<FacadeKind, number> = { plaster: 2.9, panel: 3.2, brick: 3.0, wood: 2.7, modern: 3.6, hall: 6 };
/** Height of the ground floor's own painting, metres. */
export const GROUND_M = 3.1;

/** Bays across and floors up in one painting. */
export const CELLS = 4;
const CELL = 96;

export interface Facade {
  wall: Texture;
  lit: Texture;
  ground: Texture;
  groundLit: Texture;
}

type G = CanvasRenderingContext2D;

function sheet(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

/** Weathering: faint darker and lighter patches over a wall. */
function blotches(g: G, r: Rand, w: number, h: number, n: number) {
  for (let i = 0; i < n; i++) {
    const x = r.range(0, w);
    const y = r.range(0, h);
    const rad = r.range(8, 38);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r.chance(0.7);
    grad.addColorStop(0, dark ? 'rgba(60,55,50,0.10)' : 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** Rain streaks under a window sill. */
function streak(g: G, x: number, y: number, w: number) {
  const grad = g.createLinearGradient(0, y, 0, y + 16);
  grad.addColorStop(0, 'rgba(50,48,44,0.16)');
  grad.addColorStop(1, 'rgba(50,48,44,0)');
  g.fillStyle = grad;
  g.fillRect(x, y, w, 16);
}

const WARM = ['#ffd9a0', '#ffe6bd', '#ffcf8a', '#fff0d2', '#cfe0ff', '#ffdcae', '#f4f0e4'];

/** A window: frame, glass that mirrors the sky at its top, glazing bars, perhaps curtains; lit on the night sheet. */
function windowAt(g: G, l: G, r: Rand, x: number, y: number, w: number, h: number, o: { bars?: 'one' | 'cross' | 'three' | 'none'; frame?: string; lightChance?: number } = {}) {
  const frame = o.frame ?? '#e4e3dc';
  g.fillStyle = 'rgba(40,38,34,0.28)';
  g.fillRect(x - 3, y - 4, w + 6, 2);
  g.fillStyle = frame;
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  const glass = g.createLinearGradient(0, y, 0, y + h);
  const dim = r.chance(0.3);
  glass.addColorStop(0, dim ? '#5c6874' : '#7b8b9b');
  glass.addColorStop(0.45, '#465261');
  glass.addColorStop(1, '#2b343f');
  g.fillStyle = glass;
  g.fillRect(x, y, w, h);
  // Curtains or a blind behind the glass.
  if (r.chance(0.4)) {
    g.fillStyle = `rgba(${r.int(190, 235)},${r.int(185, 225)},${r.int(170, 215)},${r.range(0.25, 0.55)})`;
    if (r.chance(0.5)) {
      g.fillRect(x, y, w * r.range(0.18, 0.32), h);
      g.fillRect(x + w * r.range(0.68, 0.82), y, w, h);
    } else g.fillRect(x, y, w, h * r.range(0.25, 0.7));
  }
  g.fillStyle = frame;
  const bars = o.bars ?? 'one';
  if (bars === 'one' || bars === 'cross') g.fillRect(x + Math.round(w / 2) - 1, y, 2, h);
  if (bars === 'cross') g.fillRect(x, y + Math.round(h * 0.36), w, 2);
  if (bars === 'three') {
    g.fillRect(x + Math.round(w / 3) - 1, y, 2, h);
    g.fillRect(x + Math.round((2 * w) / 3) - 1, y, 2, h);
  }
  // The sill and its shadow.
  g.fillStyle = '#eeede8';
  g.fillRect(x - 4, y + h + 2, w + 8, 3);
  g.fillStyle = 'rgba(30,28,26,0.3)';
  g.fillRect(x - 4, y + h + 5, w + 8, 2);
  streak(g, x - 2, y + h + 7, w + 4);
  if (r.chance(o.lightChance ?? 0.3)) {
    l.fillStyle = r.pick(WARM);
    l.globalAlpha = r.range(0.5, 1);
    l.fillRect(x, y, w, h);
    l.globalAlpha = 1;
    l.fillStyle = '#000000';
    if (bars !== 'none') l.fillRect(x + Math.round(w / 2) - 1, y, 2, h);
  }
}

function upper(kind: FacadeKind, seed: number): { wall: HTMLCanvasElement; lit: HTMLCanvasElement } {
  const size = CELLS * CELL;
  const [cw, g] = sheet(size, size);
  const [cl, l] = sheet(size, size);
  const r = rand(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  l.fillStyle = '#000000';
  l.fillRect(0, 0, size, size);

  if (kind === 'brick') {
    // Courses and the joints between bricks.
    g.strokeStyle = 'rgba(70,60,52,0.2)';
    g.lineWidth = 1;
    for (let y = 0; y < size; y += 4) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(size, y + 0.5);
      g.stroke();
      for (let x = (y / 4) % 2 ? 0 : 6; x < size; x += 12) g.fillRect(x, y, 1, 4);
    }
    g.fillStyle = 'rgba(70,60,52,0.2)';
  } else if (kind === 'wood') {
    // Boards laid along the wall.
    for (let y = 0; y < size; y += 6) {
      g.fillStyle = 'rgba(40,32,24,0.26)';
      g.fillRect(0, y, size, 1);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, y + 1, size, 1);
    }
  } else if (kind === 'hall') {
    // Ribbed sheet metal.
    for (let x = 0; x < size; x += 6) {
      g.fillStyle = 'rgba(30,30,34,0.14)';
      g.fillRect(x, 0, 1, size);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(x + 1, 0, 1, size);
    }
  }
  blotches(g, r, size, size, kind === 'hall' || kind === 'modern' ? 8 : 26);

  for (let fy = 0; fy < CELLS; fy++) {
    for (let bx = 0; bx < CELLS; bx++) {
      const x = bx * CELL;
      const y = fy * CELL;
      if (kind === 'panel') {
        // The joints between the wall panels.
        g.fillStyle = 'rgba(40,40,44,0.3)';
        g.fillRect(x, y, CELL, 2);
        g.fillRect(x, y, 2, CELL);
        if (r.chance(0.42)) {
          // A loggia: a dark recess with a railing of panels and a door and window at its back.
          g.fillStyle = '#3a3d42';
          g.fillRect(x + 10, y + 16, CELL - 20, 66);
          windowAt(g, l, r, x + 16, y + 22, 26, 44, { bars: 'none', lightChance: 0.34 });
          windowAt(g, l, r, x + 48, y + 22, 30, 34, { bars: 'one', lightChance: 0.34 });
          g.fillStyle = r.pick(['#b9b4a6', '#8f9aa6', '#a6876a', '#9aa58f', '#c9c2b0']);
          g.fillRect(x + 8, y + 58, CELL - 16, 26);
          g.fillStyle = 'rgba(30,30,32,0.35)';
          g.fillRect(x + 8, y + 84, CELL - 16, 3);
        } else windowAt(g, l, r, x + 18, y + 26, 60, 44, { bars: 'three' });
      } else if (kind === 'plaster') {
        if (r.chance(0.08)) continue;
        // A band between the floors on every other building height.
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x, y + 1, CELL, 2);
        g.fillStyle = 'rgba(40,38,34,0.16)';
        g.fillRect(x, y + 3, CELL, 1);
        windowAt(g, l, r, x + 28, y + 22, 40, 54, { bars: r.chance(0.5) ? 'cross' : 'one' });
      } else if (kind === 'brick') {
        if (r.chance(0.06)) continue;
        // A concrete lintel over the opening.
        g.fillStyle = '#dcdad2';
        g.fillRect(x + 20, y + 20, 56, 5);
        windowAt(g, l, r, x + 24, y + 27, 48, 48, { bars: 'three' });
      } else if (kind === 'wood') {
        if (r.chance(0.12)) continue;
        // Trim boards round a small-paned window.
        g.fillStyle = '#f0efe9';
        g.fillRect(x + 27, y + 21, 42, 58);
        windowAt(g, l, r, x + 31, y + 26, 34, 46, { bars: 'cross', frame: '#f4f3ee' });
      } else if (kind === 'modern') {
        // A ribbon of glass along the floor, panels between.
        const glass = g.createLinearGradient(0, y + 26, 0, y + 74);
        glass.addColorStop(0, '#8496a6');
        glass.addColorStop(0.5, '#4d5a69');
        glass.addColorStop(1, '#333e4a');
        g.fillStyle = glass;
        g.fillRect(x, y + 26, CELL, 48);
        g.fillStyle = '#d9dcdf';
        for (let k = 0; k < 4; k++) g.fillRect(x + k * 24, y + 26, 2, 48);
        g.fillStyle = 'rgba(30,30,34,0.25)';
        g.fillRect(x, y + 74, CELL, 2);
        if (r.chance(0.5)) {
          l.fillStyle = r.pick(['#fff4dc', '#eaf2ff', '#fff0d2']);
          l.globalAlpha = r.range(0.4, 0.9);
          l.fillRect(x + 2, y + 26, CELL - 2, 48);
          l.globalAlpha = 1;
        }
      } else if (fy === 0) {
        // A warehouse: only a band of colour under the eaves.
        g.fillStyle = 'rgba(30,40,70,0.3)';
        g.fillRect(x, y, CELL, 22);
      }
    }
  }
  return { wall: cw, lit: cl };
}

const SHOP_NAMES = ['TOIDUPOOD', 'APTEEK', 'KOHVIK', 'JUUKSUR', 'LILLED', 'PAGAR', 'KING', 'PANDIMAJA', 'OPTIKA', 'RAAMAT', 'KEBAB', 'PIZZA', 'ILUSALONG', 'TÖÖRIISTAD'];
const SIGN_COLOURS = ['#1f4a8a', '#8a1f24', '#1f6a3a', '#2a2a2e', '#b06a12', '#5a2a7a', '#0f5a66'];

function ground(kind: FacadeKind, seed: number): { wall: HTMLCanvasElement; lit: HTMLCanvasElement } {
  const w = CELLS * CELL;
  const h = CELL;
  const [cw, g] = sheet(w, h);
  const [cl, l] = sheet(w, h);
  const r = rand(seed ^ 0x3c6ef372);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  l.fillStyle = '#000000';
  l.fillRect(0, 0, w, h);
  if (kind === 'wood') {
    for (let y = 0; y < h; y += 6) {
      g.fillStyle = 'rgba(40,32,24,0.26)';
      g.fillRect(0, y, w, 1);
    }
  } else if (kind === 'hall') {
    for (let x = 0; x < w; x += 6) {
      g.fillStyle = 'rgba(30,30,34,0.14)';
      g.fillRect(x, 0, 1, h);
    }
  }
  blotches(g, r, w, h, 8);
  // The plinth: the wall's foot is darker, and dirtier near the ground.
  const foot = kind === 'hall' ? 8 : 14;
  g.fillStyle = 'rgba(70,68,64,0.55)';
  g.fillRect(0, h - foot, w, foot);
  const dirt = g.createLinearGradient(0, h - 30, 0, h);
  dirt.addColorStop(0, 'rgba(40,36,30,0)');
  dirt.addColorStop(1, 'rgba(40,36,30,0.3)');
  g.fillStyle = dirt;
  g.fillRect(0, h - 30, w, 30);
  // Four bays: a door, a window, a shop front (or a second window), a blank or a window.
  for (let bx = 0; bx < CELLS; bx++) {
    const x = bx * CELL;
    if (kind === 'hall') {
      if (bx === 0) {
        // A roller door for lorries.
        g.fillStyle = '#9a9da1';
        g.fillRect(x + 14, 16, 68, 80);
        g.fillStyle = 'rgba(30,30,34,0.25)';
        for (let y = 18; y < 96; y += 5) g.fillRect(x + 14, y, 68, 1);
      } else if (bx === 2) {
        const glass = g.createLinearGradient(0, 30, 0, 96);
        glass.addColorStop(0, '#7b8b9b');
        glass.addColorStop(1, '#2b343f');
        g.fillStyle = glass;
        g.fillRect(x + 10, 30, 76, 66);
        g.fillStyle = '#d9dcdf';
        g.fillRect(x + 47, 30, 2, 66);
        l.fillStyle = '#fff4dc';
        l.globalAlpha = 0.7;
        l.fillRect(x + 10, 30, 76, 66);
        l.globalAlpha = 1;
      }
      continue;
    }
    if (bx === 0) {
      // The front door, a pane over it, a step under it.
      g.fillStyle = '#e4e3dc';
      g.fillRect(x + 30, 12, 36, 72);
      g.fillStyle = r.pick(['#4a3528', '#2f3a45', '#5a2a24', '#3a4a3a', '#6a5a48']);
      g.fillRect(x + 33, 26, 30, 58);
      g.fillStyle = '#465261';
      g.fillRect(x + 33, 15, 30, 9);
      g.fillStyle = '#8f8f8a';
      g.fillRect(x + 26, 84, 44, 12);
      l.fillStyle = '#ffe6bd';
      l.globalAlpha = 0.5;
      l.fillRect(x + 33, 15, 30, 9);
      l.globalAlpha = 1;
    } else if (bx === 2 && (kind === 'plaster' || kind === 'brick' || kind === 'modern')) {
      // A shop: a wide pane of glass, a board with its name over it.
      const glass = g.createLinearGradient(0, 30, 0, 82);
      glass.addColorStop(0, '#8496a6');
      glass.addColorStop(0.5, '#3f4b58');
      glass.addColorStop(1, '#27303a');
      g.fillStyle = '#2a2b2e';
      g.fillRect(x + 6, 26, 84, 58);
      g.fillStyle = glass;
      g.fillRect(x + 9, 29, 78, 52);
      g.fillStyle = '#2a2b2e';
      g.fillRect(x + 60, 29, 2, 52);
      const sign = r.pick(SIGN_COLOURS);
      g.fillStyle = sign;
      g.fillRect(x + 6, 8, 84, 16);
      g.fillStyle = '#f4f2ea';
      g.font = '700 11px Arial, Helvetica, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(r.pick(SHOP_NAMES), x + 48, 16.5, 78);
      l.fillStyle = '#fff0d2';
      l.globalAlpha = 0.85;
      l.fillRect(x + 9, 29, 78, 52);
      l.globalAlpha = 0.5;
      l.fillStyle = '#ffffff';
      l.fillRect(x + 6, 8, 84, 16);
      l.globalAlpha = 1;
    } else if (bx === 3 && r.chance(0.35)) {
      // A blank bay with a notice board or a cellar hatch.
      g.fillStyle = 'rgba(60,58,54,0.4)';
      g.fillRect(x + 34, 66, 28, 18);
    } else if (kind === 'wood') windowAt(g, l, r, x + 31, 24, 34, 44, { bars: 'cross', frame: '#f4f3ee' });
    else if (kind === 'panel') windowAt(g, l, r, x + 18, 24, 60, 42, { bars: 'three' });
    else windowAt(g, l, r, x + 28, 20, 40, 50, { bars: 'one' });
  }
  return { wall: cw, lit: cl };
}

/** The paintings of one kind of house front. */
export function makeFacade(kind: FacadeKind, seed: number): Facade {
  const up = upper(kind, seed);
  const gr = ground(kind, seed);
  return { wall: texture(up.wall), lit: texture(up.lit), ground: texture(gr.wall), groundLit: texture(gr.lit) };
}

/** Roofing seen from above: the standing seams of sheet metal, or rows of tiles. */
export function roofTexture(seed: number): Texture {
  const [c, g] = sheet(128, 128);
  const r = rand(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = 'rgba(20,20,22,0.22)';
    g.fillRect(x, 0, 1, 128);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(x + 1, 0, 1, 128);
  }
  blotches(g, r, 128, 128, 10);
  return texture(c);
}

/** The ground's grain: asphalt speckle and patches, paving joints, grass tufts. Tiles every few metres. */
export function groundTexture(kind: 'asphalt' | 'paving' | 'grass', seed: number): Texture {
  const size = 256;
  const [c, g] = sheet(size, size);
  const r = rand(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const grain = kind === 'grass' ? 46 : kind === 'asphalt' ? 30 : 16;
  for (let i = 0; i < size * size; i++) {
    const v = 255 - Math.floor(r() * grain) - (kind === 'grass' && r() < 0.08 ? 40 : 0);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (kind === 'asphalt') {
    // Mended patches, cracks, and the darker tracks tyres polish.
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(0,0,0,${r.range(0.06, 0.16)})`;
      g.fillRect(r.range(0, size), r.range(0, size), r.range(20, 70), r.range(14, 50));
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      let x = r.range(0, size);
      let y = r.range(0, size);
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += r.range(-22, 22);
        y += r.range(-22, 22);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === 'paving') {
    // Slabs and the joints between them.
    g.fillStyle = 'rgba(40,40,40,0.28)';
    for (let y = 0; y < size; y += 16) {
      g.fillRect(0, y, size, 1);
      for (let x = (y / 16) % 2 ? 0 : 16; x < size; x += 32) g.fillRect(x, y, 1, 16);
    }
    blotches(g, r, size, size, 14);
  } else blotches(g, r, size, size, 30);
  return texture(c);
}

/** A soft dark edge: the shade where a wall meets the ground. Dark at one side, clear at the other. */
export function shadeTexture(): Texture {
  const [c, g] = sheet(4, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
