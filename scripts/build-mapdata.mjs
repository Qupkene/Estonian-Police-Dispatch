#!/usr/bin/env node
/*
 * build-mapdata.mjs: car road graph and building centroids for EPD, derived from the self-hosted
 * street map (a Protomaps v4 basemap PMTiles archive). No network, no external service.
 *
 *   node scripts/build-mapdata.mjs <estonia.pmtiles> <output directory>
 *
 * Reads every tile at zoom 15 (the deepest Protomaps zoom and the only one that carries every
 * building; an archive that stops earlier is read at its own deepest zoom), one tile at a time, and
 * writes into the output directory:
 *
 *   roads-v1.bin, roads-v1.bin.gz          car road graph
 *   buildings-v1.bin, buildings-v1.bin.gz  building centroids with a size class and a grid index
 *
 * The .gz files are gzip copies for Caddy (`file_server { precompressed gzip }` sends them with
 * Content-Encoding: gzip, the browser unpacks them). Every file is first written to a temporary
 * name in the output directory and then renamed over the old one, so a reader sees the old or the
 * new file, never half of one, and a failure leaves the old files in place (exit code 1).
 *
 * Memory: decoded features live only while their tile is processed; what accumulates are compact
 * typed arrays (road vertices, graph nodes and edges, building centroids). The whole of Estonia
 * fits well inside the 3 GB build container of deploy/mainserver/politsei-uuenda.sh.
 *
 * Roads: the `roads` layer, car kinds only (highway, major_road, minor_road, living streets; no
 * paths, tracks, rail, ferries, race tracks, parking aisles or drive-throughs). Lines are clipped to
 * the exact tile square (tiles carry a buffer), T-junctions whose shared vertex was simplified away
 * are re-attached, pieces are joined across tile borders by snapping their border end points
 * (spatial hash), components shorter than MIN_COMPONENT_M are dropped, chains of degree-2 nodes are
 * merged into one edge and simplified (Douglas-Peucker, SIMPLIFY_M). `oneway` is respected
 * (motorways are one-way unless tagged otherwise, as in OSM).
 *
 * Buildings: area-weighted centroids of the `buildings` layer polygons (building parts skipped),
 * clipped to the exact tile square; a building cut by tile borders is put back together by its
 * feature id. Buildings smaller than MIN_BUILDING_M2 (sheds, saunas) are left out.
 *
 * File formats (little-endian; read by src/map/roadGraph.ts, keep both in sync):
 *
 * roads-v1.bin
 *   0   char[4]  "EPDR"
 *   4   u32      version (1)
 *   8   u32      node count N
 *   12  u32      edge count E
 *   16  u32      shape point count S (intermediate points of all edges)
 *   20  u32      flags (0)
 *   24  f64[4]   bbox: min lon, min lat, max lon, max lat
 *   56  u8[16]   speed in km/h for each road class (index = class)
 *   72  i32[N]   node lon, 1e-6 degrees
 *       i32[N]   node lat, 1e-6 degrees
 *       u8[N]    number of edges that start at each node (edges are sorted by start node)
 *       (zero padding to a multiple of 4)
 *       u32[E]   edge end node
 *       u16[E]   edge shape point count (the points follow each other, edge by edge)
 *       u8[E]    edge flags: bits 0-3 road class, bit 4 one-way (start to end only)
 *       (zero padding to a multiple of 2)
 *       i16[S]   shape lon step, 1e-6 degrees, from the previous point (the edge's start node first)
 *       i16[S]   shape lat step
 *       (zero padding to a multiple of 4)
 *   Nodes are in spatial (Morton) order. The last step of an edge, to its end node, is not stored.
 *   A step that would not fit in 16 bits is split by extra points on the same straight line.
 *
 * buildings-v1.bin
 *   0   char[4]  "EPDB"
 *   4   u32      version (1)
 *   8   u32      building count M
 *   12  u32      grid width W (cells)
 *   16  u32      grid height H
 *   20  u32      flags (0)
 *   24  f64[4]   grid origin lon, origin lat, cell width (degrees lon), cell height (degrees lat)
 *   56  u32[W*H+1] first building of each cell (row-major, row 0 = southmost); the last entry is M
 *       u16[M]   lon inside the cell in 1/4096 of the cell width (0..4095, about 0.6 m steps)
 *       u16[M]   lat inside the cell in 1/4096 of the cell height (0..4095)
 *       u8[M]    size class: round(16 * log2(footprint m2)), clamped to 0..255
 */
import { open, rename, unlink, mkdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { bytesToHeader, readVarint, tileIdToZxy, Compression } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

export const ROADS_FILE = 'roads-v1.bin';
export const BUILDINGS_FILE = 'buildings-v1.bin';
const ROADS_MAGIC = 'EPDR';
const BUILDINGS_MAGIC = 'EPDB';
const FORMAT_VERSION = 1;

/** Road classes: index = class id in the file, km/h = typical free-flow speed for the time weights. */
export const ROAD_CLASSES = [
  { name: 'motorway', kmh: 110 },
  { name: 'trunk', kmh: 90 },
  { name: 'primary', kmh: 80 },
  { name: 'secondary', kmh: 70 },
  { name: 'tertiary', kmh: 60 },
  { name: 'link', kmh: 50 },
  { name: 'unclassified', kmh: 50 },
  { name: 'residential', kmh: 40 },
  { name: 'living_street', kmh: 15 },
  { name: 'service', kmh: 20 },
];
const C = Object.fromEntries(ROAD_CLASSES.map((c, i) => [c.name, i]));

/** Read tiles at this zoom (or the archive's deepest zoom when it stops earlier). */
const TARGET_ZOOM = 15;
/** World size in global units: zoom 15 tiles of 4096 units. */
const WORLD = 2 ** 15 * 4096;
const EARTH_CIRC_M = 40075016.686;
/** Border end points closer than this are the same point (tiles clip one line slightly differently). */
const BORDER_SNAP_M = 1.5;
/** A road end this close to another road (but not on one of its vertices) joins it there. */
const T_JUNCTION_M = 1.2;
/** Douglas-Peucker tolerance for the final edge shapes. */
const SIMPLIFY_M = 1.5;
/** Light simplification of the raw tile geometry before it is kept (drops collinear vertices). */
const PRESIMPLIFY_M = 0.15;
/** Connected road pieces shorter than this in total (parking loops, broken fragments) are dropped. */
const MIN_COMPONENT_M = 1000;
/** Smaller footprints (sheds, saunas, garages) are not incident sites. */
const MIN_BUILDING_M2 = 40;
/** Building grid cell (degrees): about 2.2 km x 2.3 km in Estonia. */
const CELL_LON = 0.04;
const CELL_LAT = 0.02;
const SERVICE_SKIP = new Set(['parking_aisle', 'drive-through', 'drive_through', 'emergency_access']);
const MINOR_SKIP = new Set([
  'raceway',
  'busway',
  'bus_guideway',
  'construction',
  'proposed',
  'abandoned',
  'platform',
]);

// ---------------------------------------------------------------------------- growable arrays

class Grow {
  constructor(Type, cap = 1024) {
    this.Type = Type;
    this.a = new Type(cap);
    this.n = 0;
  }
  push(v) {
    if (this.n === this.a.length) {
      const b = new this.Type(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
  view() {
    return this.a.subarray(0, this.n);
  }
}

// ---------------------------------------------------------------------------- projection helpers

const latOfY = (gy) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / WORLD))) * 180) / Math.PI;
const lonOfX = (gx) => (gx / WORLD) * 360 - 180;
/** Metres per global unit at a global y. */
const unitM = (gy) => (EARTH_CIRC_M * Math.cos((latOfY(gy) * Math.PI) / 180)) / WORLD;

