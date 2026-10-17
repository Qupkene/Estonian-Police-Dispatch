/**
 * Road graph and building index behind the map's display layer: units drive along real roads and
 * incident markers sit at buildings. The data files (roads-v1.bin, buildings-v1.bin) are derived
 * from the self-hosted street map by scripts/build-mapdata.mjs, which documents the binary formats;
 * keep the two in sync.
 *
 * Pure: no DOM, no maplibre. Runs in the road worker (src/map/roadWorker.ts), on the main thread
 * when workers are unavailable, and in node tests. Distances use a local equirectangular
 * approximation (exact enough for the few kilometres between nodes).
 */
import { bearing } from '@/sim/geo';
import type { LngLat } from '@/sim/types';

export const ROADS_FILE = 'roads-v1.bin';
export const BUILDINGS_FILE = 'buildings-v1.bin';
export const FORMAT_VERSION = 1;

const DEG = Math.PI / 180;
/** Metres per degree of latitude (mean Earth radius). */
const M_PER_DEG = 111194.93;
/** Speed (km/h) of the short hops between a road and a point off it (drive-in, parking). */
export const HOP_KMH = 15;

/** How an incident or parked unit is moved onto the map data: building, place (large building), road. */
export type SnapKind = 'place' | 'building' | 'road';

/** Search radii (metres) of the snapping rules. */
export const SNAP_M = { building: 120, place: 200, road: 300 } as const;

export interface EdgeGrid {
  originLon: number;
  originLat: number;
  cellLon: number;
  cellLat: number;
  w: number;
  h: number;
  start: Uint32Array;
  items: Uint32Array;
}

export interface RoadGraph {
  nodes: number;
  edges: number;
  nodeLon: Float64Array;
  nodeLat: Float64Array;
  edgeA: Uint32Array;
  edgeB: Uint32Array;
  /** Bits 0-3 road class, bit 4 one-way (start to end only). */
  edgeFlags: Uint8Array;
  /** First shape point of each edge (length edges + 1). */
  shapeStart: Uint32Array;
  shapeLon: Float64Array;
  shapeLat: Float64Array;
  /** Edge length in metres. */
  edgeLen: Float32Array;
  /** Edge driving time in seconds at its class speed. */
  edgeCost: Float32Array;
  /** km/h per road class. */
  speedKmh: Uint8Array;
  bbox: [number, number, number, number];
  /** Directed adjacency: for node n, entries adjStart[n]..adjStart[n+1]-1; adjEdge = edge, adjFwd = 1 for start to end. */
  adjStart: Uint32Array;
  adjEdge: Uint32Array;
  adjFwd: Uint8Array;
  /** Undirected connected component of each node. */
  comp: Int32Array;
  grid: EdgeGrid;
  /** Fastest class speed in m/s (A* heuristic). */
  maxSpeed: number;
}

export interface Buildings {
  count: number;
  w: number;
  h: number;
  originLon: number;
  originLat: number;
  cellLon: number;
  cellLat: number;
  cellStart: Uint32Array;
  lon: Float64Array;
  lat: Float64Array;
  /** round(16 * log2(footprint m2)). */
  size: Uint8Array;
}

/** What the worker (or the inline fallback) holds: either file may be missing. */
export interface RoadData {
  roads: RoadGraph | null;
  buildings: Buildings | null;
}

// ---------------------------------------------------------------------------- parsing

/** A standalone ArrayBuffer with exactly the file's bytes (typed views need aligned offsets). */
function toBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!ArrayBuffer.isView(input)) return input;
  // A copy: a view may sit inside a larger (pooled or shared) buffer.
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}

function magic(dv: DataView): string {
  return String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
}

const segLenM = (lon1: number, lat1: number, lon2: number, lat2: number) =>
  Math.hypot((lon2 - lon1) * M_PER_DEG * Math.cos(((lat1 + lat2) / 2) * DEG), (lat2 - lat1) * M_PER_DEG);

