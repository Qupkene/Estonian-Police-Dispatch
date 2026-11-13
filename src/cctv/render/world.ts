/**
 * The standing part of a camera picture: the ground, the roads with their pavements and markings, the houses with
 * rows of windows, the trees, the lamps and the cars parked in car parks. Built once per camera from the site
 * (src/cctv/site.ts) and the day's weather; a handful of meshes, each one draw call.
 */
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Texture,
} from 'three';
import type { Env } from '../env';
import {
  along,
  boundingBox,
  clamp,
  dirOf,
  dist,
  hash01,
  hash32,
  left,
  lineLength,
  mul,
  nearestOnLine,
  nearestOnSegment,
  norm,
  pointAlong,
  pointInRing,
  rand,
  ringArea,
  ringCentroid,
  sub,
  type V2,
} from '../math';
import { CAR_ROADS, type Building, type Road, type RoadClass, type Site } from '../types';
import { lookOfAnyCar } from '../vehicle';
import { carMaterials, drawCar } from './cars';
import { at, MeshBuilder, shade, xfAt } from './mesh';
import { WINDOW_CELLS } from './textures';

const WALLS = [0xd8c79a, 0xcfc3ad, 0xbdbdb8, 0xdcdad2, 0x9a5a48, 0xa9aaa6, 0x9aa590, 0x8f9aa6, 0xc9b79a, 0xb8a58a, 0xd2cdbf, 0x8a6a58];
const HOUSE_WALLS = [0xd9cfa8, 0xa8c0b0, 0xc8b08a, 0x7a5a44, 0xd8d4c8, 0x9a6a50, 0xb7c4cc, 0xcdbf8f, 0x8c9a80];
const FLAT_ROOFS = [0x4f5054, 0x45464a, 0x5a5a58, 0x504a46];
const PITCHED_ROOFS = [0x7a3f33, 0x4a4a4c, 0x5a5348, 0x3e5a4a, 0x6b3a30, 0x38383a];
const SNOW = new Color(0xe4e9ee);

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
  pedestrian: 0x8c8980,
  rail: 0x6a655c,
  service: 0x5c5d60,
  living: 0x5a5b5e,
  residential: 0x55565a,
  tertiary: 0x505155,
  secondary: 0x4b4c50,
  primary: 0x47484c,
  trunk: 0x45464a,
  motorway: 0x434448,
  tram: 0x2e2f33,
};

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

