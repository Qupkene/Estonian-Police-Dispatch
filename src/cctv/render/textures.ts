/**
 * The pictures the camera scene needs besides the painted sheet of house fronts (facades.ts), drawn on canvases at
 * start (no image files): the ground's grain, the sheet of things that lie on the ground, the sky and the far
 * skyline, a soft glow for lamps and blue lights, the pool of light of a pair of headlights, and the drops rain
 * leaves on the camera's dome.
 */
import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { rand, type Rand, type V2 } from '../math';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** A painting that repeats over the ground. */
function tile(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  // Anisotropic filtering costs a phone (and a software renderer) far more than it shows at 640 by 360.
  t.anisotropy = 1;
  return t;
}

/** Grey noise over a whole canvas: every pixel darkened by up to `depth`, a few by `deep` more. */
function grain(g: CanvasRenderingContext2D, size: number, r: Rand, depth: number, deepShare = 0, deep = 0) {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 - r() * depth - (deepShare && r() < deepShare ? deep : 0);
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  }
  g.putImageData(img, 0, 0);
}

/** Soft patches, lighter and darker, that wrap round the edges of a repeating painting. */
function mottle(g: CanvasRenderingContext2D, size: number, r: Rand, n: number, strength: number, radius: [number, number], light = 0.3) {
  for (let i = 0; i < n; i++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const rad = r.range(radius[0], radius[1]);
    const dark = !r.chance(light);
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        if (x + dx + rad < 0 || x + dx - rad > size || y + dy + rad < 0 || y + dy - rad > size) continue;
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        grad.addColorStop(0, dark ? `rgba(0,0,0,${strength})` : `rgba(255,255,255,${strength})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
  }
}

/** How many metres one repeat of a ground painting covers. */
export const GROUND_TILE_M = { asphalt: 9, paving: 6.4, grass: 14, setts: 3.2 } as const;

/**
 * The ground's grain, near white (a surface's own colour comes from its vertices): asphalt with its stones and
 * worn patches, paving blocks with their joints, grass that is not one flat green.
 */
export function groundTexture(kind: 'asphalt' | 'paving' | 'grass' | 'setts', seed: number): Texture {
  const size = 512;
  const [c, g] = canvas(size, size);
  const r = rand(seed);
  g.fillStyle = kind === 'grass' ? '#e6e6e6' : '#f0f0f0';
  g.fillRect(0, 0, size, size);
  if (kind === 'asphalt') {
    // Fine, even grain: big soft blotches read as a drawing from a camera's height across a wide car park.
    mottle(g, size, r, 40, 0.05, [14, 46]);
    grain(g, size, r, 0.24, 0.05, 0.22);
    // Light stones showing where the binder has worn off.
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(255,255,255,${r.range(0.12, 0.4)})`;
      g.fillRect(r.range(0, size), r.range(0, size), 1, 1);
    }
    // Hairline cracks.
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      let x = r.range(40, size - 40);
      let y = r.range(40, size - 40);
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += r.range(-26, 26);
        y += r.range(-26, 26);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === 'paving') {
    // Concrete blocks 10 by 20 cm in a running bond, each a shade of its own, sand in the joints.
    const bw = 32;
    const bh = 16;
    for (let y = 0; y < size; y += bh) {
      const shift = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -shift; x < size; x += bw) {
        const k = r.range(-0.1, 0.07);
        g.fillStyle = k < 0 ? `rgba(0,0,0,${-k})` : `rgba(255,255,255,${k})`;
        g.fillRect(x, y, bw, bh);
        g.fillStyle = 'rgba(30,28,24,0.3)';
        g.fillRect(x, y, 1, bh);
      }
      g.fillStyle = 'rgba(30,28,24,0.3)';
      g.fillRect(0, y, size, 1);
    }
    mottle(g, size, r, 16, 0.07, [30, 90]);
    grain(g, size, r, 0.1);
  } else if (kind === 'setts') {
    // An old town's granite setts, about 12 cm, laid in rows: each stone rounded by wear, lighter on its crown and
    // darker at its edges, every one of its own grey or brown, with dark grit in the joints.
    g.fillStyle = '#5a564f';
    g.fillRect(0, 0, size, size);
    const row = 19;
    for (let y = 0; y < size; y += row) {
      let x = -r.range(0, 14);
      while (x < size) {
        const w = r.range(15, 24);
        const tone = r.range(150, 235);
        const warm = r.range(-12, 14);
        const cx = x + w / 2;
        const cy = y + row / 2;
        for (const dx of [0, x < 0 ? size : x + w > size ? -size : 0]) {
          const grad = g.createRadialGradient(cx + dx - 2, cy - 2, 1, cx + dx, cy, w * 0.62);
          grad.addColorStop(0, `rgb(${tone + warm + 12},${tone + 10},${tone - warm + 6})`);
          grad.addColorStop(0.75, `rgb(${tone + warm - 16},${tone - 18},${tone - warm - 22})`);
          grad.addColorStop(1, `rgba(${tone - 60},${tone - 60},${tone - 64},0.9)`);
          g.fillStyle = grad;
          g.beginPath();
          g.ellipse(cx + dx, cy + r.range(-1, 1), w / 2 - 1.2, row / 2 - 1.4, r.range(-0.12, 0.12), 0, Math.PI * 2);
          g.fill();
        }
        x += w + r.range(1.2, 2.6);
      }
    }
    grain(g, size, r, 0.12);
  } else {
    mottle(g, size, r, 60, 0.13, [16, 70], 0.4);
    grain(g, size, r, 0.3, 0.1, 0.2);
    // Blades and clumps.
    for (let i = 0; i < 2600; i++) {
      const light = r.chance(0.45);
      g.fillStyle = light ? `rgba(255,255,230,${r.range(0.1, 0.3)})` : `rgba(0,20,0,${r.range(0.1, 0.32)})`;
      g.fillRect(r.range(0, size), r.range(0, size), r.range(1, 2.5), r.range(2, 5));
    }
  }
  return tile(c);
}

