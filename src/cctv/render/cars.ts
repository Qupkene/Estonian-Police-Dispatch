/**
 * Vehicles for the camera picture. Cars, vans and pick-ups have a shaped body (carbody.ts); lorries, buses and
 * motorcycles are built from blocks. Paint reflects the sky, glass more so.
 *
 * A moving car carries one painting per model and livery (an atlas: both sides, the top, the back and the front,
 * seen square-on) laid over its painted faces: the Estonian police's blue doors and bonnet with POLITSEI, the
 * yellow-green reflective band and the board number; an ambulance's or the Rescue Board's markings; and on every
 * car the grille, the intakes, the number plates, the door lines, the handles and the rims. The reflective parts
 * glow a little at night, as the figures' vest bands do. All its lamps (headlamps, tail and brake lamps,
 * indicators, the blue light bar and the hidden blue lights of an unmarked car) are one mesh whose glow is read
 * from a tiny texture of eight lamp states, so switching them costs one upload and no new objects.
 *
 * A vehicle is drawn about its own origin: x forwards, y up, the wheels on the ground. `drawCar` writes the fixed
 * parts into mesh builders, so parked cars can be baked into the street; `CarMesh` is a car that moves.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  LinearFilter,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';
import { lerp, type V2 } from '../math';
import { CAR_SIZE, hasBeacons, type CarLights, type CarLook } from '../vehicle';
import { bendOf, drawBody, linesOf, lofted, noseVariant, shapeOf, type BodyOptions, type CarBuilders, type CarSpots, type Facet, type LampGroup, type LampSink, type Lines, type Shape } from './carbody';
import { MeshBuilder, shade, type P3, type Xf } from './mesh';

export type { CarBuilders, CarSpots };

const GLASS = 0x2c3640;
const TYRE = 0x141415;
const DARK = 0x1c1d20;

const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function wheel(mb: CarBuilders, x: number, r: number, zIn: number, zOut: number, f?: Xf) {
  const ring: V2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push([x + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  (mb.plastic ?? mb.paint).prism(ring, zIn, zOut, shade(TYRE), f);
  const hub: V2[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    hub.push([x + Math.cos(a) * r * 0.55, r + Math.sin(a) * r * 0.55]);
  }
  mb.paint.prism(hub, zOut - Math.sign(zOut) * 0.02, zOut + Math.sign(zOut) * 0.012, shade(0x9a9da1), f);
}

/** A flat lamp face on a block-built vehicle, facing along x. */
function lampFace(sink: LampSink, x: number, y0: number, y1: number, z0: number, z1: number, color: number, group: LampGroup) {
  const n: P3 = [Math.sign(x), 0, 0];
  sink.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], n, color, group);
}

/** A lorry, a bus or a motorcycle, from blocks. */
function drawBlocks(mb: CarBuilders, look: CarLook, f: Xf | undefined, sink: LampSink): CarSpots {
  const { length: L, width: W, height: H, wheel: r } = CAR_SIZE[look.body];
  const paint = shade(look.color);
  const glass = shade(GLASS);
  const dark = shade(DARK);
  const hw = W / 2;
  const front = L / 2;
  const rear = -L / 2;
  if (look.body === 'moto') {
    // Thin wheels with silver rims, the fork, tank, seat, engine and exhaust.
    const tyre = shade(TYRE);
    const metal = shade(0x9a9da1);
    const xw = [front - r - 0.04, rear + r + 0.06];
    for (const x of xw) {
      const ringAt = (k: number) => Array.from({ length: 14 }, (_, i) => [x + Math.cos((i / 14) * Math.PI * 2) * r * k, r + Math.sin((i / 14) * Math.PI * 2) * r * k] as V2);
      mb.paint.prism(ringAt(1), -0.06, 0.06, tyre, f);
      mb.paint.prism(ringAt(0.7), -0.065, 0.065, metal, f);
    }
    mb.paint.prism([[xw[0] - 0.02, r], [xw[0] + 0.03, r], [front - 0.42, 1.0], [front - 0.48, 1.0]], -0.1, 0.1, metal, f);
    mb.paint.prism(rect(front - 0.5, 0.98, front - 0.44, 1.02), -0.36, 0.36, shade(DARK), f);
    mb.paint.prism([[front - 0.85, 0.78], [front - 0.5, 0.8], [front - 0.48, 0.95], [front - 0.8, 0.98], [front - 1.0, 0.9]], -0.15, 0.15, paint, f);
    mb.paint.prism([[rear + 0.25, 0.8], [front - 1.0, 0.82], [front - 1.05, 0.9], [rear + 0.3, 0.88]], -0.14, 0.14, dark, f);
    mb.paint.prism(rect(front - 1.15, 0.32, front - 0.65, 0.72), -0.17, 0.17, shade(0x3a3c40), f);
    mb.paint.prism([[xw[1], r], [front - 1.15, 0.45], [front - 1.1, 0.6], [xw[1], r + 0.08]], 0.06, 0.12, metal, f);
    mb.paint.prism(rect(rear + 0.25, 0.3, front - 1.1, 0.38), 0.17, 0.25, metal, f);
    lampFace(sink, front - 0.4, 0.86, 0.96, -0.07, 0.07, 0xd5dade, 'head');
    lampFace(sink, rear + 0.2, 0.8, 0.86, -0.06, 0.06, 0x8e1414, 'tail');
    return { head: [[front - 0.38, 0.91, 0]], tail: [[rear + 0.2, 0.83, 0]], bar: [0, 1.1, 0], barWidth: 0.3, half: 0.3, nose: front, tail2: rear, belt: 0.9, floor: 0.3, yNose: 0.9 };
  }
  let bar: P3 = [0, H + 0.1, 0];
  const floor = look.body === 'bus' ? 0.36 : 1.0;
  if (look.body === 'truck') {
    const cab = front - 2.3;
    mb.glass.prism(rect(rear + 0.1, 0.5, front - 0.2, floor), -hw + 0.25, hw - 0.25, dark, f);
    // The box, with its roller shutters as lighter panels, and the cab with a raked screen.
    mb.paint.prism(rect(rear, floor, cab - 0.12, H), -hw, hw, paint, f);
    const shutter = shade(0xb9bcc0);
    for (let k = 0; k < 3; k++) {
      const x0 = rear + 0.25 + (k * (cab - rear - 0.6)) / 3;
      const x1 = x0 + (cab - rear - 0.6) / 3 - 0.14;
      mb.paint.prism(rect(x0, floor + 0.15, x1, H - 0.5), -hw - 0.012, hw + 0.012, shutter, f);
    }
    mb.paint.prism([[cab, floor - 0.35], [front, floor - 0.35], [front, 1.95], [front - 0.3, 2.92], [cab, 2.92]], -hw + 0.04, hw - 0.04, paint, f);
    mb.glass.prism([[front - 0.31, 2.72], [front - 0.03, 1.98], [front + 0.02, 1.98], [front - 0.26, 2.74]], -hw + 0.16, hw - 0.16, glass, f);
    mb.glass.prism(rect(cab + 0.45, 1.9, front - 0.5, 2.62), -hw + 0.02, hw - 0.02, glass, f);
    mb.glass.prism(rect(front - 0.06, floor - 0.3, front + 0.05, floor + 0.12), -hw + 0.1, hw - 0.1, dark, f);
    if (look.livery === 'rescue') {
      mb.paint.prism(rect(rear + 0.05, floor + 0.02, front - 0.05, floor + 0.14), -hw - 0.016, hw + 0.016, shade(0xe6e2d6), f);
      mb.paint.prism(rect(rear + 0.05, H - 0.42, cab - 0.2, H - 0.32), -hw - 0.016, hw + 0.016, shade(0xd8c22a), f);
      // The ladder on the roof.
      mb.paint.prism(rect(rear + 0.3, H, cab - 0.6, H + 0.12), -0.5, -0.2, shade(0xa9acb0), f);
    }
    bar = [front - 1.15, 2.92 + 0.02, 0];
  } else {
    // A low-floor city bus: a long band of side windows, doors on the right, a tall screen and a destination sign.
    mb.paint.prism([[rear, floor], [front, floor], [front, 1.0], [front - 0.06, H - 0.12], [front - 0.22, H], [rear + 0.1, H], [rear, H - 0.15]], -hw, hw, paint, f);
    mb.paint.prism(rect(rear, 0.25, front, floor + 0.05), -hw + 0.02, hw - 0.02, shade(0x2a2b2e), f);
    const pane = (x0: number, x1: number, y0: number, y1: number, z: number) => mb.glass.quadAt([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], glass, [0, 0, Math.sign(z)], f);
    const doors = [front - 1.25, -0.3, rear + 3.2];
    for (const sd of [1, -1]) {
      const z = sd * (hw + 0.006);
      for (let x = rear + 0.45; x < front - 1.0; x += 1.45) {
        const x1 = Math.min(x + 1.3, front - 0.95);
        if (sd > 0 && doors.some((d) => Math.abs((x + x1) / 2 - d) < 0.7)) continue;
        pane(x, x1, 1.15, 2.55, z);
      }
      if (sd > 0) for (const d of doors) pane(d - 0.62, d + 0.62, floor + 0.02, 2.55, z);
      else pane(front - 0.9, front - 0.2, 1.15, 2.55, z);
    }
    mb.glass.quadAt([front + 0.006, 1.02, -hw + 0.08], [front + 0.006, 1.02, hw - 0.08], [front - 0.055, H - 0.4, hw - 0.08], [front - 0.055, H - 0.4, -hw + 0.08], glass, [1, 0, 0], f);
    mb.glass.quadAt([front - 0.058, H - 0.36, -hw + 0.25], [front - 0.058, H - 0.36, hw - 0.25], [front - 0.07, H - 0.16, hw - 0.25], [front - 0.07, H - 0.16, -hw + 0.25], shade(0x3a2a10), [1, 0, 0], f);
    mb.glass.quadAt([rear - 0.006, 1.6, -hw + 0.3], [rear - 0.006, 1.6, hw - 0.3], [rear - 0.006, 2.5, hw - 0.3], [rear - 0.006, 2.5, -hw + 0.3], glass, [-1, 0, 0], f);
    // The air conditioning pod on the roof.
    mb.paint.prism(rect(-1.6, H, 1.2, H + 0.28), -0.8, 0.8, shade(0xd8d9db), f);
    bar = [0, H + 0.02, 0];
  }
  const ax = look.body === 'bus' ? [front - 2.4, rear + 2.9] : [front - 1.4, rear + 1.6];
  for (const x of ax) {
    wheel(mb, x, r, hw - 0.32, hw + 0.012, f);
    wheel(mb, x, r, -hw + 0.32, -hw - 0.012, f);
  }
  const yl = floor + 0.12;
  for (const s of [1, -1]) {
    lampFace(sink, front + 0.012, yl - 0.07, yl + 0.07, s * (hw - 0.55), s * (hw - 0.22), 0xd5dade, 'head');
    lampFace(sink, front + 0.012, yl - 0.07, yl + 0.07, s * (hw - 0.2), s * (hw - 0.08), 0xc98a2a, 'amber');
    lampFace(sink, rear - 0.012, floor + 0.2, floor + 0.42, s * (hw - 0.3), s * (hw - 0.1), 0x8e1414, 'tail');
  }
  return {
    head: [[front + 0.02, yl, hw - 0.4], [front + 0.02, yl, -hw + 0.4]],
    tail: [[rear - 0.02, floor + 0.3, hw - 0.2], [rear - 0.02, floor + 0.3, -hw + 0.2]],
    bar,
    barWidth: 1.6,
    half: hw,
    nose: front,
    tail2: rear,
    belt: floor + 1,
    floor,
    yNose: floor + 0.5,
  };
}

// ── The roof light bar and the hidden blue lights ──

