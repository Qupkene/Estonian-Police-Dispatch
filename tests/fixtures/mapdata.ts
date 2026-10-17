/**
 * Synthetic street map data for the road layer tests: a minimal Mapbox Vector Tile encoder, a
 * minimal PMTiles v3 writer (uncompressed directories and tiles) and a hand-made roads-v1.bin
 * encoder that follows the format documented in scripts/build-mapdata.mjs.
 */
import { PbfWriter } from 'pbf';
import { zxyToTileId } from 'pmtiles';
import type { LngLat } from '@/sim/types';

export type Props = Record<string, string | number | boolean>;

export interface MvtFeature {
  id?: number;
  type: 2 | 3;
  props: Props;
  /** Lines: one or more polylines. Polygons: rings (not closed). Tile units, may leave the tile (buffer). */
  geom: [number, number][][];
}

export interface MvtLayer {
  name: string;
  extent?: number;
  features: MvtFeature[];
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);

function encodeGeometry(f: MvtFeature): number[] {
  const out: number[] = [];
  let cx = 0;
  let cy = 0;
  for (const ring of f.geom) {
    const [x0, y0] = ring[0];
    out.push((1 & 7) | (1 << 3), zigzag(x0 - cx), zigzag(y0 - cy));
    cx = x0;
    cy = y0;
    const rest = ring.slice(1);
    out.push((2 & 7) | (rest.length << 3));
    for (const [x, y] of rest) {
      out.push(zigzag(x - cx), zigzag(y - cy));
      cx = x;
      cy = y;
    }
    if (f.type === 3) out.push((7 & 7) | (1 << 3));
  }
  return out;
}

/** Encode a vector tile. */
export function encodeMvt(layers: MvtLayer[]): Uint8Array {
  const pbf = new PbfWriter();
  for (const layer of layers) {
    const keys: string[] = [];
    const values: (string | number | boolean)[] = [];
    const keyIdx = (k: string) => {
      let i = keys.indexOf(k);
      if (i < 0) i = keys.push(k) - 1;
      return i;
    };
    const valIdx = (v: string | number | boolean) => {
      let i = values.indexOf(v);
      if (i < 0) i = values.push(v) - 1;
      return i;
    };
    const feats = layer.features.map((f) => ({
      f,
      tags: Object.entries(f.props).flatMap(([k, v]) => [keyIdx(k), valIdx(v)]),
    }));
    pbf.writeMessage(
      3,
      (l: MvtLayer, w: PbfWriter) => {
        w.writeVarintField(15, 2);
        w.writeStringField(1, l.name);
        for (const { f, tags } of feats) {
          w.writeMessage(
            2,
            (ff: MvtFeature, fw: PbfWriter) => {
              if (ff.id) fw.writeVarintField(1, ff.id);
              fw.writePackedVarint(2, tags);
              fw.writeVarintField(3, ff.type);
              fw.writePackedVarint(4, encodeGeometry(ff));
            },
            f,
          );
        }
        for (const k of keys) w.writeStringField(3, k);
        for (const v of values) {
          w.writeMessage(
            4,
            (vv: string | number | boolean, vw: PbfWriter) => {
              if (typeof vv === 'string') vw.writeStringField(1, vv);
              else if (typeof vv === 'boolean') vw.writeBooleanField(7, vv);
              else if (Number.isInteger(vv) && vv >= 0) vw.writeVarintField(5, vv);
              else vw.writeDoubleField(3, vv);
            },
            v,
          );
        }
        w.writeVarintField(5, l.extent ?? 4096);
      },
      layer,
    );
  }
  return pbf.finish();
}