// ---------------------------------------------------------------------------- road attributes

/** Road class of a `roads` feature, or -1 when it is not a car road. */
export function roadClass(p) {
  const kind = p.kind;
  const d = typeof p.kind_detail === 'string' ? p.kind_detail : '';
  const link = p.is_link === true || p.is_link === 'true' || d.endsWith('_link');
  if (kind === 'highway') return link ? C.link : C.motorway;
  if (kind === 'major_road') {
    if (link) return C.link;
    if (d === 'trunk') return C.trunk;
    if (d === 'primary') return C.primary;
    if (d === 'tertiary') return C.tertiary;
    return C.secondary;
  }
  if (kind === 'minor_road') {
    if (MINOR_SKIP.has(d)) return -1;
    if (d === 'service') return SERVICE_SKIP.has(String(p.service ?? '')) ? -1 : C.service;
    if (d === 'living_street') return C.living_street;
    if (d === 'unclassified' || d === 'road') return C.unclassified;
    return C.residential;
  }
  if (kind === 'other' && d === 'living_street') return C.living_street;
  return -1;
}

/** 1 = one-way along the geometry, -1 = one-way against it, 0 = both ways. */
export function onewayOf(p, cls) {
  const o = p.oneway;
  if (o === undefined || o === null || o === '')
    return cls === C.motorway || (cls === C.link && p.kind === 'highway') ? 1 : 0;
  if (o === true || o === 'yes' || o === 'true' || o === '1' || o === 1) return 1;
  if (o === '-1' || o === -1 || o === 'reverse') return -1;
  return 0;
}

// ---------------------------------------------------------------------------- geometry helpers

/**
 * Clip a polyline to the square [0, e] x [0, e] (Liang-Barsky per segment). Appends pieces (flat
 * [x0, y0, x1, y1, ...] arrays) to `out`.
 */
export function clipLine(pts, e, out) {
  let cur = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i].x;
    const ay = pts[i].y;
    const dx = pts[i + 1].x - ax;
    const dy = pts[i + 1].y - ay;
    if (dx === 0 && dy === 0) continue;
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    const p = [-dx, dx, -dy, dy];
    const q = [ax, e - ax, ay, e - ay];
    for (let k = 0; k < 4 && inside; k++) {
      if (p[k] === 0) {
        if (q[k] < 0) inside = false;
      } else {
        const r = q[k] / p[k];
        if (p[k] < 0) {
          if (r > t1) inside = false;
          else if (r > t0) t0 = r;
        } else if (r < t0) inside = false;
        else if (r < t1) t1 = r;
      }
    }
    if (!inside || t1 - t0 <= 0) {
      cur = null;
      continue;
    }
    const sx = t0 === 0 ? ax : ax + t0 * dx;
    const sy = t0 === 0 ? ay : ay + t0 * dy;
    const ex = t1 === 1 ? ax + dx : ax + t1 * dx;
    const ey = t1 === 1 ? ay + dy : ay + t1 * dy;
    if (cur && t0 === 0) cur.push(ex, ey);
    else {
      cur = [sx, sy, ex, ey];
      out.push(cur);
    }
    if (t1 < 1) cur = null;
  }
}

/** Clip a polygon ring to the square [0, e] x [0, e] (Sutherland-Hodgman). Returns flat [x, y, ...]. */
export function clipRing(pts, e) {
  let poly = [];
  for (const pt of pts) poly.push(pt.x, pt.y);
  // Drop the closing duplicate if present.
  const n0 = poly.length;
  if (n0 >= 4 && poly[0] === poly[n0 - 2] && poly[1] === poly[n0 - 1]) poly.length = n0 - 2;
  const edges = [(x, y) => x >= 0, (x, y) => x <= e, (x, y) => y >= 0, (x, y) => y <= e];
  const cut = [
    (ax, ay, bx, by) => [0, ay + ((by - ay) * (0 - ax)) / (bx - ax)],
    (ax, ay, bx, by) => [e, ay + ((by - ay) * (e - ax)) / (bx - ax)],
    (ax, ay, bx, by) => [ax + ((bx - ax) * (0 - ay)) / (by - ay), 0],
    (ax, ay, bx, by) => [ax + ((bx - ax) * (e - ay)) / (by - ay), e],
  ];
  for (let k = 0; k < 4; k++) {
    const inside = edges[k];
    const out = [];
    const n = poly.length / 2;
    if (!n) break;
    for (let i = 0; i < n; i++) {
      const cx = poly[2 * i];
      const cy = poly[2 * i + 1];
      const j = (i + n - 1) % n;
      const px = poly[2 * j];
      const py = poly[2 * j + 1];
      const cin = inside(cx, cy);
      const pin = inside(px, py);
      if (cin) {
        if (!pin) out.push(...cut[k](px, py, cx, cy));
        out.push(cx, cy);
      } else if (pin) out.push(...cut[k](px, py, cx, cy));
    }
    poly = out;
  }
  return poly;
}

/** Signed area and centroid moments of a flat ring. Returns [area, momentX, momentY]. */
function ringMoments(r) {
  let a = 0;
  let mx = 0;
  let my = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = r[2 * i];
    const y0 = r[2 * i + 1];
    const x1 = r[2 * j];
    const y1 = r[2 * j + 1];
    const c = x0 * y1 - x1 * y0;
    a += c;
    mx += (x0 + x1) * c;
    my += (y0 + y1) * c;
  }
  return [a / 2, mx / 6, my / 6];
}