/**
 * A low LED light bar as on the Superb (2023): a long slim clear lens over a thin dark grey base, the same from
 * both ends, standing on two short black feet. The lens is cut into segments 0.15 m apart (the dark base shows in
 * the joints); the left half flashes with one group, the right with the other.
 */
function lightBar(mb: CarBuilders, sink: LampSink, c: P3, width: number, depth: number, f?: Xf, lens = 0xc5c9cd) {
  const base = 0.015;
  const h = 0.05;
  const d = depth / 2;
  const y0 = c[1];
  const w = width / 2;
  mb.glass.prism(rect(c[0] - d - 0.006, y0, c[0] + d + 0.006, y0 + base), -w, w, shade(0x2b2e33), f);
  // The lens: a rounded front and back over the base, in segments.
  const prof: V2[] = [[-d, 0], [-d + 0.01, h * 0.75], [-d + 0.04, h], [d - 0.04, h], [d - 0.01, h * 0.75], [d, 0]];
  const yl = y0 + base;
  const segs = Math.max(2, Math.round(width / 0.15));
  for (let k = 0; k < segs; k++) {
    const z0 = -w + (k * width) / segs + 0.003;
    const z1 = -w + ((k + 1) * width) / segs - 0.003;
    const group: LampGroup = (z0 + z1) / 2 < 0 ? 'blueA' : 'blueB';
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i];
      const b = prof[i + 1];
      const n: P3 = [a[1] - b[1], b[0] - a[0], 0];
      const l = Math.hypot(n[0], n[1]) || 1;
      sink.quad([c[0] + a[0], yl + a[1], z0], [c[0] + b[0], yl + b[1], z0], [c[0] + b[0], yl + b[1], z1], [c[0] + a[0], yl + a[1], z1], [n[0] / l, n[1] / l, 0], lens, group);
    }
    // The bar's two ends.
    if (k === 0 || k === segs - 1) {
      const ze = k === 0 ? z0 : z1;
      sink.quad([c[0] - d, yl, ze], [c[0] + d, yl, ze], [c[0] + d - 0.04, yl + h, ze], [c[0] - d + 0.04, yl + h, ze], [0, 0, Math.sign(ze)], lens, group);
    }
  }
  // The feet, clamped to the roof rails (or onto the roof).
  for (const s of [1, -1]) mb.glass.prism(rect(c[0] - 0.04, y0 - 0.075, c[0] + 0.04, y0 + 0.002), s * (w - 0.12), s * (w - 0.08), shade(0x141517), f);
}

/** The x on the windscreen (or the rear screen) at a height, and the screen's outward normal there. */
function onScreen(l: Lines, xa: number, xb: number, y: number): { x: number; n: P3 } {
  let lo = Math.min(xa, xb);
  let hi = Math.max(xa, xb);
  const rising = l.top(hi) > l.top(lo);
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (l.top(m) > y === rising) hi = m;
    else lo = m;
  }
  const x = (lo + hi) / 2;
  const dy = (l.top(x + 0.01) - l.top(x - 0.01)) / 0.02;
  const k = Math.hypot(dy, 1);
  return { x, n: [-dy / k, 1 / k, 0] };
}

/** Where an emergency vehicle's blue lights are, besides its roof bar: their places in the car's own space. */
interface Beacons {
  bar: { c: P3; width: number }[];
  /** Small LED heads (and screen strips): middle, normal, width, height, group, lens colour when off, and whether it sits inside the car behind glass. */
  leds: { c: P3; n: P3; w: number; h: number; g: LampGroup; color: number; inside?: boolean }[];
}

function beaconsOf(look: CarLook, s: Shape | null, spots: CarSpots): Beacons {
  const out: Beacons = { bar: [], leds: [] };
  if (!hasBeacons(look.livery)) return out;
  if (!s) {
    out.bar.push({ c: spots.bar, width: spots.barWidth });
    return out;
  }
  const l = linesOf(s);
  const nose = s.L / 2;
  const tail = -s.L / 2;
  const van = s.H > 1.85;
  const bend = bendOf(s, l);
  // On the nose and the tail the skin stands back above and below the middle.
  const led = (c: P3, n: P3, w: number, h: number, g: LampGroup, color = 0x22262b, inside = false) => {
    const end = Math.abs(n[0]) > 0.9 && Math.abs(c[0]) > s.L / 2 - 0.05;
    out.leds.push({ c: end ? [bend(c[0] - Math.sign(c[0]) * 0.04, c[1], c[2]) + Math.sign(c[0]) * 0.05, c[1], c[2]] : c, n, w, h, g, color, inside });
  };
  const pair = (x: number, y: number, z: number, n: P3, w: number, h: number) => {
    led([x, y, -z], n, w, h, 'ledA');
    led([x, y, z], n, w, h, 'ledB');
  };
  const screenStrip = (y: number) => {
    const p = onScreen(l, s.xRoofF, s.xCowl, y);
    for (const [z, g] of [[-0.26, 'ledA'], [0.26, 'ledB']] as const) led([p.x - 0.03, y - 0.02, z], p.n, 0.3, 0.03, g, 0x22262b, true);
  };
  if (look.livery === 'police' && look.marks !== 'local') {
    out.bar.push({ c: spots.bar, width: spots.barWidth });
    if (van) {
      // The van's second bar at the back of the roof, and LED modules along both roof edges.
      const xb = s.xRoofR + 0.2;
      out.bar.push({ c: [xb, l.top(xb) + 0.05, 0], width: spots.barWidth });
      for (let k = 0; k < 5; k++) {
        const x = lerp(s.xRoofF - 0.6, s.xRoofR + 0.6, k / 4);
        const z = l.half(x) * s.tumble - 0.02;
        led([x, l.top(x) - 0.03, -z], [0, 0.3, -0.95], 0.1, 0.035, k % 2 ? 'ledB' : 'ledA');
        led([x, l.top(x) - 0.03, z], [0, 0.3, 0.95], 0.1, 0.035, k % 2 ? 'ledA' : 'ledB');
      }
    }
    // Two LED heads on the bracket over the front plate.
    pair(nose + 0.03, s.yFloor + 0.43, 0.17, [1, 0, 0], 0.09, 0.035);
  } else if (look.livery === 'police') {
    screenStrip(s.H - 0.1);
    pair(nose + 0.012, s.yNose - 0.14, 0.24, [1, 0, 0], 0.09, 0.03);
  } else if (look.livery === 'plain') {
    // Hidden, as on the unmarked Superb (2023): a pair in the grille, one behind the top of the windscreen on the
    // passenger's side, a pair inside the rear screen's upper corners and a pair at the rear reflectors. Nothing
    // stands on or above the roof.
    pair(nose + 0.012, Math.min(0.62, s.yNose - 0.1), 0.25, [1, 0, 0], 0.1, 0.03);
    const w = onScreen(l, s.xRoofF, s.xCowl, l.top(s.xRoofF + 0.02) - 0.08);
    led([w.x - 0.03, l.top(s.xRoofF + 0.02) - 0.08 - 0.02, 0.3], w.n, 0.22, 0.03, 'ledB', 0x22262b, true);
    if (!s.blind) {
      const yt = l.top(s.xRoofR - 0.02) - 0.07;
      const p = onScreen(l, s.xDeck, s.xRoofR, yt);
      const z = l.half(p.x) * s.tumble - 0.12;
      led([p.x + 0.03, yt - 0.01, -z], [-p.n[0], p.n[1], 0], 0.12, 0.03, 'ledA', 0x22262b, true);
      led([p.x + 0.03, yt - 0.01, z], [-p.n[0], p.n[1], 0], 0.12, 0.03, 'ledB', 0x22262b, true);
    }
    pair(tail - 0.012, s.yFloor + 0.32, l.half(tail) - 0.2, [-1, 0, 0], 0.1, 0.03);
  } else {
    out.bar.push({ c: spots.bar, width: spots.barWidth });
    pair(nose + 0.012, s.yNose - 0.16, 0.3, [1, 0, 0], 0.1, 0.035);
    if (van) {
      // Blue blocks on the rear corners of the roof, seen from behind and from the side.
      // Clear blue lenses when off; they flash in turn with the front bar.
      const zc = l.half(tail) - 0.16;
      const lens = 0x6f9fd8;
      led([tail - 0.01, s.H - 0.12, -zc], [-1, 0, 0], 0.2, 0.12, 'blueA', lens);
      led([tail - 0.01, s.H - 0.12, zc], [-1, 0, 0], 0.2, 0.12, 'blueB', lens);
      led([tail + 0.16, s.H - 0.12, -(l.half(tail + 0.16) + 0.01)], [0, 0, -1], 0.2, 0.12, 'blueA', lens);
      led([tail + 0.16, s.H - 0.12, l.half(tail + 0.16) + 0.01], [0, 0, 1], 0.2, 0.12, 'blueB', lens);
    }
  }
  return out;
}

/** A flat LED head or strip, facing along `n`, centred at `c`. */
function ledFace(sink: LampSink, c: P3, n: P3, w: number, h: number, g: LampGroup, color: number) {
  // Across: horizontal and square to the normal; up: square to both.
  let ax = -n[2];
  let az = n[0];
  const al = Math.hypot(ax, az) || 1;
  ax /= al;
  az /= al;
  const ux = n[1] * az;
  const uy = n[2] * ax - n[0] * az;
  const uz = -n[1] * ax;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const u: P3 = [ux / ul, uy / ul, uz / ul];
  const p = (sa: number, su: number): P3 => [c[0] + ax * sa * w * 0.5 + u[0] * su * h * 0.5, c[1] + u[1] * su * h * 0.5, c[2] + az * sa * w * 0.5 + u[2] * su * h * 0.5];
  sink.quad(p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), n, color, g);
}

/** Draw a vehicle's fixed parts. Returns where its lamps and its light bar go. `opts.lod` 'high' is for a moving car. */
export function drawCar(mb: CarBuilders, look: CarLook, f?: Xf, opts: BodyOptions = {}): CarSpots {
  const sink: LampSink = opts.lamps ?? { quad: (a, b, c, d, n, color) => mb.paint.quadAt(a, b, c, d, shade(color), n, f) };
  const fire = look.livery === 'rescue' && look.body === 'truck';
  const spots = lofted(look.body)
    ? drawBody(mb, look, f, { ...opts, lamps: sink })
    : fire
      ? drawFireEngine(mb, f, sink, opts.lod === 'high' ? opts.skin : undefined)
      : drawBlocks(mb, look, f, sink);
  if (look.livery === 'taxi') mb.paint.prism(rect(spots.bar[0] - 0.14, spots.bar[1] - 0.04, spots.bar[0] + 0.14, spots.bar[1] + 0.12), -0.3, 0.3, shade(0xe3c21c), f);
  const b = beaconsOf(look, lofted(look.body) ? shapeOf(look) : null, spots);
  // Without a sink of its own a parked car's lamps are painted on in their colours when off.
  const lens = look.livery === 'police' ? 0xc9d0d6 : 0x3456a8;
  for (const bar of b.bar) lightBar(mb, sink, bar.c, bar.width, look.body === 'van' ? 0.34 : 0.3, f, lens);
  for (const e of b.leds) ledFace(sink, e.c, e.n, e.w, e.h, e.g, e.color);
  return spots;
}

export type { CarLights };

let paintMat: MeshPhysicalMaterial | null = null;
let solidMat: MeshPhysicalMaterial | null = null;
let metalMat: MeshPhysicalMaterial | null = null;
let glassMat: MeshPhysicalMaterial | null = null;
let plasticMat: MeshStandardMaterial | null = null;

/**
 * The two materials every vehicle is made of: paint (and plain plastic) by the colour of its vertices, under a clear
 * coat that mirrors the sky on roofs and bonnets; and glass, smooth enough to show the sky and the houses, more so
 * at a grazing angle.
 */
export function carMaterials(): { paint: MeshStandardMaterial; glass: MeshStandardMaterial } {
  paintMat ??= new MeshPhysicalMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
  glassMat ??= new MeshPhysicalMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.05, envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: 0.03 });
  return { paint: paintMat, glass: glassMat };
}

