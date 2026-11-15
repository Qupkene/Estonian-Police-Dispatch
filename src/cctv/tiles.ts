/**
 * The real street around an incident, read from the game's street map (docs/CCTV.md sections 4 and 4.1): the
 * Protomaps v4 basemap PMTiles archive the map draws, at zoom 15. The one to four tiles around the incident become
 * a `StreetData` in scene metres (math.ts frameAt): roads cut at a circle of 160 m, buildings and areas that reach
 * within 200 m kept and clipped to a square of 200 m (half size) around the incident.
 *
 * Layers and attributes are those of the basemap's own style (node_modules/@protomaps/basemaps) and of
 * scripts/build-mapdata.mjs, which reads roads and buildings from the very same archive for the game's road graph:
 * - `roads` (lines): `kind` highway, major_road, minor_road, other, path, rail; `kind_detail`; `is_link`, `is_bridge`,
 *   `is_tunnel`, `oneway`, `service`, `name`.
 * - `buildings` (polygons): `kind` building or building_part; `height`, `min_height`; `kind_detail` roof (a canopy).
 * - `landuse` and `water` (polygons): `kind`.
 *
 * Pure apart from `readStreet`, which only fetches the tiles: no DOM, no three.js. Decoding is done as the build
 * script does it, with @mapbox/vector-tile over a pbf reader.
 */
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { LngLat } from '@/sim/types';
import {
  boundingBox,
  clipLineToCircle,
  cross,
  dist,
  dot,
  frameAt,
  hash32,
  lineLength,
  nearestOnLine,
  nearestOnSegment,
  pointInRing,
  rand,
  ringArea,
  sub,
  type V2,
} from './math';
import {
  ROAD_WIDTH,
  type Area,
  type AreaKind,
  type Building,
  type Road,
  type RoadClass,
  type RoofKind,
  type StreetData,
} from './types';

/** The zoom the street is read at (the deepest of the basemap). */
export const TILE_ZOOM = 15;
/** An archive that stops earlier is read at its deepest zoom down to this one; shallower ones are not used. */
const MIN_ZOOM = 14;
/** Roads are cut at this distance from the incident (metres). */
export const STREET_RADIUS = 160;
/** Polygons reach this much further than the roads: a building or an area that meets the wider circle is kept. */
const POLYGON_MARGIN = 40;
/** The work is bounded: the nearest buildings and roads, and the outline of an area simplified to this many vertices. */
export const MAX_BUILDINGS = 600;
export const MAX_ROADS = 300;
export const MAX_AREA_VERTICES = 400;
/** Smaller footprints are slivers left by clipping or mapping errors. */
const MIN_BUILDING_M2 = 2;
const MIN_AREA_M2 = 4;
/** A footprint thinner than this (metres) is a sliver. */
const MIN_WIDTH_M = 0.6;
/** Vertices closer than this (metres) are one. */
const MERGE_M = 0.05;
/** readStreet gives up after this long. */
const DEFAULT_TIMEOUT_MS = 6000;
/** No road this close to the incident: the map has nothing to stand the scene on (site.ts uses the same 70 m). */
const MAX_ROAD_M = 70;

// ---------------------------------------------------------------------------- tiles

export interface TileData {
  z: number;
  x: number;
  y: number;
  data: ArrayBuffer | Uint8Array;
}

const tileX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const lngOf = (tx: number, z: number) => (tx / 2 ** z) * 360 - 180;
const latOf = (ty: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / 2 ** z))) * 180) / Math.PI;

/** Metres per degree of latitude, as math.ts. */
const M_PER_DEG = 111194.93;

/** The tiles at zoom z that cover the circle of `radius` metres around `origin` (one to four for the street's circle). */
export function tilesAround(
  origin: LngLat,
  radius: number,
  z: number,
): { z: number; x: number; y: number }[] {
  const dLat = radius / M_PER_DEG;
  const dLng = radius / (M_PER_DEG * Math.cos((origin[1] * Math.PI) / 180));
  const n = 2 ** z;
  const x0 = Math.max(0, Math.floor(tileX(origin[0] - dLng, z)));
  const x1 = Math.min(n - 1, Math.floor(tileX(origin[0] + dLng, z)));
  const y0 = Math.max(0, Math.floor(tileY(origin[1] + dLat, z)));
  const y1 = Math.min(n - 1, Math.floor(tileY(origin[1] - dLat, z)));
  const out: { z: number; x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ z, x, y });
  return out;
}

// ---------------------------------------------------------------------------- attributes

type Props = Record<string, string | number | boolean>;

