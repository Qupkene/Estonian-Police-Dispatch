/**
 * The standing part of a camera picture: the ground with its asphalt, paving and grass, the roads with their kerbs
 * and worn markings, the houses with the fronts of their kind (facades.ts), roofs and what stands on them, the
 * trees, the lamps, the street furniture and the cars parked along the street and in car parks. Built once per
 * camera from the site (src/cctv/site.ts) and the day's weather; a handful of merged meshes, each one draw call.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  type Material,
  type Texture,
} from 'three';
import type { Env } from '../env';
import {
  along,
  boundingBox,
  clamp,
  dirOf,
  dist,
  dot,
  hash01,
  hash32,
  left,
  lineLength,
  mul,
  nearestOnLine,
  nearestOnRing,
  nearestOnSegment,
  norm,
  pointAlong,
  pointInRing,
  rand,
  ringArea,
  ringCentroid,
  sub,
  type Box,
  type Rand,
  type V2,
} from '../math';
import { blocksView } from '../site';
import { CAR_ROADS, type Building, type Road, type RoadClass, type Site } from '../types';
import { lookOfAnyCar } from '../vehicle';
import { carMaterials, drawCar } from './cars';
import {
  BAY_M,
  boardUV,
  cellUV,
  EXTRA,
  facadeCell,
  GROUND,
  GROUND_M,
  UPPER,
  uvOf,
  type Atlas,
  type CellName,
  type FacadeKind,
  type UV4,
} from './facades';
import { at, MeshBuilder, shade, type P3 } from './mesh';
import { decalUV, GROUND_TILE_M, type DecalName } from './textures';

/** Everything the street is painted with, made once per view. */
export interface WorldTextures {
  atlas: Atlas;
  asphalt: Texture;
  paving: Texture;
  grass: Texture;
  /** An old town's granite setts. */
  setts: Texture;
  decals: Texture;
  /** A soft white glow (textures.ts glowTexture): light spilt on the pavement, a lamp's glare. */
  glow: Texture;
}

/** House colours by kind of front: the near-white paintings take them where their alpha says so. */
const WALLS: Record<FacadeKind, number[]> = {
  plaster: [0xe3cf9a, 0xd9c3a0, 0xe6dccb, 0xc9d1b4, 0xd8b8a8, 0xbccbd3, 0xeeeae0, 0xc4c0b6, 0xd7a96e, 0xa9b7a0, 0xe0c8b0],
  panel: [0xc8c6be, 0xbdbbb3, 0xd6cfbf, 0xb7bcbf, 0xd9d1b0, 0xc2cdd3, 0xcfc9bd],
  brick: [0xe0dccf, 0xd6d1c3, 0xa8604a, 0x9a5442, 0xb87458, 0xd8d2c0],
  wood: [0xd9b45a, 0x8fa37c, 0x9fb7c4, 0x8a4a38, 0xb9b3a5, 0xe6e2d6, 0x6f5a48, 0xc9a46a, 0x7d8f9a],
  modern: [0xdcdcd8, 0x9a9c9e, 0x5e6266, 0xc9b9a0, 0xe8e6e0, 0x7d8a92],
  hall: [0xd2d4d4, 0xb8bec4, 0x8e9aa4, 0x6f7f6c, 0xe0e0dc, 0x8a3a32, 0x3f5a78],
};
/** Floor heights by kind: the first is the ground floor. */
const FLOOR_M: Record<FacadeKind, [number, number]> = {
  plaster: [GROUND_M + 0.3, 3.2],
  panel: [2.9, 2.8],
  brick: [GROUND_M, 3.0],
  wood: [2.9, 2.8],
  modern: [GROUND_M + 0.5, 3.4],
  hall: [GROUND_M + 0.4, 3.0],
};
const FLAT_ROOFS = [0x55565a, 0x4a4b4f, 0x5e5d5a, 0x504b47, 0x6a6a68];
/** Pitched roofs: the covering, its painting and its colours. */
const PITCHED: { cell: CellName; colours: number[] }[] = [
  { cell: 'roofSeam', colours: [0x7a3f33, 0x4a4a4c, 0x3e5a4a, 0x6b3a30, 0x38383a, 0x8a8c8e] },
  { cell: 'roofTile', colours: [0xa8553a, 0x8f4632, 0x6e3a2e] },
  { cell: 'roofSlate', colours: [0x8a8a86, 0x6f716f, 0x9a9890] },
  { cell: 'roofFelt', colours: [0x4a4644, 0x5a3c34, 0x3c4a44] },
];
const SNOW = new Color(0xe4e9ee);

type Species = 'birch' | 'linden' | 'maple' | 'pine' | 'spruce' | 'bush';

/** Higher classes are drawn over lower ones where they meet. */
const ROAD_LEVEL: Record<RoadClass, number> = {
  path: 0.03,
  pedestrian: 0.035,
  rail: 0.04,
  service: 0.045,
  living: 0.05,
  residential: 0.055,
  tertiary: 0.06,
  secondary: 0.065,
  primary: 0.07,
  trunk: 0.075,
  motorway: 0.08,
  tram: 0.085,
};
const ROAD_COLOR: Record<RoadClass, number> = {
  path: 0x9a9488,
  pedestrian: 0x9a968c,
  rail: 0x6a655c,
  service: 0x6a6b6e,
  living: 0x67686b,
  residential: 0x636468,
  tertiary: 0x5e5f63,
  secondary: 0x5a5b5f,
  primary: 0x57585c,
  trunk: 0x55565a,
  motorway: 0x535458,
  tram: 0x2e2f33,
};
/** The pavement's top above the carriageway. */
const KERB_H = 0.13;
/** Parked cars drawn at most (each costs about as much as a person). */
const MAX_PARKED = 22;
const PAVE_W = 2.4;

export interface WorldLamp {
  x: number;
  y: number;
  z: number;
  /** A house door's lamp is weaker than a street lamp. */
  power: number;
}

export interface World {
  group: Group;
  lamps: WorldLamp[];
  /** Night: light the windows and the lamp heads (0..1). */
  setNight: (k: number, lampsOn: boolean) => void;
  dispose: () => void;
}

/** A polyline cut into pieces of about `step` metres. */
function resample(pts: readonly V2[], step: number): V2[] {
  const total = lineLength(pts);
  const n = Math.max(1, Math.round(total / step));
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) out.push(pointAlong(pts, (total * i) / n).pt);
  return out;
}

/** A footprint (anticlockwise) moved inwards by `d` metres at every edge. */
function inset(ring: readonly V2[], d: number): V2[] {
  const n = ring.length;
  return ring.map((p, i) => {
    const n0 = left(norm(sub(p, ring[(i + n - 1) % n])));
    const n1 = left(norm(sub(ring[(i + 1) % n], p)));
    const m = norm([n0[0] + n1[0], n0[1] + n1[1]]);
    return along(p, m, d / Math.max(0.4, dot(m, n0)));
  });
}

const cross2 = (a: V2, b: V2) => a[0] * b[1] - a[1] * b[0];

/** The outward normal of a wall from a to b of an anticlockwise footprint, as a three.js direction. */
const outOf = (a: V2, b: V2): P3 => [b[1] - a[1], 0, b[0] - a[0]];

/** A low flat-roofed box of a shop's footprint (a neighbourhood shop, a petrol station's shop). */
const shopBox = (b: Building) => b.roof !== 'gable' && b.area > 120 && b.area <= 1500 && b.height - b.base < 6.5;

/** What kind of front a building has, from its size and shape (docs/CCTV.md 4.1), seeded by its id. */
export function facadeKindOf(b: Building, bb: Box, terraced = false): FacadeKind {
  const h = hash01('kind', b.id);
  const tall = b.height - b.base;
  // Pitched roofs wall to wall are an old town's stone houses; standing apart, mostly wooden houses.
  if (b.roof === 'gable' && terraced) return h < 0.7 ? 'plaster' : h < 0.85 ? 'brick' : 'wood';
  if (b.roof === 'gable') return b.area < 40 || h < 0.6 ? 'wood' : h < 0.82 ? 'plaster' : 'brick';
  if (b.area > 1500 && tall < 13) return h < 0.72 ? 'hall' : 'modern';
  // A single-storey box with a big footprint: a shop of glass and panels.
  if (shopBox(b)) return 'modern';
  if (bb.long > 36 && bb.short >= 9 && bb.short <= 17 && tall >= 12) return h < 0.82 ? 'panel' : 'brick';
  if (tall >= 18) return h < 0.6 ? 'panel' : 'modern';
  if (tall < 3.2) return h < 0.6 ? 'wood' : 'brick';
  return h < 0.46 ? 'plaster' : h < 0.68 ? 'brick' : h < 0.88 ? 'modern' : 'panel';
}

