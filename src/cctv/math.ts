/**
 * Plane geometry of a camera scene (docs/CCTV.md). A scene is a patch of ground a few hundred metres across with
 * its origin at the incident: x points east, y north, both in metres. Angles are radians counted from east towards
 * north (a yaw of 0 looks east), so a unit direction is (cos yaw, sin yaw).
 *
 * Pure: no DOM, no three.js. Everything a scene is built from is deterministic, seeded by `hash32`.
 */
import type { LngLat } from '@/sim/types';

export type V2 = readonly [number, number];

const DEG = Math.PI / 180;
/** Metres per degree of latitude (mean Earth radius), as in src/map/roadGraph.ts. */
const M_PER_DEG = 111194.93;

export const v2 = (x: number, y: number): V2 => [x, y];
export const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
export const dot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: V2): number => Math.hypot(a[0], a[1]);
export const dist = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp2 = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** The direction turned a quarter to the left. */
export const left = (a: V2): V2 => [-a[1], a[0]];
export const yawOf = (a: V2): number => Math.atan2(a[1], a[0]);
export const dirOf = (yaw: number): V2 => [Math.cos(yaw), Math.sin(yaw)];
export function norm(a: V2): V2 {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [1, 0];
}
export const along = (a: V2, dir: V2, d: number): V2 => [a[0] + dir[0] * d, a[1] + dir[1] * d];

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
/** The shortest way from angle a to angle b, in (-pi, pi]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
export const lerpAngle = (a: number, b: number, t: number) => a + angleDiff(a, b) * t;

// ---------------------------------------------------------------------------- map coordinates

/** A local frame around `origin`: metres east and north of it (exact enough for a few hundred metres). */
export interface Frame {
  origin: LngLat;
  toLocal: (p: LngLat) => V2;
  toLngLat: (p: V2) => LngLat;
}

export function frameAt(origin: LngLat): Frame {
  const kx = M_PER_DEG * Math.cos(origin[1] * DEG);
  return {
    origin,
    toLocal: (p) => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * M_PER_DEG],
    toLngLat: (p) => [origin[0] + p[0] / kx, origin[1] + p[1] / M_PER_DEG],
  };
}

/** The sim's heading (degrees clockwise from north) as a scene yaw. */
export const yawOfHeading = (deg: number) => (90 - deg) * DEG;

// ---------------------------------------------------------------------------- randomness

/** FNV-1a over the parts, as an unsigned 32-bit number: the same parts always give the same scene. */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? part.toString(36) : part;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c;
    h = Math.imul(h, 0x01000193);
  }
  // A final stir, so that neighbouring numbers give unrelated results in every bit.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** hash32 as a number in [0, 1). */
export const hash01 = (...parts: (string | number)[]) => hash32(...parts) / 4294967296;

export type Rand = (() => number) & {
  /** A number in [lo, hi). */
  range: (lo: number, hi: number) => number;
  /** An integer in [lo, hi]. */
  int: (lo: number, hi: number) => number;
  pick: <T>(list: readonly T[]) => T;
  chance: (p: number) => boolean;
};

