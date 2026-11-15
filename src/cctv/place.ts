/**
 * The place an incident names, found on the street (docs/CCTV.md): which point of the map it is, which building is
 * its own, which wall of that building is its front, and what stands before it that the map does not draw (a petrol
 * station's canopy and forecourt, a car park's bays, a bus station's shelters). All of it is written into the street
 * data or handed to the site (src/cctv/site.ts), so that the director and the renderer take it from there.
 *
 * Works from the buildings, the roads and the areas alone: the map's points of interest (`StreetData.pois`) only
 * make the place's point more exact where the archive has them.
 *
 * Pure: no DOM, no three.js.
 */
import type { PlaceKind } from '@/sim/types';
import {
  along,
  boundingBox,
  cross,
  dist,
  dot,
  hash32,
  left,
  mul,
  nearestOnLine,
  nearestOnRing,
  nearestOnSegment,
  norm,
  pointAlong,
  pointInRing,
  rectRing,
  ringArea,
  ringCentroid,
  segmentHitsRing,
  sub,
  type V2,
} from './math';
import { CAR_ROADS, type Area, type Building, type PlaceHint, type Poi, type Road, type StreetData } from './types';

// ------------------------------------------------------------------------------------------------ kinds

/**
 * The kinds of the map's points of interest (the Protomaps `pois` layer's `kind`) that a kind of place can be, the
 * likeliest first.
 */
export const POI_KINDS: Partial<Record<PlaceKind, readonly string[]>> = {
  gasstation: ['fuel'],
  bank: ['bank'],
  bar: ['bar', 'pub', 'biergarten'],
  nightclub: ['nightclub', 'bar', 'pub'],
  shop: ['supermarket', 'convenience', 'department_store', 'marketplace'],
  mall: ['mall', 'department_store', 'supermarket'],
  school: ['school'],
  kindergarten: ['kindergarten', 'childcare'],
  university: ['university', 'college'],
  hospital: ['hospital', 'clinic'],
  trainstation: ['station', 'train_station', 'halt'],
  busstation: ['bus_station'],
  parking: ['parking'],
  church: ['place_of_worship'],
  hotel: ['hotel', 'hostel', 'guest_house', 'motel'],
  stadium: ['stadium'],
  museum: ['museum'],
};

/** Every kind of point the street keeps (tiles.ts reads only these). */
export const KEPT_POI_KINDS: ReadonlySet<string> = new Set(Object.values(POI_KINDS).flat());

/** A point of interest further from the given point than this is another place (the game's coordinates are typed by hand). */
export const POI_REACH_M = 250;
/** A point of a less likely kind is taken only when it is this much nearer than one of a likelier kind. */
const KIND_STEP_M = 60;

/** Kinds of place that are a building of their own: its front is what the picture should show. */
const OWN_BUILDING: ReadonlySet<PlaceKind> = new Set<PlaceKind>([
  'gasstation',
  'bank',
  'bar',
  'nightclub',
  'shop',
  'mall',
  'school',
  'kindergarten',
  'university',
  'hospital',
  'trainstation',
  'hotel',
  'church',
  'stadium',
  'museum',
  'office',
  'government',
  'embassy',
  'prison',
  'industrial',
]);
/** Of those, the ones that are a big building in grounds of its own: the largest one about the point, not the nearest shed. */
const BIG: ReadonlySet<PlaceKind> = new Set<PlaceKind>([
  'mall',
  'school',
  'university',
  'hospital',
  'trainstation',
  'church',
  'stadium',
  'museum',
  'government',
  'prison',
  'industrial',
]);
/** Kinds with nothing of their own to show: an ordinary street, a road, a forest. */
const PLAIN: ReadonlySet<PlaceKind> = new Set<PlaceKind>([
  'residential',
  'house',
  'street',
  'forest',
  'lake',
  'beach',
  'highway',
  'ruralroad',
  'village',
  'farm',
  'summerhouse',
  'oldtown',
  'border',
]);

/** Does a kind of place have a building of its own? */
export const hasOwnBuilding = (kind: PlaceKind): boolean => OWN_BUILDING.has(kind);
/** Does a kind of place have anything of its own to show (`Site.place` is filled)? */
export const isShown = (kind: PlaceKind): boolean => !PLAIN.has(kind);