/** Douglas-Peucker on flat [x, y, ...]; tol in the same units. Returns a new flat array. */
export function simplifyFlat(c, tol) {
  const n = c.length / 2;
  if (n <= 2) return c.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [0, n - 1];
  const t2 = tol * tol;
  while (stack.length) {
    const j = stack.pop();
    const i = stack.pop();
    const ax = c[2 * i];
    const ay = c[2 * i + 1];
    const bx = c[2 * j];
    const by = c[2 * j + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = t2;
    for (let k = i + 1; k < j; k++) {
      const px = c[2 * k] - ax;
      const py = c[2 * k + 1] - ay;
      let d2;
      if (l2 === 0) d2 = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / l2));
        const qx = px - t * dx;
        const qy = py - t * dy;
        d2 = qx * qx + qy * qy;
      }
      if (d2 > bestD) {
        bestD = d2;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push(i, best, best, j);
    }
  }
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(c[2 * k], c[2 * k + 1]);
  return out;
}

// ---------------------------------------------------------------------------- PMTiles reading

function decompress(buf, compression) {
  if (compression === Compression.None || compression === Compression.Unknown) {
    // Unknown: sniff gzip.
    if (compression === Compression.Unknown && buf[0] === 0x1f && buf[1] === 0x8b)
      return zlib.gunzipSync(buf);
    return buf;
  }
  if (compression === Compression.Gzip) return zlib.gunzipSync(buf);
  if (compression === Compression.Brotli) return zlib.brotliDecompressSync(buf);
  if (compression === Compression.Zstd && typeof zlib.zstdDecompressSync === 'function')
    return zlib.zstdDecompressSync(buf);
  throw new Error(`unsupported compression ${compression}`);
}

function parseDirectory(buf) {
  const p = { buf: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), pos: 0 };
  const n = readVarint(p);
  const entries = new Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last += readVarint(p);
    entries[i] = { tileId: last, runLength: 1, length: 0, offset: 0 };
  }
  for (let i = 0; i < n; i++) entries[i].runLength = readVarint(p);
  for (let i = 0; i < n; i++) entries[i].length = readVarint(p);
  for (let i = 0; i < n; i++) {
    const v = readVarint(p);
    entries[i].offset = v === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : v - 1;
  }
  return entries;
}

class Archive {
  static async open(path) {
    const a = new Archive();
    a.fh = await open(path, 'r');
    const head = await a.read(0, 127);
    a.header = bytesToHeader(head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength));
    if (a.header.specVersion < 3)
      throw new Error(`PMTiles spec version ${a.header.specVersion} is not supported (need 3)`);
    return a;
  }
  async read(offset, length) {
    const b = Buffer.alloc(length);
    let got = 0;
    while (got < length) {
      const { bytesRead } = await this.fh.read(b, got, length - got, offset + got);
      if (!bytesRead) throw new Error(`unexpected end of file at ${offset + got}`);
      got += bytesRead;
    }
    return b;
  }
  async directory(offset, length) {
    return parseDirectory(decompress(await this.read(offset, length), this.header.internalCompression));
  }
  /** Every tile entry of one zoom level: [{ tileId, offset, length }] with runs expanded, in id order. */
  async tilesAt(z) {
    const lo = (4 ** z - 1) / 3;
    const hi = (4 ** (z + 1) - 1) / 3;
    const out = [];
    const h = this.header;
    const walk = async (offset, length, depth) => {
      if (depth > 4) throw new Error('PMTiles directory nesting too deep');
      const entries = await this.directory(offset, length);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.runLength === 0) {
          const end = i + 1 < entries.length ? entries[i + 1].tileId : Infinity;
          if (end <= lo || e.tileId >= hi) continue;
          await walk(h.leafDirectoryOffset + e.offset, e.length, depth + 1);
          continue;
        }
        for (let k = 0; k < e.runLength; k++) {
          const id = e.tileId + k;
          if (id < lo) continue;
          if (id >= hi) break;
          out.push({ tileId: id, offset: h.tileDataOffset + e.offset, length: e.length });
        }
      }
    };
    await walk(h.rootDirectoryOffset, h.rootDirectoryLength, 0);
    out.sort((a, b) => a.tileId - b.tileId);
    return out;
  }
  async tile(entry) {
    return decompress(await this.read(entry.offset, entry.length), this.header.tileCompression);
  }
  async close() {
    await this.fh?.close();
  }
}

// ---------------------------------------------------------------------------- accumulation

class Accumulator {
  constructor() {
    // Graph nodes in global units.
    this.nodeX = new Grow(Float64Array);
    this.nodeY = new Grow(Float64Array);
    // Border nodes: spatial hash (cell key -> first node), chained through borderNext.
    this.borderHead = new Map();
    this.borderNext = new Grow(Int32Array);
    this.cell = 16;
    // Edges.
    this.edgeA = new Grow(Uint32Array);
    this.edgeB = new Grow(Uint32Array);
    this.edgeCls = new Grow(Uint8Array);
    this.edgeOw = new Grow(Uint8Array);
    this.edgeStart = new Grow(Uint32Array);
    this.edgeCount = new Grow(Uint32Array);
    this.shapeX = new Grow(Float64Array, 4096);
    this.shapeY = new Grow(Float64Array, 4096);
    // Buildings.
    this.bX = new Grow(Float64Array);
    this.bY = new Grow(Float64Array);
    this.bArea = new Grow(Float32Array);
    this.cut = new Map(); // feature id -> [areaM2, sum x * area, sum y * area]
    this.tiles = 0;
    this.roadTiles = 0;
  }

  newNode(x, y) {
    this.nodeX.push(x);
    this.nodeY.push(y);
    this.borderNext.push(-1);
    return this.nodeX.n - 1;
  }