/** A moving car's paint: solid or metallic, both under a full clear coat. */
function paintFor(look: CarLook): MeshPhysicalMaterial {
  if (look.metallic) return (metalMat ??= new MeshPhysicalMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1 }));
  return (solidMat ??= new MeshPhysicalMaterial({ vertexColors: true, metalness: 0.05, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 }));
}

/** Tyres, bumpers and cladding of unpainted plastic: rough, no clear coat, so they stand apart from the paint. */
function plasticFor(): MeshStandardMaterial {
  return (plasticMat ??= new MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.85, envMapIntensity: 0.5 }));
}

// ── The painting laid over a car (its atlas) ──

const AW = 1024;
const BAND = 192;
const AH = BAND * 4;
/** The emission painting is drawn at half size. */
const GLOW_K = 0.5;

type Region = 'right' | 'left' | 'top' | 'back' | 'front';

/** Where a point of a car lands in the atlas, in pixels: sides take (x, y), the top (x, z), the back and front (z, y). */
interface Frame {
  L: number;
  Hm: number;
  Wm: number;
  k: number;
}

function toPx(fr: Frame, r: Region, a: number, b: number): V2 {
  const { L, Hm, Wm, k } = fr;
  const tail = -L / 2;
  switch (r) {
    case 'right':
      return [((a - tail) / L) * AW * k, (BAND - (b / Hm) * BAND) * k];
    case 'left':
      return [((L / 2 - a) / L) * AW * k, (2 * BAND - (b / Hm) * BAND) * k];
    case 'top':
      return [((a - tail) / L) * AW * k, (2 * BAND + ((b + Wm / 2) / Wm) * BAND) * k];
    case 'back':
      return [((a + Wm / 2) / Wm) * (AW / 2) * k, (4 * BAND - (b / Hm) * BAND) * k];
    case 'front':
      return [(AW / 2 + ((Wm / 2 - a) / Wm) * (AW / 2)) * k, (4 * BAND - (b / Hm) * BAND) * k];
  }
}

/** One painter's brush: draws car-space shapes and text into one region of the atlas. */
class Brush {
  constructor(
    readonly g: CanvasRenderingContext2D,
    readonly fr: Frame,
    readonly r: Region,
  ) {}

