/**
 * Vehicles for the camera picture. Cars, vans and pick-ups have a shaped body (carbody.ts); lorries, buses and
 * motorcycles are built from blocks. Paint reflects the sky, glass more so. A marked car carries its markings as
 * small paintings on its sides and bonnet (the Estonian police's blue and yellow-green with POLITSEI, an
 * ambulance's green and yellow) and has lamps that can be switched: headlights, tail lights, indicators, blue lights.
 *
 * A vehicle is drawn about its own origin: x forwards, y up, the wheels on the ground. `drawCar` writes the fixed
 * parts into mesh builders, so parked cars can be baked into the street; `CarMesh` is a car that moves.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';
import type { V2 } from '../math';
import { CAR_SIZE, hasBeacons, type CarLights, type CarLook, type Livery } from '../vehicle';
import { drawBody, lofted, shapeOf, type CarBuilders, type CarSpots } from './carbody';
import { MeshBuilder, shade, type P3, type Xf } from './mesh';

const GLASS = 0x34404c;
const TYRE = 0x0f0f10;
const DARK = 0x1c1d20;

const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function wheel(mb: CarBuilders, x: number, r: number, zIn: number, zOut: number, f?: Xf) {
  const ring: V2[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ring.push([x + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  mb.glass.prism(ring, zIn, zOut, shade(TYRE), f);
  const hub: V2[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    hub.push([x + Math.cos(a) * r * 0.55, r + Math.sin(a) * r * 0.55]);
  }
  mb.paint.prism(hub, zOut - Math.sign(zOut) * 0.02, zOut + Math.sign(zOut) * 0.012, shade(0x9a9da1), f);
}

/** A lorry, a bus or a motorcycle, from blocks. */
function drawBlocks(mb: CarBuilders, look: CarLook, f?: Xf): CarSpots {
  const { length: L, width: W, height: H, wheel: r } = CAR_SIZE[look.body];
  const paint = shade(look.color);
  const glass = shade(GLASS);
  const dark = shade(DARK);
  const hw = W / 2;
  const front = L / 2;
  const rear = -L / 2;
  if (look.body === 'moto') {
    wheel(mb, front - r - 0.05, r, -0.07, 0.07, f);
    wheel(mb, rear + r + 0.05, r, -0.07, 0.07, f);
    mb.paint.prism([[rear + 0.3, 0.45], [front - 0.45, 0.4], [front - 0.3, 0.95], [front - 0.75, 0.85], [rear + 0.25, 0.8]], -0.16, 0.16, paint, f);
    mb.glass.prism(rect(rear + 0.25, 0.8, front - 0.9, 0.9), -0.14, 0.14, dark, f);
    return { head: [[front - 0.28, 0.85, 0]], tail: [[rear + 0.22, 0.75, 0]], bar: [0, 1.1, 0], barWidth: 0.3, half: 0.3, nose: front, tail2: rear, belt: 0.9, floor: 0.3, yNose: 0.9 };
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
    mb.paint.prism([[rear, floor], [front, floor], [front, 1.3], [front - 0.25, H], [rear + 0.1, H], [rear, H - 0.3]], -hw, hw, paint, f);
    mb.glass.prism(rect(rear + 0.5, 1.4, front - 1.0, 2.45), -hw - 0.012, hw + 0.012, glass, f);
    mb.glass.prism([[front - 0.24, H - 0.12], [front + 0.012, 1.35], [front + 0.03, 1.35], [front - 0.22, H - 0.1]], -hw + 0.12, hw - 0.12, glass, f);
    mb.glass.prism(rect(rear - 0.012, 1.6, rear + 0.05, 2.45), -hw + 0.3, hw - 0.3, glass, f);
    bar = [0, H + 0.02, 0];
  }
  const ax = look.body === 'bus' ? [front - 2.4, rear + 2.9] : [front - 1.4, rear + 1.6];
  for (const x of ax) {
    wheel(mb, x, r, hw - 0.32, hw + 0.012, f);
    wheel(mb, x, r, -hw + 0.32, -hw - 0.012, f);
  }
  return {
    head: [[front + 0.02, floor + 0.12, hw - 0.4], [front + 0.02, floor + 0.12, -hw + 0.4]],
    tail: [[rear - 0.02, floor + 0.3, hw - 0.3], [rear - 0.02, floor + 0.3, -hw + 0.3]],
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

/** Draw a vehicle's fixed parts. Returns where its lamps and its light bar go. */
export function drawCar(mb: CarBuilders, look: CarLook, f?: Xf): CarSpots {
  const spots = lofted(look.body) ? drawBody(mb, look, f) : drawBlocks(mb, look, f);
  if (look.livery === 'taxi') mb.paint.prism(rect(spots.bar[0] - 0.12, spots.bar[1], spots.bar[0] + 0.12, spots.bar[1] + 0.15), -0.26, 0.26, shade(0xe3c21c), f);
  if (look.livery === 'police' || look.livery === 'ambulance' || look.livery === 'rescue') {
    // The light bar's dark base; its lenses are lamps (CarMesh).
    const w = spots.barWidth / 2 + 0.04;
    mb.glass.prism(rect(spots.bar[0] - 0.17, spots.bar[1] - 0.01, spots.bar[0] + 0.17, spots.bar[1] + 0.045), -w, w, shade(DARK), f);
  }
  return spots;
}

export type { CarLights };

const lampBox = new BoxGeometry(0.07, 0.12, 0.36);
const barBox = new BoxGeometry(0.26, 0.085, 0.5);
const beamPlane = new PlaneGeometry(1, 1);

let paintMat: MeshStandardMaterial | null = null;
let glassMat: MeshStandardMaterial | null = null;

/** The two materials every vehicle is made of: paint (and plain plastic) by the colour of its vertices, and glass. */
export function carMaterials(): { paint: MeshStandardMaterial; glass: MeshStandardMaterial } {
  paintMat ??= new MeshStandardMaterial({ vertexColors: true, metalness: 0.42, roughness: 0.4, envMapIntensity: 1 });
  glassMat ??= new MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.1, envMapIntensity: 1.3 });
  return { paint: paintMat, glass: glassMat };
}