  /** A node on a tile border: reuse one within `tol` global units, else add it to the hash. */
  borderNode(x, y, tol) {
    const c = this.cell;
    const cx = Math.floor(x / c);
    const cy = Math.floor(y / c);
    let best = -1;
    let bestD = tol * tol;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        let n = this.borderHead.get((cx + i) * 67108864 + (cy + j));
        while (n !== undefined && n >= 0) {
          const dx = this.nodeX.a[n] - x;
          const dy = this.nodeY.a[n] - y;
          const d = dx * dx + dy * dy;
          if (d <= bestD) {
            bestD = d;
            best = n;
          }
          n = this.borderNext.a[n];
        }
      }
    }
    if (best >= 0) return best;
    const id = this.newNode(x, y);
    const key = cx * 67108864 + cy;
    const head = this.borderHead.get(key);
    this.borderNext.a[id] = head === undefined ? -1 : head;
    this.borderHead.set(key, id);
    return id;
  }

  addEdge(a, b, cls, ow, inner) {
    this.edgeA.push(a);
    this.edgeB.push(b);
    this.edgeCls.push(cls);
    this.edgeOw.push(ow);
    this.edgeStart.push(this.shapeX.n);
    this.edgeCount.push(inner.length / 2);
    for (let i = 0; i < inner.length; i += 2) {
      this.shapeX.push(inner[i]);
      this.shapeY.push(inner[i + 1]);
    }
  }

  addBuilding(x, y, area) {
    this.bX.push(x);
    this.bY.push(y);
    this.bArea.push(area);
  }
}

// ---------------------------------------------------------------------------- per-tile work

function tileLat(z, ty) {
  const n = Math.PI * (1 - (2 * (ty + 0.5)) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Roads of one tile: clip, re-attach T-junctions, split at nodes, emit edges into the accumulator. */
function processRoads(acc, z, tx, ty, layer) {
  const e = layer.extent;
  const scale = (4096 * 2 ** (15 - z)) / e; // global units per tile unit
  const ox = tx * e;
  const oy = ty * e;
  const mPerTU = (EARTH_CIRC_M * Math.cos((tileLat(z, ty) * Math.PI) / 180)) / (2 ** z * e);
  const tolT = T_JUNCTION_M / mPerTU;
  const preTol = PRESIMPLIFY_M / mPerTU;
  const borderTol = Math.min(BORDER_SNAP_M / (mPerTU * scale), acc.cell);

  const pieces = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 2) continue;
    const cls = roadClass(f.properties);
    if (cls < 0) continue;
    const ow = onewayOf(f.properties, cls);
    let geom;
    try {
      geom = f.loadGeometry();
    } catch {
      continue;
    }
    for (const line of geom) {
      const out = [];
      clipLine(ow === -1 ? line.slice().reverse() : line, e, out);
      for (const c of out) if (c.length >= 4) pieces.push({ c, cls, ow: ow !== 0 ? 1 : 0 });
    }
  }
  if (!pieces.length) return;
  acc.roadTiles++;

  const key = (x, y) => Math.round(x * 8) * 2097152 + Math.round(y * 8);
  const onBorder = (x, y) => x <= 0 || y <= 0 || x >= e || y >= e;
  const count = new Map();
  const bump = (x, y) => {
    const k = key(x, y);
    count.set(k, (count.get(k) ?? 0) + 1);
  };
  for (const p of pieces) for (let i = 0; i < p.c.length; i += 2) bump(p.c[i], p.c[i + 1]);

  // T-junctions: a road end that touches another road between two of its vertices.
  const G = 16;
  const cs = e / G;
  const grid = new Array(G * G);
  pieces.forEach((p, pi) => {
    const c = p.c;
    for (let s = 0; s + 3 < c.length; s += 2) {
      const x0 = Math.max(0, Math.floor((Math.min(c[s], c[s + 2]) - tolT) / cs));
      const x1 = Math.min(G - 1, Math.floor((Math.max(c[s], c[s + 2]) + tolT) / cs));
      const y0 = Math.max(0, Math.floor((Math.min(c[s + 1], c[s + 3]) - tolT) / cs));
      const y1 = Math.min(G - 1, Math.floor((Math.max(c[s + 1], c[s + 3]) + tolT) / cs));
      for (let gx = x0; gx <= x1; gx++)
        for (let gy = y0; gy <= y1; gy++) (grid[gy * G + gx] ??= []).push(pi, s / 2);
    }
  });
  const inserts = new Map(); // piece index -> [{ seg, t, x, y }]
  let moved = false;
  pieces.forEach((p, pi) => {
    for (const end of [0, p.c.length - 2]) {
      const x = p.c[end];
      const y = p.c[end + 1];
      if (onBorder(x, y) || count.get(key(x, y)) > 1) continue;
      const cell =
        grid[
          Math.min(G - 1, Math.max(0, Math.floor(y / cs))) * G +
            Math.min(G - 1, Math.max(0, Math.floor(x / cs)))
        ];
      if (!cell) continue;
      let best = null;
      let bestD = tolT * tolT;
      for (let k = 0; k < cell.length; k += 2) {
        const qi = cell[k];
        if (qi === pi) continue;
        const s = cell[k + 1];
        const c = pieces[qi].c;
        const ax = c[2 * s];
        const ay = c[2 * s + 1];
        const dx = c[2 * s + 2] - ax;
        const dy = c[2 * s + 3] - ay;
        const l2 = dx * dx + dy * dy;
        if (!l2) continue;
        // Clamped: a road that stops just past a corner of the other road joins at that vertex.
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const px = ax + t * dx - x;
        const py = ay + t * dy - y;
        const d = px * px + py * py;
        if (d < bestD) {
          bestD = d;
          best = { qi, seg: s, t, x: ax + t * dx, y: ay + t * dy };
        }
      }
      if (!best) continue;
      moved = true;
      if (best.t === 0 || best.t === 1) {
        // On an existing vertex: just move the end there.
        const v = best.seg + best.t;
        p.c[end] = pieces[best.qi].c[2 * v];
        p.c[end + 1] = pieces[best.qi].c[2 * v + 1];
        continue;
      }
      p.c[end] = best.x;
      p.c[end + 1] = best.y;
      const list = inserts.get(best.qi) ?? [];
      list.push(best);
      inserts.set(best.qi, list);
    }
  });
  for (const [qi, list] of inserts) {
    list.sort((a, b) => a.seg - b.seg || a.t - b.t);
    const c = pieces[qi].c;
    const out = [];
    let li = 0;
    for (let s = 0; s < c.length / 2; s++) {
      out.push(c[2 * s], c[2 * s + 1]);
      while (li < list.length && list[li].seg === s) {
        out.push(list[li].x, list[li].y);
        li++;
      }
    }
    pieces[qi].c = out;
  }
  if (moved) {
    count.clear();
    for (const p of pieces) for (let i = 0; i < p.c.length; i += 2) bump(p.c[i], p.c[i + 1]);
  }

  // Split at nodes (ends and shared vertices) and emit edges.
  const local = new Map(); // tile key -> global node id
  const nodeAt = (x, y) => {
    const gx = (ox + x) * scale;
    const gy = (oy + y) * scale;
    if (onBorder(x, y)) return acc.borderNode(gx, gy, borderTol);
    const k = key(x, y);
    let id = local.get(k);
    if (id === undefined) {
      id = acc.newNode(gx, gy);
      local.set(k, id);
    }
    return id;
  };
  for (const p of pieces) {
    const c = p.c;
    const n = c.length / 2;
    let start = 0;
    for (let i = 1; i < n; i++) {
      const last = i === n - 1;
      if (!last && count.get(key(c[2 * i], c[2 * i + 1])) < 2) continue;
      const seg = c.slice(2 * start, 2 * i + 2);
      const simple = simplifyFlat(seg, preTol);
      const a = nodeAt(seg[0], seg[1]);
      const b = nodeAt(seg[seg.length - 2], seg[seg.length - 1]);
      const inner = [];
      for (let k = 2; k < simple.length - 2; k += 2)
        inner.push((ox + simple[k]) * scale, (oy + simple[k + 1]) * scale);
      if (a !== b || inner.length) acc.addEdge(a, b, p.cls, p.ow, inner);
      start = i;
    }
  }
}