  poly(pts: V2[], color: string) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    pts.forEach(([a, b], i) => {
      const [x, y] = toPx(this.fr, this.r, a, b);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  line(a: V2, b: V2, color: string, px: number) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const p = toPx(this.fr, this.r, a[0], a[1]);
    const q = toPx(this.fr, this.r, b[0], b[1]);
    g.strokeStyle = color;
    g.lineWidth = px * this.fr.k;
    g.beginPath();
    g.moveTo(p[0], p[1]);
    g.lineTo(q[0], q[1]);
    g.stroke();
  }

  /**
   * A local frame at `c` in millimetres: u along `read` (the way text reads), v along `down` (both unit vectors in
   * the region's two car coordinates). Text is never mirrored, whichever side of the car it is on.
   */
  frame(c: V2, read: V2, down: V2) {
    const o = toPx(this.fr, this.r, c[0], c[1]);
    const r = toPx(this.fr, this.r, c[0] + read[0] * 0.001, c[1] + read[1] * 0.001);
    const d = toPx(this.fr, this.r, c[0] + down[0] * 0.001, c[1] + down[1] * 0.001);
    this.g.setTransform(r[0] - o[0], r[1] - o[1], d[0] - o[0], d[1] - o[1], o[0], o[1]);
  }

  /** The way text reads on this region, and down. */
  axes(): [V2, V2] {
    switch (this.r) {
      case 'right':
        return [[1, 0], [0, -1]];
      case 'left':
        return [[-1, 0], [0, -1]];
      case 'back':
        return [[1, 0], [0, -1]];
      case 'front':
        return [[-1, 0], [0, -1]];
      case 'top':
        return [[0, -1], [1, 0]];
    }
  }

  /** Text centred at `c`, its capitals `cap` metres tall, at most `maxW` metres long. */
  text(str: string, c: V2, cap: number, color: string, maxW: number, weight = 700, align: CanvasTextAlign = 'center') {
    const [read, down] = this.axes();
    this.frame(c, read, down);
    const g = this.g;
    const size = (cap * 1000) / 0.716;
    g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    g.fillText(str, 0, (cap * 1000) / 2, maxW * 1000);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}

const POLICE_BLUE = '#2163b5';
const BAND_BLUE = '#14408c';
/** The van's band is a darker, navy reflective blue (Vito 3684, 2023). */
const VAN_BAND_BLUE = '#22407a';
const NEON = '#d3e000';
const TEXT_BLUE = '#1d5fb3';

/** An Estonian number plate (520 x 113 mm): white, black letters, the blue EU strip with EST. */
function plate(b: Brush, c: V2, text: string) {
  const [read, down] = b.axes();
  b.frame(c, read, down);
  const g = b.g;
  g.fillStyle = '#f4f4ef';
  g.fillRect(-260, -56, 520, 113);
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 5;
  g.strokeRect(-256, -52, 512, 105);
  g.fillStyle = '#1f47a8';
  g.fillRect(-256, -52, 44, 105);
  g.fillStyle = '#e8c832';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillRect(-234 + Math.cos(a) * 13 - 2, -22 + Math.sin(a) * 13 - 2, 4, 4);
  }
  g.fillStyle = '#ffffff';
  g.font = '700 26px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('EST', -234, 40);
  g.fillStyle = '#111111';
  g.font = '700 88px Arial, sans-serif';
  g.fillText(text, 26, 32, 440);
  g.setTransform(1, 0, 0, 1, 0, 0);
}

type Rim = 'spoke10' | 'spoke5' | 'multi' | 'aero' | 'cap' | 'alloy';

function rimOf(look: CarLook): Rim {
  switch (look.model) {
    case 'superb':
    case 'superbSaloon':
      return 'spoke10';
    case 'octavia':
    case 'kodiaq':
    case 'bmw5':
    case 'patrol':
    case 'amarok':
      return 'spoke5';
    case 'passat':
    case 'tiguan':
      return 'multi';
    case 'id4':
      return 'aero';
    case 'transporter':
    case 'vito':
    case 'sprinter':
    case 'ambulance':
      return 'cap';
    default:
      return look.body === 'hatch' ? 'cap' : 'alloy';
  }
}

/** A wheel's rim seen side-on, in its arch: drawn in metres about the wheel's middle. */
function rim(b: Brush, ax: number, R: number, style: Rim) {
  const rr = R * 0.66;
  b.frame([ax, R], [1, 0], [0, -1]);
  const g = b.g;
  const m = 1000;
  const disc = (r: number, color: string) => {
    g.beginPath();
    g.arc(0, 0, r * m, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  };
  disc(rr, '#1a1b1d');
  const silver = '#c3c7cc';
  const spokes = (count: number, w0: number, w1: number, color: string, twin = 0) => {
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
      for (const off of twin ? [-twin, twin] : [0]) {
        const a = (i / count) * Math.PI * 2 + off;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const px = -sa;
        const py = ca;
        g.beginPath();
        g.moveTo((ca * 0.05 + px * w0) * m, (sa * 0.05 + py * w0) * m);
        g.lineTo((ca * rr * 0.97 + px * w1) * m, (sa * rr * 0.97 + py * w1) * m);
        g.lineTo((ca * rr * 0.97 - px * w1) * m, (sa * rr * 0.97 - py * w1) * m);
        g.lineTo((ca * 0.05 - px * w0) * m, (sa * 0.05 - py * w0) * m);
        g.fill();
      }
    }
  };
  if (style === 'cap') {
    disc(rr, '#b7bbc0');
    g.fillStyle = '#5a5e64';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.beginPath();
      g.ellipse(Math.cos(a) * rr * 0.68 * m, Math.sin(a) * rr * 0.68 * m, rr * 0.2 * m, rr * 0.06 * m, a, 0, Math.PI * 2);
      g.fill();
    }
    disc(rr * 0.22, '#8d9196');
  } else if (style === 'aero') {
    disc(rr, '#2a2c30');
    spokes(5, 0.03, 0.05, '#a9adb3');
    disc(rr * 0.2, '#3a3d42');
  } else {
    disc(rr * 0.98, '#26282b');
    if (style === 'spoke10') spokes(10, 0.012, 0.02, silver);
    else if (style === 'spoke5') spokes(5, 0.014, 0.024, silver, 0.13);
    else if (style === 'multi') spokes(7, 0.012, 0.03, silver, 0.1);
    else spokes(5, 0.024, 0.045, silver);
    g.beginPath();
    g.arc(0, 0, rr * 0.97 * m, 0, Math.PI * 2);
    g.lineWidth = 0.018 * m;
    g.strokeStyle = silver;
    g.stroke();
    disc(rr * 0.24, '#aeb2b7');
    disc(rr * 0.1, '#3a3c40');
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * A car's front, painted on: grille, intakes and badge in its make's family look. A Škoda's grille is low, wide and
 * black with a thin chrome frame and dark bars, its top on the bonnet line and the badge on the bonnet's lip; the
 * plain fronts are three neutral shapes (`variant`) with no brand marks.
 */
function paintFront(b: Brush, s: Shape, lit: string, variant: number) {
  const yN = s.yNose;
  const fl = s.yFloor;
  const black = '#151618';
  const chrome = '#b9bec4';
  const trap = (zt: number, zb: number, y0: number, y1: number, color: string) =>
    b.poly([[-zb, y0], [zb, y0], [zt, y1], [-zt, y1]], color);
  const badge = (y: number, r: number) => {
    b.frame([0, y], [1, 0], [0, -1]);
    b.g.beginPath();
    b.g.arc(0, 0, r * 1000, 0, Math.PI * 2);
    b.g.fillStyle = chrome;
    b.g.fill();
    b.g.setTransform(1, 0, 0, 1, 0, 0);
  };
  switch (s.face) {
    case 'skoda':
      // Chrome along the top and down the sides only, black inside with dark bars.
      trap(0.41, 0.37, yN - 0.18, yN, chrome);
      trap(0.4, 0.36, yN - 0.185, yN - 0.01, black);
      for (let i = -9; i <= 9; i++) b.line([i * 0.038, yN - 0.18], [i * 0.042, yN - 0.015], '#25272b', 5);
      trap(0.6, 0.56, fl + 0.08, fl + 0.2, black);
      b.line([-0.42, fl + 0.14], [0.42, fl + 0.14], '#c9cdd2', 5);
      badge(yN + 0.012, 0.025);
      break;
    case 'vw':
      b.poly([[-0.42, yN - 0.1], [0.42, yN - 0.1], [0.42, yN - 0.035], [-0.42, yN - 0.035]], black);
      b.line([-0.42, yN - 0.067], [0.42, yN - 0.067], chrome, 3);
      trap(0.58, 0.5, fl + 0.06, fl + 0.28, black);
      badge(yN - 0.067, 0.04);
      break;
    case 'vwev':
      b.line([-0.4, yN - 0.03], [0.4, yN - 0.03], lit, 4);
      trap(0.62, 0.52, fl + 0.05, fl + 0.32, black);
      for (const sd of [1, -1]) b.poly([[sd * 0.66, fl + 0.12], [sd * 0.76, fl + 0.16], [sd * 0.74, fl + 0.36], [sd * 0.64, fl + 0.3]], black);
      break;
    case 'vwvan':
      b.poly([[-1, -0.1], [1, -0.1], [1, 0.62], [-1, 0.62]], VAN_BUMPER);
      b.poly([[-0.46, yN - 0.12], [0.46, yN - 0.12], [0.46, yN - 0.03], [-0.46, yN - 0.03]], black);
      for (let i = 0; i < 2; i++) b.line([-0.44, yN - 0.095 + i * 0.04], [0.44, yN - 0.095 + i * 0.04], chrome, 3);
      trap(0.55, 0.5, fl + 0.12, fl + 0.32, '#0f1012');
      badge(yN - 0.075, 0.05);
      break;
    case 'merc':
      // Unpainted black bumper up to the lamps, a white strip left under them.
      b.poly([[-1, -0.1], [1, -0.1], [1, 0.62], [-1, 0.62]], VAN_BUMPER);
      trap(0.36, 0.32, yN - 0.24, yN - 0.02, black);
      b.line([-0.34, yN - 0.13], [0.34, yN - 0.13], chrome, 6);
      badge(yN - 0.13, 0.055);
      trap(0.5, 0.46, fl + 0.1, fl + 0.3, '#0f1012');
      break;
    case 'bmw':
      for (const sd of [1, -1]) {
        b.poly([[sd * 0.03, yN - 0.18], [sd * 0.2, yN - 0.18], [sd * 0.21, yN - 0.02], [sd * 0.04, yN - 0.02]], chrome);
        b.poly([[sd * 0.045, yN - 0.165], [sd * 0.185, yN - 0.165], [sd * 0.195, yN - 0.035], [sd * 0.055, yN - 0.035]], black);
      }
      trap(0.62, 0.55, fl + 0.05, fl + 0.24, black);
      badge(yN + 0.01, 0.032);
      break;
    case 'toyota':
      b.poly([[-0.3, yN - 0.1], [0.3, yN - 0.1], [0.34, yN - 0.03], [-0.34, yN - 0.03]], black);
      trap(0.52, 0.42, fl + 0.06, fl + 0.4, black);
      for (let i = 1; i < 5; i++) b.line([-0.48, fl + 0.06 + i * 0.07], [0.48, fl + 0.06 + i * 0.07], '#33363b', 3);
      badge(yN - 0.065, 0.035);
      break;
    case 'nissan':
      trap(0.48, 0.42, yN - 0.32, yN - 0.02, chrome);
      trap(0.45, 0.39, yN - 0.3, yN - 0.04, black);
      for (let i = 1; i < 6; i++) b.line([-0.44, yN - 0.3 + i * 0.045], [0.44, yN - 0.3 + i * 0.045], chrome, 3);
      trap(0.62, 0.56, fl + 0.06, fl + 0.24, black);
      break;
    case 'plain':
      if (variant === 0) {
        // A slim black bar from lamp to lamp over a wide lower intake.
        b.poly([[-0.43, yN - 0.09], [0.43, yN - 0.09], [0.43, yN - 0.035], [-0.43, yN - 0.035]], black);
        trap(0.58, 0.5, fl + 0.06, fl + 0.24, black);
      } else if (variant === 1) {
        // A large black trapezoid with a bright line across it.
        trap(0.38, 0.3, yN - 0.3, yN - 0.03, black);
        b.line([-0.36, yN - 0.12], [0.36, yN - 0.12], chrome, 4);
        trap(0.5, 0.46, fl + 0.06, fl + 0.16, black);
      } else {
        // A small upper grille and a large lower intake with a mesh.
        trap(0.3, 0.26, yN - 0.09, yN - 0.02, black);
        trap(0.62, 0.52, fl + 0.06, fl + 0.3, black);
        for (let i = 1; i < 4; i++) b.line([-0.56, fl + 0.06 + i * 0.06], [0.56, fl + 0.06 + i * 0.06], '#2c2e32', 3);
      }
      break;
  }
}

/** Vans' bumpers and mouldings: unpainted dark plastic (Vito 3684, 2023; T6 3285, 2019). */
const VAN_BUMPER = '#1e1f21';

/** A car's back, painted on: the dark lower bumper and the reflectors. */
function paintBack(b: Brush, s: Shape, l: Lines) {
  const fl = s.yFloor;
  const w = l.half(-s.L / 2);
  b.poly([[-w, fl - 0.05], [w, fl - 0.05], [w * 0.92, fl + 0.1], [-w * 0.92, fl + 0.1]], s.H > 1.85 || s.cladding ? '#26272a' : '#1d1e21');
  if (s.H > 1.85) b.poly([[-w, fl - 0.05], [w, fl - 0.05], [w, fl + 0.36], [-w, fl + 0.36]], '#2a2b2e');
  for (const sd of [1, -1]) b.poly([[sd * (w - 0.18), fl + 0.17], [sd * (w - 0.05), fl + 0.17], [sd * (w - 0.05), fl + 0.21], [sd * (w - 0.18), fl + 0.21]], '#7a1010');
}

/** Lines between the panels, handles, the sill's shadow and the rims, on both sides. */
function paintSides(b: Brush, s: Shape, l: Lines, handle: string, style: Rim) {
  const seam = 'rgba(10,12,16,0.62)';
  // The rubber and trim along the foot of the side windows.
  const x0 = Math.max(s.glassTo, -s.L / 2 + 0.2);
  const x1 = s.xCowl - 0.04;
  const foot: V2[] = Array.from({ length: 9 }, (_, i) => {
    const x = lerp(x0, x1, i / 8);
    return [x, l.belt(x) - 0.004] as V2;
  });
  b.poly([...foot, ...foot.slice().reverse().map(([x, y]) => [x, y - 0.022] as V2)], 'rgba(22,23,26,0.92)');
  for (const x of s.doors) b.line([x, l.floor(x) + 0.05], [x, l.belt(x) - 0.01], seam, 2.4);
  // A handle near the back of each door.
  for (let i = 0; i < s.doors.length - 1; i++) {
    const x = s.doors[i + 1] + 0.1;
    const y = l.belt(x) - 0.09;
    b.poly([[x, y - 0.014], [x + 0.17, y - 0.014], [x + 0.17, y + 0.014], [x, y + 0.014]], handle);
    b.line([x, y - 0.016], [x + 0.17, y - 0.016], 'rgba(0,0,0,0.45)', 1.5);
  }
  if (s.H > 1.85) {
    // A van's sliding door runs in a rail under its windows. Black bumper ends, a black moulding along the sill
    // with a grey trim line on it, and black plastic rims round the arches.
    b.line([s.doors[1], l.belt(0) + 0.02], [-s.L / 2 + 0.25, l.belt(0) + 0.02], seam, 3);
    const fl = s.yFloor;
    const nose = s.L / 2;
    const tail = -s.L / 2;
    b.poly([[nose - 0.5, -0.1], [nose + 0.05, -0.1], [nose + 0.05, 0.62], [nose - 0.5, 0.62]], VAN_BUMPER);
    b.poly([[tail - 0.05, -0.1], [tail + 0.3, -0.1], [tail + 0.3, fl + 0.36], [tail - 0.05, fl + 0.36]], VAN_BUMPER);
    b.poly([[s.xr, fl + 0.05], [s.xf, fl + 0.05], [s.xf, fl + 0.13], [s.xr, fl + 0.13]], VAN_BUMPER);
    b.line([s.xr, fl + 0.14], [s.xf, fl + 0.14], '#9a9ea2', 20);
    const g = b.g;
    for (const ax of [s.xf, s.xr]) {
      b.frame([ax, s.wheel], [1, 0], [0, -1]);
      g.beginPath();
      g.arc(0, 0, (l.arch + 0.02) * 1000, Math.PI * 1.02, Math.PI * 1.98);
      g.lineWidth = 40;
      g.strokeStyle = VAN_BUMPER;
      g.stroke();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  for (const ax of [s.xf, s.xr]) rim(b, ax, s.wheel, style);
}

/** The Police and Border Guard Board's markings (ref: docs/CCTV.md section 10). */
function paintPolice(b: Brush, s: Shape, l: Lines, patrol: boolean, glow: boolean) {
  const van = s.H > 1.85;
  const fl = s.yFloor;
  const [dF, dB, dR] = [s.doors[0], s.doors[1], s.doors[s.doors.length - 1]];
  const solid = (c: string) => (glow ? '#000000' : c);
  const sample = (x0: number, x1: number, fy: (x: number) => number, n = 10): V2[] => Array.from({ length: n + 1 }, (_, i) => {
    const x = lerp(x0, x1, i / n);
    return [x, fy(x)] as V2;
  });
  if (b.r === 'right' || b.r === 'left') {
    // The lowest painted line of the side (the sill's crease), and the reflective band's top.
    const sill = fl + 0.07;
    const top = van ? 0.62 : fl + 0.52 * (l.belt(0) - fl);
    const bandBlue = glow ? '#0d2a5a' : van ? VAN_BAND_BLUE : BAND_BLUE;
    if (van) {
      // The cab door blue to the sill; the cargo side blue from the windows down to mid-height, then a white gap.
      b.poly([[dF, -0.1], [dB, -0.1], [dB, l.belt(dB)], [dF, l.belt(dF)]], solid(POLICE_BLUE));
      const yb = l.belt(0);
      b.poly([[dB, 0.78], [-s.L / 2 + 0.01, 0.78], [-s.L / 2 + 0.01, yb + 0.01], [dB, yb + 0.01]], solid(POLICE_BLUE));
    } else {
      // All four doors blue below the windows.
      b.poly([...sample(dF, dR, () => -0.1, 2), ...sample(dR, dF, (x) => l.belt(x) + 0.004)], solid(POLICE_BLUE));
    }
    if (patrol) {
      // The reflective band from wheel arch to wheel arch (the arches are cleared afterwards): yellow-green blocks as
      // wide as the blue between them, leaning 27 degrees with their tops forwards, on both flanks alike.
      const g = b.g;
      const period = 0.52;
      const yw = 0.27;
      // The first block's top front corner sits on the front arch's edge, so that it starts on the wing.
      const edge = s.xf - Math.sqrt(Math.max(0, l.arch ** 2 - (top - s.wheel) ** 2)) - 0.02;
      const blocks = (y0: number, y1: number, shift: number) => {
        const lean = Math.tan((27 * Math.PI) / 180) * (y1 - y0);
        const x1 = edge - Math.tan((27 * Math.PI) / 180) * (top - y0);
        for (let x = x1 + shift; x > s.xr - lean - period; x -= period) b.poly([[x - yw, y0], [x, y0], [x + lean, y1], [x + lean - yw, y1]], NEON);
      };
      g.save();
      b.poly(rect(s.xr, sill, s.xf, top), 'rgba(0,0,0,0)');
      g.clip();
      if (van) {
        // Two rows split at the moulding, the lower one shifted, on dark blue along the whole cargo side and cab door.
        b.poly(rect(s.xr, -0.1, dF, top), bandBlue);
        blocks(0.43, top, 0);
        blocks(-0.1, 0.41, -0.12);
      } else {
        // Blue between the blocks on the doors; on the wings the blocks stand on white. Under them a row of short
        // yellow and blue steps along the sill, shifted half a block.
        b.poly(rect(dR, sill, dF, top), bandBlue);
        const step = sill + 0.075;
        blocks(step + 0.022, top, 0);
        b.poly(rect(dR, sill, dF, step), bandBlue);
        g.restore();
        g.save();
        b.poly(rect(dR, sill, dF, step), 'rgba(0,0,0,0)');
        g.clip();
        for (let x = s.xf - period / 2; x > dR - period; x -= period) b.poly(rect(x - yw, sill, x, step), NEON);
      }
      g.restore();
    }
    const front = (dF + dB) / 2;
    const cap = van ? 0.15 : 0.12;
    const wy = van ? l.belt(front) - 0.2 : l.belt(front) - 0.17;
    b.text('POLITSEI', [front - 0.02, wy], cap, '#ffffff', (dF - dB) * 0.86);
    // The board number on the white wing, ending just before the front door: as tall as POLITSEI and level with it
    // on a car, smaller and higher on a van.
    const [read] = b.axes();
    const near: CanvasTextAlign = read[0] > 0 ? 'left' : 'right';
    const ink = glow ? '#3a6fd0' : TEXT_BLUE;
    b.text('2154', [dF + 0.05, van ? l.belt(dF) - 0.08 : wy], van ? 0.085 : cap, ink, 0.5, 700, near);
    // 112 and the web address on the rear quarter.
    const qx = van ? s.xr + 0.05 : (dR + (-s.L / 2 + s.tail.wrap + 0.1)) / 2;
    const qy = van ? l.belt(0) + 0.32 : l.belt(qx) - 0.11;
    b.text('112', [qx + read[0] * 0.035, qy], 0.055, ink, 0.2);
    b.frame([qx - read[0] * 0.075, qy], [1, 0], [0, -1]);
    b.g.beginPath();
    b.g.arc(0, 0, 32, 0, Math.PI * 2);
    b.g.lineWidth = 7;
    b.g.strokeStyle = ink;
    b.g.stroke();
    b.g.setTransform(1, 0, 0, 1, 0, 0);
    b.text('www.POLITSEI.ee', [qx, qy - 0.075], 0.032, ink, 0.4);
  } else if (b.r === 'top') {
    // The bonnet blue to its shut lines, white POLITSEI read from in front of the car.
    const x0 = s.xCowl + 0.03;
    const x1 = s.L / 2 + 0.05;
    const edge = (x: number) => l.half(x) - (van ? 0.08 : 0.12);
    b.poly([...sample(x0, x1, (x) => -edge(x)), ...sample(x1, x0, (x) => edge(x))], solid(POLICE_BLUE));
    const xc = lerp(s.xCowl, s.xHood, van ? 0.5 : 0.56);
    b.text('POLITSEI', [xc, 0], van ? 0.15 : 0.14, '#ffffff', Math.min(1.1, edge(xc) * 1.6));
  } else if (b.r === 'front') {
    const w = l.half(s.L / 2) - (van ? 0.08 : 0.12);
    b.poly([[-w, s.yNose - 0.02], [w, s.yNose - 0.02], [w, s.yHood + 0.2], [-w, s.yHood + 0.2]], solid(POLICE_BLUE));
  } else {
    // The back: blue doors or tailgate with POLITSEI, yellow-green chevrons meeting in the middle at the bottom.
    const w = l.half(-s.L / 2);
    const inner = van ? w - 0.06 : w - (s.tail.z > 0.6 ? 0.22 : w - s.tail.z + 0.02);
    const y0 = van ? fl + 0.34 : fl + 0.36;
    const y1 = van ? s.H - 0.12 : s.yDeck + 0.05;
    const dh = y1 - y0;
    b.poly([[-inner, y0], [inner, y0], [inner, y1], [-inner, y1]], solid(POLICE_BLUE));
    if (van) {
      // Vito 3684 (2023): POLITSEI large across both doors in the upper third; the board number on the right door
      // only, 112 with the handset and the web address under it, all of it above the chevrons.
      b.text('POLITSEI', [0, y0 + 0.78 * dh + 0.08], 0.16, '#ffffff', inner * 1.7);
      const ink = '#ffffff';
      const zr = inner - 0.12;
      const yn = y0 + 0.55 * dh;
      b.text('2154', [zr, yn], 0.11, ink, 0.5, 700, 'right');
      b.text('112', [zr, yn - 0.135], 0.07, ink, 0.3, 700, 'right');
      b.frame([zr - 0.2, yn - 0.135], [1, 0], [0, -1]);
      b.g.beginPath();
      b.g.arc(0, 0, 38, 0, Math.PI * 2);
      b.g.lineWidth = 7;
      b.g.strokeStyle = ink;
      b.g.stroke();
      b.g.setTransform(1, 0, 0, 1, 0, 0);
      b.text('www.POLITSEI.ee', [zr, yn - 0.24], 0.04, ink, 0.6, 700, 'right');
      b.line([0, y0], [0, y1], 'rgba(10,12,16,0.6)', 2.4);
    } else b.text('POLITSEI', [0, s.yTail - 0.09], 0.075, '#ffffff', inner * 1.6);
    if (patrol) {
      const c0 = van ? fl + 0.36 : fl + 0.1;
      const c1 = van ? y0 + 0.31 * dh : fl + 0.34;
      const cw = van ? w - 0.04 : w - 0.1;
      const g = b.g;
      g.save();
      b.poly([[-cw, c0], [cw, c0], [cw, c1], [-cw, c1]], 'rgba(0,0,0,0)');
      g.clip();
      b.poly([[-cw, c0], [cw, c0], [cw, c1], [-cw, c1]], BAND_BLUE);
      const h = c1 - c0;
      const lean = h * 0.5;
      const period = van ? 0.3 : 0.24;
      for (const sd of [1, -1]) {
        for (let z = 0.02; z < cw + period; z += period) {
          const zb = z + lean;
          b.poly([[sd * zb, c0], [sd * (zb + period / 2), c0], [sd * (z + period / 2), c1], [sd * z, c1]], NEON);
        }
      }
      g.restore();
    }
  }
}

/**
 * An ambulance's markings, Tallinn's white and red (EMS research, variant A): a dark grey lower band and bumpers,
 * a red band at the handles with TALLINNA KIIRABI, a red stripe under the roof edge, a red bonnet with KIIRABI,
 * a stand-in roundel (a red ring with a plain yellow cross), the rear's red band with the unit's number.
 */
function paintAmbulance(b: Brush, s: Shape, l: Lines, glow: boolean) {
  const red = glow ? '#000000' : '#c8141e';
  const H = s.H;
  const nose = s.L / 2;
  const tail = -s.L / 2;
  const dark = glow ? '#000000' : '#2a2b2d';
  if (b.r === 'right' || b.r === 'left') {
    b.poly([[s.xr + l.arch, 0.5], [s.xf - l.arch, 0.5], [s.xf - l.arch, 0.75], [s.xr + l.arch, 0.75]], dark);
    b.poly([[tail, 0], [tail + 0.35, 0], [tail + 0.35, 0.62], [tail, 0.62]], dark);
    b.poly([[nose - 0.5, 0], [nose, 0], [nose, 0.66], [nose - 0.5, 0.66]], dark);
    b.poly([[tail, 1.1], [nose, 1.1], [nose, 1.4], [tail, 1.4]], red);
    b.poly([[tail, H - 0.3], [s.xRoofF, H - 0.3], [s.xRoofF, H - 0.14], [tail, H - 0.14]], red);
    b.text('TALLINNA KIIRABI', [lerp(s.doors[1], tail, 0.45), 1.25], 0.17, '#ffffff', 2.2);
    b.text('17', [(s.xf + nose) / 2 - 0.1, 1.25], 0.15, '#ffffff', 0.3);
    if (!glow) {
      // The roundel on the upper side, a stand-in for the service's emblem.
      b.frame([lerp(nose, tail, 0.62), 0.7 * H], [1, 0], [0, -1]);
      const g = b.g;
      g.beginPath();
      g.arc(0, 0, 215, 0, Math.PI * 2);
      g.fillStyle = '#c8141e';
      g.fill();
      g.beginPath();
      g.arc(0, 0, 160, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.fillStyle = '#e8c21c';
      g.fillRect(-35, -130, 70, 260);
      g.fillRect(-130, -35, 260, 70);
      g.setTransform(1, 0, 0, 1, 0, 0);
      // A dark window in the sliding door on the right.
      if (b.r === 'right') b.poly([[s.doors[1] - 0.15, 0.6 * H], [s.doors[1] - 1.05, 0.6 * H], [s.doors[1] - 1.05, 0.8 * H], [s.doors[1] - 0.15, 0.8 * H]], '#1c232b');
    }
  } else if (b.r === 'top') {
    const edge = (x: number) => l.half(x) - 0.1;
    b.poly([[s.xCowl + 0.02, -edge(s.xCowl)], [nose + 0.05, -edge(nose)], [nose + 0.05, edge(nose)], [s.xCowl + 0.02, edge(s.xCowl)]], red);
    b.text('KIIRABI', [lerp(s.xCowl, s.xHood, 0.55), 0], 0.13, '#ffffff', 1.0);
  } else if (b.r === 'front') {
    const w = l.half(nose) - 0.1;
    b.poly([[-w, s.yNose - 0.02], [w, s.yNose - 0.02], [w, s.yHood + 0.3], [-w, s.yHood + 0.3]], red);
    b.poly([[-0.95, 0], [0.95, 0], [0.95, s.yFloor + 0.42], [-0.95, s.yFloor + 0.42]], dark);
    // The lamp fairing over the windscreen: red below, KIIRABI on it.
    b.poly([[-0.95, H - 0.32], [0.95, H - 0.32], [0.95, H - 0.12], [-0.95, H - 0.12]], red);
    b.text('KIIRABI', [0, H - 0.22], 0.11, '#ffffff', 1.1);
  } else {
    const w = l.half(tail);
    b.poly([[-w, 0], [w, 0], [w, s.yFloor + 0.38], [-w, s.yFloor + 0.38]], dark);
    b.poly([[-w + 0.05, 0.72], [w - 0.05, 0.72], [w - 0.05, 1.07], [-w + 0.05, 1.07]], red);
    b.text('17 KIIRABI', [0.05, 0.895], 0.2, '#ffffff', 1.6);
    if (!glow) {
      for (const sd of [1, -1]) b.poly([[sd * 0.04, 0.55 * H], [sd * (w - 0.12), 0.55 * H], [sd * (w - 0.12), 0.85 * H], [sd * 0.04, 0.85 * H]], '#1c232b');
      b.poly([[-w + 0.1, 0.85 * H], [w - 0.1, 0.85 * H], [w - 0.1, 0.88 * H], [-w + 0.1, 0.88 * H]], '#c8141e');
      b.line([0, s.yFloor + 0.38], [0, H - 0.08], 'rgba(10,12,16,0.6)', 2.4);
    }
  }
}

/** A main fire engine's size: a forward-control crew cab and an equipment body (Scania P, EMS research 4.2). */
const FIRE = { L: 8.0, W: 2.5, H: 3.05, R: 0.52, xf: 2.55, xr: -1.8, cab: 1.15, foot: 0.6, arch: 0.62 };

/** The front of the fire engine's cab at a height: upright to the windscreen's foot, then raked 8 degrees. */
function fireFront(y: number): number {
  const nose = FIRE.L / 2;
  if (y <= 1.8) return nose;
  if (y <= 2.84) return nose - (y - 1.8) * Math.tan((8 * Math.PI) / 180);
  return nose - 0.146 - (y - 2.84) * 0.9;
}

/**
 * The Rescue Board's main engine. `old`: the livery that is still often seen (Scania P, 2021 photo): the front door
 * white below its window with a stand-in star (a plain gold eight-pointed star) and the brigade's name, red and white
 * reflective stripes along the sill. Otherwise the livery of the rule of 2022 and the Scania P450 engines of 2025:
 * red all over, with white and yellow diagonal reflective stripes along the lower half. Both: 112 on the crew door,
 * PÄÄSTE over the windscreen and on the fascia, aluminium roller shutters (EMS research 4.3).
 */
function paintRescue(b: Brush, glow: boolean, plateText: string | undefined, old: boolean) {
  const { L, W, R, xf, xr, cab, foot } = FIRE;
  const nose = L / 2;
  const tail = -L / 2;
  const white = '#f2f2f0';
  const stripes = (x0: number, x1: number, y0: number, y1: number, a: string, c: string, lean = 1) => {
    const g = b.g;
    g.save();
    b.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], a);
    g.clip();
    const h = y1 - y0;
    for (let x = x0 - h; x < x1 + h; x += 0.3) b.poly([[x, y0], [x + 0.15, y0], [x + 0.15 + lean * h, y1], [x + lean * h, y1]], c);
    g.restore();
  };
  if (b.r === 'right' || b.r === 'left') {
    if (!glow) {
      // Shutters of natural aluminium with their slats, above the reflective band.
      for (const [a, c] of [[-0.95, cab - 0.25], [-2.55, -1.1], [-3.88, -2.7]] as const) {
        b.poly([[a, 1.3], [c, 1.3], [c, 2.78], [a, 2.78]], '#a7aaad');
        for (let y = 1.35; y < 2.78; y += 0.06) b.line([a, y], [c, y], 'rgba(60,64,70,0.45)', 1.2);
        b.line([a, 1.4], [c, 1.4], '#55595f', 3);
      }
      // The crew cab's two doors a side and their handles.
      for (const x of [cab + 0.1, nose - 1.35, nose - 0.25]) b.line([x, foot + 0.2], [x, 2.85], 'rgba(10,12,16,0.6)', 2.4);
      for (const x of [nose - 1.55, nose - 0.45]) b.poly([[x - 0.16, 1.82], [x, 1.82], [x, 1.86], [x - 0.16, 1.86]], '#2a2c30');
      if (old) {
        b.poly([[nose - 1.33, 1.05], [nose - 0.27, 1.05], [nose - 0.27, 1.95], [nose - 1.33, 1.95]], white);
        b.frame([nose - 0.8, 1.68], [1, 0], [0, -1]);
        const g = b.g;
        g.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const r = i % 2 ? 55 : 125;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.fillStyle = '#d9a520';
        g.fill();
        g.setTransform(1, 0, 0, 1, 0, 0);
        b.text('KESKLINNA', [nose - 0.8, 1.38], 0.08, '#1c1c1c', 0.9);
      }
    }
    b.text('112', [nose - 1.95, 1.62], 0.14, '#ffffff', 0.4);
    b.text('PÄÄSTE', [-1.5, 2.9], 0.12, '#ffffff', 1.2);
    b.line([tail, 2.82], [cab - 0.08, 2.82], '#f2d21a', 4);
    if (old) stripes(tail, nose, foot + 0.02, 1.2, '#c21f1a', white);
    else stripes(tail, nose, foot + 0.02, 1.24, '#f2d21a', white);
    for (const ax of [xf, xr]) {
      b.frame([ax, R], [1, 0], [0, -1]);
      const g = b.g;
      g.beginPath();
      g.arc(0, 0, R * 0.6 * 1000, 0, Math.PI * 2);
      g.fillStyle = '#3a3d42';
      g.fill();
      g.beginPath();
      g.arc(0, 0, R * 0.45 * 1000, 0, Math.PI * 2);
      g.fillStyle = '#8c9096';
      g.fill();
      g.fillStyle = '#2a2c30';
      for (let i = 0; i < 10; i++) g.fillRect(Math.cos((i / 10) * Math.PI * 2) * 160 - 12, Math.sin((i / 10) * Math.PI * 2) * 160 - 12, 24, 24);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
  } else if (b.r === 'front') {
    if (!glow) {
      // The grille panel over the bumper, and a dark band under the windscreen.
      b.poly([[-0.6, 0.76], [0.6, 0.76], [0.6, 1.21], [-0.6, 1.21]], '#2b2d31');
      for (let y = 0.82; y < 1.2; y += 0.07) b.line([-0.58, y], [0.58, y], '#1a1b1e', 3);
      b.poly([[-1.05, 1.6], [1.05, 1.6], [1.05, 1.76], [-1.05, 1.76]], '#1b1c1f');
      b.poly([[-W / 2, 0.3], [W / 2, 0.3], [W / 2, 0.72], [-W / 2, 0.72]], '#18191b');
      if (plateText) plate(b, [0, 0.52], plateText);
    }
    if (old) {
      stripes(-W / 2, -W / 2 + 0.4, 0.3, 0.72, '#c21f1a', white);
      stripes(W / 2 - 0.4, W / 2, 0.3, 0.72, '#c21f1a', white, -1);
    }
    b.text('PÄÄSTE', [0, 2.81], 0.07, '#ffffff', 0.9);
  } else if (b.r === 'back') {
    stripes(-W / 2, W / 2, foot + 0.05, 1.3, '#c21f1a', '#f2d21a');
    b.text('PÄÄSTE', [0, 2.45], 0.16, '#ffffff', 1.4);
    b.text('112', [0, 2.15], 0.16, '#ffffff', 0.8);
    if (plateText && !glow) plate(b, [0, 0.95], plateText);
  } else if (!glow) {
    // The roof: aluminium tread plate over the body, the brigade's name along the cab roof.
    b.poly([[tail, -W / 2], [cab - 0.05, -W / 2], [cab - 0.05, W / 2], [tail, W / 2]], '#c3c6ca');
    for (let x = tail + 0.6; x < cab; x += 0.9) b.line([x, -W / 2], [x, W / 2], 'rgba(60,64,70,0.5)', 2);
    b.frame([(cab + nose) / 2, 0], [1, 0], [0, 1]);
    b.g.font = '700 300px Arial, sans-serif';
    b.g.textAlign = 'center';
    b.g.fillStyle = '#ffffff';
    b.g.fillText('KESKLINNA', 0, 110, 2400);
    b.g.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/**
 * The fire engine: a crew cab with four doors, its front upright to the windscreen and raked above, the vertical
 * corners chamfered; a black bumper with the headlamps at its ends and a grille panel with two blue lamps over it;
 * the equipment body coming down to 0.6 m with arches cut round the wheels, so that no tyre stands outside the body;
 * twin tyres at the back; ladder and lockers on the roof.
 */
function drawFireEngine(mb: CarBuilders, f: Xf | undefined, sink: LampSink, skin?: Facet[]): CarSpots {
  const { L, W, H, R, xf, xr, cab, foot, arch } = FIRE;
  const hw = W / 2;
  const nose = L / 2;
  const tail = -L / 2;
  const red = shade(0xc21f1a);
  const dark = shade(0x1b1c1e);
  const plastic = mb.plastic ?? mb.paint;
  const ch = 0.12;
  // A painted wall: drawn, and handed to the atlas.
  const wall = (p: [P3, P3, P3, P3], n: P3) => {
    mb.paint.quadAt(p[0], p[1], p[2], p[3], red, n, f);
    if (skin) skin.push({ p, n: [n, n, n, n] });
  };
  const archPts = (cx: number, y0: number, n = 12): V2[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = Math.PI - (Math.PI * i) / n;
      return [cx + Math.cos(a) * arch, Math.max(y0, R + Math.sin(a) * arch)] as V2;
    });
  // The sides of the cab and the body below the windows, with the arches cut out: one wall per slice.
  const side = (x0: number, x1: number, y1: number, ax: number) => {
    const xs = [x0, ...archPts(ax, foot).map((p) => p[0]).filter((x) => x > x0 && x < x1), x1];
    const yAt = (x: number) => (Math.abs(x - ax) < arch ? Math.max(foot, R + Math.sqrt(arch * arch - (x - ax) ** 2)) : foot);
    for (let i = 0; i < xs.length - 1; i++) {
      for (const sd of [1, -1]) wall([[xs[i], yAt(xs[i]), sd * hw], [xs[i + 1], yAt(xs[i + 1]), sd * hw], [xs[i + 1], y1, sd * hw], [xs[i], y1, sd * hw]], [0, 0, sd]);
    }
  };
  side(cab, nose - ch, 1.8, xf);
  side(tail, cab - 0.06, H, xr);
  // The cab's front (upright, then the raked screen and the roof's edge), its chamfered corners and its roof.
  const ys = [foot, 1.8, 2.84, 3.0];
  for (let i = 0; i < ys.length - 1; i++) {
    const [y0, y1] = [ys[i], ys[i + 1]];
    const [x0, x1] = [fireFront(y0), fireFront(y1)];
    const n: P3 = [y1 - y0, x0 - x1, 0];
    const k = Math.hypot(n[0], n[1]);
    const nn: P3 = [n[0] / k, n[1] / k, 0];
    wall([[x0, y0, -(hw - ch)], [x0, y0, hw - ch], [x1, y1, hw - ch], [x1, y1, -(hw - ch)]], nn);
    for (const sd of [1, -1]) {
      const c: P3 = [nn[0] * 0.7, nn[1] * 0.7, sd * 0.7];
      wall([[x0, y0, sd * (hw - ch)], [x0 - ch, y0, sd * hw], [x1 - ch, y1, sd * hw], [x1, y1, sd * (hw - ch)]], c);
      // Above the windscreen's foot the cab's side follows the rake back.
      if (y0 >= 1.8) wall([[cab, y0, sd * hw], [x0 - ch, y0, sd * hw], [x1 - ch, y1, sd * hw], [cab, y1, sd * hw]], [0, 0, sd]);
    }
  }
  wall([[cab, 3.0, -hw], [cab, 3.0, hw], [fireFront(3.0) - ch, 3.0, hw], [fireFront(3.0) - ch, 3.0, -hw]], [0, 1, 0]);
  wall([[cab, foot, -hw], [cab, foot, hw], [cab, 3.0, hw], [cab, 3.0, -hw]], [-1, 0, 0]);
  // The body's back and roof.
  wall([[tail, foot, -hw], [tail, foot, hw], [tail, H, hw], [tail, H, -hw]], [-1, 0, 0]);
  wall([[tail, H, -hw], [tail, H, hw], [cab - 0.06, H, hw], [cab - 0.06, H, -hw]], [0, 1, 0]);
  wall([[cab - 0.06, 3.0, -hw], [cab - 0.06, 3.0, hw], [cab - 0.06, H, hw], [cab - 0.06, H, -hw]], [1, 0, 0]);
  // Glass: the raked windscreen, a window in each door.
  const glass = shade(GLASS);
  const gy0 = 1.86;
  const gy1 = 2.78;
  mb.glass.quadAt([fireFront(gy0) + 0.01, gy0, -(hw - 0.16)], [fireFront(gy0) + 0.01, gy0, hw - 0.16], [fireFront(gy1) + 0.01, gy1, hw - 0.16], [fireFront(gy1) + 0.01, gy1, -(hw - 0.16)], glass, [1, 0.14, 0], f);
  for (const sd of [1, -1]) {
    const z = sd * (hw + 0.006);
    for (const [a, c] of [[nose - 1.25, nose - 0.35], [cab + 0.25, nose - 1.45]] as const) mb.glass.quadAt([a, 2.02, z], [c, 2.02, z], [c, 2.76, z], [a, 2.76, z], glass, [0, 0, sd], f);
  }
  // The chassis, seen only under the arches, and black liners in them.
  mb.glass.prism(rect(tail + 0.3, 0.45, nose - 0.4, foot + 0.02), -hw + 0.6, hw - 0.6, dark, f);
  for (const ax of [xf, xr]) {
    for (const sd of [1, -1]) {
      const m = 10;
      for (let k = 0; k < m; k++) {
        const a0 = (k / m) * Math.PI;
        const a1 = ((k + 1) / m) * Math.PI;
        const p = (a: number, z: number): P3 => [ax + Math.cos(a) * (arch - 0.01), R + Math.sin(a) * (arch - 0.01), z];
        mb.glass.quadAt(p(a0, sd * (hw - 0.75)), p(a1, sd * (hw - 0.75)), p(a1, sd * (hw - 0.01)), p(a0, sd * (hw - 0.01)), dark, [-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), 0], f);
      }
    }
  }
  // Ladder and lockers on the roof.
  mb.paint.prism(rect(tail + 0.3, H, cab - 0.6, H + 0.22), -hw + 0.12, hw - 0.5, shade(0xa9acb0), f);
  mb.paint.prism(rect(tail + 0.1, H + 0.12, cab - 0.3, H + 0.2), hw - 0.42, hw - 0.36, shade(0xc9ccd0), f);
  mb.paint.prism(rect(tail + 0.1, H + 0.12, cab - 0.3, H + 0.2), hw - 0.16, hw - 0.1, shade(0xc9ccd0), f);
  // The black bumper across the front, wrapping round the corners.
  plastic.prism(rect(nose - 0.25, 0.35, nose + 0.06, 0.7), -hw + 0.02, hw - 0.02, shade(0x18191b), f);
  if (skin) skin.push({ p: [[nose + 0.062, 0.3, -hw], [nose + 0.062, 0.3, hw], [nose + 0.062, 0.72, hw], [nose + 0.062, 0.72, -hw]], n: [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]] });
  // Mirrors on their arms at the front corners of the cab.
  for (const sd of [1, -1]) {
    mb.glass.prism(rect(nose - 0.34, 2.02, nose - 0.28, 2.08), sd * (hw - 0.04), sd * (hw + 0.24), dark, f);
    mb.glass.prism([[nose - 0.34, 1.72], [nose - 0.24, 1.72], [nose - 0.23, 2.22], [nose - 0.34, 2.24]], sd * (hw + 0.22), sd * (hw + 0.3), dark, f);
  }
  // Wheels: single at the front, twin at the back (each 0.28 m wide, 5 cm apart), all inside the body's line.
  const tyre = shade(TYRE);
  const tyres: [number, number, number][] = [[xf, hw - 0.36, hw - 0.04], [xr, hw - 0.32, hw - 0.04], [xr, hw - 0.65, hw - 0.37]];
  for (const [ax, z0, z1] of tyres) {
    for (const sd of [1, -1]) {
      const ring: V2[] = Array.from({ length: 20 }, (_, i) => [ax + Math.cos((i / 20) * Math.PI * 2) * R, R + Math.sin((i / 20) * Math.PI * 2) * R] as V2);
      plastic.prism(ring, sd * z0, sd * z1, tyre, f);
    }
  }
  for (const ax of [xf, xr]) {
    for (const sd of [1, -1]) {
      const zo = sd * (hw - 0.035);
      for (let k = 0; k < 16; k++) {
        const a0 = (k / 16) * Math.PI * 2;
        const a1 = ((k + 1) / 16) * Math.PI * 2;
        const c: P3 = [ax, R, zo];
        const p0: P3 = [ax + Math.cos(a0) * R * 0.62, R + Math.sin(a0) * R * 0.62, zo];
        const p1: P3 = [ax + Math.cos(a1) * R * 0.62, R + Math.sin(a1) * R * 0.62, zo];
        if (skin) skin.push({ p: sd > 0 ? [c, p0, p1] : [c, p1, p0], n: [[0, 0, sd], [0, 0, sd], [0, 0, sd]], side: true });
        else if (sd > 0) mb.paint.triAt(c, p0, p1, shade(0x8c9096), f);
        else mb.paint.triAt(c, p1, p0, shade(0x8c9096), f);
      }
    }
  }
  for (const sd of [1, -1]) {
    // Rectangular headlamps at the bumper's ends, indicators outside them.
    lampFace(sink, nose + 0.078, 0.44, 0.6, sd * 0.78, sd * 1.02, 0xd5dade, 'head');
    lampFace(sink, nose + 0.078, 0.44, 0.6, sd * 1.03, sd * 1.16, 0xc98a2a, 'amber');
    lampFace(sink, tail - 0.012, 0.98, 1.3, sd * 0.95, sd * 1.18, 0x8e1414, 'tail');
    // Blue lamps on the body's upper rear corners, seen from behind and from the side.
    lampFace(sink, tail - 0.012, H - 0.22, H - 0.04, sd * 0.95, sd * 1.2, 0x3456a8, sd > 0 ? 'ledB' : 'ledA');
    sink.quad([tail + 0.05, H - 0.22, sd * (hw + 0.01)], [tail + 0.3, H - 0.22, sd * (hw + 0.01)], [tail + 0.3, H - 0.04, sd * (hw + 0.01)], [tail + 0.05, H - 0.04, sd * (hw + 0.01)], [0, 0, sd], 0x3456a8, sd > 0 ? 'ledB' : 'ledA');
    // And two in the grille panel.
    lampFace(sink, nose + 0.02, 1.0, 1.1, sd * 0.38, sd * 0.56, 0x6f9fd8, sd > 0 ? 'ledB' : 'ledA');
  }
  return {
    head: [[nose + 0.08, 0.52, 0.9], [nose + 0.08, 0.52, -0.9]],
    tail: [[tail - 0.02, 1.14, 1.05], [tail - 0.02, 1.14, -1.05]],
    bar: [nose - 0.6, 3.02, 0],
    barWidth: 2.0,
    half: hw,
    nose,
    tail2: tail,
    belt: 2.0,
    floor: foot,
    yNose: 1.75,
  };
}

interface Atlas {
  material: MeshStandardMaterial;
  /** Which cells of the atlas (8 x 8 pixels) carry paint. */
  mask: Uint8Array;
  frame: Frame;
  refs: number;
  textures: Texture[];
}

const atlases = new Map<string, Atlas>();
const idle: string[] = [];
const MASK = 8;

function atlasKey(look: CarLook): string {
  const markings = look.livery === 'police' || look.livery === 'ambulance' || look.livery === 'rescue' ? look.livery + (look.livery === 'police' ? look.marks ?? 'patrol' : '') : 'none';
  return `${look.model ?? look.body}:${markings}:${look.plate ?? ''}:${noseVariant(look)}`;
}

/** Paint a car's atlas (shared by every car of the same model, livery and plate), or take it from the cache. */
function atlasFor(look: CarLook): Atlas {
  const key = atlasKey(look);
  const known = atlases.get(key);
  if (known) {
    known.refs++;
    const i = idle.indexOf(key);
    if (i >= 0) idle.splice(i, 1);
    return known;
  }
  const fire = look.livery === 'rescue' && look.body === 'truck';
  const s = shapeOf(look);
  const l = linesOf(s);
  const base: Omit<Frame, 'k'> = fire ? { L: FIRE.L, Hm: FIRE.H + 0.1, Wm: FIRE.W + 0.1 } : { L: s.L, Hm: s.H + 0.1, Wm: s.W + 0.1 };
  const regions: Region[] = ['right', 'left', 'top', 'back', 'front'];
  const draw = (k: number, glow: boolean): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = AW * k;
    c.height = AH * k;
    const g = c.getContext('2d')!;
    if (glow) {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, c.width, c.height);
    }
    const fr: Frame = { ...base, k };
    const lit = '#e8eef2';
    for (const r of regions) {
      const b = new Brush(g, fr, r);
      if (fire) {
        paintRescue(b, glow, look.plate, noseVariant(look) === 0);
        continue;
      }
      if (look.livery === 'police') paintPolice(b, s, l, look.marks !== 'local', glow);
      else if (look.livery === 'ambulance') paintAmbulance(b, s, l, glow);
      if (glow) continue;
      if (r === 'right' || r === 'left') {
        // Clear the arches, then the details on top.
        g.save();
        g.globalCompositeOperation = 'destination-out';
        for (const ax of [s.xf, s.xr]) b.poly(Array.from({ length: 16 }, (_, i) => [ax + Math.cos((i / 16) * Math.PI * 2) * l.arch, s.wheel + Math.sin((i / 16) * Math.PI * 2) * l.arch] as V2), '#000');
        g.restore();
        paintSides(b, s, l, look.livery === 'police' ? '#1d5aa5' : 'rgba(0,0,0,0.18)', rimOf(look));
      } else if (r === 'top' && look.body === 'pickup') {
        // The open load bed seen from above: its floor and its inner walls in shadow.
        const x0 = -s.L / 2 + 0.06;
        const x1 = s.xDeck - 0.04;
        const w = l.half((x0 + x1) / 2) - 0.07;
        b.poly([[x0, -w], [x1, -w], [x1, w], [x0, w]], '#1f2023');
        for (let x = x0 + 0.12; x < x1; x += 0.16) b.line([x, -w], [x, w], '#2c2d31', 2);
      } else if (r === 'front') {
        paintFront(b, s, lit, noseVariant(look));
        if (look.plate) plate(b, [0, s.yFloor + 0.3], look.plate);
      } else if (r === 'back') {
        paintBack(b, s, l);
        const at: V2 = look.livery === 'ambulance' ? [0.3, 0.6] : s.H > 1.85 ? [-0.42, s.yFloor + 0.95] : [0, Math.min(s.yTail - 0.34, s.yFloor + 0.82)];
        if (look.plate) plate(b, at, look.plate);
      }
    }
    return c;
  };
  const tex = new CanvasTexture(draw(1, false));
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const glowTex = new CanvasTexture(draw(GLOW_K, true));
  glowTex.colorSpace = SRGBColorSpace;
  // Which 8-pixel cells carry paint: a facet whose painting would be empty is left out of the mesh.
  const img = (tex.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, AW, AH).data;
  const mw = AW / MASK;
  const mask = new Uint8Array(mw * (AH / MASK));
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) if (img[(y * AW + x) * 4 + 3] > 24) mask[Math.floor(y / MASK) * mw + Math.floor(x / MASK)] = 1;
  const material = new MeshPhysicalMaterial({
    map: tex,
    emissiveMap: glowTex,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    alphaTest: 0.5,
    metalness: 0.05,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const atlas: Atlas = { material, mask, frame: { ...base, k: 1 }, refs: 1, textures: [tex, glowTex] };
  atlases.set(key, atlas);
  return atlas;
}

/** A car no longer needs its atlas: keep a few unused ones for the next car, free the rest. */
function releaseAtlas(look: CarLook) {
  const key = atlasKey(look);
  const a = atlases.get(key);
  if (!a || --a.refs > 0) return;
  idle.push(key);
  while (idle.length > 6) {
    const old = idle.shift()!;
    const o = atlases.get(old);
    if (!o) continue;
    o.material.dispose();
    o.textures.forEach((t) => t.dispose());
    atlases.delete(old);
  }
}

/** The painted faces of a car with their places in the atlas, each pushed out a few millimetres. */
function decalGeometry(facets: Facet[], atlas: Atlas): BufferGeometry | null {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const fr = atlas.frame;
  const mw = AW / MASK;
  const mh = AH / MASK;
  for (const ft of facets) {
    const n = ft.n.reduce<[number, number, number]>((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
    const r: Region = ft.side ? (n[2] > 0 ? 'right' : 'left') : n[1] > 0.62 * Math.hypot(...n) ? 'top' : n[0] > 0.55 * Math.hypot(...n) ? 'front' : n[0] < -0.55 * Math.hypot(...n) ? 'back' : n[2] > 0 ? 'right' : 'left';
    const px = ft.p.map((p) => (r === 'right' || r === 'left' ? toPx(fr, r, p[0], p[1]) : r === 'top' ? toPx(fr, r, p[0], p[2]) : toPx(fr, r, p[2], p[1])));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of px) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    let hit = false;
    for (let cy = Math.max(0, Math.floor(y0 / MASK)); cy <= Math.min(mh - 1, Math.floor(y1 / MASK)) && !hit; cy++) {
      for (let cx = Math.max(0, Math.floor(x0 / MASK)); cx <= Math.min(mw - 1, Math.floor(x1 / MASK)); cx++) {
        if (atlas.mask[cy * mw + cx]) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) continue;
    // Wound to face the way the skin faces.
    const [a, b, c] = ft.p;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
    const order = ft.p.length === 4 ? (flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) : flip ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) {
      const p = ft.p[i];
      const nn = ft.n[i];
      const off = ft.side ? 0.001 : 0.003;
      pos.push(p[0] + nn[0] * off, p[1] + nn[1] * off, p[2] + nn[2] * off);
      nor.push(nn[0], nn[1], nn[2]);
      uv.push(px[i][0] / AW, 1 - px[i][1] / AH);
    }
  }
  if (!pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.computeBoundingSphere();
  return g;
}

// ── Lamps: one mesh, its glow read from a texture of lamp states ──

const GROUPS: LampGroup[] = ['head', 'tail', 'amber', 'blueA', 'blueB', 'ledA', 'ledB'];
const SLOTS = 8;

/** The faces of a car's lamps, each with the texel of its group. */
class LampParts implements LampSink {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private tmp = new Color();
  tris = 0;

  quad(a: P3, b: P3, c: P3, d: P3, n: P3, color: number, group: LampGroup) {
    const u = (GROUPS.indexOf(group) + 0.5) / SLOTS;
    this.tmp.setHex(color);
    // Wound to face along n.
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
    const order = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const p of order) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(this.tmp.r, this.tmp.g, this.tmp.b);
      this.uv.push(u, 0.5);
    }
    this.tris += 2;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.computeBoundingSphere();
    return g;
  }
}

export interface CarTextures {
  glow: Texture;
  beam: Texture;
}

/** One blue flash pattern: two quick blinks on one side, then two on the other. `side` 0 or 1. */
export function beaconOn(t: number, side: 0 | 1, rate = 1.7): boolean {
  const ph = (t * rate + side * 0.5) % 1;
  return ph < 0.11 || (ph > 0.19 && ph < 0.3);
}

let flareTex: DataTexture | null = null;

/**
 * The glow round a lit blue lens: a smooth round falloff kept in linear values with a little noise in it, so that
 * the faint outer rings do not show as steps when it is added onto a dark picture. Stretched flat into a
 * horizontal flare by its sprite's scale.
 */
function flareTexture(): DataTexture {
  if (flareTex) return flareTex;
  const n = 64;
  const d = new Uint8Array(n * n * 4);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = r >= 1 ? 0 : Math.exp(-r * r * 5.5) * (1 - r * r) ** 2;
      const v = Math.max(0, Math.min(255, a * 255 + (rnd() - 0.5) * 2.2 * (a > 0 ? 1 : 0)));
      d.set([255, 255, 255, Math.round(v)], (y * n + x) * 4);
    }
  }
  flareTex = new DataTexture(d, n, n, RGBAFormat);
  flareTex.magFilter = LinearFilter;
  flareTex.minFilter = LinearFilter;
  flareTex.needsUpdate = true;
  return flareTex;
}

