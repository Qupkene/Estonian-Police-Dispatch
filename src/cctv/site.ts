/**
 * The lie of the land for one camera (docs/CCTV.md): from the street around an incident, the road vehicles
 * arrive on, the spot on the roadside where it happens, the nearest door, the lamps, and where the camera hangs so
 * that it sees the spot and the stretch of road the first crews stop on. Worked out once per incident, from the
 * street data and a seed alone.
 *
 * Two things are never given up: nothing stands inside a house or in water (the spot, the camera, the walking lines
 * near the spot), and the camera has a free line to the spot. Places are tried in order until one holds: the
 * incident's own side of its road, the other side, a little further along, the next road. Among the places that
 * hold, and among the cameras each one allows, the choice is by what ends up in the picture (`rate`): the people at
 * the spot, the stretch of road the first crews stop on with their car, the door.
 *
 * The map is taken as it is drawn, not as it is labelled: a lane is as wide as its house fronts leave it, the drive
 * line ends before a house that stands on its road, and where the nearest wall is some way off the door is on the
 * wall the camera sees.
 *
 * A street read or made for a place (`StreetData.place`: a petrol station, a bank, a car park) is first given what
 * stands before the place (place.ts), and the scene is wanted before the front of the place's own building, with its
 * door on that front and the front in the picture: a place on a road the building does not face costs more, and so
 * does a camera without the stretch of the front the place's board hangs on in the middle of its picture.
 *
 * No camera is taken with a wall, a roof, a canopy or a panel block's balconies nearer than 8 m over more than a
 * seventh of its picture while the street has one without (`nearCover`): only a lane too narrow for any gets the
 * camera with the least wall for what it shows.
 *
 * Pure: no DOM, no three.js.
 */
import {
  along,
  boundingBox,
  clamp,
  clipLineToCircle,
  cross,
  dist,
  dot,
  hash01,
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
  segmentHitsRing,
  segmentsCross,
  sliceLine,
  sub,
  yawOf,
  type Rand,
  type V2,
} from './math';
import { isShown, pumpIslands, settlePlace, wallAt, type Front } from './place';
import {
  CAR_ROADS,
  type Building,
  type CameraPose,
  type DriveLine,
  type Lamp,
  type PlaceHint,
  type Road,
  type Site,
  type SitePlace,
  type StreetData,
} from './types';

const DBG: string[] | undefined = (globalThis as { __dbg?: string[] }).__dbg;

/** Vehicles are followed this far from the incident. */
export const DRIVE_RADIUS = 120;
/** A road further from the incident than this is not its road. */
const MAX_ROAD_M = 70;
/** Road ends closer than this are the same point (the map cuts a road into pieces). */
const JOIN_M = 2;
/** The shortest drive line a scene can be played on. */
const MIN_DRIVE_M = 24;
/** The scene stays this far from the ends of its drive line, so that a crew has road to stop on before it. */
const END_ROOM_M = 8;
/** How many roads are tried before the street is given up (the caller then makes a street up). */
const MAX_LINES = 12;
/** A vehicle needs this much carriageway. */
const MIN_WIDTH_M = 2.6;
/** A wall this near the middle of the road leaves no way past it. */
const PINCH_M = 1.2;
/** The drive line ends this far before a house that stands on its road. */
const WALL_STOP_M = 2;
/** People keep this far from a wall. */
const WALL_ROOM_M = 0.7;
/**
 * The first crews stop on the road within this many metres before the spot (src/cctv/director.ts `slot`: the first
 * one 7 m short of it, or 12 m at a crash, and it is 5 m long).
 */
const STOP_BEFORE_M = 14;
/** And the picture shows the road this far past it, where they walk to. */
const STOP_PAST_M = 6;
/** A door within this many metres of the spot: the scene is at it, and the camera has to show it. */
const DOOR_NEAR_M = 12;
/** A camera hangs within 40 m of its spot; what stands further from the spot than this plays no part in its picture. */
const CAMERA_REACH_M = 110;
/** How many places a camera is worked out for before the best of them is taken. */
const MAX_PLACES = 6;
/** And how many at the most where some of them have a wall right before every camera, or no camera with the place's board. */
const MAX_TRIES = 18;
/** The vertical field of view of a street camera, degrees: about a 6 mm lens to a 2.8 mm one. */
const FOV_MIN = 36;
const FOV_MAX = 64;
const ASPECT = 16 / 9;
/** What has to be in the picture keeps this far from its edge (a share of the half frame). */
const FIT_MARGIN = 0.16;
/** Where the spot is wanted in the picture's height: a little above the middle (-1 bottom, 1 top). */
const SPOT_Y = 0.1;
const DEG = Math.PI / 180;
/** A door is looked for within this many metres of the spot. */
const DOOR_REACH_M = 32;
/** A spot within this many metres of the own building's front, on its side and with nothing between, is before it. */
const FRONT_NEAR_M = 30;
/** A spot within this many metres of what stands before the place (a canopy's middle, the bays, a shelter) is at it. */
const FOCUS_NEAR_M = 28;
/** What a place costs that is not before the front of the incident's own building (more than the next road does). */
const OFF_FRONT_COST = 6;

/** The place the incident names, as a site is built for it. */
interface Own {
  hint: PlaceHint;
  /** Its own building: its index into street.buildings and the building itself, or -1 and null. */
  index: number;
  building: Building | null;
  front: Front | null;
  /** What stands before it that the picture should hold (a canopy's middle, the bays, the shelters). */
  focus: V2[];
}

/** How much less a road is wanted as the drive line (metres added to its distance). */
function reluctance(r: Road): number {
  if (r.tunnel) return 1000;
  if (CAR_ROADS.has(r.cls)) return r.cls === 'service' ? 5 : r.cls === 'motorway' ? 8 : 0;
  if (r.cls === 'pedestrian') return 14;
  if (r.cls === 'path') return 26;
  return 1000;
}

/** The roads the incident could be on, the likeliest first. */
function rankRoads(street: StreetData): { index: number; d: number }[] {
  const out: { index: number; d: number; score: number }[] = [];
  street.roads.forEach((road, index) => {
    if (road.pts.length < 2 || reluctance(road) >= 1000) return;
    const n = nearestOnLine([0, 0], road.pts);
    if (n.d <= MAX_ROAD_M) out.push({ index, d: n.d, score: n.d + reluctance(road) });
  });
  return out.sort((a, b) => a.score - b.score || a.index - b.index);
}

/**
 * Follow a road beyond its end: the map cuts one street into several lines, so at an end the line that goes on
 * straightest (a drivable one, turning less than 55 degrees) continues it, until the line leaves the circle.
 */
function extend(street: StreetData, start: number): { pts: V2[]; deadA: boolean; deadB: boolean; used: Set<number> } {
  const used = new Set<number>([start]);
  let pts = street.roads[start].pts.slice();
  const drivable = (r: Road) => reluctance(r) < 1000;
  const grow = (): boolean => {
    const end = pts[pts.length - 1];
    if (dist(end, [0, 0]) > DRIVE_RADIUS) return false;
    const dir = norm(sub(end, pts[pts.length - 2]));
    let best: { pts: V2[]; i: number } | null = null;
    let bestTurn = Math.cos(55 * DEG);
    street.roads.forEach((r, i) => {
      if (used.has(i) || r.pts.length < 2 || !drivable(r)) return;
      for (const rev of [false, true]) {
        const line = rev ? r.pts.slice().reverse() : r.pts;
        if (dist(line[0], end) > JOIN_M) continue;
        const c = dot(dir, norm(sub(line[1], line[0])));
        if (c > bestTurn) {
          bestTurn = c;
          best = { pts: line, i };
        }
      }
    });
    if (!best) return false;
    const b = best as { pts: V2[]; i: number };
    used.add(b.i);
    pts = pts.concat(b.pts.slice(1));
    return true;
  };
  for (let k = 0; k < 12 && grow(); k++);
  pts.reverse();
  for (let k = 0; k < 12 && grow(); k++);
  pts.reverse();
  // Keep the run through the circle that passes the incident.
  const runs = clipLineToCircle(pts, [0, 0], DRIVE_RADIUS);
  let run = runs[0] ?? pts;
  let bestD = Infinity;
  for (const x of runs) {
    const d = nearestOnLine([0, 0], x).d;
    if (d < bestD) {
      bestD = d;
      run = x;
    }
  }
  const inside = (p: V2) => dist(p, [0, 0]) < DRIVE_RADIUS - 4;
  return { pts: run, deadA: inside(run[0]), deadB: inside(run[run.length - 1]), used };
}

const solid = (b: Building) => !b.open && b.base < 2.5;

/** Is the straight line from a to b free of buildings? */
export function clearLine(street: StreetData, a: V2, b: V2, skip = -1): boolean {
  for (let i = 0; i < street.buildings.length; i++) {
    const bd = street.buildings[i];
    if (i === skip || !solid(bd)) continue;
    if (segmentHitsRing(a, b, bd.ring)) return false;
  }
  return true;
}

export function insideBuilding(street: StreetData, p: V2): number {
  for (let i = 0; i < street.buildings.length; i++) if (solid(street.buildings[i]) && pointInRing(p, street.buildings[i].ring)) return i;
  return -1;
}

/** A point of the drive line: `s` metres along it and `lat` metres to its left. */
export function onDrive(drive: DriveLine, s: number, lat: number): { pos: V2; dir: V2 } {
  const p = pointAlong(drive.pts, clamp(s, 0, drive.length));
  return { pos: along(p.pt, left(p.dir), lat), dir: p.dir };
}

// ------------------------------------------------------------------------------------------------ the ground

/** A footprint with its bounds, for quick rejection. */
interface Mass {
  ring: readonly V2[];
  /** How high it hides what is behind it: a house's ridge or parapet, a shelter's roof. */
  height: number;
  /** Index into street.buildings. */
  index: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function massOf(ring: readonly V2[], height: number, index: number): Mass {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of ring) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { ring, height, index, x0, y0, x1, y1 };
}