/** Parse roads-v1.bin and build the search structures. Throws on anything that is not a valid file. */
export function parseRoads(input: ArrayBuffer | Uint8Array): RoadGraph {
  const buf = toBuffer(input);
  if (buf.byteLength < 72) throw new Error('roads: file too short');
  const dv = new DataView(buf);
  if (magic(dv) !== 'EPDR') throw new Error('roads: not a road file');
  if (dv.getUint32(4, true) !== FORMAT_VERSION) throw new Error('roads: unsupported version');
  const N = dv.getUint32(8, true);
  const E = dv.getUint32(12, true);
  const S = dv.getUint32(16, true);
  const bbox: [number, number, number, number] = [
    dv.getFloat64(24, true),
    dv.getFloat64(32, true),
    dv.getFloat64(40, true),
    dv.getFloat64(48, true),
  ];
  const speedKmh = new Uint8Array(buf.slice(56, 72));
  let off = 72;
  const oNodeLon = off;
  off += 4 * N;
  const oNodeLat = off;
  off += 4 * N;
  const oOut = off;
  off = (off + N + 3) & ~3;
  const oB = off;
  off += 4 * E;
  const oCount = off;
  off += 2 * E;
  const oFlags = off;
  off = (off + E + 1) & ~1;
  const oStepLon = off;
  off += 2 * S;
  const oStepLat = off;
  off = (off + 2 * S + 3) & ~3;
  if (off !== buf.byteLength) throw new Error('roads: size does not match the header');

  const nodeLon = new Float64Array(N);
  const nodeLat = new Float64Array(N);
  const qLon = new Int32Array(buf, oNodeLon, N);
  const qLat = new Int32Array(buf, oNodeLat, N);
  for (let i = 0; i < N; i++) {
    nodeLon[i] = qLon[i] / 1e6;
    nodeLat[i] = qLat[i] / 1e6;
  }
  // Edges are sorted by start node: the per-node counts give each edge its start.
  const outCount = new Uint8Array(buf, oOut, N);
  const edgeA = new Uint32Array(E);
  let ea = 0;
  for (let i = 0; i < N; i++) {
    const c = outCount[i];
    if (ea + c > E) throw new Error('roads: edge counts do not add up');
    edgeA.fill(i, ea, ea + c);
    ea += c;
  }
  if (ea !== E) throw new Error('roads: edge counts do not add up');
  const edgeB = new Uint32Array(buf.slice(oB, oB + 4 * E));
  const counts = new Uint16Array(buf, oCount, E);
  const edgeFlags = new Uint8Array(buf.slice(oFlags, oFlags + E));
  const shapeStart = new Uint32Array(E + 1);
  for (let e = 0; e < E; e++) {
    if (edgeB[e] >= N) throw new Error('roads: edge points to a missing node');
    shapeStart[e + 1] = shapeStart[e] + counts[e];
  }
  if (shapeStart[E] !== S) throw new Error('roads: shape counts do not add up');
  // Shape points: 16-bit steps from the previous point, starting at the edge's start node.
  const shapeLon = new Float64Array(S);
  const shapeLat = new Float64Array(S);
  const dLon = new Int16Array(buf, oStepLon, S);
  const dLat = new Int16Array(buf, oStepLat, S);
  for (let e = 0; e < E; e++) {
    let x = qLon[edgeA[e]];
    let y = qLat[edgeA[e]];
    for (let k = shapeStart[e]; k < shapeStart[e + 1]; k++) {
      x += dLon[k];
      y += dLat[k];
      shapeLon[k] = x / 1e6;
      shapeLat[k] = y / 1e6;
    }
  }

  // Lengths and driving times.
  const edgeLen = new Float32Array(E);
  const edgeCost = new Float32Array(E);
  let maxKmh = 1;
  for (let e = 0; e < E; e++) {
    let lon0 = nodeLon[edgeA[e]];
    let lat0 = nodeLat[edgeA[e]];
    let l = 0;
    for (let k = shapeStart[e]; k < shapeStart[e + 1]; k++) {
      l += segLenM(lon0, lat0, shapeLon[k], shapeLat[k]);
      lon0 = shapeLon[k];
      lat0 = shapeLat[k];
    }
    l += segLenM(lon0, lat0, nodeLon[edgeB[e]], nodeLat[edgeB[e]]);
    edgeLen[e] = l;
    const kmh = speedKmh[edgeFlags[e] & 15] || 30;
    if (kmh > maxKmh) maxKmh = kmh;
    edgeCost[e] = l / (kmh / 3.6);
  }

  // Directed adjacency (CSR).
  const deg = new Uint32Array(N + 1);
  for (let e = 0; e < E; e++) {
    deg[edgeA[e]]++;
    if (!(edgeFlags[e] & 16)) deg[edgeB[e]]++;
  }
  const adjStart = new Uint32Array(N + 1);
  for (let i = 0; i < N; i++) adjStart[i + 1] = adjStart[i] + deg[i];
  const fill = adjStart.slice(0, N);
  const adjEdge = new Uint32Array(adjStart[N]);
  const adjFwd = new Uint8Array(adjStart[N]);
  for (let e = 0; e < E; e++) {
    let k = fill[edgeA[e]]++;
    adjEdge[k] = e;
    adjFwd[k] = 1;
    if (!(edgeFlags[e] & 16)) {
      k = fill[edgeB[e]]++;
      adjEdge[k] = e;
      adjFwd[k] = 0;
    }
  }

  // Components (union-find, undirected).
  const comp = new Int32Array(N);
  for (let i = 0; i < N; i++) comp[i] = i;
  const find = (i: number) => {
    while (comp[i] !== i) {
      comp[i] = comp[comp[i]];
      i = comp[i];
    }
    return i;
  };
  for (let e = 0; e < E; e++) {
    const ra = find(edgeA[e]);
    const rb = find(edgeB[e]);
    if (ra !== rb) comp[ra] = rb;
  }
  for (let i = 0; i < N; i++) comp[i] = find(i);

  const g: RoadGraph = {
    nodes: N,
    edges: E,
    nodeLon,
    nodeLat,
    edgeA,
    edgeB,
    edgeFlags,
    shapeStart,
    shapeLon,
    shapeLat,
    edgeLen,
    edgeCost,
    speedKmh,
    bbox,
    adjStart,
    adjEdge,
    adjFwd,
    comp,
    grid: undefined as unknown as EdgeGrid,
    maxSpeed: maxKmh / 3.6,
  };
  g.grid = buildEdgeGrid(g);
  return g;
}

/** Uniform grid over the bbox listing the edges whose segments touch each cell (about 400 m cells). */
function buildEdgeGrid(g: RoadGraph): EdgeGrid {
  const [minLon, minLat, maxLon, maxLat] = g.bbox;
  const midLat = (minLat + maxLat) / 2;
  let cellLat = 400 / M_PER_DEG;
  let cellLon = cellLat / Math.max(0.1, Math.cos(midLat * DEG));
  let w = Math.max(1, Math.floor((maxLon - minLon) / cellLon) + 1);
  let h = Math.max(1, Math.floor((maxLat - minLat) / cellLat) + 1);
  while (w * h > 4_000_000) {
    cellLat *= 2;
    cellLon *= 2;
    w = Math.max(1, Math.floor((maxLon - minLon) / cellLon) + 1);
    h = Math.max(1, Math.floor((maxLat - minLat) / cellLat) + 1);
  }
  const cells = w * h;
  const stamp = new Uint32Array(cells);
  const count = new Uint32Array(cells + 1);
  const visit = (pass: 0 | 1, items?: Uint32Array, fill?: Uint32Array) => {
    stamp.fill(0);
    for (let e = 0; e < g.edges; e++) {
      const tag = e + 1;
      let lon0 = g.nodeLon[g.edgeA[e]];
      let lat0 = g.nodeLat[g.edgeA[e]];
      const n = g.shapeStart[e + 1] - g.shapeStart[e];
      for (let k = 0; k <= n; k++) {
        const lon1 = k < n ? g.shapeLon[g.shapeStart[e] + k] : g.nodeLon[g.edgeB[e]];
        const lat1 = k < n ? g.shapeLat[g.shapeStart[e] + k] : g.nodeLat[g.edgeB[e]];
        const x0 = Math.max(0, Math.floor((Math.min(lon0, lon1) - minLon) / cellLon));
        const x1 = Math.min(w - 1, Math.floor((Math.max(lon0, lon1) - minLon) / cellLon));
        const y0 = Math.max(0, Math.floor((Math.min(lat0, lat1) - minLat) / cellLat));
        const y1 = Math.min(h - 1, Math.floor((Math.max(lat0, lat1) - minLat) / cellLat));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const c = y * w + x;
            if (stamp[c] === tag) continue;
            stamp[c] = tag;
            if (pass === 0) count[c + 1]++;
            else items![fill![c]++] = e;
          }
        }
        lon0 = lon1;
        lat0 = lat1;
      }
    }
  };
  visit(0);
  for (let c = 0; c < cells; c++) count[c + 1] += count[c];
  const items = new Uint32Array(count[cells]);
  const fill = count.slice(0, cells);
  visit(1, items, fill);
  return { originLon: minLon, originLat: minLat, cellLon, cellLat, w, h, start: count, items };
}