/** How much of the blue lights' throw on the street to show: none in daylight, all of it at dusk and at night. */
const nightShare = (dark: number) => Math.min(1, Math.max(0, (dark - 0.12) / 0.45));

/** Lamp colours when lit, as texels (scaled up by the material's glow strength). */
const LIT: Record<LampGroup, [number, number, number]> = {
  head: [255, 246, 228],
  tail: [120, 10, 6],
  amber: [255, 140, 20],
  blueA: [40, 110, 255],
  blueB: [40, 110, 255],
  ledA: [40, 110, 255],
  ledB: [40, 110, 255],
};

export class CarMesh {
  readonly group = new Group();
  readonly look: CarLook;
  /** The light bar's place in the car's own coordinates (for the scene's blue light). */
  readonly bar: P3;
  /** Triangles in this car's meshes (budget: 5 500). */
  readonly triangles: number;
  private states: DataTexture;
  private lampMat: MeshStandardMaterial;
  private decal: MeshStandardMaterial | null = null;
  private beacons = false;
  /** The light bars' flares, by half (B: the right one) and size (the wide one shows only in the dark). */
  private barGlow: { s: Sprite; b: boolean; wide: boolean }[] = [];
  /** A small glow at each LED head, by its group (B or A) and whether it flashes with the bar or with the LEDs. */
  private ledGlow: { s: Sprite; b: boolean; bar: boolean }[] = [];
  private dark = 0;
  private beam: Mesh;
  private headGlow: Sprite[] = [];
  private owned: { dispose: () => void }[] = [];
  private shown = -1;
  private hasBar = false;

