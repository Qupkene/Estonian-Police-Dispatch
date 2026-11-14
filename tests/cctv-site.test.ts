/**
 * The geometry a camera scene stands on (docs/CCTV.md section 4.2): for every kind of place and forty seeds, the
 * made-up street (src/cctv/procedural.ts) and the site worked out on it (src/cctv/site.ts) are checked for what the
 * director and the renderer rely on. Failures are collected and printed with their kind and seed.
 */
import { describe, expect, it } from 'vitest';
import { CAMERA_CHANCE } from '@/cctv/coverage';
import { dist, nearestOnLine, nearestOnRing, pointInRing, type V2 } from '@/cctv/math';
import { makeStreet } from '@/cctv/procedural';
import { buildSite, clearLine, onDrive, pavement, walkLine } from '@/cctv/site';
import type { Site, StreetData } from '@/cctv/types';
import type { PlaceKind } from '@/sim/types';

const KINDS = Object.keys(CAMERA_CHANCE) as PlaceKind[];
const SEEDS = Array.from({ length: 40 }, (_, i) => 1 + i * 7919);

const finite = (p: V2) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const fmt = (p: V2) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`;

/** The index of the building with walls (not a roof on posts) the point is inside, or -1. */
function insideAny(street: StreetData, p: V2): number {
  return street.buildings.findIndex((b) => !b.open && pointInRing(p, b.ring));
}

/** What is wrong with a site, in words (empty when nothing is). */
function problems(street: StreetData, site: Site): string[] {
  const out: string[] = [];
  const { spot, roadSpot, camera, drive } = site;

  for (const p of [spot, roadSpot, camera.pos, camera.target, site.dir])
    if (!finite(p)) out.push('a point is not finite');

  const inSpot = insideAny(street, spot);
  if (inSpot >= 0) out.push(`spot ${fmt(spot)} inside building ${street.buildings[inSpot].id}`);
  const onRoad = nearestOnLine(spot, drive.pts);
  if (onRoad.d - drive.width / 2 > 10)
    out.push(`spot ${(onRoad.d - drive.width / 2).toFixed(1)} m from the road's edge`);

  if (!(drive.length >= 24)) out.push(`drive line ${drive.length.toFixed(1)} m`);
  if (!(onRoad.s > 0 && onRoad.s < drive.length))
    out.push(`the spot's nearest point is the end of the drive line (s ${onRoad.s.toFixed(1)})`);
  if (!(drive.at >= 0 && drive.at <= drive.length)) out.push(`drive.at ${drive.at} outside the line`);

  // The camera: outside every building or above it, with a clear line to the spot and the road point.
  const inCam = insideAny(street, camera.pos);
  if (inCam >= 0 && camera.height <= street.buildings[inCam].height)
    out.push(`camera ${fmt(camera.pos)} inside building ${street.buildings[inCam].id}`);
  // A camera on a wall stands on that wall: its own building does not block it.
  let own = inCam;
  if (camera.mount === 'wall' && own < 0) {
    let best = 1.5;
    street.buildings.forEach((b, i) => {
      const d = nearestOnRing(camera.pos, b.ring).d;
      if (d < best) {
        best = d;
        own = i;
      }
    });
  }
  if (!clearLine(street, camera.pos, spot, own))
    out.push(`no clear line from the camera ${fmt(camera.pos)} to the spot ${fmt(spot)}`);
  if (!clearLine(street, camera.pos, roadSpot, own))
    out.push(`no clear line from the camera ${fmt(camera.pos)} to the road ${fmt(roadSpot)}`);
  for (const [name, p] of [
    ['spot', spot],
    ['road point', roadSpot],
  ] as const) {
    const d = dist(camera.pos, p);
    if (d < 8 || d > 30) out.push(`camera ${d.toFixed(1)} m from the ${name}`);
  }

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
  return out;
}

describe('sites on made-up streets', () => {
  it('covers every kind of place', () => {
    expect(KINDS.length).toBeGreaterThan(30);
  });

  for (const kind of KINDS) {
    it(`${kind}: forty seeds give sound sites`, () => {
      const failures: string[] = [];
      for (const seed of SEEDS) {
        const street = makeStreet(kind, seed);
        const site = buildSite(street, seed);
        if (!site) {
          failures.push(`${kind} seed ${seed}: no site`);
          continue;
        }
        for (const p of problems(street, site)) failures.push(`${kind} seed ${seed}: ${p}`);
      }
      expect(failures, failures.slice(0, 15).join('\n')).toEqual([]);
    });
  }
});