/** Parse buildings-v1.bin. Throws on anything that is not a valid file. */
export function parseBuildings(input: ArrayBuffer | Uint8Array): Buildings {
  const buf = toBuffer(input);
  if (buf.byteLength < 56) throw new Error('buildings: file too short');
  const dv = new DataView(buf);
  if (magic(dv) !== 'EPDB') throw new Error('buildings: not a building file');
  if (dv.getUint32(4, true) !== FORMAT_VERSION) throw new Error('buildings: unsupported version');
  const M = dv.getUint32(8, true);
  const w = dv.getUint32(12, true);
  const h = dv.getUint32(16, true);
  const originLon = dv.getFloat64(24, true);
  const originLat = dv.getFloat64(32, true);
  const cellLon = dv.getFloat64(40, true);
  const cellLat = dv.getFloat64(48, true);
  const cells = w * h;
  if (!(cells > 0) || !(cellLon > 0) || !(cellLat > 0)) throw new Error('buildings: bad grid');
  const oStart = 56;
  const oX = oStart + 4 * (cells + 1);
  const oY = oX + 2 * M;
  const oSize = oY + 2 * M;
  const total = (oSize + M + 3) & ~3;
  if (total !== buf.byteLength) throw new Error('buildings: size does not match the header');
  const cellStart = new Uint32Array(buf.slice(oStart, oX));
  if (cellStart[cells] !== M) throw new Error('buildings: grid does not add up');
  const qx = new Uint16Array(buf, oX, M);
  const qy = new Uint16Array(buf, oY, M);
  const size = new Uint8Array(buf.slice(oSize, oSize + M));
  const lon = new Float64Array(M);
  const lat = new Float64Array(M);
  for (let c = 0; c < cells; c++) {
    const cx = c % w;
    const cy = (c - cx) / w;
    const a = cellStart[c];
    const b = cellStart[c + 1];
    if (b < a || b > M) throw new Error('buildings: bad grid');
    for (let i = a; i < b; i++) {
      lon[i] = originLon + (cx + qx[i] / 4096) * cellLon;
      lat[i] = originLat + (cy + qy[i] / 4096) * cellLat;
    }
  }
  return { count: M, w, h, originLon, originLat, cellLon, cellLat, cellStart, lon, lat, size };
}

// ---------------------------------------------------------------------------- nearest queries

export interface EdgeSnap {
  edge: number;
  /** Segment index in the edge polyline (start node, shape points..., end node). */
  seg: number;
  t: number;
  lon: number;
  lat: number;
  /** Distance from the query point in metres. */
  dist: number;
  /** Metres from the edge's start node along the edge. */
  along: number;
}

/** Point i of an edge polyline (0 = start node, last = end node). */
function edgePt(g: RoadGraph, e: number, i: number, out: [number, number]): [number, number] {
  const n = g.shapeStart[e + 1] - g.shapeStart[e];
  if (i === 0) {
    out[0] = g.nodeLon[g.edgeA[e]];
    out[1] = g.nodeLat[g.edgeA[e]];
  } else if (i > n) {
    out[0] = g.nodeLon[g.edgeB[e]];
    out[1] = g.nodeLat[g.edgeB[e]];
  } else {
    out[0] = g.shapeLon[g.shapeStart[e] + i - 1];
    out[1] = g.shapeLat[g.shapeStart[e] + i - 1];
  }
  return out;
}

const edgeCount = (g: RoadGraph, e: number) => g.shapeStart[e + 1] - g.shapeStart[e] + 2;

let gridStamp: Uint32Array | null = null;
let gridStampOwner: RoadGraph | null = null;
let gridGen = 0;

/** Nearest point on any edge within maxM metres (expanding search), or null. */
export function nearestEdge(g: RoadGraph, lon: number, lat: number, maxM: number): EdgeSnap | null {
  if (!g.edges) return null;
  const G = g.grid;
  if (gridStampOwner !== g || !gridStamp) {
    gridStamp = new Uint32Array(g.edges);
    gridStampOwner = g;
    gridGen = 0;
  }
  const kx = M_PER_DEG * Math.cos(lat * DEG);
  const ky = M_PER_DEG;
  const a: [number, number] = [0, 0];
  const b: [number, number] = [0, 0];
  let best: EdgeSnap | null = null;
  let bestD = Infinity;
  for (let r = Math.min(150, maxM); ; r = Math.min(maxM, r * 2)) {
    if (++gridGen >= 0xfffffff0) {
      gridStamp.fill(0);
      gridGen = 1;
    }
    const x0 = Math.max(0, Math.floor((lon - r / kx - G.originLon) / G.cellLon));
    const x1 = Math.min(G.w - 1, Math.floor((lon + r / kx - G.originLon) / G.cellLon));
    const y0 = Math.max(0, Math.floor((lat - r / ky - G.originLat) / G.cellLat));
    const y1 = Math.min(G.h - 1, Math.floor((lat + r / ky - G.originLat) / G.cellLat));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = y * G.w + x;
        for (let k = G.start[c]; k < G.start[c + 1]; k++) {
          const e = G.items[k];
          if (gridStamp[e] === gridGen) continue;
          gridStamp[e] = gridGen;
          const n = edgeCount(g, e);
          edgePt(g, e, 0, a);
          for (let i = 0; i + 1 < n; i++) {
            edgePt(g, e, i + 1, b);
            const ax = (a[0] - lon) * kx;
            const ay = (a[1] - lat) * ky;
            const dx = (b[0] - a[0]) * kx;
            const dy = (b[1] - a[1]) * ky;
            const l2 = dx * dx + dy * dy;
            let t = l2 > 0 ? -(ax * dx + ay * dy) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = ax + t * dx;
            const py = ay + t * dy;
            const d = px * px + py * py;
            if (d < bestD) {
              bestD = d;
              best = {
                edge: e,
                seg: i,
                t,
                lon: a[0] + (b[0] - a[0]) * t,
                lat: a[1] + (b[1] - a[1]) * t,
                dist: 0,
                along: 0,
              };
            }
            a[0] = b[0];
            a[1] = b[1];
          }
        }
      }
    }
    if (best && Math.sqrt(bestD) <= r) break;
    if (r >= maxM) break;
  }
  if (!best) return null;
  best.dist = Math.sqrt(bestD);
  if (best.dist > maxM) return null;
  // Metres from the start node to the snapped point.
  let along = 0;
  edgePt(g, best.edge, 0, a);
  for (let i = 0; i < best.seg; i++) {
    edgePt(g, best.edge, i + 1, b);
    along += segLenM(a[0], a[1], b[0], b[1]);
    a[0] = b[0];
    a[1] = b[1];
  }
  edgePt(g, best.edge, best.seg + 1, b);
  along += segLenM(a[0], a[1], b[0], b[1]) * best.t;
  best.along = Math.min(g.edgeLen[best.edge], along);
  return best;
}

