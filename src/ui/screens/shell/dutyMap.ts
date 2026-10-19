// Valvekaart: the duty map of Estonia behind the out-of-game screens. Pure geometry, no React or DOM: every
// layer is projected to L-EST97 (helpers.lest97), clipped, simplified and written as SVG path data once per
// view and cached, so a screen only picks the colours (CSS, per theme) and a few per-player overlays.
// The land, the prefectures, the county lines and the county sectors all come from one source
// (data/geo/counties.json, whose counties share their border vertices), so their edges meet exactly; town and
// district sectors are the game's own outlines (sim/sectors sectorOutlines). Unit-tested in
// tests/duty-map.test.ts.
import countiesGeo from '@/data/geo/counties.json';
import lakesGeo from '@/data/geo/lakes.json';
import neighborsGeo from '@/data/geo/neighbors.json';
import roadsGeo from '@/data/geo/roads.json';
import { REGIONS, REGION_IDS } from '@/data/regions';
import { SECTORS } from '@/data/sectors';
import { mainStation, sectorById, sectorOutlines } from '@/sim/sectors';
import type { LngLat, RegionId } from '@/sim/types';
import { lest97, regionOfCounty } from './helpers';

export type XY = [number, number];
type Ring = LngLat[];
type Rect = [number, number, number, number];

// ── Views ────────────────────────────────────────────────────────────────────

export interface MapView {
  /** The viewBox, px. */
  width: number;
  height: number;
  /** Pixels per kilometre. */
  scale: number;
  /** The L-EST97 point (km, helpers.lest97) drawn at `at`. */
  origin: XY;
  at: XY;
  /** Simplification tolerance (px) and the smallest ring kept (px²). */
  tol: number;
  minArea: number;
}

/** The main menu behind its panels: Estonia between the left and right columns, 1440 × 828 at 1:1. */
export const DESKTOP_VIEW: MapView = {
  width: 1440,
  height: 828,
  scale: 1.82,
  origin: [195.45, 153.6],
  at: [708, 474],
  tol: 0.35,
  minArea: 6,
};

/** The strip on top of the phone layout. */
export const STRIP_VIEW: MapView = {
  width: 390,
  height: 300,
  scale: 0.94,
  origin: [195.45, 153.6],
  at: [195, 146],
  tol: 0.6,
  minArea: 3,
};

/** Room to leave around a fitted view (px): one number for every side, or each side on its own. */
export type ViewPad = number | { top: number; right: number; bottom: number; left: number };

/**
 * A view of `width` × `height` px fitting `bounds` with `pad` px around (a prefecture, an area). With a pad per
 * side the bounds are centred in what the pads leave free (the map between a screen's side panels).
 */
export function fitView(bounds: [LngLat, LngLat], width: number, height: number, pad: ViewPad = 24): MapView {
  const [[w, s], [e, n]] = bounds;
  const p = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
  const pts = [
    [w, s],
    [e, s],
    [w, n],
    [e, n],
    [(w + e) / 2, n],
    [(w + e) / 2, s],
  ].map((q) => lest97(q as LngLat));
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const freeW = Math.max(40, width - p.left - p.right);
  const freeH = Math.max(40, height - p.top - p.bottom);
  const scale = Math.min(freeW / Math.max(1, x1 - x0), freeH / Math.max(1, y1 - y0));
  return {
    width,
    height,
    scale,
    origin: [(x0 + x1) / 2, (y0 + y1) / 2],
    at: [p.left + freeW / 2, p.top + freeH / 2],
    tol: 0.35,
    minArea: 6,
  };
}

/** A stable key of a view (the caches of its layers). */
export const viewKey = (v: MapView) =>
  [v.width, v.height, v.scale, ...v.origin, ...v.at, v.tol, v.minArea].join(',');

/** Map point → view px. */
export function project(view: MapView, ll: LngLat): XY {
  return fromKm(view, lest97(ll));
}

function fromKm(view: MapView, [x, y]: XY): XY {
  return [(x - view.origin[0]) * view.scale + view.at[0], (y - view.origin[1]) * view.scale + view.at[1]];
}

// ── Polylines and rings in px ───────────────────────────────────────────────

