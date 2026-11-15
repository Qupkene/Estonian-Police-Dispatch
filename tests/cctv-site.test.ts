/**
 * The geometry a camera scene stands on (docs/CCTV.md section 4.2): the site worked out on a street
 * (src/cctv/site.ts) is checked for what the director and the renderer rely on, and for what ends up in the
 * camera's picture. Failures are collected and printed with their place and seed.
 *
 * Two things are measured on every site:
 *  - validity: nothing stands inside a house or in water (the spot, the camera, the walking lines near the spot)
 *    and the camera has a free line to the spot;
 *  - framing, with this file's own projection of the pose (16:9): the spot, a standing adult's size, the stretch
 *    of road the first crews stop on from each end they can come from with the first crew's car, the door, and how
 *    much of the picture is street rather than a wall before the lens.
 *
 * The streets: every kind of place of src/cctv/procedural.ts, hand-made streets with what real map tiles bring
 * (a lane between house fronts, an incident inside a block, a quay, a dead end, a passage), and a real town when
 * the environment variable EPD_PMTILES_SAMPLE names its map archive (a .pmtiles file with zoom 15 tiles). Without it
 * that block is skipped.
 */
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PMTiles } from 'pmtiles';
import { CAMERA_CHANCE } from '@/cctv/coverage';
import {
  dist,
  lineLength,
  nearestOnLine,
  nearestOnRing,
  pointAlong,
  pointInRing,
  rand,
  type V2,
} from '@/cctv/math';
import { layoutOf, makeStreet } from '@/cctv/procedural';
import { buildSite, clearLine, onDrive, pavement, projectPoint, walkLine } from '@/cctv/site';
import { readStreet } from '@/cctv/tiles';
import type { Building, CameraPose, Road, Site, StreetData } from '@/cctv/types';
import type { PlaceKind } from '@/sim/types';

const KINDS = Object.keys(CAMERA_CHANCE) as PlaceKind[];
const SEEDS = Array.from({ length: 40 }, (_, i) => 1 + i * 7919);
/** The seeds the picture is measured for: a dozen per kind of place. */
const FRAME_SEEDS = SEEDS.slice(0, 12);