/** Buildings of one tile: clipped, area-weighted centroids; border-cut buildings merged by id. */
function processBuildings(acc, z, tx, ty, layer) {
  const e = layer.extent;
  const scale = (4096 * 2 ** (15 - z)) / e;
  const ox = tx * e;
  const oy = ty * e;
  const mPerTU = (EARTH_CIRC_M * Math.cos((tileLat(z, ty) * Math.PI) / 180)) / (2 ** z * e);
  const m2 = mPerTU * mPerTU;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3) continue;
    if (f.properties.kind === 'building_part') continue;
    let rings;
    try {
      rings = f.loadGeometry();
    } catch {
      continue;
    }
    let a = 0;
    let mx = 0;
    let my = 0;
    let cut = false;
    for (const ring of rings) {
      if (ring.length < 3) continue;
      let outside = false;
      for (const pt of ring) if (pt.x < 0 || pt.y < 0 || pt.x > e || pt.y > e) outside = true;
      let flat;
      if (outside) {
        cut = true;
        flat = clipRing(ring, e);
      } else {
        flat = [];
        for (const pt of ring) flat.push(pt.x, pt.y);
      }
      if (flat.length < 6) continue;
      const [ra, rx, ry] = ringMoments(flat);
      a += ra;
      mx += rx;
      my += ry;
    }
    if (!a) continue;
    const cx = mx / a;
    const cy = my / a;
    const area = Math.abs(a) * m2;
    const gx = (ox + cx) * scale;
    const gy = (oy + cy) * scale;
    const id = f.id;
    if (cut && id) {
      const m = acc.cut.get(id);
      if (m) {
        m[0] += area;
        m[1] += gx * area;
        m[2] += gy * area;
      } else acc.cut.set(id, [area, gx * area, gy * area]);
    } else if (area >= MIN_BUILDING_M2) acc.addBuilding(gx, gy, area);
  }
}

// ---------------------------------------------------------------------------- graph finishing

