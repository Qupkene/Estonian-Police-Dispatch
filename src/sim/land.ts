/**
 * Land and water lookups shared by the pursuit (suspect stays on land) and the unit model
 * (patrol boats stay on their own water body). Pure geometry, no SimState.
 *
 * - land_ee.json: Estonian land (mainland and islands; the big lakes are part of it).
 * - lakes.json: Peipsi, Pihkva, Võrtsjärv and a few unnamed lakes (Narva reservoir among them).
 * - neighbors.json: Russia, Latvia and Finland, so that foreign land does not count as sea.
 */
import landData from '@/data/geo/land_ee.json';
import lakesData from '@/data/geo/lakes.json';
import neighborsData from '@/data/geo/neighbors.json';
import { destination } from './geo';
import type { LngLat } from './types';

type Ring = number[][];
interface PolyIdx {
  bbox: [number, number, number, number];
  rings: Ring[];
}
interface Geom {
  type: string;
  coordinates: unknown;
}
interface FeatureLike {
  geometry: Geom;
  properties?: { nm?: string | null };
}

function indexGeom(g: Geom, out: PolyIdx[]): void {
  const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as Ring[][];
  for (const rings of polys) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    out.push({ bbox: [minX, minY, maxX, maxY], rings });
  }
}

function featuresOf(data: unknown): FeatureLike[] {
  const fc = data as { features?: FeatureLike[] } & Geom;
  return fc.features ? fc.features : [{ geometry: fc }];
}

let LAND: PolyIdx[] | null = null;
let FOREIGN: PolyIdx[] | null = null;
let LAKES: { key: string; poly: PolyIdx[] }[] | null = null;

function landIndex(): PolyIdx[] {
  if (LAND) return LAND;
  const out: PolyIdx[] = [];
  for (const f of featuresOf(landData)) indexGeom(f.geometry, out);
  LAND = out;
  return out;
}

function foreignIndex(): PolyIdx[] {
  if (FOREIGN) return FOREIGN;
  const out: PolyIdx[] = [];
  for (const f of featuresOf(neighborsData)) indexGeom(f.geometry, out);
  FOREIGN = out;
  return out;
}

/** Lakes keyed by navigable water body: Peipsi and Pihkva are one body (joined by Lämmijärv). */
function lakeIndex(): { key: string; poly: PolyIdx[] }[] {
  if (LAKES) return LAKES;
  const out: { key: string; poly: PolyIdx[] }[] = [];
  featuresOf(lakesData).forEach((f, i) => {
    const nm = f.properties?.nm ?? '';
    const key = nm === 'Lake Peipus' || nm === 'Lake Pskov' ? 'peipsi' : nm === 'Võrtsjärv' ? 'vortsjarv' : `lake${i}`;
    const poly: PolyIdx[] = [];
    indexGeom(f.geometry, poly);
    out.push({ key, poly });
  });
  LAKES = out;
  return out;
}

function inRing(p: LngLat, ring: Ring): boolean {
  let inside = false;
  const [x, y] = p;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function inPolys(p: LngLat, polys: PolyIdx[]): boolean {
  for (const poly of polys) {
    const [a, b, c, d] = poly.bbox;
    if (p[0] < a || p[0] > c || p[1] < b || p[1] > d) continue;
    if (!inRing(p, poly.rings[0])) continue;
    let hole = false;
    for (let i = 1; i < poly.rings.length; i++) {
      if (inRing(p, poly.rings[i])) {
        hole = true;
        break;
      }
    }
    if (!hole) return true;
  }
  return false;
}

/** True if the point is on Estonian land (mainland or an island, not in a lake hole). */
export function isOnLand(p: LngLat): boolean {
  return inPolys(p, landIndex());
}

/** Water body at a point: a lake key, 'sea', or null on land (Estonian or foreign). */
export function waterBodyAt(p: LngLat): string | null {
  for (const l of lakeIndex()) if (inPolys(p, l.poly)) return l.key;
  if (isOnLand(p)) return null;
  if (inPolys(p, foreignIndex())) return null;
  return 'sea';
}

const RING_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];

/** Water bodies at the point or on a ring `km` around it. */
export function waterBodiesNear(p: LngLat, km: number): Set<string> {
  const out = new Set<string>();
  const w = waterBodyAt(p);
  if (w) out.add(w);
  for (const b of RING_BEARINGS) {
    const q = waterBodyAt(destination(p, km, b));
    if (q) out.add(q);
  }
  return out;
}