/** A seeded generator (mulberry32). */
export function rand(seed: number): Rand {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = next as Rand;
  r.range = (lo, hi) => lo + (hi - lo) * next();
  r.int = (lo, hi) => lo + Math.floor((hi - lo + 1) * next());
  r.pick = (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  r.chance = (p) => next() < p;
  return r;
}

/** Smooth noise in [-1, 1] over time (two sines whose rates come from the seed): idle sway, a fight's drift. */
export function wobble(seed: number, t: number, rate = 1): number {
  const a = 0.7 + (seed % 97) / 97;
  const b = 1.3 + ((seed >>> 7) % 89) / 89;
  const p = ((seed >>> 13) % 628) / 100;
  return 0.6 * Math.sin(t * rate * a + p) + 0.4 * Math.sin(t * rate * b * 1.7 + p * 2.3);
}

// ---------------------------------------------------------------------------- polygons

/** Signed area: positive for a ring that runs anticlockwise (north up). */
export function ringArea(ring: readonly V2[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += cross(ring[j], ring[i]);
  return a / 2;
}

export function ringCentroid(ring: readonly V2[]): V2 {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const c = cross(ring[j], ring[i]);
    a += c;
    x += (ring[j][0] + ring[i][0]) * c;
    y += (ring[j][1] + ring[i][1]) * c;
  }
  if (Math.abs(a) < 1e-9) return ring[0] ?? [0, 0];
  return [x / (3 * a), y / (3 * a)];
}

export function pointInRing(p: V2, ring: readonly V2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** The nearest point of segment ab to p, and how far along the segment it is (0..1). */
export function nearestOnSegment(p: V2, a: V2, b: V2): { pt: V2; t: number; d: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-12 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
  const pt = lerp2(a, b, t);
  return { pt, t, d: dist(p, pt) };
}

/** The nearest point of a ring's outline to p, with the outward normal of the edge it lies on. */
export function nearestOnRing(p: V2, ring: readonly V2[]): { pt: V2; d: number; normal: V2; edge: number } {
  let best = { pt: ring[0], d: Infinity, normal: [1, 0] as V2, edge: 0 };
  const ccw = ringArea(ring) > 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const n = nearestOnSegment(p, a, b);
    if (n.d < best.d) {
      const e = norm(sub(b, a));
      // Outward: to the right of an anticlockwise edge.
      const out: V2 = ccw ? [e[1], -e[0]] : [-e[1], e[0]];
      best = { pt: n.pt, d: n.d, normal: out, edge: i };
    }
  }
  return best;
}

/** Do the open segments ab and cd cross? (Touching ends do not count.) */
export function segmentsCross(a: V2, b: V2, c: V2, d: V2): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Does the segment ab pass through the ring (cross its outline, or lie inside it)? */
export function segmentHitsRing(a: V2, b: V2, ring: readonly V2[]): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (segmentsCross(a, b, ring[j], ring[i])) return true;
  return pointInRing(lerp2(a, b, 0.5), ring);
}

export interface Box {
  /** Centre. */
  c: V2;
  /** Unit vector along the long side. */
  axis: V2;
  /** Long and short side, metres. */
  long: number;
  short: number;
}

/** The smallest rectangle around a ring that lies along one of its edges (a house's footprint: its ridge line). */
export function boundingBox(ring: readonly V2[]): Box {
  let best: Box | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const e = sub(ring[(i + 1) % ring.length], ring[i]);
    if (len(e) < 0.2) continue;
    const u = norm(e);
    const w = left(u);
    let u0 = Infinity;
    let u1 = -Infinity;
    let w0 = Infinity;
    let w1 = -Infinity;
    for (const p of ring) {
      const a = dot(p, u);
      const b = dot(p, w);
      if (a < u0) u0 = a;
      if (a > u1) u1 = a;
      if (b < w0) w0 = b;
      if (b > w1) w1 = b;
    }
    const area = (u1 - u0) * (w1 - w0);
    if (area < bestArea) {
      bestArea = area;
      const c = add(mul(u, (u0 + u1) / 2), mul(w, (w0 + w1) / 2));
      best = u1 - u0 >= w1 - w0 ? { c, axis: u, long: u1 - u0, short: w1 - w0 } : { c, axis: w, long: w1 - w0, short: u1 - u0 };
    }
  }
  return best ?? { c: ring[0] ?? [0, 0], axis: [1, 0], long: 1, short: 1 };
}

/** The four corners of a rectangle, anticlockwise. */
export function rectRing(c: V2, axis: V2, long: number, short: number): V2[] {
  const u = mul(norm(axis), long / 2);
  const w = mul(left(norm(axis)), short / 2);
  return [sub(sub(c, u), w), sub(add(c, u), w), add(add(c, u), w), add(sub(c, u), w)];
}

// ---------------------------------------------------------------------------- polylines