/** Merge, prune and simplify the raw graph. Returns final arrays in global units. */
function finishGraph(acc) {
  const N = acc.nodeX.n;
  const E0 = acc.edgeA.n;
  const nx = acc.nodeX.a;
  const ny = acc.nodeY.a;
  const eA = acc.edgeA.a;
  const eB = acc.edgeB.a;
  const eCls = acc.edgeCls.a;
  const eOw = acc.edgeOw.a;
  const eS = acc.edgeStart.a;
  const eC = acc.edgeCount.a;
  const sx = acc.shapeX.a;
  const sy = acc.shapeY.a;

  const edgePoints = (e) => {
    const pts = [nx[eA[e]], ny[eA[e]]];
    for (let k = 0; k < eC[e]; k++) pts.push(sx[eS[e] + k], sy[eS[e] + k]);
    pts.push(nx[eB[e]], ny[eB[e]]);
    return pts;
  };
  const lengthM = (pts) => {
    let l = 0;
    for (let k = 2; k < pts.length; k += 2)
      l += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]) * unitM((pts[k + 1] + pts[k - 1]) / 2);
    return l;
  };

  // Lengths, degenerate and duplicate edges (a line exactly on a tile border is in both tiles).
  const len = new Float64Array(E0);
  const alive = new Uint8Array(E0);
  const pairs = new Map();
  for (let e = 0; e < E0; e++) {
    len[e] = lengthM(edgePoints(e));
    if (len[e] < 0.05) continue;
    const lo = Math.min(eA[e], eB[e]);
    const hi = Math.max(eA[e], eB[e]);
    const k = lo * 67108864 + hi;
    const prev = pairs.get(k);
    if (prev !== undefined) {
      let dup = false;
      for (const o of Array.isArray(prev) ? prev : [prev]) {
        // Same road twice: same ends, class, length and (for one-way) direction.
        if (
          Math.abs(len[o] - len[e]) < 0.5 &&
          eCls[o] === eCls[e] &&
          eOw[o] === eOw[e] &&
          (!eOw[e] || eA[o] === eA[e])
        )
          dup = true;
      }
      if (dup) continue;
      pairs.set(k, Array.isArray(prev) ? [...prev, e] : [prev, e]);
    } else pairs.set(k, e);
    alive[e] = 1;
  }
  pairs.clear();

  // Connected components (union-find), drop the short ones.
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let e = 0; e < E0; e++) {
    if (!alive[e]) continue;
    const ra = find(eA[e]);
    const rb = find(eB[e]);
    if (ra !== rb) parent[ra] = rb;
  }
  const compLen = new Float64Array(N);
  for (let e = 0; e < E0; e++) if (alive[e]) compLen[find(eA[e])] += len[e];
  let dropped = 0;
  for (let e = 0; e < E0; e++) {
    if (alive[e] && compLen[find(eA[e])] < MIN_COMPONENT_M) {
      alive[e] = 0;
      dropped++;
    }
  }

  // Undirected adjacency of the surviving edges.
  const deg = new Uint32Array(N);
  for (let e = 0; e < E0; e++) {
    if (!alive[e]) continue;
    deg[eA[e]]++;
    deg[eB[e]]++;
  }
  const adjStart = new Uint32Array(N + 1);
  for (let i = 0; i < N; i++) adjStart[i + 1] = adjStart[i] + deg[i];
  const fill = adjStart.slice(0, N);
  const adj = new Uint32Array(adjStart[N]);
  for (let e = 0; e < E0; e++) {
    if (!alive[e]) continue;
    adj[fill[eA[e]]++] = e;
    adj[fill[eB[e]]++] = e;
  }
  // A node stays when it is not a plain pass-through between two compatible edges.
  const keep = new Uint8Array(N);
  for (let n = 0; n < N; n++) {
    if (deg[n] === 0) continue;
    if (deg[n] !== 2) {
      keep[n] = 1;
      continue;
    }
    const e1 = adj[adjStart[n]];
    const e2 = adj[adjStart[n] + 1];
    let ok = e1 !== e2 && eCls[e1] === eCls[e2] && eOw[e1] === eOw[e2];
    if (ok && eOw[e1]) ok = (eB[e1] === n && eA[e2] === n) || (eB[e2] === n && eA[e1] === n);
    if (!ok) keep[n] = 1;
  }

  const outA = [];
  const outB = [];
  const outFlags = [];
  const outShape = []; // per edge: flat inner points (global units)
  const seen = new Uint8Array(E0);
  const emit = (a, b, cls, ow, pts) => {
    const midY = pts[(pts.length >> 2) * 2 + 1];
    let simple = simplifyFlat(pts, SIMPLIFY_M / unitM(midY));
    // u16 shape counts: split very long chains (never seen in practice).
    while (simple.length / 2 - 2 > 65000) {
      const cutAt = 65000;
      const m = nodes.length / 2;
      nodes.push(simple[2 * cutAt], simple[2 * cutAt + 1]);
      outA.push(a);
      outB.push(m);
      outFlags.push(cls | (ow ? 16 : 0));
      outShape.push(simple.slice(2, 2 * cutAt));
      simple = simple.slice(2 * cutAt);
      a = m;
    }
    outA.push(a);
    outB.push(b);
    outFlags.push(cls | (ow ? 16 : 0));
    outShape.push(simple.slice(2, simple.length - 2));
  };
  // Output nodes: flat [x, y] in global units, indexed by new ids.
  const nodes = [];
  const newId = new Int32Array(N).fill(-1);
  const idOf = (n) => {
    if (newId[n] < 0) {
      newId[n] = nodes.length / 2;
      nodes.push(nx[n], ny[n]);
    }
    return newId[n];
  };

  const walk = (start, e0) => {
    let cur = start;
    let e = e0;
    const forward0 = eA[e0] === start;
    const pts = [nx[start], ny[start]];
    for (;;) {
      seen[e] = 1;
      const fwd = eA[e] === cur;
      const p = edgePoints(e);
      if (fwd) for (let k = 2; k < p.length; k += 2) pts.push(p[k], p[k + 1]);
      else for (let k = p.length - 4; k >= 0; k -= 2) pts.push(p[k], p[k + 1]);
      const next = fwd ? eB[e] : eA[e];
      if (keep[next] || next === start) {
        cur = next;
        break;
      }
      const a0 = adj[adjStart[next]];
      const a1 = adj[adjStart[next] + 1];
      const ne = a0 === e ? a1 : a0;
      if (seen[ne]) {
        cur = next;
        break;
      }
      cur = next;
      e = ne;
    }
    const cls = eCls[e0];
    const ow = eOw[e0];
    if (ow && !forward0) {
      // Store one-way chains in their driving direction.
      const rev = [];
      for (let k = pts.length - 2; k >= 0; k -= 2) rev.push(pts[k], pts[k + 1]);
      emit(idOf(cur), idOf(start), cls, ow, rev);
    } else emit(idOf(start), idOf(cur), cls, ow, pts);
  };
  for (let n = 0; n < N; n++) {
    if (!keep[n]) continue;
    for (let k = adjStart[n]; k < adjStart[n + 1]; k++) if (!seen[adj[k]]) walk(n, adj[k]);
  }
  // Rings made only of pass-through nodes.
  for (let e = 0; e < E0; e++) {
    if (!alive[e] || seen[e]) continue;
    keep[eA[e]] = 1;
    walk(eA[e], e);
  }
  return { nodes, outA, outB, outFlags, outShape, dropped, rawNodes: N, rawEdges: E0 };
}

// ---------------------------------------------------------------------------- writing

function morton16(x, y) {
  let m = 0;
  for (let b = 15; b >= 0; b--) m = m * 4 + (((y >> b) & 1) << 1) + ((x >> b) & 1);
  return m;
}

const q6 = (deg) => Math.round(deg * 1e6);