// ── Markings: small paintings laid on a car's sides and bonnet ──

const decals = new Map<string, CanvasTexture>();

function decal(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  let t = decals.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    decals.set(key, t);
  }
  return t;
}

const NEON = '#c9de2f';
const BLUE = '#1b4fa8';

/** The band along a police car's side: blue with slanted yellow-green blocks and the word. */
function policeSide(): CanvasTexture {
  return decal('police-side', 512, 96, (g) => {
    g.fillStyle = BLUE;
    g.fillRect(0, 34, 512, 62);
    g.fillStyle = NEON;
    for (let x = -20; x < 520; x += 62) {
      g.beginPath();
      g.moveTo(x, 34);
      g.lineTo(x + 34, 34);
      g.lineTo(x + 14, 2);
      g.lineTo(x - 20, 2);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.font = '800 44px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('POLITSEI', 256, 67);
  });
}

function policeBonnet(): CanvasTexture {
  return decal('police-bonnet', 256, 192, (g) => {
    g.fillStyle = BLUE;
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = NEON;
    for (let i = 0; i < 4; i++) {
      // Chevrons pointing towards the nose.
      const y = 190 - i * 34;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y - 30);
      g.lineTo(256, y);
      g.lineTo(256, y - 14);
      g.lineTo(128, y - 44);
      g.lineTo(0, y - 14);
      g.closePath();
      g.fill();
    }
    g.fillStyle = BLUE;
    g.fillRect(28, 12, 200, 44);
    g.fillStyle = '#ffffff';
    g.font = '800 36px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('POLITSEI', 128, 35, 190);
  });
}

function ambulanceSide(): CanvasTexture {
  return decal('amb-side', 512, 128, (g) => {
    // Green and yellow squares in two rows, a red line over them, and the word.
    for (let x = 0; x < 512; x += 64) {
      for (let row = 0; row < 2; row++) {
        g.fillStyle = (x / 64 + row) % 2 ? '#2f9a52' : '#e3c21c';
        g.fillRect(x, 64 + row * 32, 64, 32);
      }
    }
    g.fillStyle = '#b5201c';
    g.fillRect(0, 50, 512, 10);
    g.fillStyle = '#b5201c';
    g.font = '800 40px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('KIIRABI', 256, 24);
  });
}

function rescueSide(): CanvasTexture {
  return decal('rescue-side', 512, 96, (g) => {
    g.fillStyle = '#e6e2d6';
    g.font = '800 62px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PÄÄSTE 112', 256, 50);
  });
}