export function lineLength(pts: readonly V2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** The point at distance s along a polyline (clamped to its ends) and the direction of travel there. */
export function pointAlong(pts: readonly V2[], s: number): { pt: V2; dir: V2; i: number } {
  if (pts.length < 2) return { pt: pts[0] ?? [0, 0], dir: [1, 0], i: 0 };
  let rest = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (rest <= l || i === pts.length - 1) {
      const t = l < 1e-9 ? 0 : Math.min(1, rest / l);
      return { pt: lerp2(pts[i - 1], pts[i], t), dir: norm(sub(pts[i], pts[i - 1])), i: i - 1 };
    }
    rest -= l;
  }
  return { pt: pts[pts.length - 1], dir: [1, 0], i: pts.length - 2 };
}

/** The nearest point of a polyline to p: where, how far along the line (s) and how far away (d). */
export function nearestOnLine(p: V2, pts: readonly V2[]): { pt: V2; s: number; d: number; dir: V2; i: number } {
  let best = { pt: pts[0], s: 0, d: Infinity, dir: [1, 0] as V2, i: 0 };
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    const n = nearestOnSegment(p, pts[i - 1], pts[i]);
    if (n.d < best.d) best = { pt: n.pt, s: run + n.t * l, d: n.d, dir: norm(sub(pts[i], pts[i - 1])), i: i - 1 };
    run += l;
  }
  return best;
}

/** A polyline moved d metres to its left (negative: to its right), with mitred corners. */
export function offsetLine(pts: readonly V2[], d: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = i > 0 ? norm(sub(pts[i], pts[i - 1])) : null;
    const b = i < pts.length - 1 ? norm(sub(pts[i + 1], pts[i])) : null;
    let n: V2;
    let k = 1;
    if (a && b) {
      const m = norm(add(left(a), left(b)));
      const c = dot(m, left(a));
      n = m;
      // A sharp corner would shoot the mitre far out: cap it.
      k = 1 / Math.max(0.5, c);
    } else n = left((a ?? b)!);
    out.push(along(pts[i], n, d * k));
  }
  return out;
}

/** The part of a polyline between distances s0 and s1 along it. */
export function sliceLine(pts: readonly V2[], s0: number, s1: number): V2[] {
  const total = lineLength(pts);
  const a = clamp(Math.min(s0, s1), 0, total);
  const b = clamp(Math.max(s0, s1), 0, total);
  const out: V2[] = [pointAlong(pts, a).pt];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    run += dist(pts[i - 1], pts[i]);
    if (run > a + 1e-6 && run < b - 1e-6) out.push(pts[i]);
  }
  out.push(pointAlong(pts, b).pt);
  return s0 <= s1 ? out : out.reverse();
}

/** Keep the part of a polyline inside the circle of radius r around c (the first run that enters it). */
export function clipLineToCircle(pts: readonly V2[], c: V2, r: number): V2[][] {
  const runs: V2[][] = [];
  let cur: V2[] = [];
  const inside = (p: V2) => dist(p, c) <= r;
  const crossAt = (a: V2, b: V2): V2 => {
    // a inside, b outside (or the reverse): the point on ab at distance r from c, by bisection.
    let lo = 0;
    let hi = 1;
    const aIn = inside(a);
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (inside(lerp2(a, b, mid)) === aIn) lo = mid;
      else hi = mid;
    }
    return lerp2(a, b, (lo + hi) / 2);
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[i - 1];
    if (inside(p)) {
      if (!cur.length && q && !inside(q)) cur.push(crossAt(q, p));
      cur.push(p);
    } else {
      if (cur.length && q) {
        cur.push(crossAt(q, p));
        runs.push(cur);
        cur = [];
      } else if (q && !inside(q)) {
        // Both ends outside: the segment may still cut through the circle.
        const n = nearestOnSegment(c, q, p);
        if (n.d < r && n.t > 0 && n.t < 1) runs.push([crossAt(n.pt, q), n.pt, crossAt(n.pt, p)]);
      }
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs.filter((x) => x.length > 1);
}