/** The nearest point of one given edge to (lon, lat) (no radius: always an answer). */
export function snapToEdge(g: RoadGraph, e: number, lon: number, lat: number): EdgeSnap {
  const kx = M_PER_DEG * Math.cos(lat * DEG);
  const ky = M_PER_DEG;
  const a: [number, number] = [0, 0];
  const b: [number, number] = [0, 0];
  const n = edgeCount(g, e);
  let best: EdgeSnap = { edge: e, seg: 0, t: 0, lon: g.nodeLon[g.edgeA[e]], lat: g.nodeLat[g.edgeA[e]], dist: 0, along: 0 };
  let bestD = Infinity;
  let walked = 0;
  edgePt(g, e, 0, a);
  for (let i = 0; i + 1 < n; i++) {
    edgePt(g, e, i + 1, b);
    const ax = (a[0] - lon) * kx;
    const ay = (a[1] - lat) * ky;
    const dx = (b[0] - a[0]) * kx;
    const dy = (b[1] - a[1]) * ky;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? -(ax * dx + ay * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = px * px + py * py;
    const segLen = segLenM(a[0], a[1], b[0], b[1]);
    if (d < bestD) {
      bestD = d;
      best = {
        edge: e,
        seg: i,
        t,
        lon: a[0] + (b[0] - a[0]) * t,
        lat: a[1] + (b[1] - a[1]) * t,
        dist: 0,
        along: walked + segLen * t,
      };
    }
    walked += segLen;
    a[0] = b[0];
    a[1] = b[1];
  }
  best.dist = Math.sqrt(bestD);
  best.along = Math.min(g.edgeLen[e], best.along);
  return best;
}

export interface BuildingHit {
  index: number;
  lon: number;
  lat: number;
  dist: number;
  areaM2: number;
}

/**
 * Best building within maxM metres. 'near' = the nearest centroid; 'large' = nearest after a bonus
 * for big footprints (a shopping centre's centroid beats the kiosk next to its entrance).
 */
export function nearestBuilding(
  b: Buildings,
  lon: number,
  lat: number,
  maxM: number,
  mode: 'near' | 'large' = 'near',
): BuildingHit | null {
  if (!b.count) return null;
  const kx = M_PER_DEG * Math.cos(lat * DEG);
  const ky = M_PER_DEG;
  const x0 = Math.max(0, Math.floor((lon - maxM / kx - b.originLon) / b.cellLon));
  const x1 = Math.min(b.w - 1, Math.floor((lon + maxM / kx - b.originLon) / b.cellLon));
  const y0 = Math.max(0, Math.floor((lat - maxM / ky - b.originLat) / b.cellLat));
  const y1 = Math.min(b.h - 1, Math.floor((lat + maxM / ky - b.originLat) / b.cellLat));
  const latLo = lat - maxM / ky;
  const latHi = lat + maxM / ky;
  let best = -1;
  let bestScore = Infinity;
  let bestD = 0;
  const m2 = maxM * maxM;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = y * b.w + x;
      let lo = b.cellStart[c];
      let hi = b.cellStart[c + 1];
      // Buildings of a cell are sorted south to north: binary search the latitude band.
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (b.lat[mid] < latLo) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < b.cellStart[c + 1] && b.lat[i] <= latHi; i++) {
        const dx = (b.lon[i] - lon) * kx;
        const dy = (b.lat[i] - lat) * ky;
        const d2 = dx * dx + dy * dy;
        if (d2 > m2) continue;
        const d = Math.sqrt(d2);
        const score = mode === 'large' ? d - 0.6 * Math.sqrt(2 ** (b.size[i] / 16)) : d;
        if (score < bestScore || (score === bestScore && i < best)) {
          bestScore = score;
          best = i;
          bestD = d;
        }
      }
    }
  }
  if (best < 0) return null;
  return { index: best, lon: b.lon[best], lat: b.lat[best], dist: bestD, areaM2: 2 ** (b.size[best] / 16) };
}

/**
 * Where a point is shown: 'place' = the most prominent building within 200 m (a mall, a station),
 * 'building' = the nearest building within 120 m; both fall back to the nearest road within 300 m;
 * 'road' = the nearest road point within 300 m. null = leave the point where it is.
 */
export function snapPoint(data: RoadData, p: LngLat, kind: SnapKind): LngLat | null {
  if (kind === 'place' || kind === 'building') {
    if (data.buildings) {
      const hit = nearestBuilding(
        data.buildings,
        p[0],
        p[1],
        kind === 'place' ? SNAP_M.place : SNAP_M.building,
        kind === 'place' ? 'large' : 'near',
      );
      if (hit) return [hit.lon, hit.lat];
    }
  }
  if (data.roads) {
    const r = nearestEdge(data.roads, p[0], p[1], SNAP_M.road);
    if (r) return [r.lon, r.lat];
  }
  return null;
}

// ---------------------------------------------------------------------------- routing

/** A drawable path with a cumulative weight per vertex (seconds for road routes, metres otherwise). */
export interface DisplayPath {
  lon: Float64Array;
  lat: Float64Array;
  cum: Float64Array;
}

export interface RoutePath extends DisplayPath {
  lengthM: number;
  /** Driving time at the class speeds (seconds); equals cum[last]. */
  timeS: number;
}

class MinHeap {
  keys = new Float64Array(1024);
  vals = new Int32Array(1024);
  n = 0;
  clear() {
    this.n = 0;
  }
  push(v: number, k: number) {
    if (this.n === this.keys.length) {
      const nk = new Float64Array(this.n * 2);
      nk.set(this.keys);
      this.keys = nk;
      const nv = new Int32Array(this.n * 2);
      nv.set(this.vals);
      this.vals = nv;
    }
    let i = this.n++;
    const K = this.keys;
    const V = this.vals;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= k) break;
      K[i] = K[p];
      V[i] = V[p];
      i = p;
    }
    K[i] = k;
    V[i] = v;
  }
  /** Smallest key (call before pop). */
  top(): number {
    return this.keys[0];
  }
  pop(): number {
    const K = this.keys;
    const V = this.vals;
    const v = V[0];
    const n = --this.n;
    if (n > 0) {
      const k = K[n];
      const x = V[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= k) break;
        K[i] = K[c];
        V[i] = V[c];
        i = c;
      }
      K[i] = k;
      V[i] = x;
    }
    return v;
  }
}

interface SearchState {
  graph: RoadGraph;
  dist: Float64Array;
  seen: Uint32Array;
  done: Uint32Array;
  /** Adjacency index used to reach the node, or SEED_FWD / SEED_BACK for the first node. */
  prev: Int32Array;
  heap: MinHeap;
  gen: number;
}
const SEED_FWD = -2;
const SEED_BACK = -3;
let search: SearchState | null = null;

function searchState(g: RoadGraph): SearchState {
  if (!search || search.graph !== g) {
    search = {
      graph: g,
      dist: new Float64Array(g.nodes),
      seen: new Uint32Array(g.nodes),
      done: new Uint32Array(g.nodes),
      prev: new Int32Array(g.nodes),
      heap: new MinHeap(),
      gen: 0,
    };
  }
  if (++search.gen >= 0xfffffff0) {
    search.seen.fill(0);
    search.done.fill(0);
    search.gen = 1;
  }
  return search;
}

