import type { LngLat } from './types';

const R_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in km. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at `km` from `a` along `bearingDeg`. */
export function destination(a: LngLat, km: number, bearingDeg: number): LngLat {
  const d = km / R_KM;
  const br = toRad(bearingDeg);
  const lat1 = toRad(a[1]);
  const lon1 = toRad(a[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lon2), toDeg(lat2)];
}

export function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Cumulative distances (km) along a polyline. */
export function cumulative(path: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + haversineKm(path[i - 1], path[i]));
  return out;
}

/** Position and heading at distance `km` along a path with precomputed cumulative distances. */
export function along(path: LngLat[], cum: number[], km: number): { pos: LngLat; heading: number } {
  if (path.length === 1 || km <= 0) return { pos: path[0], heading: path.length > 1 ? bearing(path[0], path[1]) : 0 };
  const total = cum[cum.length - 1];
  if (km >= total) {
    const n = path.length;
    return { pos: path[n - 1], heading: bearing(path[n - 2], path[n - 1]) };
  }
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= km) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1e-9;
  const t = (km - cum[lo]) / seg;
  return { pos: lerp(path[lo], path[hi], t), heading: bearing(path[lo], path[hi]) };
}

/** Point at fraction t (0..1) of a polyline. */
export function alongFraction(path: LngLat[], t: number): LngLat {
  const cum = cumulative(path);
  return along(path, cum, cum[cum.length - 1] * Math.max(0, Math.min(1, t))).pos;
}

/** Random-ish offset of a point by up to `km` (deterministic given u,v in [0,1)). */
export function jitter(a: LngLat, km: number, u: number, v: number): LngLat {
  return destination(a, km * Math.sqrt(u), v * 360);
}

export function pointInBounds(p: LngLat, b: [LngLat, LngLat]): boolean {
  return p[0] >= b[0][0] && p[0] <= b[1][0] && p[1] >= b[0][1] && p[1] <= b[1][1];
}
