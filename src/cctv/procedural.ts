/**
 * A made-up street for a camera when the street map is not there (local development, the GitHub Pages preview,
 * the tests) or has nothing usable around the incident (docs/CCTV.md). The kind of place decides the layout: a
 * town street, a housing estate's yard, a row of private houses, a shop's car park, a petrol station, a highway,
 * a park. The same place always gets the same street.
 *
 * Layouts are drawn with the main road running east to west just south of the origin and then turned by the
 * seed, so cameras do not all look the same way. Pure: no DOM, no three.js.
 */
import type { PlaceKind } from '@/sim/types';
import { rand, rectRing, ringArea, type Rand, type V2 } from './math';
import { ROAD_WIDTH, type Area, type AreaKind, type Building, type Road, type RoadClass, type RoofKind, type StreetData } from './types';

export type Layout = 'street' | 'oldtown' | 'estate' | 'houses' | 'carpark' | 'fuel' | 'highway' | 'park';

const LAYOUT: Partial<Record<PlaceKind, Layout>> = {
  residential: 'estate',
  house: 'houses',
  summerhouse: 'houses',
  village: 'houses',
  farm: 'houses',
  oldtown: 'oldtown',
  church: 'oldtown',
  museum: 'oldtown',
  mall: 'carpark',
  shop: 'carpark',
  parking: 'carpark',
  stadium: 'carpark',
  concert: 'carpark',
  airport: 'carpark',
  port: 'carpark',
  industrial: 'carpark',
  construction: 'carpark',
  gasstation: 'fuel',
  highway: 'highway',
  ruralroad: 'highway',
  border: 'highway',
  park: 'park',
  beach: 'park',
  forest: 'park',
  lake: 'park',
  cemetery: 'park',
};

export const layoutOf = (kind: PlaceKind): Layout => LAYOUT[kind] ?? 'street';

const FLOOR_M = 3;

class Draft {
  roads: Road[] = [];
  buildings: Building[] = [];
  areas: Area[] = [];
  private nextId = 1;
  constructor(readonly r: Rand) {}

  road(cls: RoadClass, pts: V2[], o: { walk?: boolean; width?: number; oneway?: 0 | 1 | -1 } = {}) {
    this.roads.push({ cls, pts, width: o.width ?? ROAD_WIDTH[cls], oneway: o.oneway ?? 0, walk: o.walk ?? false });
  }

  /** A rectangular building: centre, size along x and y, height in floors (or metres with `metres`). */
  box(cx: number, cy: number, w: number, d: number, floors: number, o: { roof?: RoofKind; open?: boolean; metres?: boolean; turn?: number } = {}) {
    const a = o.turn ?? 0;
    const axis: V2 = w >= d ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
    const ring = rectRing([cx, cy], axis, Math.max(w, d), Math.min(w, d));
    this.buildings.push({
      id: this.nextId++,
      ring,
      height: o.metres ? floors : floors * FLOOR_M + 0.8,
      base: 0,
      area: Math.abs(ringArea(ring)),
      roof: o.roof ?? 'flat',
      open: o.open,
    });
  }