export interface RouteOptions {
  /** How far an end point may be from the nearest road (metres). */
  snapM?: number;
  /** Give up after settling this many nodes (null result, the caller draws a straight line). */
  maxSettled?: number;
  /** Treat one-way roads as two-way (second attempt when the data leaves no legal way). */
  anyDirection?: boolean;
  /** Already snapped ends (the pursuit display keeps a suspect on the road it chose). */
  startOn?: EdgeSnap;
  endOn?: EdgeSnap;
}

interface Adjacency {
  start: Uint32Array;
  edge: Uint32Array;
  fwd: Uint8Array;
}
const undirectedCache = new WeakMap<RoadGraph, Adjacency>();

/** Adjacency with every edge usable both ways (built on first use). */
function undirected(g: RoadGraph): Adjacency {
  let a = undirectedCache.get(g);
  if (a) return a;
  const start = new Uint32Array(g.nodes + 1);
  for (let e = 0; e < g.edges; e++) {
    start[g.edgeA[e] + 1]++;
    start[g.edgeB[e] + 1]++;
  }
  for (let i = 0; i < g.nodes; i++) start[i + 1] += start[i];
  const fill = start.slice(0, g.nodes);
  const edge = new Uint32Array(start[g.nodes]);
  const fwd = new Uint8Array(start[g.nodes]);
  for (let e = 0; e < g.edges; e++) {
    let k = fill[g.edgeA[e]]++;
    edge[k] = e;
    fwd[k] = 1;
    k = fill[g.edgeB[e]]++;
    edge[k] = e;
    fwd[k] = 0;
  }
  a = { start, edge, fwd };
  undirectedCache.set(g, a);
  return a;
}

/** Points of a path under construction, each with the speed (km/h) of the segment that ends there. */
class PathBuilder {
  lon: number[] = [];
  lat: number[] = [];
  kmh: number[] = [];
  add(lon: number, lat: number, kmh: number) {
    const n = this.lon.length;
    if (n && Math.abs(this.lon[n - 1] - lon) < 1e-9 && Math.abs(this.lat[n - 1] - lat) < 1e-9) return;
    this.lon.push(lon);
    this.lat.push(lat);
    this.kmh.push(kmh);
  }
  finish(): RoutePath {
    const n = this.lon.length;
    const lon = Float64Array.from(this.lon);
    const lat = Float64Array.from(this.lat);
    const cum = new Float64Array(n);
    let len = 0;
    for (let i = 1; i < n; i++) {
      const l = segLenM(lon[i - 1], lat[i - 1], lon[i], lat[i]);
      len += l;
      cum[i] = cum[i - 1] + l / (Math.max(1, this.kmh[i]) / 3.6);
    }
    return { lon, lat, cum, lengthM: len, timeS: n ? cum[n - 1] : 0 };
  }
}

/**
 * Shortest-time route between two points on the road graph (A*, binary heap over typed arrays).
 * The end points are snapped to the nearest edge; the result starts at `from` and ends at `to`
 * with short hops between them and the road. null = no road near an end, the ends are not
 * connected (an island without a bridge) or the search gave up.
 */
export function findRoute(g: RoadGraph, from: LngLat, to: LngLat, o: RouteOptions = {}): RoutePath | null {
  const snapM = o.snapM ?? 2500;
  const maxSettled = o.maxSettled ?? 400_000;
  const s = o.startOn ?? nearestEdge(g, from[0], from[1], snapM);
  const t = o.endOn ?? nearestEdge(g, to[0], to[1], snapM);
  if (!s || !t) return null;
  if (g.comp[g.edgeA[s.edge]] !== g.comp[g.edgeA[t.edge]]) return null;
  const kmhOf = (e: number) => g.speedKmh[g.edgeFlags[e] & 15] || 30;
  const any = !!o.anyDirection;
  const oneway = (e: number) => !any && (g.edgeFlags[e] & 16) !== 0;
  const adj: Adjacency = any ? undirected(g) : { start: g.adjStart, edge: g.adjEdge, fwd: g.adjFwd };
  const sCpm = 3.6 / kmhOf(s.edge);
  const tCpm = 3.6 / kmhOf(t.edge);
  const sLen = g.edgeLen[s.edge];
  const tLen = g.edgeLen[t.edge];
  const sA = g.edgeA[s.edge];
  const sB = g.edgeB[s.edge];
  const tA = g.edgeA[t.edge];
  const tB = g.edgeB[t.edge];
  const toA = t.along * tCpm;
  const toB = oneway(t.edge) ? Infinity : (tLen - t.along) * tCpm;

  let best = Infinity;
  let bestEnd = -1;
  let bestViaA = true;
  let direct = false;
  if (s.edge === t.edge) {
    if (t.along >= s.along) best = (t.along - s.along) * sCpm;
    else if (!oneway(s.edge)) best = (s.along - t.along) * sCpm;
    direct = best < Infinity;
  }

  const st = searchState(g);
  const { dist, seen, done, prev, heap } = st;
  const gen = st.gen;
  heap.clear();
  const kx = M_PER_DEG * Math.cos(t.lat * DEG);
  const hScale = 0.95 / g.maxSpeed;
  const h = (n: number) =>
    Math.hypot((g.nodeLon[n] - t.lon) * kx, (g.nodeLat[n] - t.lat) * M_PER_DEG) * hScale;
  const seed = (n: number, cost: number, how: number) => {
    if (seen[n] === gen && dist[n] <= cost) return;
    seen[n] = gen;
    dist[n] = cost;
    prev[n] = how;
    heap.push(n, cost + h(n));
  };
  seed(sB, (sLen - s.along) * sCpm, SEED_FWD);
  if (!oneway(s.edge)) seed(sA, s.along * sCpm, SEED_BACK);

  let settled = 0;
  while (heap.n) {
    if (heap.top() >= best) break;
    const v = heap.pop();
    if (done[v] === gen) continue;
    done[v] = gen;
    if (++settled > maxSettled) break;
    const gv = dist[v];
    if (v === tA && gv + toA < best) {
      best = gv + toA;
      bestEnd = v;
      bestViaA = true;
      direct = false;
    }
    if (v === tB && gv + toB < best) {
      best = gv + toB;
      bestEnd = v;
      bestViaA = false;
      direct = false;
    }
    for (let k = adj.start[v]; k < adj.start[v + 1]; k++) {
      const e = adj.edge[k];
      const w = adj.fwd[k] ? g.edgeB[e] : g.edgeA[e];
      if (done[w] === gen) continue;
      const nd = gv + g.edgeCost[e];
      if (seen[w] !== gen || nd < dist[w]) {
        seen[w] = gen;
        dist[w] = nd;
        prev[w] = k;
        heap.push(w, nd + h(w));
      }
    }
  }
  if (best === Infinity) return null;

  const pb = new PathBuilder();
  const p: [number, number] = [0, 0];
  const dFrom = segLenM(from[0], from[1], s.lon, s.lat);
  if (dFrom > 0.5) pb.add(from[0], from[1], HOP_KMH);
  pb.add(s.lon, s.lat, HOP_KMH);
  const sKmh = kmhOf(s.edge);
  const tKmh = kmhOf(t.edge);
  if (direct) {
    if (t.along >= s.along) for (let i = s.seg + 1; i <= t.seg; i++) pb.add(...edgePt(g, s.edge, i, p), sKmh);
    else for (let i = s.seg; i > t.seg; i--) pb.add(...edgePt(g, s.edge, i, p), sKmh);
    pb.add(t.lon, t.lat, sKmh);
  } else {
    // Walk back from the end node to the seed.
    const chain: number[] = [];
    let v = bestEnd;
    while (prev[v] >= 0) {
      const k = prev[v];
      chain.push(k);
      const e = adj.edge[k];
      v = adj.fwd[k] ? g.edgeA[e] : g.edgeB[e];
    }
    const sn = edgeCount(g, s.edge);
    if (prev[v] === SEED_FWD) for (let i = s.seg + 1; i < sn; i++) pb.add(...edgePt(g, s.edge, i, p), sKmh);
    else for (let i = s.seg; i >= 0; i--) pb.add(...edgePt(g, s.edge, i, p), sKmh);
    for (let c = chain.length - 1; c >= 0; c--) {
      const k = chain[c];
      const e = adj.edge[k];
      const n = edgeCount(g, e);
      const kmh = kmhOf(e);
      if (adj.fwd[k]) for (let i = 1; i < n; i++) pb.add(...edgePt(g, e, i, p), kmh);
      else for (let i = n - 2; i >= 0; i--) pb.add(...edgePt(g, e, i, p), kmh);
    }
    const tn = edgeCount(g, t.edge);
    if (bestViaA) for (let i = 1; i <= t.seg; i++) pb.add(...edgePt(g, t.edge, i, p), tKmh);
    else for (let i = tn - 2; i > t.seg; i--) pb.add(...edgePt(g, t.edge, i, p), tKmh);
    pb.add(t.lon, t.lat, tKmh);
  }
  if (segLenM(to[0], to[1], t.lon, t.lat) > 0.5) pb.add(to[0], to[1], HOP_KMH);
  const out = pb.finish();
  if (out.lon.length < 2) {
    // Both ends on the same road point: a minimal two-point path.
    return pathFromPoints([from, to]) as RoutePath;
  }
  return out;
}