/** Where along ab (0..1) the segment crosses the outline of a ring, in no order. */
function crossings(a: V2, b: V2, ring: readonly V2[], out: number[]): number[] {
  out.length = 0;
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

/**
 * How far a house's roof stands above its eaves, as src/cctv/render/world.ts builds it at the most: the ridge of a
 * pitched roof (by the short side of the footprint), the parapet of a flat one.
 */
function roofRise(b: Building): number {
  return b.roof === 'gable' ? clamp(boundingBox(b.ring).short * 0.44, 1.2, 4.6) : 0.6;
}

/** The scene's own spot keeps this far from a pump island. */
const ISLAND_ROOM_M = 1.2;
/** How thick a shelter's roof is taken to be: a line of sight passes over it or under it, not through it. */
const ROOF_SLAB_M = 0.7;

/**
 * Something a lens can have right before it, as src/cctv/render/world.ts builds it: a house's walls with the parapet
 * of a flat roof, a building part held up on posts, a canopy's fascia, a shelter's roof (all: a footprint between
 * two heights), and a pitched roof (over the footprint's bounding rectangle, half a metre past the walls).
 */
interface Block {
  /** Index into street.buildings. */
  index: number;
  ring: readonly V2[];
  lo: number;
  hi: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** A pitched roof: the rectangle's middle, its long axis, its half sizes, and the heights of its eaves and its ridge. */
  pitch?: { c: V2; u: V2; halfLong: number; half: number; eave: number; ridge: number };
}

/** How far a pitched roof reaches past its walls, and how deep a canopy's fascia and a shelter's roof are (render/world.ts). */
const ROOF_OVER_M = 0.42;
const FASCIA_M = 0.85;
const SHELTER_ROOF_M = 0.25;
/** A flat roof's parapet at the most. */
const PARAPET_M = 0.6;

/**
 * Is a building a panel block, as the renderer fronts it (src/cctv/render/world.ts facadeKindOf gives 'panel', by
 * the building's size and its id: tests/cctv-site.test.ts holds the two together)? Balconies hang on a panel
 * block's long walls.
 */
export function panelBlock(b: Building): boolean {
  if (b.open || b.roof === 'gable' || b.ring.length < 3) return false;
  const h = hash01('kind', b.id);
  const tall = b.height - b.base;
  // A hall, and a shop's low box, are never one.
  if ((b.area > 1500 && tall < 13) || (b.area > 120 && b.area <= 1500 && tall < 6.5)) return false;
  const bb = boundingBox(b.ring);
  if (bb.long > 36 && bb.short >= 9 && bb.short <= 17 && tall >= 12) return h < 0.82;
  if (tall >= 18) return h < 0.6;
  return tall >= 3.2 && h >= 0.88;
}

/** A panel block's balconies: on its walls longer than this, from the first floor up, this far out of the wall. */
const BALCONY_WALL_M = 20;
const BALCONY_FROM_M = 2.85;
const BALCONY_OUT_M = 1.25;

function blocksOf(b: Building, index: number): Block[] {
  if (b.ring.length < 3) return [];
  const blockOf = (ring: readonly V2[], lo: number, hi: number): Block => {
    const m = massOf(ring, 0, 0);
    return { index, ring, lo, hi, x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 };
  };
  if (b.open) return [blockOf(b.ring, b.height - (b.area >= 30 ? FASCIA_M : SHELTER_ROOF_M), b.height)];
  if (b.roof !== 'gable') {
    const out = [blockOf(b.ring, b.base, b.height + PARAPET_M)];
    if (!panelBlock(b)) return out;
    // The stacks of balconies, as one mass along each long wall (which bays have them is the renderer's own choice).
    const ccw = ringArea(b.ring) > 0;
    for (let i = 0; i < b.ring.length; i++) {
      const a = b.ring[i];
      const d = b.ring[(i + 1) % b.ring.length];
      if (dist(a, d) <= BALCONY_WALL_M) continue;
      const e = norm(sub(d, a));
      const n: V2 = ccw ? [e[1], -e[0]] : [-e[1], e[0]];
      out.push(blockOf([a, d, along(d, n, BALCONY_OUT_M), along(a, n, BALCONY_OUT_M)], b.base + BALCONY_FROM_M, b.height));
    }
    return out;
  }
  const box = blockOf(b.ring, b.base, b.height);
  const bb = boundingBox(b.ring);
  const rise = clamp(bb.short * (0.32 + 0.12 * hash01('pitch', b.id)), 1.2, 4.6);
  const half = bb.short / 2 + ROOF_OVER_M;
  const halfLong = bb.long / 2 + ROOF_OVER_M;
  const reach = Math.hypot(half, halfLong);
  const roof: Block = {
    index,
    ring: b.ring,
    lo: b.height,
    hi: b.height + rise,
    x0: bb.c[0] - reach,
    y0: bb.c[1] - reach,
    x1: bb.c[0] + reach,
    y1: bb.c[1] + reach,
    pitch: { c: bb.c, u: bb.axis, halfLong, half, eave: b.height - (ROOF_OVER_M * rise) / (bb.short / 2), ridge: b.height + rise },
  };
  return [box, roof];
}

/** What stands on the ground of a street, asked many times while a site is worked out: houses, shelters, water. */
class Ground {
  private houses: Mass[] = [];
  private roofs: Mass[] = [];
  private waters: Mass[] = [];
  private blocks: Block[] = [];
  private readonly ts: number[] = [];

  constructor(
    readonly street: StreetData,
    from?: { g: Ground; c: V2; r: number },
  ) {
    if (from) {
      const { g, c, r } = from;
      const close = (m: { x0: number; y0: number; x1: number; y1: number }) => m.x1 >= c[0] - r && m.x0 <= c[0] + r && m.y1 >= c[1] - r && m.y0 <= c[1] + r;
      this.houses = g.houses.filter(close);
      this.roofs = g.roofs.filter(close);
      this.waters = g.waters;
      this.blocks = g.blocks.filter(close);
      return;
    }
    street.buildings.forEach((b, i) => {
      if (b.ring.length < 3) return;
      this.blocks.push(...blocksOf(b, i));
      if (solid(b)) this.houses.push(massOf(b.ring, b.height + roofRise(b), i));
      else if (b.open) this.roofs.push(massOf(b.ring, b.height, i));
    });
    for (const a of street.areas) if (a.kind === 'water' && a.ring.length >= 3) this.waters.push(massOf(a.ring, 0, -1));
  }

  /** The same ground with only what stands within `r` metres of a point: for the many questions asked about one place. */
  near(c: V2, r: number): Ground {
    return new Ground(this.street, { g: this, c, r });
  }

  /** The houses that reach within `r` metres of a point. */
  housesNear(c: V2, r: number): Mass[] {
    return this.houses.filter((m) => m.x1 >= c[0] - r && m.x0 <= c[0] + r && m.y1 >= c[1] - r && m.y0 <= c[1] + r);
  }

  /** The house a point is inside (index into street.buildings), or -1. */
  inside(p: V2): number {
    for (const m of this.houses) if (p[0] >= m.x0 && p[0] <= m.x1 && p[1] >= m.y0 && p[1] <= m.y1 && pointInRing(p, m.ring)) return m.index;
    return -1;
  }

  /** On a pump island under a petrol station's canopy, or within a step of one? */
  onIsland(p: V2): boolean {
    for (const m of this.roofs) {
      const b = this.street.buildings[m.index];
      for (const ring of pumpIslands(b)) if (pointInRing(p, ring) || nearestOnRing(p, ring).d < ISLAND_ROOM_M) return true;
    }
    return false;
  }

  /** Under a shelter's roof (a petrol station's canopy)? */
  roofed(p: V2): boolean {
    return this.roofs.some((m) => p[0] >= m.x0 && p[0] <= m.x1 && p[1] >= m.y0 && p[1] <= m.y1 && pointInRing(p, m.ring));
  }

  water(p: V2): boolean {
    return this.waters.some((m) => p[0] >= m.x0 && p[0] <= m.x1 && p[1] >= m.y0 && p[1] <= m.y1 && pointInRing(p, m.ring));
  }

  /** How far the nearest house wall is, up to `max` (0 inside a house). */
  wallDist(p: V2, max: number): number {
    let best = max;
    for (const m of this.houses) {
      if (p[0] < m.x0 - best || p[0] > m.x1 + best || p[1] < m.y0 - best || p[1] > m.y1 + best) continue;
      if (pointInRing(p, m.ring)) return 0;
      for (let i = 0, j = m.ring.length - 1; i < m.ring.length; j = i++) {
        const d = nearestOnSegment(p, m.ring[j], m.ring[i]).d;
        if (d < best) best = d;
      }
    }
    return best;
  }

  /** Is the straight line from a to b free of houses (on the ground plan)? */
  clear(a: V2, b: V2): boolean {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (const m of this.houses) {
      if (x1 < m.x0 || x0 > m.x1 || y1 < m.y0 || y0 > m.y1) continue;
      if (segmentHitsRing(a, b, m.ring)) return false;
    }
    return true;
  }

  /** How far from p the first house wall is in a direction, up to `max`, and whose wall (0 when p is inside one). */
  reach(p: V2, dir: V2, max: number): { d: number; index: number } {
    const b = along(p, dir, max);
    const x0 = Math.min(p[0], b[0]);
    const x1 = Math.max(p[0], b[0]);
    const y0 = Math.min(p[1], b[1]);
    const y1 = Math.max(p[1], b[1]);
    let best = { d: max, index: -1 };
    for (const m of this.houses) {
      if (x1 < m.x0 || x0 > m.x1 || y1 < m.y0 || y0 > m.y1) continue;
      if (pointInRing(p, m.ring)) return { d: 0, index: m.index };
      for (const t of crossings(p, b, m.ring, this.ts)) if (t * max < best.d) best = { d: t * max, index: m.index };
    }
    return best;
  }

  /**
   * Does a lens `ha` metres up at a see the point `hb` metres up at b? A house hides what is behind it below its
   * eaves; a shelter's roof hides what the line would have to pass through it for.
   */
  sight(a: V2, ha: number, b: V2, hb: number): boolean {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (const m of this.houses) {
      if (x1 < m.x0 || x0 > m.x1 || y1 < m.y0 || y0 > m.y1) continue;
      for (const t of crossings(a, b, m.ring, this.ts)) if (ha + (hb - ha) * t < m.height) return false;
      if (hb < m.height && pointInRing(b, m.ring)) return false;
    }
    for (const m of this.roofs) {
      if (x1 < m.x0 || x0 > m.x1 || y1 < m.y0 || y0 > m.y1) continue;
      let over = false;
      let under = false;
      const mark = (h: number) => {
        if (h > m.height - ROOF_SLAB_M) over = true;
        if (h < m.height) under = true;
      };
      for (const t of crossings(a, b, m.ring, this.ts)) mark(ha + (hb - ha) * t);
      if (pointInRing(a, m.ring)) mark(ha);
      if (pointInRing(b, m.ring)) mark(hb);
      if (over && under) return false;
    }
    return true;
  }

  /**
   * How far a ray from a lens goes before a house (its wall or its roof): `dir` is its direction on the ground plan
   * (a unit vector), `slope` its climb per metre of ground, `max` how far it is followed (to the ground, for a ray
   * that looks down). Infinity when it meets none.
   */
  houseAhead(a: V2, height: number, dir: V2, slope: number, max: number): number {
    const b = along(a, dir, max);
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    let best = Infinity;
    for (const m of this.houses) {
      if (x1 < m.x0 || x0 > m.x1 || y1 < m.y0 || y0 > m.y1) continue;
      for (const t of crossings(a, b, m.ring, this.ts)) {
        const d = t * max;
        if (d < best && height + slope * d < m.height) best = d;
      }
      // A ray that ends over the footprint came down on the roof.
      if (max < best && height + slope * max < m.height && pointInRing(b, m.ring)) best = max;
    }
    return best;
  }

  /** Does a ray from a lens (`d`: its unit direction) meet a wall, a roof or a canopy within `max` metres (`skip`: not this building's)? */
  private blocked(o: P3, d: P3, max: number, skip: number): boolean {
    const a: V2 = [o.x, o.y];
    const b: V2 = [o.x + d.x * max, o.y + d.y * max];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (const m of this.blocks) {
      if (m.index === skip || x1 < m.x0 || x0 > m.x1 || y1 < m.y0 || y0 > m.y1) continue;
      if (m.pitch) {
        if (underPitch(m.pitch, o, d, max)) return true;
        continue;
      }
      // The stretches of the ray over the footprint, and whether it is between the two heights on one of them.
      const ts = crossings(a, b, m.ring, this.ts).sort((p, q) => p - q);
      if (pointInRing(a, m.ring)) ts.unshift(0);
      if (ts.length % 2) ts.push(1);
      for (let i = 0; i < ts.length; i += 2) {
        const za = o.z + d.z * ts[i] * max;
        const zb = o.z + d.z * ts[i + 1] * max;
        if (Math.max(za, zb) >= m.lo && Math.min(za, zb) <= m.hi) return true;
      }
    }
    return false;
  }

  /**
   * The share of a camera's picture that is a wall, a roof or a canopy nearer than `reach` metres from its lens:
   * rays through a grid of `cols` by `rows` points over the frame, each followed that far. `skip`: a building that is
   * not counted (index into street.buildings).
   */
  cover(c: CameraPose, reach: number, cols: number, rows: number, skip = -1): number {
    const l = lensOf(c);
    let hit = 0;
    for (let ix = 0; ix < cols; ix++) {
      for (let iy = 0; iy < rows; iy++) {
        const gx = (((ix + 0.5) / cols) * 2 - 1) * l.th;
        const gy = (((iy + 0.5) / rows) * 2 - 1) * l.tv;
        const d = unit3(l.f.x + l.r.x * gx + l.u.x * gy, l.f.y + l.r.y * gx + l.u.y * gy, l.f.z + l.r.z * gx + l.u.z * gy);
        // No further than the ground.
        const max = d.z < 0 ? Math.min(reach, l.o.z / -d.z) : reach;
        if (this.blocked(l.o, d, max, skip)) hit++;
      }
    }
    return hit / (cols * rows);
  }
}

/** Does a ray meet a pitched roof within `max` metres: its slopes from above or from below, a gable, its eaves? */
function underPitch(r: NonNullable<Block['pitch']>, o: P3, d: P3, max: number): boolean {
  const w = left(r.u);
  let wasIn = false;
  let wasOver = false;
  for (let t = 0; t <= max; t += 0.2) {
    const x = o.x + d.x * t - r.c[0];
    const y = o.y + d.y * t - r.c[1];
    const v = Math.abs(x * w[0] + y * w[1]);
    const isIn = Math.abs(x * r.u[0] + y * r.u[1]) <= r.halfLong && v <= r.half;
    const z = o.z + d.z * t;
    const over = z > r.eave + (r.ridge - r.eave) * (1 - v / r.half);
    // Through a slope; or into the roof by its gable or its eaves board (under the eaves is the way to the wall).
    if (isIn && (wasIn ? over !== wasOver : !over && z >= r.eave - 0.2)) return true;
    wasIn = isIn;
    wasOver = over;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ the picture

interface P3 {
  x: number;
  y: number;
  z: number;
}

const unit3 = (x: number, y: number, z: number): P3 => {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
};

/** A camera as its picture is worked out: where the lens is, its three axes (scene x east, y north, z up), its opening. */
interface Lens {
  o: P3;
  /** Forward, right, up. */
  f: P3;
  r: P3;
  u: P3;
  /** Tangents of half the vertical and half the horizontal field of view. */
  tv: number;
  th: number;
}

function lensAt(o: P3, f: P3, tv: number): Lens {
  // Right is forward x up (0, 0, 1); the picture's up is right x forward.
  const r = unit3(f.y, -f.x, 0);
  const u: P3 = { x: r.y * f.z, y: -r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { o, f, r, u, tv, th: tv * ASPECT };
}

function lensOf(c: CameraPose): Lens {
  const o: P3 = { x: c.pos[0], y: c.pos[1], z: c.height };
  return lensAt(o, unit3(c.target[0] - o.x, c.target[1] - o.y, c.targetHeight - o.z), Math.tan((c.fov / 2) * DEG));
}

/** A point in a lens's picture: x and y from -1 (left, bottom) to 1 (right, top), z metres in front of the lens. */
function see(l: Lens, p: V2, h: number): P3 {
  const dx = p[0] - l.o.x;
  const dy = p[1] - l.o.y;
  const dz = h - l.o.z;
  const z = dx * l.f.x + dy * l.f.y + dz * l.f.z;
  if (z < 0.05) return { x: Infinity, y: Infinity, z };
  return { x: (dx * l.r.x + dy * l.r.y + dz * l.r.z) / z / l.th, y: (dx * l.u.x + dy * l.u.y + dz * l.u.z) / z / l.tv, z };
}

const framed = (q: P3, margin: number) => q.z > 0.5 && Math.abs(q.x) <= 1 - margin && Math.abs(q.y) <= 1 - margin;

/**
 * Where a point `h` metres above the ground at `p` lands in a camera's picture (16:9, as src/cctv/render/view.ts
 * draws it before the lens's bulge): x from -1 at the left edge to 1 at the right, y from -1 at the bottom to 1 at
 * the top, z metres in front of the lens (behind it: not in the picture, whatever x and y say).
 */
export function projectPoint(camera: CameraPose, p: V2, h: number): { x: number; y: number; z: number } {
  return see(lensOf(camera), p, h);
}

/** How squarely a camera sees a wall at a point of it: 1 straight on, 0 along the wall, less from behind it. */
const facingOf = (c: CameraPose, at: V2, out: V2) => dot(out, norm([c.pos[0] - at[0], c.pos[1] - at[1]]));
/** A wall seen less squarely than this (about 25 degrees off its own line) shows little of its door. */
const SQUARE_ON = 0.42;

/** Something the picture should hold: a point of the ground plan and its height. */
interface Mark {
  p: V2;
  h: number;
  /**
   * Where the lens's free line is asked to, when not to `p`: a board's marks are asked for a metre before their wall
   * (the wall is told as a straight line, and the footprint it stands for steps in and out of that by most of a metre).
   */
  from?: V2;
}

/** A place a scene could be played at: a point of a drive line, a side of it, the spot and its door. */
interface Place {
  drive: DriveLine;
  roadSpot: V2;
  dir: V2;
  side: 1 | -1;
  spot: V2;
  door: V2 | null;
  doorOut: V2 | null;
  doorBuilding: number;
}

/** What a camera at a place is judged by: the marks, and which of them are what (indices into `marks`). */
interface Subject {
  place: Place;
  marks: Mark[];
  /** The people at the spot: where they stand, head and feet. */
  group: number[];
  /** The road's centre line, `k` metres along it from the scene's point. */
  road: { i: number; k: number }[];
  /** A car's roof at each end of the stretch crews stop on. */
  ends: number[];
  /** Where the first crew's car stands, from each end of the road crews come from (corners on the ground and at roof height). */
  carA: number[] | null;
  carB: number[] | null;
  /** The door, when the scene is at one. */
  door: number[];
  /** What says which place this is: what stands before it, and its own front's door when the scene is not at it. */
  extra: number[];
  /** Which of `extra` is the own front's door (-1: none). */
  ownDoor: number;
  /** The door at the scene is the place's own. */
  ownNear: boolean;
  /**
   * Where the place's board hangs: its middle over the door of its own front and its two ends along the wall (none:
   * the place has no building), and that wall's normal.
   */
  board: number[];
  boardOut: V2 | null;
}

/** A place's board hangs about this high over its door (over the ground floor: src/cctv/render/place.ts), and reaches this far to each side. */
const BOARD_H_M = 3.4;
const BOARD_HALF_M = 4;
/** What a camera costs that does not have the middle of the place's board in the middle of its picture, and an end of it in the picture. */
const BOARD_COST = 1.2;
const BOARD_END_COST = 0.6;
const BOARD_MAX = 1.8;
/** A board a metre high is read when it takes this share of the picture's height at the least. */
const BOARD_SHARE = 0.035;

/** May a crew come from this end of the road? Not out of a dead end while the other end is open (the director's rule). */
const comesFrom = (d: DriveLine, a: boolean) => !(a ? d.deadA : d.deadB) || (a ? d.deadB : d.deadA);

function subjectOf(place: Place, own: Own | null): Subject {
  const { drive, spot, dir, side } = place;
  const n = mul(left(dir), side);
  const marks: Mark[] = [];
  const add = (p: V2, h: number) => marks.push({ p, h }) - 1;
  const group = [add(spot, 0), add(spot, 1.9)];
  for (const [axis, d] of [[dir, 2.2], [dir, -2.2], [n, 1.4], [n, -1.4]] as const) group.push(add(along(spot, axis, d), 0.9));
  const road: { i: number; k: number }[] = [];
  const ends: number[] = [];
  for (let k = -30; k <= 30; k += 2) {
    const s = drive.at + k;
    if (s < 0 || s > drive.length) continue;
    const p = pointAlong(drive.pts, s).pt;
    road.push({ i: add(p, 0), k });
    // A car that stops at the far end of the stretch is there with its roof.
    if (Math.abs(k) === STOP_BEFORE_M && comesFrom(drive, k < 0)) ends.push(add(p, 1.7));
  }
  // The first crew stops at its own (right-hand) kerb, 7 m short of the spot or 12 m at a crash: where its car can be.
  const kerb = Math.max(0, drive.width / 2 - 1.15);
  const car = (fromA: boolean): number[] | null => {
    if (!comesFrom(drive, fromA)) return null;
    const back = fromA ? -1 : 1;
    if (drive.at + back * 7 < 3.5 || drive.at + back * 7 > drive.length - 3.5) return null;
    const out: number[] = [];
    for (const d of [4.6, STOP_BEFORE_M + 0.4]) {
      for (const dl of [-1, 1]) {
        const p = onDrive(drive, drive.at + back * d, back * kerb + dl).pos;
        out.push(add(p, 0), add(p, 1.7));
      }
    }
    return out;
  };
  const carA = car(true);
  const carB = car(false);
  const door: number[] = [];
  if (place.door && place.doorOut && dist(place.door, spot) <= DOOR_NEAR_M) {
    // Its foot, and the window above it (where a fire's smoke comes out, src/cctv/director.ts).
    const p = along(place.door, place.doorOut, 0.3);
    door.push(add(p, 0.1), add(p, 4));
  }
  const extra: number[] = [];
  let ownDoor = -1;
  if (own) {
    for (const p of own.focus) if (dist(p, spot) < 45) extra.push(add(p, 1.5));
    if (own.front && !door.length && dist(own.front.door, spot) < 45) {
      ownDoor = extra.length;
      extra.push(add(along(own.front.door, own.front.out, 0.3), 2.2));
    }
  }
  // The board: on the wall the place's own door is on at this place, else on its front, else on its wall nearest the scene.
  const board: number[] = [];
  let boardOut: V2 | null = null;
  if (own && own.building) {
    let at: V2;
    if (place.door && place.doorOut && place.doorBuilding === own.index) [at, boardOut] = [place.door, place.doorOut];
    else if (own.front) [at, boardOut] = [own.front.door, own.front.out];
    else {
      const n = nearestOnRing(spot, own.building.ring);
      [at, boardOut] = [n.pt, n.normal];
    }
    if (dist(at, spot) < 60) {
      // The wall it hangs on, no further along it than the wall goes.
      const wall = wallAt(own.building, at);
      const e = norm(sub(wall.b, wall.a));
      const len = dist(wall.a, wall.b);
      const half = Math.min(BOARD_HALF_M, len / 2 - 0.3);
      const s = clamp(dot(sub(at, wall.a), e), half + 0.3, len - half - 0.3);
      for (const k of [s, s - half, s + half]) {
        const p = along(wall.a, e, k);
        board.push(marks.push({ p: along(p, boardOut, 0.3), h: BOARD_H_M, from: along(p, boardOut, 1) }) - 1);
      }
    }
  }
  const ownNear = !!own && door.length > 0 && place.doorBuilding === own.index;
  return { place, marks, group, road, ends, carA, carB, door, extra, ownDoor, ownNear, board, boardOut };
}

/** The direction and the opening that hold a set of points in the picture, or null when no lens here does. */
function fit(o: P3, pts: readonly Mark[]): { f: P3; halfV: number; tv: number } | null {
  if (!pts.length) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const m of pts) {
    const d = unit3(m.p[0] - o.x, m.p[1] - o.y, m.h - o.z);
    sx += d.x;
    sy += d.y;
    sz += d.z;
  }
  let f = unit3(sx, sy, sz);
  let halfH = 0;
  let halfV = 0;
  for (let it = 0; it < 6; it++) {
    if (Math.hypot(f.x, f.y) < 0.2) return null;
    const l = lensAt(o, f, 1);
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const m of pts) {
      const dx = m.p[0] - o.x;
      const dy = m.p[1] - o.y;
      const dz = m.h - o.z;
      const z = dx * f.x + dy * f.y + dz * f.z;
      // Further than about 75 degrees off the axis: no street camera's lens.
      if (z < 0.26 * Math.hypot(dx, dy, dz)) return null;
      const a = (dx * l.r.x + dy * l.r.y + dz * l.r.z) / z;
      const b = (dx * l.u.x + dy * l.u.y + dz * l.u.z) / z;
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    }
    halfH = (a1 - a0) / 2;
    halfV = (b1 - b0) / 2;
    const ca = (a0 + a1) / 2;
    const cb = (b0 + b1) / 2;
    if (Math.abs(ca) < 2e-3 && Math.abs(cb) < 2e-3) break;
    f = unit3(f.x + l.r.x * ca + l.u.x * cb, f.y + l.r.y * ca + l.u.y * cb, f.z + l.r.z * ca + l.u.z * cb);
  }
  return { f, halfV, tv: Math.max(halfV, halfH / ASPECT) / (1 - FIT_MARGIN) };
}

/** A way a camera could hang: where, on what, and how high (the first height is tried first). */
interface Mount {
  pos: V2;
  heights: number[];
  mount: 'pole' | 'wall';
  /** The building whose wall it hangs on (index into street.buildings), -1 for a pole. */
  on: number;
  /** How much less it is wanted for where it hangs (a pole in the middle of nowhere). */
  cost: number;
}

/** The pose at a mount that holds a set of points, looking as far up the street as they leave room for. */
function poseFor(m: Mount, height: number, pts: readonly Mark[], spot: V2): CameraPose | null {
  const o: P3 = { x: m.pos[0], y: m.pos[1], z: height };
  const got = fit(o, pts);
  if (!got || got.tv > Math.tan((FOV_MAX / 2) * DEG) + 1e-9) return null;
  const tv = Math.max(got.tv, Math.tan((FOV_MIN / 2) * DEG));
  // What the lens leaves over above and below is used to bring the spot to the middle of the picture's height.
  const l = lensAt(o, got.f, tv);
  const spare = tv * (1 - FIT_MARGIN) - got.halfV;
  const lift = clamp(see(l, spot, 0.9).y * tv - SPOT_Y * tv, -spare, spare);
  let f = unit3(got.f.x + l.u.x * lift, got.f.y + l.u.y * lift, got.f.z + l.u.z * lift);
  // Never level or upwards: a street camera looks down at its street.
  const least = -Math.sin(8 * DEG);
  if (f.z > least) {
    const k = Math.cos(8 * DEG) / (Math.hypot(f.x, f.y) || 1);
    f = { x: f.x * k, y: f.y * k, z: least };
  }
  // The target: the point of the axis nearest to the spot, or where the axis meets the ground before that.
  let t = Math.max(4, (spot[0] - o.x) * f.x + (spot[1] - o.y) * f.y + (0.9 - o.z) * f.z);
  if (o.z + f.z * t < 0) t = o.z / -f.z;
  return {
    pos: m.pos,
    height,
    target: [o.x + f.x * t, o.y + f.y * t],
    targetHeight: o.z + f.z * t,
    fov: (2 * Math.atan(tv)) / DEG,
    mount: m.mount,
  };
}

/**
 * How much of what matters a camera misses (0: everything is in the picture; the smaller the better; Infinity: no
 * picture at all). The parts, from the weightiest: the people at the spot, readable; the stretch of road the first
 * crews stop on, from each end they can come from, with the first crew's car whole; the door; not looking down on
 * heads; a long stretch of street rather than a close-up. `vis` says which marks the lens has a free line to.
 */
function rate(sub: Subject, vis: readonly boolean[], c: CameraPose, mountCost: number): number {
  const l = lensOf(c);
  const { spot, drive } = sub.place;
  const marks = sub.marks;
  const sees = (i: number, margin: number) => vis[i] && framed(see(l, marks[i].p, marks[i].h), margin);
  const mid = see(l, spot, 0.9);
  if (!framed(mid, 0.2)) return Infinity;
  let cost = mountCost;
  for (const i of sub.group) if (!sees(i, 0.08)) cost += 0.8;

  // The spot near the middle of the picture, not at its edge.
  cost += Math.max(0, Math.abs(mid.y - SPOT_Y) - 0.3) * 1.2 + Math.max(0, Math.abs(mid.x) - 0.45) * 0.8;
  // A standing adult's share of the picture's height: readable at least, and the larger the better up to a point.
  const person = (see(l, spot, 1.75).y - see(l, spot, 0).y) / 2;
  if (person < 0.09) cost += (0.09 - person) * 150;
  if (person > 0.2) cost += (person - 0.2) * 12;
  cost -= (Math.min(person, 0.15) - 0.09) * 8;
  const d = dist(c.pos, spot);
  const steep = Math.atan2(c.height - 0.9, d) / DEG;
  if (steep > 55) return Infinity;
  if (steep > 36) cost += (steep - 36) * 0.15;
  if (d < 10) cost += (10 - d) * 0.3;

  // The road: each end's stretch with its car, and how far beyond the picture goes.
  let beyond = 0;
  const seenK = new Set<number>();
  for (const x of sub.road) {
    if (!sees(x.i, 0.1)) continue;
    seenK.add(x.k);
    if (Math.abs(x.k) > STOP_BEFORE_M) beyond++;
  }
  for (const fromA of [true, false]) {
    const lo = fromA ? -STOP_BEFORE_M : -STOP_PAST_M;
    const hi = fromA ? STOP_PAST_M : STOP_BEFORE_M;
    let n = 0;
    let seen = 0;
    for (const x of sub.road) {
      if (x.k < lo || x.k > hi) continue;
      n++;
      if (seenK.has(x.k)) seen++;
    }
    const miss = n ? 1 - seen / n : 0;
    if (!comesFrom(drive, fromA)) {
      cost += miss * 0.4;
      continue;
    }
    cost += miss * 3;
    const car = fromA ? sub.carA : sub.carB;
    if (!car) continue;
    let inside = 0;
    for (const i of car) if (sees(i, 0.03)) inside++;
    if (inside < car.length) cost += 0.5 + 2.5 * (1 - inside / car.length);
  }
  cost -= beyond * 0.03;

  // The place's own door at the scene comes before what stands before the place.
  for (const i of sub.door) if (!sees(i, 0.03)) cost += sub.ownNear ? 1.5 : 1;
  // What says which place this is: the first of what stands before it (the canopy, the bays) weighs nearly as much as
  // the road the crews stop on, the own front's door as much as a door at the scene.
  sub.extra.forEach((i, k) => {
    if (!sees(i, 0.02)) cost += k === sub.ownDoor ? 1 : k === 0 ? 2.5 : 0.7;
  });
  // The place's board, next to the people at the spot: in the middle four fifths of the picture, large enough to
  // read, on a wall the lens does not look along.
  if (sub.board.length && sub.boardOut) {
    const m = marks[sub.board[0]];
    const q = see(l, m.p, m.h);
    let miss = 0;
    if (!vis[sub.board[0]] || !framed(q, 0.2)) miss += BOARD_COST;
    else miss += clamp((BOARD_SHARE - 1 / (2 * q.z * l.tv)) * 60, 0, BOARD_COST) + Math.max(0, SQUARE_ON - facingOf(c, m.p, sub.boardOut)) * 3;
    for (const i of sub.board.slice(1)) if (!sees(i, 0.04)) miss += BOARD_END_COST;
    // Never worth more than a wall right before the lens is (wallCost).
    cost += Math.min(miss, BOARD_MAX);
  }
  // A door seen along its own wall is a sliver: a camera across the way shows who comes out of it.
  const { door, doorOut } = sub.place;
  if (sub.door.length && door && doorOut) cost += Math.max(0, SQUARE_ON - facingOf(c, door, doorOut)) * 3;
  if (c.fov > 56) cost += (c.fov - 56) * 0.04;
  return cost;
}

/**
 * How much of a picture is houses instead of street: rays through a grid over the frame, each followed to the
 * ground or to the first house. A wall or a roof right before the lens weighs most; then the lower part of the
 * picture, where the street should be. Added to a camera's `rate`. `strict`: for a place's camera (see below).
 */
function shutIn(g: Ground, c: CameraPose, strict: boolean): number {
  const l = lensOf(c);
  let rays = 0;
  let near = 0;
  let low = 0;
  let lowGround = 0;
  for (let ix = -2; ix <= 2; ix++) {
    for (let iy = -2; iy <= 2; iy++) {
      const gx = ix * 0.44 * l.th;
      const gy = iy * 0.44 * l.tv;
      const dx = l.f.x + l.r.x * gx + l.u.x * gy;
      const dy = l.f.y + l.r.y * gx + l.u.y * gy;
      const dz = l.f.z + l.r.z * gx + l.u.z * gy;
      const h = Math.hypot(dx, dy);
      if (h < 1e-6) continue;
      rays++;
      const slope = dz / h;
      const toGround = slope < 0 ? c.height / -slope : Infinity;
      const house = g.houseAhead(c.pos, c.height, [dx / h, dy / h], slope, Math.min(toGround, 70));
      if (house < 5) near++;
      if (iy <= 0) {
        low++;
        if (house === Infinity && toGround < Infinity) lowGround++;
      }
    }
  }
  if (!rays || !low) return 0;
  // In a lane between house fronts every picture is half walls: this tells cameras at one place apart, no more.
  const cost = Math.min(1.5, (near / rays) * 3 + Math.max(0, 0.75 - lowGround / low));
  // Where a camera is also asked to show a place's own front, a wall or a roof right before the lens over more than
  // a fifth of the picture is worse than a door or a board it misses: there it weighs on without a cap.
  return strict ? cost + Math.max(0, near / rays - 0.2) * 8 : cost;
}

/** A wall, a roof or a canopy nearer the lens than this is right before it. */
export const NEAR_COVER_M = 8;
/** No camera is taken whose picture is more than this share such a wall or roof, while the street has another. */
export const NEAR_COVER_MAX = 0.15;
/** The same as cameras are sorted by it, on a coarser grid of rays: a little under, so that the fine grid agrees. */
const COVER_LIMIT = 0.12;

/**
 * The share of a camera's picture that a wall, a roof or a canopy nearer than 8 m from the lens takes up, as
 * src/cctv/render/world.ts builds them from the street (a grid of rays through the frame, each followed 8 m).
 */
export function nearCover(street: StreetData, camera: CameraPose, cols = 32, rows = 18): number {
  return new Ground(street).cover(camera, NEAR_COVER_M, cols, rows);
}

/** Is a road of the street a piece of the drive line? */
function sameRoad(o: Road, drive: DriveLine): boolean {
  const mid = pointAlong(o.pts, lineLength(o.pts) / 2).pt;
  return nearestOnLine(mid, drive.pts).d < 0.5 && nearestOnLine(o.pts[0], drive.pts).d < 0.5;
}

/**
 * A camera's pole stands this far from any house wall at the least: what hangs on a wall (a balcony, a canopy over a
 * door, an awning: the renderer's own, not in the street data) reaches a metre and a bit out of it. Nearer a wall
 * than this the camera hangs on the wall itself.
 */
const POLE_ROOM_M = 1.6;

/** A wall across from the place's board is looked for this far before it. */
const FRONT_VIEW_M = 30;

/**
 * Where cameras could hang around a place: poles at both kerbs along the road, walls, poles on open ground, and
 * across from the place's board (`board`: where it hangs and the way out of its wall).
 */
function mountsFor(g: Ground, place: Place, r: Rand, board: { at: V2; out: V2 } | null): Mount[] {
  const { drive, spot, side } = place;
  const street = g.street;
  const out: Mount[] = [];
  const low = r.range(5, 6);
  const high = r.range(6.6, 7.8);
  const edge = drive.width / 2;
  const others = street.roads.filter((o) => CAR_ROADS.has(o.cls) && o.pts.length > 1 && !sameRoad(o, drive));
  const onRoad = (p: V2, room: number, kerb: boolean) =>
    (!kerb && nearestOnLine(p, drive.pts).d < edge + room) || others.some((o) => nearestOnLine(p, o.pts).d < o.width / 2 + room);
  const pole = (p: V2, cost: number, kerb: boolean) => {
    if (g.wallDist(p, POLE_ROOM_M) < POLE_ROOM_M || g.roofed(p) || onRoad(p, 0.3, kerb)) return;
    out.push({ pos: p, heights: [low, high], mount: 'pole', on: -1, cost });
  };
  const wall = (p: V2, index: number, cost: number) => {
    const top = street.buildings[index].height - 0.3;
    if (top < 3.6 || g.wallDist(p, 0.3) < 0.3) return;
    const a = Math.min(top, low - 0.4);
    const b = Math.min(top, high - 0.2);
    out.push({ pos: p, heights: b - a > 0.8 ? [a, b] : [a], mount: 'wall', on: index, cost });
  };

  // 1. At a kerb, some way along the road: the far kerb first. Where a house stands at the road's edge, on its wall
  // (on an arm a metre long where the lane has room for one: less of the picture is the camera's own wall).
  for (const ks of [-side, side]) {
    for (const far of [8, 11, 14, 18, 22, 26, 31]) {
      for (const sign of [1, -1]) {
        const s = drive.at + sign * far;
        if (s < 0.5 || s > drive.length - 0.5) continue;
        const c = pointAlong(drive.pts, s);
        const n = mul(left(c.dir), ks);
        const want = edge + (ks === side ? 0.9 : 1.1);
        const hit = g.reach(c.pt, n, want + POLE_ROOM_M);
        const base = ks === side ? 0.15 : 0;
        if (hit.index < 0) {
          const p = along(c.pt, n, want);
          // In water only where the road itself is over it (a bridge's railing).
          if (!g.water(p) || g.water(c.pt)) pole(p, base, true);
        } else if (hit.d > 1.2) wall(along(c.pt, n, hit.d - (hit.d > 1.8 ? 1 : 0.45)), hit.index, base + 0.05);
      }
    }
  }
  // 2. On the walls around: the nearest point of each house and its nearest corners; the nearest two dozen of them.
  const walls: { p: V2; index: number; d: number; cost: number }[] = [];
  street.buildings.forEach((b, i) => {
    if (!solid(b) || b.height < 4 || b.ring.length < 3) return;
    const n = nearestOnRing(spot, b.ring);
    if (n.d > 30) return;
    if (n.d >= 7) walls.push({ p: along(n.pt, n.normal, 0.45), index: i, d: n.d, cost: 0.1 });
    const ccw = ringArea(b.ring) > 0;
    const corners: { p: V2; d: number }[] = [];
    for (let k = 0; k < b.ring.length; k++) {
      const v = b.ring[k];
      const dv = dist(v, spot);
      if (dv < 8 || dv > 30) continue;
      const e0 = norm(sub(v, b.ring[(k + b.ring.length - 1) % b.ring.length]));
      const e1 = norm(sub(b.ring[(k + 1) % b.ring.length], v));
      // Outward: to the right of an anticlockwise edge.
      const o0: V2 = ccw ? [e0[1], -e0[0]] : [-e0[1], e0[0]];
      const o1: V2 = ccw ? [e1[1], -e1[0]] : [-e1[1], e1[0]];
      corners.push({ p: along(v, norm([o0[0] + o1[0], o0[1] + o1[1]]), 0.5), d: dv });
    }
    corners.sort((x, y) => x.d - y.d);
    for (const c of corners.slice(0, 2)) walls.push({ p: c.p, index: i, d: c.d, cost: 0.15 });
  });
  walls.sort((x, y) => x.d - y.d);
  for (const w of walls.slice(0, 24)) wall(w.p, w.index, w.cost);
  // 3. A pole on open ground around the spot (a car park, a park, a forecourt).
  const a0 = r.range(0, Math.PI * 2);
  for (const rad of [13, 18, 24]) {
    for (let k = 0; k < 10; k++) {
      const a = a0 + (k * Math.PI) / 5 + rad;
      const p: V2 = [spot[0] + Math.cos(a) * rad, spot[1] + Math.sin(a) * rad];
      if (!g.water(p)) pole(p, 0.45, false);
    }
  }
  // 4. Across from the place's board, straight before it and some way to each side: on the wall that faces it (a
  // lane's camera then looks at the front, not along the lane from its far end), or on a pole where the ground
  // before the front is open.
  if (board) {
    const e = left(board.out);
    for (const k of [0, 7, -7, 11, -11, 15, -15]) {
      const from = along(along(board.at, board.out, 0.6), e, k);
      const hit = g.reach(from, board.out, FRONT_VIEW_M);
      if (hit.index >= 0) {
        if (hit.d > 1.6) wall(along(from, board.out, hit.d - (hit.d > 2.4 ? 1 : 0.45)), hit.index, 0.05);
      } else {
        for (const d of [12, 17, 23]) {
          const p = along(from, board.out, d);
          if (!g.water(p)) pole(p, 0.2, false);
        }
      }
    }
  }
  return out;
}

/**
 * A camera for a place: how much it misses, whether a wall or a roof right before its lens takes too much of its
 * picture, and whether the place's board is in its picture (`shown`; `gone`: the place has a board and it is not).
 */
interface Pick {
  camera: CameraPose;
  cost: number;
  walled: boolean;
  shown: boolean;
  gone: boolean;
}

/**
 * What a camera costs that has too much wall right before its lens: at once more than the place's board out of the
 * middle of the picture does, and with every further tenth of the picture more than a place on the next road; a few
 * hundredths over the limit cost less than the first crew's car out of the picture. So a camera with a free picture
 * is taken wherever the street has one that shows the story, and in a lane too narrow for any (its own house fronts
 * are nearer than 8 m on both sides) the one with the least wall for what it shows.
 */
const WALLED_COST = 1.9;
const COVER_COST = 30;
const wallCost = (share: number) => (share <= COVER_LIMIT ? 0 : WALLED_COST + (share - COVER_LIMIT) * COVER_COST);
/**
 * The same for a camera that has the place's board in its picture and too much wall for a free picture: every tenth
 * of the picture that is another house's wall costs a third of that, and the place's own front costs nothing (it is
 * what the picture is there to show). In a lane the camera that shows the place looks at its front from near by.
 */
const SHOWN_COVER_COST = 10;
const shownWallCost = (others: number) => WALLED_COST + Math.max(0, others - COVER_LIMIT) * SHOWN_COVER_COST;

/** What a camera without the place's own wishes costs beside one with them (it may miss the front and what stands before it). */
const NO_WISH_COST = 4;
/**
 * What a camera costs that leaves the place's board out of its picture (behind the lens, outside the frame, behind a
 * house), beside one at another place that has it: more than the scene a dozen metres further along the road, less
 * than a scene that is not before the front at all.
 */
const BOARD_GONE_COST = 4;
/** A board is in the picture with its middle and both ends this far inside the frame's sides and under the recorder's text. */
const BOARD_IN_X = 0.93;
const BOARD_IN_TOP = 0.8;
const BOARD_IN_FOOT = -0.9;
/** And seen at least this squarely (src/cctv/render/place.ts hangs no board flat on a wall the camera sees less squarely). */
const BOARD_FACING = 0.3;
/** And a metre of it at least this share of the picture's height. */
const BOARD_SHARE_MIN = 0.03;
/** Seen from the wall's outer side at least this squarely, the front is in the picture as a sliver: something of the place. */
const FRONT_FACING = 0.1;

/** How much of the place's board a camera has: all of it readably, its middle on a front seen from the side, or nothing. */
type BoardSeen = 'shown' | 'glimpsed' | 'gone';

/**
 * How a camera has the stretch of the front the place's board hangs on: `shown` with its middle and both ends in the
 * picture, nothing before them, seen squarely enough to read and large enough; `glimpsed` with its middle in the
 * picture from the wall's outer side. `vis`: whether the lens has a free line to each of the board's three marks.
 */
function boardSeen(sub: Subject, vis: readonly boolean[], c: CameraPose): BoardSeen {
  if (!sub.board.length || !sub.boardOut || !vis[0]) return 'gone';
  const l = lensOf(c);
  const inside = (i: number) => {
    const m = sub.marks[sub.board[i]];
    const q = see(l, m.p, m.h);
    return q.z > 0.5 && Math.abs(q.x) <= BOARD_IN_X && q.y >= BOARD_IN_FOOT && q.y <= BOARD_IN_TOP ? q : null;
  };
  const mid = inside(0);
  const facing = facingOf(c, sub.marks[sub.board[0]].p, sub.boardOut);
  if (!mid || facing < FRONT_FACING) return 'gone';
  const whole = vis[1] && vis[2] && inside(1) !== null && inside(2) !== null;
  return whole && facing >= BOARD_FACING && 1 / (2 * mid.z * l.tv) >= BOARD_SHARE_MIN ? 'shown' : 'glimpsed';
}

/**
 * The best camera for a place and how much it misses, or null when nothing around has a free line to the spot.
 *
 * For a place with a board (its own building's front is near the scene) the cameras are taken in this order: one that
 * has the board in its picture and no wall or roof right before its lens over more than a seventh of the picture;
 * then one that has the board and the least wall for what it shows; and only when no camera about the place has the
 * board, the best of the rest (`wallCost`): the next best of the place's own, or the best one made without the
 * place's wishes (as for a plain street). Never one that hangs on the place's own building without the board in its
 * picture, while the street has another.
 */
function placeCamera(g: Ground, place: Place, seed: number, own: Own | null): Pick | null {
  const mine = camerasFor(g, place, seed, own, true);
  if (!mine || !own || mine.shown || !mine.walled) return mine;
  const plain = camerasFor(g, place, seed, own, false);
  return plain && plain.cost + NO_WISH_COST < mine.cost ? { ...plain, cost: plain.cost + NO_WISH_COST } : mine;
}

/** A camera at a mount as it is chosen among: what it misses, and how much of the place's board is in its picture. */
interface Cand {
  camera: CameraPose;
  cost: number;
  m: Mount;
  board: BoardSeen;
}

const byCost = (a: { cost: number }, b: { cost: number }) => a.cost - b.cost;

/** `wishes`: the camera is asked to show what says which place this is (false: the story alone, as on a plain street). */
function camerasFor(g: Ground, place: Place, seed: number, own: Own | null, wishes: boolean): Pick | null {
  const r = rand(seed ^ 0x2545f491);
  const told = subjectOf(place, own);
  const subj = wishes ? told : subjectOf(place, null);
  const hasBoard = told.board.length > 0;
  const { spot, roadSpot, drive } = place;
  const marks = subj.marks;
  const fromA = comesFrom(drive, true);
  const fromB = comesFrom(drive, false);
  const stretch = (a: number, b: number): number[] => subj.road.filter((x) => x.k >= a && x.k <= b).map((x) => x.i);
  const all = stretch(fromA ? -STOP_BEFORE_M : -STOP_PAST_M, fromB ? STOP_BEFORE_M : STOP_PAST_M);
  const carA = subj.carA ?? [];
  const carB = subj.carB ?? [];
  const base = [...subj.group, ...subj.door];
  // What a lens is asked to hold: everything; then one end's stretch; then the spot with the road beside it; then the spot.
  const whole = [...base, ...all, ...subj.ends, ...carA, ...carB];
  const ends = fromA && fromB ? [[...base, ...stretch(-STOP_BEFORE_M, STOP_PAST_M), ...carA], [...base, ...stretch(-STOP_PAST_M, STOP_BEFORE_M), ...carB]] : [];
  const short = [...base, ...stretch(-STOP_PAST_M, STOP_PAST_M)];
  const sets: number[][] = [whole, ...ends, short, base, subj.group];
  // And first of all with what says which place this is: what stands before it, and its board.
  const says = [...subj.extra, ...subj.board];
  if (says.length) sets.unshift([...whole, ...says]);
  // The same story in smaller pieces with the board, for a mount where the whole story and the board do not fit one
  // lens: down to the people, the board and eight metres of road to one side of them (where a crew then stops,
  // src/cctv/director.ts `slot`), as a camera across a lane from the front has them.
  const boardSets = subj.board.length ? [...ends, short].map((set) => [...set, ...says]) : [];
  if (subj.board.length) {
    if (subj.extra.length) boardSets.push([...short, ...subj.board]);
    boardSets.push([...base, ...stretch(-STOP_PAST_M, 2), ...subj.board], [...base, ...stretch(-2, STOP_PAST_M), ...subj.board]);
  }

  /** The poses at a mount and height that are worth a look: the best one, and the best with the place's board when that one is without it. */
  const best = (m: Mount, height: number): Cand[] => {
    if (!g.sight(m.pos, height, spot, 0.9)) return [];
    // The people at the spot are held whether or not something stands before one of them.
    const free = (x: Mark) => g.sight(m.pos, height, x.from ?? x.p, x.h + 0.3);
    const vis = marks.map((x, i) => i < subj.group.length || free(x));
    const boardVis = told.board.map((i) => free(told.marks[i]));
    const pose = (set: readonly number[]): Cand | null => {
      const camera = poseFor(m, height, set.filter((i) => vis[i]).map((i) => marks[i]), spot);
      if (!camera) return null;
      const cost = rate(subj, vis, camera, m.cost);
      return cost < Infinity ? { camera, cost, m, board: boardSeen(told, boardVis, camera) } : null;
    };
    let out: Cand | null = null;
    let tried = 0;
    for (const set of sets) {
      const got = pose(set);
      if (!got) continue;
      if (!out || got.cost < out.cost) out = got;
      // The first set that fits is the fullest; one more is tried in case its picture is the better one.
      if (++tried >= 2) break;
    }
    if (!out || out.board === 'shown' || !boardSets.length || !boardVis.every((v) => v)) return out ? [out] : [];
    for (const set of boardSets) {
      const got = pose(set);
      if (got && got.board === 'shown') return [out, got];
    }
    return [out];
  };

  const board = subj.board.length && subj.boardOut ? { at: along(marks[subj.board[0]].p, subj.boardOut, -0.3), out: subj.boardOut } : null;
  let found: Cand[] = [];
  for (const m of mountsFor(g, place, r, board)) {
    const d = dist(m.pos, spot);
    if (d < 7 || d > 40 || g.inside(m.pos) >= 0 || !g.clear(m.pos, spot) || !g.clear(m.pos, roadSpot)) continue;
    found.push(...best(m, m.heights[0]));
  }
  // Not on the place's own building, looking away from its front: only where nothing else has a line to the spot.
  if (own && own.index >= 0) {
    const off = found.filter((x) => x.m.on !== own.index || x.board === 'shown');
    if (off.length) found = off;
  }
  if (DBG && wishes) {
    DBG.push(` cams at spot ${spot.map((v) => v.toFixed(1))} board=${board ? board.at.map((v) => v.toFixed(1)) + ' out ' + board.out.map((v) => v.toFixed(2)) : '-'}`);
    for (const x of found) {
      const q = board ? see(lensOf(x.camera), board.at, BOARD_H_M) : null;
      DBG.push(`   ${x.m.mount} on=${x.m.on} at ${x.m.pos.map((v) => v.toFixed(1))} h=${x.camera.height.toFixed(1)} fov=${x.camera.fov.toFixed(0)} cost=${x.cost.toFixed(2)} board=${x.board} facing=${board ? facingOf(x.camera, board.at, board.out).toFixed(2) : ''} q=${q ? `${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(1)}` : ''} cover=${(g.cover(x.camera, NEAR_COVER_M, 16, 9) * 100).toFixed(0)} others=${(g.cover(x.camera, NEAR_COVER_M, 16, 9, own ? own.index : -1) * 100).toFixed(0)}`);
    }
  }
  if (!found.length) return null;
  found.sort(byCost);
  // The best few are looked at more closely: at their other height, for a picture that is mostly a wall right
  // before the lens, and for one without a door in it (where a house is near enough to have one).
  const farDoor = place.door !== null && !subj.door.length;
  const closer = (c: CameraPose, strict: boolean) => {
    let cost = shutIn(g, c, strict);
    if (farDoor) {
      const mine = own && own.index >= 0 ? seenDoor(g, c, spot, own.index) : null;
      const d = mine ?? seenDoor(g, c, spot);
      cost += d ? Math.max(0, SQUARE_ON - facingOf(c, d.door, d.out)) * 1.5 : 0.5;
      // The place's own building has no wall in the picture a door could be on.
      if (own && own.index >= 0 && !mine) cost += 1.5;
    }
    return cost;
  };
  /** A mount's cameras at both its heights, looked at closely. */
  const both = (x: Cand, strict: boolean): Cand[] => {
    const other = x.m.heights.length > 1 ? best(x.m, x.m.heights[1]).filter((y) => (y.board === 'shown') === (x.board === 'shown')) : [];
    return [x, ...other].map((y) => ({ ...y, cost: y.cost + closer(y.camera, strict) }));
  };
  const cover = (c: CameraPose) => g.cover(c, NEAR_COVER_M, 16, 9);
  /** The same without the place's own building. */
  const others = (c: CameraPose) => g.cover(c, NEAR_COVER_M, 16, 9, own ? own.index : -1);
  const pick = r();
  /**
   * The seed chooses among those as good as the best, so that cameras differ from place to place. A camera taken as
   * free is looked at once more on a fine grid of rays: if that finds the wall after all, it pays for it (`pay`) and
   * the choice is made again. `freeFirst`: a camera with a free picture comes before every one without.
   */
  const choose = (all: Pick[], pay: (c: CameraPose, share: number) => number, freeFirst: boolean): Pick => {
    for (let k = 0; k < 6; k++) {
      const free = freeFirst ? all.filter((x) => !x.walled) : [];
      const top = (free.length ? free : all).sort(byCost);
      const equal = top.filter((x) => x.cost <= top[0].cost + 0.3);
      const got = equal[Math.min(equal.length - 1, Math.floor(pick * equal.length))];
      const share = got.walled ? 0 : g.cover(got.camera, NEAR_COVER_M, 32, 18);
      if (share <= NEAR_COVER_MAX) return got;
      got.walled = true;
      got.cost += pay(got.camera, Math.max(share, COVER_LIMIT));
    }
    return all.sort(byCost)[0];
  };

  // The cameras that have the place's board in their picture come before all others: one with a free picture, else
  // the one with the least wall for what it shows.
  const showing = found.filter((x) => x.board === 'shown');
  if (showing.length) {
    const top = showing
      .slice(0, 12)
      .flatMap((x) => both(x, false))
      .map((x): Pick => {
        const walled = cover(x.camera) > COVER_LIMIT;
        return { camera: x.camera, cost: x.cost + (walled ? shownWallCost(others(x.camera)) : 0), walled, shown: true, gone: false };
      });
    return choose(top, (c) => shownWallCost(others(c)), true);
  }

  // No camera has the board: one with a glimpse of the front it hangs on before one without.
  const gone = (x: Cand) => hasBoard && x.board === 'gone';
  const full = (x: Cand) => x.cost + (gone(x) ? BOARD_GONE_COST : 0);
  const byFull = (a: Cand, b: Cand) => full(a) - full(b);
  const walled = (x: Cand): Pick => {
    const share = cover(x.camera);
    return { camera: x.camera, cost: full(x) + wallCost(share), walled: share > COVER_LIMIT, shown: false, gone: gone(x) };
  };
  // The best few by what they show, each with what the wall before it costs: looked at for as long as one further
  // down could still be the best.
  const strict = own !== null;
  const rest = found.slice().sort(byFull);
  const top: Pick[] = [];
  let least = Infinity;
  for (const x of rest.slice(0, 8).flatMap((y) => both(y, strict)).sort(byFull)) {
    if (full(x) > least + 0.3) break;
    const y = walled(x);
    top.push(y);
    least = Math.min(least, y.cost);
  }
  top.sort(byCost);
  // Every one of the best looks into a wall: the first of the rest that does not comes in beside them.
  if (top[0].walled) {
    for (const x of rest.slice(8)) {
      const free = both(x, strict).map(walled).filter((y) => !y.walled).sort(byCost)[0];
      if (!free) continue;
      top.push(free);
      break;
    }
  }
  return choose(top, (_, share) => wallCost(share), false);
}

/**
 * Would something standing at `p` (a pole, a column, a sign) stand in the camera's picture closer than `reach` metres?
 * Real cameras are aimed past such things; the street is built so that nothing near blocks the view. The test is on
 * the ground plan: in front of the lens and inside the horizontal field of view, with a margin for the thing's width.
 */
export function blocksView(camera: CameraPose, p: V2, reach = 15, margin = 0.9): boolean {
  const dir = norm(sub(camera.target, camera.pos));
  const d = sub(p, camera.pos);
  const ahead = d[0] * dir[0] + d[1] * dir[1];
  if (ahead < -0.5 || ahead > reach) return false;
  const half = Math.atan(Math.tan(((camera.fov / 2) * Math.PI) / 180) * (16 / 9));
  const across = Math.abs(d[0] * dir[1] - d[1] * dir[0]);
  return across < Math.max(0, ahead) * Math.tan(half) + margin;
}

function placeLamps(street: StreetData, drive: DriveLine, side: 1 | -1, camera: CameraPose, walk: boolean): Lamp[] {
  const lamps: Lamp[] = [];
  const main = drive.cls === 'trunk' || drive.cls === 'primary' || drive.cls === 'secondary' || drive.cls === 'motorway';
  // A main road out of town (no pavements) is unlit, but for a lamp or two where another road joins it.
  const rural = main && !walk;
  const touches = (q: V2) => nearestOnLine(q, drive.pts).d < drive.width / 2 + 2;
  const joins: number[] = [];
  if (rural) {
    for (const o of street.roads) {
      if (!CAR_ROADS.has(o.cls) || o.pts.length < 2) continue;
      const ends = [o.pts[0], o.pts[o.pts.length - 1]];
      // A road that meets the drive line with one end and leaves it with the other (not a piece of the drive line itself).
      for (const [q, other] of [[ends[0], ends[1]], [ends[1], ends[0]]]) {
        if (!touches(q) || touches(other)) continue;
        const n = nearestOnLine(q, drive.pts);
        if (n.s > 1 && n.s < drive.length - 1) joins.push(n.s);
      }
    }
  }
  const gap = main ? 34 : 30;
  const height = main ? 8.5 : drive.cls === 'path' || drive.cls === 'pedestrian' ? 4.5 : 6.5;
  // One stands near the incident, the rest at the same spacing both ways; narrow streets have them on one side.
  let k = 0;
  for (let s = drive.at - 8 - gap * 3; s <= drive.at + gap * 4; s += gap, k++) {
    if (s < 2 || s > drive.length - 2) continue;
    const lampSide = drive.width > 6.2 ? (k % 2 ? 1 : -1) : -side;
    const p = onDrive(drive, s, lampSide * (drive.width / 2 + 0.7));
    if (insideBuilding(street, p.pos) >= 0) continue;
    if (rural && !joins.some((j) => Math.abs(j - s) < gap / 2)) continue;
    // A petrol station's forecourt is lit by its canopy, not by street lamps among the pumps.
    if (street.buildings.some((b) => b.open && b.area > 80 && (pointInRing(p.pos, b.ring) || nearestOnRing(p.pos, b.ring).d < 7))) continue;
    // Not right in front of the camera's lens, nor across its view of what it watches.
    if (dist(p.pos, camera.pos) < 4.5 || nearestOnSegment(p.pos, camera.pos, camera.target).d < 1.5 || blocksView(camera, p.pos)) continue;
    lamps.push({ pos: p.pos, height, yaw: yawOf(mul(left(p.dir), -lampSide)) });
  }
  return lamps;
}

// ------------------------------------------------------------------------------------------------ the place

/**
 * How wide the carriageway really is about a point of a road: the map gives every road of a class the same width,
 * but an old town's lane runs between house fronts closer together than that. Null where a house stands on the
 * road itself within `near` metres of the point (an archway, a passage: no scene is played under one).
 */
function freeWidth(g: Ground, pts: readonly V2[], length: number, s: number, width: number, near: number): number | null {
  let half = width / 2;
  if (DBG) {
    const row: string[] = [];
    for (let k = -16; k <= 16; k += 2) {
      const t = s + k;
      if (t < 0 || t > length) continue;
      const c = pointAlong(pts, t);
      const n = left(c.dir);
      row.push(`${g.reach(c.pt, n, 8).d.toFixed(1)}/${g.reach(c.pt, mul(n, -1), 8).d.toFixed(1)}`);
    }
    DBG.push(`  width ${width} s=${s.toFixed(0)}: ${row.join(' ')}`);
  }
  for (let k = -16; k <= 16; k += 2) {
    const t = s + k;
    if (t < 0 || t > length) continue;
    const c = pointAlong(pts, t);
    const n = left(c.dir);
    for (const sign of [1, -1]) {
      const d = g.reach(c.pt, mul(n, sign), width / 2 + 0.1).d;
      if (Math.abs(k) <= near && d < PINCH_M) return null;
      if (d < half) half = d;
    }
  }
  return Math.max(MIN_WIDTH_M, half * 2);
}

/**
 * The walking lines along both sides of a drive line: `off` metres from its centre line, nearer where a house front
 * leaves less (a lane without pavements: people walk at the wall, inside the lane). Followed closely within 34 m of
 * the scene, by the line's own corners beyond that.
 */
function walkLines(g: Ground, drive: DriveLine, off: number): { left: V2[]; right: V2[] } {
  const stations: { c: V2; n: V2; k: number; corner: boolean }[] = [];
  let run = 0;
  const pts = drive.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = i > 0 ? norm(sub(pts[i], pts[i - 1])) : null;
    const b = i < pts.length - 1 ? norm(sub(pts[i + 1], pts[i])) : null;
    let n: V2;
    let k = 1;
    if (a && b) {
      n = norm([left(a)[0] + left(b)[0], left(a)[1] + left(b)[1]]);
      // A sharp corner would shoot the mitre far out: cap it (as math.ts offsetLine).
      k = 1 / Math.max(0.5, dot(n, left(a)));
    } else n = left((a ?? b)!);
    stations.push({ c: pts[i], n, k, corner: true });
    if (!b) break;
    const l = dist(pts[i], pts[i + 1]);
    // Between corners, a station every metre and a half where the scene is.
    const from = Math.max(run + 0.75, drive.at - 34);
    const to = Math.min(run + l - 0.75, drive.at + 34);
    for (let s = Math.ceil(from / 1.5) * 1.5; s <= to; s += 1.5) stations.push({ c: along(pts[i], b, s - run), n: left(b), k: 1, corner: false });
    run += l;
  }
  const line = (sign: 1 | -1): V2[] => {
    const lat = stations.map((st) => {
      const n = mul(st.n, sign);
      const want = off * st.k;
      let d = Math.min(want, g.reach(st.c, n, want + WALL_ROOM_M).d - WALL_ROOM_M + 0.1);
      while (d > 0.3 && g.wallDist(along(st.c, n, d), WALL_ROOM_M - 0.2) < WALL_ROOM_M - 0.2) d -= 0.3;
      return Math.max(0, d);
    });
    const out: V2[] = [];
    stations.forEach((st, i) => {
      // No further out than its neighbours: a line that keeps its distance from a ragged row of fronts.
      let d = lat[i];
      if (!st.corner) for (let j = Math.max(0, i - 2); j <= Math.min(stations.length - 1, i + 2); j++) if (!stations[j].corner && lat[j] < d) d = lat[j];
      out.push(along(st.c, st.n, sign * d));
    });
    // Stations on a straight run say nothing: drop them.
    const slim: V2[] = [];
    out.forEach((p, i) => {
      const prev = slim[slim.length - 1];
      const next = out[i + 1];
      if (prev && next && !stations[i].corner && nearestOnSegment(p, prev, next).d < 0.02) return;
      slim.push(p);
    });
    return slim;
  };
  return { left: line(1), right: line(-1) };
}

/** A place tried for the scene: a drive line, how far along it, which side. */
interface Try {
  /** Which drive line (they are numbered as they are found). */
  line: number;
  pts: V2[];
  length: number;
  deadA: boolean;
  deadB: boolean;
  /** Where a house stands on the line (`wallsOn`). */
  walls: readonly number[];
  road: Road;
  s: number;
  side: 1 | -1;
  /** How far from the road's centre line the spot is wanted: the incident's own distance, or null for the kerb. */
  own: number | null;
  /** Across the road from the incident. */
  other: boolean;
  /** How much less the place is wanted for being away from where the incident is. */
  penalty: number;
}

/**
 * A site with its cost, and whether its camera is a poor one for the place: it looks into a wall right before its
 * lens, or it leaves the place's board out of its picture.
 */
interface Built {
  site: Site;
  cost: number;
  poor: boolean;
}

/** The site at a place with its cost (the place's own and what its best camera misses), or null when the place does not hold. */
let WHY = 0;
const why = (k: number): null => {
  WHY = k;
  return null;
};
function siteAt(g: Ground, t: Try, seed: number, own: Own | null): Built | null {
  const street = g.street;
  const c = pointAlong(t.pts, t.s);
  const roadSpot = c.pt;
  const dir = c.dir;
  if (g.inside(roadSpot) >= 0) return why(1);
  const width = freeWidth(g, t.pts, t.length, t.s, t.road.width, 16);
  if (width === null) return why(2);
  // A house on the road further along (an archway, a passage the map draws as a house): the road ends before it,
  // and nothing drives out of a wall.
  let from = 0;
  let to = t.length;
  for (const w of t.walls) {
    if (w < t.s) from = Math.max(from, w + WALL_STOP_M);
    else to = Math.min(to, w - WALL_STOP_M);
  }
  const cut = from > 0 || to < t.length;
  const at = t.s - from;
  const length = to - from;
  if (length < MIN_DRIVE_M || at < END_ROOM_M || length - at < END_ROOM_M) return why(3);
  const drive: DriveLine = {
    pts: cut ? sliceLine(t.pts, from, to) : t.pts,
    length,
    width,
    cls: t.road.cls,
    at,
    deadA: t.deadA || from > 0,
    deadB: t.deadB || to < t.length,
    oneway: t.road.oneway,
  };
  const edge = width / 2;
  const nrm = mul(left(dir), t.side);
  let cost = t.penalty;

  // Beside the road: on the pavement at least, at most a few metres in (a forecourt, a yard); never nearer a wall than
  // a person stands. Where the house fronts leave no pavement, at the wall inside the lane, out of a car's way.
  const pavementAt = edge + (t.road.walk && width >= t.road.width ? 1.4 : 1.7);
  const room = g.reach(roadSpot, nrm, edge + 10).d - WALL_ROOM_M;
  if (room < 1.2) return why(4);
  let lat = Math.min(room, t.own === null ? pavementAt + 0.6 : clamp(t.own, pavementAt, edge + 9));
  let spot = along(roadSpot, nrm, lat);
  // Not in water: nearer the road, down to the kerb (a quay, a bridge's pavement).
  while (g.water(spot) && lat > edge + 1.3) {
    lat = Math.max(edge + 1.3, lat - 1);
    spot = along(roadSpot, nrm, lat);
  }
  if (g.water(spot) && !(g.water(roadSpot) && lat <= edge + 1.5)) return why(5);
  if (g.wallDist(spot, 0.5) < 0.5) return why(6);
  // Not on a pump island, nor between its pumps.
  if (g.roofed(spot) && g.onIsland(spot)) return why(7);
  if (lat < edge + 1) cost += 1.2;
  // People in the mouth of another road are in the way there.
  if (street.roads.some((o) => CAR_ROADS.has(o.cls) && o.pts.length > 1 && !sameRoad(o, drive) && nearestOnLine(spot, o.pts).d < o.width / 2)) cost += 0.7;

  // The walking lines, and that they hold near the spot.
  const walkOff = edge + (t.road.walk && width >= t.road.width ? 1.3 : 1.5);
  const walks = walkLines(g, drive, walkOff);
  for (const line of [walks.left, walks.right]) {
    const n = nearestOnLine(spot, line);
    const end = Math.min(lineLength(line), n.s + 22);
    for (let s = Math.max(0, n.s - 22); s <= end; s += 0.5) if (g.inside(pointAlong(line, s).pt) >= 0) return why(8);
  }

  // The door people come out of: the own building's front door when the scene is before that front, else on the
  // nearest wall.
  let door: V2 | null = null;
  let doorOut: V2 | null = null;
  let doorBuilding = -1;
  const front = own?.front ?? null;
  const ownRing = own && own.index >= 0 ? street.buildings[own.index].ring : null;
  if (front) {
    const before = dot(front.out, sub(spot, front.door)) > 0.5 && nearestOnSegment(spot, front.a, front.b).d <= FRONT_NEAR_M && g.clear(spot, along(front.door, front.out, 0.5));
    if (!before) cost += OFF_FRONT_COST;
    else if (dist(front.door, spot) < DOOR_REACH_M) {
      door = front.door;
      doorOut = front.out;
      doorBuilding = own!.index;
    }
  } else if (ownRing && nearestOnRing(spot, ownRing).d > FRONT_NEAR_M) cost += OFF_FRONT_COST / 2;
  // What stands before the place (the canopy, the bays, the shelters) is where the scene belongs: not some way off
  // it, and not across the road from it.
  if (own && own.focus.length) {
    const at = own.focus.reduce((a, b) => (dist(b, spot) < dist(a, spot) ? b : a));
    if (dist(at, spot) > FOCUS_NEAR_M) cost += OFF_FRONT_COST / 2;
    if (t.pts.some((p, i) => i > 0 && segmentsCross(spot, at, t.pts[i - 1], p))) cost += OFF_FRONT_COST / 2;
  }
  if (!door) {
    let bestD = DOOR_REACH_M;
    street.buildings.forEach((b, i) => {
      if (!solid(b) || b.ring.length < 3) return;
      const n = nearestOnRing(spot, b.ring);
      // The own building's wall before another house's that is not much nearer.
      const d = n.d - (own && i === own.index ? 6 : 0);
      if (d < bestD && n.d < DOOR_REACH_M) {
        bestD = d;
        door = n.pt;
        doorOut = n.normal;
        doorBuilding = i;
      }
    });
  }

  const place: Place = { drive, roadSpot, dir, side: t.side, spot, door, doorOut, doorBuilding };
  const near = g.near(spot, CAMERA_REACH_M);
  const cam = placeCamera(near, place, seed, own);
  if (!cam) return why(9);
  const camera = cam.camera;
  // Where the door is some way off (the scene is not at it): the door is on the wall the camera sees best near the
  // spot, the own building's before any other, so that what happens at a door happens in the picture.
  if (door && dist(door, spot) > DOOR_NEAR_M && !(own && doorBuilding === own.index && doorOut && doorSeen(near, camera, door, doorOut))) {
    const other = (own && own.index >= 0 ? seenDoor(g, camera, spot, own.index) : null) ?? seenDoor(g, camera, spot);
    if (other) {
      door = other.door;
      doorOut = other.out;
      doorBuilding = other.index;
    }
  }
  const site: Site = {
    street,
    seed,
    spot,
    roadSpot,
    dir,
    side: t.side,
    drive,
    walkLeft: walks.left,
    walkRight: walks.right,
    door,
    doorOut,
    doorBuilding,
    camera,
    lamps: placeLamps(street, drive, t.side, camera, t.road.walk),
    seen: seenStretch(g, drive, camera),
    place: own ? placeOf(own, street, spot, door, doorBuilding) : null,
  };
  return { site, cost: cost + cam.cost, poor: cam.walled || cam.gone };
}

/**
 * The place as the picture is to show it: its own building and the wall of it the scene is before (the wall the door
 * is on when the door is the own building's, else the front that faces the road, else the wall nearest the spot).
 */
function placeOf(own: Own, street: StreetData, spot: V2, door: V2 | null, doorBuilding: number): SitePlace {
  const b = own.index >= 0 ? street.buildings[own.index] : null;
  const wall = b ? wallAt(b, door && doorBuilding === own.index ? door : own.front ? own.front.door : nearestOnRing(spot, b.ring).pt) : null;
  return { kind: own.hint.kind, name: own.hint.name, building: b ? b.id : null, front: wall };
}

/** Is a door in a camera's picture: its foot and the window above it, with nothing before them? */
function doorSeen(g: Ground, camera: CameraPose, door: V2, out: V2): boolean {
  const l = lensOf(camera);
  const p = along(door, out, 0.3);
  return framed(see(l, p, 0.1), 0.06) && framed(see(l, p, 4), 0.06) && g.sight(camera.pos, camera.height, p, 1.2);
}

/**
 * The place on a house wall near the spot that a camera sees best and a door can be at: within the 32 m a door is
 * looked for, a metre and a half from the wall's corners, with free ground before it; the nearest, but a wall seen
 * squarely before one seen along its own line. Null when the camera sees no such wall. `only`: on that building alone.
 */
function seenDoor(g: Ground, camera: CameraPose, spot: V2, only = -1): { door: V2; out: V2; index: number } | null {
  let best: { door: V2; out: V2; index: number } | null = null;
  let bestScore = DOOR_REACH_M;
  for (const m of g.housesNear(spot, DOOR_REACH_M)) {
    if (only >= 0 && m.index !== only) continue;
    const ccw = ringArea(m.ring) > 0;
    for (let i = 0, j = m.ring.length - 1; i < m.ring.length; j = i++) {
      const a = m.ring[j];
      const b = m.ring[i];
      const len = dist(a, b);
      if (len < 4 || nearestOnSegment(spot, a, b).d >= bestScore) continue;
      const e = norm(sub(b, a));
      // Outward: to the right of an anticlockwise edge.
      const out: V2 = ccw ? [e[1], -e[0]] : [-e[1], e[0]];
      // The wall faces the lens.
      if (dot(out, sub(camera.pos, a)) < 0.5) continue;
      for (let k = 1.5; k <= len - 1.5; k += 1.5) {
        const q = along(a, e, k);
        const d = dist(q, spot);
        if (d >= DOOR_REACH_M) continue;
        const score = d + Math.max(0, SQUARE_ON - facingOf(camera, q, out)) * 40;
        if (score >= bestScore || g.wallDist(along(q, out, 0.8), 0.4) < 0.4 || g.water(along(q, out, 0.8))) continue;
        if (!doorSeen(g, camera, q, out)) continue;
        bestScore = score;
        best = { door: q, out, index: m.index };
      }
    }
  }
  return best;
}

/**
 * The stretch of the drive line a camera sees, in metres along the line: from the scene's own point outwards both
 * ways for as long as the road's centre line is in the picture (5 percent inside its edge) and not behind a house.
 * Undefined when the camera does not see the road at the scene at all.
 */
function seenStretch(g: Ground, drive: DriveLine, camera: CameraPose): { from: number; to: number } | undefined {
  const l = lensOf(camera);
  const sees = (s: number) => {
    const p = pointAlong(drive.pts, s).pt;
    return framed(see(l, p, 0), 0.1) && g.sight(camera.pos, camera.height, p, 0.3);
  };
  // Start from the point of the road nearest to the scene's own that is in the picture.
  let start = -1;
  for (let k = 0; k <= STOP_BEFORE_M && start < 0; k++) {
    for (const s of [drive.at + k, drive.at - k]) {
      if (s >= 0 && s <= drive.length && sees(s)) {
        start = s;
        break;
      }
    }
  }
  if (start < 0) return undefined;
  let from = start;
  let to = start;
  while (from - 1 >= 0 && from > drive.at - 80 && sees(from - 1)) from -= 1;
  while (to + 1 <= drive.length && to < drive.at + 80 && sees(to + 1)) to += 1;
  return { from, to };
}

/** Where along a line (every metre of it) a house stands on the road: on its centre line or with a wall hard by it. */
function wallsOn(g: Ground, pts: readonly V2[], length: number): number[] {
  const out: number[] = [];
  for (let s = 0; s <= length; s += 1) if (g.wallDist(pointAlong(pts, s).pt, PINCH_M) < PINCH_M) out.push(s);
  return out;
}

/** What a place further along the road than the incident costs, by how far. */
const SHIFTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [6, 1],
  [12, 1.8],
  [20, 2.8],
  [30, 4],
];