function sqSegDist(p: XY, a: XY, b: XY): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Douglas-Peucker: the polyline without the vertices closer than `tol` to the simplified line. */
export function simplifyLine(pts: readonly XY[], tol: number): XY[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: number[] = [0, pts.length - 1];
  const sq = tol * tol;
  while (stack.length) {
    const l = stack.pop()!;
    const f = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = f + 1; i < l; i++) {
      const d = sqSegDist(pts[i], pts[f], pts[l]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > sq) {
      keep[idx] = 1;
      stack.push(f, idx, idx, l);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A ring (open or closed) simplified in two halves split at its farthest vertex; returned open. */
function simplifyRing(ring: readonly XY[], tol: number): XY[] {
  const pts = ring.slice();
  const last = pts[pts.length - 1];
  if (pts.length > 1 && last[0] === pts[0][0] && last[1] === pts[0][1]) pts.pop();
  if (pts.length < 4) return pts;
  let far = 0;
  let fd = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = simplifyLine(pts.slice(0, far + 1), tol);
  const b = simplifyLine([...pts.slice(far), pts[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

/** |area| of a ring, px². */
export function ringArea(r: readonly XY[]): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(s / 2);
}

function boundsOf(pts: readonly XY[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

const within = (b: Rect, r: Rect) => b[0] >= r[0] && b[1] >= r[1] && b[2] <= r[2] && b[3] <= r[3];
const apart = (b: Rect, r: Rect) => b[2] < r[0] || b[0] > r[2] || b[3] < r[1] || b[1] > r[3];

/** Sutherland-Hodgman: the ring cut to the rectangle (its parts outside the view collapse onto the border). */
function clipRing(ring: readonly XY[], rect: Rect): XY[] {
  const b = boundsOf(ring);
  if (within(b, rect)) return ring.slice();
  if (apart(b, rect)) return [];
  const [x0, y0, x1, y1] = rect;
  const inside = [(p: XY) => p[0] >= x0, (p: XY) => p[0] <= x1, (p: XY) => p[1] >= y0, (p: XY) => p[1] <= y1];
  const cut = [
    (a: XY, c: XY): XY => [x0, a[1] + ((x0 - a[0]) / (c[0] - a[0])) * (c[1] - a[1])],
    (a: XY, c: XY): XY => [x1, a[1] + ((x1 - a[0]) / (c[0] - a[0])) * (c[1] - a[1])],
    (a: XY, c: XY): XY => [a[0] + ((y0 - a[1]) / (c[1] - a[1])) * (c[0] - a[0]), y0],
    (a: XY, c: XY): XY => [a[0] + ((y1 - a[1]) / (c[1] - a[1])) * (c[0] - a[0]), y1],
  ];
  let out = ring.slice();
  for (let k = 0; k < 4 && out.length; k++) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i];
      const prev = inp[(i + inp.length - 1) % inp.length];
      const ci = inside[k](cur);
      const pi = inside[k](prev);
      if (ci) {
        if (!pi) out.push(cut[k](prev, cur));
        out.push(cur);
      } else if (pi) out.push(cut[k](prev, cur));
    }
  }
  return out;
}

/** The polyline's pieces inside the rectangle. */
function clipLine(line: readonly XY[], rect: Rect): XY[][] {
  const b = boundsOf(line);
  if (within(b, rect)) return [line.slice()];
  if (apart(b, rect)) return [];
  const [x0, y0, x1, y1] = rect;
  const inside = (p: XY) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const edge = (out: XY, inn: XY): XY => {
    let a = out;
    let c = inn;
    for (let k = 0; k < 18; k++) {
      const m: XY = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      if (inside(m)) c = m;
      else a = m;
    }
    return c;
  };
  const res: XY[][] = [];
  let cur: XY[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    if (inside(p)) {
      if (!cur.length && i > 0) cur.push(edge(line[i - 1], p));
      cur.push(p);
    } else if (cur.length) {
      cur.push(edge(p, line[i - 1]));
      res.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) res.push(cur);
  return res;
}

const num = (v: number) => {
  const s = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return s === '-0' ? '0' : s;
};

/** SVG path data: an absolute move, then relative steps of 0.1 px (exact: the points are rounded first). */
export function pathData(pts: readonly XY[], closed: boolean): string {
  const q: XY[] = [];
  for (const p of pts) {
    const r: XY = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
    const last = q[q.length - 1];
    if (!last || last[0] !== r[0] || last[1] !== r[1]) q.push(r);
  }
  if (closed && q.length > 1 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1]) q.pop();
  if (q.length < 2) return '';
  const steps: string[] = [];
  for (let i = 1; i < q.length; i++)
    steps.push(`${num(q[i][0] - q[i - 1][0])} ${num(q[i][1] - q[i - 1][1])}`);
  return `M${num(q[0][0])} ${num(q[0][1])}l${steps.join(' ').replace(/ -/g, '-')}${closed ? 'z' : ''}`;
}

// ── Geodata ─────────────────────────────────────────────────────────────────

interface GeoFeature {
  geometry: { type: string; coordinates: unknown };
  properties?: { name?: string; nm?: string | null; kind?: string } | null;
}

const featuresOf = (fc: unknown): GeoFeature[] => (fc as { features?: GeoFeature[] }).features ?? [];

/** Polygons (each a list of rings) of a Polygon or MultiPolygon. */
function polygonsOf(g: GeoFeature['geometry']): Ring[][] {
  if (g.type === 'Polygon') return [g.coordinates as Ring[]];
  if (g.type === 'MultiPolygon') return g.coordinates as Ring[][];
  return [];
}

function linesOf(g: GeoFeature['geometry']): Ring[] {
  if (g.type === 'LineString') return [g.coordinates as Ring];
  if (g.type === 'MultiLineString') return g.coordinates as Ring[];
  return [];
}

// ── County topology ─────────────────────────────────────────────────────────

/** A county edge: vertex ids in the direction county `a` runs it; county `b` (-1 at the coast or land border) runs it backwards. */
interface Edge {
  from: number;
  to: number;
  a: number;
  b: number;
}

interface Topology {
  /** Vertex coordinates by id. */
  coords: LngLat[];
  counties: { name: string; regionId: RegionId | undefined }[];
  edges: Edge[];
  /** Outer edges of the land (b = -1), split into coast and land border with Russia and Latvia. */
  border: Uint8Array;
}

let topology: Topology | null = null;

/** The counties as shared edges (their border vertices coincide and every ring runs the same way round). */
function topo(): Topology {
  if (topology) return topology;
  const coords: LngLat[] = [];
  const ids = new Map<number, number>();
  const vid = (p: LngLat) => {
    const k = Math.round(p[0] * 1e6) * 1e8 + Math.round(p[1] * 1e6);
    let id = ids.get(k);
    if (id === undefined) {
      id = coords.length;
      ids.set(k, id);
      coords.push(p);
    }
    return id;
  };
  const counties: Topology['counties'] = [];
  const edges: Edge[] = [];
  const byKey = new Map<number, number>();
  featuresOf(countiesGeo).forEach((f, ci) => {
    const name = f.properties?.name ?? '';
    counties.push({ name, regionId: regionOfCounty(name) });
    for (const ring of polygonsOf(f.geometry).flat()) {
      let prev = vid(ring[0]);
      for (let i = 1; i < ring.length; i++) {
        const cur = vid(ring[i]);
        if (cur === prev) continue;
        const k = prev < cur ? prev * 2_097_152 + cur : cur * 2_097_152 + prev;
        const e = byKey.get(k);
        if (e === undefined) {
          byKey.set(k, edges.length);
          edges.push({ from: prev, to: cur, a: ci, b: -1 });
        } else if (edges[e].a !== ci) edges[e].b = ci;
        prev = cur;
      }
    }
  });
  topology = { coords, counties, edges, border: new Uint8Array(0) };
  topology.border = classifyBorder(topology);
  return topology;
}

/** Closed rings (vertex ids) around the counties `inside` marks: the edges with exactly one side in the set, joined up. */
function outline(inside: Uint8Array): number[][] {
  const t = topo();
  const head = new Int32Array(t.coords.length).fill(-1);
  const link = new Int32Array(t.edges.length);
  const to = new Int32Array(t.edges.length);
  const starts: number[] = [];
  let m = 0;
  for (const e of t.edges) {
    const ia = inside[e.a] === 1;
    const ib = e.b >= 0 && inside[e.b] === 1;
    if (ia === ib) continue;
    const from = ia ? e.from : e.to;
    to[m] = ia ? e.to : e.from;
    link[m] = head[from];
    head[from] = m++;
    starts.push(from);
  }
  const out: number[][] = [];
  for (const start of starts)
    while (head[start] >= 0) {
      const ring = [start];
      let cur = start;
      do {
        const e = head[cur];
        if (e < 0) break;
        head[cur] = link[e];
        cur = to[e];
        ring.push(cur);
      } while (cur !== start && ring.length < 1_000_000);
      if (ring.length >= 4) out.push(ring);
    }
  return out;
}

/** County flags for outline(): the counties `pick` accepts. */
function countySet(pick: (c: { name: string; regionId: RegionId | undefined }) => boolean): Uint8Array {
  return Uint8Array.from(topo().counties, (c) => (pick(c) ? 1 : 0));
}

/** Edges (vertex id pairs) joined into polylines of ids: open chains first, then closed loops. */
function chain(pairs: readonly [number, number][]): number[][] {
  const at = new Map<number, number[]>();
  pairs.forEach(([a, b], i) => {
    for (const k of [a, b]) {
      const l = at.get(k);
      if (l) l.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(pairs.length);
  const out: number[][] = [];
  const walk = (i: number, start: number) => {
    const line = [start];
    let cur = start;
    let e = i;
    while (e >= 0 && !used[e]) {
      used[e] = 1;
      cur = pairs[e][0] === cur ? pairs[e][1] : pairs[e][0];
      line.push(cur);
      const cand = at.get(cur) ?? [];
      e = cand.length === 2 ? (cand.find((x) => !used[x]) ?? -1) : -1;
    }
    if (line.length > 1) out.push(line);
  };
  for (const [k, list] of at) if (list.length !== 2) for (const i of list) if (!used[i]) walk(i, k);
  pairs.forEach((p, i) => !used[i] && walk(i, p[0]));
  return out;
}

// ── Coast and land border ───────────────────────────────────────────────────

/** Local km grid for the normals (equirectangular at Estonia's latitude, y up). */
const KX = 111.32 * Math.cos((58.6 * Math.PI) / 180);
const KY = 110.57;

function inRing(p: LngLat, r: readonly LngLat[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

let foreign: { ring: Ring; box: Rect; land: boolean }[] | null = null;

/** In Russia or Latvia (the land border), or with `finland` also in Finland (Natural Earth, coarse). */
function inForeign(p: LngLat, finland = false): boolean {
  foreign ??= featuresOf(neighborsGeo).flatMap((f) =>
    polygonsOf(f.geometry).map((poly) => ({
      ring: poly[0],
      box: boundsOf(poly[0] as XY[]),
      land: f.properties?.nm !== 'Finland',
    })),
  );
  return foreign.some(
    ({ ring, box, land }) =>
      (land || finland) &&
      p[0] >= box[0] &&
      p[0] <= box[2] &&
      p[1] >= box[1] &&
      p[1] <= box[3] &&
      inRing(p, ring),
  );
}

/**
 * Marks the land's outer edges that face Russia or Latvia: a point just outside lies in a neighbour. The
 * neighbours (Natural Earth) are coarse, so two distances are tried and stretches under 3 km between two of
 * the other kind are evened out. Only the south and east can border anything; the rest is coast.
 */
function classifyBorder(t: Topology): Uint8Array {
  const flags = new Uint8Array(t.edges.length);
  // Walk each outer ring in order so the evening-out sees neighbours.
  for (const ring of outlineIds(t)) {
    const n = ring.length;
    const isBorder = new Uint8Array(n);
    const len = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const e = t.edges[ring[i]];
      const [alon, alat] = t.coords[e.from];
      const [blon, blat] = t.coords[e.to];
      const ax = alon * KX;
      const ay = alat * KY;
      const bx = blon * KX;
      const by = blat * KY;
      len[i] = Math.hypot(bx - ax, by - ay) || 1;
      const mlon = (alon + blon) / 2;
      const mlat = (alat + blat) / 2;
      if (!(mlat < 58.15 || (mlon > 26.9 && mlat < 59.55))) continue;
      // Counter-clockwise rings (y up): the land is on the left, the outside on the right.
      const nx = (by - ay) / len[i];
      const ny = -(bx - ax) / len[i];
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      isBorder[i] = [1.5, 4].some((d) => inForeign([(mx + nx * d) / KX, (my + ny * d) / KY])) ? 1 : 0;
    }
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n;) {
        let j = i;
        let run = 0;
        while (j < n && isBorder[j] === isBorder[i]) run += len[j++];
        if (i > 0 && j < n && run < 3 && isBorder[i - 1] === isBorder[j])
          for (let k = i; k < j; k++) isBorder[k] = isBorder[i - 1];
        i = j;
      }
    for (let i = 0; i < n; i++) flags[ring[i]] = isBorder[i];
  }
  return flags;
}

/** The land's outer edges (by index) as rings in order. */
function outlineIds(t: Topology): number[][] {
  const from = new Map<number, number>();
  t.edges.forEach((e, i) => e.b < 0 && from.set(e.from, i));
  const seen = new Uint8Array(t.edges.length);
  const out: number[][] = [];
  for (const start of from.values()) {
    if (seen[start]) continue;
    const ring: number[] = [];
    for (let e: number | undefined = start; e !== undefined && !seen[e]; e = from.get(t.edges[e].to)) {
      seen[e] = 1;
      ring.push(e);
    }
    out.push(ring);
  }
  return out;
}

/** Runs of the outer edges whose flag is `border`, as polylines of vertex ids. */
function outerRuns(border: boolean): number[][] {
  const t = topo();
  const out: number[][] = [];
  for (const ring of outlineIds(t)) {
    // Start at a change of kind, so no run is split at the ring's seam.
    const n = ring.length;
    let s = 0;
    while (s < n && !!t.border[ring[s]] === !!t.border[ring[(s + n - 1) % n]]) s++;
    if (s === n) s = 0;
    let cur: number[] | null = null;
    for (let k = 0; k < n; k++) {
      const i = ring[(s + k) % n];
      const e = t.edges[i];
      if (!!t.border[i] === border) {
        if (!cur) cur = [e.from];
        cur.push(e.to);
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// ── Neighbours ──────────────────────────────────────────────────────────────

/** The box Natural Earth's neighbours are cut to in data/geo/neighbors.json. */
const NB_CUT = { north: 60.45, south: 57.2, east: 29.4 };
/**
 * Land beyond that box, so the cut never shows as a straight coast: Finland and Russia to the north, Russia
 * to the east, Latvia to the south on both sides of the Gulf of Riga. Each reaches 1 km into the box, so no
 * seam is left after simplification.
 */
const NB_BEYOND: [LngLat, LngLat][] = [
  [
    [22.11, 60.44],
    [33, 63],
  ],
  [
    [29.39, 55],
    [33, 63],
  ],
  [
    [21.41, 55],
    [23.22, 57.21],
  ],
  [
    [24.33, 55],
    [29.4, 57.21],
  ],
];
const onCut = (a: LngLat, b: LngLat) =>
  (Math.abs(a[1] - NB_CUT.north) < 1e-6 && Math.abs(b[1] - NB_CUT.north) < 1e-6) ||
  (Math.abs(a[1] - NB_CUT.south) < 1e-6 && Math.abs(b[1] - NB_CUT.south) < 1e-6) ||
  (Math.abs(a[0] - NB_CUT.east) < 1e-6 && Math.abs(b[0] - NB_CUT.east) < 1e-6);

/** Points every 0.2° from a to b (both included). */
function along(a: LngLat, b: LngLat): Ring {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.2));
  return Array.from(
    { length: n + 1 },
    (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as LngLat,
  );
}

/** Estonia's bounding box with a margin: a road is drawn when a vertex lies in it and outside the neighbours. */
const EE_BOX: Rect = [21.6, 57.45, 28.3, 59.75];

// ── Base layers per view ─────────────────────────────────────────────────────

export interface MapTown {
  name: string;
  x: number;
  y: number;
  /** 0 the capital, 1 a city, 2 a county town. */
  size: 0 | 1 | 2;
}

export interface MapText {
  text: string;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  /** Degrees, around (x, y). */
  rotate?: number;
}

export type MapNameKey = 'fi' | 'lv' | 'ru' | 'gulf' | 'baltic' | 'riga' | 'peipus';

export interface BaseMap {
  view: MapView;
  graticule: string;
  meridians: { lon: number; a: XY; b: XY }[];
  parallels: { lat: number; pts: XY[] }[];
  land: string;
  coast: string;
  border: string;
  neighbours: string;
  neighbourCoast: string;
  /** Peipus with Pskov, and Võrtsjärv (the unnamed small ones, the Narva reservoir among them, are left out). */
  lakes: string;
  prefectures: Record<RegionId, string>;
  prefLines: string;
  /** County lines inside each prefecture: the borders of its county sectors. */
  countyLines: Record<RegionId, string>;
  roadsMain: string;
  roadsLocal: string;
  towns: MapTown[];
  regionLabels: { id: RegionId; x: number; y: number }[];
  names: { key: MapNameKey; x: number; y: number; rotate?: number }[];
}

type Place = { anchor: 'start' | 'middle' | 'end'; dx: number; dy: number };

/** County towns and the four cities (coordinates from the region data), and where each name goes (`small`: the phone strip). */
const TOWNS: ({ name: string; size: 0 | 1 | 2; small?: Place } & Place)[] = [
  { name: 'Tallinn', size: 0, anchor: 'start', dx: 9, dy: -7, small: { anchor: 'end', dx: -6, dy: -7 } },
  { name: 'Tartu', size: 1, anchor: 'start', dx: 8, dy: 4 },
  { name: 'Narva', size: 1, anchor: 'end', dx: -13, dy: 18, small: { anchor: 'end', dx: -9, dy: -11 } },
  { name: 'Pärnu', size: 1, anchor: 'end', dx: -7, dy: 4, small: { anchor: 'end', dx: -6, dy: 4 } },
  { name: 'Kuressaare', size: 1, anchor: 'start', dx: 7, dy: -5, small: { anchor: 'middle', dx: 0, dy: 15 } },
  { name: 'Rakvere', size: 2, anchor: 'start', dx: 6, dy: 4 },
  { name: 'Jõhvi', size: 2, anchor: 'middle', dx: 0, dy: 15 },
  { name: 'Haapsalu', size: 2, anchor: 'start', dx: 6, dy: 4 },
  { name: 'Kärdla', size: 2, anchor: 'start', dx: 6, dy: -4 },
  { name: 'Rapla', size: 2, anchor: 'start', dx: 6, dy: 4 },
  { name: 'Paide', size: 2, anchor: 'start', dx: 6, dy: 4 },
  { name: 'Viljandi', size: 2, anchor: 'end', dx: -6, dy: 4 },
  { name: 'Jõgeva', size: 2, anchor: 'start', dx: 6, dy: 4 },
  { name: 'Põlva', size: 2, anchor: 'start', dx: 6, dy: 4 },
  { name: 'Võru', size: 2, anchor: 'start', dx: 6, dy: 4 },
  { name: 'Valga', size: 2, anchor: 'end', dx: -6, dy: 4 },
];

/** Where the big names go, in L-EST97 km (helpers.lest97). */
const REGION_AT: Record<RegionId, XY> = {
  pohja: [215.2, 85.5],
  ida: [307.5, 87.1],
  laane: [158.1, 145.9],
  louna: [240.5, 226.1],
};
const NAMES_AT: { key: MapNameKey; at: XY; rotate?: number }[] = [
  { key: 'fi', at: [161.4, -40.9] },
  { key: 'lv', at: [209.7, 288.8] },
  { key: 'ru', at: [381.2, 145.9], rotate: -90 },
  { key: 'gulf', at: [130.6, 36] },
  { key: 'baltic', at: [31.7, 81.1] },
  { key: 'riga', at: [109.7, 236] },
  { key: 'peipus', at: [338.3, 141.5] },
];

const pxCache = new Map<string, (id: number) => XY>();

/** County vertex id → view px, each vertex projected once per view. */
function vertexPx(view: MapView): (id: number) => XY {
  const key = viewKey(view);
  let f = pxCache.get(key);
  if (!f) {
    const t = topo();
    const px = new Float64Array(t.coords.length * 2).fill(NaN);
    f = (id: number) => {
      if (Number.isNaN(px[id * 2])) {
        const [x, y] = project(view, t.coords[id]);
        px[id * 2] = x;
        px[id * 2 + 1] = y;
      }
      return [px[id * 2], px[id * 2 + 1]];
    };
    pxCache.set(key, f);
  }
  return f;
}

const baseCache = new Map<string, BaseMap>();

/** Every static layer of the view, built on first use and cached. */
export function baseMap(view: MapView): BaseMap {
  const key = viewKey(view);
  const hit = baseCache.get(key);
  if (hit) return hit;
  const t = topo();
  const V = vertexPx(view);
  const P = (ll: LngLat) => project(view, ll);
  const rect: Rect = [-10, -10, view.width + 10, view.height + 10];
  // Rings and lines come as coordinates or, from the county topology, as vertex ids.
  const toPx = (r: readonly LngLat[] | readonly number[]): XY[] =>
    typeof r[0] === 'number' ? (r as number[]).map(V) : (r as LngLat[]).map(P);
  const polys = (
    rings: readonly (readonly LngLat[] | readonly number[])[],
    tol = view.tol,
    minArea = view.minArea,
  ) => {
    let d = '';
    for (const ring of rings) {
      const r = clipRing(toPx(ring), rect);
      if (r.length < 3 || ringArea(r) < minArea) continue;
      d += pathData(simplifyRing(r, tol), true);
    }
    return d;
  };
  const lines = (ls: readonly (readonly LngLat[] | readonly number[])[], tol = view.tol) => {
    let d = '';
    for (const l of ls)
      for (const part of clipLine(toPx(l), rect))
        if (part.length > 1) d += pathData(simplifyLine(part, tol), false);
    return d;
  };

  // Graticule: meridians are straight in L-EST97, parallels gently curved.
  const meridians: BaseMap['meridians'] = [];
  const parallels: BaseMap['parallels'] = [];
  let graticule = '';
  for (let lon = 18; lon <= 32; lon++) {
    const a = P([lon, 61.5]);
    const b = P([lon, 55.8]);
    meridians.push({ lon, a, b });
    for (const part of clipLine([a, b], rect)) graticule += pathData(part, false);
  }
  for (let lat = 56.5; lat <= 61; lat += 0.5) {
    const pts: XY[] = [];
    for (let lon = 16; lon <= 34.001; lon += 0.25) pts.push(P([lon, lat]));
    parallels.push({ lat, pts });
    for (const part of clipLine(pts, rect)) graticule += pathData(simplifyLine(part, 0.5), false);
  }

  // Neighbours: their polygons plus the land beyond the box they were cut to; the outline leaves out the cut.
  const nbRings: Ring[] = [];
  const nbCoast: Ring[] = [];
  for (const f of featuresOf(neighborsGeo))
    for (const poly of polygonsOf(f.geometry)) {
      const r = poly[0];
      const ring: Ring = [r[0]];
      let cur: Ring = [r[0]];
      for (let i = 0; i + 1 < r.length; i++) {
        if (onCut(r[i], r[i + 1])) {
          // A cut along a parallel is curved in L-EST97: densified, so the land beyond meets it.
          ring.push(...along(r[i], r[i + 1]).slice(1));
          if (cur.length > 1) nbCoast.push(cur);
          cur = [r[i + 1]];
        } else {
          ring.push(r[i + 1]);
          cur.push(r[i + 1]);
        }
      }
      nbRings.push(ring);
      if (cur.length > 1) nbCoast.push(cur);
    }
  for (const [[w, s], [e, n]] of NB_BEYOND)
    nbRings.push([...along([w, s], [e, s]), ...along([e, n], [w, n])]);
  const nbTol = Math.max(view.tol, 0.8);

  const roads = (pred: (kind: string) => boolean) =>
    featuresOf(roadsGeo)
      .filter((f) => pred(f.properties?.kind ?? ''))
      .flatMap((f) => linesOf(f.geometry))
      .filter((l) =>
        l.some(
          (p) =>
            p[0] >= EE_BOX[0] &&
            p[0] <= EE_BOX[2] &&
            p[1] >= EE_BOX[1] &&
            p[1] <= EE_BOX[3] &&
            !inForeign(p, true),
        ),
      );

  // Shared county edges: a county line inside a prefecture, or a prefecture border.
  const inner = {} as Record<RegionId, [number, number][]>;
  for (const id of REGION_IDS) inner[id] = [];
  const pref: [number, number][] = [];
  for (const e of t.edges) {
    if (e.b < 0) continue;
    const ra = t.counties[e.a].regionId;
    if (ra && ra === t.counties[e.b].regionId) inner[ra].push([e.from, e.to]);
    else pref.push([e.from, e.to]);
  }
  const prefectures = {} as Record<RegionId, string>;
  const countyLines = {} as Record<RegionId, string>;
  for (const id of REGION_IDS) {
    prefectures[id] = polys(outline(countySet((c) => c.regionId === id)));
    countyLines[id] = lines(chain(inner[id]), view.tol + 0.15);
  }

  const allTowns = REGION_IDS.flatMap((id) => REGIONS[id]?.towns ?? []);
  const towns: MapTown[] = [];
  for (const tw of TOWNS) {
    const town = allTowns.find((x) => x.name === tw.name);
    if (!town) continue;
    const [x, y] = project(view, town.coord);
    if (x >= 0 && y >= 0 && x <= view.width && y <= view.height)
      towns.push({ name: tw.name, x, y, size: tw.size });
  }

  const base: BaseMap = {
    view,
    graticule,
    meridians,
    parallels,
    land: polys(outline(countySet(() => true))),
    coast: lines(outerRuns(false)),
    border: lines(outerRuns(true)),
    neighbours: polys(nbRings, nbTol, Math.max(view.minArea, 20)),
    neighbourCoast: lines(nbCoast, nbTol),
    lakes: polys(
      featuresOf(lakesGeo)
        .filter((f) => !!f.properties?.nm)
        .flatMap((f) => polygonsOf(f.geometry).map((p) => p[0])),
      view.tol + 0.05,
      1,
    ),
    prefectures,
    prefLines: lines(chain(pref), view.tol + 0.15),
    countyLines,
    roadsMain: lines(
      roads((k) => /Major|Secondary/.test(k)),
      view.tol + 0.25,
    ),
    roadsLocal: lines(
      roads((k) => k === 'Road'),
      view.tol + 0.25,
    ),
    towns,
    regionLabels: REGION_IDS.map((id) => {
      const [x, y] = fromKm(view, REGION_AT[id]);
      return { id, x, y };
    }),
    names: NAMES_AT.map((c) => {
      const [x, y] = fromKm(view, c.at);
      return { key: c.key, x, y, rotate: c.rotate };
    }),
  };
  baseCache.set(key, base);
  return base;
}

/** Degree labels along the visible edges: meridians under the top edge, parallels right of the left edge (view px). */
export function graticuleLabels(base: BaseMap, top: number, left: number): MapText[] {
  const out: MapText[] = [];
  for (const m of base.meridians) {
    const [ax, ay] = m.a;
    const [bx, by] = m.b;
    if (by === ay) continue;
    const x = ax + ((bx - ax) * (top - ay)) / (by - ay);
    if (x < left + 40 || x > base.view.width - 40) continue;
    out.push({ text: `${m.lon}°E`, x: x + 4, y: top + 22 });
  }
  const lx = left + 16;
  for (const p of base.parallels) {
    let y: number | null = null;
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [ax, ay] = p.pts[i];
      const [bx, by] = p.pts[i + 1];
      if ((ax - lx) * (bx - lx) <= 0 && bx !== ax) {
        y = ay + ((by - ay) * (lx - ax)) / (bx - ax);
        break;
      }
    }
    if (y === null || y < top + 40 || y > base.view.height - 20) continue;
    out.push({ text: `${Math.floor(p.lat)}°${p.lat % 1 ? '30′' : ''}N`, x: left + 20, y: y - 5 });
  }
  return out;
}

// ── Sectors ─────────────────────────────────────────────────────────────────

export interface SectorShape {
  id: string;
  d: string;
  /** Clip for an outline that may reach past its counties or the coast (a padded hull); null for county shapes. */
  clip: string | null;
  /** Where its name goes (the roomiest spot first, then others), and its marker (the main station, else the label spot). */
  label: XY;
  spots: XY[];
  pin: XY;
  /** Bounding box (px) and area (px²), for the labels and the paint order. */
  box: Rect;
  area: number;
}

const sectorCache = new Map<string, SectorShape | null>();

/** The counties of a sector when no other sector names them: its shape is exactly theirs. */
function ownCounties(id: string): string[] | null {
  const sec = sectorById(id);
  const cs = sec?.match.counties ?? [];
  if (!sec || !cs.length) return null;
  return cs.some((c) => SECTORS.some((o) => o.id !== id && o.match.counties?.includes(c))) ? null : cs;
}

/** A sector in the view: its counties when it has them to itself, else the game's outline cut to its counties. */
export function sectorShape(view: MapView, id: string): SectorShape | null {
  const key = `${viewKey(view)}|${id}`;
  if (!sectorCache.has(key)) sectorCache.set(key, buildSector(view, id));
  return sectorCache.get(key)!;
}

function buildSector(view: MapView, id: string): SectorShape | null {
  const sec = sectorById(id);
  const region = sec ? REGIONS[sec.regionId] : undefined;
  if (!sec || !region) return null;
  const P = (ll: LngLat) => project(view, ll);
  const V = vertexPx(view);
  const own = ownCounties(id);
  const named = (names: readonly string[]) => countySet((c) => names.includes(c.name));
  let rings: XY[][] = [];
  let clipRings: XY[][] | null = null;
  if (own) rings = outline(named(own)).map((r) => r.map(V));
  else {
    try {
      rings = sectorOutlines(region, [id]).map((o) => o.ring.map(P));
    } catch {
      rings = [];
    }
    const cs = sec.match.counties ?? [];
    clipRings = outline(cs.length ? named(cs) : countySet(() => true)).map((r) => r.map(V));
  }
  const tol = Math.min(view.tol, 0.3);
  const simple = rings.filter((r) => r.length >= 3 && ringArea(r) >= 0.2).map((r) => simplifyRing(r, tol));
  if (!simple.length) return null;
  const areas = simple.map(ringArea);
  const largest = simple[areas.indexOf(Math.max(...areas))];
  const spots = spotsIn(largest, 5);
  const label = spots[0] ?? largest[0];
  const st = mainStation(region, id);
  return {
    id,
    d: simple.map((r) => pathData(r, true)).join(''),
    clip: clipRings
      ? clipRings
          .filter((r) => ringArea(r) >= view.minArea)
          .map((r) => pathData(simplifyRing(r, tol), true))
          .join('')
      : null,
    label,
    spots,
    pin: st ? P(st.coord) : label,
    box: boundsOf(simple.flat()),
    area: areas.reduce((a, b) => a + b, 0),
  };
}

/** Label spots inside the ring: of a grid of candidates, the `n` farthest from the edges, a fifth of the ring apart (px). */
export function spotsIn(ring: readonly XY[], n = 1): XY[] {
  const [x0, y0, x1, y1] = boundsOf(ring);
  const steps = 14;
  const cands: { c: XY; d: number }[] = [];
  for (let a = 1; a < steps; a++)
    for (let b = 1; b < steps; b++) {
      const c: XY = [x0 + ((x1 - x0) * a) / steps, y0 + ((y1 - y0) * b) / steps];
      if (!inRing(c, ring)) continue;
      let d = Infinity;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
        d = Math.min(d, sqSegDist(c, ring[j], ring[i]));
      cands.push({ c, d });
    }
  cands.sort((a, b) => b.d - a.d);
  const apartBy = Math.max(x1 - x0, y1 - y0) / 5;
  const out: XY[] = [];
  for (const { c } of cands) {
    if (out.length >= n) break;
    if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= apartBy)) out.push(c);
  }
  return out.length ? out : [[(x0 + x1) / 2, (y0 + y1) / 2]];
}

// ── The player's layer ──────────────────────────────────────────────────────

export interface DutyInput {
  /** Sectors at the player's own desks. */
  mine: readonly string[];
  /** Prefectures the player covers whole (careers from before sectors). */
  whole: readonly RegionId[];
  /** Sectors the prefect offers. */
  offered: readonly string[];
  /** The daily challenge's sector, or its prefecture when it is played whole. */
  challenge: { sector: string; regionId: RegionId } | null;
  /** The player's home prefecture: tinted, with its sector lines. */
  home: RegionId | null;
  /** Colleagues' sectors to name on the map, each with who holds its desk (the career screen's own prefecture). */
  others?: readonly string[];
}

export interface PlacedText extends MapText {
  kind:
    | 'mine'
    | 'mineSub'
    | 'offer'
    | 'offerSub'
    | 'other'
    | 'otherSub'
    | 'challenge'
    | 'capital'
    | 'city'
    | 'town';
}

export interface DutyOverlay {
  mine: SectorShape[];
  offered: SectorShape[];
  challenge: SectorShape | null;
  /** Where the challenge's marker sits (its main station, or the prefecture's headquarters when played whole). */
  challengePin: XY | null;
  towns: MapTown[];
  labels: PlacedText[];
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Rough width of a label (px): Instrument Sans for names, the wide Archivo (`tracking` em apart) for callouts. */
export function textWidth(text: string, size: number, font: 'text' | 'display', tracking = 0): number {
  return [...text].length * (size * (font === 'display' ? 0.7 : 0.55) + tracking * size);
}

function boxOf(t: MapText, size: number, width: number): Box {
  const x0 = t.anchor === 'middle' ? t.x - width / 2 : t.anchor === 'end' ? t.x - width : t.x;
  return { x0: x0 - 2, y0: t.y - size, x1: x0 + width + 2, y1: t.y + size * 0.3 };
}

const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export interface OverlayNames {
  /** A sector's name ("Tartumaa ja Elva") and short callout ("TARTU LINN"). */
  sector: (id: string) => { name: string; short: string };
  /** "sinu sektor". */
  mineSub: string;
  /** Under an offered or a colleague's sector: "pakkumine · Maarja Tamm", "Rein Kask" (none: the name only). */
  offerSub?: (id: string) => string;
  otherSub?: (id: string) => string;
}

/**
 * The player's overlay of a view: their sectors, the offer, the challenge and the labels that go with them,
 * placed clear of each other and of the big names; a town name with no room left is dropped (its dot stays).
 * `compact` (the phone strip): smaller type, the cities only, no name on the offer.
 */
export function dutyOverlay(
  view: MapView,
  input: DutyInput,
  names: OverlayNames,
  compact = false,
): DutyOverlay {
  const base = baseMap(view);
  const shapes = (ids: readonly string[]) =>
    [...new Set(ids)]
      .map((id) => sectorShape(view, id))
      .filter((s): s is SectorShape => !!s)
      .sort((a, b) => b.area - a.area);
  const mine = shapes(input.mine);
  const offered = shapes(input.offered.filter((id) => !input.mine.includes(id)));
  const challenge = input.challenge?.sector ? sectorShape(view, input.challenge.sector) : null;
  let challengePin: XY | null = challenge?.pin ?? null;
  if (input.challenge && !challenge) {
    const r = REGIONS[input.challenge.regionId];
    const hq = r?.stations.find((s) => s.kind === 'hq')?.coord ?? r?.center;
    if (hq) challengePin = project(view, hq);
  }

  const placed: Box[] = [];
  const labels: PlacedText[] = [];
  const inView = (b: Box) => b.x0 >= 2 && b.y0 >= 2 && b.x1 <= view.width - 2 && b.y1 <= view.height - 2;
  const tryPlace = (
    cands: PlacedText[],
    size: number,
    width: number,
    sub?: { kind: PlacedText['kind']; text: string; size: number; width: number },
  ) => {
    for (const c of cands) {
      const b = boxOf(c, size, width);
      const s: PlacedText | null = sub
        ? { kind: sub.kind, text: sub.text, x: c.x, y: c.y + sub.size + 3, anchor: c.anchor }
        : null;
      const sb = s && sub ? boxOf(s, sub.size, sub.width) : null;
      if (!inView(b) || placed.some((p) => hits(p, b)) || (sb && placed.some((p) => hits(p, sb)))) continue;
      placed.push(b);
      labels.push(c);
      if (s && sb) {
        placed.push(sb);
        labels.push(s);
      }
      return true;
    }
    return false;
  };
  // The big names stay where they are; everything else keeps clear of them and of the town dots.
  const k = compact ? 0.88 : 1;
  if (!compact)
    for (const r of base.regionLabels)
      placed.push(
        boxOf(
          { text: '', x: r.x, y: r.y, anchor: 'middle' },
          10.5,
          textWidth('LÄÄNE', 10.5, 'display', 0.42),
        ),
      );
  const covered = (tw: MapTown) =>
    (challengePin && Math.hypot(challengePin[0] - tw.x, challengePin[1] - tw.y) < 8) ||
    mine.some(
      (s) => s.area < 1200 && tw.x >= s.box[0] && tw.x <= s.box[2] && tw.y >= s.box[1] && tw.y <= s.box[3],
    );
  const towns = base.towns
    .filter((tw) => !covered(tw) && (!compact || tw.size < 2))
    .sort((a, b) => a.size - b.size);
  for (const tw of towns) placed.push({ x0: tw.x - 3, y0: tw.y - 3, x1: tw.x + 3, y1: tw.y + 3 });
  // A small filled sector (a city) is kept clear too.
  for (const s of mine)
    if (s.area < 2500)
      placed.push({ x0: s.box[0] - 2, y0: s.box[1] - 2, x1: s.box[2] + 2, y1: s.box[3] + 2 });

  const around = (
    s: SectorShape,
    kind: PlacedText['kind'],
    text: string,
    size: number,
    width: number,
  ): PlacedText[] => {
    const [x0, y0, x1, y1] = s.box;
    const [lx, ly] = s.label;
    const roomy = x1 - x0 > width + 16 && y1 - y0 > size * 3;
    return [
      ...(roomy
        ? s.spots.map(([x, y]) => ({ kind, text, x, y: y + size * 0.35, anchor: 'middle' as const }))
        : []),
      { kind, text, x: x1 + 4, y: ly + 4, anchor: 'start' },
      { kind, text, x: x0 - 4, y: ly + 4, anchor: 'end' },
      { kind, text, x: lx, y: y1 + size + 4, anchor: 'middle' },
      { kind, text, x: lx, y: y0 - 6, anchor: 'middle' },
    ];
  };

  // The challenge at the player's own desk keeps the desk's name; its marker says the rest.
  if (challenge && challengePin && !mine.some((s) => s.id === challenge.id)) {
    const [px, py] = challengePin;
    const text = names.sector(challenge.id).name;
    const w = textWidth(text, 13.5 * k, 'text');
    tryPlace(
      [
        { kind: 'challenge', text, x: px - 13, y: py + 18, anchor: 'end' },
        { kind: 'challenge', text, x: px + 13, y: py + 5, anchor: 'start' },
        { kind: 'challenge', text, x: px - 13, y: py + 5, anchor: 'end' },
        { kind: 'challenge', text, x: px, y: py - 14, anchor: 'middle' },
        { kind: 'challenge', text, x: px, y: py + 26, anchor: 'middle' },
      ],
      13.5 * k,
      w,
    );
  }
  for (const s of [...mine].reverse()) {
    const text = names.sector(s.id).short;
    const w = textWidth(text, 12 * k, 'display', compact ? 0.08 : 0.1);
    const subW = textWidth(names.mineSub, 11.5 * k, 'text');
    tryPlace(around(s, 'mine', text, 12 * k, Math.max(w, subW)), 12 * k, w, {
      kind: 'mineSub',
      text: names.mineSub,
      size: 11.5 * k,
      width: subW,
    });
  }
  // Named sectors with a line under: the offer, then the colleagues' (largest first, so the roomy ones place).
  const named = (s: SectorShape, kind: 'offer' | 'other', sub: string) => {
    const text = names.sector(s.id).name;
    const w = textWidth(text, 11.5, 'text') * (kind === 'other' ? 1.04 : 1);
    if (!sub) return tryPlace(around(s, kind, text, 11.5, w), 11.5, w);
    const subW = textWidth(sub, 11, 'text');
    const subKind = kind === 'offer' ? 'offerSub' : 'otherSub';
    // A name whose line has no room goes up alone.
    return (
      tryPlace(around(s, kind, text, 11.5, Math.max(w, subW)), 11.5, w, {
        kind: subKind,
        text: sub,
        size: 11,
        width: subW,
      }) || tryPlace(around(s, kind, text, 11.5, w), 11.5, w)
    );
  };
  for (const s of compact ? [] : offered) named(s, 'offer', names.offerSub?.(s.id) ?? '');
  const taken = new Set([...mine, ...offered].map((s) => s.id));
  const others = compact
    ? []
    : shapes((input.others ?? []).filter((id) => !taken.has(id) && id !== challenge?.id));
  for (const s of others) named(s, 'other', names.otherSub?.(s.id) ?? '');
  for (const tw of towns) {
    const town = TOWNS.find((x) => x.name === tw.name)!;
    const spec = (compact && town.small) || town;
    const size = (tw.size === 0 ? 13.5 : tw.size === 1 ? 12.5 : 11.5) * k;
    const kind: PlacedText['kind'] = tw.size === 0 ? 'capital' : tw.size === 1 ? 'city' : 'town';
    tryPlace(
      [{ kind, text: tw.name, x: tw.x + spec.dx, y: tw.y + spec.dy, anchor: spec.anchor }],
      size,
      textWidth(tw.name, size, 'text') * (tw.size < 2 ? 1.06 : 1),
    );
  }
  return { mine, offered, challenge, challengePin, towns, labels };
}