/** A flat painting on a car: four corners (in the car's own space) and how the picture lies on them. */
function decalMesh(tex: Texture, corners: [P3, P3, P3, P3]): Mesh {
  const g = new BufferGeometry();
  const pos = new Float32Array(12);
  corners.forEach((c, i) => pos.set(c, i * 3));
  g.setAttribute('position', new BufferAttribute(pos, 3));
  // Corners are given bottom-left, bottom-right, top-right, top-left of the picture.
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  const m = new Mesh(g, new MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.2, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.renderOrder = 1;
  return m;
}

function markings(look: CarLook, spots: CarSpots): Mesh[] {
  const out: Mesh[] = [];
  const livery: Livery = look.livery;
  const z = spots.half + 0.007;
  if (livery === 'police' && lofted(look.body)) {
    const s = shapeOf(look);
    const x0 = s.xr + s.wheel + 0.13;
    const x1 = s.xf - s.wheel - 0.13;
    const y0 = spots.floor + 0.3;
    const y1 = spots.belt - 0.1;
    // Read from left to right on both sides: the right side runs tail to nose, the left nose to tail.
    out.push(decalMesh(policeSide(), [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]));
    out.push(decalMesh(policeSide(), [[x1, y0, -z], [x0, y0, -z], [x0, y1, -z], [x1, y1, -z]]));
    // The bonnet, read from in front of the car.
    const b0 = s.xCowl + 0.14;
    const b1 = s.xHood - 0.06;
    const h0 = s.yCowl + 0.036;
    const h1 = s.yHood + 0.03;
    out.push(decalMesh(policeBonnet(), [[b1, h1, -0.56], [b1, h1, 0.56], [b0, h0, 0.56], [b0, h0, -0.56]]));
  } else if (livery === 'ambulance' && lofted(look.body)) {
    const s = shapeOf(look);
    const x0 = s.xr + s.wheel + 0.15;
    const x1 = s.xf - s.wheel - 0.15;
    const y0 = spots.floor + 0.42;
    const y1 = spots.belt + 0.42;
    out.push(decalMesh(ambulanceSide(), [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]));
    out.push(decalMesh(ambulanceSide(), [[x1, y0, -z], [x0, y0, -z], [x0, y1, -z], [x1, y1, -z]]));
  } else if (livery === 'rescue') {
    const { length: L, height: H } = CAR_SIZE[look.body];
    const x0 = -L / 2 + 0.5;
    const x1 = L / 2 - 3;
    out.push(decalMesh(rescueSide(), [[x0, H - 1.25, z + 0.012], [x1, H - 1.25, z + 0.012], [x1, H - 0.55, z + 0.012], [x0, H - 0.55, z + 0.012]]));
    out.push(decalMesh(rescueSide(), [[x1, H - 1.25, -z - 0.012], [x0, H - 1.25, -z - 0.012], [x0, H - 0.55, -z - 0.012], [x1, H - 0.55, -z - 0.012]]));
  }
  return out;
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

export class CarMesh {
  readonly group = new Group();
  readonly look: CarLook;
  /** The light bar's place in the car's own coordinates (for the scene's blue light). */
  readonly bar: P3;
  private head: MeshBasicMaterial;
  private tail: MeshBasicMaterial;
  private amber: MeshBasicMaterial;
  private blue: [MeshBasicMaterial, MeshBasicMaterial] | null = null;
  private glow: [Sprite, Sprite] | null = null;
  private beam: Mesh | null = null;
  private headGlow: Sprite[] = [];
  private owned: { dispose: () => void }[] = [];

  constructor(look: CarLook, tex: CarTextures) {
    this.look = look;
    const mb: CarBuilders = { paint: new MeshBuilder(), glass: new MeshBuilder() };
    const spots = drawCar(mb, look);
    this.bar = spots.bar;
    const mats = carMaterials();
    for (const [builder, mat] of [[mb.paint, mats.paint], [mb.glass, mats.glass]] as const) {
      const m = new Mesh(builder.build(), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      this.owned.push(m.geometry);
    }
    for (const d of markings(look, spots)) {
      this.group.add(d);
      this.owned.push(d.geometry, d.material as MeshStandardMaterial);
    }

    this.head = new MeshBasicMaterial({ color: 0x33332f });
    this.tail = new MeshBasicMaterial({ color: 0x3a0c0c });
    this.amber = new MeshBasicMaterial({ color: 0x3a2a0a });
    const one = spots.head.length === 1;
    for (const [x, y, z] of spots.head) {
      const m = new Mesh(lampBox, this.head);
      m.position.set(x, y, z);
      if (one) m.scale.z = 0.5;
      this.group.add(m);
      const s = new Sprite(new SpriteMaterial({ map: tex.glow, color: 0xfff2d8, blending: AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(x + 0.1, y, z);
      s.scale.setScalar(1.7);
      s.visible = false;
      this.group.add(s);
      this.headGlow.push(s);
      const a = new Mesh(lampBox, this.amber);
      a.position.set(x - 0.03, y - 0.005, z + Math.sign(z) * 0.2);
      a.scale.set(1, 0.7, 0.22);
      this.group.add(a);
    }
    for (const [x, y, z] of spots.tail) {
      const m = new Mesh(lampBox, this.tail);
      m.position.set(x, y, z);
      m.scale.z = one ? 0.5 : 0.85;
      this.group.add(m);
      const a = new Mesh(lampBox, this.amber);
      a.position.set(x + 0.03, y - 0.005, z + Math.sign(z) * 0.18);
      a.scale.set(1, 0.7, 0.22);
      this.group.add(a);
    }
    if (hasBeacons(look.livery)) {
      const plain = look.livery === 'plain';
      this.blue = [new MeshBasicMaterial({ color: 0x0a1430 }), new MeshBasicMaterial({ color: 0x0a1430 })];
      const sprites: Sprite[] = [];
      for (const side of [0, 1] as const) {
        const z = (side ? 1 : -1) * (plain ? 0.3 : spots.barWidth / 4);
        const m = new Mesh(barBox, this.blue[side]);
        // An unmarked car has its lights behind the windscreen instead of on the roof.
        if (plain) {
          m.position.set(spots.bar[0] + 0.62, spots.bar[1] - 0.2, z);
          m.scale.set(0.35, 0.5, 0.45);
        } else {
          m.position.set(spots.bar[0], spots.bar[1] + 0.085, z);
          m.scale.z = spots.barWidth / 2 / 0.5;
        }
        this.group.add(m);
        const s = new Sprite(new SpriteMaterial({ map: tex.glow, color: 0x4a7dff, blending: AdditiveBlending, depthWrite: false, transparent: true }));
        s.position.copy(m.position);
        s.position.y += 0.08;
        s.scale.setScalar(plain ? 2.2 : 3.4);
        s.visible = false;
        this.group.add(s);
        sprites.push(s);
      }
      this.glow = [sprites[0], sprites[1]];
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
    this.beam = beam;
  }

  /** Place the car: scene position, yaw, and its lamps at world time t (seconds). `dark`: 0 day .. 1 night. */
  update(pos: V2, yaw: number, lights: CarLights, t: number, dark: number) {
    this.group.position.set(pos[0], 0, -pos[1]);
    this.group.rotation.y = yaw;
    const on = lights.lamps;
    this.head.color.setHex(on ? 0xfff6e0 : 0x8f9094);
    this.tail.color.setHex(lights.braking ? 0xff2a1a : on ? 0xa01410 : 0x5a1210);
    const blink = lights.hazard && t % 0.9 < 0.45;
    this.amber.color.setHex(blink ? 0xffa21a : 0x6a4a12);
    for (const s of this.headGlow) {
      s.visible = on && dark > 0.25;
      (s.material as SpriteMaterial).opacity = 0.5 + 0.4 * dark;
    }
    if (this.beam) {
      this.beam.visible = on && dark > 0.35;
      (this.beam.material as MeshBasicMaterial).opacity = 0.1 + 0.26 * dark;
    }
    if (this.blue && this.glow) {
      const rate = this.rate();
      for (const side of [0, 1] as const) {
        const lit = lights.beacons && beaconOn(t, side, rate);
        this.blue[side].color.setHex(lit ? 0x7fb0ff : lights.beacons ? 0x16306a : 0x1a2c58);
        this.glow[side].visible = lit;
        (this.glow[side].material as SpriteMaterial).opacity = 0.55 + 0.45 * dark;
      }
    }
  }

  private rate() {
    return this.look.livery === 'ambulance' ? 2.1 : this.look.livery === 'rescue' ? 1.4 : 1.7;
  }

  /** Is a blue light lit right now (the scene flashes with it)? */
  flashing(lights: CarLights, t: number): number {
    if (!this.blue || !lights.beacons) return 0;
    return beaconOn(t, 0, this.rate()) || beaconOn(t, 1, this.rate()) ? 1 : 0;
  }

  dispose() {
    for (const o of this.owned) o.dispose();
    this.head.dispose();
    this.tail.dispose();
    this.amber.dispose();
    this.blue?.forEach((m) => m.dispose());
    for (const s of [...this.headGlow, ...(this.glow ?? [])]) (s.material as SpriteMaterial).dispose();
    (this.beam?.material as MeshBasicMaterial | undefined)?.dispose();
  }
}

/** The colour a blue light throws on the street. */
export const BEACON_COLOR = new Color(0x3f6dff);