  constructor(look: CarLook, tex: CarTextures) {
    this.look = look;
    const mb: CarBuilders = { paint: new MeshBuilder(), glass: new MeshBuilder(), plastic: new MeshBuilder() };
    const skin: Facet[] = [];
    const lamps = new LampParts();
    const spots = drawCar(mb, look, undefined, { lod: 'high', skin, lamps });
    this.bar = spots.bar;
    const mats = carMaterials();
    let tris = 0;
    for (const [builder, mat] of [[mb.paint, paintFor(look)], [mb.glass, mats.glass], [mb.plastic!, plasticFor()]] as const) {
      const m = new Mesh(builder.build(), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      this.owned.push(m.geometry);
      tris += (m.geometry.index?.count ?? 0) / 3;
    }
    if (lofted(look.body) || skin.length) {
      const atlas = atlasFor(look);
      const g = decalGeometry(skin, atlas);
      if (g) {
        const m = new Mesh(g, atlas.material);
        m.receiveShadow = true;
        this.group.add(m);
        this.owned.push(g);
        tris += g.attributes.position.count / 3;
      }
      this.decal = atlas.material;
      this.owned.push({ dispose: () => releaseAtlas(look) });
    }
    this.states = new DataTexture(new Uint8Array(SLOTS * 4), SLOTS, 1, RGBAFormat);
    this.states.magFilter = NearestFilter;
    this.states.minFilter = NearestFilter;
    this.states.colorSpace = SRGBColorSpace;
    this.states.needsUpdate = true;
    this.lampMat = new MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.14, emissive: 0xffffff, emissiveMap: this.states, emissiveIntensity: 3 });
    const lampMesh = new Mesh(lamps.build(), this.lampMat);
    this.group.add(lampMesh);
    this.owned.push(lampMesh.geometry, this.lampMat, this.states);
    tris += lamps.tris;
    this.triangles = tris;