const truthy = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** As scripts/build-mapdata.mjs: minor roads that are not roads for cars. */
const MINOR_SKIP = new Set([
  'raceway',
  'busway',
  'bus_guideway',
  'construction',
  'proposed',
  'abandoned',
  'platform',
]);
/** As scripts/build-mapdata.mjs: service roads that are not roads for cars. */
const SERVICE_SKIP = new Set(['parking_aisle', 'drive-through', 'drive_through', 'emergency_access']);
/** Walking ways drawn as paths. Sidewalks and crossings are not: the pavements of a street are drawn from `walk`. */
const PATHS = new Set(['footway', 'cycleway', 'path', 'steps', 'track', 'bridleway']);
/** Rail lines that are gone or not built. */
const RAIL_SKIP = new Set(['disused', 'abandoned', 'razed', 'construction', 'proposed', 'dismantled']);

/**
 * The class of a `roads` feature, or null when the picture leaves it out. Car roads are classified exactly as
 * scripts/build-mapdata.mjs roadClass does it for the game's road graph (so a patrol car is never seen driving down a
 * road the map does not route on), with its link class drawn as a tertiary road and unclassified as residential.
 * Walking ways (`path`, and pedestrian streets) and rail lines (`rail`, tram by `kind_detail`) are added.
 */
export function roadClassOf(p: Props): RoadClass | null {
  const kind = p.kind;
  const d = text(p.kind_detail);
  const link = truthy(p.is_link) || d.endsWith('_link');
  if (kind === 'highway') return link ? 'tertiary' : 'motorway';
  if (kind === 'major_road') {
    if (link) return 'tertiary';
    if (d === 'trunk') return 'trunk';
    if (d === 'primary') return 'primary';
    if (d === 'tertiary') return 'tertiary';
    return 'secondary';
  }
  if (kind === 'minor_road') {
    if (MINOR_SKIP.has(d)) return null;
    if (d === 'service') return SERVICE_SKIP.has(String(p.service ?? '')) ? null : 'service';
    if (d === 'living_street') return 'living';
    return 'residential';
  }
  if (kind === 'other' && d === 'living_street') return 'living';
  if (kind === 'path' || kind === 'other') {
    if (d === 'pedestrian') return 'pedestrian';
    return kind === 'path' && PATHS.has(d) ? 'path' : null;
  }
  if (kind === 'rail') {
    if (RAIL_SKIP.has(d)) return null;
    return d === 'tram' ? 'tram' : 'rail';
  }
  return null;
}

/** As scripts/build-mapdata.mjs onewayOf: 1 along the geometry, -1 against it, 0 both ways; motorways are one-way. */
export function onewayOf(p: Props, cls: RoadClass): 0 | 1 | -1 {
  const o = p.oneway;
  if (o === undefined || o === '')
    return cls === 'motorway' || (p.kind === 'highway' && cls === 'tertiary') ? 1 : 0;
  if (o === true || o === 'yes' || o === 'true' || o === '1' || o === 1) return 1;
  if (o === '-1' || o === -1 || o === 'reverse') return -1;
  return 0;
}

const AREA_KINDS: Record<string, AreaKind> = {
  park: 'green',
  grass: 'green',
  garden: 'green',
  meadow: 'green',
  village_green: 'green',
  allotments: 'green',
  cemetery: 'green',
  golf_course: 'green',
  grassland: 'green',
  scrub: 'green',
  recreation_ground: 'green',
  forest: 'forest',
  wood: 'forest',
  pedestrian: 'paved',
  parking: 'parking',
  sand: 'sand',
  beach: 'sand',
  pitch: 'pitch',
  playground: 'pitch',
};

// ---------------------------------------------------------------------------- heights and roofs (section 4.1)

/**
 * Height and roof of a building the map gives no height for, from its footprint area and bounding rectangle,
 * seeded by its id so that it looks the same every time. `dense`: the street is a built-up town centre.
 */
export function buildingStyle(
  id: number,
  area: number,
  long: number,
  short: number,
  dense: boolean,
): { height: number; roof: RoofKind } {
  const r = rand(hash32('building', id));
  if (area < 25) return { height: r.range(2.4, 3), roof: r.chance(0.5) ? 'flat' : 'gable' };
  if (area < 260 && short < 14) return { height: r.chance(0.5) ? 3.4 : 6.2, roof: 'gable' };
  if (long > 38 && short >= 9 && short <= 16) return { height: r.chance(0.25) ? 28 : 16, roof: 'flat' };
  if (area > 1500) return { height: r.range(6, 11), roof: 'flat' };
  const floors = 2 + Math.floor(r() * 4);
  return { height: floors * 3 + 0.8, roof: dense && r.chance(0.2) ? 'gable' : 'flat' };
}