export function encodeRoads(g) {
  const N0 = g.nodes.length / 2;
  // Quantised node positions (1e-6 degrees) and the bbox.
  const qlon = new Int32Array(N0);
  const qlat = new Int32Array(N0);
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const grow = (lo, la) => {
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
  };
  for (let i = 0; i < N0; i++) {
    qlon[i] = q6(lonOfX(g.nodes[2 * i]));
    qlat[i] = q6(latOfY(g.nodes[2 * i + 1]));
    grow(qlon[i] / 1e6, qlat[i] / 1e6);
  }
  // Shape points as 16-bit steps from the previous point; long steps get extra points.
  const E = g.outA.length;
  const steps = new Array(E);
  let S = 0;
  for (let e = 0; e < E; e++) {
    const s = g.outShape[e];
    const out = [];
    let px = qlon[g.outA[e]];
    let py = qlat[g.outA[e]];
    for (let k = 0; k < s.length; k += 2) {
      const x = q6(lonOfX(s[k]));
      const y = q6(latOfY(s[k + 1]));
      grow(x / 1e6, y / 1e6);
      const parts = Math.max(1, Math.ceil(Math.max(Math.abs(x - px), Math.abs(y - py)) / 32767));
      for (let j = 1; j <= parts; j++) {
        const ix = j === parts ? x : px + Math.round(((x - px) * j) / parts);
        const iy = j === parts ? y : py + Math.round(((y - py) * j) / parts);
        out.push(ix, iy);
      }
      px = x;
      py = y;
    }
    // Store as steps.
    const st = new Int16Array(out.length);
    let lx = qlon[g.outA[e]];
    let ly = qlat[g.outA[e]];
    for (let k = 0; k < out.length; k += 2) {
      st[k] = out[k] - lx;
      st[k + 1] = out[k + 1] - ly;
      lx = out[k];
      ly = out[k + 1];
    }
    if (st.length / 2 > 65535) throw new Error('teelõigul on üle 65535 kujupunkti');
    steps[e] = st;
    S += st.length / 2;
  }
  if (!N0) minLon = minLat = maxLon = maxLat = 0;
  // Spatial order of the nodes (Morton over the bbox).
  const spanLon = Math.max(1e-9, maxLon - minLon);
  const spanLat = Math.max(1e-9, maxLat - minLat);
  const order = Array.from({ length: N0 }, (_, i) => i);
  const codes = new Float64Array(N0);
  for (let i = 0; i < N0; i++)
    codes[i] = morton16(
      Math.min(65535, Math.max(0, Math.floor(((qlon[i] / 1e6 - minLon) / spanLon) * 65535))),
      Math.min(65535, Math.max(0, Math.floor(((qlat[i] / 1e6 - minLat) / spanLat) * 65535))),
    );
  order.sort((a, b) => codes[a] - codes[b] || a - b);
  const rank = new Uint32Array(N0);
  order.forEach((old, i) => (rank[old] = i));
  const eOrder = Array.from({ length: E }, (_, i) => i);
  eOrder.sort((a, b) => rank[g.outA[a]] - rank[g.outA[b]] || rank[g.outB[a]] - rank[g.outB[b]] || a - b);
  const outCount = new Uint32Array(N0);
  for (let e = 0; e < E; e++) outCount[rank[g.outA[e]]]++;
  for (let i = 0; i < N0; i++)
    if (outCount[i] > 255) throw new Error(`sõlmest algab ${outCount[i]} teelõiku (lubatud kuni 255)`);

  let off = 72;
  const oNodeLon = off;
  off += 4 * N0;
  const oNodeLat = off;
  off += 4 * N0;
  const oOut = off;
  off = (off + N0 + 3) & ~3;
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
  const buf = Buffer.alloc(off);
  buf.write(ROADS_MAGIC, 0, 'latin1');
  buf.writeUInt32LE(FORMAT_VERSION, 4);
  buf.writeUInt32LE(N0, 8);
  buf.writeUInt32LE(E, 12);
  buf.writeUInt32LE(S, 16);
  buf.writeUInt32LE(0, 20);
  buf.writeDoubleLE(minLon, 24);
  buf.writeDoubleLE(minLat, 32);
  buf.writeDoubleLE(maxLon, 40);
  buf.writeDoubleLE(maxLat, 48);
  ROAD_CLASSES.forEach((c, i) => buf.writeUInt8(c.kmh, 56 + i));
  for (let i = 0; i < N0; i++) {
    const old = order[i];
    buf.writeInt32LE(qlon[old], oNodeLon + 4 * i);
    buf.writeInt32LE(qlat[old], oNodeLat + 4 * i);
    buf.writeUInt8(outCount[i], oOut + i);
  }
  let sOff = 0;
  eOrder.forEach((e, i) => {
    buf.writeUInt32LE(rank[g.outB[e]], oB + 4 * i);
    const st = steps[e];
    buf.writeUInt16LE(st.length / 2, oCount + 2 * i);
    buf.writeUInt8(g.outFlags[e], oFlags + i);
    for (let k = 0; k < st.length; k += 2) {
      buf.writeInt16LE(st[k], oStepLon + 2 * sOff);
      buf.writeInt16LE(st[k + 1], oStepLat + 2 * sOff);
      sOff++;
    }
  });
  return { buf, nodes: N0, edges: E, shapes: S };
}

export function encodeBuildings(acc) {
  // Put border-cut buildings back together.
  for (const [, m] of acc.cut) if (m[0] >= MIN_BUILDING_M2) acc.addBuilding(m[1] / m[0], m[2] / m[0], m[0]);
  acc.cut.clear();
  const M0 = acc.bX.n;
  const lon = new Float64Array(M0);
  const lat = new Float64Array(M0);
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < M0; i++) {
    lon[i] = lonOfX(acc.bX.a[i]);
    lat[i] = latOfY(acc.bY.a[i]);
    if (lon[i] < minLon) minLon = lon[i];
    if (lon[i] > maxLon) maxLon = lon[i];
    if (lat[i] < minLat) minLat = lat[i];
    if (lat[i] > maxLat) maxLat = lat[i];
  }
  if (!M0) {
    minLon = minLat = 0;
    maxLon = maxLat = 0;
  }
  const originLon = Math.floor(minLon / CELL_LON) * CELL_LON;
  const originLat = Math.floor(minLat / CELL_LAT) * CELL_LAT;
  const W = Math.max(1, Math.floor((maxLon - originLon) / CELL_LON) + 1);
  const H = Math.max(1, Math.floor((maxLat - originLat) / CELL_LAT) + 1);
  const cellOf = new Uint32Array(M0);
  const qx = new Uint16Array(M0);
  const qy = new Uint16Array(M0);
  for (let i = 0; i < M0; i++) {
    const cx = Math.min(W - 1, Math.max(0, Math.floor((lon[i] - originLon) / CELL_LON)));
    const cy = Math.min(H - 1, Math.max(0, Math.floor((lat[i] - originLat) / CELL_LAT)));
    cellOf[i] = cy * W + cx;
    qx[i] = Math.min(4095, Math.max(0, Math.round(((lon[i] - originLon) / CELL_LON - cx) * 4096)));
    qy[i] = Math.min(4095, Math.max(0, Math.round(((lat[i] - originLat) / CELL_LAT - cy) * 4096)));
  }
  // Order by cell (then position), drop exact duplicates.
  const order = Array.from({ length: M0 }, (_, i) => i);
  order.sort((a, b) => cellOf[a] - cellOf[b] || qy[a] - qy[b] || qx[a] - qx[b]);
  const keepIdx = [];
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const p = keepIdx.length ? keepIdx[keepIdx.length - 1] : -1;
    if (p >= 0 && cellOf[p] === cellOf[i] && qx[p] === qx[i] && qy[p] === qy[i]) {
      if (acc.bArea.a[i] > acc.bArea.a[p]) keepIdx[keepIdx.length - 1] = i;
      continue;
    }
    keepIdx.push(i);
  }
  const M = keepIdx.length;
  const cells = W * H;
  const align = (n) => (n + 3) & ~3;
  const oStart = 56;
  const oX = oStart + 4 * (cells + 1);
  const oY = oX + 2 * M;
  const oSize = oY + 2 * M;
  const total = align(oSize + M);
  const buf = Buffer.alloc(total);
  buf.write(BUILDINGS_MAGIC, 0, 'latin1');
  buf.writeUInt32LE(FORMAT_VERSION, 4);
  buf.writeUInt32LE(M, 8);
  buf.writeUInt32LE(W, 12);
  buf.writeUInt32LE(H, 16);
  buf.writeUInt32LE(0, 20);
  buf.writeDoubleLE(originLon, 24);
  buf.writeDoubleLE(originLat, 32);
  buf.writeDoubleLE(CELL_LON, 40);
  buf.writeDoubleLE(CELL_LAT, 48);
  const counts = new Uint32Array(cells + 1);
  for (const i of keepIdx) counts[cellOf[i] + 1]++;
  for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
  for (let c = 0; c <= cells; c++) buf.writeUInt32LE(counts[c], oStart + 4 * c);
  keepIdx.forEach((i, k) => {
    buf.writeUInt16LE(qx[i], oX + 2 * k);
    buf.writeUInt16LE(qy[i], oY + 2 * k);
    const sz = Math.round(16 * Math.log2(Math.max(1, acc.bArea.a[i])));
    buf.writeUInt8(Math.min(255, Math.max(0, sz)), oSize + k);
  });
  return { buf, count: M, cells };
}