export function buildWorld(site: Site, env: Env, tex: { wall: Texture; lit: Texture }): World {
  const { street } = site;
  const group = new Group();
  const ground = new MeshBuilder();
  const walls = new MeshBuilder();
  const solids = new MeshBuilder();
  const heads = new MeshBuilder();
  const parkedCars = { paint: new MeshBuilder(), glass: new MeshBuilder() };
  const lamps: WorldLamp[] = [];
  const snow = env.snow;
  const wet = env.rain ? 0.74 : 1;
  /** A surface colour with the day's snow on it. */
  const surf = (hex: number, snowShare: number, k = 1) => shade(hex, k).lerp(SNOW, clamp(snow * snowShare, 0, 1));
  const autumn = env.season === 'autumn';
  const winter = env.season === 'winter';
  const grass = autumn ? 0x6f7445 : winter ? 0x66694c : env.season === 'spring' ? 0x6a8a48 : 0x5d7a45;

  // ── The ground, and what the map says lies on it ──
  const disc: V2[] = [];
  const reach = street.radius + 90;
  for (let i = 0; i < 28; i++) disc.push([Math.cos((i / 28) * Math.PI * 2) * reach, Math.sin((i / 28) * Math.PI * 2) * reach]);
  ground.flat(disc, 0, surf(winter ? 0x64665a : 0x6c7062, 0.9));
  for (const a of street.areas) {
    if (a.ring.length < 3) continue;
    const c =
      a.kind === 'green'
        ? surf(grass, 0.95)
        : a.kind === 'forest'
          ? surf(0x4a5a3c, 0.8)
          : a.kind === 'water'
            ? snow > 0.7 ? shade(0xcfd8de) : shade(0x35505f)
            : a.kind === 'paved'
              ? surf(0x8d8d88, 0.55, wet)
              : a.kind === 'parking'
                ? surf(0x58595d, 0.4, wet)
                : a.kind === 'sand'
                  ? surf(0xc9b98a, 0.9)
                  : surf(0x87966a, 0.9);
    ground.flat(a.ring, a.kind === 'water' ? 0.012 : 0.02, c);
  }

  // ── Roads ──
  const carRoads = street.roads.filter((r) => CAR_ROADS.has(r.cls) && !r.tunnel);
  /** Is a point on the carriageway of a car road other than `self`? */
  const onOtherRoad = (p: V2, self: Road, margin: number) => {
    for (const r of carRoads) {
      if (r === self) continue;
      if (nearestOnLine(p, r.pts).d < r.width / 2 + margin) return true;
    }
    return false;
  };
  const kerb = surf(0x9b9b96, 0.55, wet);
  const paint = surf(0xdcdcd8, 0.6);
  for (const r of street.roads) {
    if (r.pts.length < 2 || r.tunnel) continue;
    const level = ROAD_LEVEL[r.cls];
    const asphalt = r.cls === 'path' || r.cls === 'pedestrian' ? surf(ROAD_COLOR[r.cls], 0.7, wet) : surf(ROAD_COLOR[r.cls], 0.35, wet);
    if (r.cls === 'rail' || r.cls === 'tram') {
      if (r.cls === 'rail') ground.ribbon(r.pts, r.width, level, surf(ROAD_COLOR.rail, 0.5));
      const steel = shade(0x3a3b3e);
      ground.ribbon(r.pts, 0.1, level + 0.02, steel, 0.72);
      ground.ribbon(r.pts, 0.1, level + 0.02, steel, -0.72);
      continue;
    }
    ground.ribbon(r.pts, r.width, level, asphalt);
    const pts = resample(r.pts, 4);
    if (r.walk) {
      // Pavements, left out where another street joins.
      for (const side of [1, -1]) {
        for (let i = 0; i < pts.length - 1; i++) {
          const dir = norm(sub(pts[i + 1], pts[i]));
          const n = mul(left(dir), side);
          const mid = along([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2], n, r.width / 2 + 1.1);
          if (onOtherRoad(mid, r, 0.6)) continue;
          ground.ribbon([pts[i], pts[i + 1]], 2.2, 0.13, kerb, side * (r.width / 2 + 1.1));
        }
      }
    }
    const main = r.cls === 'tertiary' || r.cls === 'secondary' || r.cls === 'primary' || r.cls === 'trunk' || r.cls === 'motorway';
    if (main && snow < 0.6) {
      // The broken centre line: 3 m of paint, 6 m of gap, not through junctions.
      const total = lineLength(r.pts);
      for (let s = 2; s + 3 < total; s += 9) {
        const a = pointAlong(r.pts, s).pt;
        const b = pointAlong(r.pts, s + 3).pt;
        if (onOtherRoad(a, r, 1.2) || onOtherRoad(b, r, 1.2)) continue;
        ground.ribbon([a, b], 0.13, level + 0.012, paint);
      }
      if (r.cls !== 'tertiary') {
        ground.ribbon(r.pts, 0.12, level + 0.012, paint, r.width / 2 - 0.25);
        ground.ribbon(r.pts, 0.12, level + 0.012, paint, -(r.width / 2 - 0.25));
      }
    }
  }

  // ── Houses ──
  const cells = WINDOW_CELLS;
  const blank: V2 = [0.5 / (cells * 32), 1 - 0.5 / (cells * 32)];
  street.buildings.forEach((b: Building, index) => {
    if (b.ring.length < 3) return;
    const ring = ringArea(b.ring) > 0 ? b.ring : b.ring.slice().reverse();
    const house = b.roof === 'gable';
    const tone = 0.86 + 0.22 * hash01('tone', b.id);
    const wallHex = house ? HOUSE_WALLS[hash32('wall', b.id) % HOUSE_WALLS.length] : WALLS[hash32('wall', b.id) % WALLS.length];
    const wall = shade(wallHex, tone);
    const roofHex = house ? PITCHED_ROOFS[hash32('roof', b.id) % PITCHED_ROOFS.length] : FLAT_ROOFS[hash32('roof', b.id) % FLAT_ROOFS.length];
    const roof = surf(roofHex, 0.9);
    if (b.open) {
      // A roof on posts.
      const c = ringCentroid(ring);
      const top = b.height;
      solids.flat(ring, top, surf(0xd8d8d4, 0.8));
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const d = ring[(i + 1) % ring.length];
        const out: [number, number, number] = [d[1] - a[1], 0, d[0] - a[0]];
        solids.quad(at(a, top - 0.35), at(d, top - 0.35), at(d, top), at(a, top), shade(0xc8c8c4), out);
        const post = along(a, norm(sub(c, a)), 0.7);
        solids.box(post, 0, 0.26, 0.26, 0, top - 0.3, shade(0x8a8c90));
      }
      return;
    }
    const floors = Math.max(1, Math.round((b.height - b.base - 0.5) / 3));
    const plain = b.height - b.base < 2.9 || b.area < 22;
    const hall = b.area > 1500 && b.height < 13;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const d = ring[(i + 1) % ring.length];
      const len = dist(a, d);
      if (len < 0.25) continue;
      const out: [number, number, number] = [d[1] - a[1], 0, d[0] - a[0]];
      let uvs: [V2, V2, V2, V2];
      if (plain) uvs = [blank, blank, blank, blank];
      else {
        const bays = Math.max(1, Math.round(len / (hall ? 7 : 3.1)));
        const u0 = (hash32('u', b.id, i) % cells) / cells;
        const v0 = (hash32('v', b.id, i) % cells) / cells;
        const u1 = u0 + bays / cells;
        const v1 = v0 + (hall ? Math.max(1, Math.round(floors / 2)) : floors) / cells;
        uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      }
      walls.quad(at(a, b.base), at(d, b.base), at(d, b.height), at(a, b.height), wall, out, uvs);
    }
    if (!house || ring.length < 3) {
      solids.flat(ring, b.height, roof);
      return;
    }
    // A pitched roof over the footprint's bounding rectangle: two slopes and the two gable ends.
    const bb = boundingBox(ring);
    const rise = clamp(bb.short * 0.36, 1.2, 4.2);
    const over = 0.38;
    const u = bb.axis;
    const w = left(u);
    const e0 = along(bb.c, u, -(bb.long / 2 + over));
    const e1 = along(bb.c, u, bb.long / 2 + over);
    const half = bb.short / 2 + over;
    const top = b.height + rise;
    const eave = b.height - 0.05;
    const up: [number, number, number] = [0, 1, 0];
    solids.quad(at(along(e0, w, half), eave), at(along(e1, w, half), eave), at(e1, top), at(e0, top), roof, [w[0], 1, -w[1]]);
    solids.quad(at(along(e0, w, -half), eave), at(along(e1, w, -half), eave), at(e1, top), at(e0, top), roof, [-w[0], 1, w[1]]);
    void up;
    for (const end of [-1, 1]) {
      const g = along(bb.c, u, (end * bb.long) / 2);
      walls.tri(at(along(g, w, bb.short / 2), b.height), at(along(g, w, -bb.short / 2), b.height), at(g, top - 0.12), wall, [blank, blank, blank]);
      walls.tri(at(along(g, w, -bb.short / 2), b.height), at(along(g, w, bb.short / 2), b.height), at(g, top - 0.12), wall, [blank, blank, blank]);
    }
    void index;
  });

  // ── The door and its lamp ──
  if (site.door && site.doorOut) {
    const t = left(site.doorOut);
    const p = along(site.door, site.doorOut, 0.06);
    const a = along(p, t, -0.6);
    const b = along(p, t, 0.6);
    const out: [number, number, number] = [site.doorOut[0], 0, -site.doorOut[1]];
    solids.quad(at(a, 0.05), at(b, 0.05), at(b, 2.2), at(a, 2.2), shade(0x3b2f28), out);
    const hood = along(site.door, site.doorOut, 0.5);
    solids.box(hood, Math.atan2(t[1], t[0]), 1.9, 1.0, 2.35, 2.45, shade(0x77787a));
    const lampAt = along(site.door, site.doorOut, 0.25);
    heads.box(lampAt, 0, 0.22, 0.22, 2.2, 2.34, shade(0xffffff));
    lamps.push({ x: lampAt[0], y: 2.15, z: -lampAt[1], power: 0.16 });
  }

  // ── Street lamps ──
  for (const l of site.lamps) {
    const d = dirOf(l.yaw);
    const reachArm = l.height > 7 ? 1.9 : 1.2;
    solids.box(l.pos, 0, 0.16, 0.16, 0, l.height, shade(0x6f7276));
    solids.box(along(l.pos, d, reachArm / 2), l.yaw, reachArm, 0.1, l.height - 0.12, l.height, shade(0x6f7276));
    const head = along(l.pos, d, reachArm);
    heads.box(head, l.yaw, 0.7, 0.26, l.height - 0.2, l.height - 0.06, shade(0xffffff));
    lamps.push({ x: head[0], y: l.height - 0.3, z: -head[1], power: 1 });
  }

  // ── Parked cars in the car parks ──
  const camPos = site.camera.pos;
  const keepClear = (p: V2, m: number) =>
    dist(p, site.spot) < m + 3 || nearestOnLine(p, site.drive.pts).d < site.drive.width / 2 + m || dist(p, camPos) < 3;
  let parked = 0;
  const fill = env.night > 0.5 ? 0.32 : 0.58;
  street.areas.forEach((a, ai) => {
    if (a.kind !== 'parking' || parked > 44) return;
    const bb = boundingBox(a.ring);
    const u = bb.axis;
    const w = left(u);
    const r = rand(hash32('park', site.seed, ai));
    // Rows of bays across the short side, an aisle between every pair of rows.
    let row = 0;
    for (let v = -bb.short / 2 + 2.7; v < bb.short / 2 - 2.4 && parked <= 44; row++) {
      const facing = row % 2 ? Math.atan2(-w[1], -w[0]) : Math.atan2(w[1], w[0]);
      for (let s = -bb.long / 2 + 1.6; s < bb.long / 2 - 1.4; s += 2.75) {
        const p = along(along(bb.c, u, s), w, v);
        if (!r.chance(fill) || !pointInRing(p, a.ring) || keepClear(p, 1.6)) continue;
        if (street.buildings.some((bd) => pointInRing(p, bd.ring))) continue;
        drawCar(parkedCars, lookOfAnyCar(hash32('pc', site.seed, ai, row, Math.round(s * 10))), xfAt(p, facing + r.range(-0.04, 0.04), 0.05));
        parked++;
      }
      v += row % 2 ? 5.2 : 11.4;
    }
  });

  // ── Trees ──
  const trunks: { p: V2; h: number; r: number; cone: boolean; c: Color }[] = [];
  const sight = (p: V2) =>
    nearestOnSegment(p, camPos, site.spot).d < 3.2 || nearestOnSegment(p, camPos, site.roadSpot).d < 3.2 || dist(p, camPos) < 4.5;
  street.areas.forEach((a, ai) => {
    if ((a.kind !== 'green' && a.kind !== 'forest') || trunks.length > 260) return;
    const forest = a.kind === 'forest';
    const step = forest ? 6.5 : 15;
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
        if (!forest && r.chance(0.45)) continue;
        if (Math.hypot(p[0], p[1]) > 135 || trunks.length > 260) continue;
        if (!pointInRing(p, a.ring) || sight(p) || dist(p, site.spot) < 5) continue;
        if (street.roads.some((rd) => nearestOnLine(p, rd.pts).d < rd.width / 2 + 2.4)) continue;
        if (street.buildings.some((bd) => pointInRing(p, bd.ring) || dist(p, ringCentroid(bd.ring)) < 3)) continue;
        if (site.lamps.some((l) => dist(l.pos, p) < 2.5)) continue;
        const cone = r.chance(forest ? 0.55 : 0.18);
        let hex: number;
        if (cone) hex = 0x2f4a33;
        else if (winter) hex = 0x6b6258;
        else if (autumn) hex = r.pick([0xb8872e, 0xa85a24, 0x8a8a35, 0xc49a2a]);
        else hex = env.season === 'spring' ? r.pick([0x5f8a3e, 0x6a9444]) : r.pick([0x466b34, 0x3f6130, 0x4f7438]);
        const c = shade(hex, r.range(0.85, 1.12)).lerp(SNOW, snow * (cone ? 0.4 : winter ? 0.25 : 0));
        trunks.push({ p, h: cone ? r.range(7, 13) : r.range(2.6, 4.4), r: cone ? r.range(1.7, 2.6) : r.range(2.1, 3.7) * (winter ? 0.8 : 1), cone, c });
      }
    }
  });

  // ── Meshes ──
  const flatMat = new MeshLambertMaterial({ vertexColors: true });
  const wallMat = new MeshLambertMaterial({ vertexColors: true, map: tex.wall, emissiveMap: tex.lit, emissive: 0xffffff, emissiveIntensity: 0 });
  const headMat = new MeshBasicMaterial({ color: 0x55565a });
  const groundMesh = new Mesh(ground.build(), flatMat);
  groundMesh.receiveShadow = true;
  const wallMesh = new Mesh(walls.build(), wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  const solidMesh = new Mesh(solids.build(), flatMat);
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  const headMesh = new Mesh(heads.build(), headMat);
  group.add(groundMesh, wallMesh, solidMesh, headMesh);

  const disposables: { dispose: () => void }[] = [groundMesh.geometry, wallMesh.geometry, solidMesh.geometry, headMesh.geometry, flatMat, wallMat, headMat];
  if (!parkedCars.paint.empty) {
    const mats = carMaterials();
    for (const [builder, mat] of [[parkedCars.paint, mats.paint], [parkedCars.glass, mats.glass]] as const) {
      const m = new Mesh(builder.build(), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      disposables.push(m.geometry);
    }
  }
  if (trunks.length) {
    const trunkGeo = new CylinderGeometry(0.14, 0.2, 1, 5);
    const roundGeo = new IcosahedronGeometry(1, 0);
    const coneGeo = new ConeGeometry(1, 1, 6);
    const barkMat = new MeshLambertMaterial({ color: 0x4f463c });
    const leafMat = new MeshLambertMaterial({ color: 0xffffff });
    const round = trunks.filter((t) => !t.cone);
    const cones = trunks.filter((t) => t.cone);
    const trunkMesh = new InstancedMesh(trunkGeo, barkMat, trunks.length);
    const roundMesh = new InstancedMesh(roundGeo, leafMat, Math.max(1, round.length));
    const coneMesh = new InstancedMesh(coneGeo, leafMat, Math.max(1, cones.length));
    const m = new Matrix4();
    const q = new Quaternion();
    const yAxis = new Vector3(0, 1, 0);
    trunks.forEach((t, i) => {
      const th = t.cone ? t.h * 0.3 : t.h;
      m.compose(new Vector3(t.p[0], th / 2, -t.p[1]), q.identity(), new Vector3(1, th, 1));
      trunkMesh.setMatrixAt(i, m);
    });
    round.forEach((t, i) => {
      q.setFromAxisAngle(yAxis, hash01('turn', i) * 6.28);
      m.compose(new Vector3(t.p[0], t.h + t.r * 0.55, -t.p[1]), q, new Vector3(t.r, t.r * 0.86, t.r));
      roundMesh.setMatrixAt(i, m);
      roundMesh.setColorAt(i, t.c);
    });
    cones.forEach((t, i) => {
      const ch = t.h * 0.82;
      m.compose(new Vector3(t.p[0], t.h * 0.22 + ch / 2, -t.p[1]), q.identity(), new Vector3(t.r, ch, t.r));
      coneMesh.setMatrixAt(i, m);
      coneMesh.setColorAt(i, t.c);
    });
    roundMesh.count = round.length;
    coneMesh.count = cones.length;
    for (const im of [trunkMesh, roundMesh, coneMesh]) {
      im.castShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      group.add(im);
    }
    disposables.push(trunkGeo, roundGeo, coneGeo, barkMat, leafMat, trunkMesh, roundMesh, coneMesh);
  }

  return {
    group,
    lamps,
    setNight: (k, lampsOn) => {
      wallMat.emissiveIntensity = lampsOn ? 0.25 + 0.75 * k : 0;
      headMat.color.setHex(lampsOn ? 0xfff1d6 : 0x55565a);
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