/** Built-up share of the circle above which a street counts as a dense town. */
const DENSE_SHARE = 0.2;

// ---------------------------------------------------------------------------- geometry in tile units

type P = [number, number];

/** Signed area in tile units (y down): the sign tells an outer ring from a hole within one feature. */
function tileArea(r: readonly P[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a;
}

/** One polygon of a feature: its outer ring and the holes in it, in tile units. */
interface Polygon {
  outer: P[];
  holes: P[][];
}

/**
 * Split a polygon feature's rings into polygons. As @mapbox/vector-tile classifyRings: the first ring is an outer
 * one, a ring of the same winding starts a new polygon, one of the other winding is a hole in the last outer ring.
 * This keeps working when a tile writes all its rings the other way round.
 */
function polygonsOf(rings: readonly P[][]): Polygon[] {
  const out: Polygon[] = [];
  let outerSign = 0;
  for (const ring of rings) {
    const a = tileArea(ring);
    if (!a) continue;
    if (!outerSign) outerSign = Math.sign(a);
    if (Math.sign(a) === outerSign) out.push({ outer: ring, holes: [] });
    else out[out.length - 1]?.holes.push(ring);
  }
  return out;
}

/** A rectangle in tile units: x0, y0, x1, y1. */
type Box4 = readonly [number, number, number, number];

/**
 * Clip a ring to a rectangle (Sutherland-Hodgman, as scripts/build-mapdata.mjs clipRing). Empty when the ring's
 * bounds miss the rectangle, so far features cost one pass.
 */
function clipRing(ring: readonly P[], [x0, y0, x1, y1]: Box4): P[] {
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;
  }
  if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) return [];
  if (bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1) return ring.slice();
  let poly: P[] = ring.slice();
  const inside = [(p: P) => p[0] >= x0, (p: P) => p[0] <= x1, (p: P) => p[1] >= y0, (p: P) => p[1] <= y1];
  const cut = [
    (a: P, b: P): P => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a: P, b: P): P => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a: P, b: P): P => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a: P, b: P): P => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  for (let k = 0; k < 4 && poly.length; k++) {
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const c = poly[i];
      const p = poly[(i + poly.length - 1) % poly.length];
      const cin = inside[k](c);
      if (cin !== inside[k](p)) out.push(cut[k](p, c));
      if (cin) out.push(c);
    }
    poly = out;
  }
  return poly;
}

/**
 * Clip a polyline to the tile square (Liang-Barsky per segment), so that pieces of neighbouring tiles meet. The
 * square is half-open: a segment lying on the east or south edge belongs to the next tile, so a road drawn along a
 * tile border is read once, not once from each tile.
 */
function clipLineToTile(line: readonly P[], e: number): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  const flush = () => {
    if (cur.length > 1) out.push(cur);
    cur = [];
  };
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;
    let keep = true;
    for (const [p, q, open] of [
      [-dx, x0, false],
      [dx, e - x0, true],
      [-dy, y0, false],
      [dy, e - y0, true],
    ] as const) {
      if (p === 0) {
        if (q < 0 || (open && q === 0)) keep = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (!keep || t0 > t1) {
      flush();
      continue;
    }
    const a: P = [x0 + dx * t0, y0 + dy * t0];
    const b: P = [x0 + dx * t1, y0 + dy * t1];
    if (t0 > 0) flush();
    if (!cur.length) cur.push(a);
    cur.push(b);
    if (t1 < 1) flush();
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------- geometry in scene metres

/** Drop repeated and too close vertices (and a closing vertex). */
function dedupe(pts: V2[], closed: boolean): V2[] {
  const out: V2[] = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > MERGE_M) out.push(p);
  if (closed) while (out.length > 1 && dist(out[0], out[out.length - 1]) <= MERGE_M) out.pop();
  return out;
}

/**
 * A ring with at most `max` vertices, as Douglas-Peucker with the smallest tolerance that gives so few. The ring is
 * split at the vertex furthest from the first; one pass ranks every vertex by the tolerance below which
 * Douglas-Peucker keeps it (never above its parent's), and the `max` best ranked stay. One pass, not one per
 * tolerance tried: a coastline can carry tens of thousands of vertices.
 */
function simplifyRing(ring: V2[], max: number): V2[] {
  const n = ring.length;
  if (n <= max) return ring;
  let far = 0;
  for (let i = 1; i < n; i++) if (dist(ring[0], ring[i]) > dist(ring[0], ring[far])) far = i;
  const rank = new Float64Array(n);
  rank[0] = Infinity;
  rank[far] = Infinity;
  // Spans [a, b] of the ring (b = n is the first vertex again), with the rank of the vertex that made them.
  const stack: [number, number, number][] = [
    [0, far, Infinity],
    [far, n, Infinity],
  ];
  while (stack.length) {
    const [a, b, cap] = stack.pop()!;
    if (b - a < 2) continue;
    // The vertex furthest from the chord ab (squared distances, inline: this loop runs n log n times).
    const [ax, ay] = ring[a];
    const dx = ring[b % n][0] - ax;
    const dy = ring[b % n][1] - ay;
    const l2 = dx * dx + dy * dy;
    let best = a + 1;
    let bestD = -1;
    for (let i = a + 1; i < b; i++) {
      const px = ring[i][0] - ax;
      const py = ring[i][1] - ay;
      const t = l2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / l2)) : 0;
      const d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    rank[best] = Math.min(cap, bestD);
    stack.push([a, best, rank[best]], [best, b, rank[best]]);
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => rank[j] - rank[i]);
  const keep = new Uint8Array(n);
  for (let k = 0; k < max; k++) keep[order[k]] = 1;
  return ring.filter((_, i) => keep[i]);
}