    const one = spots.head.length === 1;
    for (const [x, y, z] of spots.head) {
      const s = new Sprite(new SpriteMaterial({ map: flareTexture(), color: 0xfff2d8, blending: AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(x + 0.12, y, z);
      s.scale.set(one ? 1.0 : 1.3, one ? 0.7 : 0.8, 1);
      s.visible = false;
      this.group.add(s);
      this.headGlow.push(s);
      this.owned.push(s.material);
    }
    if (hasBeacons(look.livery)) {
      this.beacons = true;
      const b = beaconsOf(look, lofted(look.body) ? shapeOf(look) : null, spots);
      const flare = (x: number, y: number, z: number, w: number, h: number, wide: boolean): Sprite => {
        const s = new Sprite(new SpriteMaterial({ map: flareTexture(), color: 0x4a7dff, blending: AdditiveBlending, depthWrite: false, transparent: true }));
        s.position.set(x, y, z);
        s.scale.set(w, h, 1);
        s.visible = false;
        this.group.add(s);
        this.owned.push(s.material);
        if (wide) s.renderOrder = 1;
        return s;
      };
      // A low LED bar: each half a flat flare hugging its own lens, and at night a wider soft one round it.
      for (const bar of b.bar) {
        this.hasBar = true;
        for (const side of [0, 1] as const) {
          const z = (side ? 1 : -1) * bar.width * 0.3;
          const y = bar.c[1] + 0.05;
          this.barGlow.push({ s: flare(bar.c[0], y, z, 0.72, 0.22, false), b: side === 1, wide: false });
          this.barGlow.push({ s: flare(bar.c[0], y + 0.02, z, 1.9, 0.55, true), b: side === 1, wide: true });
        }
      }
      // The small LED heads and the hidden lights: a small glow on each, never bigger than the lamp's own place.
      for (const e of b.leds) {
        const k = e.inside ? 0.3 : 0.5;
        const s = flare(e.c[0] + e.n[0] * 0.04, e.c[1] + e.n[1] * 0.04, e.c[2] + e.n[2] * 0.04, k * 1.4, k, false);
        this.ledGlow.push({ s, b: e.g === 'ledB' || e.g === 'blueB', bar: e.g === 'blueA' || e.g === 'blueB' });
      }
    }
    // The pool of light the headlights throw on the road.
    const beam = new Mesh(beamPlane, new MeshBasicMaterial({ map: tex.beam, color: 0xfff0d0, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    beam.rotation.x = -Math.PI / 2;
    beam.rotation.z = -Math.PI / 2;
    beam.scale.set(7, 16, 1);
    beam.position.set(spots.nose + 7.6, 0.1, 0);
    beam.visible = false;
    beam.renderOrder = 2;
    this.group.add(beam);
    this.owned.push(beam.material as MeshBasicMaterial);
    this.beam = beam;
  }

  /** Place the car: scene position, yaw, and its lamps at world time t (seconds). `dark`: 0 day .. 1 night. */
  update(pos: V2, yaw: number, lights: CarLights, t: number, dark: number) {
    this.group.position.set(pos[0], 0, -pos[1]);
    this.group.rotation.y = yaw;
    const on = lights.lamps;
    const blink = lights.hazard && t % 0.9 < 0.45;
    const rate = this.rate();
    const a = lights.beacons && beaconOn(t, 0, rate);
    const b = lights.beacons && beaconOn(t, 1, rate);
    const la = lights.beacons && beaconOn(t + 0.13, 1, rate * 1.3);
    const lb = lights.beacons && beaconOn(t + 0.13, 0, rate * 1.3);
    // One number for the lamps' state: the texture is uploaded only when it changes.
    const state = (on ? 1 : 0) | (lights.braking ? 2 : 0) | (blink ? 4 : 0) | (a ? 8 : 0) | (b ? 16 : 0) | (la ? 32 : 0) | (lb ? 64 : 0);
    if (state !== this.shown) {
      this.shown = state;
      const d = this.states.image.data as Uint8Array;
      const put = (i: number, lit: boolean, k = 1) => {
        const c = LIT[GROUPS[i]];
        d[i * 4] = lit ? c[0] * k : 0;
        d[i * 4 + 1] = lit ? c[1] * k : 0;
        d[i * 4 + 2] = lit ? c[2] * k : 0;
        d[i * 4 + 3] = 255;
      };
      put(0, on);
      put(1, on || lights.braking, lights.braking ? 2.1 : 1);
      put(2, blink);
      put(3, a);
      put(4, b);
      put(5, la);
      put(6, lb);
      this.states.needsUpdate = true;
    }
    if (this.decal) this.decal.emissiveIntensity = 0.7 * dark;
    for (const s of this.headGlow) {
      s.visible = on && dark > 0.25;
      (s.material as SpriteMaterial).opacity = 0.5 + 0.4 * dark;
    }
    this.beam.visible = on && dark > 0.35;
    (this.beam.material as MeshBasicMaterial).opacity = 0.1 + 0.26 * dark;
    this.dark = dark;
    // By day only the lit lens and a faint flare on it show; the wide glow comes with the dark.
    const night = nightShare(dark);
    for (const e of this.barGlow) {
      e.s.visible = (e.b ? b : a) && (!e.wide || night > 0);
      (e.s.material as SpriteMaterial).opacity = e.wide ? 0.42 * night : 0.45 + 0.55 * dark;
    }
    for (const e of this.ledGlow) {
      e.s.visible = e.bar ? (e.b ? b : a) : e.b ? lb : la;
      (e.s.material as SpriteMaterial).opacity = 0.4 + 0.6 * dark;
    }
  }

  private rate() {
    return this.look.livery === 'ambulance' ? 2.1 : this.look.livery === 'rescue' ? 1.4 : 1.7;
  }

  /**
   * How strongly a blue light is lit right now, for the light it throws on the street (the scene multiplies its
   * blue lamp by this): 0 in daylight, where no beacon lights up the road, rising to 1 in the dark.
   */
  flashing(lights: CarLights, t: number): number {
    if (!this.beacons || !lights.beacons) return 0;
    const on = this.hasBar ? beaconOn(t, 0, this.rate()) || beaconOn(t, 1, this.rate()) : beaconOn(t + 0.13, 1, this.rate() * 1.3) || beaconOn(t + 0.13, 0, this.rate() * 1.3);
    return on ? nightShare(this.dark) : 0;
  }

  dispose() {
    for (const o of this.owned) o.dispose();
  }
}

const beamPlane = new PlaneGeometry(1, 1);

/** The colour a blue light throws on the street. */
export const BEACON_COLOR = new Color(0x3f6dff);