  area(kind: AreaKind, x0: number, y0: number, x1: number, y1: number) {
    this.areas.push({ kind, ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  }
}

/** A row of buildings along the x axis between x0 and x1, their fronts at y = front, growing away by `dir` (1 north). */
function row(d: Draft, x0: number, x1: number, front: number, dir: 1 | -1, o: { floors: [number, number]; width: [number, number]; depth: [number, number]; gap: [number, number]; roof?: RoofKind; skip?: [number, number][] }) {
  const { r } = d;
  let x = x0 + r.range(0, 4);
  while (x < x1 - o.width[0]) {
    const w = Math.min(r.range(o.width[0], o.width[1]), x1 - x);
    const depth = r.range(o.depth[0], o.depth[1]);
    const blocked = (o.skip ?? []).some(([a, b]) => x < b && x + w > a);
    if (!blocked) {
      const set = r.range(0, 1.5);
      d.box(x + w / 2, front + dir * (set + depth / 2), w, depth, r.int(o.floors[0], o.floors[1]), { roof: o.roof });
    }
    x += w + r.range(o.gap[0], o.gap[1]);
  }
}

function street(d: Draft, old: boolean) {
  const { r } = d;
  const cls: RoadClass = old ? 'living' : r.pick(['secondary', 'tertiary', 'tertiary', 'residential'] as const);
  const w = ROAD_WIDTH[cls];
  const y = -(w / 2 + 3.2);
  const bend = r.range(-5, 5);
  d.road(cls, [[-150, y - bend * 0.4], [-55, y], [0, y], [60, y + bend * 0.3], [150, y + bend], ], { walk: true });
  // A side street to the north, east or west of the incident.
  const sx = r.chance(0.5) ? r.range(30, 44) : -r.range(30, 44);
  d.road('residential', [[sx, y], [sx + r.range(-2, 2), 60], [sx + r.range(-6, 6), 150]], { walk: true });
  const north = y + w / 2 + 2.6;
  const south = y - w / 2 - 2.6;
  const gap: [number, number] = old ? [0, 0.6] : [0, 7];
  const floors: [number, number] = old ? [2, 3] : [2, 6];
  row(d, -140, 140, north, 1, { floors, width: old ? [8, 15] : [14, 30], depth: [10, 14], gap, roof: old ? 'gable' : 'flat', skip: [[sx - 7, sx + 7]] });
  row(d, -140, 140, south, -1, { floors, width: old ? [8, 15] : [14, 32], depth: [10, 14], gap, roof: old ? 'gable' : 'flat' });
  // A second row behind, for the skyline.
  row(d, -140, 140, north + 34, 1, { floors: [3, old ? 4 : 9], width: [18, 40], depth: [11, 13], gap: [8, 26], skip: [[sx - 8, sx + 8]] });
  row(d, -140, 140, south - 34, -1, { floors: [2, old ? 3 : 5], width: [18, 36], depth: [11, 13], gap: [8, 26] });
  d.area('green', -140, north + 17, 140, north + 31);
  d.area(old ? 'paved' : 'green', -140, south - 31, 140, south - 17);
  if (!old && r.chance(0.6)) {
    const px = sx > 0 ? -r.range(60, 90) : r.range(60, 90);
    d.area('parking', px - 16, south - 30, px + 16, south - 18);
  }
}

function estate(d: Draft) {
  const { r } = d;
  const main = -44;
  d.road('residential', [[-150, main], [150, main + r.range(-3, 3)]], { walk: true });
  // The yard road: off the street, along the front of the long block, a dead end.
  d.road('service', [[-52, main], [-52, -3], [-46, 2.2], [66, 2.2]], { width: 4.6 });
  const floors = r.pick([5, 5, 9]);
  d.box(8, 15.2, 78, 12, floors);
  d.area('paved', -34, 4, 50, 9.4);
  d.area('parking', -40, -5.6, 60, 0.6);
  d.area('green', -44, -19, 62, -7);
  d.box(6, -26, 62, 12, r.pick([5, 5, 9]));
  d.box(88, 22, 12, 64, r.pick([5, 9]));
  d.box(-84, 18, 12, 58, 5);
  d.area('pitch', 68, -18, 84, -6);
  d.area('green', -110, -30, -64, 46);
  d.area('green', 64, -34, 140, -20);
  d.box(40, 52, 70, 12, 5);
  d.area('green', -30, 24, 76, 44);
  // Houses across the street.
  row(d, -140, 140, main - 6.5, -1, { floors: [1, 2], width: [9, 13], depth: [8, 11], gap: [9, 16], roof: 'gable' });
}

function houses(d: Draft) {
  const { r } = d;
  const y = -5.4;
  const walk = r.chance(0.5);
  d.road('residential', [[-150, y + r.range(-4, 4)], [-50, y], [50, y], [150, y + r.range(-6, 6)]], { walk, width: 5.2 });
  const sx = r.chance(0.5) ? r.range(42, 60) : -r.range(42, 60);
  d.road('residential', [[sx, y], [sx + r.range(-4, 4), -150]], { width: 4.8 });
  for (const dir of [1, -1] as const) {
    let x = -138 + r.range(0, 8);
    while (x < 132) {
      const w = r.range(9, 13);
      const depth = r.range(8, 11);
      const set = r.range(7, 11);
      const front = y + dir * (2.6 + (walk ? 2 : 0.6) + set);
      if (!(dir === -1 && x < sx + 7 && x + w > sx - 7)) {
        d.box(x + w / 2, front + (dir * depth) / 2, w, depth, r.int(1, 2), { roof: 'gable' });
        // The garden, and now and then a shed at the back of it.
        d.area('green', x - 5, front + dir * -6, x + w + 5, front + dir * (depth + 12));
        if (r.chance(0.4)) d.box(x + w + 3, front + dir * (depth + 6), 4, 3, 2.6, { roof: 'gable', metres: true });
      }
      x += w + r.range(11, 17);
    }
  }
  d.area('forest', -150, 58, 150, 150);
}

function carpark(d: Draft, big: boolean) {
  const { r } = d;
  const main = -52;
  d.road(r.pick(['secondary', 'tertiary'] as const), [[-150, main], [150, main + r.range(-4, 4)]], { walk: true });
  // In from the street, along the shop front, and out again.
  d.road('service', [[-74, main], [-74, 4.4], [74, 4.4], [74, main]], { width: 5.6 });
  const w = big ? r.range(84, 110) : r.range(34, 46);
  const depth = big ? r.range(44, 60) : r.range(18, 24);
  d.box(0, 12.6 + depth / 2, w, depth, big ? r.range(8, 11) : r.range(4.5, 6), { metres: true });
  d.area('paved', -w / 2, 6.6, w / 2, 12.8);
  d.area('parking', -66, -40, 66, 2.4);
  d.area('green', -150, main + 5, -78, 40);
  d.area('green', 78, main + 5, 150, 40);
  row(d, -140, 140, main - 7, -1, { floors: [2, 5], width: [16, 30], depth: [10, 13], gap: [4, 14] });
}

function fuel(d: Draft) {
  const { r } = d;
  const main = -19;
  d.road(r.pick(['trunk', 'secondary', 'tertiary'] as const), [[-150, main + r.range(-3, 3)], [0, main], [150, main + r.range(-3, 3)]], { walk: r.chance(0.5) });
  // Off the road, past the pumps, and back.
  d.road('service', [[-40, main], [-27, -5.6], [0, -4.6], [27, -5.6], [40, main]], { width: 5.6, oneway: 1 });
  d.area('paved', -32, -12, 32, 21);
  // The canopy over the pumps and the shop behind it.
  d.box(0, 2.6, 21, 9.4, 5.2, { open: true, metres: true });
  d.box(0, 15.2, 17, 9, 4.2, { metres: true });
  d.area('parking', 12, 10.6, 30, 20);
  d.area('green', -150, -8, -36, 60);
  d.area('green', 36, -8, 150, 60);
  if (r.chance(0.6)) row(d, -140, 140, main - 16, -1, { floors: [1, 3], width: [14, 30], depth: [10, 13], gap: [10, 30] });
  else d.area('forest', -150, -150, 150, main - 12);
}

function highway(d: Draft) {
  const { r } = d;
  const cls: RoadClass = r.pick(['trunk', 'primary', 'secondary'] as const);
  const w = ROAD_WIDTH[cls] + 1;
  const y = -(w / 2 + 2.4);
  const bend = r.range(-10, 10);
  d.road(cls, [[-160, y - bend], [-60, y - bend * 0.15], [0, y], [70, y + bend * 0.2], [160, y + bend]], { width: w });
  if (r.chance(0.55)) {
    const sx = r.chance(0.5) ? r.range(50, 80) : -r.range(50, 80);
    d.road('tertiary', [[sx, y], [sx + r.range(-10, 10), 150]], { width: 5.6 });
  }
  // A bus stop's shelter beside the road.
  if (r.chance(0.5)) d.box(r.range(-14, 14), y + w / 2 + 3.4, 4.2, 1.8, 2.6, { open: true, metres: true });
  const far = r.chance(0.5);
  d.area('forest', -160, far ? 34 : 14, 160, 160);
  d.area(far ? 'forest' : 'green', -160, -160, 160, y - w / 2 - (far ? 9 : 28));
}

function park(d: Draft) {
  const { r } = d;
  d.area('green', -150, -64, 150, 150);
  // Paths meeting just south of the incident; a street along the park's edge.
  d.road('path', [[-140, r.range(-30, 20)], [-40, -6], [0, -3.4], [50, -1], [140, r.range(-20, 40)]], { width: 3 });
  d.road('path', [[0, -3.4], [r.range(-10, 10), -70]], { width: 2.6 });
  d.road('path', [[50, -1], [r.range(60, 90), 80], [r.range(40, 100), 150]], { width: 2.4 });
  d.road('tertiary', [[-150, -74], [150, -74 + r.range(-4, 4)]], { walk: true });
  d.area('forest', -150, 40, -30, 150);
  d.area('forest', 70, -40, 150, 30);
  if (r.chance(0.5)) d.area('water', -20, 36, 46, 78);
  d.area('pitch', -70, -50, -44, -30);
  row(d, -140, 140, -82, -1, { floors: [3, 6], width: [16, 30], depth: [10, 13], gap: [2, 10] });
}

const turn = (p: V2, c: number, s: number): V2 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];

/** The made-up street for a kind of place. `seed` picks the variation (the same seed: the same street). */
export function makeStreet(kind: PlaceKind, seed: number): StreetData {
  const r = rand(seed);
  const d = new Draft(r);
  const layout = layoutOf(kind);
  if (layout === 'street') street(d, false);
  else if (layout === 'oldtown') street(d, true);
  else if (layout === 'estate') estate(d);
  else if (layout === 'houses') houses(d);
  else if (layout === 'carpark') carpark(d, kind !== 'shop');
  else if (layout === 'fuel') fuel(d);
  else if (layout === 'highway') highway(d);
  else park(d);
  // Turn the whole layout about the origin.
  const a = rand(seed ^ 0x5bd1e995)() * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    source: 'made',
    radius: 150,
    roads: d.roads.map((x) => ({ ...x, pts: x.pts.map((p) => turn(p, c, s)) })),
    buildings: d.buildings.map((b) => ({ ...b, ring: b.ring.map((p) => turn(p, c, s)) })),
    areas: d.areas.map((x) => ({ ...x, ring: x.ring.map((p) => turn(p, c, s)) })),
  };
}