/**
 * Drop the vertices where a ring turns straight back on itself, until there are none: the zero-width spikes that
 * clipping a concave ring leaves along the clip line (they would stand as phantom walls), and the repeated vertices
 * that dropping a spike can leave behind.
 */
function dropSpikes(ring: V2[]): V2[] {
  const spike = (a: V2, b: V2, c: V2) => {
    const u = sub(b, a);
    const v = sub(c, b);
    const lu = Math.hypot(u[0], u[1]);
    const lv = Math.hypot(v[0], v[1]);
    return lu <= MERGE_M || lv <= MERGE_M || dot(u, v) < -0.9999 * lu * lv;
  };
  const out: V2[] = [];
  for (const p of ring) {
    out.push(p);
    while (out.length >= 3 && spike(out[out.length - 3], out[out.length - 2], out[out.length - 1]))
      out.splice(-2, 1);
  }
  for (let changed = true; changed && out.length >= 3;) {
    const n = out.length;
    changed = true;
    if (spike(out[n - 2], out[n - 1], out[0])) out.pop();
    else if (spike(out[n - 1], out[0], out[1])) out.shift();
    else changed = false;
  }
  return out;
}

/** The convex hull, anticlockwise (Andrew's monotone chain): the width test runs on it, not on every vertex. */
function convexHull(pts: readonly V2[]): V2[] {
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const half = (list: V2[]) => {
    const h: V2[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p, h[h.length - 1])) <= 0)
        h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(s), ...half(s.reverse())];
}

/** A clean ring anticlockwise (north up), not closed; null for a degenerate ring or a sliver. */
function cleanRing(pts: V2[], minArea: number): V2[] | null {
  const r = dropSpikes(dedupe(pts, true));
  if (r.length < 3) return null;
  const a = ringArea(r);
  if (Math.abs(a) < minArea) return null;
  if (a < 0) r.reverse();
  if (boundingBox(convexHull(r)).short < MIN_WIDTH_M) return null;
  return r;
}

/** How far the origin is from a ring: 0 inside it, else the distance to its nearest edge. */
function ringDistance(ring: readonly V2[]): number {
  if (pointInRing([0, 0], ring)) return 0;
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    d = Math.min(d, nearestOnSegment([0, 0], ring[j], ring[i]).d);
  return d;
}

/** Is p inside the triangle abc or on its outline (either winding)? */
function inTriangle(p: V2, a: V2, b: V2, c: V2): boolean {
  const d1 = cross(sub(b, a), sub(p, a));
  const d2 = cross(sub(c, b), sub(p, b));
  const d3 = cross(sub(a, c), sub(p, c));
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/**
 * Join a hole (clockwise) into an anticlockwise ring with a cut of zero width, as earcut eliminates holes: from the
 * hole's eastmost vertex a ray goes east to the nearest edge, and the cut goes to the vertex of the ring it sees there
 * (the edge's eastern end, or a vertex nearer the ray inside the triangle between them). The result is one ring that
 * a triangulator fills around the hole. Null when the ray meets nothing (the hole is not inside the ring).
 */
function bridgeHole(ring: readonly V2[], hole: readonly V2[]): V2[] | null {
  let hi = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i][0] > hole[hi][0]) hi = i;
  const h = hole[hi];
  let qx = Infinity;
  let mi = -1;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (a[1] === b[1] || (a[1] - h[1]) * (b[1] - h[1]) > 0) continue;
    const x = a[0] + ((h[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
    if (x >= h[0] && x < qx) {
      qx = x;
      mi = a[0] > b[0] ? j : i;
    }
  }
  if (mi < 0) return null;
  const m = ring[mi];
  const q: V2 = [qx, h[1]];
  let tanMin = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    if (i === mi || p[0] <= h[0] || p[0] > m[0] || !inTriangle(p, h, q, m)) continue;
    const tan = Math.abs(h[1] - p[1]) / (p[0] - h[0]);
    if (tan >= tanMin) continue;
    // The hole vertex must lie in the ring's inside at p (left of its edges, either one at a reflex corner).
    const a = ring[(i + ring.length - 1) % ring.length];
    const b = ring[(i + 1) % ring.length];
    const l1 = cross(sub(p, a), sub(h, a)) >= 0;
    const l2 = cross(sub(b, p), sub(h, p)) >= 0;
    if (cross(sub(p, a), sub(b, p)) >= 0 ? l1 && l2 : l1 || l2) {
      tanMin = tan;
      mi = i;
    }
  }
  return [...ring.slice(0, mi + 1), ...hole.slice(hi), ...hole.slice(0, hi + 1), ...ring.slice(mi)];
}