/** The cells of the ground decal sheet (four across, four down). */
export const DECALS = {
  /** Dark at its top edge, clear at its bottom: the shade where a wall meets the ground. */
  shade: [0, 0],
  /** A soft round shade: under a parked car, round a tree's foot. */
  blob: [1, 0],
  manhole: [2, 0],
  gully: [3, 0],
  /** A mended patch of road. */
  patch: [0, 1],
  /** A crack sealed with bitumen. */
  seam: [1, 1],
  puddle: [2, 1],
  /** A band soft at both edges: the track tyres polish, or leave in snow. */
  track: [3, 1],
  /** Fallen leaves. */
  litter: [0, 2],
  /** Bare earth where grass is worn away. */
  earth: [1, 2],
  stain: [2, 2],
  cracks: [3, 2],
  /** Paint worn by wheels: mostly there, with holes. */
  paint: [0, 3],
  slush: [1, 3],
  cover: [2, 3],
  solid: [3, 3],
} as const satisfies Record<string, readonly [number, number]>;

export type DecalName = keyof typeof DECALS;

const DECAL_CELL = 64;

/** Painting coordinates of a decal's corners: bottom left, bottom right, top right, top left. */
export function decalUV(name: DecalName): [V2, V2, V2, V2] {
  const [col, row] = DECALS[name];
  const inset = 1 / (DECAL_CELL * 4);
  const l = col / 4 + inset;
  const rt = (col + 1) / 4 - inset;
  const top = 1 - row / 4 - inset;
  const bottom = 1 - (row + 1) / 4 + inset;
  return [[l, bottom], [rt, bottom], [rt, top], [l, top]];
}