/** Write `data` to dir/name through a temporary file in the same directory and a rename. */
async function writeAtomic(dir, name, data) {
  const final = join(dir, name);
  const tmp = join(dir, `.${name}.${process.pid}.tmp`);
  let fh;
  try {
    fh = await open(tmp, 'w', 0o644);
    await fh.writeFile(data);
    await fh.datasync();
    await fh.close();
    fh = undefined;
    await rename(tmp, final);
  } catch (e) {
    if (fh) await fh.close().catch(() => {});
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------------------- main

/**
 * Build both data files from a PMTiles archive. Resolves with statistics; throws (and leaves any
 * existing output files untouched) on any failure.
 */
export async function buildMapData(input, outDir, { log = () => {} } = {}) {
  const t0 = Date.now();
  const arc = await Archive.open(input);
  try {
    const h = arc.header;
    if (h.tileType !== 1) throw new Error(`not a vector (MVT) archive (tile type ${h.tileType})`);
    const z = Math.min(TARGET_ZOOM, h.maxZoom);
    if (z < 14) log(`hoiatus: arhiivi sügavaim suum on ${h.maxZoom}, hooneid on puudulikult`);
    const tiles = await arc.tilesAt(z);
    log(`suum ${z}: ${tiles.length} plaati`);
    const acc = new Accumulator();
    const empty = new Set(); // data offsets known to hold no roads and no buildings (sea runs)
    let lastLog = Date.now();
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (empty.has(t.offset)) continue;
      const data = await arc.tile(t);
      const vt = new VectorTile(new PbfReader(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      const roads = vt.layers.roads;
      const blds = vt.layers.buildings;
      if (!roads?.length && !blds?.length) {
        empty.add(t.offset);
        continue;
      }
      const [tz, tx, ty] = tileIdToZxy(t.tileId);
      if (roads?.length) processRoads(acc, tz, tx, ty, roads);
      if (blds?.length) processBuildings(acc, tz, tx, ty, blds);
      acc.tiles++;
      if (Date.now() - lastLog > 15000) {
        lastLog = Date.now();
        log(`  ${i + 1}/${tiles.length} plaati, ${acc.edgeA.n} teelõiku, ${acc.bX.n} hoonet`);
      }
    }
    const tRead = Date.now();
    if (!acc.edgeA.n) throw new Error('arhiivist ei leitud ühtegi autoteed (roads kiht puudub või on tühi)');
    const g = finishGraph(acc);
    const roads = encodeRoads(g);
    if (!roads.edges) throw new Error('teedevõrk jäi pärast puhastust tühjaks');
    const blds = encodeBuildings(acc);
    const roadsGz = zlib.gzipSync(roads.buf, { level: 9 });
    const bldsGz = zlib.gzipSync(blds.buf, { level: 9 });
    await mkdir(outDir, { recursive: true });
    // Each .gz goes first: a moment where only the plain file is new is harmless as well.
    await writeAtomic(outDir, `${ROADS_FILE}.gz`, roadsGz);
    await writeAtomic(outDir, ROADS_FILE, roads.buf);
    await writeAtomic(outDir, `${BUILDINGS_FILE}.gz`, bldsGz);
    await writeAtomic(outDir, BUILDINGS_FILE, blds.buf);
    return {
      zoom: z,
      tiles: tiles.length,
      tilesWithData: acc.tiles,
      rawNodes: g.rawNodes,
      rawEdges: g.rawEdges,
      droppedEdges: g.dropped,
      nodes: roads.nodes,
      edges: roads.edges,
      shapes: roads.shapes,
      buildings: blds.count,
      roadsBytes: roads.buf.length,
      roadsGzBytes: roadsGz.length,
      buildingsBytes: blds.buf.length,
      buildingsGzBytes: bldsGz.length,
      readMs: tRead - t0,
      totalMs: Date.now() - t0,
    };
  } finally {
    await arc.close();
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

async function main(argv) {
  if (argv.length !== 2 || argv.includes('--help') || argv.includes('-h')) {
    console.error('Kasutus: node scripts/build-mapdata.mjs <estonia.pmtiles> <väljundkaust>');
    return argv.includes('--help') || argv.includes('-h') ? 0 : 2;
  }
  const [input, outDir] = argv.map((p) => resolve(p));
  try {
    const st = await stat(input);
    if (!st.isFile() || st.size < 127) throw new Error(`${input} pole PMTiles fail`);
    console.log(`build-mapdata: ${basename(input)} (${(st.size / 1048576).toFixed(1)} MB) -> ${outDir}`);
    const r = await buildMapData(input, outDir, { log: (m) => console.log(m) });
    console.log(
      `teed: ${r.nodes} sõlme, ${r.edges} lõiku, ${r.shapes} kujupunkti (toorandmed ${r.rawNodes} sõlme, ${r.rawEdges} lõiku, ${r.droppedEdges} lühikest tükki välja)`,
    );
    console.log(`hooned: ${r.buildings}`);
    console.log(
      `${ROADS_FILE}: ${kb(r.roadsBytes)} (gzip ${kb(r.roadsGzBytes)}), ${BUILDINGS_FILE}: ${kb(r.buildingsBytes)} (gzip ${kb(r.buildingsGzBytes)})`,
    );
    console.log(
      `aeg: plaatide lugemine ${(r.readMs / 1000).toFixed(1)} s, kokku ${(r.totalMs / 1000).toFixed(1)} s`,
    );
    return 0;
  } catch (e) {
    console.error(`build-mapdata: VIGA: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