/** An outer ring with its holes joined in (bridgeHole), eastmost hole first so that each cut finds the ring. */
function withHoles(outer: readonly V2[], holes: readonly V2[][]): V2[] {
  let ring = ringArea(outer) < 0 ? outer.slice().reverse() : outer.slice();
  const maxX = (r: readonly V2[]) => r.reduce((m, p) => Math.max(m, p[0]), -Infinity);
  const cw = holes
    .map((h) => (ringArea(h) > 0 ? h.slice().reverse() : h.slice()))
    .sort((a, b) => maxX(b) - maxX(a));
  for (const hole of cw) ring = bridgeHole(ring, hole) ?? ring;
  return ring;
}

// ---------------------------------------------------------------------------- reading the tiles

interface Piece {
  id: number;
  ring: V2[];
  area: number;
  /** The map's height (ground to top) and base, when it has them. */
  height: number | null;
  base: number;
  open: boolean;
  d: number;
  /** A building without an id: where its piece was cut by a tile border, to join it with the pieces beside it. */
  cuts?: Cut[];
}

/** An edge of a building piece lying on a tile border, in world tile units of its zoom: a line and a span of it. */
interface Cut {
  line: string;
  lo: number;
  hi: number;
}

interface TileFrame {
  /** Tile units to scene metres. */
  toLocal: (p: P) => V2;
  /** A point further than r metres from the origin: a cheap test to skip what is far before converting it. */
  far: (p: P, r: number) => boolean;
  /** The same for a whole polyline (its long segments may pass close by between far vertices). */
  farLine: (line: readonly P[], r: number) => boolean;
  /** The tile square cut down to the square of `half` metres around the origin (tile units), drawn in by `inset` units. */
  box: (half: number, inset?: number) => Box4;
  /** Does a ring (tile units) meet the circle of r metres around the origin: the origin inside, or an edge within r? */
  meets: (ring: readonly P[], r: number) => boolean;
}

function tileFrame(t: TileData, extent: number, origin: LngLat): TileFrame {
  const frame = frameAt(origin);
  const n = 2 ** t.z;
  const o: P = [(tileX(origin[0], t.z) - t.x) * extent, (tileY(origin[1], t.z) - t.y) * extent];
  // Metres per tile unit at the origin's latitude, on the sphere of frameAt (exact to a centimetre across the square).
  const mPerUnit = (M_PER_DEG * 360 * Math.cos((origin[1] * Math.PI) / 180)) / (n * extent);
  return {
    toLocal: (p) => frame.toLocal([lngOf(t.x + p[0] / extent, t.z), latOf(t.y + p[1] / extent, t.z)]),
    far: (p, r) => Math.hypot(p[0] - o[0], p[1] - o[1]) * mPerUnit > r,
    farLine: (line, r) => {
      for (let i = 1; i < line.length; i++)
        if (nearestOnSegment(o, line[i - 1], line[i]).d * mPerUnit <= r) return false;
      return line.length > 1 || Math.hypot(line[0][0] - o[0], line[0][1] - o[1]) * mPerUnit > r;
    },
    box: (half, inset = 0) => {
      const u = half / mPerUnit;
      return [
        Math.max(0, o[0] - u) + inset,
        Math.max(0, o[1] - u) + inset,
        Math.min(extent, o[0] + u) - inset,
        Math.min(extent, o[1] + u) - inset,
      ];
    },
    meets: (ring, r) => {
      if (pointInRing(o, ring)) return true;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
        if (nearestOnSegment(o, ring[j], ring[i]).d * mPerUnit <= r) return true;
      return false;
    },
  };
}

