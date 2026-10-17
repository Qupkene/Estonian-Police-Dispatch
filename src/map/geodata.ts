/**
 * Offline geodata for the tactical base map, processed once (lazily) from `src/data/geo/*.json`.
 * Pure module (no DOM / maplibre runtime) so the style builder stays testable in node.
 */
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, Point, Polygon, MultiPolygon, Position } from 'geojson';
import landEeRaw from '@/data/geo/land_ee.json';
import neighborsRaw from '@/data/geo/neighbors.json';
import lakesRaw from '@/data/geo/lakes.json';
import countiesRaw from '@/data/geo/counties.json';
import districtsRaw from '@/data/geo/tallinn_districts.json';
import roadsRaw from '@/data/geo/roads.json';
import railRaw from '@/data/geo/rail.json';
import settlementsRaw from '@/data/geo/settlements.json';

type FC<G extends Geometry = Geometry> = FeatureCollection<G, Record<string, unknown>>;

const asFC = <G extends Geometry = Geometry>(x: unknown): FC<G> => x as FC<G>;

/** The eight Tallinn city districts (the districts file also contains Kohtla-Järve's). */
export const TALLINN_DISTRICTS = [
  'Kesklinna',
  'Lasnamäe',
  'Mustamäe',
  'Põhja-Tallinna',
  'Haabersti',
  'Kristiine',
  'Nõmme',
  'Pirita',
] as const;

/**
 * Towns that are missing from (or mis-typed in) settlements.json, with a label rank:
 * 1 = capital, 2 = large city, 3 = county centre / >10k inhabitants. Other `linn` rows get rank 4.
 */
const CITY_RANKS: Record<string, { rank: number; coord?: [number, number] }> = {
  Tallinn: { rank: 1, coord: [24.7536, 59.437] },
  Tartu: { rank: 2 },
  Narva: { rank: 2, coord: [28.1903, 59.3772] },
  Pärnu: { rank: 2 },
  'Kohtla-Järve': { rank: 3, coord: [27.2731, 59.3986] },
  Viljandi: { rank: 3 },
  Maardu: { rank: 3, coord: [24.9783, 59.4769] },
  Rakvere: { rank: 3 },
  Kuressaare: { rank: 3, coord: [22.4853, 58.2528] },
  Sillamäe: { rank: 3 },
  Valga: { rank: 3 },
  Võru: { rank: 3 },
  Jõhvi: { rank: 3 },
  Haapsalu: { rank: 3 },
  Keila: { rank: 3 },
  Paide: { rank: 3 },
  Rapla: { rank: 3 },
  Jõgeva: { rank: 3 },
  Põlva: { rank: 3 },
  Kärdla: { rank: 3 },
};

export type SettlementKind = 'linn' | 'alev' | 'alevik' | 'küla' | 'linnaosa';
type SettlementRow = [string, string, string, number, number];

const approxKm = (a: Position, b: Position) => {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dy = (a[1] - b[1]) * 110.57;
  return Math.hypot(dx, dy);
};

function buildSettlements(): FC<Point> {
  const rows = settlementsRaw as unknown as SettlementRow[];
  const features: Feature<Point, Record<string, unknown>>[] = [];
  const seenCity = new Set<string>();
  const supplements = Object.entries(CITY_RANKS).filter(([, v]) => v.coord);
  for (const [name, type, county, lon, lat] of rows) {
    const kind = (type || 'küla') as SettlementKind;
    let rank: number;
    if (kind === 'linn') {
      if (seenCity.has(name)) continue;
      seenCity.add(name);
      rank = CITY_RANKS[name]?.rank ?? 4;
    } else {
      // Drop village rows that duplicate a supplemented city (e.g. "Kuressaare" küla at the city centre).
      if (kind !== 'linnaosa' && supplements.some(([n, v]) => n === name && approxKm(v.coord!, [lon, lat]) < 4)) continue;
      rank = kind === 'alev' ? 5 : kind === 'alevik' ? 6 : kind === 'linnaosa' ? 5 : 8;
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { name, kind, county, rank },
    });
  }
  for (const [name, v] of supplements) {
    if (seenCity.has(name)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: v.coord! },
      properties: { name, kind: 'linn', county: '', rank: v.rank },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * County boundaries without the coastline: keep only the ring segments shared by two counties
 * and chain them into polylines (so the dashed boundary never traces the coast).
 */
function buildCountyLines(): FC<MultiLineString> {
  const fc = asFC<Polygon | MultiPolygon>(countiesRaw);
  const key = (p: Position) => `${p[0]},${p[1]}`;
  const segKey = (a: Position, b: Position) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  const counts = new Map<string, number>();
  const rings: Position[][] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys)
      for (const ring of poly) {
        rings.push(ring);
        for (let i = 1; i < ring.length; i++) {
          const k = segKey(ring[i - 1], ring[i]);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
  }
  const emitted = new Set<string>();
  const lines: Position[][] = [];
  for (const ring of rings) {
    let cur: Position[] | null = null;
    for (let i = 1; i < ring.length; i++) {
      const k = segKey(ring[i - 1], ring[i]);
      const shared = (counts.get(k) ?? 0) >= 2 && !emitted.has(k);
      if (shared) {
        emitted.add(k);
        if (!cur) cur = [ring[i - 1]];
        cur.push(ring[i]);
      } else if (cur) {
        lines.push(cur);
        cur = null;
      }
    }
    if (cur) lines.push(cur);
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines }, properties: {} }],
  };
}

function cleanLines(raw: unknown): FC<LineString | MultiLineString> {
  const fc = asFC<LineString | MultiLineString>(raw);
  return { type: 'FeatureCollection', features: fc.features.filter((f) => f.geometry) };
}

function filterDistricts(): FC<Polygon | MultiPolygon> {
  const fc = asFC<Polygon | MultiPolygon>(districtsRaw);
  const names = new Set<string>(TALLINN_DISTRICTS);
  return { type: 'FeatureCollection', features: fc.features.filter((f) => names.has(String(f.properties?.name))) };
}

export interface GeoData {
  land: FC;
  neighbors: FC;
  lakes: FC;
  counties: FC;
  countyLines: FC<MultiLineString>;
  districts: FC<Polygon | MultiPolygon>;
  roads: FC<LineString | MultiLineString>;
  rail: FC<LineString | MultiLineString>;
  settlements: FC<Point>;
}

let cache: GeoData | null = null;

/** Processed offline geodata (computed once, then shared by every style build). */
export function geoData(): GeoData {
  if (cache) return cache;
  cache = {
    land: asFC(landEeRaw),
    neighbors: asFC(neighborsRaw),
    lakes: asFC(lakesRaw),
    counties: asFC(countiesRaw),
    countyLines: buildCountyLines(),
    districts: filterDistricts(),
    roads: cleanLines(roadsRaw),
    rail: cleanLines(railRaw),
    settlements: buildSettlements(),
  };
  return cache;
}

/** Bounds of Estonia used for maxBounds / raster source bounds. [w, s, e, n] */
export const ESTONIA_BBOX: [number, number, number, number] = [21.3, 57.45, 28.35, 59.95];
/** Map panning limit (generous margin around Estonia). */
export const MAX_BOUNDS: [[number, number], [number, number]] = [
  [19.4, 56.7],
  [30.6, 60.75],
];