export function buildWorld(site: Site, env: Env, tex: WorldTextures): World {
  const { street } = site;
  const group = new Group();
  /** Horizontal surfaces by their grain, painted by where they lie. */
  const asphalt = new MeshBuilder();
  asphalt.planar = 1 / GROUND_TILE_M.asphalt;
  const paving = new MeshBuilder();
  paving.planar = 1 / GROUND_TILE_M.paving;
  const turf = new MeshBuilder();
  turf.planar = 1 / GROUND_TILE_M.grass;
  /** The setts of old town lanes. */
  const setts = new MeshBuilder();
  setts.planar = 1 / GROUND_TILE_M.setts;
  /** What lies on the ground: shades, markings, covers, patches, puddles, leaves. */
  const decals = new MeshBuilder();
  /** House fronts, roofs and boards: the painted sheet with the wall's own colour where its alpha says so. */
  const walls = new MeshBuilder();
  /** Signs, fences, leaves: the cut-out half of the sheet. */
  const cuts = new MeshBuilder();
  const solids = new MeshBuilder();
  const heads = new MeshBuilder();
  /** Light at night, added onto what is behind it: shop light on the pavement, the glare round a lamp. */
  const glows = new MeshBuilder();
  const parkedCars = { paint: new MeshBuilder(), glass: new MeshBuilder() };
  const lamps: WorldLamp[] = [];
  const snow = env.snow;
  const wet = env.rain ? 0.72 : 1;
  /** A surface colour with the day's snow on it. */
  const surf = (hex: number, snowShare: number, k = 1) => shade(hex, k).lerp(SNOW, clamp(snow * snowShare, 0, 1));
  const autumn = env.season === 'autumn';
  const winter = env.season === 'winter';
  const grass = autumn ? 0x7a7a48 : winter ? 0x6f7052 : env.season === 'spring' ? 0x6f9048 : 0x648046;
  const camPos = site.camera.pos;

  /** A decal: a painting of the decal sheet laid flat on the ground, its bottom edge from a to b, `deep` metres to the left. */
  const decal = (name: DecalName, a: V2, b: V2, deep: number, h: number, c: Color) => {
    const n = mul(left(norm(sub(b, a))), deep);
    decals.quad(at(a, h), at(b, h), at([b[0] + n[0], b[1] + n[1]], h), at([a[0] + n[0], a[1] + n[1]], h), c, [0, 1, 0], decalUV(name));
  };
  /** A decal centred on a point, `long` along `yaw` and `wide` across. */
  const spotDecal = (name: DecalName, p: V2, yaw: number, long: number, wide: number, h: number, c: Color) => {
    const u = dirOf(yaw);
    const w = left(u);
    const a = along(along(p, u, -long / 2), w, -wide / 2);
    const b = along(along(p, u, long / 2), w, -wide / 2);
    decal(name, a, b, wide, h, c);
  };

  const glowUV: UV4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
  /** Light spilt on the ground in front of a lit opening, from a to b along a wall, `deep` metres out. */
  const spill = (a: V2, b: V2, n: V2, deep: number, h: number, c: Color) => {
    const w = dist(a, b) * 0.5;
    // The glow's bright middle sits at the wall; its inner half is hidden inside the house.
    const m: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const t = norm(sub(b, a));
    const k = (su: number, sv: number): P3 => at(along(along(m, t, su * (w + deep * 0.3)), n, sv * deep), h);
    glows.quad(k(-1, -1), k(1, -1), k(1, 1), k(-1, 1), c, [0, 1, 0], glowUV);
  };

  // ── The ground, and what the map says lies on it ──
  const disc: V2[] = [];
  const reach = street.radius + 90;
  for (let i = 0; i < 32; i++) disc.push([Math.cos((i / 32) * Math.PI * 2) * reach, Math.sin((i / 32) * Math.PI * 2) * reach]);
  turf.flat(disc, 0, surf(winter ? 0x6e6f5e : 0x737a60, 0.92));
  for (const a of street.areas) {
    if (a.ring.length < 3) continue;
    const lift = a.kind === 'water' ? 0.012 : 0.02;
    if (a.kind === 'green') turf.flat(a.ring, lift, surf(grass, 0.95));
    else if (a.kind === 'forest') turf.flat(a.ring, lift, surf(0x56603e, 0.8));
    else if (a.kind === 'pitch') turf.flat(a.ring, lift, surf(0x86a060, 0.9));
    else if (a.kind === 'sand') turf.flat(a.ring, lift, surf(0xd8caa0, 0.9));
    else if (a.kind === 'water') solids.flat(a.ring, lift, snow > 0.7 ? shade(0xcfd8de) : shade(0x3a5462));
    else if (a.kind === 'paved' && street.buildings.some((b) => b.open && b.area > 80 && pointInRing(ringCentroid(b.ring), a.ring))) {
      // A petrol station's forecourt: poured concrete in slabs of five metres, sealed joints between them.
      asphalt.flat(a.ring, lift, surf(0xb2b0aa, 0.5, wet));
      const bb = boundingBox(a.ring);
      const w = left(bb.axis);
      for (let s = -bb.long / 2 + 5; s < bb.long / 2; s += 5) {
        const c = along(bb.c, bb.axis, s);
        decal('seam', along(c, w, -bb.short / 2), along(c, w, bb.short / 2), 0.12, lift + 0.004, shade(0x3a3a3a));
      }
      for (let v = -bb.short / 2 + 5; v < bb.short / 2; v += 5) {
        const c = along(bb.c, w, v);
        decal('seam', along(c, bb.axis, bb.long / 2), along(c, bb.axis, -bb.long / 2), 0.12, lift + 0.004, shade(0x3a3a3a));
      }
    } else if (a.kind === 'paved') paving.flat(a.ring, lift, surf(0x9a978f, 0.8, wet));
    else asphalt.flat(a.ring, lift, surf(0x6a6b6f, 0.72, wet));
  }

  // ── Roads ──
  const carRoads = street.roads.filter((r) => CAR_ROADS.has(r.cls) && !r.tunnel);
  /** Is a point on the carriageway of a car road other than `self`? */
  const onOtherRoad = (p: V2, self: Road | null, margin: number) => {
    for (const r of carRoads) {
      if (r === self) continue;
      if (nearestOnLine(p, r.pts).d < r.width / 2 + margin) return true;
    }
    return false;
  };
  const kerbTop = surf(0x9a9892, 0.6, wet);
  const kerbFace = surf(0x7a7872, 0.3, wet);
  const pave = surf(0x9c9890, 0.75, wet);
  /** Limestone flags: an old town's pavements, pale and big-slabbed (the paving grain at a larger scale). */
  const flags = new MeshBuilder();
  flags.planar = 1 / (GROUND_TILE_M.paving * 3.2);
  const flagC = surf(0xb8b4a8, 0.75, wet);
  const paint = surf(0xe8e8e2, 0.7);
  const worn = hash01('worn', site.seed);
  const markH = 0.006;
  /** A painted line from a to b, `wide` metres, laid as worn pieces of about three metres. */
  const line = (a: V2, b: V2, wide: number, h: number) => {
    const d = dist(a, b);
    const n = Math.max(1, Math.round(d / 3));
    const dir = norm(sub(b, a));
    const w = left(dir);
    for (let i = 0; i < n; i++) {
      const p0 = along(along(a, dir, (d * i) / n), w, -wide / 2);
      const p1 = along(along(a, dir, (d * (i + 1)) / n), w, -wide / 2);
      decal('paint', p0, p1, wide, h, paint);
    }
  };
  for (const r of street.roads) {
    if (r.pts.length < 2 || r.tunnel) continue;
    const level = ROAD_LEVEL[r.cls];
    if (r.cls === 'rail' || r.cls === 'tram') {
      if (r.cls === 'rail') turf.ribbon(r.pts, r.width, level, surf(0x7a7266, 0.5));
      const steel = shade(0x4a4b4e);
      solids.ribbon(r.pts, 0.1, level + 0.03, steel, 0.72);
      solids.ribbon(r.pts, 0.1, level + 0.03, steel, -0.72);
      continue;
    }
    if (r.cls === 'path' || r.cls === 'pedestrian') {
      if (r.cls === 'pedestrian' || hash01('pathKind', r.pts[0][0], r.pts[0][1]) < 0.5) paving.ribbon(r.pts, r.width, level, surf(ROAD_COLOR[r.cls], 0.8, wet));
      else asphalt.ribbon(r.pts, r.width, level, surf(ROAD_COLOR[r.cls], 0.8, wet));
      continue;
    }
    // A living street (an old town's lane) is laid with setts, its kerbs low; everything else is asphalt.
    const cobbled = r.cls === 'living';
    if (cobbled) setts.ribbon(r.pts, r.width, level, surf(0x9a948a, 0.4, wet));
    else asphalt.ribbon(r.pts, r.width, level, surf(ROAD_COLOR[r.cls], 0.3, wet));
    const kerbH = cobbled ? 0.05 : KERB_H;
    const pts = resample(r.pts, 4);
    const rural = !r.walk && (r.cls === 'trunk' || r.cls === 'primary' || r.cls === 'secondary' || r.cls === 'motorway' || r.cls === 'tertiary');
    const village = !r.walk && !rural && (r.cls === 'residential' || r.cls === 'living');
    if (rural || village) {
      // A main road out of town: gravel shoulders, the damp green line of the ditch beyond them, and the white
      // roadside posts with their black band and reflector every fifty metres. A village road: a narrow gravel edge
      // and the ditch, no posts.
      const sw = rural ? 1.5 : 0.5;
      const gravel = surf(0x8e8678, 0.85, wet);
      for (const side of [1, -1]) {
        for (let i = 0; i < pts.length - 1; i++) {
          const mid: V2 = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
          if (onOtherRoad(along(mid, left(norm(sub(pts[i + 1], pts[i]))), side * (r.width / 2 + 1)), r, 0.4)) continue;
          asphalt.ribbon([pts[i], pts[i + 1]], sw, level - 0.012, gravel, side * (r.width / 2 + sw / 2));
          const n = mul(left(norm(sub(pts[i + 1], pts[i]))), side);
          const d0 = along(pts[i], n, r.width / 2 + sw + 1.1);
          const d1 = along(pts[i + 1], n, r.width / 2 + sw + 1.1);
          decal('track', side > 0 ? d1 : d0, side > 0 ? d0 : d1, 1.6, 0.03, shade(winter ? 0x6a6a5a : 0x3e4a2c));
        }
      }
      const total = lineLength(r.pts);
      const rp = rand(hash32('posts', site.seed, Math.round(r.pts[0][0])));
      for (let s = rp.range(5, 45); rural && s < total - 2; s += 50) {
        const { pt, dir } = pointAlong(r.pts, s);
        for (const side of [1, -1]) {
          const q = along(pt, mul(left(dir), side), r.width / 2 + 1.7);
          if (onOtherRoad(q, r, 1) || blocksView(site.camera, q, 8, 0.4) || Math.hypot(q[0], q[1]) > 150) continue;
          const yaw = Math.atan2(dir[1], dir[0]);
          solids.box(q, yaw, 0.12, 0.12, 0, 1.0, surf(0xe8e8e2, 0.2));
          solids.box(q, yaw, 0.125, 0.125, 0.72, 0.94, shade(0x1e1e20));
          heads.box(along(q, mul(dir, -side), 0.065), yaw, 0.04, 0.012, 0.78, 0.88, shade(0xffffff));
        }
      }
    }
    if (r.walk) {
      // Pavements behind a kerb, left out where another street joins.
      for (const side of [1, -1]) {
        for (let i = 0; i < pts.length - 1; i++) {
          const dir = norm(sub(pts[i + 1], pts[i]));
          const n = mul(left(dir), side);
          const mid = along([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2], n, r.width / 2 + 1.1);
          if (onOtherRoad(mid, r, 0.6)) continue;
          const seg = [pts[i], pts[i + 1]];
          (cobbled ? flags : paving).ribbon(seg, PAVE_W - 0.2, kerbH, cobbled ? flagC : pave, side * (r.width / 2 + 0.2 + (PAVE_W - 0.2) / 2));
          solids.ribbon(seg, 0.2, kerbH + 0.005, kerbTop, side * (r.width / 2 + 0.1));
          const e0 = along(pts[i], n, r.width / 2);
          const e1 = along(pts[i + 1], n, r.width / 2);
          solids.quad(at(e0, level), at(e1, level), at(e1, kerbH + 0.005), at(e0, kerbH + 0.005), kerbFace, [-n[0], 0, n[1]]);
          // The gutter's dark line of grit and water along the kerb.
          decal('track', along(e0, n, -0.05), along(e1, n, -0.05), side * -0.45, level + markH, shade(0x2a2724, wet < 1 ? 0.6 : 1));
        }
      }
    }
    if (snow > 0.3) {
      // Winter: packed snow and slush at the edges, the wheels' darker tracks, the plough's banks beside the road.
      const bankDirt = shade(0xa49e94);
      const rb = rand(hash32('bank', site.seed, Math.round(r.pts[0][0]), Math.round(r.pts[0][1])));
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const mid: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (onOtherRoad(mid, r, 0.4)) continue;
        const n = left(norm(sub(b, a)));
        const near = Math.abs(nearestOnLine(mid, site.drive.pts).s - site.drive.at) < 30 && nearestOnLine(mid, site.drive.pts).d < 2;
        for (const side of [1, -1]) {
          const e0 = along(a, n, side * (r.width / 2));
          const e1 = along(b, n, side * (r.width / 2));
          decal('track', side > 0 ? e1 : e0, side > 0 ? e0 : e1, 1.4, level + 0.002, shade(0xdfe3e6));
          for (const lane of [0.35, 0.75]) {
            const t0 = along(a, n, side * (r.width / 2) * lane);
            const t1 = along(b, n, side * (r.width / 2) * lane);
            decal('track', along(t0, n, -0.3), along(t1, n, -0.3), 0.6, level + 0.003, shade(0x5a5e64));
          }
          // The bank: ploughed snow heaped in lumps on the pavement's edge or the verge, white on top and grey-brown
          // with grit and exhaust on the road side, broken where a drive or a path crosses it.
          if (rb.chance(0.12)) continue;
          const off = r.width / 2 + (r.walk ? 0.55 : 0.7);
          const base = r.walk ? KERB_H : 0.02;
          const lumps = 3;
          for (let q = 0; q < lumps; q++) {
            // The lumps overlap, so the bank runs on unbroken with its height wandering.
            const f0 = q / lumps - rb.range(0.04, 0.12);
            const f1 = (q + 1) / lumps + rb.range(0.04, 0.12);
            const hb = (near ? 0.08 : rb.range(0.2, 0.62)) * Math.min(1, snow);
            const wide = 0.35 + hb * 0.9;
            const m0: V2 = [a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0];
            const m1: V2 = [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1];
            const p0 = along(m0, n, side * (off + rb.range(-0.15, 0.15)));
            const p1 = along(m1, n, side * (off + rb.range(-0.15, 0.15)));
            const ridge = rb.range(-0.15, 0.15);
            const t0 = along(p0, n, side * ridge);
            const t1 = along(p1, n, side * ridge);
            const h0 = base + hb * rb.range(0.7, 1);
            const h1 = base + hb * rb.range(0.7, 1);
            const k0 = along(p0, n, -side * wide);
            const k1 = along(p1, n, -side * wide);
            const c0 = along(p0, n, side * wide);
            const c1 = along(p1, n, side * wide);
            const top = shade(0xdde1e4, rb.range(0.94, 1));
            solids.quad(at(k0, base), at(k1, base), at(t1, h1), at(t0, h0), bankDirt, [-n[0] * side, 0.8, n[1] * side]);
            solids.quad(at(t0, h0), at(t1, h1), at(c1, base), at(c0, base), top, [n[0] * side, 1, -n[1] * side]);
            // The ends of the lump.
            solids.quad(at(k0, base), at(t0, h0), at(c0, base), at(c0, base), top, [-(b[0] - a[0]), 0, b[1] - a[1]]);
            solids.quad(at(c1, base), at(t1, h1), at(k1, base), at(k1, base), top, [b[0] - a[0], 0, -(b[1] - a[1])]);
          }
        }
      }
    }
    const main = r.cls === 'tertiary' || r.cls === 'secondary' || r.cls === 'primary' || r.cls === 'trunk' || r.cls === 'motorway';
    if (snow < 0.6) {
      const total = lineLength(r.pts);
      if (main) {
        // The broken centre line: 3 m of paint, 6 m of gap, not through junctions.
        for (let s = 2; s + 3 < total; s += 9) {
          const a = pointAlong(r.pts, s).pt;
          const b = pointAlong(r.pts, s + 3).pt;
          if (onOtherRoad(a, r, 1.2) || onOtherRoad(b, r, 1.2)) continue;
          line(a, b, 0.12, level + markH);
        }
      }
      if (r.cls !== 'tertiary' && main && !r.walk) {
        for (const side of [1, -1]) {
          const edge = resample(r.pts, 6).map((p, i, all) => {
            const d = norm(sub(all[Math.min(all.length - 1, i + 1)], all[Math.max(0, i - 1)]));
            return along(p, left(d), side * (r.width / 2 - 0.3));
          });
          for (let i = 0; i < edge.length - 1; i++) if (!onOtherRoad(edge[i], r, 0.8)) line(edge[i], edge[i + 1], 0.12, level + markH);
        }
      }
    }
    // Wear: mended patches, sealed cracks, a manhole cover or a gully now and then.
    const rr = rand(hash32('wear', site.seed, Math.round(r.pts[0][0]), Math.round(r.pts[0][1])));
    const total = lineLength(r.pts);
    for (let s = rr.range(2, 12); s < total; s += rr.range(9, 22)) {
      const { pt, dir } = pointAlong(r.pts, s);
      const yaw = Math.atan2(dir[1], dir[0]);
      const w = left(dir);
      if (onOtherRoad(pt, r, 0.5)) continue;
      const k = rr();
      const p = along(pt, w, rr.range(-0.35, 0.35) * r.width);
      if (k < 0.18 + 0.3 * worn) spotDecal('patch', p, yaw, rr.range(1.5, 4.5), rr.range(1, 2.6), level + 0.003, shade(0x4a4a4c, rr.range(0.8, 1.1)));
      else if (k < 0.4 + 0.3 * worn) spotDecal('seam', p, yaw + rr.range(-1.2, 1.2), rr.range(2, 5), 0.5, level + 0.004, shade(0x222224));
      else if (k < 0.55) spotDecal('manhole', along(pt, w, rr.range(-0.2, 0.2) * r.width), 0, 0.9, 0.9, level + 0.005, shade(0xffffff));
      else if (k < 0.72 && r.walk) {
        const side = rr.chance(0.5) ? 1 : -1;
        spotDecal('gully', along(pt, w, side * (r.width / 2 - 0.3)), yaw, 0.7, 0.45, level + 0.005, shade(0xffffff));
      }
      if (env.rain && rr.chance(0.5)) spotDecal('puddle', along(pt, w, rr.range(-0.45, 0.45) * r.width), yaw, rr.range(1.2, 3.4), rr.range(0.8, 1.8), level + 0.004, shade(0x7a8490));
    }
  }

  const post = shade(0x8a8d90);
  const BACK: Partial<Record<CellName, CellName>> = {
    signPriority: 'backDiamond',
    signGiveWay: 'backTriangle',
    signStop: 'backOctagon',
    signCrossing: 'backSquare',
    signParking: 'backSquare',
    signBus: 'backSquare',
    signOneWay: 'backSquare',
    signDeadEnd: 'backSquare',
    signYard: 'backSquare',
  };
  /** A sign post with its signs stacked from the top, facing `face` (the yaw it is read from). */
  const sign = (p: V2, face: number, plates: CellName[], top = 2.9) => {
    const f = dirOf(face);
    const rt = left(f);
    const size = 0.62;
    solids.tube(at(p, 0), at(p, top + 0.05), 0.032, 0.032, post, 5, true);
    plates.forEach((cell, k) => {
      const hc = top - size / 2 - k * (size + 0.08);
      const c = along(p, f, 0.05);
      const s = cell === 'signGiveWay' ? size * 1.2 : size;
      const corner = (q: V2, su: number, sv: number): P3 => at(along(q, rt, (su * s) / 2), hc + (sv * s) / 2);
      const n3: P3 = [f[0], 0, -f[1]];
      cuts.card(corner(c, -1, -1), corner(c, 1, -1), corner(c, 1, 1), corner(c, -1, 1), n3, shade(0xffffff), uvOf(cell), false);
      const back = along(p, f, 0.025);
      const bc = BACK[cell] ?? 'backDisc';
      cuts.card(corner(back, 1, -1), corner(back, -1, -1), corner(back, -1, 1), corner(back, 1, 1), [-f[0], 0, f[1]], shade(0xb0b2b4), uvOf(bc), false);
    });
  };
  // ── Houses ──
  const facingRoads = street.roads.filter((r) => CAR_ROADS.has(r.cls) || r.cls === 'pedestrian');
  /** How far a wall looks out onto a street (Infinity if none is within 18 m in front of it). */
  const streetAhead = (mid: V2, n: V2) => {
    for (let k = 2; k <= 18; k += 2) {
      const p = along(mid, n, k);
      for (const r of facingRoads) if (nearestOnLine(p, r.pts).d < r.width / 2 + 0.6) return k;
    }
    return Infinity;
  };

  /** A projecting balcony in front of a panel block's bay: slab, front and sides, glazed by some tenants. */
  const balcony = (p0: V2, p1: V2, n: V2, h: number, r: Rand) => {
    const t = norm(sub(p1, p0));
    const w = dist(p0, p1) * 0.86;
    const c = along([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], n, 0.6);
    const yaw = Math.atan2(t[1], t[0]);
    const concrete = surf(0xb8b6ae, 0.6, 0.9 + 0.1 * r());
    solids.box(c, yaw, w, 1.2, h - 0.02, h + 0.14, concrete);
    // The slab's underside in its own shade, so the stack reads from below.
    const u0 = along(along(p0, n, 0.02), t, (dist(p0, p1) - w) / 2);
    const u1 = along(u0, t, w);
    solids.quad(at(u0, h - 0.025), at(u1, h - 0.025), at(along(u1, n, 1.18), h - 0.025), at(along(u0, n, 1.18), h - 0.025), shade(0x4a4844), [0, -1, 0]);
    // Some tenants glaze theirs, each in a frame of their own choosing.
    const glazed = r.chance(0.4);
    const front = along(c, n, 0.58);
    const fc = glazed ? shade(0x3c4652) : shade(r.pick([0xc9c6bb, 0xb9b5a8, 0x9aa0a4, 0xd3cbb4, 0x8a7a68]));
    solids.box(front, yaw, w, 0.06, h + 0.14, glazed ? h + 2.4 : h + 1.1, fc);
    if (glazed) solids.box(front, yaw, w, 0.09, h + 1.05, h + 1.12, shade(r.pick([0xe6e6e0, 0xe6e6e0, 0x6a4a34, 0x9a9c9e])));
    for (const s of [-1, 1]) solids.box(along(c, t, (s * w) / 2), yaw + Math.PI / 2, 1.16, 0.06, h + 0.14, h + 1.1, concrete);
    // Now and then an air conditioner's box or a satellite dish hangs on the front.
    const extra = r();
    if (extra < 0.1) solids.box(along(along(front, n, 0.25), t, w * 0.3), yaw, 0.8, 0.3, h + 0.3, h + 0.85, shade(0xd8d8d4));
    else if (extra < 0.2) {
      const dish = along(front, t, -w * 0.3);
      solids.tube(at(along(dish, n, 0.1), h + 1.25), at(along(dish, n, 0.2), h + 1.3), 0.3, 0.3, shade(0xc8c8c4), 8, true);
    }
  };

  /** A small roof over a door. */
  const entranceCanopy = (c: V2, t: V2, n: V2, h: number, kind: FacadeKind) => {
    const yaw = Math.atan2(t[1], t[0]);
    const deep = kind === 'panel' ? 1.3 : 0.9;
    const col = kind === 'panel' ? shade(0xa8a6a0) : kind === 'modern' ? shade(0x3a3c40) : shade(0x6a6c70);
    const wide = kind === 'panel' ? 2.2 : 1.6;
    solids.box(along(c, n, deep / 2), yaw, wide, deep, h, h + (kind === 'panel' ? 0.16 : 0.08), col);
    // Two brackets from the wall up to the canopy's front edge hold it.
    for (const e of [-1, 1]) {
      const w0 = along(c, t, (e * wide) / 2 - e * 0.12);
      solids.tube(at(along(w0, n, 0.04), h - 0.55), at(along(w0, n, deep - 0.1), h), 0.025, 0.025, col.clone().multiplyScalar(0.8), 4);
    }
  };
  /** Steps up to a door: a small landing and one or two treads in front of it. */
  const doorSteps = (c: V2, t: V2, n: V2, base: number, rise: number) => {
    const yaw = Math.atan2(t[1], t[0]);
    const stone = surf(0x9a968e, 0.7, wet);
    const treads = rise > 0.25 ? 2 : 1;
    for (let k = 0; k < treads; k++) {
      solids.box(along(c, n, 0.3 * (k + 1)), yaw, 1.5 - k * 0.1, 0.6 * (k + 1), base, base + rise * (1 - k / treads), stone);
    }
  };

  /** The plinth: a band of stone or darker render along the foot of a wall, standing a few centimetres out. */
  const plinthStrip = (a: V2, d: V2, n: V2, base: number, h: number, c: Color) => {
    const a1 = along(a, n, 0.05);
    const d1 = along(d, n, 0.05);
    solids.quad(at(a1, base), at(d1, base), at(d1, base + h), at(a1, base + h), c, outOf(a, d));
    solids.quad(at(a1, base + h), at(d1, base + h), at(d, base + h), at(a, base + h), c, [0, 1, 0]);
  };

  /** A moulded band under the eaves of a plastered town house. */
  const cornice = (a: V2, d: V2, n: V2, h: number, c: Color) => {
    const a1 = along(a, n, 0.22);
    const d1 = along(d, n, 0.22);
    solids.quad(at(a1, h - 0.28), at(d1, h - 0.28), at(d1, h), at(a1, h), c.clone().multiplyScalar(1.05), outOf(a, d));
    solids.quad(at(a, h - 0.36), at(d, h - 0.36), at(d1, h - 0.28), at(a1, h - 0.28), c.clone().multiplyScalar(0.7), [n[0], -1, -n[1]]);
  };

  /** A drainpipe down a wall. */
  const drainpipe = (p: V2, n: V2, h0: number, h1: number, hex: number) => {
    const q = along(p, n, 0.12);
    solids.tube(at(q, h0 + 0.2), at(q, h1), 0.055, 0.055, shade(hex), 5);
  };

  /** The nearest car road to a point, with where on it the point lies. */
  const nearestRoad = (p: V2, skipService = false) => {
    let best: { r: Road; hit: ReturnType<typeof nearestOnLine> } | null = null;
    for (const r of street.roads) {
      if (!CAR_ROADS.has(r.cls) || r.tunnel || r.pts.length < 2 || (skipService && r.cls === 'service')) continue;
      const hit = nearestOnLine(p, r.pts);
      if (!best || hit.d < best.hit.d) best = { r, hit };
    }
    return best;
  };

  /**
   * A country bus stop: a three-walled shelter of a back panel and two sides under a roof, a bench inside, the stop's
   * sign on its own pole, all on a gravel pull-off reaching to the road. Unlit, as they are.
   */
  const shelter = (b: Building, ring: V2[]) => {
    const bb = boundingBox(ring);
    const near = nearestRoad(bb.c);
    // The open side faces the road.
    const toRoad = near ? norm(sub(near.hit.pt, bb.c)) : left(bb.axis);
    const u: V2 = [toRoad[1], -toRoad[0]];
    const yaw = Math.atan2(u[1], u[0]);
    const long = Math.max(3.2, bb.long);
    const deep = Math.max(1.5, bb.short);
    const top = Math.min(2.6, b.height);
    const frame = shade(0x4a4e52);
    const panel = shade(0x6f7a80);
    if (near) {
      // The pull-off: packed gravel from the road's edge to behind the shelter.
      const edge = along(near.hit.pt, toRoad, -near.r.width / 2 + 0.2);
      const back = along(bb.c, toRoad, -deep / 2 - 0.8);
      const a0 = along(edge, u, long / 2 + 6);
      const a1 = along(edge, u, -long / 2 - 6);
      const a2 = along(back, u, -long / 2 - 1.2);
      const a3 = along(back, u, long / 2 + 1.2);
      asphalt.flat(ringArea([a0, a1, a2, a3]) > 0 ? [a0, a1, a2, a3] : [a3, a2, a1, a0], 0.03, surf(0x9a8f7c, 0.9, wet));
    }
    const backC = along(bb.c, toRoad, -deep / 2);
    // Back wall and the two sides: a dark frame round panels of scratched polycarbonate.
    solids.box(backC, yaw, long, 0.06, 0.12, top - 0.1, panel);
    for (const e of [-1, 1]) {
      const sc = along(bb.c, u, (e * long) / 2);
      solids.box(sc, yaw + Math.PI / 2, deep, 0.06, 0.12, top - 0.1, panel);
      for (const f of [-1, 1]) solids.box(along(sc, toRoad, (f * deep) / 2), yaw, 0.08, 0.08, 0, top, frame);
    }
    // The roof, a little out over the open side, its edge thicker than its sheet.
    solids.box(along(bb.c, toRoad, 0.2), yaw, long + 0.3, deep + 0.6, top, top + 0.12, shade(0x5a5e62));
    // A bench along the back wall.
    solids.box(along(backC, toRoad, 0.3), yaw, long - 0.6, 0.38, 0.42, 0.47, shade(0x7a5a3c));
    for (const e of [-1, 1]) solids.box(along(along(backC, toRoad, 0.3), u, e * (long / 2 - 0.6)), yaw, 0.06, 0.32, 0, 0.42, frame);
    // The stop's sign on a pole at the road side.
    sign(along(along(bb.c, u, long / 2 + 1.2), toRoad, deep / 2 + 0.6), Math.atan2(u[1], u[0]), ['signBus'], 2.7);
  };

  /** A petrol station's canopy: a deep fascia band round a white soffit, columns, downlights that light the forecourt. */
  const canopy = (b: Building, ring: V2[]) => {
    if (b.area < 30) return shelter(b, ring);
    const c = ringCentroid(ring);
    const top = b.height;
    const fascia = 0.85;
    // The fascia carries the station's colour band (no brand).
    const edge = [0x2a5a9a, 0xc83a2a, 0x2a8a4a, 0xe8e8e4, 0xe8b020][hash32('canopy', b.id) % 5];
    solids.slab(ring, top - fascia, top, shade(0xeeeeea), surf(0xd8d8d4, 0.8));
    solids.slab(inset(ring, -0.02), top - fascia + 0.22, top - fascia + 0.5, shade(edge), shade(edge));
    const bb = boundingBox(ring);
    const yaw = Math.atan2(bb.axis[1], bb.axis[0]);
    const posts = Math.max(2, Math.round(bb.long / 9));
    for (let k = 0; k < posts; k++) {
      const p = along(c, bb.axis, (k / (posts - 1) - 0.5) * (bb.long - 3));
      solids.box(p, yaw, 0.45, 0.45, 0, top - fascia, shade(0xd4d4d0));
    }
    // Downlights in the soffit, and the bright forecourt under them by night.
    for (let k = 0; k < posts * 2; k++) {
      const s = ((k + 0.5) / (posts * 2) - 0.5) * (bb.long - 2);
      for (const w of [-1, 1]) {
        const q = along(along(c, bb.axis, s), left(bb.axis), (w * bb.short) / 4);
        heads.box(q, yaw, 0.9, 0.9, top - fascia - 0.02, top - fascia, shade(0xffffff));
        const g = 3.2;
        glows.quad(at(along(along(q, bb.axis, -g), left(bb.axis), -g), 0.06), at(along(along(q, bb.axis, g), left(bb.axis), -g), 0.06),
          at(along(along(q, bb.axis, g), left(bb.axis), g), 0.06), at(along(along(q, bb.axis, -g), left(bb.axis), g), 0.06), shade(0xd8dce0, 0.55), [0, 1, 0], glowUV);
      }
    }
    for (const s of [-0.28, 0.28]) lamps.push({ x: along(c, bb.axis, s * bb.long)[0], y: top - fascia - 0.1, z: -along(c, bb.axis, s * bb.long)[1], power: 1 });
  };

  /** A flat roof: its felt inside the parapet, the parapet's cap, and what stands on it. */
  const flatRoof = (b: Building, ring: V2[], bb: Box, kind: FacadeKind, parapet: number, r: Rand) => {
    const roofC = surf(FLAT_ROOFS[hash32('roof', b.id) % FLAT_ROOFS.length], 0.95);
    const inner = inset(ring, 0.25);
    asphalt.flat(inner, b.height, roofC);
    const cap = surf(kind === 'panel' || kind === 'hall' ? 0x8a8c8e : 0x6a6c6e, 0.9);
    const innerC = shade(0x7a7874);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const d = ring[(i + 1) % ring.length];
      const ia = inner[i];
      const id = inner[(i + 1) % ring.length];
      solids.quad(at(a, b.height + parapet), at(d, b.height + parapet), at(id, b.height + parapet), at(ia, b.height + parapet), cap, [0, 1, 0]);
      solids.quad(at(ia, b.height), at(id, b.height), at(id, b.height + parapet), at(ia, b.height + parapet), innerC, [-(d[1] - a[1]), 0, -(d[0] - a[0])]);
    }
    if (b.area < 60) return;
    // Roof boxes: a lift's machine room on a block, vents and a hatch, the plant of a shop.
    const yaw = Math.atan2(bb.axis[1], bb.axis[0]);
    const w = left(bb.axis);
    const boxC = surf(kind === 'panel' ? 0xb4b2aa : 0x8e9092, 0.85);
    const n = kind === 'panel' ? Math.max(1, Math.round(bb.long / 22)) : kind === 'hall' ? 3 : 1 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const p = along(along(bb.c, bb.axis, ((k + 0.5) / n - 0.5) * bb.long * 0.8), w, r.range(-0.2, 0.2) * bb.short);
      if (!pointInRing(p, inner)) continue;
      if (kind === 'panel') solids.box(p, yaw, 3.2, 4.4, b.height, b.height + 2.6, boxC);
      else if (kind === 'hall') {
        solids.box(p, yaw, 2.4, 1.6, b.height, b.height + 1.2, boxC);
        solids.box(along(p, bb.axis, 1.6), yaw, 0.6, 0.6, b.height, b.height + 1.6, shade(0x9a9c9e));
      } else solids.box(p, yaw, r.range(1.2, 2.4), r.range(1, 1.8), b.height, b.height + r.range(0.8, 1.6), boxC);
    }
    for (let k = 0; k < Math.min(6, Math.round(b.area / 120)); k++) {
      const p = along(along(bb.c, bb.axis, r.range(-0.45, 0.45) * bb.long), w, r.range(-0.4, 0.4) * bb.short);
      if (pointInRing(p, inner)) solids.tube(at(p, b.height), at(p, b.height + r.range(0.5, 1.1)), 0.12, 0.12, shade(0x9a9a98), 6, true);
    }
  };

  /** A pitched roof over the footprint's rectangle: slopes of their covering, gables, eaves boards, a chimney. */
  const pitchedRoof = (b: Building, bb: Box, kind: FacadeKind, r: Rand, wall: Color) => {
    const covering = PITCHED[hash32('roofKind', b.id) % (kind === 'wood' ? 4 : 3)];
    const roofC = surf(covering.colours[hash32('roof', b.id) % covering.colours.length], 0.95);
    const rise = clamp(bb.short * (0.32 + 0.12 * hash01('pitch', b.id)), 1.2, 4.6);
    const over = 0.42;
    const u = bb.axis;
    const w = left(u);
    const half = bb.short / 2 + over;
    const eave = b.height - (over * rise) / (bb.short / 2);
    const ridge = b.height + rise;
    const slope = Math.hypot(half, ridge - eave);
    const nu = Math.max(1, Math.round((bb.long + 2 * over) / 2.4));
    const nv = Math.max(1, Math.round(slope / 2.4));
    const s0 = -(bb.long / 2 + over);
    const sl = bb.long + 2 * over;
    for (const side of [1, -1]) {
      const up: P3 = [w[0] * side * rise, half, -w[1] * side * rise];
      const pt = (s: number, f: number): P3 => at(along(along(bb.c, u, s), w, side * half * (1 - f)), eave + (ridge - eave) * f);
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const a0 = s0 + (sl * i) / nu;
          const a1 = s0 + (sl * (i + 1)) / nu;
          walls.quad(pt(a0, j / nv), pt(a1, j / nv), pt(a1, (j + 1) / nv), pt(a0, (j + 1) / nv), roofC, up, uvOf(covering.cell));
        }
      }
      // The eaves board.
      const e0 = along(along(bb.c, u, s0), w, side * half);
      const e1 = along(along(bb.c, u, -s0), w, side * half);
      solids.quad(at(e0, eave - 0.18), at(e1, eave - 0.18), at(e1, eave), at(e0, eave), shade(kind === 'wood' ? 0xe8e4d8 : 0x5a5a58), [w[0] * side, 0, -w[1] * side]);
    }
    // A ridge cap.
    solids.ribbon([along(bb.c, u, s0), along(bb.c, u, -s0)], 0.3, ridge + 0.03, roofC.clone().multiplyScalar(0.8));
    const plain = cellUV(...facadeCell(kind, EXTRA.plain, 3));
    for (const end of [-1, 1]) {
      const g = along(bb.c, u, (end * bb.long) / 2);
      const gl = along(g, w, bb.short / 2);
      const gr = along(g, w, -bb.short / 2);
      const apex = ridge - 0.12;
      const uvT = (p: V2, h: number): V2 => {
        const fu = dot(sub(p, gl), w) / -bb.short;
        const fv = (h - b.height) / (apex - b.height);
        return [plain[0][0] + (plain[1][0] - plain[0][0]) * fu, plain[0][1] + (plain[3][1] - plain[0][1]) * fv];
      };
      walls.tri(at(gl, b.height), at(gr, b.height), at(g, apex), wall, [uvT(gl, b.height), uvT(gr, b.height), uvT(g, apex)]);
      walls.tri(at(gr, b.height), at(gl, b.height), at(g, apex), wall, [uvT(gr, b.height), uvT(gl, b.height), uvT(g, apex)]);
      const outward: P3 = [u[0] * end, 0, -u[1] * end];
      if (rise > 1.9 && b.area > 40) {
        // A small window in the gable.
        const c = along(g, u, end * 0.03);
        const s = Math.min(1.1, rise * 0.4);
        const h0 = b.height + rise * 0.22;
        walls.quad(at(along(c, w, -s / 2), h0), at(along(c, w, s / 2), h0), at(along(c, w, s / 2), h0 + s), at(along(c, w, -s / 2), h0 + s),
          wall, outward, cellUV(...facadeCell(kind, EXTRA.attic, 3)));
      }
      // The barge boards along the gable's edges.
      const bc = shade(kind === 'wood' ? 0xe8e4d8 : 0x5a5a58);
      const ge = along(g, u, end * (over + 0.02));
      for (const s of [1, -1]) {
        const lo = along(ge, w, s * half);
        solids.quad(at(lo, eave - 0.2), at(ge, ridge - 0.2), at(ge, ridge + 0.02), at(lo, eave + 0.02), bc, outward);
      }
    }
    // A chimney through the slope, near the ridge.
    if (b.area > 30 && r.chance(0.8)) {
      const p = along(along(bb.c, u, r.range(-0.3, 0.3) * bb.long), w, r.range(-0.15, 0.15) * bb.short);
      const yaw = Math.atan2(u[1], u[0]);
      solids.box(p, yaw, 0.55, 0.55, ridge - 1.2, ridge + 0.7, shade(r.chance(0.5) ? 0x9a5a48 : 0xb0aca2));
      solids.box(p, yaw, 0.68, 0.68, ridge + 0.62, ridge + 0.74, shade(0x6a6a68));
    }
  };

  let doorDone = false;
  street.buildings.forEach((b: Building, index) => {
    if (b.ring.length < 3) return;
    const ring = ringArea(b.ring) > 0 ? b.ring : b.ring.slice().reverse();
    if (b.open) return canopy(b, ring);
    const bb = boundingBox(ring);
    const terraced = b.roof === 'gable' &&
      street.buildings.some((o) => o !== b && !o.open && dist(ringCentroid(o.ring), ringCentroid(ring)) < 30 &&
        o.ring.some((p) => nearestOnRing(p, ring).d < 1.5));
    const kind = facadeKindOf(b, bb, terraced);
    const r = rand(hash32('house', b.id));
    const wallHex = WALLS[kind][hash32('wall', b.id) % WALLS[kind].length];
    const wall = shade(wallHex, 0.92 + 0.14 * hash01('tone', b.id));
    const gable = b.roof === 'gable';
    const shed = b.area < 25 || b.height - b.base < 2.9;
    const parapet = gable ? 0 : kind === 'hall' ? 0.35 : kind === 'wood' || shed ? 0.15 : 0.6;
    const top = b.height + parapet;
    const [groundH, floorH] = FLOOR_M[kind];
    const tall = b.height - b.base;
    const uppers = shed ? 0 : Math.max(0, Math.round((tall - groundH - 0.3) / floorH));
    const g1 = uppers ? b.base + groundH : b.height - (gable ? 0 : 0.25);
    const rowH = uppers ? (b.height - 0.3 - g1) / uppers : 0;
    const shops = shopBox(b) || (!shed && !gable && kind !== 'hall' && b.area > 90 && r.chance(kind === 'plaster' ? 0.6 : kind === 'modern' ? 0.55 : kind === 'brick' ? 0.4 : 0.25));
    // A share of the windows lit at night, each its own; after eleven most people are asleep.
    const litShare = (0.25 + 0.25 * hash01('lit', b.id)) * (env.hour >= 23 || env.hour < 6 ? 0.35 : 1);
    // Panel blocks: a stairwell every few bays, the same on every floor.
    const stair = 4 + (hash32('stair', b.id) % 3);
    const plain = cellUV(...facadeCell(kind, EXTRA.plain, 3));
    const isDoorHouse = index === site.doorBuilding && site.door !== null;
    const trimHex = kind === 'wood' ? 0xece8dc : 0x8a8a86;
    const bay = BAY_M[kind];

    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const d = ring[(i + 1) % ring.length];
      const len = dist(a, d);
      if (len < 0.2) continue;
      const out = outOf(a, d);
      const t = norm(sub(d, a));
      const n: V2 = [t[1], -t[0]];
      const mid: V2 = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2];
      const front = streetAhead(mid, n) < 16;
      const bays = len < bay * 0.6 ? 0 : Math.max(1, Math.round(len / bay));
      const bw = bays ? len / bays : len;
      const quad = (p0: V2, p1: V2, h0: number, h1: number, uv: UV4, c: Color = wall) => walls.quad(at(p0, h0), at(p1, h0), at(p1, h1), at(p0, h1), c, out, uv);
      // A town house's front stands on the pavement: no strip of grass between the wall and the walk.
      if (front && kind !== 'panel' && !b.base) {
        let best = Infinity;
        let walkRoad: Road | null = null;
        for (const rd of facingRoads) {
          if (!rd.walk) continue;
          const dd = nearestOnLine(mid, rd.pts).d - rd.width / 2 - PAVE_W;
          if (dd < best) {
            best = dd;
            walkRoad = rd;
          }
        }
        if (walkRoad && best > -0.2 && best < 7) {
          const g = best + 0.3;
          if (walkRoad.cls === 'living') flags.flat([a, d, along(d, n, g), along(a, n, g)], 0.046, flagC);
          else paving.flat([a, d, along(d, n, g), along(a, n, g)], KERB_H - 0.004, pave);
        }
      }
      // The shade where the wall meets the ground.
      decal('shade', along(d, n, 0.02), along(a, n, 0.02), 1.3, 0.025, shade(0x000000));
      if (!bays || shed) {
        // A narrow piece of wall or a shed: plain, its painting not squeezed.
        const uv = cellUV(...facadeCell(kind, EXTRA.plain, 3), 1, 1, 0, Math.min(1, len / bay));
        const rows = Math.max(1, Math.round((top - b.base) / floorH));
        for (let k = 0; k < rows; k++) quad(a, d, b.base + ((top - b.base) * k) / rows, b.base + ((top - b.base) * (k + 1)) / rows, uv);
        if (shed && front && len > 2.4 && r.chance(0.6)) {
          // A garage or shed door facing the street.
          const c = along(mid, n, 0.03);
          const w = Math.min(2.6, len - 0.6);
          const h1 = Math.min(top - 0.2, 2.2);
          walls.quad(at(along(c, t, -w / 2), b.base), at(along(c, t, w / 2), b.base), at(along(c, t, w / 2), h1), at(along(c, t, -w / 2), h1),
            shade(0xc8c8c4), out, uvOf(b.area > 14 ? 'garageDoor' : 'shedDoor'));
        }
        continue;
      }
      // Which bay of this wall holds the site's door.
      let doorBay = -1;
      if (isDoorHouse && !doorDone && site.door) {
        const hit = nearestOnSegment(site.door, a, d);
        if (hit.d < 0.8) {
          doorBay = Math.min(bays - 1, Math.floor((hit.t * len) / bw));
          doorDone = true;
        }
      }
      const variantA = kind === 'panel' ? UPPER.window : r.chance(0.7) ? UPPER.window : UPPER.second;
      const variantB = kind === 'panel' ? UPPER.balcony : r.pick([UPPER.second, UPPER.balcony, UPPER.window]);
      const every = 2 + (hash32('every', b.id, i) % 3);
      const off = hash32('off', b.id, i) % stair;
      for (let k = 0; k < bays; k++) {
        const p0 = along(a, t, k * bw);
        const p1 = along(a, t, (k + 1) * bw);
        const col = kind === 'panel' ? ((k + off) % stair === 0 ? UPPER.blank : k % 2 ? variantB : variantA) : k % every === every - 1 ? variantB : variantA;
        // The ground floor.
        let gv: number = GROUND.window;
        let row = 2;
        if (k === doorBay) gv = GROUND.door;
        else if (kind === 'panel') gv = col === UPPER.blank ? GROUND.door : r.chance(0.12) ? GROUND.blank : GROUND.window;
        else if (front && shops) gv = k % 3 === 1 ? GROUND.door : r.chance(0.55) ? GROUND.shop : EXTRA.shopWindow;
        else if (front && k % 4 === 2 && len > 8) gv = GROUND.door;
        else if (r.chance(0.12)) gv = GROUND.blank;
        if (gv === EXTRA.shopWindow && row === 2 && front && shops) row = 3;
        else if (gv === GROUND.window && r.chance(litShare)) {
          gv = EXTRA.litWindow;
          row = 3;
        }
        quad(p0, p1, b.base, g1, cellUV(...facadeCell(kind, gv, row)));
        if (front && ((row === 2 && (gv === GROUND.shop || gv === GROUND.door)) || (row === 3 && gv !== EXTRA.plain))) {
          spill(p0, p1, n, gv === GROUND.door ? 2.2 : 3.4, b.base + (b.base > 0 ? 0 : KERB_H + 0.03), shade(gv === GROUND.door ? 0x806040 : 0xb08a58));
        }
        if (row === 2 && gv === GROUND.shop) {
          // The shop's board over its glass, standing a little out from the wall.
          const q0 = along(p0, n, 0.08);
          const q1 = along(p1, n, 0.08);
          const bh = Math.min(0.75, (g1 - b.base) * 0.22);
          walls.quad(at(q0, g1 - bh - 0.08), at(q1, g1 - bh - 0.08), at(q1, g1 - 0.08), at(q0, g1 - 0.08), shade(0xffffff), out, boardUV(hash32('board', b.id, i, k)));
        }
        if (row === 2 && gv === GROUND.door && kind !== 'hall') {
          const dc = along(a, t, (k + 0.5) * bw);
          entranceCanopy(dc, t, n, b.base + Math.min(groundH - 0.3, 2.6), kind);
          if (kind === 'panel') {
            // The lamp under the canopy and the door code panel beside the door.
            const ch = b.base + Math.min(groundH - 0.3, 2.6);
            heads.box(along(dc, n, 0.5), Math.atan2(t[1], t[0]), 0.3, 0.14, ch - 0.08, ch, shade(0xffffff));
            solids.box(along(along(dc, t, 0.8), n, 0.03), Math.atan2(t[1], t[0]), 0.14, 0.05, b.base + 1.25, b.base + 1.5, shade(0x3a3c40));
          }
          if (!b.base && kind !== 'modern') doorSteps(along(a, t, (k + 0.5) * bw), t, n, front ? KERB_H - 0.01 : 0, kind === 'panel' ? 0.18 : 0.32);
        }
        // The floors above.
        for (let f = 0; f < uppers; f++) {
          quad(p0, p1, g1 + f * rowH, g1 + (f + 1) * rowH, cellUV(...facadeCell(kind, col, r.chance(litShare) ? 1 : 0)));
          if (kind === 'panel' && col === UPPER.balcony && len > 20) balcony(p0, p1, n, g1 + f * rowH, r);
        }
      }
      // The band over the top floor and the parapet.
      if (!gable) quad(a, d, b.height - (uppers ? 0.3 : 0.25), top, cellUV(...facadeCell(kind, EXTRA.plain, 3), 1, 1, 0, Math.min(1, len / bay), 0, 0.3));
      else if (uppers === 0 && g1 < b.height) quad(a, d, g1, b.height, plain);
      // A panel block's joints: dark sealant lines at every floor and between the panels.
      if (kind === 'panel' && uppers > 0) {
        const joint = shade(0x6a6862);
        const ja = along(a, n, 0.015);
        const jd = along(d, n, 0.015);
        for (let f = 0; f <= uppers; f++) {
          const h = g1 + f * rowH;
          solids.quad(at(ja, h - 0.025), at(jd, h - 0.025), at(jd, h + 0.025), at(ja, h + 0.025), joint, outOf(a, d));
        }
        for (let k = 1; k < bays; k++) {
          const q = along(ja, t, k * bw);
          solids.quad(at(along(q, t, -0.025), g1), at(along(q, t, 0.025), g1), at(along(q, t, 0.025), b.height - 0.3), at(along(q, t, -0.025), b.height - 0.3), joint, outOf(a, d));
        }
      }
      // A plinth along the foot, a cornice under the eaves of a town house, a drainpipe at a corner.
      if (kind !== 'hall' && kind !== 'modern') plinthStrip(a, d, n, b.base, kind === 'wood' ? 0.5 : 0.45, kind === 'wood' ? shade(0x8e8a82) : shade(wallHex, 0.62));
      if (kind === 'plaster' && !gable && uppers > 0) cornice(a, d, n, b.height - 0.3, wall);
      if ((kind === 'plaster' || kind === 'wood' || kind === 'brick') && front && len > 6 && i % 2 === 0) drainpipe(along(d, t, -0.3), n, b.base, b.height - 0.1, trimHex);
    }

    if (gable) pitchedRoof(b, bb, kind, r, wall);
    else flatRoof(b, ring, bb, kind, parapet, r);
  });

  // ── Street furniture: signs, a crossing, a bus stop, benches, bins, bollards, cabinets, fences ──
  const driveRoad = carRoads.find((r) => r.pts.length > 1 && nearestOnLine(site.roadSpot, r.pts).d < 0.5) ?? null;
  /** May something stand here: off every carriageway, out of houses, clear of the spot, the stopping places and the view? */
  const free = (p: V2, room: number) => {
    if (dist(p, site.spot) < room + 4 || dist(p, camPos) < room + 1.5) return false;
    const dl = nearestOnLine(p, site.drive.pts);
    // Vehicles stop at the kerb within 30 m of the spot and their crews get out: keep the kerb's edge clear there.
    if (dl.d < site.drive.width / 2 + (Math.abs(dl.s - site.drive.at) < 30 ? 1.3 : 0.35) + room) return false;
    if (nearestOnSegment(p, camPos, site.spot).d < room + 1.6 || nearestOnSegment(p, camPos, site.roadSpot).d < room + 1.2) return false;
    // Nothing standing close in front of the lens: real cameras are aimed past posts and columns.
    if (blocksView(site.camera, p, 12, room + 0.5)) return false;
    if (onOtherRoad(p, null, room + 0.3)) return false;
    return !street.buildings.some((b) => pointInRing(p, b.ring) || nearestOnRing(p, b.ring).d < room + 0.2);
  };
  /** The point at the right-hand kerb of a road at distance s along it, for traffic going `way` (1 along the points, -1 against). */
  const kerbSide = (r: Road, s: number, way: 1 | -1, extra: number) => {
    const { pt, dir } = pointAlong(r.pts, s);
    const d = mul(dir, way);
    return { p: along(pt, [d[1], -d[0]], r.width / 2 + (r.walk ? PAVE_W - 0.5 : 0.9) + extra), yaw: Math.atan2(-d[1], -d[0]) };
  };
  const rank = (c: RoadClass) => ['service', 'living', 'residential', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'].indexOf(c);
  const fr = rand(hash32('furniture', site.seed));
  /** Kerbs kept free of parked cars: crossings and bus stops. */
  const kerbBusy: V2[] = [];
  // Junctions: a minor road meeting a bigger one gets a give-way sign (now and then a stop sign) and a stop line.
  for (const r of carRoads) {
    if (r.pts.length < 2 || r.cls === 'service') continue;
    const total = lineLength(r.pts);
    for (const end of [0, 1] as const) {
      const ep = end ? r.pts[r.pts.length - 1] : r.pts[0];
      const other = carRoads.find((o) => o !== r && nearestOnLine(ep, o.pts).d < o.width / 2 + 1.5);
      if (!other || rank(other.cls) < rank(r.cls) || total < 14) continue;
      const mouth = other.width / 2 + 1.2;
      const sAt = end ? total - mouth : mouth;
      const way: 1 | -1 = end ? 1 : -1;
      const { pt, dir } = pointAlong(r.pts, sAt);
      const d = mul(dir, way);
      const right: V2 = [d[1], -d[0]];
      if (snow < 0.6) line(pt, along(pt, right, r.width / 2 - 0.2), 0.4, ROAD_LEVEL[r.cls] + markH);
      const k = kerbSide(r, end ? total - mouth - 1.5 : mouth + 1.5, way, 0);
      if (free(k.p, 0.3)) sign(k.p, k.yaw, [rank(other.cls) > rank(r.cls) + 2 && fr.chance(0.3) ? 'signStop' : 'signGiveWay']);
      // The bigger road's own priority sign, a little before the junction on its right.
      const oAt = nearestOnLine(ep, other.pts).s;
      const ot = lineLength(other.pts);
      for (const ow of [1, -1] as const) {
        const so = oAt - ow * 18;
        if (so < 3 || so > ot - 3) continue;
        const kp = kerbSide(other, so, ow, 0);
        if (rank(other.cls) >= 3 && free(kp.p, 0.3)) sign(kp.p, kp.yaw, ['signPriority']);
      }
    }
  }
  // The speed limit where the drive line comes into the picture, and a one-way street's no-entry at its far end.
  if (driveRoad) {
    const total = lineLength(driveRoad.pts);
    const limit: CellName =
      driveRoad.cls === 'motorway' || driveRoad.cls === 'trunk' ? 'sign90'
      : driveRoad.cls === 'primary' && !driveRoad.walk ? 'sign70'
      : driveRoad.cls === 'living' || driveRoad.cls === 'residential' ? 'sign30' : 'sign50';
    for (const way of [1, -1] as const) {
      const sAt = way === 1 ? Math.min(total - 4, 12 + fr.range(0, 10)) : Math.max(4, total - 12 - fr.range(0, 10));
      const k = kerbSide(driveRoad, sAt, way, 0);
      if (driveRoad.oneway && driveRoad.oneway !== way) {
        if (free(k.p, 0.3)) sign(k.p, k.yaw, ['signNoEntry']);
      } else if (free(k.p, 0.3)) sign(k.p, k.yaw, driveRoad.cls === 'living' ? ['signYard'] : [limit]);
    }
    // A pedestrian crossing on a town street (one with pavements): near the incident but never under it. A rural main
    // road has none, crossings there are only at villages and bus stops.
    if (driveRoad.walk) {
      const tries = [24, -26, 34, -36, 18, -20];
      for (const off of tries) {
        const sAt = nearestOnLine(site.roadSpot, driveRoad.pts).s + off;
        if (sAt < 8 || sAt > total - 8) continue;
        const { pt, dir } = pointAlong(driveRoad.pts, sAt);
        if (onOtherRoad(pt, driveRoad, 6)) continue;
        const w = left(dir);
        kerbBusy.push(pt);
        const lvl = ROAD_LEVEL[driveRoad.cls] + markH;
        if (snow < 0.6) {
          for (let x = -driveRoad.width / 2 + 0.45; x < driveRoad.width / 2 - 0.3; x += 1) {
            const c = along(pt, w, x);
            decal('paint', along(along(c, dir, -2), w, 0.25), along(along(c, dir, 2), w, 0.25), -0.5, lvl, paint);
          }
        }
        for (const way of [1, -1] as const) {
          const k = kerbSide(driveRoad, sAt - way * 2.6, way, -0.3);
          if (!blocksView(site.camera, k.p, 12)) sign(k.p, k.yaw, ['signCrossing'], 3.0);
        }
        break;
      }
    }
  }
  // Parking signs at the car parks' mouths.
  street.areas.forEach((a) => {
    if (a.kind !== 'parking') return;
    const c = ringCentroid(a.ring);
    const hit = nearestOnRing(c, a.ring);
    const p = along(hit.pt, hit.normal, 0.6);
    if (free(p, 0.4)) sign(p, Math.atan2(hit.normal[1], hit.normal[0]), ['signParking'], 2.6);
  });

  /** A park bench: two concrete feet, a seat and a back of slats. */
  const bench = (p: V2, yaw: number) => {
    const f = dirOf(yaw);
    const wood = shade(0x7a5a3c);
    for (const s of [-0.7, 0.7]) solids.box(along(p, left(f), s), yaw, 0.5, 0.08, 0, 0.42, shade(0x4a4a4c));
    solids.box(p, yaw + Math.PI / 2, 1.7, 0.45, 0.4, 0.46, wood);
    solids.box(along(p, f, -0.22), yaw + Math.PI / 2, 1.7, 0.05, 0.55, 0.85, wood);
  };
  /** A litter bin: a grey or green drum on a post. */
  const bin = (p: V2) => {
    solids.tube(at(p, 0), at(p, 0.45), 0.03, 0.03, post, 4);
    solids.tube(at(p, 0.45), at(p, 0.95), 0.2, 0.22, shade(fr.chance(0.5) ? 0x3a5a3e : 0x5a5e62), 8, true);
  };
  /** An advertising column: a dark foot, eight faces of pasted posters, a green cap. */
  const column = (p: V2) => {
    const sides = 8;
    const rad = 0.55;
    solids.tube(at(p, 0), at(p, 0.32), 0.6, 0.6, shade(0x3a4a42), sides, false);
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const q0: V2 = [p[0] + Math.cos(a0) * rad, p[1] + Math.sin(a0) * rad];
      const q1: V2 = [p[0] + Math.cos(a1) * rad, p[1] + Math.sin(a1) * rad];
      const am = (a0 + a1) / 2;
      walls.quad(at(q0, 0.32), at(q1, 0.32), at(q1, 2.75), at(q0, 2.75), shade(0xffffff, 0.9 + 0.1 * fr()), [Math.cos(am), 0, -Math.sin(am)],
        uvOf(fr.chance(0.5) ? 'poster' : 'poster2'));
    }
    solids.tube(at(p, 2.75), at(p, 2.95), 0.64, 0.5, shade(0x3a4a42), sides, true);
  };
  // Columns stand in town centres only, not along a housing estate's street.
  const town = driveRoad !== null && (driveRoad.cls === 'living' || driveRoad.cls === 'tertiary' || driveRoad.cls === 'secondary' || driveRoad.cls === 'primary');
  // Along the drive line's pavements, at the back edge away from the stopping places: bins, a cabinet, bollards.
  if (driveRoad?.walk) {
    const total = lineLength(driveRoad.pts);
    for (let s = fr.range(6, 14); s < total - 4; s += fr.range(14, 26)) {
      for (const way of [1, -1] as const) {
        const k = kerbSide(driveRoad, s, way, 0.1);
        const p = k.p;
        if (!free(p, 0.4)) continue;
        const k2 = fr();
        if (k2 < 0.35) bin(p);
        else if (k2 < 0.5) solids.box(p, k.yaw + Math.PI / 2, 0.8, 0.32, 0, 1.25, shade(0x9a9c98));
        else if (k2 < 0.6 && town) column(p);
      }
    }
  }
  // A bus stop with its shelter on a main town street, away from the incident.
  if (driveRoad && driveRoad.walk && rank(driveRoad.cls) >= 3 && fr.chance(0.7)) {
    const total = lineLength(driveRoad.pts);
    const at0 = nearestOnLine(site.roadSpot, driveRoad.pts).s;
    for (const off of [48, -48, 60, -60]) {
      const sAt = at0 + off;
      if (sAt < 10 || sAt > total - 10) continue;
      const way: 1 | -1 = off > 0 ? 1 : -1;
      const { pt, dir } = pointAlong(driveRoad.pts, sAt);
      const d = mul(dir, way);
      const out: V2 = [d[1], -d[0]];
      const c = along(pt, out, driveRoad.width / 2 + PAVE_W - 0.3);
      if (!free(c, 1.6)) continue;
      const yaw = Math.atan2(d[1], d[0]);
      kerbBusy.push(c);
      const frame = shade(0x5a5e62);
      for (const e of [-1.8, 1.8]) for (const b of [0, 1.3]) solids.box(along(along(c, d, e), out, b), yaw, 0.08, 0.08, 0, 2.4, frame);
      solids.box(along(c, out, 0.65), yaw, 4.1, 1.7, 2.4, 2.52, shade(0x8a8e92));
      solids.box(along(c, out, 1.3), yaw, 3.6, 0.04, 0.1, 2.3, shade(0x6f8290));
      walls.quad(at(along(along(c, d, 1.84), out, 0.1), 0.3), at(along(along(c, d, 1.84), out, 1.25), 0.3), at(along(along(c, d, 1.84), out, 1.25), 2.2), at(along(along(c, d, 1.84), out, 0.1), 2.2),
        shade(0xffffff), [d[0], 0, -d[1]], uvOf(fr.chance(0.5) ? 'poster' : 'poster2'));
      bench(along(c, out, 1.0), yaw - Math.PI / 2);
      sign(along(along(c, d, -2.6), out, -0.2), Math.atan2(-d[1], -d[0]), ['signBus'], 2.8);
      bin(along(along(c, d, 2.5), out, 0.9));
      break;
    }
  }
  // A housing block's yard: the waste containers in a group, green and grey wheelie bins with a blue one for paper
  // and a yellow one for packaging, on a slab by the yard road.
  street.buildings.forEach((b) => {
    if (b.open || b.ring.length < 3) return;
    const bb = boundingBox(b.ring);
    if (facadeKindOf(b, bb) !== 'panel') return;
    const rb = rand(hash32('bins', b.id));
    for (const side of [1, -1]) {
      const c = along(along(bb.c, left(bb.axis), side * (bb.short / 2 + 5)), bb.axis, rb.range(-0.3, 0.3) * bb.long);
      if (!free(c, 2.2)) continue;
      const yaw = Math.atan2(bb.axis[1], bb.axis[0]);
      paving.flat([along(along(c, bb.axis, -2.6), left(bb.axis), -1), along(along(c, bb.axis, 2.6), left(bb.axis), -1),
        along(along(c, bb.axis, 2.6), left(bb.axis), 1), along(along(c, bb.axis, -2.6), left(bb.axis), 1)], 0.05, surf(0x8e8c86, 0.7, wet));
      const kinds = [0x2e5a34, 0x2e5a34, 0x5a5e62, 0x2a5aa0, 0xd8b428];
      kinds.forEach((hex, k) => {
        const q = along(c, bb.axis, -2 + k * 1.0);
        const tall = hex === 0x2a5aa0 || hex === 0xd8b428;
        solids.box(q, yaw, tall ? 0.95 : 0.6, tall ? 1.1 : 0.72, 0.05, tall ? 1.4 : 1.05, shade(hex));
        solids.box(q, yaw, tall ? 1.0 : 0.64, tall ? 1.16 : 0.78, tall ? 1.4 : 1.05, tall ? 1.48 : 1.1, shade(hex, 0.75));
      });
      break;
    }
  });
  // Bicycle stands in front of a shop: a row of bent steel hoops.
  street.buildings.forEach((b) => {
    if (!shopBox(b) || b.ring.length < 3) return;
    const ring = ringArea(b.ring) > 0 ? b.ring : b.ring.slice().reverse();
    for (let i = 0; i < ring.length; i++) {
      const a0 = ring[i];
      const d0 = ring[(i + 1) % ring.length];
      const t = norm(sub(d0, a0));
      const n: V2 = [t[1], -t[0]];
      const mid: V2 = [(a0[0] + d0[0]) / 2, (a0[1] + d0[1]) / 2];
      if (dist(a0, d0) < 12 || streetAhead(mid, n) > 16) continue;
      const c = along(along(mid, t, dist(a0, d0) * 0.3), n, 1.4);
      if (!free(c, 1.5)) continue;
      for (let k = 0; k < 5; k++) {
        const q = along(c, t, (k - 2) * 0.8);
        const q0 = along(q, n, -0.35);
        const q1 = along(q, n, 0.35);
        solids.tube(at(q0, 0), at(q0, 0.75), 0.025, 0.025, post, 4);
        solids.tube(at(q1, 0), at(q1, 0.75), 0.025, 0.025, post, 4);
        solids.tube(at(q0, 0.75), at(q1, 0.75), 0.025, 0.025, post, 4);
      }
      break;
    }
  });
  // Trolleybus wires over some town streets: poles along both kerbs, a pair of wires over each lane.
  if (driveRoad?.walk && (driveRoad.cls === 'secondary' || driveRoad.cls === 'tertiary') && hash01('wires', site.seed) < 0.35) {
    const total = lineLength(driveRoad.pts);
    const wire = shade(0x1e1e20);
    let prev: V2[] | null = null;
    for (let sAt = 4; sAt < total - 4; sAt += 30) {
      const { pt, dir } = pointAlong(driveRoad.pts, sAt);
      const w = left(dir);
      const ends = [1, -1].map((side) => along(pt, w, side * (driveRoad.width / 2 + PAVE_W - 0.4)));
      if (onOtherRoad(pt, driveRoad, 4)) {
        prev = null;
        continue;
      }
      for (const e of ends) if (!blocksView(site.camera, e, 14, 0.5)) solids.tube(at(e, 0), at(e, 7.2), 0.1, 0.07, shade(0x6a6e70), 6);
      solids.tube(at(ends[0], 6.9), at(ends[1], 6.9), 0.02, 0.02, wire, 3);
      const hang = [-1, 1].flatMap((side) => [driveRoad.width / 4 - 0.3, driveRoad.width / 4 + 0.3].map((l) => along(pt, w, side * l)));
      if (prev) prev.forEach((q, k) => solids.tube(at(q, 6.2), at(hang[k], 6.2), 0.025, 0.025, wire, 3));
      prev = hang;
    }
  }
  // Benches and bins along the paths of parks and squares.
  for (const r of street.roads) {
    if ((r.cls !== 'path' && r.cls !== 'pedestrian') || r.pts.length < 2) continue;
    const total = lineLength(r.pts);
    for (let s = fr.range(5, 15); s < total - 3; s += fr.range(16, 30)) {
      const { pt, dir } = pointAlong(r.pts, s);
      const side = fr.chance(0.5) ? 1 : -1;
      const n = mul(left(dir), side);
      const p = along(pt, n, r.width / 2 + 0.6);
      if (!free(p, 0.9)) continue;
      bench(p, Math.atan2(-n[1], -n[0]));
      if (fr.chance(0.5)) {
        const q = along(p, dir, 1.4);
        if (free(q, 0.3)) bin(q);
      }
    }
  }
  // A petrol station: pump islands under the canopy and the price board by the road.
  street.buildings.forEach((b) => {
    if (!b.open || b.area < 80) return;
    const bb = boundingBox(b.ring);
    const yaw = Math.atan2(bb.axis[1], bb.axis[0]);
    const w = left(bb.axis);
    const islands = Math.max(1, Math.round(bb.long / 7.5));
    for (let k = 0; k < islands; k++) {
      const c = along(bb.c, bb.axis, ((k + 0.5) / islands - 0.5) * (bb.long - 2));
      const islandL = Math.min(4.2, bb.short - 3);
      solids.box(c, yaw + Math.PI / 2, islandL, 1.1, 0, 0.16, shade(0xb8b6b0));
      // Yellow-and-black bollards guard the island's ends.
      for (const e of [-1, 1]) {
        const q = along(c, w, (e * islandL) / 2 - e * 0.25);
        solids.tube(at(q, 0.16), at(q, 1.0), 0.07, 0.07, shade(0xd8b020), 6, true);
        solids.tube(at(q, 0.55), at(q, 0.7), 0.075, 0.075, shade(0x2a2a2a), 6);
      }
      for (const s of [-1, 1]) {
        const p = along(c, w, s * 1.1);
        // A two-tone body: a dark plinth, a light cabinet, a dark head with the price display.
        solids.box(p, yaw, 0.62, 0.47, 0.16, 0.55, shade(0x3a3e44));
        solids.box(p, yaw, 0.6, 0.45, 0.55, 1.85, shade(0xe8e8e4));
        solids.box(p, yaw, 0.64, 0.49, 1.55, 1.9, shade(0x2c3036));
        // The hose hangs from the side in a loop to the ground and back to the nozzle holder.
        for (const f of [-1, 1]) {
          const h0 = along(along(p, bb.axis, f * 0.33), w, 0.1);
          const h1 = along(along(p, bb.axis, f * 0.55), w, 0.25);
          const h2 = along(along(p, bb.axis, f * 0.36), w, -0.1);
          solids.tube(at(h0, 1.45), at(h1, 0.45), 0.018, 0.018, shade(0x1e1e20), 4);
          solids.tube(at(h1, 0.45), at(h2, 1.15), 0.018, 0.018, shade(0x1e1e20), 4);
        }
        for (const f of [-1, 1]) {
          const q = along(p, bb.axis, f * 0.31);
          const a = along(q, w, -0.22);
          const d = along(q, w, 0.22);
          walls.quad(at(f > 0 ? a : d, 0.3), at(f > 0 ? d : a, 0.3), at(f > 0 ? d : a, 1.8), at(f > 0 ? a : d, 1.8), shade(0xffffff), [bb.axis[0] * f, 0, -bb.axis[1] * f], uvOf('pump'));
        }
      }
      solids.tube(at(c, 0.16), at(c, b.height - 0.5), 0.05, 0.05, shade(0x9a9c9e), 4);
    }
    let best: { r: Road; hit: ReturnType<typeof nearestOnLine> } | null = null;
    for (const r of carRoads) {
      const hit = nearestOnLine(bb.c, r.pts);
      if (r.cls !== 'service' && (!best || hit.d < best.hit.d)) best = { r, hit };
    }
    if (!best) return;
    const toward = norm(sub(bb.c, best.hit.pt));
    for (const slide of [8, -8, 14, -14]) {
      const p = along(along(best.hit.pt, toward, best.r.width / 2 + 3.2), best.hit.dir, slide);
      if (!free(p, 1)) continue;
      const py = Math.atan2(best.hit.dir[1], best.hit.dir[0]);
      solids.box(p, py, 1.5, 0.4, 0, 6.2, shade(0x2c3a4a));
      for (const f of [-1, 1]) {
        const q = along(p, left(best.hit.dir), f * 0.21);
        const a = along(q, best.hit.dir, -0.68);
        const d = along(q, best.hit.dir, 0.68);
        const out: P3 = [left(best.hit.dir)[0] * f, 0, -left(best.hit.dir)[1] * f];
        walls.quad(at(f > 0 ? d : a, 3.4), at(f > 0 ? a : d, 3.4), at(f > 0 ? a : d, 5.9), at(f > 0 ? d : a, 5.9), shade(0xffffff), out, uvOf('price'));
      }
      break;
    }
  });
  // Private houses: a fence or a hedge along the street, with a gap for the gate.
  street.buildings.forEach((b) => {
    if (b.roof !== 'gable' || b.open || b.area < 40) return;
    const c = ringCentroid(b.ring);
    let best: { r: Road; hit: ReturnType<typeof nearestOnLine> } | null = null;
    for (const r of carRoads) {
      const hit = nearestOnLine(c, r.pts);
      if (!best || hit.d < best.hit.d) best = { r, hit };
    }
    if (!best || best.hit.d > 26) return;
    const { r, hit } = best;
    const n = norm(sub(c, hit.pt));
    const set = r.width / 2 + (r.walk ? PAVE_W + 0.2 : 1.6);
    // Every plot is fenced, unless the house stands right on the street.
    if (nearestOnRing(hit.pt, b.ring).d < set + 1.2) return;
    const bb = boundingBox(b.ring);
    const half = Math.max(bb.long, bb.short) / 2 + 3;
    const hedge = hash01('hedge', b.id) < 0.25;
    // Plank, wire mesh, or the profiled steel sheet of newer plots.
    const fk = hash01('fence', b.id);
    const fenceKind: CellName | 'sheet' = fk < 0.45 ? 'picket' : fk < 0.75 ? 'meshFence' : 'sheet';
    const sheetC = shade([0x4a5a48, 0x6a3a2e, 0x4a4c50, 0x7a6a58][hash32('sheet', b.id) % 4]);
    const h = hedge ? 1.3 : 1.15;
    const steps = Math.max(2, Math.round((half * 2) / 2.5));
    // The mailbox on its post beside the gate.
    const mb = along(along(hit.pt, n, set - 0.25), hit.dir, 1.9);
    if (free(mb, 0.3)) {
      solids.tube(at(mb, 0), at(mb, 1.05), 0.04, 0.04, shade(0x5a5048), 4);
      solids.box(mb, Math.atan2(n[1], n[0]), 0.42, 0.26, 1.05, 1.36, shade([0x2a4a7a, 0x3a5a3a, 0x8a8a86, 0xb03a2a][hash32('mail', b.id) % 4]));
    }
    for (let k = 0; k < steps; k++) {
      const s0 = hit.s - half + (2 * half * k) / steps;
      const s1 = hit.s - half + (2 * half * (k + 1)) / steps;
      if (Math.abs((s0 + s1) / 2 - hit.s) < 1.6) continue;
      const p0 = along(pointAlong(r.pts, s0).pt, n, set);
      const p1 = along(pointAlong(r.pts, s1).pt, n, set);
      const m: V2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (!free(m, 0.3) || pointInRing(p0, b.ring) || pointInRing(p1, b.ring)) continue;
      if (blocksView(site.camera, p0, 12, 0.8) || blocksView(site.camera, p1, 12, 0.8)) continue;
      if (hedge) {
        const t = norm(sub(p1, p0));
        const o: V2 = [t[1] * 0.35, -t[0] * 0.35];
        const green = shade(winter ? 0x5a5a40 : 0x3c5a2e, 0.9 + 0.2 * fr()).lerp(SNOW, snow * 0.5);
        const q = (p: V2, s: number): V2 => [p[0] + o[0] * s, p[1] + o[1] * s];
        walls.quad(at(q(p0, 1), 0), at(q(p1, 1), 0), at(q(p1, 1), h), at(q(p0, 1), h), green, [o[0], 0, -o[1]], uvOf('hedge'));
        walls.quad(at(q(p1, -1), 0), at(q(p0, -1), 0), at(q(p0, -1), h), at(q(p1, -1), h), green, [-o[0], 0, o[1]], uvOf('hedge'));
        walls.quad(at(q(p0, -1), h), at(q(p1, -1), h), at(q(p1, 1), h + 0.05), at(q(p0, 1), h + 0.05), green.clone().multiplyScalar(1.1), [0, 1, 0], uvOf('hedge'));
        // A clipped hedge is never quite level: leafy tufts break its top line.
        for (let k = 0; k < 3; k++) {
          const c = along(p0, t, (dist(p0, p1) * (k + fr.range(0.2, 0.8))) / 3);
          const wq = fr.range(0.5, 0.9);
          const hq = h + fr.range(0.12, 0.3);
          const c0 = along(c, t, -wq);
          const c1 = along(c, t, wq);
          cuts.card(at(c0, h - 0.25), at(c1, h - 0.25), at(c1, hq), at(c0, hq), [o[0], 0.4, -o[1]], green, uvOf('bush'), false);
        }
      } else if (fenceKind === 'sheet') {
        solids.quad(at(p0, 0.05), at(p1, 0.05), at(p1, 1.6), at(p0, 1.6), sheetC, [-n[0], 0, n[1]]);
        solids.quad(at(p1, 0.05), at(p0, 0.05), at(p0, 1.6), at(p1, 1.6), sheetC.clone().multiplyScalar(0.8), [n[0], 0, -n[1]]);
        solids.tube(at(p0, 0), at(p0, 1.66), 0.04, 0.04, shade(0x3a3a3a), 4, true);
      } else {
        cuts.card(at(p0, 0.05), at(p1, 0.05), at(p1, h), at(p0, h), [n[0], 0.3, -n[1]], shade(fenceKind === 'picket' ? 0xe6e2d6 : 0x9a9ea2), uvOf(fenceKind), false);
        solids.tube(at(p0, 0), at(p0, h + 0.08), 0.04, 0.04, shade(0x6a6058), 4, true);
      }
    }
  });

  // ── The door's lamp ──
  if (site.door && site.doorOut) {
    const lampAt = along(site.door, site.doorOut, 0.25);
    heads.box(lampAt, 0, 0.22, 0.22, 2.2, 2.34, shade(0xffffff));
    lamps.push({ x: lampAt[0], y: 2.15, z: -lampAt[1], power: 0.16 });
  }

  // ── Street lamps: a tapered grey pole, an arm, a flat LED head ──
  for (const l of site.lamps) {
    const d = dirOf(l.yaw);
    const reachArm = l.height > 7 ? 1.9 : 1.2;
    const pole = shade(0x7a7d80);
    solids.tube(at(l.pos, 0), at(l.pos, l.height - 0.2), 0.11, 0.06, pole, 7);
    solids.tube(at(l.pos, l.height - 0.4), at(along(l.pos, d, reachArm), l.height), 0.04, 0.035, pole, 5);
    const head = along(l.pos, d, reachArm + 0.25);
    solids.box(head, l.yaw, 0.7, 0.3, l.height - 0.08, l.height + 0.04, shade(0x5a5c5e));
    heads.box(head, l.yaw, 0.56, 0.2, l.height - 0.1, l.height - 0.08, shade(0xffffff));
    lamps.push({ x: head[0], y: l.height - 0.3, z: -head[1], power: 1 });
    // The glare round the lamp, a card turned to the camera (it never moves); wider in fog and rain.
    const toCam = norm(sub(camPos, head));
    const side = left(toCam);
    const g = (1.1 + 1.6 * env.fog + (env.rain ? 0.6 : 0)) * (l.height > 7 ? 1.2 : 1);
    const c = along(head, toCam, 0.3);
    const y = l.height - 0.2;
    glows.quad(at(along(c, side, -g), y - g), at(along(c, side, g), y - g), at(along(c, side, g), y + g), at(along(c, side, -g), y + g),
      shade(0xffe8c8, 0.5 + 0.4 * env.fog), [toCam[0], 0, -toCam[1]], glowUV);
  }

  // ── Parked cars: in the car parks' bays and along the kerbs of town streets ──
  // Every place a car could stand is listed first; then the ones the camera sees best are filled, up to a number
  // the frame can afford (a parked car costs as much as a person).
  const keepClear = (p: V2, m: number) =>
    dist(p, site.spot) < m + 3 || nearestOnLine(p, site.drive.pts).d < site.drive.width / 2 + m || dist(p, camPos) < 3 || blocksView(site.camera, p, 7, 1);
  const spots: { p: V2; yaw: number; y: number; look: number; score: number }[] = [];
  const camDir = norm(sub(site.camera.target, camPos));
  /** How well the camera sees a point: low is better; far behind or beside the lens is worst. */
  const seen = (p: V2) => {
    const d = sub(p, camPos);
    const ahead = d[0] * camDir[0] + d[1] * camDir[1];
    const across = Math.abs(d[0] * camDir[1] - d[1] * camDir[0]);
    const inside = ahead > 0 && across < ahead * 0.75 + 3;
    return Math.hypot(d[0], d[1]) + (inside ? 0 : 400);
  };
  const fill = env.night > 0.5 ? 0.42 : 0.62;
  const masts: V2[] = [];
  /** Young trees on the car parks' islands, planted with the others below. */
  const islandTrees: V2[] = [];
  street.areas.forEach((a, ai) => {
    if (a.kind !== 'parking') return;
    const bb = boundingBox(a.ring);
    const u = bb.axis;
    const w = left(u);
    const r = rand(hash32('park', site.seed, ai));
    // Rows of bays across the short side, back to back in pairs with an aisle between the pairs. The bays' lines are
    // drawn from the same spacing the cars are put on, so a car stands in the middle of its bay.
    const BAY = 2.6;
    // A big lot: kerbed islands with a tree at the rows' ends, lamp masts down the middle of each pair of rows, a
    // shelter for the trolleys.
    const big = bb.long > 50 && bb.short > 20;
    const yawU = Math.atan2(u[1], u[0]);
    let row = 0;
    let trolleys = false;
    for (let v = -bb.short / 2 + 2.7; v < bb.short / 2 - 2.4; row++) {
      const facing = row % 2 ? Math.atan2(-w[1], -w[0]) : Math.atan2(w[1], w[0]);
      const sEnd = -bb.long / 2 + 1.6 + Math.floor((bb.long - 3) / BAY) * BAY;
      if (big && row % 2 === 0) {
        // The masts stand where the noses of two back-to-back rows meet.
        for (let s = -bb.long / 2 + 14; s < bb.long / 2 - 8; s += 28) {
          const mp = along(along(bb.c, u, s), w, v + 2.6);
          if (!pointInRing(mp, a.ring) || blocksView(site.camera, mp, 14, 0.6) || dist(mp, site.spot) < 5) continue;
          masts.push(mp);
          solids.box(mp, yawU, 0.5, 0.5, 0, 0.5, shade(0x8a8a86));
          solids.tube(at(mp, 0.5), at(mp, 10), 0.14, 0.08, shade(0x8a8d90), 6);
          for (const e of [-1, 1]) {
            const hd = along(mp, w, e * 0.9);
            solids.tube(at(mp, 9.7), at(hd, 9.9), 0.04, 0.04, shade(0x8a8d90), 4);
            solids.box(hd, yawU, 0.7, 0.35, 9.82, 9.98, shade(0x5a5c5e));
            heads.box(hd, yawU, 0.55, 0.25, 9.8, 9.82, shade(0xffffff));
          }
          lamps.push({ x: mp[0], y: 9.6, z: -mp[1], power: 1 });
        }
      }
      for (let s = -bb.long / 2 + 1.6; s < bb.long / 2 - 1.4; s += BAY) {
        const p = along(along(bb.c, u, s), w, v);
        if (!pointInRing(p, a.ring) || street.buildings.some((bd) => pointInRing(p, bd.ring))) continue;
        if (masts.some((m) => dist(m, p) < 3)) continue;
        if (big && (s === -bb.long / 2 + 1.6 || Math.abs(s - sEnd) < 0.01)) {
          // A kerbed island of grass in place of the row's end bay, a young tree on some.
          const ring: V2[] = [along(along(p, u, -1.1), w, -2.4), along(along(p, u, 1.1), w, -2.4), along(along(p, u, 1.1), w, 2.4), along(along(p, u, -1.1), w, 2.4)];
          solids.slab(ring, 0.02, 0.15, kerbTop, surf(grass, 0.95));
          if (r.chance(0.6)) islandTrees.push(p);
          else if (!trolleys && !blocksView(site.camera, p, 14, 1)) {
            // The trolleys' shelter: a roof on a frame over a row of nested trolleys.
            trolleys = true;
            for (const e of [-1, 1]) for (const f of [-1, 1]) solids.box(along(along(p, u, e * 0.8), w, f * 2.1), yawU, 0.06, 0.06, 0.15, 2.3, shade(0x5a5e62));
            solids.box(p, yawU, 1.9, 4.6, 2.3, 2.4, shade(0x8a8e92));
            solids.box(p, yawU, 0.75, 3.6, 0.3, 1.1, shade(0x9a9ea2));
          }
          continue;
        }
        // The bay's lines, whether a car stands in it or not.
        if (snow < 0.5) {
          for (const e of [-BAY / 2, BAY / 2]) {
            const q = along(along(bb.c, u, s + e), w, v);
            line(along(q, w, -2.5), along(q, w, 2.5), 0.1, 0.028);
          }
        }
        if (!r.chance(fill) || keepClear(p, 1.6)) continue;
        // A small yaw and a little off the middle, as people park.
        const q = along(along(p, u, r.range(-0.12, 0.12)), w, r.range(-0.2, 0.2));
        spots.push({ p: q, yaw: facing + r.range(-0.05, 0.05), y: 0.05, look: hash32('pc', site.seed, ai, row, Math.round(s * 10)), score: seen(q) });
      }
      v += row % 2 ? 5.2 : 11.4;
    }
  });
  // Along the kerbs: a near-solid row on one side of a town street (on both, now and then, where it is wide), with
  // two wheels up on the pavement so the traffic passes, as in Kalamaja or Karlova. Never at the incident's kerb,
  // in a junction's mouth, at a crossing or a bus stop.
  /**
   * Is a kerb point where arriving vehicles stop (docs/CCTV.md 8.2)? Those from end a stop on their right behind the
   * spot, those from end b on theirs beyond it; a stopped car stands at the spot itself.
   */
  const slotKerb = (p: V2) => {
    const dl = nearestOnLine(p, site.drive.pts);
    if (dl.d > site.drive.width / 2 + 3) return false;
    const ds = dl.s - site.drive.at;
    const leftSide = cross2(dl.dir, sub(p, dl.pt)) > 0;
    return Math.abs(ds) < 10 || (!leftSide && ds > -36 && ds < 10) || (leftSide && ds > -10 && ds < 36);
  };
  for (const r of carRoads) {
    if (!r.walk || r.cls === 'service' || r.pts.length < 2) continue;
    const rk = rand(hash32('kerbcars', site.seed, Math.round(r.pts[0][0]), Math.round(r.pts[0][1])));
    const total = lineLength(r.pts);
    const lane = r.width < 5.4 ? 1.0 : r.width / 4 + 0.95;
    const lat = clamp(Math.max(lane + 1.0, r.width / 2 - 0.6), 0, r.width / 2 + 0.5);
    const up = lat > r.width / 2 - 0.3;
    const sides: (1 | -1)[] = r.width >= 6.4 && rk.chance(0.5) ? [1, -1] : [rk.chance(0.5) ? 1 : -1];
    for (const side of sides) {
      for (let s = rk.range(3, 8); s < total - 3; s += rk.range(5.5, 6.3) + (rk.chance(0.2) ? rk.range(5, 6) : 0)) {
        if (!rk.chance(0.85)) continue;
        const { pt, dir } = pointAlong(r.pts, s);
        const p = along(pt, mul(left(dir), side), lat);
        if (Math.hypot(p[0], p[1]) > 120) continue;
        if (slotKerb(p)) continue;
        if (dist(p, site.spot) < 8 || dist(p, camPos) < 6 || blocksView(site.camera, p, 9, 1.2)) continue;
        if (onOtherRoad(p, r, 5) || kerbBusy.some((q) => dist(q, p) < 9) || site.lamps.some((l) => dist(l.pos, p) < 2.8)) continue;
        if (street.buildings.some((b) => pointInRing(p, b.ring) || nearestOnRing(p, b.ring).d < 1)) continue;
        // Right-hand traffic: a car stands facing the way its side of the road drives.
        const yaw = Math.atan2(dir[1], dir[0]) + (side > 0 ? Math.PI : 0) + rk.range(-0.03, 0.03);
        spots.push({ p, yaw, y: ROAD_LEVEL[r.cls] + (up ? KERB_H * 0.5 : 0), look: hash32('kc', site.seed, Math.round(p[0] * 10), Math.round(p[1] * 10)), score: seen(p) });
      }
    }
  }
  spots.sort((a, b) => a.score - b.score);
  const capC = surf(0xffffff, 1).lerp(SNOW, 1);
  for (const c of spots.filter((x) => x.score < 85).slice(0, MAX_PARKED)) {
    const look = lookOfAnyCar(c.look);
    const f = { c: Math.cos(c.yaw), s: Math.sin(c.yaw), x: c.p[0], y: c.y, z: -c.p[1] };
    const sp = drawCar(parkedCars, look, f);
    if (snow > 0.5) {
      // A cap of snow on the roof and the bonnet of a car that has stood out all night.
      const hw = sp.half * 0.82;
      const [rx, ry] = [sp.bar[0], sp.bar[1]];
      parkedCars.paint.prism([[rx - 0.7, ry - 0.04], [rx + 0.75, ry - 0.04], [rx + 0.62, ry + 0.07], [rx - 0.6, ry + 0.07]], -hw, hw, capC, f);
      const [nx, by] = [sp.nose, sp.belt];
      parkedCars.paint.prism([[nx - 1.0, by - 0.06], [nx - 0.25, by - 0.14], [nx - 0.3, by - 0.08], [nx - 1.0, by]], -hw, hw, capC, f);
    }
    spotDecal('blob', c.p, c.yaw, 5.2, 2.4, c.y > 0.06 ? ROAD_LEVEL.motorway + 0.004 : 0.03, shade(0x000000));
  }

  // ── Tree shapes: trunks and limbs as tubes, crowns of cards painted with leaves or twigs ──
  const leafHex = (kind: Species, r: Rand): number => {
    if (kind === 'pine') return r.pick([0x4a6038, 0x42583a]);
    if (kind === 'spruce') return r.pick([0x34502f, 0x2f4a30]);
    if (winter) return kind === 'birch' ? 0x6a5a50 : 0x5c544c;
    if (autumn) return kind === 'birch' ? r.pick([0xe0b838, 0xd8c040]) : kind === 'maple' ? r.pick([0xd8742c, 0xc85024, 0xe0a030]) : r.pick([0xc8a034, 0xb89a3a, 0x9a9a40]);
    if (env.season === 'spring') return kind === 'birch' ? 0x9cc860 : r.pick([0x86b450, 0x7aa848]);
    return kind === 'birch' ? r.pick([0x74a044, 0x6a9640]) : kind === 'bush' ? 0x5a8038 : r.pick([0x4e7a34, 0x467032, 0x5a8238]);
  };
  /** A crown: `n` cards spread over an ellipsoid round `c`, each facing out, darker underneath. */
  const crown = (c: P3, rx: number, ry: number, n: number, size: number, cell: CellName, hex: number, r: Rand, snowy: number) => {
    const uv = uvOf(cell);
    for (let k = 0; k < n; k++) {
      const y = 1 - (2 * (k + 0.5)) / n;
      const rad = Math.sqrt(1 - y * y);
      const th = k * 2.39996 + r.range(0, 0.6);
      const d: P3 = [Math.cos(th) * rad, y, Math.sin(th) * rad];
      const depth = r.range(0.45, 0.85);
      const p: P3 = [c[0] + d[0] * rx * depth, c[1] + d[1] * ry * depth, c[2] + d[2] * rx * depth];
      const yaw = th + r.range(-0.7, 0.7);
      const u: P3 = [-Math.sin(yaw), 0, Math.cos(yaw)];
      const tilt = Math.asin(y) * 0.8 + r.range(-0.3, 0.3);
      const v: P3 = [-Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), -Math.sin(tilt) * Math.sin(yaw)];
      const h = (size * r.range(0.8, 1.2)) / 2;
      const corner = (su: number, sv: number): P3 => [p[0] + (u[0] * su + v[0] * sv) * h, p[1] + (u[1] * su + v[1] * sv) * h, p[2] + (u[2] * su + v[2] * sv) * h];
      const lit = 0.6 + 0.48 * ((y + 1) / 2) + r.range(-0.06, 0.06);
      const col = shade(hex, lit).lerp(SNOW, snowy * Math.max(0, y));
      const nl = Math.hypot(d[0], d[1] + 0.5, d[2]);
      cuts.card(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), [d[0] / nl, (d[1] + 0.5) / nl, d[2] / nl], col, uv, false);
    }
  };
  // A tree's soft shade on the ground only in sunshine: under clouds or lamps it has none to speak of.
  const sunny = env.weather === 'clear' && env.sunAlt > 4;
  /** One tree or bush of its kind at a point, about its real size. */
  const tree = (p: V2, kind: Species, scale: number, r: Rand) => {
    const bare = winter && kind !== 'pine' && kind !== 'spruce';
    const hex = leafHex(kind, r);
    const snowy = snow * (bare ? 0 : 0.5);
    const base = at(p, 0);
    const limb = (from: P3, yaw: number, rise: number, len: number, r0: number, col: Color) => {
      const to: P3 = [from[0] + Math.cos(yaw) * len * Math.cos(rise), from[1] + len * Math.sin(rise), from[2] - Math.sin(yaw) * len * Math.cos(rise)];
      solids.tube(from, to, r0, r0 * 0.45, col, 4);
      return to;
    };
    if (kind === 'bush') {
      const s = 1.5 * scale;
      crown([base[0], s * 0.55, base[2]], s * 0.8, s * 0.55, bare ? 6 : 9, s * 1.1, bare ? 'twigs2' : 'bush', hex, r, snowy);
      if (sunny) spotDecal('blob', p, 0, s * 1.8, s * 1.8, 0.035, shade(0x000000));
      return;
    }
    if (kind === 'spruce') {
      const h = r.range(9, 16) * scale;
      const R = h * 0.21;
      solids.tube(base, at(p, h * 0.3), 0.2 * scale, 0.14 * scale, shade(0x4a3e34), 5);
      solids.cone(at(p, h * 0.12), R * 0.55, h * 0.9, shade(0x1e3424).lerp(SNOW, snow * 0.25), 6);
      const uv = uvOf('spruce');
      const tiers = 7;
      for (let k = 0; k < tiers; k++) {
        const f = k / tiers;
        const y0 = h * (0.12 + 0.82 * f);
        const rt = R * (1.15 - 0.95 * f);
        const arms = 8 - Math.floor(k / 2);
        for (let j = 0; j < arms; j++) {
          const a = (j / arms) * Math.PI * 2 + k * 0.7 + r.range(-0.2, 0.2);
          const dx = Math.cos(a);
          const dz = -Math.sin(a);
          const w = rt * 0.58;
          const inner: P3 = [base[0] + dx * 0.15, y0 + rt * 0.25, base[2] + dz * 0.15];
          const outer: P3 = [base[0] + dx * rt, y0 - rt * 0.12, base[2] + dz * rt];
          const sx = -dz * w;
          const sz = dx * w;
          const col = shade(hex, 0.72 + 0.4 * f + r.range(-0.05, 0.05)).lerp(SNOW, snow * 0.55);
          const nl = Math.hypot(dx * 0.5, 1, dz * 0.5);
          cuts.card([inner[0] - sx * 0.4, inner[1], inner[2] - sz * 0.4], [inner[0] + sx * 0.4, inner[1], inner[2] + sz * 0.4],
            [outer[0] + sx, outer[1], outer[2] + sz], [outer[0] - sx, outer[1], outer[2] - sz], [(dx * 0.5) / nl, 1 / nl, (dz * 0.5) / nl], col, uv, false);
        }
      }
      if (sunny) spotDecal('blob', p, 0, R * 2.4, R * 2.4, 0.035, shade(0x000000));
      return;
    }
    if (kind === 'pine') {
      const h = r.range(15, 21) * scale;
      solids.tube(base, at(p, h * 0.5), 0.24 * scale, 0.17 * scale, shade(0x5a4a3e), 5);
      solids.tube(at(p, h * 0.5), at(p, h * 0.94), 0.17 * scale, 0.07 * scale, shade(0x9a6448), 5);
      const clusters = 3 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < clusters; k++) {
        const a = r.range(0, 6.28);
        const y = h * r.range(0.7, 0.92);
        const off = k ? r.range(0.8, 1.8) * scale : 0;
        const c: P3 = [base[0] + Math.cos(a) * off, y, base[2] - Math.sin(a) * off];
        if (k) limb(at(p, y - 0.6), a, 0.4, off, 0.06 * scale, shade(0x8a5a40));
        crown(c, (k ? 1.5 : 2.2) * scale, 0.9 * scale, k ? 5 : 8, 2.2 * scale, 'pine', hex, r, snowy);
      }
      if (sunny) spotDecal('blob', p, 0, 5 * scale, 5 * scale, 0.035, shade(0x000000));
      return;
    }
    // Broadleaf trees: birch, linden, maple.
    const birch = kind === 'birch';
    const h = (birch ? r.range(11, 16) : kind === 'linden' ? r.range(10, 14) : r.range(8.5, 12)) * scale;
    const rx = h * (birch ? 0.2 : 0.3);
    const ry = h * (birch ? 0.36 : 0.32);
    const cy = h - ry;
    const barkC = birch ? shade(0xe6e4dc) : shade(0x4f463c);
    if (birch) solids.tube(base, at(p, 1.1), 0.17 * scale, 0.14 * scale, shade(0x4a4642), 5);
    solids.tube(birch ? at(p, 1.1) : base, at(p, birch ? h * 0.88 : cy), (birch ? 0.14 : 0.24) * scale, (birch ? 0.05 : 0.17) * scale, barkC, 6);
    if (birch) {
      // The birch's black marks across its white bark.
      for (let k = 0; k < 4; k++) {
        const y0 = r.range(1.4, h * 0.6);
        const f = y0 / (h * 0.88);
        const rad = ((0.14 - (0.14 - 0.05) * f) * scale) + 0.006;
        solids.tube(at(p, y0), at(p, y0 + r.range(0.05, 0.14)), rad, rad, shade(0x2e2a28), 6);
      }
    }
    // The crown: three to six lobes round the top of the trunk, each on a main branch of its own, so the sky shows
    // between them; bare twig cards in place of leaves from November to April.
    const lobes = birch ? 3 + (r() < 0.5 ? 1 : 0) : 4 + Math.floor(r.range(0, 2.99));
    const cell: CellName = bare ? (birch ? 'birchTwigs' : r.chance(0.5) ? 'twigs' : 'twigs2') : birch ? 'birch' : kind === 'maple' ? 'leaves2' : 'leaves';
    const fork = birch ? h * 0.42 : cy * 0.78;
    for (let k = 0; k < lobes; k++) {
      const yaw = (k / lobes) * Math.PI * 2 + r.range(-0.5, 0.5);
      const out = rx * r.range(0.35, 0.62);
      const up = cy + ry * r.range(-0.35, 0.4);
      const lc: P3 = [base[0] + Math.cos(yaw) * out, up, base[2] - Math.sin(yaw) * out];
      const from = at(p, fork + r.range(0, 1.2));
      const to: P3 = [lc[0] * 0.7 + from[0] * 0.3, lc[1] * 0.85 + from[1] * 0.15, lc[2] * 0.7 + from[2] * 0.3];
      solids.tube(from, to, (birch ? 0.05 : 0.09) * scale, (birch ? 0.025 : 0.045) * scale, barkC, 4);
      const lr = rx * r.range(0.5, 0.68);
      crown(lc, lr, lr * r.range(0.75, 1.0), bare ? 4 : birch ? 5 : 6, lr * 1.25, cell, hex, r, bare ? 0 : snowy);
    }
    // The leader's own top.
    crown([base[0], h - ry * 0.45, base[2]], rx * 0.45, ry * 0.4, bare ? 3 : 4, rx * 0.6, cell, hex, r, bare ? 0 : snowy);
    if (!bare && sunny) spotDecal('blob', p, 0, rx * 2.2, rx * 2.2, 0.035, shade(0x000000));
  };

  // ── Trees ──
  const plants: { p: V2; kind: Species; scale: number }[] = [];
  const sight = (p: V2) =>
    nearestOnSegment(p, camPos, site.spot).d < 5 || nearestOnSegment(p, camPos, site.roadSpot).d < 5 || dist(p, camPos) < 10;
  /** Can a tree stand here: clear of roads, houses, lamps, the spot and the camera's view? */
  const treeRoom = (p: V2, roadGap: number) =>
    !sight(p) &&
    dist(p, site.spot) >= 5 &&
    !street.roads.some((rd) => nearestOnLine(p, rd.pts).d < rd.width / 2 + roadGap) &&
    !street.buildings.some((bd) => pointInRing(p, bd.ring) || nearestOnRing(p, bd.ring).d < 2.5) &&
    !site.lamps.some((l) => dist(l.pos, p) < 2.5);
  street.areas.forEach((a, ai) => {
    if ((a.kind !== 'green' && a.kind !== 'forest') || plants.length > 180) return;
    const forest = a.kind === 'forest';
    const step = forest ? 6 : 13;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of a.ring) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    const r = rand(hash32('trees', site.seed, ai));
    for (let y = y0 + step / 2; y < y1; y += step) {
      for (let x = x0 + step / 2; x < x1; x += step) {
        const p: V2 = [x + r.range(-0.4, 0.4) * step, y + r.range(-0.4, 0.4) * step];
        if (!forest && r.chance(0.4)) continue;
        if (Math.hypot(p[0], p[1]) > 140 || plants.length > 180) continue;
        if (!pointInRing(p, a.ring) || !treeRoom(p, 2.4)) continue;
        // A forest's edge is ragged, with young birches, alders and undergrowth in front of the old trees.
        const edgeD = forest ? nearestOnRing(p, a.ring).d : Infinity;
        if (edgeD < r.range(0, 9)) continue;
        if (edgeD < 12 && r.chance(0.5)) {
          const q = along(p, dirOf(r.range(0, 6.28)), r.range(1.5, 3.5));
          if (pointInRing(q, a.ring) && treeRoom(q, 2)) plants.push({ p: q, kind: 'bush', scale: r.range(0.9, 1.6) });
        }
        const k = r();
        const kind: Species = forest
          ? edgeD < 14 ? (k < 0.45 ? 'birch' : k < 0.8 ? 'spruce' : 'pine') : k < 0.4 ? 'pine' : k < 0.75 ? 'spruce' : 'birch'
          : k < 0.3 ? 'linden' : k < 0.52 ? 'maple' : k < 0.8 ? 'birch' : k < 0.88 ? 'spruce' : k < 0.93 ? 'pine' : 'bush';
        plants.push({ p, kind, scale: r.range(0.8, 1.15) });
        // Bushes round the edges of a park or a yard.
        if (!forest && r.chance(0.35)) {
          const q = along(p, dirOf(r.range(0, 6.28)), r.range(3, 5));
          if (pointInRing(q, a.ring) && treeRoom(q, 1.2)) plants.push({ p: q, kind: 'bush', scale: r.range(0.7, 1.2) });
        }
      }
    }
  });
  islandTrees.forEach((p, i) => plants.push({ p, kind: i % 3 ? 'linden' : 'maple', scale: 0.6 }));
  plants.forEach((t, i) => tree(t.p, t.kind, t.scale, rand(hash32('tree', site.seed, i))));

  // ── Meshes ──
  const disposables: { dispose: () => void }[] = [];
  const add = (name: string, mb: MeshBuilder, mat: Material, cast: boolean, receive = true) => {
    if (mb.empty) return null;
    const m = new Mesh(mb.build(), mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
    disposables.push(m.geometry);
    return m;
  };
  const flatMat = new MeshLambertMaterial({ vertexColors: true });
  // In rain the hard ground shines: the lamps and the bright sky lie on it in streaks.
  const asphaltMat = env.rain
    ? new MeshPhongMaterial({ vertexColors: true, map: tex.asphalt, shininess: 70, specular: 0x4a4c50 })
    : new MeshLambertMaterial({ vertexColors: true, map: tex.asphalt });
  const pavingMat = env.rain
    ? new MeshPhongMaterial({ vertexColors: true, map: tex.paving, shininess: 50, specular: 0x34363a })
    : new MeshLambertMaterial({ vertexColors: true, map: tex.paving });
  const turfMat = new MeshLambertMaterial({ vertexColors: true, map: tex.grass });
  const decalMat = new MeshLambertMaterial({ vertexColors: true, map: tex.decals, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const wallMat = new MeshLambertMaterial({ vertexColors: true, map: tex.atlas.map, emissiveMap: tex.atlas.lit, emissive: 0xffffff, emissiveIntensity: 0 });
  // A wall takes its own colour where the painting's alpha says so, and keeps the painted one elsewhere.
  wallMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        'vec4 sheetTexel = texture2D( map, vMapUv );\nfloat ownTint = clamp( sheetTexel.a * 2.0 - 1.0, 0.0, 1.0 );\ndiffuseColor.rgb *= sheetTexel.rgb * mix( vec3( 1.0 ), vColor.rgb, ownTint );',
      )
      .replace('#include <color_fragment>', '');
  };
  wallMat.customProgramCacheKey = () => 'cctv-wall';
  const cutMat = new MeshLambertMaterial({ vertexColors: true, map: tex.atlas.map, alphaTest: 0.5, side: DoubleSide });
  const headMat = new MeshBasicMaterial({ color: 0x55565a });
  const glowMat = new MeshBasicMaterial({ map: tex.glow, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide });
  // The ground is drawn after what stands on it, and its upper layers before the lower ones, so that hidden ground
  // is not painted first and then painted over (the cost that counts on a phone).
  const groundOrder = (m: Mesh | null, k: number) => m && (m.renderOrder = k);
  groundOrder(add('turf', turf, turfMat, false), 3);
  groundOrder(add('asphalt', asphalt, asphaltMat, true), 1);
  groundOrder(add('paving', paving, pavingMat, false), 2);
  groundOrder(add('flags', flags, pavingMat, false), 2);
  const settsMat = env.rain
    ? new MeshPhongMaterial({ vertexColors: true, map: tex.setts, shininess: 60, specular: 0x3a3c40 })
    : new MeshLambertMaterial({ vertexColors: true, map: tex.setts });
  groundOrder(add('setts', setts, settsMat, true), 1);
  disposables.push(settsMat);
  const decalMesh = add('decals', decals, decalMat, false);
  if (decalMesh) decalMesh.renderOrder = 1;
  add('walls', walls, wallMat, true);
  add('cuts', cuts, cutMat, true);
  add('solids', solids, flatMat, true);
  add('heads', heads, headMat, false, false);
  const glowMesh = add('glows', glows, glowMat, false, false);
  if (glowMesh) {
    glowMesh.renderOrder = 2;
    glowMesh.visible = false;
  }
  disposables.push(flatMat, asphaltMat, pavingMat, turfMat, decalMat, wallMat, cutMat, headMat, glowMat);
  if (!parkedCars.paint.empty) {
    const mats = carMaterials();
    add('parked', parkedCars.paint, mats.paint, true);
    add('parkedGlass', parkedCars.glass, mats.glass, true);
  }

  return {
    group,
    lamps,
    setNight: (k, lampsOn) => {
      wallMat.emissiveIntensity = lampsOn ? 0.2 + 0.5 * k : 0;
      headMat.color.setHex(lampsOn ? 0xfff1d6 : 0x55565a);
      if (glowMesh) {
        glowMesh.visible = lampsOn && k > 0.2;
        glowMat.opacity = Math.min(1, k * 1.2);
      }
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