/** The edges of a clipped ring that lie on a border of its tile (they are where a neighbour tile's piece goes on). */
function cutsOf(ring: readonly P[], t: TileData, extent: number): Cut[] {
  const out: Cut[] = [];
  const edge = (v: number) => v === 0 || v === extent;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = [ring[j], ring[i]];
    if (a[0] === b[0] && edge(a[0])) {
      const y0 = t.y + Math.min(a[1], b[1]) / extent;
      const y1 = t.y + Math.max(a[1], b[1]) / extent;
      out.push({ line: `${t.z}x${t.x + a[0] / extent}`, lo: y0, hi: y1 });
    } else if (a[1] === b[1] && edge(a[1])) {
      const x0 = t.x + Math.min(a[0], b[0]) / extent;
      const x1 = t.x + Math.max(a[0], b[0]) / extent;
      out.push({ line: `${t.z}y${t.y + a[1] / extent}`, lo: x0, hi: x1 });
    }
  }
  return out;
}

/**
 * Give the pieces of one building without an id the same id: pieces from two tiles whose cuts lie on the same tile
 * border and overlap are one building (the tiles clip it each to their own buffer, so neither piece's own vertices
 * tell). Each group takes the smallest of its pieces' own ids, so its height and colour are the same on both sides.
 */
function joinCutPieces(pieces: Piece[]): void {
  const free = pieces.filter((p) => p.cuts?.length);
  const parent = free.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const byLine = new Map<string, { i: number; lo: number; hi: number }[]>();
  free.forEach((p, i) => {
    for (const c of p.cuts!) {
      const list = byLine.get(c.line) ?? [];
      for (const o of list) if (o.i !== i && c.lo < o.hi && o.lo < c.hi) parent[root(o.i)] = root(i);
      list.push({ i, lo: c.lo, hi: c.hi });
      byLine.set(c.line, list);
    }
  });
  const ids = new Map<number, number>();
  free.forEach((p, i) => ids.set(root(i), Math.min(ids.get(root(i)) ?? Infinity, p.id)));
  free.forEach((p, i) => (p.id = ids.get(root(i))!));
}

const bytesOf = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));
const pointsOf = (g: { x: number; y: number }[]): P[] => g.map((q) => [q.x, q.y]);

/** Holes in an area are kept up to this many, the largest, each simplified to this many vertices (and two for its cut). */
export const MAX_HOLES = 24;
export const MAX_HOLE_VERTICES = 48;
/** Holes are clipped this many tile units inside the outer ring's clip line, so that a cut hole never touches it. */
const HOLE_INSET = 0.5;

/**
 * The street of `tiles` around `origin` (source 'tiles'). Pure. Throws only when a tile does not parse as a vector
 * tile (readStreet turns that into null); a feature that does not decode is skipped.
 *
 * Roads are cut at the circle of `radius`. A building or an area is kept when it reaches within `radius` + 40 m (a
 * vertex or an edge that near, or the incident inside it) and is clipped to the square of that half size around the
 * incident, so that a park or a sea the incident stands in is there and stays small.
 */