// ---------------------------------------------------------------------------- path helpers

/** A distance-weighted path through the given points (the straight-line fallback). */
export function pathFromPoints(pts: readonly LngLat[]): RoutePath {
  const pb = new PathBuilder();
  for (const q of pts) pb.add(q[0], q[1], 3.6);
  if (pb.lon.length === 1) {
    pb.lon.push(pb.lon[0]);
    pb.lat.push(pb.lat[0]);
    pb.kmh.push(3.6);
  }
  return pb.finish();
}

/** Length of a path in metres. */
export function pathLength(p: DisplayPath): number {
  let l = 0;
  for (let i = 1; i < p.lon.length; i++) l += segLenM(p.lon[i - 1], p.lat[i - 1], p.lon[i], p.lat[i]);
  return l;
}

/** Index i such that cum[i] <= w < cum[i + 1] (clamped to the last segment). */
function segmentAt(p: DisplayPath, w: number): number {
  const c = p.cum;
  let lo = 0;
  let hi = c.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid] <= w) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Heading of segment i, or of the nearest segment with length (0 = north). */
function headingAt(p: DisplayPath, i: number): number {
  const n = p.lon.length;
  for (let k = i; k < n - 1; k++)
    if (p.lon[k] !== p.lon[k + 1] || p.lat[k] !== p.lat[k + 1])
      return bearing([p.lon[k], p.lat[k]], [p.lon[k + 1], p.lat[k + 1]]);
  for (let k = Math.min(i, n - 1); k > 0; k--)
    if (p.lon[k] !== p.lon[k - 1] || p.lat[k] !== p.lat[k - 1])
      return bearing([p.lon[k - 1], p.lat[k - 1]], [p.lon[k], p.lat[k]]);
  return 0;
}

/** Position, heading and segment index at fraction f (0..1) of the path's total weight. */
export function pointAtFraction(p: DisplayPath, f: number): { pos: LngLat; heading: number; index: number } {
  const n = p.lon.length;
  if (n === 0) return { pos: [0, 0], heading: 0, index: 0 };
  if (n === 1) return { pos: [p.lon[0], p.lat[0]], heading: 0, index: 0 };
  const total = p.cum[n - 1];
  const ff = f <= 0 || !(f === f) ? 0 : f >= 1 ? 1 : f;
  if (!(total > 0)) return { pos: [p.lon[n - 1], p.lat[n - 1]], heading: headingAt(p, 0), index: n - 2 };
  const w = ff * total;
  const i = segmentAt(p, w);
  const span = p.cum[i + 1] - p.cum[i];
  const t = span > 0 ? Math.min(1, Math.max(0, (w - p.cum[i]) / span)) : 1;
  return {
    pos: [p.lon[i] + (p.lon[i + 1] - p.lon[i]) * t, p.lat[i] + (p.lat[i + 1] - p.lat[i]) * t],
    heading: headingAt(p, i),
    index: i,
  };
}

/** The part of the path still ahead at fraction f: `current` (or the point at f) and the later vertices. */
export function remainingAt(p: DisplayPath, f: number, current?: LngLat): LngLat[] {
  const at = pointAtFraction(p, f);
  const out: LngLat[] = [current ?? at.pos];
  for (let i = at.index + 1; i < p.lon.length; i++) out.push([p.lon[i], p.lat[i]]);
  return out;
}

/** First and last vertex of a path. */
export function pathEnds(p: DisplayPath): [LngLat, LngLat] {
  const n = p.lon.length;
  return [
    [p.lon[0], p.lat[0]],
    [p.lon[n - 1], p.lat[n - 1]],
  ];
}

// ---------------------------------------------------------------------------- loading