const finite = (p: V2) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const fmt = (p: V2) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`;

// ---------------------------------------------------------------------------- the ground

/** A building with walls from the ground up (not a roof on posts, not a part held up over a passage). */
const solid = (b: Building) => !b.open && b.base < 2.5;

/** The index of the building with walls the point is inside, or -1. */
function insideAny(street: StreetData, p: V2): number {
  return street.buildings.findIndex((b) => solid(b) && pointInRing(p, b.ring));
}

/** In water, and not on a road over it (a bridge, a quay the map draws the river under). */
function inWater(street: StreetData, p: V2): boolean {
  if (!street.areas.some((a) => a.kind === 'water' && pointInRing(p, a.ring))) return false;
  return !street.roads.some((r) => nearestOnLine(p, r.pts).d < r.width / 2 + 3);
}

/** Where along ab (0..1) the segment crosses the outline of a ring. */
function crossings(a: V2, b: V2, ring: readonly V2[]): number[] {
  const out: number[] = [];
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const c = ring[j];
    const sx = ring[i][0] - c[0];
    const sy = ring[i][1] - c[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
    const k = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
    if (t >= 0 && t <= 1 && k >= 0 && k <= 1) out.push(t);
  }
  return out;
}

/** Is the point `h` metres up hidden from the lens by a house, or by a shelter's roof the line would pass through? */
function hidden(street: StreetData, cam: CameraPose, p: V2, h: number): boolean {
  for (const b of street.buildings) {
    const hs = crossings(cam.pos, p, b.ring).map((t) => cam.height + (h - cam.height) * t);
    if (pointInRing(p, b.ring)) hs.push(h);
    if (!hs.length) continue;
    if (solid(b)) {
      if (hs.some((x) => x < b.height)) return true;
    } else if (b.open && hs.some((x) => x > b.height - 0.7) && hs.some((x) => x < b.height)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------- the picture

type V3 = readonly [number, number, number];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A pose's axes in scene space (x east, y north, z up) and the tangents of half its fields of view (16:9). */
function axes(cam: CameraPose): { o: V3; f: V3; r: V3; u: V3; tv: number; th: number } {
  const o: V3 = [cam.pos[0], cam.pos[1], cam.height];
  const f = unit3([cam.target[0] - o[0], cam.target[1] - o[1], cam.targetHeight - o[2]]);
  const r = unit3(cross3(f, [0, 0, 1]));
  const tv = Math.tan((cam.fov * Math.PI) / 360);
  return { o, f, r, u: cross3(r, f), tv, th: (tv * 16) / 9 };
}

interface Seen {
  /** -1 at the left edge of the picture, 1 at the right. */
  x: number;
  /** -1 at the bottom, 1 at the top. */
  y: number;
  /** Metres in front of the lens. */
  z: number;
}

/** Where a point `h` metres above the ground lands in the pose's picture: a plain pinhole camera. */
function project(cam: CameraPose, p: V2, h: number): Seen {
  const a = axes(cam);
  const d: V3 = [p[0] - a.o[0], p[1] - a.o[1], h - a.o[2]];
  const z = dot3(d, a.f);
  if (z < 0.05) return { x: Infinity, y: Infinity, z };
  return { x: dot3(d, a.r) / z / a.th, y: dot3(d, a.u) / z / a.tv, z };
}

/** In the picture, `margin` of the half frame inside its edge. */
const inFrame = (q: Seen, margin: number) =>
  q.z > 0.5 && Math.abs(q.x) <= 1 - margin && Math.abs(q.y) <= 1 - margin;

/** May a crew come from this end of the road? Not out of a dead end while the other end is open (the director's rule). */
const comesFrom = (site: Site, a: boolean) => {
  const d = site.drive;
  return !(a ? d.deadA : d.deadB) || (a ? d.deadB : d.deadA);
};

/** What a camera's picture holds. */
interface Framing {
  spot: Seen;
  /** A standing adult at the spot, as a share of the picture's height. */
  person: number;
  /** How steeply the lens looks down at the spot, degrees. */
  steep: number;
  /**
   * Per end crews come from (a, b; null: nobody comes from there): the share of the stopping stretch's centre line
   * (14 m before the spot to 6 m past it) that is in the picture among the points no house hides, the share a house
   * hides, and whether the first crew's car (7 m short of the spot at its own kerb) is whole in the picture.
   */
  ends: ({ seen: number; hid: number; car: boolean | null } | null)[];
  /** The door in the picture (null: the site has none). */
  door: boolean | null;
  /** The door is within 12 m of the spot: the scene is at it. */
  doorNear: boolean;
  /** Of a grid of rays through the picture: the share that reaches the ground, and the share stopped by a house within 5 m. */
  ground: number;
  nearWall: number;
}

function framing(site: Site): Framing {
  const st = site.street;
  const cam = site.camera;
  const d = site.drive;
  const feet = project(cam, site.spot, 0);
  const head = project(cam, site.spot, 1.75);
  const kerb = Math.max(0, d.width / 2 - 1.15);

  const end = (fromA: boolean): { seen: number; hid: number; car: boolean | null } | null => {
    if (!comesFrom(site, fromA)) return null;
    const back = fromA ? -1 : 1;
    let n = 0;
    let seen = 0;
    let hid = 0;
    for (let k = -14; k <= 6; k += 2) {
      const s = d.at - back * k;
      if (s < 0 || s > d.length) continue;
      const p = pointAlong(d.pts, s).pt;
      n++;
      if (hidden(st, cam, p, 0.3)) hid++;
      else if (inFrame(project(cam, p, 0), 0.1)) seen++;
    }
    // The first crew's car: 4.6 m long and 1.9 m wide, its middle 7 m before the spot (src/cctv/director.ts).
    const s0 = d.at + back * 7;
    let car: boolean | null = s0 < 3.5 || s0 > d.length - 3.5 ? null : true;
    for (const ds of [-2.3, 2.3]) {
      for (const dl of [-0.95, 0.95]) {
        const p = onDrive(d, s0 + ds, back * kerb + dl).pos;
        for (const h of [0, 1.6])
          if (car && (!inFrame(project(cam, p, h), 0.04) || (h > 0 && hidden(st, cam, p, h)))) car = false;
      }
    }
    return { seen: n - hid > 0 ? seen / (n - hid) : 1, hid: n ? hid / n : 0, car };
  };

  // The door: its foot and the window above it, where a fire's smoke comes out (src/cctv/director.ts).
  let door: boolean | null = null;
  if (site.door && site.doorOut) {
    const p: V2 = [site.door[0] + site.doorOut[0] * 0.3, site.door[1] + site.doorOut[1] * 0.3];
    door =
      inFrame(project(cam, p, 0.2), 0.04) && inFrame(project(cam, p, 2.8), 0.04) && !hidden(st, cam, p, 1.2);
  }

  // A grid of 7 x 7 rays through the picture, each followed to the ground or to the first house.
  const a = axes(cam);
  let rays = 0;
  let ground = 0;
  let nearWall = 0;
  for (let gx = -0.9; gx <= 0.91; gx += 0.3) {
    for (let gy = -0.9; gy <= 0.91; gy += 0.3) {
      rays++;
      const dir: V3 = [
        a.f[0] + a.r[0] * gx * a.th + a.u[0] * gy * a.tv,
        a.f[1] + a.r[1] * gx * a.th + a.u[1] * gy * a.tv,
        a.f[2] + a.r[2] * gx * a.th + a.u[2] * gy * a.tv,
      ];
      const flat = Math.hypot(dir[0], dir[1]) || 1e-9;
      const reach = 90;
      const to: V2 = [cam.pos[0] + (dir[0] / flat) * reach, cam.pos[1] + (dir[1] / flat) * reach];
      const toGround = dir[2] < 0 ? (cam.height / -dir[2]) * flat : Infinity;
      let wall = Infinity;
      for (const b of st.buildings) {
        if (!solid(b)) continue;
        for (const t of crossings(cam.pos, to, b.ring)) {
          const z = cam.height + (dir[2] / flat) * t * reach;
          if (z >= 0 && z < b.height && t * reach < wall) wall = t * reach;
        }
        // The ray comes down on the roof.
        const down: V2 = [cam.pos[0] + (dir[0] / flat) * toGround, cam.pos[1] + (dir[1] / flat) * toGround];
        if (toGround < wall && toGround < reach && pointInRing(down, b.ring)) wall = toGround - 0.01;
      }
      if (toGround <= wall) ground++;
      else if (wall < 5) nearWall++;
    }
  }
  return {
    spot: project(cam, site.spot, 0.9),
    person: feet.z > 0.5 && head.z > 0.5 ? (head.y - feet.y) / 2 : 0,
    steep: (Math.atan2(cam.height - 0.9, dist(cam.pos, site.spot)) * 180) / Math.PI,
    ends: [end(true), end(false)],
    door,
    doorNear: !!site.door && dist(site.door, site.spot) <= 12,
    ground: ground / rays,
    nearWall: nearWall / rays,
  };
}

// ---------------------------------------------------------------------------- what is wrong with a site

/** What makes a site unusable, in words (empty when nothing does): the things that are never given up. */
function invalid(street: StreetData, site: Site): string[] {
  const out: string[] = [];
  const { spot, camera } = site;
  const inSpot = insideAny(street, spot);
  if (inSpot >= 0) out.push(`spot ${fmt(spot)} inside building ${street.buildings[inSpot].id}`);
  if (inWater(street, spot)) out.push(`spot ${fmt(spot)} in water`);
  const inCam = insideAny(street, camera.pos);
  if (inCam >= 0) out.push(`camera ${fmt(camera.pos)} inside building ${street.buildings[inCam].id}`);
  if (inWater(street, camera.pos)) out.push(`camera ${fmt(camera.pos)} in water`);
  if (!clearLine(street, camera.pos, spot))
    out.push(`no clear line from the camera ${fmt(camera.pos)} to the spot ${fmt(spot)}`);
  if (hidden(street, camera, spot, 0.9))
    out.push(`the spot ${fmt(spot)} is hidden from the lens ${fmt(camera.pos)}`);
  // The walking lines within 20 m of the spot: no step of them inside a house.
  for (const same of [true, false]) {
    const line = walkLine(site, same);
    const n = nearestOnLine(spot, line);
    const end = Math.min(lineLength(line), n.s + 20);
    for (let s = Math.max(0, n.s - 20); s <= end; s += 0.5) {
      const p = pointAlong(line, s).pt;
      if (insideAny(street, p) < 0) continue;
      out.push(
        `the walking line on ${same ? 'the same' : 'the other'} side runs through a house at ${fmt(p)}`,
      );
      break;
    }
  }
  return out;
}

/** What else is wrong with a site as data, in words: what the director and the renderer rely on. */
function unsound(street: StreetData, site: Site): string[] {
  const out: string[] = [];
  const { spot, roadSpot, camera, drive } = site;

  for (const p of [spot, roadSpot, camera.pos, camera.target, site.dir])
    if (!finite(p)) out.push('a point is not finite');
  for (const v of [camera.height, camera.targetHeight, camera.fov])
    if (!Number.isFinite(v)) out.push('the camera is not finite');

  const onRoad = nearestOnLine(spot, drive.pts);
  if (onRoad.d - drive.width / 2 > 10)
    out.push(`spot ${(onRoad.d - drive.width / 2).toFixed(1)} m from the road's edge`);
  if (!(drive.length >= 24)) out.push(`drive line ${drive.length.toFixed(1)} m`);
  if (!(onRoad.s > 0 && onRoad.s < drive.length))
    out.push(`the spot's nearest point is the end of the drive line (s ${onRoad.s.toFixed(1)})`);
  if (!(drive.at >= 0 && drive.at <= drive.length)) out.push(`drive.at ${drive.at} outside the line`);
  if (!(drive.width >= 2.6)) out.push(`the road is ${drive.width.toFixed(1)} m wide`);
  if (insideAny(street, roadSpot) >= 0) out.push(`the road point ${fmt(roadSpot)} is inside a building`);
  // Nothing drives through a house: the line ends before one that stands on its road.
  for (let s = 0; s <= drive.length; s += 1) {
    const p = pointAlong(drive.pts, s).pt;
    if (insideAny(street, p) < 0) continue;
    out.push(
      `the drive line runs through a house at ${fmt(p)}, ${(s - drive.at).toFixed(0)} m from the scene`,
    );
    break;
  }

  // The camera: a street camera's height and lens, looking down, within sight of the road point too.
  if (camera.height < 3 || camera.height > 8) out.push(`camera ${camera.height.toFixed(1)} m up`);
  if (camera.fov < 35.9 || camera.fov > 64.1) out.push(`field of view ${camera.fov.toFixed(1)} degrees`);
  if (!(camera.targetHeight < camera.height)) out.push('the camera does not look down');
  if (!clearLine(street, camera.pos, roadSpot))
    out.push(`no clear line from the camera ${fmt(camera.pos)} to the road ${fmt(roadSpot)}`);
  const far = dist(camera.pos, spot);
  if (far < 7 || far > 40) out.push(`camera ${far.toFixed(1)} m from the spot`);
  if (
    camera.mount === 'wall' &&
    !street.buildings.some((b) => solid(b) && nearestOnRing(camera.pos, b.ring).d < 1.2)
  )
    out.push('a wall camera hangs on no wall');

  site.lamps.forEach((l, i) => {
    if (!finite(l.pos) || !Number.isFinite(l.yaw)) out.push(`lamp ${i} not finite`);
    else if (insideAny(street, l.pos) >= 0) out.push(`lamp ${i} ${fmt(l.pos)} inside a building`);
  });

  for (const s of [-10, 0, drive.at, drive.length / 2, drive.length, drive.length + 10]) {
    for (const lat of [-6, 0, 3.5]) {
      const p = onDrive(drive, s, lat);
      if (!finite(p.pos) || !finite(p.dir)) out.push(`onDrive(${s.toFixed(1)}, ${lat}) not finite`);
    }
  }
  for (const d of [-30, -5, 0, 5, 30]) {
    if (!finite(pavement(site, d)) || !finite(pavement(site, d, false)))
      out.push(`pavement(${d}) not finite`);
  }
  for (const same of [true, false]) {
    const w = walkLine(site, same);
    if (w.length < 2 || !w.every(finite)) out.push(`walkLine(${same}) is not a line`);
  }

  // The stretch the site says its camera sees: around the scene's point, and every metre of it in the picture.
  if (site.seen) {
    const { from, to } = site.seen;
    if (!(from >= 0 && to <= drive.length && from <= to))
      out.push(`seen ${from}..${to} is not a stretch of the drive line`);
    if (from > drive.at + 14 || to < drive.at - 14)
      out.push(`seen ${from.toFixed(0)}..${to.toFixed(0)} is not at the scene (${drive.at.toFixed(0)})`);
    for (let s = from; s <= to; s += 1) {
      const p = pointAlong(drive.pts, s).pt;
      if (inFrame(project(camera, p, 0), 0.099) && !hidden(street, camera, p, 0.3)) continue;
      out.push(
        `seen ${from.toFixed(0)}..${to.toFixed(0)}: the road at ${s.toFixed(0)} m is not in the picture`,
      );
      break;
    }
  }
  return out;
}