export function streetFromTiles(tiles: TileData[], origin: LngLat, radius = STREET_RADIUS): StreetData {
  const keep = radius + POLYGON_MARGIN;
  const roads: (Road & { d: number })[] = [];
  const pieces: Piece[] = [];
  const areas: (Area & { a: number })[] = [];

  for (const t of tiles) {
    const vt = new VectorTile(new PbfReader(bytesOf(t.data)));

    const rl = vt.layers.roads;
    if (rl) {
      const tf = tileFrame(t, rl.extent, origin);
      for (let i = 0; i < rl.length; i++) {
        try {
          const f = rl.feature(i);
          if (f.type !== 2) continue;
          const cls = roadClassOf(f.properties);
          if (!cls) continue;
          const props = f.properties;
          const oneway = CAR_CLASSES.has(cls) ? onewayOf(props, cls) : 0;
          for (const raw of f.loadGeometry()) {
            const line = pointsOf(raw);
            if (tf.farLine(line, radius + 30)) continue;
            for (const part of clipLineToTile(line, rl.extent)) {
              for (const run of clipLineToCircle(dedupe(part.map(tf.toLocal), false), [0, 0], radius)) {
                const pts = dedupe(run, false);
                if (pts.length < 2 || lineLength(pts) < 0.5) continue;
                const road: Road & { d: number } = {
                  cls,
                  pts,
                  width: ROAD_WIDTH[cls],
                  oneway,
                  walk: false,
                  d: nearestOnLine([0, 0], pts).d,
                };
                const name = text(props.name);
                if (name) road.name = name;
                if (truthy(props.is_bridge)) road.bridge = true;
                if (truthy(props.is_tunnel)) road.tunnel = true;
                roads.push(road);
              }
            }
          }
        } catch {
          // A feature that does not decode: the rest of the tile is still good.
        }
      }
    }

    const bl = vt.layers.buildings;
    if (bl) {
      const tf = tileFrame(t, bl.extent, origin);
      const box = tf.box(keep);
      for (let i = 0; i < bl.length; i++) {
        try {
          const f = bl.feature(i);
          if (f.type !== 3 || f.properties.kind === 'building_part' || f.properties.kind === 'address')
            continue;
          const rings = f.loadGeometry().map(pointsOf);
          // A feature without an id gets one from its first vertex in world tile units: the same every time (and
          // joinCutPieces gives the pieces of one building cut by a tile border one of them).
          const id =
            f.id ||
            hash32(
              'building',
              t.z,
              t.x * bl.extent + (rings[0]?.[0]?.[0] ?? 0),
              t.y * bl.extent + (rings[0]?.[0]?.[1] ?? 0),
            );
          const height = num(f.properties.height);
          const base = Math.max(0, num(f.properties.min_height) ?? 0);
          // Courtyards are left filled: a building is drawn as one block from its outline.
          for (const { outer } of polygonsOf(rings)) {
            const cut = clipRing(outer, box);
            if (cut.length < 3 || !tf.meets(cut, keep)) continue;
            const ring = cleanRing(cut.map(tf.toLocal), MIN_BUILDING_M2);
            if (!ring) continue;
            const piece: Piece = {
              id,
              ring,
              area: ringArea(ring),
              height,
              base,
              open: f.properties.kind_detail === 'roof',
              d: ringDistance(ring),
            };
            if (!f.id) piece.cuts = cutsOf(cut, t, bl.extent);
            pieces.push(piece);
          }
        } catch {
          // As for roads: skip the feature.
        }
      }
    }

    for (const layer of ['landuse', 'water'] as const) {
      const ll = vt.layers[layer];
      if (!ll) continue;
      const tf = tileFrame(t, ll.extent, origin);
      const box = tf.box(keep);
      const holeBox = tf.box(keep, HOLE_INSET);
      for (let i = 0; i < ll.length; i++) {
        try {
          const f = ll.feature(i);
          if (f.type !== 3) continue;
          const kind = layer === 'water' ? 'water' : AREA_KINDS[text(f.properties.kind)];
          if (!kind) continue;
          for (const { outer, holes } of polygonsOf(f.loadGeometry().map(pointsOf))) {
            const cut = clipRing(outer, box);
            if (cut.length < 3 || !tf.meets(cut, keep)) continue;
            // Clipped and simplified before anything else looks at it: a coastline can carry tens of thousands of vertices.
            const ring = simplifyRing(dedupe(cut.map(tf.toLocal), true), MAX_AREA_VERTICES);
            const inner = holes
              .map((h) => clipRing(h, holeBox))
              .filter((h) => h.length >= 3)
              .map((h) => simplifyRing(dedupe(h.map(tf.toLocal), true), MAX_HOLE_VERTICES))
              .filter((h) => h.length >= 3 && Math.abs(ringArea(h)) >= MIN_AREA_M2)
              .sort((x, y) => Math.abs(ringArea(y)) - Math.abs(ringArea(x)))
              .slice(0, MAX_HOLES);
            const clean = cleanRing(withHoles(ring, inner), MIN_AREA_M2);
            if (clean) areas.push({ kind, ring: clean, a: ringArea(clean) });
          }
        } catch {
          // As for roads: skip the feature.
        }
      }
    }
  }

  joinCutPieces(pieces);

  // Buildings: the nearest ones, each with the height and roof of the whole building (all its pieces).
  pieces.sort((a, b) => a.d - b.d);
  const kept = pieces.slice(0, MAX_BUILDINGS);
  const builtUp = kept.reduce((s, p) => s + (p.d < radius ? p.area : 0), 0);
  const dense = builtUp / (Math.PI * radius * radius) > DENSE_SHARE;
  const groups = new Map<number, Piece[]>();
  for (const p of kept) groups.set(p.id, [...(groups.get(p.id) ?? []), p]);
  const buildings: Building[] = kept.map((p) => {
    const all = groups.get(p.id)!;
    let top = p.height;
    let roof: RoofKind = 'flat';
    if (top === null) {
      const box = boundingBox(all.flatMap((q) => q.ring));
      const style = buildingStyle(
        p.id,
        all.reduce((s, q) => s + q.area, 0),
        box.long,
        box.short,
        dense,
      );
      top = style.height;
      // A pitched roof needs the whole footprint: a building in several pieces gets a flat one.
      roof = all.length === 1 ? style.roof : 'flat';
    }
    const b: Building = {
      id: p.id,
      ring: p.ring,
      height: Math.max(p.base + 2, top),
      base: p.base,
      area: p.area,
      roof,
    };
    if (p.open) b.open = true;
    return b;
  });

  roads.sort((a, b) => a.d - b.d);
  const near = roads.slice(0, MAX_ROADS);
  for (const r of near) r.walk = hasPavements(r, buildings);

  areas.sort((a, b) => b.a - a.a);
  return {
    source: 'tiles',
    radius,
    roads: near.map(({ d: _d, ...r }) => r),
    buildings,
    areas: areas.map(({ a: _a, ...x }) => x),
  };
}