export interface LoadResult {
  data: RoadData | null;
  /** Why a file is not used: 'missing' (404, HTML fallback, bad file) or 'network'. */
  roads: 'ok' | 'missing' | 'network';
  buildings: 'ok' | 'missing' | 'network';
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchFile<T>(
  fetchFn: FetchLike,
  url: string,
  parse: (b: ArrayBuffer) => T,
): Promise<{ v: T | null; why: 'ok' | 'missing' | 'network' }> {
  let res: Response;
  try {
    res = await fetchFn(url, { credentials: 'same-origin' });
  } catch {
    return { v: null, why: 'network' };
  }
  if (!res.ok) return { v: null, why: res.status >= 500 ? 'network' : 'missing' };
  const type = res.headers.get('content-type') ?? '';
  if (/text\/html/i.test(type)) return { v: null, why: 'missing' };
  try {
    const buf = await res.arrayBuffer();
    return { v: parse(buf), why: 'ok' };
  } catch {
    return { v: null, why: 'missing' };
  }
}

/**
 * Fetch and parse both files from `${base}tiles/`. Never throws: a missing file (404, an SPA
 * fallback page, a damaged or older file) or a network error leaves that part null.
 */
export async function loadRoadData(base: string, fetchFn: FetchLike): Promise<LoadResult> {
  const dir = `${base.endsWith('/') ? base : `${base}/`}tiles/`;
  const [r, b] = await Promise.all([
    fetchFile(fetchFn, dir + ROADS_FILE, parseRoads),
    fetchFile(fetchFn, dir + BUILDINGS_FILE, parseBuildings),
  ]);
  const data = r.v || b.v ? { roads: r.v, buildings: b.v } : null;
  return { data, roads: r.why, buildings: b.why };
}

// ---------------------------------------------------------------------------- requests

export interface RouteAnswer {
  /** Where the path starts and ends after snapping (the display coordinates of both ends). */
  from: LngLat;
  to: LngLat;
  /** Road route, or null when there is none (the caller draws its fallback between from and to). */
  path: RoutePath | null;
}

/** One route request as the worker answers it: snap both ends as asked, then route between them. */
export function computeRoute(
  data: RoadData,
  from: LngLat,
  fromSnap: SnapKind | null,
  to: LngLat,
  toSnap: SnapKind | null,
): RouteAnswer {
  const f = fromSnap ? (snapPoint(data, from, fromSnap) ?? from) : from;
  const t = toSnap ? (snapPoint(data, to, toSnap) ?? to) : to;
  let path: RoutePath | null = null;
  if (data.roads) {
    try {
      // A one-way trap at the data's edge (or a mapping error) must not cost the road line.
      path =
        findRoute(data.roads, f, t) ??
        findRoute(data.roads, f, t, { anyDirection: true, maxSettled: 150_000 });
    } catch {
      path = null;
    }
  }
  return { from: f, to: t, path };
}

// ---------------------------------------------------------------------------- pursuit hops

/**
 * Anti zig-zag rule for a fleeing suspect: a candidate road point costs its distance plus a penalty,
 * and the cheapest one wins. The edge it is on and the road going straight on from its end ahead
 * (the end nearer the engine position) cost nothing extra, the recently driven edges NEAR_EDGE_M,
 * a turn into a side street TURN_M and any other road STICKY_M. So a parallel road has to be that
 * much nearer before the suspect changes over to it (and the same again to change back), and a side
 * street is only taken when the engine position has really left the road.
 */
export const STICKY_M = 25;
/** Penalty (metres) of the recently driven edges. */
export const NEAR_EDGE_M = 8;
/** Penalty (metres) of the side streets meeting the current edge (not straight on). */
export const TURN_M = 20;
/** Within this angle (degrees) a meeting edge counts as going straight on. */
const STRAIGHT_ON_DEG = 40;
/** How many recently driven edges the display remembers. */
export const HOP_HISTORY = 6;
/** A hop may go back against the direction of travel by at most this much (metres) ... */
export const TURN_BACK_M = 10;
/**
 * ... unless the engine itself turned back, or the end of the drawn path is this far (metres, or 1.5
 * engine steps) from the engine position: then the display has to catch up whichever way.
 */
export const HOLD_MAX_M = 45;
/** A hop's road path may be at most 1.6 x the straight distance + this (metres), else it is a detour. */
export const HOP_DETOUR_M = 60;
/** Short hops never need a big search: give up after settling this many nodes. */
const HOP_MAX_SETTLED = 6000;
/** At most this many candidate road points are tried per hop. */
const HOP_CANDIDATES = 4;
/**
 * A suspect further than this (metres) from every road (a park, a square, open country) is shown
 * where the engine has it, and is put back on the roads when one is this near again.
 */
export const OFF_ROAD_M = 150;

export interface HopRequest {
  /** Where the previous hop ended (the end of the displayed path). */
  from: LngLat;
  /** Edge the previous hop ended on (-1 = not on a road). */
  fromEdge: number;
  /** Recently driven edges, oldest first. */
  history: readonly number[];
  /** The engine's new position. */
  to: LngLat;
  /** Direction of travel at `from` (degrees; absent at the start). */
  travel?: number;
  /** The engine position of the previous hop request (absent at the start). */
  prev?: LngLat;
}

export interface HopAnswer {
  from: LngLat;
  /** Where the hop ends: the chosen road point, or the engine position when no road is near. */
  to: LngLat;
  /** Edge of `to` (-1 = not on a road). */
  edge: number;
  /** Road path from `from` to `to`, or null = draw the hop straight. */
  path: RoutePath | null;
  /** Nothing to draw yet: every road way there turns back (wait for the next engine position). */
  hold?: boolean;
}

/** Undirected neighbours of an edge at one of its nodes (or both): the edges sharing that node. */
export function edgesMeeting(g: RoadGraph, e: number, node?: number): number[] {
  const adj = undirected(g);
  const out: number[] = [];
  for (const n of node === undefined ? [g.edgeA[e], g.edgeB[e]] : [node])
    for (let k = adj.start[n]; k < adj.start[n + 1]; k++) if (adj.edge[k] !== e && !out.includes(adj.edge[k])) out.push(adj.edge[k]);
  return out;
}

const angleBetween = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);

/** Direction (degrees) of edge e at one of its nodes: arriving at the node, or leaving it. */
function dirAtNode(g: RoadGraph, e: number, node: number, leaving: boolean): number {
  const n = edgeCount(g, e);
  const p: [number, number] = [0, 0];
  const q: [number, number] = [0, 0];
  const atA = g.edgeA[e] === node;
  // The node itself and its neighbouring polyline point.
  edgePt(g, e, atA ? 0 : n - 1, p);
  edgePt(g, e, atA ? 1 : n - 2, q);
  return leaving ? bearing([p[0], p[1]], [q[0], q[1]]) : bearing([q[0], q[1]], [p[0], p[1]]);
}

export interface SnapCandidate {
  snap: EdgeSnap;
  /** Distance plus the anti zig-zag penalty (lower is better). */
  score: number;
}

/**
 * Candidate road points for a moving suspect at p, best first (see STICKY_M): `current` is the edge
 * it is on (-1 = none), `history` the recently driven edges. Only candidates within tolM of the
 * best score are kept. Empty = no road within maxM metres.
 */
