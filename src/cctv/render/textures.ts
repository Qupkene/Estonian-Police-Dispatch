/**
 * The few pictures the camera scene needs, drawn on canvases at start (no image files): a sheet of windows for the
 * house fronts with the same sheet lit for the night, a soft glow for lamps and blue lights, the pool of light of a
 * pair of headlights, and the drops rain leaves on the camera's dome.
 */
import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { rand } from '../math';

/** The window sheet is this many windows across and down. */
export const WINDOW_CELLS = 8;
const CELL = 32;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function sheet(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

/**
 * House fronts: `wall` is white with dark panes (a wall's own colour comes from its vertices), `lit` is black with
 * the windows where a light is on. One cell is one window bay of one floor.
 */
export function windowSheets(seed: number): { wall: Texture; lit: Texture } {
  const n = WINDOW_CELLS;
  const [cw, w] = canvas(n * CELL, n * CELL);
  const [cl, l] = canvas(n * CELL, n * CELL);
  w.fillStyle = '#ffffff';
  w.fillRect(0, 0, cw.width, cw.height);
  l.fillStyle = '#000000';
  l.fillRect(0, 0, cl.width, cl.height);
  const r = rand(seed);
  const warm = ['#ffd9a0', '#ffe6bd', '#ffcf8a', '#fff0d2', '#cfe0ff', '#ffdcae'];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x * CELL;
      const py = y * CELL;
      // A bay without a window now and then (a stairwell's blank wall).
      if (r.chance(0.1)) continue;
      const wide = r.chance(0.3);
      const x0 = px + (wide ? 5 : 8);
      const ww = wide ? 22 : 16;
      const y0 = py + 7;
      const hh = 15;
      w.fillStyle = '#c9cdd0';
      w.fillRect(x0 - 1, y0 - 1, ww + 2, hh + 2);
      w.fillStyle = r.chance(0.3) ? '#5d6670' : '#39434e';
      w.fillRect(x0, y0, ww, hh);
      // The frame's upright.
      w.fillStyle = '#aeb3b7';
      w.fillRect(x0 + Math.floor(ww / 2), y0, 1, hh);
      if (r.chance(0.22)) {
        // A balcony's slab and rail under the window.
        w.fillStyle = '#8d8f90';
        w.fillRect(px + 4, y0 + hh + 1, CELL - 8, 5);
      }
      if (r.chance(0.3)) {
        l.fillStyle = r.pick(warm);
        l.globalAlpha = r.range(0.55, 1);
        l.fillRect(x0, y0, ww, hh);
        l.globalAlpha = 1;
      }
    }
  }
  return { wall: sheet(cw), lit: sheet(cl) };
}

/** A round soft glow, white in the middle. */
export function glowTexture(): Texture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Headlights on the road: bright and narrow at the car (the bottom edge), wide and faint further out. */
export function beamTexture(): Texture {
  const [c, g] = canvas(64, 128);
  g.clearRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y++) {
    // y = 127 is at the car.
    const far = 1 - y / 127;
    const half = 7 + far * 24;
    const a = Math.pow(1 - far, 1.6) * 0.95;
    const grad = g.createLinearGradient(32 - half, 0, 32 + half, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.3, `rgba(255,255,255,${a * 0.8})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.7, `rgba(255,255,255,${a * 0.8})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(32 - half, y, half * 2, 1);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A lamp's pool of light on the ground. */
export function poolTexture(): Texture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Drops on the dome: for each pixel how far the picture behind it is pushed aside (red and green around 0.5) and
 * how much it is blurred (blue). Sampled by the camera's lens pass when it rains.
 */
export function dropsTexture(seed: number, w = 128, h = 72): Texture {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const r = rand(seed);
  const drops = 46;
  for (let k = 0; k < drops; k++) {
    const cx = r.range(0, w);
    const cy = r.range(0, h);
    const rad = r.range(1.6, 5.2);
    // Drops hang a little longer than they are wide.
    const tall = r.range(1.05, 1.5);
    for (let y = Math.floor(cy - rad * tall); y <= cy + rad * tall; y++) {
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dx = (x - cx) / rad;
        const dy = (y - cy) / (rad * tall);
        const d = Math.hypot(dx, dy);
        if (d >= 1) continue;
        const k2 = (1 - d) ** 0.7;
        const i = (y * w + x) * 4;
        // A drop is a little lens: it shows what is on its far side, upside down.
        data[i] = Math.round(128 - dx * 110 * k2);
        data[i + 1] = Math.round(128 - dy * 110 * k2);
        data[i + 2] = Math.round(255 * k2);
      }
    }
  }
  const t = new DataTexture(data, w, h, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
