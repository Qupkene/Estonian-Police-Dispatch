/**
 * The body of a car, drawn the way a car is shaped: a row of cross-sections from tail to nose (sill, door, belt
 * line, glass leaning in, roof) joined into one smooth skin, with the bonnet, the screens and the pillars where a
 * real car of that kind has them. Wheels in their arches, mirrors, grille, number plates and door lines are added
 * on top. Sizes are those of the cars on Estonian roads (a Škoda Octavia estate, a VW Transporter).
 *
 * A car is drawn about its own origin: x forwards, y up, z to its right, the wheels on the ground.
 */
import type { Color } from 'three';
import { clamp, lerp, type V2 } from '../math';
import type { CarBody, CarLook } from '../vehicle';
import { shade, type MeshBuilder, type P3, type Xf } from './mesh';

export interface Shape {
  L: number;
  W: number;
  H: number;
  wheel: number;
  /** Front and rear axle. */
  xf: number;
  xr: number;
  /** Along the car, front positive: where the bonnet's top begins, the foot and the top of the windscreen, the top and the foot of the rear screen. */
  xHood: number;
  xCowl: number;
  xRoofF: number;
  xRoofR: number;
  xDeck: number;
  yFloor: number;
  /** Heights: the front edge, the bonnet where it begins, the belt line at the windscreen and at the back, the boot lid and the tail's top. */
  yNose: number;
  yHood: number;
  yCowl: number;
  yBeltR: number;
  yDeck: number;
  yTail: number;
  /** Side glass reaches back to here. */
  glassTo: number;
  /** Pillars between the side windows (their middles). */
  pillars: number[];
  /** The roof's half-width as a share of the body's. */
  tumble: number;
  /** Unpainted plastic along the bottom (an SUV). */
  cladding: boolean;
  /** No glass in the rear screen (a panel van). */
  blind: boolean;
}

const SHAPES: Record<Exclude<CarBody, 'truck' | 'bus' | 'moto'>, Shape> = {
  estate: { L: 4.69, W: 1.83, H: 1.47, wheel: 0.32, xf: 1.425, xr: -1.265, xHood: 2.2, xCowl: 1.15, xRoofF: 0.42, xRoofR: -1.78, xDeck: -2.2, yFloor: 0.19, yNose: 0.75, yHood: 0.85, yCowl: 0.99, yBeltR: 1.0, yDeck: 1.02, yTail: 0.96, glassTo: -2.02, pillars: [0, -0.98], tumble: 0.8, cladding: false, blind: false },
  sedan: { L: 4.87, W: 1.86, H: 1.46, wheel: 0.32, xf: 1.5, xr: -1.34, xHood: 2.29, xCowl: 1.2, xRoofF: 0.45, xRoofR: -0.98, xDeck: -1.78, yFloor: 0.19, yNose: 0.75, yHood: 0.85, yCowl: 0.99, yBeltR: 1.0, yDeck: 1.05, yTail: 0.97, glassTo: -1.22, pillars: [0.02], tumble: 0.79, cladding: false, blind: false },
  hatch: { L: 4.3, W: 1.79, H: 1.47, wheel: 0.31, xf: 1.3, xr: -1.35, xHood: 2.02, xCowl: 1.0, xRoofF: 0.3, xRoofR: -1.32, xDeck: -1.96, yFloor: 0.19, yNose: 0.76, yHood: 0.86, yCowl: 1.0, yBeltR: 1.01, yDeck: 1.02, yTail: 0.96, glassTo: -1.48, pillars: [-0.06], tumble: 0.8, cladding: false, blind: false },
  suv: { L: 4.7, W: 1.88, H: 1.68, wheel: 0.36, xf: 1.42, xr: -1.37, xHood: 2.2, xCowl: 1.15, xRoofF: 0.5, xRoofR: -1.8, xDeck: -2.2, yFloor: 0.24, yNose: 0.92, yHood: 1.03, yCowl: 1.14, yBeltR: 1.16, yDeck: 1.17, yTail: 1.1, glassTo: -1.98, pillars: [0.05, -0.96], tumble: 0.81, cladding: true, blind: false },
  van: { L: 4.9, W: 1.9, H: 1.97, wheel: 0.34, xf: 1.55, xr: -1.45, xHood: 2.36, xCowl: 1.83, xRoofF: 1.22, xRoofR: -2.3, xDeck: -2.42, yFloor: 0.2, yNose: 0.9, yHood: 1.0, yCowl: 1.18, yBeltR: 1.2, yDeck: 1.2, yTail: 1.16, glassTo: 0.62, pillars: [], tumble: 0.9, cladding: false, blind: true },
  pickup: { L: 5.25, W: 1.95, H: 1.82, wheel: 0.38, xf: 1.7, xr: -1.4, xHood: 2.5, xCowl: 1.4, xRoofF: 0.8, xRoofR: -0.38, xDeck: -0.62, yFloor: 0.26, yNose: 0.93, yHood: 1.03, yCowl: 1.2, yBeltR: 1.22, yDeck: 1.16, yTail: 1.14, glassTo: -0.5, pillars: [0.22], tumble: 0.82, cladding: true, blind: false },
};