const CAR_CLASSES: ReadonlySet<RoadClass> = new Set<RoadClass>([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'living',
  'service',
]);
const TOWN_STREETS: ReadonlySet<RoadClass> = new Set<RoadClass>(['tertiary', 'residential', 'living']);

/**
 * Section 4.1: pavements along a town street (tertiary to living) with a building within 25 m, and along a primary
 * or secondary road with buildings within 18 m on both sides.
 */
function hasPavements(r: Road, buildings: readonly Building[]): boolean {
  const main = r.cls === 'primary' || r.cls === 'secondary';
  if (!main && !TOWN_STREETS.has(r.cls)) return false;
  const reach = main ? 18 : 25;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of r.pts) {
    x0 = Math.min(x0, p[0] - reach);
    y0 = Math.min(y0, p[1] - reach);
    x1 = Math.max(x1, p[0] + reach);
    y1 = Math.max(y1, p[1] + reach);
  }
  let sides = 0;
  for (const b of buildings) {
    for (const v of b.ring) {
      if (v[0] < x0 || v[0] > x1 || v[1] < y0 || v[1] > y1) continue;
      const n = nearestOnLine(v, r.pts);
      if (n.d > reach) continue;
      if (!main) return true;
      sides |= cross(n.dir, sub(v, n.pt)) > 0 ? 1 : 2;
      if (sides === 3) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------- the archive

/** What readStreet needs of an archive: the pmtiles package's PMTiles class (src/map/streetTiles.ts opens it). */
export interface TileArchive {
  getHeader(): Promise<{ minZoom: number; maxZoom: number }>;
  getZxy(z: number, x: number, y: number, signal?: AbortSignal): Promise<{ data: ArrayBuffer } | undefined>;
}

/**
 * Read the street around `origin` from the archive. Never throws and never hangs: no tile under the incident, a
 * tile that does not parse, a timeout (6 s), an archive shallower than zoom 14, an abort or no road within 70 m all
 * give null, and the caller makes a street up (procedural.ts). A missing tile beside the incident's own is empty
 * (open sea) and is skipped.
 */
export async function readStreet(
  archive: TileArchive,
  origin: LngLat,
  opts: { radius?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<StreetData | null> {
  const radius = opts.radius ?? STREET_RADIUS;
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  if (opts.signal?.aborted) return null;
  opts.signal?.addEventListener('abort', stop);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      stop();
      resolve(null);
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    ctl.signal.addEventListener('abort', () => resolve(null));
  });
  const work = (async (): Promise<StreetData | null> => {
    const header = await archive.getHeader();
    const z = Math.min(TILE_ZOOM, header.maxZoom);
    if (z < MIN_ZOOM) return null;
    const want = tilesAround(origin, radius + POLYGON_MARGIN, z);
    const got = await Promise.all(want.map((t) => archive.getZxy(t.z, t.x, t.y, ctl.signal)));
    if (ctl.signal.aborted) return null;
    const own = { x: Math.floor(tileX(origin[0], z)), y: Math.floor(tileY(origin[1], z)) };
    const tiles: TileData[] = [];
    for (let i = 0; i < want.length; i++) {
      const g = got[i];
      if (g?.data && g.data.byteLength) tiles.push({ ...want[i], data: g.data });
      else if (want[i].x === own.x && want[i].y === own.y) return null;
    }
    const street = streetFromTiles(tiles, origin, radius);
    const usable = street.roads.some(
      (r) =>
        !r.tunnel && r.cls !== 'rail' && r.cls !== 'tram' && nearestOnLine([0, 0], r.pts).d <= MAX_ROAD_M,
    );
    return usable ? street : null;
  })().catch(() => null);
  try {
    return await Promise.race([work, gaveUp]);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', stop);
  }
}