/** What a picture misses of what every picture on a made-up street holds, in words. */
function misframed(site: Site, f: Framing): string[] {
  const out: string[] = [];
  if (!inFrame(f.spot, 0.2))
    out.push(`the spot is at (${f.spot.x.toFixed(2)}, ${f.spot.y.toFixed(2)}) of the picture`);
  if (f.person < 0.085)
    out.push(`an adult at the spot is ${(f.person * 100).toFixed(1)} % of the picture's height`);
  if (f.steep > 40) out.push(`the lens looks down at the spot at ${f.steep.toFixed(0)} degrees`);
  f.ends.forEach((e, i) => {
    if (!e) return;
    const name = i ? 'b' : 'a';
    if (e.hid > 0.3)
      out.push(`a house hides ${(e.hid * 100).toFixed(0)} % of the stretch crews from ${name} stop on`);
    if (e.seen < 0.999)
      out.push(
        `${((1 - e.seen) * 100).toFixed(0)} % of the stretch crews from ${name} stop on is outside the picture`,
      );
    if (e.car === false) out.push(`the first crew's car from ${name} is not whole in the picture`);
  });
  if (f.door === false) out.push('the door is not in the picture');
  if (f.nearWall > 0.15)
    out.push(`${(f.nearWall * 100).toFixed(0)} % of the picture is a wall right before the lens`);
  if (f.ground < 0.3) out.push(`${(f.ground * 100).toFixed(0)} % of the picture is ground`);
  const seen = site.seen;
  if (!seen) out.push('the site names no stretch its camera sees');
  else {
    if (comesFrom(site, true) && seen.from > Math.max(0, site.drive.at - 14) + 1e-6)
      out.push(`seen starts ${(site.drive.at - seen.from).toFixed(0)} m before the spot`);
    if (comesFrom(site, false) && seen.to < Math.min(site.drive.length, site.drive.at + 14) - 1e-6)
      out.push(`seen ends ${(seen.to - site.drive.at).toFixed(0)} m past the spot`);
  }
  return out;
}