/** The shape of a body kind; the ambulance is a longer, taller van. */
export function shapeOf(look: CarLook): Shape {
  const body = look.body === 'truck' || look.body === 'bus' || look.body === 'moto' ? 'van' : look.body;
  const s = SHAPES[body];
  if (look.livery !== 'ambulance') return s;
  return { ...s, L: 5.9, W: 2.02, H: 2.55, xf: 2.05, xr: -1.75, xHood: 2.86, xCowl: 2.32, xRoofF: 1.62, xRoofR: -2.8, xDeck: -2.92, yNose: 0.95, yHood: 1.06, yCowl: 1.3, yBeltR: 1.32, yDeck: 1.32, yTail: 1.26, glassTo: 1.05, wheel: 0.36 };
}

const GLASS = 0x34404c;
const DARK = 0x18191c;
const RING = 10;

interface Lines {
  top: (x: number) => number;
  belt: (x: number) => number;
  half: (x: number) => number;
  floor: (x: number) => number;
}

function lines(s: Shape): Lines {
  const nose = s.L / 2;
  const tail = -s.L / 2;
  const top = (x: number): number => {
    if (x >= s.xHood) {
      // The nose rounds down from the bonnet to the front edge.
      const t = clamp((x - s.xHood) / (nose - s.xHood), 0, 1);
      return s.yNose + (s.yHood - s.yNose) * Math.sqrt(1 - t * t);
    }
    if (x >= s.xCowl) return lerp(s.yCowl, s.yHood, Math.pow((x - s.xCowl) / (s.xHood - s.xCowl), 1.5));
    if (x >= s.xRoofF) return lerp(s.H, s.yCowl, Math.pow((x - s.xRoofF) / (s.xCowl - s.xRoofF), 1.12));
    if (x >= s.xRoofR) {
      const t = (x - s.xRoofR) / (s.xRoofF - s.xRoofR);
      return s.H - 0.035 * (2 * t - 1) ** 2;
    }
    if (x >= s.xDeck) return lerp(s.yDeck, s.H - 0.035, Math.pow((x - s.xDeck) / (s.xRoofR - s.xDeck), 0.9));
    return lerp(s.yTail, s.yDeck, clamp((x - tail) / Math.max(0.01, s.xDeck - tail), 0, 1));
  };
  const belt = (x: number): number => {
    if (x > s.xCowl || x < s.xDeck) return top(x);
    return Math.min(top(x), lerp(s.yBeltR, s.yCowl, (x - s.xDeck) / (s.xCowl - s.xDeck)));
  };
  const half = (x: number): number => {
    const w = s.W / 2;
    const dn = nose - x;
    const dt = x - tail;
    let k = 1;
    if (dn < 0.8) k -= 0.17 * (1 - dn / 0.8) ** 2.4;
    if (dt < 0.7) k -= 0.12 * (1 - dt / 0.7) ** 2.4;
    return w * k;
  };
  const floor = (x: number): number => {
    const d = Math.min(nose - x, x - tail);
    return s.yFloor + (d < 0.6 ? 0.1 * (1 - d / 0.6) ** 2 : 0);
  };
  return { top, belt, half, floor };
}

/** One cross-section's right half, from the middle of the floor up and over to the middle of the roof: [z, y]. */
function ring(s: Shape, l: Lines, x: number): V2[] {
  const w = l.half(x);
  const f = l.floor(x);
  const b = l.belt(x);
  const t = l.top(x);
  const cabin = t > b + 0.06;
  const base: V2[] = [
    [0, f],
    [w * 0.78, f],
    [w - 0.03, f + 0.06],
    [w, f + 0.17],
    [w, f + 0.5 * (b - f)],
    [w - 0.012, b - 0.05],
    [w - 0.035, b],
  ];
  if (cabin) {
    const wr = w * s.tumble;
    base.push([wr + 0.02, t - 0.06], [wr - 0.05, t - 0.012], [0, t + 0.012]);
  } else base.push([w - 0.13, b + 0.014], [w * 0.45, b + 0.03], [0, b + 0.036]);
  return base;
}

export interface CarSpots {
  head: P3[];
  tail: P3[];
  bar: P3;
  barWidth: number;
  /** Half the body's width, the nose and the tail (for decals and lamps). */
  half: number;
  nose: number;
  tail2: number;
  belt: number;
  floor: number;
  yNose: number;
}