/**
 * The site of an incident at the scene's origin, or null when the street data has no road near enough or no place
 * on its roads that holds (the caller then makes a street up, src/cctv/procedural.ts).
 *
 * A street that names its place (`street.place`) is first dressed for it (place.ts settlePlace: a canopy, a
 * forecourt, bays, shelters), so `Site.street` is that street with what was added, and `Site.place` says what the
 * picture is to show.
 */
export function buildSite(given: StreetData, seed: number): Site | null {
  let street = given;
  let own: Own | null = null;
  // A plain kind of place (an ordinary street, a road, a forest) has nothing of its own: its site is a plain street's.
  if (given.place && isShown(given.place.kind)) {
    const hint = given.place;
    const settled = settlePlace(street, hint);
    // Where the street has no room for the place (place.ts Dressed.fits) it stays a plain street: no house of it is
    // made out to be the petrol station.
    if (settled.fits) {
      street = settled.street;
      const index = settled.plan.building;
      own = { hint, index, building: index >= 0 ? street.buildings[index] : null, front: settled.plan.front, focus: settled.focus };
    }
  }
  const g = new Ground(street);
  const tries: Try[] = [];
  const taken = new Set<number>();
  const ranked = rankRoads(street);
  let lines = 0;
  for (const cand of ranked) {
    if (taken.has(cand.index) || lines >= MAX_LINES) continue;
    const ext = extend(street, cand.index);
    ext.used.forEach((i) => taken.add(i));
    const length = lineLength(ext.pts);
    if (length < MIN_DRIVE_M) continue;
    const road = street.roads[cand.index];
    const near = nearestOnLine([0, 0], ext.pts);
    const room = Math.min(END_ROOM_M, length / 2 - 1);
    const base = clamp(near.s, room, length - room);
    const walls = wallsOn(g, ext.pts, length);
    // Which side of the road the incident is on (on the centre line: the seed decides).
    const cr = cross(near.dir, sub([0, 0], near.pt));
    const side: 1 | -1 = Math.abs(cr) < 0.3 ? (seed & 1 ? 1 : -1) : cr > 0 ? 1 : -1;
    const first = seed & 2 ? 1 : -1;
    const linePenalty = lines * 3 + (cand.d - ranked[0].d) * 0.05;
    for (const [shift, shiftPenalty] of SHIFTS) {
      for (const sign of shift ? [first, -first] : [1]) {
        const s = base + sign * shift;
        if (s < room || s > length - room) continue;
        // No camera holds both legs of a corner: a place on a straight stretch is the likelier one.
        const here = pointAlong(ext.pts, s).dir;
        let bend = 0;
        for (const k of [-STOP_BEFORE_M, -STOP_BEFORE_M / 2, STOP_BEFORE_M / 2, STOP_BEFORE_M]) {
          bend = Math.max(bend, Math.acos(clamp(dot(here, pointAlong(ext.pts, clamp(s + k, 0, length)).dir), -1, 1)) / DEG);
        }
        const at = { line: lines, pts: ext.pts, length, deadA: ext.deadA, deadB: ext.deadB, walls, road, s };
        const penalty = linePenalty + shiftPenalty + Math.max(0, bend - 15) / 15;
        // The incident's own place: as far from the road as it is. When that is deep in a yard, the kerb before it too.
        const own = shift === 0 && Math.abs(base - near.s) < 0.5;
        if (own) tries.push({ ...at, side, own: near.d, other: false, penalty });
        if (!own || near.d > road.width / 2 + 4.5) tries.push({ ...at, side, own: null, other: false, penalty: penalty + (own ? 0.6 : 0) });
        tries.push({ ...at, side: -side as 1 | -1, own: null, other: true, penalty: penalty + 0.8 });
      }
    }
    lines++;
  }
  // The likeliest place first; a place further off is only looked at while it could still be the better one.
  tries.sort((a, b) => a.penalty - b.penalty);
  let best: Built | null = null;
  const held = new Set<string>();
  let places = 0;
  let poor = 0;
  for (const t of tries) {
    if (best && (best.cost <= t.penalty || places >= MAX_PLACES || places + poor >= MAX_TRIES)) break;
    // The other side of the road is for where the incident's own side does not hold: it shows the same street
    // (but for a wall before its cameras).
    const key = `${t.line}:${t.s}`;
    if (t.other && held.has(key)) continue;
    const got = siteAt(g, t, seed, own);
    DBG?.push(`try line=${t.line} s=${t.s.toFixed(0)} side=${t.side} own=${t.own === null ? '-' : t.own.toFixed(1)} other=${t.other} pen=${t.penalty.toFixed(2)} -> ${got ? `cost=${got.cost.toFixed(2)} poor=${got.poor} spot=${got.site.spot.map((v) => v.toFixed(0))} cam=${got.site.camera.pos.map((v) => v.toFixed(0))} ${got.site.camera.mount} doorB=${got.site.doorBuilding}` : `null why=${WHY}`}`);
    if (!got) continue;
    // A place where every camera looks into a wall, or none has the place's board, does not use up the places a
    // camera is worked out for.
    if (got.poor) poor++;
    else {
      held.add(key);
      places++;
    }
    if (!best || got.cost < best.cost) best = got;
  }
  return best ? best.site : null;
}

/** The walking line on the incident's side of the road. */
export const walkLine = (site: Site, sameSide = true): V2[] => ((site.side === 1) === sameSide ? site.walkLeft : site.walkRight);

/** A point on the incident's pavement, `d` metres further along the road than the spot (negative: back towards a). */
export function pavement(site: Site, d: number, sameSide = true): V2 {
  const line = walkLine(site, sameSide);
  const n = nearestOnLine(site.spot, line);
  return pointAlong(line, clamp(n.s + d, 0, lineLength(line))).pt;
}
