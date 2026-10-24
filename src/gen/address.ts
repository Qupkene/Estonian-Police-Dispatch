// Owned by gen-people. Incident locations and home addresses (DESIGN §4.2).
import settlementsJson from '@/data/geo/settlements.json';
import roadsJson from '@/data/geo/roads.json';
import countiesJson from '@/data/geo/counties.json';
import districtsJson from '@/data/geo/tallinn_districts.json';
import lakesJson from '@/data/geo/lakes.json';
import { FARM_NAMES } from '@/gen/names';
import { along, cumulative, destination, haversineKm, jitter, lerp, pointInBounds } from '@/sim/geo';
import type { Rng } from '@/sim/rng';
import type {
  IncidentLocation,
  LngLat,
  Place,
  PlaceKind,
  RegionDef,
  SpeakerLang,
  Street,
  Town,
} from '@/sim/types';

// ─────────────────────────────────────────────────────────────────────────────
// Geodata (parsed once)
// ─────────────────────────────────────────────────────────────────────────────

type SettlementType = 'küla' | 'alevik' | 'alev' | 'linn' | 'linnaosa';
interface Settlement {
  name: string; // cleaned ("Dirhami küla / Derhamn" → "Dirhami")
  type: SettlementType;
  county: string;
  coord: LngLat;
}

type Ring = LngLat[];
interface Area {
  name: string;
  polys: Ring[][]; // polygons → rings (outer + holes)
  bbox: [number, number, number, number];
}
interface Geometry {
  type: string;
  coordinates: unknown;
}
interface Feature {
  geometry: Geometry;
  properties: Record<string, unknown>;
}

function cleanSettlementName(raw: string): string {
  return raw
    .split(' / ')[0]
    .replace(/ küla$/, '')
    .trim();
}

const SETTLEMENTS: Settlement[] = (settlementsJson as unknown as [string, string, string, number, number][])
  .filter((r) => r[2] !== '')
  .map((r) => ({
    name: cleanSettlementName(r[0]),
    type: r[1] as SettlementType,
    county: r[2],
    coord: [r[3], r[4]],
  }));

function toArea(f: Feature, name: string): Area {
  const g = f.geometry;
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Ring[][];
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { name, polys, bbox: [x0, y0, x1, y1] };
}

const COUNTIES: Area[] = (countiesJson as unknown as { features: Feature[] }).features.map((f) =>
  toArea(f, String(f.properties.name)),
);

/** District polygons are named in the genitive ("Kesklinna", "Põhja-Tallinna"). */
const DISTRICT_NAME: Record<string, string> = { Kesklinna: 'Kesklinn', 'Põhja-Tallinna': 'Põhja-Tallinn' };
const DISTRICTS: Area[] = (districtsJson as unknown as { features: Feature[] }).features.map((f) => {
  const n = String(f.properties.name);
  return toArea(f, DISTRICT_NAME[n] ?? n);
});

function inRing(p: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inArea(p: LngLat, a: Area): boolean {
  const [x0, y0, x1, y1] = a.bbox;
  if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) return false;
  // Even-odd over all rings of a polygon handles holes.
  return a.polys.some((poly) => poly.reduce((acc, ring) => (inRing(p, ring) ? !acc : acc), false));
}

/** County ("Harju maakond") containing the point, or undefined outside Estonia. */
export function countyAt(p: LngLat): string | undefined {
  return COUNTIES.find((c) => inArea(p, c))?.name;
}