// ---------------------------------------------------------------------------- made-up streets

describe('sites on made-up streets', () => {
  it('covers every kind of place', () => {
    expect(KINDS.length).toBeGreaterThan(30);
    expect(new Set(KINDS.map(layoutOf)).size).toBeGreaterThanOrEqual(9);
  });

  for (const kind of KINDS) {
    it(`${kind}: forty seeds give sound sites, a dozen of them with the story in the picture`, () => {
      const failures: string[] = [];
      for (const seed of SEEDS) {
        const street = makeStreet(kind, seed);
        const site = buildSite(street, seed);
        if (!site) {
          failures.push(`${kind} seed ${seed}: no site`);
          continue;
        }
        const wrong = [...invalid(street, site), ...unsound(street, site)];
        if (FRAME_SEEDS.includes(seed)) wrong.push(...misframed(site, framing(site)));
        for (const p of wrong) failures.push(`${kind} seed ${seed}: ${p}`);
      }
      expect(failures, failures.slice(0, 15).join('\n')).toEqual([]);
    });
  }

  it('the same street and seed give the same site, another seed may give another camera', () => {
    const poses = new Set<string>();
    for (const seed of FRAME_SEEDS) {
      const a = buildSite(makeStreet('street', 3), seed)!;
      const b = buildSite(makeStreet('street', 3), seed)!;
      expect({ ...a, street: null }).toEqual({ ...b, street: null });
      poses.add(JSON.stringify(a.camera));
    }
    expect(poses.size).toBeGreaterThan(1);
  });

  it("projectPoint is the pose's pinhole picture", () => {
    const site = buildSite(makeStreet('oldtown', 7920), 7920)!;
    for (const [p, h] of [
      [site.spot, 0],
      [site.spot, 1.75],
      [site.roadSpot, 0],
      [onDrive(site.drive, site.drive.at - 14, 2).pos, 1.6],
      [site.camera.target, site.camera.targetHeight],
    ] as const) {
      const mine = project(site.camera, p, h);
      const theirs = projectPoint(site.camera, p, h);
      expect(theirs.x).toBeCloseTo(mine.x, 9);
      expect(theirs.y).toBeCloseTo(mine.y, 9);
      expect(theirs.z).toBeCloseTo(mine.z, 9);
    }
    // The target is the middle of the picture; what is behind the lens is not in it.
    const mid = projectPoint(site.camera, site.camera.target, site.camera.targetHeight);
    expect(Math.abs(mid.x) + Math.abs(mid.y)).toBeLessThan(1e-9);
    const behind: V2 = [
      2 * site.camera.pos[0] - site.camera.target[0],
      2 * site.camera.pos[1] - site.camera.target[1],
    ];
    expect(projectPoint(site.camera, behind, site.camera.height).z).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------- hand-made streets

const box = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Houses side by side along x from `from` to `to`, each `step` wide with a gap of `gap` (0: one unbroken front). */
function row(y0: number, y1: number, from: number, to: number, step: number, gap = 0): V2[][] {
  const out: V2[][] = [];
  for (let x = from; x < to; x += step) out.push(box(x, y0, x + step - gap, y1));
  return out;
}

const road = (pts: V2[], cls: Road['cls'] = 'residential', width = 5.6, walk = true): Road => ({
  cls,
  pts,
  width,
  oneway: 0,
  walk,
});

function streetOf(roads: Road[], houses: V2[][], water: V2[][] = []): StreetData {
  return {
    source: 'tiles',
    radius: 160,
    roads,
    buildings: houses.map((ring, i) => {
      const w = Math.abs(ring[1][0] - ring[0][0]);
      const h = Math.abs(ring[2][1] - ring[1][1]);
      return { id: i + 1, ring, height: 9 + (i % 3) * 3, base: 0, area: w * h, roof: 'flat' as const };
    }),
    areas: water.map((ring) => ({ kind: 'water' as const, ring })),
  };
}

/** Streets with what real map tiles bring and a made-up street never has, by name. */
const HAND_MADE: Record<string, StreetData> = {
  // An old town lane: the map says 5.6 m with pavements, the house fronts stand 4 m apart.
  lane: streetOf(
    [
      road([
        [-140, 0],
        [140, 0],
      ]),
    ],
    [...row(2, 14, -90, 90, 9), ...row(-14, -2, -90, 90, 11)],
  ),
  // The same lane with a small square at the incident, which is 1.5 m from the centre line.
  'lane with a square': streetOf(
    [
      road([
        [-140, 1.5],
        [140, 1.5],
      ]),
    ],
    [
      ...row(3.5, 14, -90, -12, 9),
      ...row(3.5, 14, 15, 90, 9),
      box(-12, 16, 15, 28),
      ...row(-12, -0.5, -90, 90, 11),
    ],
  ),
  // The incident is in the middle of a large block, 16 m from its road.
  'inside a block': streetOf(
    [
      road([
        [-140, -16],
        [140, -16],
      ]),
    ],
    [box(-30, -12, 30, 30), ...row(-34, -21, -80, 80, 16, 2)],
  ),
  // A block that reaches over the road's own edge on the incident's side.
  'block on the kerb': streetOf(
    [
      road(
        [
          [-140, -6],
          [140, -6],
        ],
        'tertiary',
        6.5,
      ),
    ],
    [box(-40, -4, 40, 20), ...row(-30, -14, -80, 80, 16, 2)],
  ),
  // A quay: the river begins at the road's edge on the incident's side, the incident is in it.
  quay: streetOf(
    [
      road(
        [
          [-140, -8],
          [140, -8],
        ],
        'secondary',
        7,
      ),
    ],
    row(-30, -15, -90, 90, 15),
    [box(-160, -4, 160, 80)],
  ),
  // A bridge: the road runs over the water, the incident is on it.
  bridge: streetOf(
    [
      road(
        [
          [-140, 0],
          [140, 0],
        ],
        'secondary',
        7,
      ),
    ],
    [box(-90, -16, -62, -6), box(62, 6, 90, 16)],
    [box(-50, -120, 50, 120)],
  ),
  // A dead end 12 m past the incident, a house across its end.
  'dead end': streetOf(
    [
      road([
        [-140, -5],
        [12, -5],
      ]),
    ],
    [...row(2, 12, -80, 20, 14, 1.5), ...row(-24, -12, -80, 18, 16, 1.5), box(17, -14, 30, 4)],
  ),
  // A passage: the incident's lane runs under a house; a wider street crosses 30 m on.
  passage: streetOf(
    [
      road(
        [
          [0, -140],
          [0, 30],
        ],
        'living',
        4.6,
      ),
      road(
        [
          [-140, 30],
          [140, 30],
        ],
        'tertiary',
        6.5,
      ),
    ],
    [
      box(-12, -8, 12, 8),
      ...row(-40, 24, -24, -3, 21),
      ...row(-40, 24, 3, 24, 21),
      ...row(36, 48, -80, 80, 16, 2),
    ],
  ),
  // A corner: the road turns a right angle at the incident.
  corner: streetOf(
    [
      road([
        [-140, 0],
        [0, 0],
        [0, 140],
      ]),
    ],
    [box(4, -24, 30, -6), box(-40, 6, -6, 30), ...row(-24, -6, -90, 0, 15, 2)],
  ),
  // A paved square with many short pieces of road around the incident.
  square: streetOf(
    [
      road(
        [
          [-60, -20],
          [-20, -20],
        ],
        'pedestrian',
        5,
        false,
      ),
      road(
        [
          [-20, -20],
          [20, -20],
        ],
        'pedestrian',
        5,
        false,
      ),
      road(
        [
          [20, -20],
          [60, -20],
        ],
        'pedestrian',
        5,
        false,
      ),
      road(
        [
          [-20, -20],
          [-20, 20],
        ],
        'path',
        2.2,
        false,
      ),
      road(
        [
          [20, -20],
          [20, 20],
        ],
        'path',
        2.2,
        false,
      ),
      road(
        [
          [-60, 24],
          [60, 24],
        ],
        'pedestrian',
        5,
        false,
      ),
    ],
    [box(-70, 30, 70, 44), box(-70, -40, 70, -26), box(-84, -26, -66, 30), box(66, -26, 84, 30)],
  ),
};

describe("sites on hand-made streets like the map's", () => {
  for (const [name, street] of Object.entries(HAND_MADE)) {
    it(`${name}: a sound site with the first crew in the picture`, () => {
      const failures: string[] = [];
      for (const seed of FRAME_SEEDS) {
        const site = buildSite(street, seed);
        if (!site) {
          failures.push(`seed ${seed}: no site`);
          continue;
        }
        const wrong = [...invalid(street, site), ...unsound(street, site)];
        const f = framing(site);
        if (!inFrame(f.spot, 0.2))
          wrong.push(`the spot is at (${f.spot.x.toFixed(2)}, ${f.spot.y.toFixed(2)}) of the picture`);
        if (f.person < 0.08)
          wrong.push(`an adult at the spot is ${(f.person * 100).toFixed(1)} % of the picture's height`);
        if (f.steep > 45) wrong.push(`the lens looks down at the spot at ${f.steep.toFixed(0)} degrees`);
        if (f.door === false) wrong.push('the door is not in the picture');
        // Where the road is straight, a crew's car from either end it can come from is in the picture.
        if (name !== 'corner' && name !== 'square') {
          f.ends.forEach((e, i) => {
            if (e && e.car === false)
              wrong.push(`the first crew's car from ${i ? 'b' : 'a'} is not whole in the picture`);
          });
        } else if (!f.ends.some((e) => e && e.car)) wrong.push("no crew's car is whole in the picture");
        for (const p of wrong) failures.push(`seed ${seed}: ${p}`);
      }
      expect(failures, failures.slice(0, 15).join('\n')).toEqual([]);
    });
  }

  it('a lane between house fronts is as wide as they leave it, and people walk inside it', () => {
    const site = buildSite(HAND_MADE.lane, 5)!;
    expect(site.drive.width).toBeLessThanOrEqual(4);
    for (const same of [true, false]) {
      for (const d of [-20, -8, 0, 8, 20]) expect(Math.abs(pavement(site, d, same)[1])).toBeLessThan(2);
    }
    expect(Math.abs(site.spot[1])).toBeLessThan(2);
  });

  it("an incident inside a block is played at the block's wall, beside its road", () => {
    const site = buildSite(HAND_MADE['inside a block'], 5)!;
    expect(site.spot[1]).toBeLessThan(-12);
    expect(site.spot[1]).toBeGreaterThan(-16);
    expect(site.door).not.toBeNull();
  });

  it('an incident in the river is played on the quay or across the road', () => {
    for (const seed of FRAME_SEEDS) {
      const site = buildSite(HAND_MADE.quay, seed)!;
      expect(site.spot[1]).toBeLessThan(-4);
    }
  });

  it('a road that ends at the scene: the crew comes from its open end, into the picture', () => {
    const site = buildSite(HAND_MADE['dead end'], 5)!;
    expect(site.drive.deadB).toBe(true);
    expect(site.drive.deadA).toBe(false);
    const f = framing(site);
    expect(f.ends[1]).toBeNull();
    expect(f.ends[0]!.car).toBe(true);
    expect(site.seen!.from).toBeLessThanOrEqual(site.drive.at - 14);
  });

  it('a lane under a house: the scene is played before the house, and the road ends there', () => {
    for (const seed of FRAME_SEEDS) {
      const site = buildSite(HAND_MADE.passage, seed)!;
      const { drive } = site;
      // Either on the lane, well away from the house and with the lane cut short of it, or on the street beyond.
      if (drive.cls === 'tertiary') continue;
      expect(Math.abs(site.roadSpot[1])).toBeGreaterThan(8 + 12);
      const ends = [drive.pts[0], drive.pts[drive.pts.length - 1]];
      const atHouse = ends.findIndex((p) => Math.abs(p[1]) < 14);
      expect(atHouse).toBeGreaterThanOrEqual(0);
      expect(Math.abs(ends[atHouse][1])).toBeGreaterThanOrEqual(8 + 1);
      expect(atHouse ? drive.deadB : drive.deadA).toBe(true);
      // Crews come from the open end, and their car is in the picture.
      const f = framing(site);
      expect(f.ends[atHouse]).toBeNull();
      expect(f.ends[1 - atHouse]!.car).toBe(true);
    }
  });

  it('gives null when no road is near, or none a scene can be played on', () => {
    expect(buildSite(streetOf([], [box(-10, -10, 10, 10)]), 1)).toBeNull();
    expect(
      buildSite(
        streetOf(
          [
            road([
              [80, -100],
              [80, 100],
            ]),
          ],
          [],
        ),
        1,
      ),
    ).toBeNull();
    expect(
      buildSite(
        streetOf(
          [
            road([
              [-8, 0],
              [8, 0],
            ]),
          ],
          [],
        ),
        1,
      ),
    ).toBeNull();
    expect(
      buildSite(
        streetOf(
          [
            road(
              [
                [-100, 0],
                [100, 0],
              ],
              'rail',
              3.2,
              false,
            ),
          ],
          [],
        ),
        1,
      ),
    ).toBeNull();
    // A lane with a house standing on it at every place a scene could be.
    expect(
      buildSite(
        streetOf(
          [
            road(
              [
                [-60, 0],
                [60, 0],
              ],
              'living',
              4.6,
            ),
          ],
          row(-1, 9, -70, 70, 10),
        ),
        1,
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------- a real town (optional)

const SAMPLE = process.env.EPD_PMTILES_SAMPLE ?? '';
/** How many points of the town are tried. */
const POINTS = 400;
/** Places that once gave a spot inside a block, people in a house, a spot in the river, a wall, a dead end, no site. */
const NAMED: [number, number][] = [
  [11.24813, 43.7766],
  [11.25343, 43.77105],
  [11.249, 43.77],
  [11.2531, 43.7697],
  [11.256, 43.769],
  [11.2478, 43.7672],
  [11.2474, 43.7675],
];

describe.skipIf(!SAMPLE || !existsSync(SAMPLE))("sites on a real town's streets", () => {
  it(`${POINTS} points: every site is sound, and nearly every picture holds the story`, async () => {
    const fd = openSync(SAMPLE, 'r');
    const archive = new PMTiles({
      getKey: () => SAMPLE,
      getBytes: async (offset: number, length: number) => {
        const buf = Buffer.alloc(length);
        readSync(fd, buf, 0, length, offset);
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) as ArrayBuffer };
      },
    });
    const h = await archive.getHeader();
    const r = rand(20261114);
    const points: [number, number][] = NAMED.slice();
    for (let i = 0; i < POINTS; i++) points.push([r.range(h.minLon, h.maxLon), r.range(h.minLat, h.maxLat)]);

    const bad: string[] = [];
    const nulls: string[] = [];
    const count = {
      streets: 0,
      sites: 0,
      small: 0,
      carOut: 0,
      stretchOut: 0,
      doorOut: 0,
      farDoorOut: 0,
      walled: 0,
      unseen: 0,
    };
    for (let i = 0; i < points.length; i++) {
      const [lng, lat] = points[i];
      const street = await readStreet(archive, [lng, lat]);
      if (!street) continue;
      count.streets++;
      const seed = (i * 7919 + 7) >>> 0;
      const at = `${lng.toFixed(5)},${lat.toFixed(5)} seed ${seed}`;
      const site = buildSite(street, seed);
      if (!site) {
        nulls.push(at);
        continue;
      }
      count.sites++;
      for (const p of [...invalid(street, site), ...unsound(street, site)]) bad.push(`${at}: ${p}`);
      const f = framing(site);
      if (!inFrame(f.spot, 0.2))
        bad.push(`${at}: the spot is at (${f.spot.x.toFixed(2)}, ${f.spot.y.toFixed(2)}) of the picture`);
      if (f.person < 0.08)
        bad.push(`${at}: an adult at the spot is ${(f.person * 100).toFixed(1)} % of the picture's height`);
      if (f.steep > 45) bad.push(`${at}: the lens looks down at the spot at ${f.steep.toFixed(0)} degrees`);
      if (f.person < 0.09) count.small++;
      if (f.ends.some((e) => e && e.car === false)) count.carOut++;
      if (f.ends.some((e) => e && e.seen < 0.999)) count.stretchOut++;
      if (f.door === false) count[f.doorNear ? 'doorOut' : 'farDoorOut']++;
      if (f.nearWall > 0.15) count.walled++;
      if (!site.seen) count.unseen++;
    }
    closeSync(fd);

    const numbers = JSON.stringify(count);
    expect(count.streets, numbers).toBeGreaterThan(POINTS * 0.7);
    expect(bad, `${numbers}\n${bad.slice(0, 20).join('\n')}`).toEqual([]);
    // No site is a legitimate answer (a made-up street is shown instead), a rare one.
    expect(nulls.length, `${numbers}\nno site at:\n${nulls.join('\n')}`).toBeLessThanOrEqual(
      count.streets * 0.01,
    );
    // Old town lanes between high fronts do not always leave a camera everything: nearly always.
    expect(count.carOut, numbers).toBeLessThanOrEqual(count.sites * 0.02);
    expect(count.stretchOut, numbers).toBeLessThanOrEqual(count.sites * 0.02);
    expect(count.doorOut, numbers).toBeLessThanOrEqual(count.sites * 0.02);
    // A door some way from the scene is not always in the picture of a camera that is there for the street.
    expect(count.farDoorOut, numbers).toBeLessThanOrEqual(count.sites * 0.08);
    expect(count.unseen, numbers).toBe(0);
    expect(count.small, numbers).toBeLessThanOrEqual(count.sites * 0.05);
    expect(count.walled, numbers).toBeLessThanOrEqual(count.sites * 0.1);
  }, 600_000);
});