// ------------------------------------------------------------------------------------------------ the point

/** A name as it is compared: lower case, letters and digits only, accents dropped. */
function plainName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Do two names mean the same place: one holds the other, or they share their first word (three letters or more)? */
export function namesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = plainName(a);
  const y = plainName(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const fx = x.split(' ')[0];
  return fx.length >= 3 && fx === y.split(' ')[0];
}

/**
 * The map's own point for a place of a kind: among the points of the kinds it can be within `reach` metres of `at`,
 * one whose name matches the place's first, then the nearest (a likelier kind before a less likely one that is not
 * much nearer). Null when the map has none: the given point stands.
 */
export function pickPoi(pois: readonly Poi[], kind: PlaceKind, name: string | null, at: V2 = [0, 0], reach = POI_REACH_M): Poi | null {
  const kinds = POI_KINDS[kind];
  if (!kinds) return null;
  let best: Poi | null = null;
  let bestScore = Infinity;
  for (const p of pois) {
    const k = kinds.indexOf(p.kind);
    const d = dist(p.pos, at);
    if (k < 0 || d > reach) continue;
    const score = d + k * KIND_STEP_M + (namesMatch(name, p.name) ? 0 : 2 * reach);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ the building

const solid = (b: Building) => !b.open && b.base < 2.5 && b.ring.length >= 3;

/** How far a point is from a footprint (0 inside it). */
const awayFrom = (p: V2, ring: readonly V2[]) => (pointInRing(p, ring) ? 0 : nearestOnRing(p, ring).d);

/** A petrol station's kiosk and its canopy stand at most this far apart. */
const KIOSK_GAP_M = 14;
/** The narrowest gap between two footprints, by their corners. */
const gapOf = (a: readonly V2[], b: readonly V2[]) => Math.min(...a.map((p) => awayFrom(p, b)), ...b.map((p) => awayFrom(p, a)));

/**
 * The place's own building (index into street.buildings), or -1: the one its point is in, else the nearest about the
 * point; for a big place the most prominent about it (as the map puts its marker: a large hall 10 m from the point
 * before the shed the point is in); for a petrol station a small one (the kiosk), and one that stands by the canopy
 * where the station has a canopy.
 */
export function ownBuilding(street: StreetData, hint: PlaceHint): number {
  if (!hasOwnBuilding(hint.kind)) return -1;
  if (hint.door) {
    // The street was read for this place: the building its front door was found on.
    let found = -1;
    let foundD = 1.5;
    street.buildings.forEach((b, i) => {
      const d = solid(b) ? nearestOnRing(hint.door!, b.ring).d : Infinity;
      if (d < foundD) {
        foundD = d;
        found = i;
      }
    });
    if (found >= 0) return found;
  }
  const big = BIG.has(hint.kind);
  const reach = big ? 60 : 35;
  const canopies = hint.kind === 'gasstation' ? street.buildings.filter((b) => b.open && b.area >= 30 && awayFrom(hint.at, b.ring) < 40) : [];
  let best = -1;
  let bestScore = Infinity;
  street.buildings.forEach((b, i) => {
    if (!solid(b) || b.area < 12) return;
    const d = awayFrom(hint.at, b.ring);
    if (d > reach) return;
    if (canopies.length && !canopies.some((c) => gapOf(b.ring, c.ring) <= KIOSK_GAP_M)) return;
    let score = big ? d - 0.6 * Math.sqrt(b.area) : d === 0 ? -1000 : d;
    if (hint.kind === 'gasstation' && b.area > 400) score += 30;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** A footprint without the vertices that say nothing (closer than `tol` metres to the line of their neighbours). */
function straighten(ring: readonly V2[], tol: number): V2[] {
  const out = ring.slice();
  while (out.length > 4) {
    let drop = -1;
    let least = tol;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i + out.length - 1) % out.length];
      const next = out[(i + 1) % out.length];
      if (dist(prev, next) < 1e-6) continue;
      const d = nearestOnSegment(out[i], prev, next).d;
      if (d < least) {
        least = d;
        drop = i;
      }
    }
    if (drop < 0) break;
    out.splice(drop, 1);
  }
  return out;
}

/**
 * How much less a road is wanted before a place's front (metres added to its distance), Infinity: not at all. A
 * street comes well before a yard road: the lane that hugs the back of a school is not what the school faces.
 */
function roadWorth(r: Road): number {
  if (r.tunnel || r.pts.length < 2) return Infinity;
  if (CAR_ROADS.has(r.cls)) return r.cls === 'service' || r.cls === 'motorway' ? 30 : 0;
  if (r.cls === 'pedestrian') return 12;
  if (r.cls === 'path') return 45;
  return Infinity;
}

/** Where along the ray from `p` in the unit direction `dir` (up to `max` metres) it first meets a polyline, or Infinity. */
function rayToLine(p: V2, dir: V2, max: number, pts: readonly V2[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const c = pts[i - 1];
    const s: V2 = [pts[i][0] - c[0], pts[i][1] - c[1]];
    const den = cross(dir, s);
    if (Math.abs(den) < 1e-9) continue;
    const t = cross(sub(c, p), s) / den;
    const k = cross(sub(c, p), dir) / den;
    if (t >= 0 && t <= max && k >= 0 && k <= 1 && t < best) best = t;
  }
  return best;
}

/** A wall of the place's own building as its front. */
export interface Front {
  /** The wall's two ends on the ground and the unit vector out of it. */
  a: V2;
  b: V2;
  out: V2;
  /** Where on it the door is. */
  door: V2;
  /** How far before the wall the road it faces is (to the road's centre line), and that road's width. */
  roadD: number;
  roadWidth: number;
  /** Nothing stands between the wall and that road. */
  clear: boolean;
  /** The wall was taken for what stands before it (a canopy), whatever road lies beyond. */
  forecourt: boolean;
}

/** A road further before a wall than this is not the road it faces. */
const FRONT_REACH_M = 110;

/**
 * The front of a building: the wall that faces the best road before it. Every wall of four metres or more is asked
 * what road lies before it (along its normal, from a point every three metres): a street before a yard road before
 * a footpath, a near one before a far one, with nothing between before one behind another house or across railway
 * tracks; a long wall before a short one; the wall the place's own point lies before, when that point is outside
 * the building (the map puts a shop's point at its entrance). The door is where the way to the road is free, as
 * near the place's own point as that allows. `door`: the door found when the street was read (its wall is the
 * front). `toward`: what the front must face whatever the roads are (a petrol station's canopy: the kiosk's front is
 * the wall the pumps are before). Null when no wall faces a road.
 */
export function frontOf(street: StreetData, index: number, at: V2, door?: V2, toward?: V2): Front | null {
  const own = street.buildings[index];
  if (!own || own.ring.length < 3) return null;
  const ring = straighten(own.ring, 0.8);
  const ccw = ringArea(ring) > 0;
  const c = ringCentroid(own.ring);
  const span = Math.max(...own.ring.map((p) => dist(p, c)));
  const roads = street.roads.filter((r) => roadWorth(r) < Infinity && nearestOnLine(c, r.pts).d < span + FRONT_REACH_M);
  const rails = street.roads.filter((r) => (r.cls === 'rail' || r.cls === 'tram') && !r.tunnel && r.pts.length > 1 && nearestOnLine(c, r.pts).d < span + FRONT_REACH_M);
  const others = street.buildings.filter((b) => solid(b) && dist(ringCentroid(b.ring), c) < span + FRONT_REACH_M + Math.sqrt(b.area) * 2);
  const outside = !pointInRing(at, own.ring);
  let best: Front | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = dist(a, b);
    if (len < 4) continue;
    const e = norm(sub(b, a));
    // Outward: to the right of an anticlockwise edge.
    const out: V2 = ccw ? [e[1], -e[0]] : [-e[1], e[0]];
    const told = door !== undefined && nearestOnSegment(door, a, b).d < 1.5;
    const want = dot(sub(told ? door : at, a), e);
    const n = Math.min(16, Math.max(3, Math.round(len / 3)));
    let found: { s: number; t: number; width: number; clear: boolean; score: number } | null = null;
    let foundPick = Infinity;
    for (let k = 0; k < n; k++) {
      const sAt = (len * (k + 0.5)) / n;
      const p = along(along(a, e, sAt), out, 0.4);
      let here: { t: number; width: number; clear: boolean; score: number } | null = null;
      for (const r of roads) {
        const t = rayToLine(p, out, FRONT_REACH_M, r.pts);
        if (t === Infinity) continue;
        const to = along(p, out, Math.max(0.1, t - 0.2));
        const clear = !others.some((o) => segmentHitsRing(p, to, o.ring)) && !rails.some((o) => rayToLine(p, out, t, o.pts) < t);
        const score = t + roadWorth(r) + (clear ? 0 : 30);
        if (!here || score < here.score) here = { t: t + 0.4, width: r.width, clear, score };
      }
      if (!here) continue;
      // The wall is judged by its best point; the door is the point nearest the place's own among those about as good.
      const pick = here.score + Math.abs(sAt - want) * 0.2;
      if (!found || pick < foundPick) {
        found = { s: sAt, ...here };
        foundPick = pick;
      }
    }
    const mid = along(a, e, len / 2);
    const faces = toward !== undefined && dot(out, norm(sub(toward, mid))) > 0.6;
    // The wall before the canopy is the front even with no road beyond it: the forecourt is its road.
    if (!found && faces) found = { s: Math.min(len - 1, Math.max(1, dot(sub(toward, a), e))), t: dist(toward, mid) + 8, width: 5, clear: true, score: 60 };
    if (!found) continue;
    const away = nearestOnSegment(at, a, b).d;
    const score = found.score - Math.min(len, 24) * 0.5 + away * (outside ? 1 : 0.15) - (told ? 1000 : 0) - (faces ? 200 : 0);
    if (score >= bestScore) continue;
    bestScore = score;
    best = { a, b, out, door: along(a, e, told ? Math.min(len, Math.max(0, want)) : found.s), roadD: found.t, roadWidth: found.width, clear: found.clear, forecourt: faces };
  }
  return best;
}

/** What is known of a place on a street before a site is built for it. */
export interface PlacePlan {
  /** The place's own building (index into street.buildings), or -1. */
  building: number;
  front: Front | null;
  /**
   * Where the scene is to be played: just before the front's door, or, when the road the front faces is far off,
   * before the front where that road is in reach. Null without a front.
   */
  anchor: V2 | null;
}

/** A scene's road is at most this far from its origin (site.ts and tiles.ts use the same 70 m), with some room. */
const ROAD_REACH_M = 62;

/** `toward`: what the own building's front must face (frontOf): a petrol station's canopy that the map has. */
export function planPlace(street: StreetData, hint: PlaceHint, toward?: V2): PlacePlan {
  const building = ownBuilding(street, hint);
  const front = building >= 0 ? frontOf(street, building, hint.at, hint.door, toward) : null;
  if (!front) return { building, front: null, anchor: null };
  const inHouse = (p: V2) => street.buildings.some((b) => solid(b) && pointInRing(p, b.ring));
  // Before the door; where the road the front faces is out of a scene's reach, before the front by that road (a
  // forecourt is played on whatever road is nearest).
  let d = front.roadD > ROAD_REACH_M && !front.forecourt ? front.roadD - 25 : Math.min(2, Math.max(0.8, front.roadD - front.roadWidth / 2 - 1));
  let anchor = along(front.door, front.out, d);
  for (let k = 0; k < 12 && inHouse(anchor) && d + 3 < front.roadD; k++) {
    d += 3;
    anchor = along(front.door, front.out, d);
  }
  return { building, front, anchor: inHouse(anchor) ? null : anchor };
}

/**
 * Where a scene can be played when no road is within reach of the origin (the middle of a stadium, of a station's
 * hall, of a park): beside the nearest road the street has, on the origin's side of it. Null when it has none.
 */
export function roadAnchor(street: StreetData): V2 | null {
  let best: V2 | null = null;
  let bestScore = Infinity;
  for (const r of street.roads) {
    const worth = roadWorth(r);
    if (worth === Infinity) continue;
    const n = nearestOnLine([0, 0], r.pts);
    if (n.d + worth >= bestScore) continue;
    bestScore = n.d + worth;
    const back = n.d > 0.5 ? norm(sub([0, 0], n.pt)) : left(n.dir);
    best = along(n.pt, back, Math.min(n.d, r.width / 2 + 5));
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ what stands before it

/** The ground a new thing can stand on: asked of a rectangle. */
class FreeGround {
  private readonly houses: Building[];
  private readonly roads: Road[];
  private readonly waters: Area[];

  constructor(street: StreetData, c: V2, reach: number) {
    this.houses = street.buildings.filter((b) => b.ring.length >= 3 && awayFrom(c, b.ring) < reach);
    this.roads = street.roads.filter((r) => r.pts.length > 1 && !r.tunnel && r.cls !== 'path' && r.cls !== 'pedestrian' && nearestOnLine(c, r.pts).d < reach);
    this.waters = street.areas.filter((a) => a.ring.length >= 3 && (a.kind === 'water' || a.kind === 'forest' || a.kind === 'pitch'));
  }

  /** Is a rectangle clear of every building, of every road (with `room` metres beside its edge) and of water, trees and pitches? */
  free(ring: readonly V2[], room: number): boolean {
    const c = ringCentroid(ring);
    const pts: V2[] = [c];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(dist(a, b) / 2));
      for (let k = 0; k < n; k++) pts.push(along(a, norm(sub(b, a)), (dist(a, b) * k) / n));
    }
    for (const b of this.houses) {
      if (pts.some((p) => pointInRing(p, b.ring)) || b.ring.some((p) => pointInRing(p, ring))) return false;
      for (let i = 0; i < ring.length; i++) if (segmentHitsRing(ring[i], ring[(i + 1) % ring.length], b.ring)) return false;
    }
    for (const r of this.roads) {
      const keep = r.width / 2 + room;
      if (pts.some((p) => nearestOnLine(p, r.pts).d < keep)) return false;
      for (let i = 1; i < r.pts.length; i++) if (segmentHitsRing(r.pts[i - 1], r.pts[i], ring)) return false;
    }
    for (const a of this.waters) if (pts.some((p) => pointInRing(p, a.ring))) return false;
    return true;
  }
}

/** A building the map does not have: its id is made from what it is and where, the same every time. */
function madeBuilding(what: string, ring: V2[], height: number, open: boolean): Building {
  const c = ringCentroid(ring);
  const b: Building = {
    id: hash32('place', what, Math.round(c[0] * 4), Math.round(c[1] * 4)),
    ring: ringArea(ring) > 0 ? ring : ring.slice().reverse(),
    height,
    base: 0,
    area: Math.abs(ringArea(ring)),
    roof: 'flat',
  };
  if (open) b.open = true;
  return b;
}

/** The road a scene at the origin is likeliest played on (as site.ts ranks them), with the point of it nearest to `p`. */
function nearRoad(street: StreetData, p: V2, max: number): { road: Road; s: number; pt: V2; dir: V2; d: number } | null {
  let best: { road: Road; s: number; pt: V2; dir: V2; d: number } | null = null;
  let bestScore = Infinity;
  for (const road of street.roads) {
    if (!CAR_ROADS.has(road.cls) || road.tunnel || road.pts.length < 2) continue;
    const n = nearestOnLine(p, road.pts);
    const score = n.d + (road.cls === 'service' ? 5 : road.cls === 'motorway' ? 8 : 0);
    if (n.d > max || score >= bestScore) continue;
    bestScore = score;
    best = { road, s: n.s, pt: n.pt, dir: n.dir, d: n.d };
  }
  return best;
}

/**
 * A canopy's sizes, the usual one first (as the made-up petrol station's, procedural.ts), and its height. None is
 * under 80 m2: the renderer puts pumps under a canopy from that size on.
 */
const CANOPY_SIZES: readonly (readonly [number, number])[] = [
  [21, 9.4],
  [16, 9],
  [12, 8],
  [11, 7.5],
];
const CANOPY_H = 5.2;
/** A kiosk's sizes and height. */
const KIOSK_SIZES: readonly (readonly [number, number])[] = [
  [17, 9],
  [12, 7],
  [8, 6],
];
const KIOSK_H = 4.2;

/** A street with what stands before the place added, and the points of it a camera should have in its picture. */
export interface Dressed {
  street: StreetData;
  focus: V2[];
  /** What the own building's front is to face: the middle of a canopy the map itself has (not one made beside the kiosk). */
  toward?: V2;
}

/**
 * The paved forecourt about a canopy: from the kiosk side to the road's edge where a road is near on the other, wide
 * enough to drive round the pumps. The renderer pours it as concrete because the canopy's middle is on it.
 */
function forecourt(street: StreetData, canopy: Building): Area {
  const bb = boundingBox(canopy.ring);
  const w = left(bb.axis);
  const reach = (dir: V2): number => {
    let best = 8;
    for (const r of street.roads) {
      if (!CAR_ROADS.has(r.cls) || r.cls === 'service' || r.tunnel || r.pts.length < 2) continue;
      const t = rayToLine(bb.c, dir, bb.short / 2 + 26, r.pts);
      if (t < Infinity) best = Math.max(best, t - bb.short / 2 - r.width / 2 + 0.4);
    }
    return best;
  };
  const up = reach(w);
  const down = reach(mul(w, -1));
  const c = along(bb.c, w, (up - down) / 2);
  return { kind: 'paved', ring: rectRing(c, bb.axis, bb.long + 16, bb.short + up + down) };
}

/** A petrol station: the canopy over the pumps, the forecourt, and the kiosk where the map has no building at all. */
function dressFuel(street: StreetData, hint: PlaceHint, plan: PlacePlan): Dressed {
  const at = hint.at;
  const roofed = street.buildings.find((b) => b.open && b.area >= 30 && awayFrom(at, b.ring) < 40);
  const withCourt = (s: StreetData, canopy: Building): StreetData =>
    s.areas.some((a) => a.kind === 'paved' && pointInRing(ringCentroid(canopy.ring), a.ring)) ? s : { ...s, areas: [...s.areas, forecourt(s, canopy)] };
  if (roofed) {
    const c = ringCentroid(roofed.ring);
    return { street: roofed.area > 80 ? withCourt(street, roofed) : street, focus: [c], toward: c };
  }

  const ground = new FreeGround(street, at, 90);
  const kiosk = plan.building >= 0 ? street.buildings[plan.building] : null;
  if (kiosk) {
    // A house of a canopy's size standing free by the kiosk is the canopy, drawn by the map as a house.
    const kc = ringCentroid(kiosk.ring);
    let found = -1;
    let foundD = Infinity;
    street.buildings.forEach((b, i) => {
      if (i === plan.building || !solid(b) || b.area < 80 || b.area > 600) return;
      const bb = boundingBox(b.ring);
      if (bb.short < 6.5 || bb.long > 45) return;
      if (gapOf(b.ring, kiosk.ring) > KIOSK_GAP_M) return;
      // Free-standing: no other house shares a wall with it.
      const joined = street.buildings.some((o, k) => k !== i && k !== plan.building && solid(o) && b.ring.some((p) => awayFrom(p, o.ring) < 1.5));
      const d = dist(ringCentroid(b.ring), kc);
      if (!joined && d < foundD) {
        foundD = d;
        found = i;
      }
    });
    if (found >= 0) {
      const canopy: Building = { ...street.buildings[found], open: true, roof: 'flat', base: 0, height: CANOPY_H };
      const buildings = street.buildings.map((b, i) => (i === found ? canopy : b));
      const c = ringCentroid(canopy.ring);
      return { street: withCourt({ ...street, buildings }, canopy), focus: [c], toward: c };
    }
  }

  // A canopy of its own: before the kiosk's front, between it and the road.
  const tryCanopy = (base: V2, u: V2, out: V2, gaps: readonly number[], shifts: readonly number[]): Building | null => {
    for (const [long, short] of CANOPY_SIZES) {
      for (const gap of gaps) {
        for (const shift of shifts) {
          const ring = rectRing(along(along(base, out, gap + short / 2), u, shift), u, long, short);
          if (ground.free(ring, 0.4)) return madeBuilding('canopy', ring, CANOPY_H, true);
        }
      }
    }
    return null;
  };
  let canopy: Building | null = null;
  const made: Building[] = [];
  if (kiosk && plan.front) {
    const f = plan.front;
    canopy = tryCanopy(f.door, norm(sub(f.b, f.a)), f.out, [4.5, 3, 6.5, 9, 12], [0, 4, -4, 8, -8]);
  }
  if (!canopy) {
    // About the place's own point, along the nearest road; and a kiosk behind it where the map has none.
    const near = nearRoad(street, at, 70);
    if (near) {
      const out = near.d > 1 ? norm(sub(near.pt, at)) : left(near.dir);
      canopy = tryCanopy(at, near.dir, out, [-4.7, -2, -8, 1, -11], [0, 4, -4, 8, -8, 12, -12, 16, -16, 20, -20]);
      if (canopy && !kiosk) {
        const bb = boundingBox(canopy.ring);
        const back = dot(left(bb.axis), out) > 0 ? mul(left(bb.axis), -1) : left(bb.axis);
        search: for (const [long, short] of KIOSK_SIZES) {
          const spots: V2[] = [];
          for (const gap of [4.5, 3, 7]) spots.push(along(bb.c, back, bb.short / 2 + gap + short / 2));
          for (const side of [1, -1]) spots.push(along(bb.c, bb.axis, side * (bb.long / 2 + 5 + long / 2)));
          for (const c of spots) {
            const ring = rectRing(c, bb.axis, long, short);
            if (!ground.free(ring, 0.6)) continue;
            made.push(madeBuilding('kiosk', ring, KIOSK_H, false));
            break search;
          }
        }
      }
    }
  }
  if (!canopy && kiosk && pointInRing(at, kiosk.ring) && kiosk.area >= 80 && kiosk.area <= 400 && boundingBox(kiosk.ring).short >= 6.5) {
    // No room for a canopy by it, and the station's own point is in it: the house is the canopy itself.
    const roof: Building = { ...kiosk, open: true, roof: 'flat', base: 0, height: CANOPY_H };
    const buildings = street.buildings.map((b, i) => (i === plan.building ? roof : b));
    const c = ringCentroid(roof.ring);
    return { street: withCourt({ ...street, buildings }, roof), focus: [c], toward: c };
  }
  if (!canopy) return { street, focus: [] };
  const next: StreetData = { ...street, buildings: [...street.buildings, canopy, ...made] };
  return { street: withCourt(next, canopy), focus: [ringCentroid(canopy.ring)] };
}

/** A car park's sizes, the largest first: two rows of bays back to back with an aisle at the least. */
const PARKING_SIZES: readonly (readonly [number, number])[] = [
  [52, 32],
  [44, 28],
  [36, 22],
  [30, 18],
  [24, 16],
  [18, 12],
];

/** A car park: the ground about the place's point becomes a 'parking' area (bays and parked cars are drawn on it). */
function dressParking(street: StreetData, hint: PlaceHint): Dressed {
  const at = hint.at;
  const there = street.areas.find((a) => a.kind === 'parking' && a.ring.length >= 3 && awayFrom(at, a.ring) < 30);
  if (there) return { street, focus: [pointInRing(at, there.ring) ? at : nearestOnRing(at, there.ring).pt] };
  const near = nearRoad(street, at, 90);
  const u: V2 = near ? near.dir : [1, 0];
  const w = left(u);
  const ground = new FreeGround(street, at, 100);
  const shifts: V2[] = [];
  for (const sx of [0, 6, -6, 12, -12, 18, -18]) for (const sy of [0, 5, -5, 10, -10, 16, -16]) shifts.push([sx, sy]);
  shifts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  for (const [long, short] of PARKING_SIZES) {
    for (const [sx, sy] of shifts) {
      const c = along(along(at, u, sx), w, sy);
      const ring = rectRing(c, u, long, short);
      if (!ground.free(ring, 0.3)) continue;
      return { street: { ...street, areas: [...street.areas, { kind: 'parking', ring }] }, focus: [c] };
    }
  }
  return { street, focus: [] };
}

/** A bus station: two or three shelters along the kerb about the scene, on the origin's side of its road. */
function dressBusStation(street: StreetData): Dressed {
  // Shelters that are there already (the map's, or this street was dressed before): nothing to add.
  const there = street.buildings.filter((b) => b.open && b.area < 30 && dist(ringCentroid(b.ring), [0, 0]) < 45);
  if (there.length >= 2) return { street, focus: there.map((b) => ringCentroid(b.ring)) };
  const near = nearRoad(street, [0, 0], 70);
  if (!near) return { street, focus: [] };
  const { road } = near;
  const side = cross(near.dir, sub([0, 0], near.pt)) >= 0 ? 1 : -1;
  const ground = new FreeGround(street, near.pt, 60);
  const made: Building[] = [];
  let total = 0;
  for (let i = 1; i < road.pts.length; i++) total += dist(road.pts[i - 1], road.pts[i]);
  for (const off of [-12, 11, 23, -24]) {
    const s = near.s + off;
    if (s < 2 || s > total - 2 || made.length >= 3) continue;
    const p = pointAlong(road.pts, s);
    const c = along(p.pt, mul(left(p.dir), side), road.width / 2 + 3.4);
    const ring = rectRing(c, p.dir, 3.8, 1.6);
    if (ground.free(ring, 0.8)) made.push(madeBuilding('shelter', ring, 2.5, true));
  }
  if (!made.length) return { street, focus: [] };
  return { street: { ...street, buildings: [...street.buildings, ...made] }, focus: made.map((b) => ringCentroid(b.ring)) };
}

/**
 * A dressed street's additions moved onto the same street read around another origin (`shift`: the new origin in
 * the old frame): a building that was changed (a house marked as the canopy) replaces its like, what was made is
 * added. The street then counts as dressed: dressStreet finds the canopy, the bays or the shelters there and adds
 * nothing.
 */
export function carryDressing(from: StreetData, dressed: StreetData, to: StreetData, shift: V2): StreetData {
  const move = (p: V2): V2 => [p[0] - shift[0], p[1] - shift[1]];
  const buildings = to.buildings.slice();
  for (const b of dressed.buildings) {
    if (from.buildings.includes(b)) continue;
    const moved: Building = { ...b, ring: b.ring.map(move) };
    const c = ringCentroid(moved.ring);
    const like = buildings.findIndex((o) => o.id === b.id && dist(ringCentroid(o.ring), c) < 2);
    if (like >= 0) buildings[like] = { ...buildings[like], open: b.open, roof: b.roof, base: b.base, height: b.height };
    else buildings.push(moved);
  }
  const areas = to.areas.concat(dressed.areas.filter((a) => !from.areas.includes(a)).map((a) => ({ ...a, ring: a.ring.map(move) })));
  return { ...to, buildings, areas };
}

/** A street made ready for its place: what stands before the place added, and the place's own building and front on it. */
export interface Settled extends Dressed {
  plan: PlacePlan;
}

/**
 * Everything place.ts knows of a street's place: the plan, the street dressed for it, and the plan again where the
 * dressing changed what the place's own building or its front is (a kiosk made, a canopy the kiosk now looks at).
 */
export function settlePlace(street: StreetData, hint: PlaceHint): Settled {
  const plan = planPlace(street, hint);
  const dressed = dressStreet(street, hint, plan);
  const again = dressed.street !== street || dressed.toward !== undefined;
  return { ...dressed, plan: again ? planPlace(dressed.street, hint, dressed.toward) : plan };
}

/**
 * The street with what stands before the place that the map does not draw. Everything added is plain street data
 * (open buildings, a kiosk, 'paved' and 'parking' areas): the director keeps people and vehicles out of what is
 * solid and the renderer draws canopies with their pumps, forecourts, bays and shelters from the data as it does on
 * a made-up street. A street that already has the thing (a made-up petrol station, a mapped canopy) is left as it is.
 */
export function dressStreet(street: StreetData, hint: PlaceHint, plan: PlacePlan): Dressed {
  if (hint.kind === 'gasstation') return dressFuel(street, hint, plan);
  if (hint.kind === 'parking') return dressParking(street, hint);
  if (hint.kind === 'busstation') return dressBusStation(street);
  return { street, focus: [] };
}

/** A front's stretch is told this far to each side of its door at the most: what a camera at the scene has in its picture. */
const FRONT_HALF_M = 14;

/**
 * The stretch of a building's wall about a point of its outline (a door): the straightened footprint's edge the point
 * lies on, at most 14 m to each side of it, and the wall's normal.
 */
export function wallAt(b: Building, p: V2): { a: V2; b: V2; out: V2 } {
  const ring = straighten(b.ring, 0.8);
  const n = nearestOnRing(p, ring);
  const a = ring[n.edge];
  const e = norm(sub(ring[(n.edge + 1) % ring.length], a));
  const len = dist(a, ring[(n.edge + 1) % ring.length]);
  const s = Math.min(len, Math.max(0, dot(sub(p, a), e)));
  return { a: along(a, e, Math.max(0, s - FRONT_HALF_M)), b: along(a, e, Math.min(len, s + FRONT_HALF_M)), out: n.normal };
}