/** Tallinn / Kohtla-Järve district containing the point. */
export function districtAt(p: LngLat): string | undefined {
  return DISTRICTS.find((d) => inArea(p, d))?.name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Roads
// ─────────────────────────────────────────────────────────────────────────────

interface Road {
  path: LngLat[];
  cum: number[];
  total: number;
  rank: number;
  ref?: string;
  /** Estonian road name without the km, e.g. "Tallinna-Narva maantee (E20)". */
  name?: string;
  /** Kilometre at path[0]. */
  kmOffset: number;
}

const TALLINN: LngLat = [24.7536, 59.437];
/** Towns missing from settlements.json (it lacks the largest cities). */
const BIG_TOWNS: { name: string; coord: LngLat }[] = [
  { name: 'Tallinn', coord: TALLINN },
  { name: 'Narva', coord: [28.1903, 59.3772] },
  { name: 'Kohtla-Järve', coord: [27.2731, 59.3986] },
  { name: 'Kuressaare', coord: [22.4853, 58.2481] },
  { name: 'Maardu', coord: [24.98, 59.4767] },
];

/** Named E-roads: the km is counted from `origin` (as on Estonian road markers). */
const NAMED_ROADS: Record<string, { name: (p: LngLat) => string; origin: LngLat }> = {
  '20': { name: () => 'Tallinna-Narva maantee (E20)', origin: TALLINN },
  '67': { name: () => 'Tallinna-Pärnu-Ikla maantee (E67)', origin: TALLINN },
  '263': {
    name: (p) =>
      p[1] > 58.42 ? 'Tallinna-Tartu maantee (E263)' : 'Tallinna-Tartu-Võru-Luhamaa maantee (E263)',
    origin: TALLINN,
  },
  '264': { name: () => 'Jõhvi-Tartu-Valga maantee (E264)', origin: [27.41, 59.36] },
  '77': { name: () => 'Riia-Pihkva maantee (E77)', origin: [26.0, 57.45] },
};

function lineStrings(g: Geometry): LngLat[][] {
  if (g.type === 'LineString') return [g.coordinates as LngLat[]];
  if (g.type === 'MultiLineString') return g.coordinates as LngLat[][];
  return [];
}

function makeRoad(path: LngLat[], rank: number, ref?: string): Road {
  const cum = cumulative(path);
  return { path, cum, total: cum[cum.length - 1], rank, ref, kmOffset: 0 };
}

/** Orient segments away from the origin and chain their kilometres. */
function chainKm(roads: Road[], origin: LngLat): void {
  for (const r of roads) {
    if (haversineKm(origin, r.path[r.path.length - 1]) < haversineKm(origin, r.path[0])) {
      r.path = [...r.path].reverse();
      r.cum = cumulative(r.path);
    }
  }
  roads.sort((a, b) => haversineKm(origin, a.path[0]) - haversineKm(origin, b.path[0]));
  let prev: Road | undefined;
  for (const r of roads) {
    const gap = prev ? haversineKm(prev.path[prev.path.length - 1], r.path[0]) : Infinity;
    r.kmOffset = prev && gap < 5 ? prev.kmOffset + prev.total + gap : haversineKm(origin, r.path[0]) * 1.12;
    prev = r;
  }
}

function genitiveTown(name: string): string {
  return name === 'Tallinn' ? 'Tallinna' : name;
}

function nearestTown(p: LngLat, maxKm: number, exclude?: string): string | undefined {
  let best: string | undefined;
  let bestD = maxKm;
  const consider = (name: string, c: LngLat) => {
    const d = haversineKm(p, c);
    if (d < bestD && name !== exclude) {
      bestD = d;
      best = name;
    }
  };
  for (const t of BIG_TOWNS) consider(t.name, t.coord);
  for (const s of SETTLEMENTS) if (s.type === 'linn') consider(s.name, s.coord);
  return best;
}

let roadsCache: Road[] | undefined;
function allRoads(): Road[] {
  if (roadsCache) return roadsCache;
  const roads: Road[] = [];
  const byRef = new Map<string, Road[]>();
  for (const f of (roadsJson as unknown as { features: Feature[] }).features) {
    if (f.properties.kind === 'Ferry Route') continue;
    const ref = f.properties.ref ? String(f.properties.ref) : undefined;
    for (const line of lineStrings(f.geometry)) {
      if (line.length < 2) continue;
      const r = makeRoad(line, Number(f.properties.rank) || 9, ref);
      roads.push(r);
      // NE mislabels Tallinn's ring road as E67; keep it out of the Via Baltica chain.
      if (ref === '67' && Math.min(...line.map((c) => c[1])) > 59.25) {
        r.name = 'Tallinna ringtee';
        r.kmOffset = 0;
      } else if (ref && NAMED_ROADS[ref]) {
        byRef.set(ref, [...(byRef.get(ref) ?? []), r]);
      }
    }
  }
  for (const [ref, rs] of byRef) chainKm(rs, NAMED_ROADS[ref].origin);
  for (const r of roads) {
    if (r.name || (r.ref && NAMED_ROADS[r.ref])) continue;
    // "A-B maantee" after the towns nearest to each end (B must differ from A).
    const a = nearestTown(r.path[0], 25);
    const b = a && nearestTown(r.path[r.path.length - 1], 40, a);
    // Both route ends in the genitive: "Türi-Tallinna maantee", not "Türi-Tallinn maantee".
    if (a && b) r.name = `${genitiveTown(a)}-${genitiveTown(b)} maantee`;
  }
  roadsCache = roads;
  return roads;
}

function roadName(r: Road, p: LngLat): string {
  if (r.ref && NAMED_ROADS[r.ref] && !r.name) return NAMED_ROADS[r.ref].name(p);
  return r.name ?? 'maantee';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-region caches
// ─────────────────────────────────────────────────────────────────────────────

interface ShorePoint {
  coord: LngLat;
  lake: string;
}
interface RegionCache {
  rural: Settlement[]; // küla + alevik + alev
  villages: Settlement[]; // küla only
  towns: Town[]; // region towns, or synthesised from settlements
  roads: Road[];
  shores?: ShorePoint[];
  avgRuShare: number;
}

const caches = new WeakMap<RegionDef, RegionCache>();

function inRegion(region: RegionDef, county: string | undefined, coord: LngLat): boolean {
  if (region.counties.length) return county !== undefined && region.counties.includes(county);
  return pointInBounds(coord, region.bounds);
}

/** geoBoundaries lists some cities (Narva, Maardu, Kuressaare) as villages at the town centre. */
function isTownArtifact(s: Settlement, towns: Town[]): boolean {
  const all = [...BIG_TOWNS, ...towns];
  return all.some((t) => t.name === s.name && haversineKm(t.coord, s.coord) < 8);
}

const SETTLEMENT_POP: Partial<Record<SettlementType, number>> = { linn: 8000, alev: 2500, alevik: 900 };

function regionCache(region: RegionDef): RegionCache {
  let c = caches.get(region);
  if (c) return c;
  const local = SETTLEMENTS.filter((s) => inRegion(region, s.county, s.coord));
  const rural = local.filter(
    (s) =>
      (s.type === 'küla' || s.type === 'alevik' || s.type === 'alev') && !isTownArtifact(s, region.towns),
  );
  const towns: Town[] = region.towns.length
    ? region.towns
    : local
        .filter((s) => SETTLEMENT_POP[s.type])
        .map((s) => ({
          name: s.name,
          county: s.county,
          coord: s.coord,
          population: SETTLEMENT_POP[s.type]!,
          ruShare: 0.1,
        }));
  const roads = allRoads().filter((r) => r.path.some((p) => pointInBounds(p, region.bounds)));
  const pop = towns.reduce((a, t) => a + t.population, 0);
  const avgRuShare = pop > 0 ? towns.reduce((a, t) => a + t.population * t.ruShare, 0) / pop : 0.25;
  c = { rural, villages: rural.filter((s) => s.type === 'küla'), towns, roads, avgRuShare };
  caches.set(region, c);
  return c;
}

const LAKE_NAMES: Record<string, string> = {
  'Lake Peipus': 'Peipsi järv',
  'Lake Pskov': 'Pihkva järv',
  Võrtsjärv: 'Võrtsjärv',
};

function shorePoints(region: RegionDef, c: RegionCache): ShorePoint[] {
  if (c.shores) return c.shores;
  const out: ShorePoint[] = [];
  for (const f of (lakesJson as unknown as { features: Feature[] }).features) {
    const a = toArea(f, '');
    const nm = f.properties.nm ? String(f.properties.nm) : '';
    const lake =
      LAKE_NAMES[nm] ?? (a.bbox[0] < 28 && a.bbox[2] > 28 && a.bbox[1] > 59 ? 'Narva veehoidla' : '');
    if (!lake) continue;
    for (const p of a.polys[0][0]) {
      if (!pointInBounds(p, region.bounds)) continue;
      const county = countyAt(p) ?? nearestSettlement(c.rural, p, 3)?.county;
      if (county && inRegion(region, county, p)) out.push({ coord: p, lake });
    }
  }
  c.shores = out;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Small islands that may be their own movement zone; matched against zone ids by substring. */
const ISLANDS: { keys: string[]; box: [number, number, number, number] }[] = [
  { keys: ['muhu', 'saare'], box: [23.05, 58.53, 23.42, 58.67] },
  { keys: ['vormsi'], box: [23.05, 58.96, 23.4, 59.05] },
  { keys: ['kihnu'], box: [23.93, 58.1, 24.04, 58.16] },
  { keys: ['ruhnu'], box: [23.2, 57.76, 23.31, 57.83] },
  { keys: ['abruka'], box: [22.48, 58.12, 22.56, 58.17] },
  { keys: ['prangli'], box: [24.97, 59.6, 25.05, 59.66] },
  { keys: ['naissaar'], box: [24.48, 59.53, 24.57, 59.61] },
  { keys: ['aegna'], box: [24.74, 59.57, 24.78, 59.6] },
  { keys: ['piirissaar'], box: [27.46, 58.36, 27.57, 58.42] },
];

function defaultZone(region: RegionDef): string {
  return region.zones.some((z) => z.id === 'mainland') || !region.zones.length
    ? 'mainland'
    : region.zones[0].id;
}

/** Movement zone for a point: island bboxes, then county (Saare/Hiiu), else mainland. */
export function zoneFor(region: RegionDef, coord: LngLat, county?: string): string {
  const ids = region.zones.map((z) => z.id);
  if (ids.length <= 1) return defaultZone(region);
  const find = (keys: string[]) => ids.find((id) => keys.some((k) => id.toLowerCase().includes(k)));
  for (const isl of ISLANDS) {
    const [x0, y0, x1, y1] = isl.box;
    if (coord[0] >= x0 && coord[0] <= x1 && coord[1] >= y0 && coord[1] <= y1) {
      const z = find(isl.keys);
      if (z) return z;
    }
  }
  const cty = county ?? countyAt(coord);
  const z = cty === 'Saare maakond' ? find(['saare']) : cty === 'Hiiu maakond' ? find(['hiiu']) : undefined;
  return z ?? defaultZone(region);
}

function nearestSettlement(list: Settlement[], p: LngLat, maxKm = Infinity): Settlement | undefined {
  let best: Settlement | undefined;
  let bestD = maxKm;
  for (const s of list) {
    const d = haversineKm(p, s.coord);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function settlementLabel(s: Settlement): string {
  if (s.type === 'küla') return /küla$/i.test(s.name) ? s.name : `${s.name} küla`;
  if (s.type === 'alevik' || s.type === 'alev') return `${s.name} ${s.type}`;
  return s.name;
}

function townZone(region: RegionDef, city: string, coord: LngLat): string {
  return region.towns.find((t) => t.name === city)?.zone ?? zoneFor(region, coord);
}

// prettier-ignore
const GENERIC_STREETS = [
  'Kooli tn', 'Pargi tn', 'Aia tn', 'Tallinna mnt', 'Nurme tn', 'Kase tn', 'Pikk tn', 'Lai tn', 'Tartu mnt',
  'Pärnu mnt', 'Jaama tn', 'Vabriku tn', 'Kalda tn', 'Lille tn', 'Kesk tn', 'Sõpruse tn', 'Rahu tn',
  'Metsa tn', 'Ranna tn', 'Uus tn', 'Vee tn', 'Turu tn', 'Posti tn', 'Kiriku tn', 'Mäe tn', 'Oja tn',
  'Männi tn', 'Kuuse tn', 'Tamme tn', 'Vahtra tn', 'Pihlaka tn', 'Lepa tn', 'Raudtee tn', 'Staadioni tn',
  'Spordi tn', 'Kalevi tn', 'Koidula tn', 'Jakobsoni tn', 'Kreutzwaldi tn', 'Lõuna tn', 'Põhja tn', 'Ida tn',
  'Lääne tn', 'Narva mnt', 'Rakvere tn', 'Viljandi mnt', 'Rüütli tn', 'Kungla tn', 'Vikerkaare tn', 'Õuna tn',
  'Kirsi tn', 'Haava tn', 'Sireli tn', 'Jõe tn', 'Silla tn', 'Tööstuse tn', 'Veski tn', 'Karja tn',
  'Aiandi tn', 'Põllu tn',
];

/** A generic street name that does not point to the town itself ("Tallinna mnt" in Tallinn). */
function genericStreet(rng: Rng, town: string): string {
  const own = genitiveTown(town);
  const pool = GENERIC_STREETS.filter((s) => s.split(' ')[0] !== own);
  return rng.pick(pool);
}

/** A plausible street address in a small town that has no streets of its own in the data ("Kooli tn 12"). */
export function townStreetAddress(rng: Rng, town: string): string {
  return `${genericStreet(rng, town)} ${rng.int(1, 60)}`;
}

/** Russian-speaking share by Tallinn district (approximate, for home placement). */
const DISTRICT_RU: Record<string, number> = {
  Lasnamäe: 0.62,
  'Põhja-Tallinn': 0.45,
  Haabersti: 0.45,
  Mustamäe: 0.4,
  Kristiine: 0.32,
  Kesklinn: 0.24,
  Pirita: 0.15,
  Nõmme: 0.12,
};

/** Russian-speaking share of rural areas by county. */
const COUNTY_RU: Record<string, number> = {
  'Ida-Viru maakond': 0.4,
  'Harju maakond': 0.1,
  'Jõgeva maakond': 0.06,
  'Valga maakond': 0.05,
  'Lääne-Viru maakond': 0.05,
  'Tartu maakond': 0.04,
  'Põlva maakond': 0.04,
};
const countyRu = (county: string): number => COUNTY_RU[county] ?? 0.02;

function langFactor(ruShare: number, lang?: SpeakerLang): number {
  if (lang === 'ru') return ruShare;
  if (lang === 'et') return 1 - ruShare;
  if (lang === 'uk') return 0.5 + ruShare * 0.5;
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streets & house numbers
// ─────────────────────────────────────────────────────────────────────────────

type StreetUse = 'residential' | 'house' | 'street' | 'business';

const STREET_PREF: Record<StreetUse, Record<Street['kind'], number>> = {
  residential: { apartment: 3, mixed: 1, house: 0.15, commercial: 0.1 },
  house: { house: 3, mixed: 1, apartment: 0.1, commercial: 0.05 },
  street: { apartment: 1, house: 0.7, mixed: 1.2, commercial: 1.5 },
  business: { commercial: 3, mixed: 2, apartment: 0.5, house: 0.1 },
};

/** Position of a house number along the street, offset to the odd/even side. */
function housePos(s: Street, num: number, rng: Rng): LngLat {
  const [lo, hi] = s.houses;
  const t = hi > lo ? (num - lo) / (hi - lo) : 0.5;
  const cum = cumulative(s.points);
  const { pos, heading } = along(s.points, cum, cum[cum.length - 1] * t);
  return destination(pos, 0.012 + rng.next() * 0.012, heading + (num % 2 ? -90 : 90));
}

function houseNumber(rng: Rng, s: Street): number {
  const [lo, hi] = s.houses;
  return rng.int(Math.min(lo, hi), Math.max(lo, hi));
}

/** Apartment suffix: always on apartment streets, sometimes on mixed ones. */
function apartmentSuffix(rng: Rng, kind: Street['kind'], use: StreetUse): string {
  if (use !== 'residential') return '';
  if (kind === 'apartment') return `-${rng.int(1, 120)}`;
  if (kind === 'mixed' && rng.chance(0.5)) return `-${rng.int(1, 60)}`;
  return '';
}

function streetLocation(
  rng: Rng,
  region: RegionDef,
  use: StreetUse,
  placeKind: PlaceKind,
): IncidentLocation | null {
  if (!region.streets.length) return null;
  const pref = STREET_PREF[use];
  const s = rng.weighted(region.streets, (x) => (x.weight ?? 1) * pref[x.kind]);
  const num = houseNumber(rng, s);
  const coord = housePos(s, num, rng);
  return {
    address: `${s.name} ${num}${apartmentSuffix(rng, s.kind, use)}`,
    coord,
    city: s.city,
    district: s.district ?? districtAt(coord),
    placeKind,
    zone: s.zone ?? townZone(region, s.city, coord),
  };
}

function townLocation(rng: Rng, region: RegionDef, placeKind: PlaceKind): IncidentLocation {
  const c = regionCache(region);
  if (!c.towns.length) {
    const coord = jitter(region.center, 1, rng.next(), rng.next());
    const s = nearestSettlement(SETTLEMENTS, coord);
    return {
      address: s ? `${settlementLabel(s)}, ${s.county}` : region.hqCity || region.name.et,
      coord,
      city: s?.name ?? region.hqCity,
      district: s?.county,
      placeKind,
      zone: zoneFor(region, coord),
    };
  }
  const t = rng.weighted(c.towns, (x) => x.population);
  const coord = jitter(t.coord, t.population >= 30000 ? 1.5 : 0.6, rng.next(), rng.next());
  return {
    address: `${genericStreet(rng, t.name)} ${rng.int(1, 60)}`,
    coord,
    city: t.name,
    district: districtAt(coord),
    placeKind,
    zone: t.zone ?? zoneFor(region, coord, t.county),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rural, lakes & highways
// ─────────────────────────────────────────────────────────────────────────────

const endsWithVowel = (s: string) => /[aeiouõäöü]$/i.test(s);

/** "Kuusiku-Alu tee, 3. km": a local road towards a neighbouring settlement. */
function localRoad(rng: Rng, c: RegionCache, from: Settlement): { address: string; coord: LngLat } | null {
  const near = c.rural.filter((s) => {
    const d = haversineKm(s.coord, from.coord);
    return s !== from && d > 2 && d < 9 && endsWithVowel(s.name);
  });
  if (!near.length || !endsWithVowel(from.name)) return null;
  const to = rng.pick(near);
  const t = rng.range(0.15, 0.85);
  const km = haversineKm(from.coord, to.coord) * t * 1.15;
  return {
    address: `${from.name}-${to.name} tee, ${Math.max(1, Math.round(km))}. km, ${from.county}`,
    coord: jitter(lerp(from.coord, to.coord, t), 0.15, rng.next(), rng.next()),
  };
}

const COOP_NAMES = [
  'Kalda',
  'Männiku',
  'Kaasiku',
  'Lepiku',
  'Metsa',
  'Ranna',
  'Sireli',
  'Vahtra',
  'Õunapuu',
  'Kuuse',
];

/** A plot in a summer-cottage cooperative near a bigger town: "Kalda AÜ, krunt 112, Kurtna küla". */
function cottagePlot(rng: Rng, region: RegionDef, c: RegionCache): IncidentLocation | null {
  const towns = c.towns.filter((t) => t.population >= 10000);
  if (!towns.length) return null;
  const t = rng.weighted(towns, (x) => Math.sqrt(x.population));
  for (let i = 0; i < 4; i++) {
    const coord = destination(t.coord, rng.range(4, 12), rng.range(0, 360));
    const county = countyAt(coord);
    if (!county || !inRegion(region, county, coord) || !pointInBounds(coord, region.bounds)) continue;
    const near = nearestSettlement(c.rural, coord, 6);
    return {
      address:
        `${rng.pick(COOP_NAMES)} AÜ, krunt ${rng.int(1, 260)}` + (near ? `, ${settlementLabel(near)}` : ''),
      coord,
      city: near?.name ?? t.name,
      district: county,
      placeKind: 'summerhouse',
      zone: zoneFor(region, coord, county),
    };
  }
  return null;
}

function ruralLocation(rng: Rng, region: RegionDef, kind: PlaceKind): IncidentLocation | null {
  const c = regionCache(region);
  if (kind === 'summerhouse' && rng.chance(0.4)) {
    const plot = cottagePlot(rng, region, c);
    if (plot) return plot;
  }
  const pool = kind === 'village' || !c.villages.length ? c.rural : c.villages;
  if (!pool.length) return null;
  const s = kind === 'village' ? rng.weighted(pool, (x) => (x.type === 'küla' ? 1 : 3)) : rng.pick(pool);
  const label = settlementLabel(s);
  let coord = jitter(s.coord, 0.6, rng.next(), rng.next());
  let address: string;
  if (kind === 'farm') address = `${rng.pick(FARM_NAMES)} talu, ${label}, ${s.county}`;
  else if (kind === 'summerhouse') address = `${rng.pick(FARM_NAMES)}, ${label}, ${s.county}`;
  else if (kind === 'ruralroad') {
    const road = localRoad(rng, c, s);
    address = road?.address ?? `${label}, ${s.county}`;
    if (road) coord = road.coord;
  } else address = `${label}, ${s.county}`;
  return {
    address,
    coord,
    city: s.name,
    district: s.county,
    placeKind: kind,
    zone: zoneFor(region, coord, s.county),
  };
}

function lakeLocation(rng: Rng, region: RegionDef, kind: PlaceKind): IncidentLocation | null {
  const c = regionCache(region);
  const shores = shorePoints(region, c);
  if (!shores.length) return null;
  const sp = rng.pick(shores);
  const coord = jitter(sp.coord, 0.25, rng.next(), rng.next());
  const s = nearestSettlement(c.rural, coord, 15);
  const county = s?.county ?? countyAt(sp.coord) ?? '';
  return {
    address: s ? `${settlementLabel(s)}, ${s.county}` : `${sp.lake}, ${county}`,
    coord,
    city: s?.name ?? sp.lake,
    district: county || undefined,
    placeName: sp.lake,
    placeKind: kind,
    zone: zoneFor(region, coord, county || undefined),
  };
}

function highwayLocation(rng: Rng, region: RegionDef): IncidentLocation | null {
  const c = regionCache(region);
  if (!c.roads.length) return null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const r = rng.weighted(c.roads, (x) => x.total * (x.rank <= 3 ? 2.5 : x.rank <= 6 ? 1.5 : 1));
    const d = rng.range(0, r.total);
    const pos = along(r.path, r.cum, d).pos;
    if (!pointInBounds(pos, region.bounds)) continue;
    const county = countyAt(pos);
    if (!county || (region.counties.length && !region.counties.includes(county))) continue;
    const km = Math.max(1, Math.round(r.kmOffset + d));
    const city = nearestTown(pos, 40) ?? nearestSettlement(c.rural, pos)?.name ?? '';
    return {
      address: `${roadName(r, pos)}, ${km}. km`,
      coord: pos,
      city,
      district: county,
      placeKind: 'highway',
      zone: zoneFor(region, pos, county),
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// pickLocation
// ─────────────────────────────────────────────────────────────────────────────

const STREET_KINDS = new Set<PlaceKind>(['residential', 'house', 'street']);
// prettier-ignore
const RURAL_KINDS = new Set<PlaceKind>([
  'village', 'farm', 'summerhouse', 'forest', 'ruralroad', 'lake', 'beach',
]);
// prettier-ignore
const BUSINESS_KINDS = new Set<PlaceKind>([
  'bar', 'nightclub', 'mall', 'shop', 'bank', 'office', 'parking', 'hotel', 'gasstation', 'industrial',
  'construction', 'oldtown', 'museum', 'concert', 'government', 'embassy',
]);

const SIMILAR: Partial<Record<PlaceKind, PlaceKind[]>> = {
  bar: ['nightclub', 'hotel'],
  nightclub: ['bar', 'concert'],
  mall: ['shop'],
  shop: ['mall', 'gasstation'],
  bank: ['mall', 'office'],
  school: ['university', 'kindergarten'],
  kindergarten: ['school'],
  university: ['school'],
  park: ['beach', 'forest'],
  beach: ['lake', 'park'],
  forest: ['park'],
  lake: ['beach'],
  highway: ['ruralroad'],
  ruralroad: ['highway'],
  trainstation: ['busstation'],
  busstation: ['trainstation'],
  port: ['trainstation', 'busstation'],
  airport: ['port'],
  stadium: ['concert', 'park'],
  concert: ['stadium', 'nightclub'],
  office: ['government', 'bank'],
  industrial: ['construction', 'port'],
  construction: ['industrial'],
  parking: ['mall', 'shop'],
  hotel: ['bar'],
  church: ['cemetery', 'museum'],
  cemetery: ['church'],
  gasstation: ['shop'],
  government: ['office', 'embassy'],
  embassy: ['government'],
  prison: ['government'],
  border: ['port', 'highway'],
  farm: ['village', 'summerhouse'],
  summerhouse: ['village', 'farm'],
  village: ['farm'],
  oldtown: ['museum', 'church'],
  museum: ['oldtown', 'church'],
};

/** Curated places of one of `kinds` that carry one of `tags`. */
export function taggedPlaces(region: RegionDef, kinds: PlaceKind[], tags: string[]): Place[] {
  return region.places.filter((p) => kinds.includes(p.kind) && !!p.tags?.some((t) => tags.includes(t)));
}

function placeLocation(region: RegionDef, p: Place): IncidentLocation {
  return {
    address: p.address,
    coord: p.coord,
    city: p.city,
    district: p.district,
    placeName: p.name,
    placeKind: p.kind,
    zone: p.zone ?? zoneFor(region, p.coord),
  };
}

function generated(rng: Rng, region: RegionDef, kind: PlaceKind): IncidentLocation | null {
  if (STREET_KINDS.has(kind)) return streetLocation(rng, region, kind as StreetUse, kind);
  if (kind === 'highway') return highwayLocation(rng, region);
  if (kind === 'lake' || kind === 'beach')
    return lakeLocation(rng, region, kind) ?? ruralLocation(rng, region, kind);
  if (RURAL_KINDS.has(kind)) return ruralLocation(rng, region, kind);
  return null;
}

/** A curated place of the kind (preferred), else a generated location of that exact kind. */
function exact(rng: Rng, region: RegionDef, kind: PlaceKind): IncidentLocation | null {
  const places = region.places.filter((p) => p.kind === kind);
  // Address generators give variety for homes/rural spots, so curated ones only sometimes win there.
  const generic = STREET_KINDS.has(kind) || RURAL_KINDS.has(kind) || kind === 'highway';
  if (places.length && (!generic || rng.chance(0.35))) return placeLocation(region, rng.pick(places));
  return generated(rng, region, kind) ?? (places.length ? placeLocation(region, rng.pick(places)) : null);
}

/**
 * Pick an incident location in the region for one of the given place kinds (see DESIGN §4.2). With `tags`, a
 * curated place of those kinds that carries one of the tags (IncidentTemplate.placeTags); the usual pick when
 * the region has none.
 */
export function pickLocation(rng: Rng, region: RegionDef, kinds: PlaceKind[], tags?: string[]): IncidentLocation {
  if (tags?.length) {
    const tagged = taggedPlaces(region, kinds, tags);
    if (tagged.length) return placeLocation(region, rng.pick(tagged));
  }
  const order = rng.shuffle(kinds.length ? [...kinds] : (['street'] as PlaceKind[]));
  for (const k of order) {
    const loc = exact(rng, region, k);
    if (loc) return loc;
  }
  for (const k of order) {
    for (const sim of SIMILAR[k] ?? []) {
      const loc = exact(rng, region, sim);
      if (loc) return loc;
    }
  }
  // Urban kinds without a curated place: an address on a suitable street, keeping the kind.
  for (const k of order) {
    if (RURAL_KINDS.has(k) || k === 'highway') continue;
    const loc = streetLocation(rng, region, BUSINESS_KINDS.has(k) ? 'business' : 'street', k);
    if (loc) return loc;
  }
  const rural = order.find((k) => RURAL_KINDS.has(k) || k === 'highway');
  if (rural) {
    const loc = ruralLocation(rng, region, rural === 'highway' ? 'ruralroad' : rural);
    if (loc) return loc;
  }
  return townLocation(rng, region, order[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Home addresses
// ─────────────────────────────────────────────────────────────────────────────

export interface HomeAddress {
  address: string; // "Punane tn 16-45" or "Mäe talu, Kuusiku-Nõmme küla, Rapla maakond"
  city: string;
  coord: LngLat;
  district?: string;
  county?: string;
  zone: string;
  /** Russian-speaking share at the address (drives the resident's language). */
  ruShare: number;
  population?: number;
  rural?: boolean;
}

/** Russian-speaking share of a town in the region (region average when unknown). */
export function townRuShare(region: RegionDef, city: string): number {
  const t = region.towns.find((x) => x.name === city);
  if (t) return t.ruShare;
  const s = SETTLEMENTS.find((x) => x.name === city && region.counties.includes(x.county));
  return s ? countyRu(s.county) : regionCache(region).avgRuShare;
}

function ruralHome(rng: Rng, region: RegionDef, lang?: SpeakerLang): HomeAddress | null {
  const c = regionCache(region);
  if (!c.rural.length) return null;
  const s = rng.weighted(c.rural, (x) => (x.type === 'küla' ? 1 : 4) * langFactor(countyRu(x.county), lang));
  const coord = jitter(s.coord, s.type === 'küla' ? 0.8 : 0.4, rng.next(), rng.next());
  const label = settlementLabel(s);
  // Official (ADS) style: the property name without "talu", then village and county.
  const address =
    s.type === 'küla'
      ? `${rng.pick(FARM_NAMES)}, ${label}, ${s.county}`
      : `${genericStreet(rng, s.name)} ${rng.int(1, 40)}${rng.chance(0.3) ? `-${rng.int(1, 18)}` : ''}`;
  return {
    address,
    city: s.name,
    coord,
    county: s.county,
    zone: zoneFor(region, coord, s.county),
    ruShare: countyRu(s.county),
    rural: true,
  };
}

function townHome(rng: Rng, region: RegionDef, t: Town, lang?: SpeakerLang): HomeAddress {
  const big = t.population >= 30000;
  // District language mix is only modelled for Tallinn.
  const distRu = (d?: string) => (t.name === 'Tallinn' && d ? DISTRICT_RU[d] : undefined);
  const streets = region.streets.filter((s) => s.city === t.name && s.kind !== 'commercial');
  if (streets.length) {
    const s = rng.weighted(streets, (x) => {
      const rd = distRu(x.district);
      const distF =
        rd === undefined || t.ruShare <= 0 || t.ruShare >= 1
          ? 1
          : langFactor(rd, lang) / langFactor(t.ruShare, lang);
      return (x.weight ?? 1) * (x.kind === 'apartment' && big ? 1.6 : 1) * distF;
    });
    const num = houseNumber(rng, s);
    const coord = housePos(s, num, rng);
    const district = s.district ?? districtAt(coord);
    return {
      address: `${s.name} ${num}${apartmentSuffix(rng, s.kind, 'residential')}`,
      city: t.name,
      coord,
      district,
      county: t.county,
      zone: s.zone ?? t.zone ?? zoneFor(region, coord, t.county),
      ruShare: distRu(district) ?? t.ruShare,
      population: t.population,
    };
  }
  const coord = jitter(t.coord, big ? 1.5 : 0.6, rng.next(), rng.next());
  const flats = t.population >= 10000 ? 90 : 24;
  const flat = rng.chance(t.population >= 10000 ? 0.55 : 0.2) ? `-${rng.int(1, flats)}` : '';
  const district = districtAt(coord);
  return {
    address: `${genericStreet(rng, t.name)} ${rng.int(1, 60)}${flat}`,
    city: t.name,
    coord,
    district,
    county: t.county,
    zone: t.zone ?? zoneFor(region, coord, t.county),
    ruShare: distRu(district) ?? t.ruShare,
    population: t.population,
  };
}

const RURAL_SHARE: Record<SpeakerLang, number> = { et: 0.27, ru: 0.07, uk: 0.05, en: 0.1, fi: 0.1 };

/** A plausible home address for a resident (Russian speakers skew to towns with high ruShare). */
export function homeAddress(rng: Rng, region: RegionDef, lang?: SpeakerLang): HomeAddress {
  const c = regionCache(region);
  if (!c.towns.length || rng.chance(lang ? RURAL_SHARE[lang] : 0.2)) {
    const r = ruralHome(rng, region, lang);
    if (r) return r;
  }
  if (!c.towns.length) {
    const loc = townLocation(rng, region, 'residential');
    return { address: loc.address, city: loc.city, coord: loc.coord, zone: loc.zone, ruShare: c.avgRuShare };
  }
  const t = rng.weighted(c.towns, (x) => x.population * langFactor(x.ruShare, lang));
  return townHome(rng, region, t, lang);
}