export function snapCandidates(
  g: RoadGraph,
  p: LngLat,
  current: number,
  history: readonly number[],
  tolM = STICKY_M,
  maxM: number = SNAP_M.road,
  limit = HOP_CANDIDATES,
): SnapCandidate[] {
  const nearest = nearestEdge(g, p[0], p[1], maxM);
  if (!nearest) return [];
  const byEdge = new Map<number, SnapCandidate>();
  const add = (snap: EdgeSnap, score: number) => {
    const old = byEdge.get(snap.edge);
    if (!old || score < old.score) byEdge.set(snap.edge, { snap, score });
  };
  add(nearest, nearest.dist + tolM);
  const consider = (e: number, penalty: number) => {
    if (!(e >= 0 && e < g.edges)) return;
    const s = snapToEdge(g, e, p[0], p[1]);
    if (s.dist <= maxM) add(s, s.dist + penalty);
  };
  const near = Math.min(tolM, NEAR_EDGE_M);
  const turn = Math.min(tolM, TURN_M);
  if (current >= 0 && current < g.edges) {
    consider(current, 0);
    const a = g.edgeA[current];
    const b = g.edgeB[current];
    const da = segLenM(g.nodeLon[a], g.nodeLat[a], p[0], p[1]);
    const db = segLenM(g.nodeLon[b], g.nodeLat[b], p[0], p[1]);
    const [ahead, behind] = da <= db ? [a, b] : [b, a];
    const arrive = dirAtNode(g, current, ahead, false);
    for (const e of edgesMeeting(g, current, ahead)) {
      const straightOn = angleBetween(arrive, dirAtNode(g, e, ahead, true)) <= STRAIGHT_ON_DEG;
      consider(e, straightOn ? 0 : turn);
    }
    for (const e of edgesMeeting(g, current, behind)) consider(e, turn);
  }
  for (const e of history) if (e !== current) consider(e, near);
  const all = [...byEdge.values()].sort((a, b) => a.score - b.score || a.snap.edge - b.snap.edge);
  const out = all.filter((c) => c.score <= all[0].score + tolM).slice(0, limit);
  // The nearest road itself is always among them.
  if (!out.some((c) => c.snap.edge === nearest.edge)) out.push(byEdge.get(nearest.edge)!);
  return out;
}

/** The best candidate of snapCandidates (null = no road near). */
export function stickySnap(
  g: RoadGraph,
  p: LngLat,
  current: number,
  history: readonly number[],
  tolM = STICKY_M,
  maxM: number = SNAP_M.road,
): EdgeSnap | null {
  return snapCandidates(g, p, current, history, tolM, maxM, 1)[0]?.snap ?? null;
}

/** How far (metres) a path goes back behind its start against the given direction. */
export function backtrackM(path: DisplayPath, travel: number): number {
  const n = path.lon.length;
  if (n < 2) return 0;
  const ux = Math.sin(travel * DEG);
  const uy = Math.cos(travel * DEG);
  const kx = M_PER_DEG * Math.cos(path.lat[0] * DEG);
  let min = 0;
  for (let i = 1; i < n; i++) {
    const d = (path.lon[i] - path.lon[0]) * kx * ux + (path.lat[i] - path.lat[0]) * M_PER_DEG * uy;
    if (d < min) min = d;
  }
  return -min;
}

/**
 * One short hop of a fleeing suspect on the map: from the end of the previous hop to a road point of
 * the engine's new position (see snapCandidates), along the roads, without turning back against the
 * direction of travel unless the engine did. When every road way there turns back or is a long
 * detour the answer is to hold (nothing to draw until the next position), unless the drawn path is
 * already far behind: then a route that turns back is taken, and when there is only a long detour a
 * straight hop. No road near the engine position: a straight hop to the position itself.
 */
export function computeHop(data: RoadData, q: HopRequest): HopAnswer {
  const g = data.roads;
  const straight = (to: LngLat, edge: number): HopAnswer => ({ from: q.from, to, edge, path: null });
  if (!g) return straight(q.to, -1);
  const cur = q.fromEdge >= 0 && q.fromEdge < g.edges ? q.fromEdge : -1;
  const cands = snapCandidates(g, q.to, cur, q.history, STICKY_M, OFF_ROAD_M);
  if (!cands.length) return straight(q.to, -1);
  const first = cands[0].snap;
  const firstPt: LngLat = [first.lon, first.lat];
  const s = cur >= 0 ? snapToEdge(g, cur, q.from[0], q.from[1]) : nearestEdge(g, q.from[0], q.from[1], SNAP_M.road);
  if (!s) return straight(firstPt, first.edge);
  const step = q.prev ? segLenM(q.prev[0], q.prev[1], q.to[0], q.to[1]) : 0;
  const far = segLenM(q.from[0], q.from[1], q.to[0], q.to[1]) > Math.max(HOLD_MAX_M, 1.5 * step);
  const turned =
    q.travel === undefined ||
    !q.prev ||
    step < 0.5 ||
    angleBetween(q.travel, bearing(q.prev, q.to)) > 110;
  const routes: { c: EdgeSnap; path: RoutePath; direct: number }[] = [];
  for (const { snap: c } of cands) {
    const target: LngLat = [c.lon, c.lat];
    let path: RoutePath | null = null;
    try {
      path = findRoute(g, q.from, target, { startOn: s, endOn: c, anyDirection: true, maxSettled: HOP_MAX_SETTLED });
    } catch {
      path = null;
    }
    // No route, or no progress (the end of a dead end, a junction the engine went straight past).
    if (!path || path.lengthM < 1) continue;
    const direct = segLenM(q.from[0], q.from[1], target[0], target[1]);
    routes.push({ c, path, direct });
    const detour = path.lengthM > 1.6 * direct + HOP_DETOUR_M;
    const back = !turned && q.travel !== undefined && backtrackM(path, q.travel) > TURN_BACK_M;
    if (!detour && !back) return { from: q.from, to: target, edge: c.edge, path };
  }
  if (!far && cur >= 0) return { from: q.from, to: q.from, edge: cur, path: null, hold: true };
  // Far behind: catch up with the road point nearest the engine, by a route even if it turns back
  // but never by a long detour; else straight to it; with no other road point, straight to the
  // engine position itself (until a road is near it again).
  routes.sort((a, b) => a.c.dist - b.c.dist);
  for (const r of routes)
    if (r.path.lengthM <= 1.6 * r.direct + HOP_DETOUR_M) return { from: q.from, to: [r.c.lon, r.c.lat], edge: r.c.edge, path: r.path };
  const away = cands
    .map((c) => c.snap)
    .filter((c) => segLenM(q.from[0], q.from[1], c.lon, c.lat) >= 1)
    .sort((a, b) => a.dist - b.dist)[0];
  return away ? straight([away.lon, away.lat], away.edge) : straight(q.to, -1);
}