export interface CarBuilders {
  /** Painted metal and plastic. */
  paint: MeshBuilder;
  /** Glass, tyres and everything dark and glossy. */
  glass: MeshBuilder;
}

const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function disc(cx: number, cy: number, r: number, n: number, from = 0, to = Math.PI * 2): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    if (i === n && to - from >= Math.PI * 2 - 1e-6) break;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Draw a car's body with everything fixed to it. Returns where its lamps and its light bar go. */
export function drawBody(mb: CarBuilders, look: CarLook, f?: Xf): CarSpots {
  const s = shapeOf(look);
  const l = lines(s);
  const nose = s.L / 2;
  const tail = -s.L / 2;
  const paint = shade(look.color);
  const paintLow = shade(look.color, 0.86);
  const glass = shade(GLASS);
  const dark = shade(DARK);
  const trim = shade(0x232427);

  // Stations along the car: closer together where the shape turns, and one pair for each pillar.
  const xs = new Set<number>();
  const add = (...v: number[]) => v.forEach((x) => xs.add(Math.round(clamp(x, tail, nose) * 1000) / 1000));
  add(tail, tail + 0.05, tail + 0.22, tail + 0.5, s.xDeck - 0.03, s.xDeck + 0.03, (s.xDeck + s.xRoofR) / 2, s.xRoofR - 0.02, s.xRoofR + 0.05);
  add((s.xRoofR + s.xRoofF) / 2, s.xRoofF - 0.05, s.xRoofF + 0.02, lerp(s.xRoofF, s.xCowl, 0.35), lerp(s.xRoofF, s.xCowl, 0.7), s.xCowl - 0.03, s.xCowl + 0.03);
  add(lerp(s.xCowl, s.xHood, 0.5), s.xHood, lerp(s.xHood, nose, 0.5), nose - 0.04, nose);
  add(s.glassTo - 0.01, s.glassTo + 0.01, s.xr, s.xf);
  for (const p of s.pillars) add(p - 0.05, p + 0.05);
  const stations = [...xs].sort((a, b) => a - b);
  const rings = stations.map((x) => ring(s, l, x));

  // A normal at every point of the skin, from its neighbours along and around the body.
  const at3 = (i: number, j: number, side: number): P3 => [stations[i], rings[i][j][1], rings[i][j][0] * side];
  const normalAt = (i: number, j: number, side: number): P3 => {
    const a = at3(Math.max(0, i - 1), j, side);
    const b = at3(Math.min(stations.length - 1, i + 1), j, side);
    const c = at3(i, Math.max(0, j - 1), side);
    const d = at3(i, Math.min(RING - 1, j + 1), side);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - c[0];
    const vy = d[1] - c[1];
    const vz = d[2] - c[2];
    // Along the car, then up round the right side: their cross points out of the body on the right, into it on the left.
    const nx = (uy * vz - uz * vy) * side;
    const ny = (uz * vx - ux * vz) * side;
    const nz = (ux * vy - uy * vx) * side;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };
  const inPillar = (x: number) => s.pillars.some((p) => Math.abs(x - p) < 0.05);
  for (let i = 0; i < stations.length - 1; i++) {
    const x = (stations[i] + stations[i + 1]) / 2;
    const cabin = l.top(x) > l.belt(x) + 0.06;
    for (let j = 0; j < RING - 1; j++) {
      let color: Color = paint;
      let into = mb.paint;
      if (j <= 1) color = dark;
      else if (j === 2) color = s.cladding ? trim : paintLow;
      else if (j === 3 && s.cladding) color = x > s.xf - 0.5 || x < s.xr + 0.5 ? trim : paint;
      else if (j === 6 && cabin && x > s.glassTo && x < s.xCowl - 0.02 && !inPillar(x)) {
        color = glass;
        into = mb.glass;
      } else if (j === 8 && cabin) {
        const screen = x > s.xRoofF + 0.02 && x < s.xCowl - 0.03;
        const rear = !s.blind && x > s.xDeck + 0.03 && x < s.xRoofR - 0.02;
        if (screen || rear) {
          color = glass;
          into = mb.glass;
        }
      }
      for (const side of [1, -1]) {
        into.smoothQuad(
          [at3(i, j, side), at3(i + 1, j, side), at3(i + 1, j + 1, side), at3(i, j + 1, side)],
          [normalAt(i, j, side), normalAt(i + 1, j, side), normalAt(i + 1, j + 1, side), normalAt(i, j + 1, side)],
          color,
          f,
        );
      }
    }
  }
  // The nose and the tail are closed flat.
  for (const end of [0, stations.length - 1]) {
    const x = stations[end];
    const r = rings[end];
    const mid: P3 = [x, (r[0][1] + r[RING - 1][1]) / 2, 0];
    for (let j = 0; j < RING - 1; j++) {
      const c = j <= 2 ? dark : paint;
      for (const side of [1, -1]) {
        const a: P3 = [x, r[j][1], r[j][0] * side];
        const b: P3 = [x, r[j + 1][1], r[j + 1][0] * side];
        // Wound so that the face looks out of the car.
        const nx = (a[1] - mid[1]) * (b[2] - mid[2]) - (a[2] - mid[2]) * (b[1] - mid[1]);
        if (nx > 0 === end > 0) mb.paint.triAt(mid, a, b, c, f);
        else mb.paint.triAt(mid, b, a, c, f);
      }
    }
  }

  const w0 = s.W / 2;
  const fl = s.yFloor;
  // Grille, the air intake under it and the number plates.
  const front = nose + 0.006;
  const back = tail - 0.006;
  const plate = shade(0xe8e8e2);
  const face = (x: number, z0: number, z1: number, y0: number, y1: number, c: Color, into: MeshBuilder) =>
    into.quadAt([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], c, [x > 0 ? 1 : -1, 0, 0], f);
  face(front, -0.45, 0.45, fl + 0.36, s.yNose - 0.07, dark, mb.glass);
  face(front, -0.62, 0.62, fl + 0.12, fl + 0.28, dark, mb.glass);
  face(front + 0.004, -0.26, 0.26, fl + 0.3, fl + 0.41, plate, mb.paint);
  face(back, -0.26, 0.26, s.yTail - 0.4, s.yTail - 0.29, plate, mb.paint);
  face(back, -0.66, 0.66, fl + 0.12, fl + 0.3, dark, mb.glass);

  // Wheels: the dark arch, the tyre and the rim on each.
  const rim = shade(look.livery === 'none' && (look.color & 0xff) < 0x40 ? 0x8f9296 : 0xb9bcc0);
  for (const ax of [s.xf, s.xr]) {
    for (const side of [1, -1]) {
      const zo = side * (w0 + 0.004);
      const liner = disc(ax, s.wheel, s.wheel + 0.075, 10, 0, Math.PI);
      liner.unshift([ax + s.wheel + 0.075, s.wheel - 0.05]);
      liner.push([ax - s.wheel - 0.075, s.wheel - 0.05]);
      mb.glass.prism(liner, zo - side * 0.01, zo, dark, f);
      mb.glass.prism(disc(ax, s.wheel, s.wheel, 14), side * (w0 - 0.2), side * (w0 + 0.012), shade(0x0f0f10), f);
      mb.paint.prism(disc(ax, s.wheel, s.wheel * 0.62, 10), side * (w0 - 0.02), side * (w0 + 0.018), rim, f);
      mb.glass.prism(disc(ax, s.wheel, s.wheel * 0.2, 6), side * (w0), side * (w0 + 0.024), dark, f);
    }
  }
  // Mirrors and the lines between the doors.
  const belt = l.belt(s.xCowl - 0.1);
  for (const side of [1, -1]) {
    mb.paint.prism(rect(s.xCowl - 0.2, belt + 0.02, s.xCowl - 0.06, belt + 0.13), side * (l.half(s.xCowl) - 0.02), side * (l.half(s.xCowl) + 0.13), look.livery === 'none' ? paint : dark, f);
    const lineZ = side * (w0 + 0.003);
    for (const dx of [s.xCowl - 0.12, ...s.pillars]) mb.glass.prism(rect(dx - 0.007, fl + 0.2, dx + 0.007, l.belt(dx) - 0.04), lineZ - side * 0.004, lineZ, dark, f);
  }
  const roofMid = (s.xRoofF + s.xRoofR) / 2;
  const barX = look.body === 'van' ? s.xRoofF - 0.45 : roofMid + 0.3;
  const yn = s.yNose;
  return {
    head: [
      [nose - 0.03, yn - 0.05, l.half(nose - 0.05) - 0.24],
      [nose - 0.03, yn - 0.05, -(l.half(nose - 0.05) - 0.24)],
    ],
    tail: [
      [tail + 0.02, s.yTail - 0.1, l.half(tail + 0.1) - 0.24],
      [tail + 0.02, s.yTail - 0.1, -(l.half(tail + 0.1) - 0.24)],
    ],
    bar: [barX, l.top(barX) + 0.02, 0],
    barWidth: look.body === 'van' ? 1.25 : 1.08,
    half: w0,
    nose,
    tail2: tail,
    belt: l.belt(0),
    floor: fl,
    yNose: yn,
  };
}

/** Does this kind of body have a drawn shape here (lorries, buses and motorcycles are built from blocks)? */
export const lofted = (b: CarBody) => b !== 'truck' && b !== 'bus' && b !== 'moto';