function varint(out: number[], v: number) {
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

/** A PMTiles v3 archive with uncompressed directory and tiles (MVT), all entries in the root. */
export function writePmtiles(
  tiles: { z: number; x: number; y: number; data: Uint8Array }[],
  bounds: [number, number, number, number],
): Uint8Array {
  const sorted = tiles.map((t) => ({ ...t, id: zxyToTileId(t.z, t.x, t.y) })).sort((a, b) => a.id - b.id);
  const dir: number[] = [];
  varint(dir, sorted.length);
  let last = 0;
  for (const t of sorted) {
    varint(dir, t.id - last);
    last = t.id;
  }
  for (let i = 0; i < sorted.length; i++) varint(dir, 1);
  for (const t of sorted) varint(dir, t.data.length);
  let off = 0;
  sorted.forEach((t, i) => {
    varint(dir, i === 0 ? off + 1 : 0);
    off += t.data.length;
  });
  const meta = new TextEncoder().encode('{"name":"test","vector_layers":[]}');
  const rootOff = 127;
  const metaOff = rootOff + dir.length;
  const dataOff = metaOff + meta.length;
  const total = dataOff + off;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  buf.set(new TextEncoder().encode('PMTiles'), 0);
  dv.setUint8(7, 3);
  const u64 = (o: number, v: number) => {
    dv.setUint32(o, v % 2 ** 32, true);
    dv.setUint32(o + 4, Math.floor(v / 2 ** 32), true);
  };
  u64(8, rootOff);
  u64(16, dir.length);
  u64(24, metaOff);
  u64(32, meta.length);
  u64(40, dataOff);
  u64(48, 0);
  u64(56, dataOff);
  u64(64, off);
  u64(72, sorted.length);
  u64(80, sorted.length);
  u64(88, sorted.length);
  dv.setUint8(96, 1); // clustered
  dv.setUint8(97, 1); // internal compression: none
  dv.setUint8(98, 1); // tile compression: none
  dv.setUint8(99, 1); // MVT
  const zs = sorted.map((t) => t.z);
  dv.setUint8(100, Math.min(...zs));
  dv.setUint8(101, Math.max(...zs));
  dv.setInt32(102, Math.round(bounds[0] * 1e7), true);
  dv.setInt32(106, Math.round(bounds[1] * 1e7), true);
  dv.setInt32(110, Math.round(bounds[2] * 1e7), true);
  dv.setInt32(114, Math.round(bounds[3] * 1e7), true);
  dv.setUint8(118, Math.max(...zs));
  dv.setInt32(119, Math.round(((bounds[0] + bounds[2]) / 2) * 1e7), true);
  dv.setInt32(123, Math.round(((bounds[1] + bounds[3]) / 2) * 1e7), true);
  buf.set(Uint8Array.from(dir), rootOff);
  buf.set(meta, metaOff);
  let p = dataOff;
  for (const t of sorted) {
    buf.set(t.data, p);
    p += t.data.length;
  }
  return buf;
}

export const tileLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const tileLat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
export const lonToTile = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
export const latToTile = (lat: number, z: number) =>
  ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
  2 ** z;

/** Lon/lat of a point given in tile units (extent 4096) of tile (x, y) at zoom z. */
export const tilePoint = (z: number, x: number, y: number, px: number, py: number): LngLat => [
  tileLon(x + px / 4096, z),
  tileLat(y + py / 4096, z),
];

export interface HandEdge {
  a: number;
  b: number;
  cls: number;
  oneway?: boolean;
  shape?: LngLat[];
}

/** roads-v1.bin from a node and edge list (independent of the build script, same format). */
export function encodeRoadsBin(
  nodes: LngLat[],
  edges: HandEdge[],
  speeds = [110, 90, 80, 70, 60, 50, 50, 40, 15, 20],
): Uint8Array {
  const N = nodes.length;
  const sorted = [...edges].sort((p, q) => p.a - q.a || p.b - q.b);
  const E = sorted.length;
  const q = (v: number) => Math.round(v * 1e6);
  const steps: number[][] = sorted.map((e) => {
    let x = q(nodes[e.a][0]);
    let y = q(nodes[e.a][1]);
    const out: number[] = [];
    for (const p of e.shape ?? []) {
      out.push(q(p[0]) - x, q(p[1]) - y);
      x = q(p[0]);
      y = q(p[1]);
    }
    return out;
  });
  const S = steps.reduce((n, s) => n + s.length / 2, 0);
  let off = 72;
  const oLon = off;
  off += 4 * N;
  const oLat = off;
  off += 4 * N;
  const oOut = off;
  off = (off + N + 3) & ~3;
  const oB = off;
  off += 4 * E;
  const oCount = off;
  off += 2 * E;
  const oFlags = off;
  off = (off + E + 1) & ~1;
  const oDLon = off;
  off += 2 * S;
  const oDLat = off;
  off = (off + 2 * S + 3) & ~3;
  const buf = new Uint8Array(off);
  const dv = new DataView(buf.buffer);
  buf.set(new TextEncoder().encode('EPDR'), 0);
  dv.setUint32(4, 1, true);
  dv.setUint32(8, N, true);
  dv.setUint32(12, E, true);
  dv.setUint32(16, S, true);
  const lons = nodes.map((n) => n[0]);
  const lats = nodes.map((n) => n[1]);
  dv.setFloat64(24, Math.min(...lons), true);
  dv.setFloat64(32, Math.min(...lats), true);
  dv.setFloat64(40, Math.max(...lons), true);
  dv.setFloat64(48, Math.max(...lats), true);
  speeds.forEach((s, i) => dv.setUint8(56 + i, s));
  nodes.forEach((n, i) => {
    dv.setInt32(oLon + 4 * i, q(n[0]), true);
    dv.setInt32(oLat + 4 * i, q(n[1]), true);
  });
  for (const e of sorted) buf[oOut + e.a]++;
  let s = 0;
  sorted.forEach((e, i) => {
    dv.setUint32(oB + 4 * i, e.b, true);
    dv.setUint16(oCount + 2 * i, steps[i].length / 2, true);
    dv.setUint8(oFlags + i, e.cls | (e.oneway ? 16 : 0));
    for (let k = 0; k < steps[i].length; k += 2) {
      dv.setInt16(oDLon + 2 * s, steps[i][k], true);
      dv.setInt16(oDLat + 2 * s, steps[i][k + 1], true);
      s++;
    }
  });
  return buf;
}