/** Things lying on the ground, painted with soft edges: shades, covers, patches, puddles, tracks, leaves. */
export function decalTexture(seed: number): Texture {
  const n = DECAL_CELL;
  const [c, g] = canvas(n * 4, n * 4);
  const r = rand(seed);
  const at = (name: DecalName): [number, number] => [DECALS[name][0] * n, DECALS[name][1] * n];
  const radial = (x: number, y: number, rad: number, stops: [number, string][]) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  /** A ragged shape: many soft dabs inside a cell, kept off its edges. */
  const dabs = (x0: number, y0: number, count: number, size: [number, number], colour: (k: number) => string, spread = 22) => {
    g.save();
    g.beginPath();
    g.rect(x0 + 1, y0 + 1, n - 2, n - 2);
    g.clip();
    for (let i = 0; i < count; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = Math.pow(r(), 0.8) * spread;
      const rad = r.range(size[0], size[1]);
      const x = x0 + n / 2 + Math.cos(a) * d;
      const y = y0 + n / 2 + Math.sin(a) * d * 0.8;
      radial(x, y, rad, [[0, colour(r())], [0.6, colour(r())], [1, 'rgba(0,0,0,0)']]);
    }
    g.restore();
  };
  let [x, y] = at('shade');
  let grad = g.createLinearGradient(0, y, 0, y + n);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(x, y, n, n);
  [x, y] = at('blob');
  radial(x + n / 2, y + n / 2, n / 2 - 1, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
  // A cast-iron cover in its concrete collar.
  for (const name of ['manhole', 'cover'] as const) {
    [x, y] = at(name);
    g.fillStyle = name === 'manhole' ? '#77756e' : 'rgba(0,0,0,0)';
    g.beginPath();
    g.arc(x + 32, y + 32, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f2e2c';
    g.beginPath();
    g.arc(x + 32, y + 32, 24, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#55524c';
    g.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      g.beginPath();
      g.moveTo(x + 32 - Math.cos(a) * 20, y + 32 - Math.sin(a) * 20);
      g.lineTo(x + 32 + Math.cos(a) * 20, y + 32 + Math.sin(a) * 20);
      g.stroke();
    }
    g.beginPath();
    g.arc(x + 32, y + 32, 12, 0, Math.PI * 2);
    g.stroke();
  }
  // A gully's grate at the kerb.
  [x, y] = at('gully');
  g.fillStyle = '#4a4844';
  g.fillRect(x + 8, y + 16, 48, 32);
  g.fillStyle = '#141414';
  for (let k = 0; k < 6; k++) g.fillRect(x + 12 + k * 7.4, y + 20, 4, 24);
  // A mended patch: a darker rectangle with a soft, slightly ragged edge.
  [x, y] = at('patch');
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(x + 6, y + 8, 52, 48);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${r.range(0.3, 0.8)})`;
    const side = r.int(0, 3);
    const t = r.range(6, 54);
    if (side === 0) g.fillRect(x + t, y + 6, 3, 3);
    else if (side === 1) g.fillRect(x + t, y + 55, 3, 3);
    else if (side === 2) g.fillRect(x + 4, y + t, 3, 3);
    else g.fillRect(x + 57, y + t, 3, 3);
  }
  // A sealed crack: a wandering dark line.
  for (const name of ['seam', 'cracks'] as const) {
    [x, y] = at(name);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineCap = 'round';
    const lines = name === 'seam' ? 1 : 5;
    for (let i = 0; i < lines; i++) {
      g.lineWidth = name === 'seam' ? 3 : 1.4;
      g.beginPath();
      let px = x + (name === 'seam' ? 3 : r.range(8, 56));
      let py = y + (name === 'seam' ? 32 : r.range(8, 56));
      g.moveTo(px, py);
      for (let k = 0; k < 8; k++) {
        px = Math.min(x + n - 3, Math.max(x + 3, px + (name === 'seam' ? 7.4 : r.range(-12, 12))));
        py = Math.min(y + n - 3, Math.max(y + 3, py + r.range(-6, 6)));
        g.lineTo(px, py);
      }
      g.stroke();
    }
  }
  [x, y] = at('puddle');
  // A puddle: one soft sheet of water with a wandering edge, clearest in its middle (no hard lobes).
  radial(x + n / 2, y + n / 2, n * 0.42, [[0, 'rgba(255,255,255,0.7)'], [0.55, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
  dabs(x, y, 40, [4, 9], () => `rgba(255,255,255,${r.range(0.08, 0.22)})`, 20);
  // A track: clear at both edges, patchy along its length.
  [x, y] = at('track');
  grad = g.createLinearGradient(0, y, 0, y + n);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(x, y, n, n);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(0,0,0,${r.range(0.1, 0.4)})`;
    g.fillRect(x + r.range(0, n - 8), y + r.range(0, n), r.range(4, 14), r.range(2, 5));
  }
  g.globalCompositeOperation = 'source-over';
  // Fallen leaves: specks of yellow and brown.
  [x, y] = at('litter');
  for (let i = 0; i < 150; i++) {
    const a = r.range(0, Math.PI * 2);
    const d = Math.pow(r(), 0.6) * 28;
    g.fillStyle = r.pick(['#c9a02e', '#b5722a', '#d8b63a', '#8a5a26', '#a8862e']);
    g.beginPath();
    g.ellipse(x + 32 + Math.cos(a) * d, y + 32 + Math.sin(a) * d, r.range(1, 2.4), r.range(0.8, 1.6), r.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  [x, y] = at('earth');
  dabs(x, y, 26, [5, 11], (k) => `rgba(${Math.round(150 + k * 40)},${Math.round(132 + k * 34)},${Math.round(100 + k * 30)},0.8)`);
  [x, y] = at('stain');
  dabs(x, y, 10, [5, 12], () => 'rgba(255,255,255,0.75)', 12);
  // Paint that wheels have worn: holes scratched out of a full cell.
  [x, y] = at('paint');
  g.fillStyle = 'rgba(255,255,255,1)';
  g.fillRect(x, y, n, n);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(0,0,0,${r.range(0.2, 0.8)})`;
    g.fillRect(x + r.range(0, n - 5), y + r.range(0, n - 3), r.range(2, 9), r.range(1, 4));
  }
  g.globalCompositeOperation = 'source-over';
  // Slush and old snow: grey-white dabs.
  [x, y] = at('slush');
  dabs(x, y, 30, [5, 11], (k) => `rgba(${Math.round(205 + k * 40)},${Math.round(210 + k * 38)},${Math.round(216 + k * 36)},0.9)`);
  [x, y] = at('solid');
  g.fillStyle = '#ffffff';
  g.fillRect(x, y, n, n);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

/** What the sky painting is made from. */
export interface SkyLook {
  zenith: string;
  horizon: string;
  /** Cloud cover 0..1 and the colours of a cloud's lit top and its underside. */
  cover: number;
  cloudLight: string;
  cloudDark: string;
  /** Where the sun stands along the horizon (0..1 across the painting) and how strongly it warms the sky there (0 by day). */
  sunU: number;
  sunGlow: number;
  sunColour: string;
  stars: number;
}

/**
 * The sky as a painting wrapped round the scene: all the way round across, from the horizon (bottom) to the zenith
 * (top). Paler towards the horizon, clouds that crowd and flatten towards it, the low sun's glow, a few stars.
 */
export function skyTexture(look: SkyLook, seed: number, into?: CanvasTexture): CanvasTexture {
  const w = 1024;
  const h = 256;
  const c = into ? (into.image as HTMLCanvasElement) : canvas(w, h)[0];
  const g = c.getContext('2d')!;
  const r = rand(seed);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, look.zenith);
  grad.addColorStop(0.55, look.zenith);
  grad.addColorStop(1, look.horizon);
  g.globalAlpha = 1;
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  if (look.stars > 0) {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${r.range(0.2, 0.9) * look.stars})`;
      g.fillRect(r.range(0, w), r.range(0, h * 0.8), 1, 1);
    }
  }
  if (look.sunGlow > 0) {
    for (const dx of [-w, 0, w]) {
      const x = look.sunU * w + dx;
      const glowGrad = g.createRadialGradient(x, h, 0, x, h, 300);
      glowGrad.addColorStop(0, look.sunColour);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = look.sunGlow;
      g.fillStyle = glowGrad;
      g.save();
      g.translate(0, h);
      g.scale(1, 0.45);
      g.translate(0, -h);
      g.fillRect(x - 300, h - 300, 600, 300);
      g.restore();
    }
    g.globalAlpha = 1;
  }
  if (look.cover > 0.02) {
    // Clouds: heaps of soft dabs, wide and thin near the horizon where one looks along the cloud deck.
    const heaps = Math.round(10 + look.cover * 70);
    for (let i = 0; i < heaps; i++) {
      const v = Math.pow(r(), 0.75);
      const cy = h * (0.1 + 0.88 * v);
      const cx = r.range(0, w);
      const flat = 1 - 0.75 * v;
      const span = r.range(40, 120) * (0.6 + look.cover);
      const dabsN = r.int(7, 14);
      for (let k = 0; k < dabsN; k++) {
        const px = cx + r.range(-span, span);
        const py = cy + r.range(-10, 10) * flat;
        const rad = r.range(16, 44) * (0.7 + look.cover * 0.6);
        for (const dx of [-w, 0, w]) {
          if (px + dx + rad < 0 || px + dx - rad > w) continue;
          g.save();
          g.translate(px + dx, py);
          g.scale(1, 0.32 + 0.4 * flat);
          const top = g.createRadialGradient(0, -rad * 0.2, 0, 0, 0, rad);
          top.addColorStop(0, look.cloudLight);
          top.addColorStop(0.5, look.cloudDark);
          top.addColorStop(1, 'rgba(0,0,0,0)');
          g.globalAlpha = 0.2 + 0.5 * look.cover;
          g.fillStyle = top;
          g.fillRect(-rad, -rad, rad * 2, rad * 2);
          g.restore();
        }
      }
    }
    g.globalAlpha = 1;
    if (look.cover > 0.75) {
      // A full deck: grey all over, darker in bands.
      g.globalAlpha = (look.cover - 0.75) * 3;
      g.fillStyle = look.cloudDark;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
      for (let i = 0; i < 40; i++) {
        const cy = r.range(0, h);
        const px = r.range(0, w);
        const rad = r.range(50, 140);
        for (const dx of [-w, 0, w]) {
          g.save();
          g.translate(px + dx, cy);
          g.scale(1, 0.25);
          const band = g.createRadialGradient(0, 0, 0, 0, 0, rad);
          band.addColorStop(0, r.chance(0.5) ? look.cloudLight : look.cloudDark);
          band.addColorStop(1, 'rgba(0,0,0,0)');
          g.globalAlpha = 0.3;
          g.fillStyle = band;
          g.fillRect(-rad, -rad, rad * 2, rad * 2);
          g.restore();
        }
      }
      g.globalAlpha = 1;
    }
  }
  // The haze that hides the foot of the sky.
  const haze = g.createLinearGradient(0, h * 0.86, 0, h);
  haze.addColorStop(0, 'rgba(0,0,0,0)');
  haze.addColorStop(1, look.horizon);
  g.fillStyle = haze;
  g.fillRect(0, h * 0.86, w, h * 0.14);
  if (into) {
    into.needsUpdate = true;
    return into;
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/**
 * What stands beyond the edge of the map's data, as one long strip of silhouettes: in `town` blocks of flats, roofs
 * and chimneys with trees between them, else a line of forest. White with a little shading, so that the hour and
 * the haze can colour it.
 */
export function skylineTexture(town: boolean, seed: number): Texture {
  const w = 1024;
  const h = 128;
  const [c, g] = canvas(w, h);
  const r = rand(seed);
  g.clearRect(0, 0, w, h);
  const trees = (base: number, lo: number, hi: number, spruce: number, tone: number) => {
    let x = 0;
    while (x < w) {
      const tw = r.range(6, 15);
      const th = r.range(lo, hi);
      const k = tone * r.range(0.82, 1);
      g.fillStyle = `rgb(${Math.round(200 * k)},${Math.round(215 * k)},${Math.round(200 * k)})`;
      g.beginPath();
      if (r.chance(spruce)) {
        g.moveTo(x, base);
        g.lineTo(x + tw / 2, base - th * 1.25);
        g.lineTo(x + tw, base);
      } else g.ellipse(x + tw / 2, base - th * 0.5, tw * 0.75, th * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      x += tw * r.range(0.45, 0.9);
    }
    g.fillStyle = `rgb(${Math.round(200 * tone * 0.85)},${Math.round(215 * tone * 0.85)},${Math.round(200 * tone * 0.85)})`;
    g.fillRect(0, base - 3, w, h - base + 3);
  };
  if (town) {
    // A far row of blocks, a nearer row of roofs, trees in front.
    let x = r.range(0, 40);
    while (x < w) {
      const bw = r.range(26, 80);
      const bh = r.chance(0.2) ? r.range(60, 96) : r.range(26, 58);
      const k = r.range(0.72, 0.95);
      g.fillStyle = `rgb(${Math.round(225 * k)},${Math.round(225 * k)},${Math.round(230 * k)})`;
      g.fillRect(x, h - 18 - bh, bw, bh + 18);
      g.fillStyle = 'rgba(40,50,70,0.3)';
      for (let wy = h - 18 - bh + 4; wy < h - 24; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (r.chance(0.8)) g.fillRect(wx, wy, 2.4, 3);
      if (r.chance(0.3)) {
        g.fillStyle = `rgb(${Math.round(225 * k)},${Math.round(225 * k)},${Math.round(230 * k)})`;
        g.fillRect(x + bw * r.range(0.2, 0.7), h - 18 - bh - r.range(4, 9), r.range(4, 10), 10);
      }
      x += bw + r.range(-6, 46);
    }
    trees(h - 8, 10, 26, 0.12, 0.6);
  } else {
    trees(h - 22, 26, 50, 0.62, 0.62);
    trees(h - 8, 16, 34, 0.45, 0.5);
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
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

/**
 * A round falloff written as numbers, not painted with a canvas gradient: white with only the alpha falling, so it
 * keeps its smoothness at the low alphas where a premultiplied 8-bit gradient breaks into rings. `fall(d)` gives the
 * alpha at distance d (0 centre, 1 edge).
 */
function radialTexture(size: number, fall: (d: number) => number): Texture {
  const data = new Uint8Array(size * size * 4);
  const h = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - h, y + 0.5 - h) / h);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, fall(d))));
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** A lamp's pool of light on the ground: bright under the lamp, fading smoothly to nothing. */
export function poolTexture(): Texture {
  return radialTexture(256, (d) => 0.9 * Math.exp(-3.2 * d * d) * (1 - d * d) ** 1.5);
}

/** A soft glare round a light (a lamp's head seen through haze, light spilt from a door): a hot core in a wide halo. */
export function glareTexture(): Texture {
  return radialTexture(256, (d) => (0.65 * Math.exp(-30 * d * d) + 0.35 * Math.exp(-5 * d * d)) * (1 - d * d) ** 2);
}

/**
 * Drops on the dome: for each pixel how far the picture behind it is pushed aside (red and green around 0.5) and
 * how much it is blurred (blue). Sampled by the camera's lens pass when it rains.
 */
export function dropsTexture(seed: number, w = 320, h = 180): Texture {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const r = rand(seed);
  // A wiped dome in the rain holds a dozen small drops, most towards the rim where the wiper and the wind leave them.
  const drops = 12 + Math.floor(r.range(0, 4));
  for (let k = 0; k < drops; k++) {
    let cx = r.range(0, w);
    let cy = r.range(0, h);
    for (let tries = 0; tries < 4 && Math.hypot((cx / w - 0.5) * 1.6, cy / h - 0.5) < 0.42; tries++) {
      cx = r.range(0, w);
      cy = r.range(0, h);
    }
    const rad = r.range(1.2, 3.8) * (w / 320);
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
