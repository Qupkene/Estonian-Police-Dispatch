/**
 * Sector geometry and membership (docs/SECTORS.md). Pure functions over the region data and SECTORS; the
 * spawner, the roster and the map use them. A prefecture without sector data behaves as one whole area.
 *
 * Everything derived from a region (membership index, populations, anchor points) is computed once per
 * RegionDef and cached; the functions themselves never mutate their input.
 */
import settlementsJson from '@/data/geo/settlements.json';
import { COUNTY_POPULATION, SECTORS, TOWN_DISTRICTS } from '@/data/sectors';
import { countyAt, districtAt, zoneFor } from '@/gen/address';
import { haversineKm } from './geo';
import type { IncidentLocation, LngLat, RegionDef, RegionId, SectorDef, SimState, Station, Town } from './types';

type Loc = Pick<IncidentLocation, 'coord' | 'city' | 'district'>;

/** Sectors of a prefecture in data order. */
export function sectorsOf(regionId: RegionId): SectorDef[] {
  return SECTORS.filter((x) => x.regionId === regionId);
}

export function sectorById(id: string): SectorDef | undefined {
  return SECTORS.find((x) => x.id === id);
}

/** Sectors a new career can start in. */
export function starterSectors(regionId: RegionId): SectorDef[] {
  return sectorsOf(regionId).filter((x) => !!x.starter);
}

/**
 * The sectors of `ids` that belong to the prefecture, without duplicates, in data order. Empty when the list
 * names none of them or every one of them: both mean the whole prefecture (docs/SECTORS.md, Shifts).
 */
export function normalizeArea(regionId: RegionId, ids: readonly string[] | undefined): string[] {
  if (!ids?.length) return [];
  const all = sectorsOf(regionId);
  const own = all.filter((x) => ids.includes(x.id)).map((x) => x.id);
  return own.length === all.length ? [] : own;
}

// ─────────────────────────────────────────────────────────────────────────────
// Membership
// ─────────────────────────────────────────────────────────────────────────────

/** A city address off the district polygons (the shore, a jittered town point) takes the district of a street or place this near. */
const DISTRICT_SNAP_KM = 1.5;

/** How far from a town's centre a location still counts as the town (generated rural spots and highways name the nearest town). */
export function townRadiusKm(t: Pick<Town, 'population'>): number {
  return 3 + 2 * Math.sqrt(Math.max(0, t.population) / 10_000);
}

interface Index {
  sectors: SectorDef[];
  byDistrict: Map<string, string>;
  byTown: Map<string, string>;
  byCounty: Map<string, string[]>;
  towns: Map<string, Town>;
  /** Towns named by sectors that share a county with another sector: the nearest one decides a village. */
  listed: { coord: LngLat; county: string; id: string }[];
  /** Towns split into district sectors (Tallinn), and their streets and places with a district. */
  splitTowns: Set<string>;
  districtPts: { coord: LngLat; district: string }[];
  main: Map<string, LngLat>;
}

const indexCache = new WeakMap<RegionDef, Index>();

function indexOf(region: RegionDef): Index {
  let ix = indexCache.get(region);
  if (ix) return ix;
  const sectors = sectorsOf(region.id);
  const byDistrict = new Map<string, string>();
  const byTown = new Map<string, string>();
  const byCounty = new Map<string, string[]>();
  const towns = new Map(region.towns.map((t) => [t.name, t] as const));
  const listed: Index['listed'] = [];
  const main = new Map<string, LngLat>();
  for (const sec of sectors) {
    for (const d of sec.match.districts ?? []) byDistrict.set(d, sec.id);
    for (const t of sec.match.towns ?? []) byTown.set(t, sec.id);
    for (const c of sec.match.counties ?? []) byCounty.set(c, [...(byCounty.get(c) ?? []), sec.id]);
    const st = region.stations.find((x) => x.id === sec.stationIds[0]);
    main.set(sec.id, st?.coord ?? region.center);
  }
  for (const sec of sectors) {
    for (const name of sec.match.towns ?? []) {
      const t = towns.get(name);
      if (t && (byCounty.get(t.county)?.length ?? 0) > 1) listed.push({ coord: t.coord, county: t.county, id: sec.id });
    }
  }
  const splitTowns = new Set<string>();
  for (const [town, districts] of Object.entries(TOWN_DISTRICTS)) {
    if (towns.has(town) && Object.keys(districts).some((d) => byDistrict.has(d))) splitTowns.add(town);
  }
  const districtPts: Index['districtPts'] = [];
  for (const st of region.streets) {
    if (st.district && splitTowns.has(st.city) && byDistrict.has(st.district)) for (const p of st.points) districtPts.push({ coord: p, district: st.district });
  }
  for (const pl of region.places) {
    if (pl.district && splitTowns.has(pl.city) && byDistrict.has(pl.district)) districtPts.push({ coord: pl.coord, district: pl.district });
  }
  ix = { sectors, byDistrict, byTown, byCounty, towns, listed, splitTowns, districtPts, main };
  indexCache.set(region, ix);
  return ix;
}

function districtSector(ix: Index, loc: Loc): string | undefined {
  // Other towns have districts of the same name (Tartu and Pärnu have a Kesklinn too).
  const own = loc.district && (!loc.city || ix.splitTowns.has(loc.city)) ? ix.byDistrict.get(loc.district) : undefined;
  if (own) return own;
  const poly = districtAt(loc.coord);
  if (poly && ix.byDistrict.has(poly)) return ix.byDistrict.get(poly);
  if (!ix.splitTowns.has(loc.city)) return undefined;
  let best: string | undefined;
  let bd = DISTRICT_SNAP_KM;
  for (const p of ix.districtPts) {
    const d = haversineKm(p.coord, loc.coord);
    if (d < bd) {
      bd = d;
      best = p.district;
    }
  }
  return best ? ix.byDistrict.get(best) : undefined;
}

function nearestTown(region: RegionDef, p: LngLat): Town | undefined {
  let best: Town | undefined;
  let bd = Infinity;
  for (const t of region.towns) {
    const d = haversineKm(t.coord, p);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** County of a location: a county named as its district (rural spots), its town's, the map's, the nearest town's. */
function countyOf(region: RegionDef, loc: Loc, town: Town | undefined, inTown: boolean): string | undefined {
  if (loc.district && region.counties.includes(loc.district)) return loc.district;
  if (town && inTown) return town.county;
  const c = countyAt(loc.coord);
  if (c && region.counties.includes(c)) return c;
  return town?.county ?? nearestTown(region, loc.coord)?.county;
}

function nearestOf(ix: Index, ids: string[], p: LngLat): string {
  let best = ids[0];
  let bd = Infinity;
  for (const id of ids) {
    const d = haversineKm(ix.main.get(id)!, p);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/**
 * Sector id a location belongs to ('' when the prefecture has no sector data). Most specific first: a
 * district of a city split into sectors (Tallinn), then the town (its own name while it lies within the
 * town), then the county. Sectors sharing a county split it by the nearest town they name, then by the
 * nearest main station; a location nothing matches goes to the sector with the nearest main station.
 */
export function sectorOf(region: RegionDef, loc: Loc): string {
  const ix = indexOf(region);
  if (!ix.sectors.length) return '';
  if (ix.byDistrict.size) {
    const d = districtSector(ix, loc);
    if (d) return d;
  }
  const town = ix.towns.get(loc.city);
  const inTown = !town || haversineKm(town.coord, loc.coord) <= townRadiusKm(town);
  const own = ix.byTown.get(loc.city);
  if (own && inTown) return own;
  const county = countyOf(region, loc, town, inTown);
  const cands = county ? (ix.byCounty.get(county) ?? []) : [];
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    let best: string | undefined;
    let bd = Infinity;
    for (const t of ix.listed) {
      if (t.county !== county || !cands.includes(t.id)) continue;
      const d = haversineKm(t.coord, loc.coord);
      if (d < bd) {
        bd = d;
        best = t.id;
      }
    }
    return best ?? nearestOf(ix, cands, loc.coord);
  }
  return nearestOf(
    ix,
    ix.sectors.map((x) => x.id),
    loc.coord,
  );
}

/** Sector of a bare map point (a pursuit, a map click): the town whose built-up area holds it, else the countryside. */
export function sectorAt(region: RegionDef, coord: LngLat): string {
  let city = '';
  let bd = Infinity;
  for (const t of region.towns) {
    const d = haversineKm(t.coord, coord);
    if (d <= townRadiusKm(t) && d < bd) {
      bd = d;
      city = t.name;
    }
  }
  return sectorOf(region, { coord, city });
}

/**
 * Sectors a shift covers, its night cover included; empty means the whole prefecture. With the shift's
 * `regionId`, only sectors of that prefecture this version knows count: a save naming another version's sector
 * (a rollback) or another prefecture's plays as the whole prefecture, never on an empty area.
 */
export function areaOf(s: Pick<SimState, 'sectors' | 'coverSectors'> & Partial<Pick<SimState, 'regionId'>>): string[] {
  const ids = [...(s.sectors ?? []), ...(s.coverSectors ?? [])];
  return s.regionId === undefined ? ids : ids.filter((id) => sectorById(id)?.regionId === s.regionId);
}

/** True when the location lies in the shift's area (always for a whole-prefecture shift). */
export function inArea(s: SimState, region: RegionDef, loc: Loc): boolean {
  const area = areaOf(s).filter((id) => sectorById(id)?.regionId === region.id);
  return !area.length || area.includes(sectorOf(region, loc));
}

// ─────────────────────────────────────────────────────────────────────────────
// Population
// ─────────────────────────────────────────────────────────────────────────────

const popCache = new WeakMap<RegionDef, Map<string, number>>();

/**
 * Residents per sector: each town goes to its sector (a split town by its districts, TOWN_DISTRICTS), and the
 * rest of each county (COUNTY_POPULATION minus its towns) to the sectors matching the county, in proportion
 * to their towns there.
 */
function populations(region: RegionDef): Map<string, number> {
  let pop = popCache.get(region);
  if (pop) return pop;
  pop = new Map<string, number>();
  const ix = indexOf(region);
  const add = (id: string, n: number) => pop!.set(id, (pop!.get(id) ?? 0) + n);
  const inCounty = new Map<string, number>();
  const bySectorCounty = new Map<string, number>();
  for (const t of region.towns) {
    inCounty.set(t.county, (inCounty.get(t.county) ?? 0) + t.population);
    const districts = ix.splitTowns.has(t.name) ? TOWN_DISTRICTS[t.name] : undefined;
    if (districts) {
      const total = Object.values(districts).reduce((a, b) => a + b, 0);
      for (const [d, n] of Object.entries(districts)) add(ix.byDistrict.get(d) ?? sectorOf(region, { coord: t.coord, city: t.name }), (n / total) * t.population);
      continue;
    }
    const id = sectorOf(region, { coord: t.coord, city: t.name });
    add(id, t.population);
    bySectorCounty.set(`${id}|${t.county}`, (bySectorCounty.get(`${id}|${t.county}`) ?? 0) + t.population);
  }
  for (const county of region.counties) {
    const rest = (COUNTY_POPULATION[county] ?? 0) - (inCounty.get(county) ?? 0);
    if (rest <= 0) continue;
    const cands = ix.byCounty.get(county) ?? [];
    if (!cands.length) {
      const big = [...region.towns].filter((t) => t.county === county).sort((a, b) => b.population - a.population)[0];
      if (big) add(sectorOf(region, { coord: big.coord, city: big.name }), rest);
      continue;
    }
    const w = cands.map((id) => bySectorCounty.get(`${id}|${county}`) ?? 0);
    const sum = w.reduce((a, b) => a + b, 0);
    cands.forEach((id, i) => add(id, sum > 0 ? (rest * w[i]) / sum : rest / cands.length));
  }
  for (const sec of ix.sectors) if (!pop.has(sec.id)) pop.set(sec.id, 0);
  popCache.set(region, pop);
  return pop;
}

/** Residents of a sector (towns plus its share of the county's villages), rounded to the hundred. */
export function sectorPopulation(region: RegionDef, id: string): number {
  return Math.round((populations(region).get(id) ?? 0) / 100) * 100;
}

/** Share of the prefecture's population that lives in the sectors, 0..1 (1 for an empty list). */
export function areaShare(region: RegionDef, ids: string[]): number {
  const pop = populations(region);
  const own = [...new Set(ids)].filter((id) => pop.has(id));
  if (!ids.length || !own.length) return 1;
  let total = 0;
  for (const n of pop.values()) total += n;
  const mine = own.reduce((a, id) => a + (pop.get(id) ?? 0), 0);
  return total > 0 ? Math.min(1, mine / total) : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stations
// ─────────────────────────────────────────────────────────────────────────────

const ROSTER_KINDS = new Set<Station['kind']>(['station', 'hq', 'post']);

/** A sector's main station (the first of its stationIds; always staffed). */
export function mainStation(region: RegionDef, id: string): Station | undefined {
  const sec = sectorById(id);
  return sec ? region.stations.find((x) => x.id === sec.stationIds[0]) : undefined;
}

/** Stations whose crews serve the sectors: their main stations, then the opened posts among them. */
export function areaStations(region: RegionDef, ids: string[], openPosts: string[] = []): Station[] {
  const secs = ids.map(sectorById).filter((x): x is SectorDef => !!x && x.regionId === region.id);
  if (!secs.length) return region.stations.filter((x) => ROSTER_KINDS.has(x.kind));
  const want: string[] = [];
  for (const sec of secs) if (!want.includes(sec.stationIds[0])) want.push(sec.stationIds[0]);
  for (const sec of secs) for (const p of sec.posts ?? []) if (openPosts.includes(p.stationId) && !want.includes(p.stationId)) want.push(p.stationId);
  return want.map((id) => region.stations.find((x) => x.id === id)).filter((x): x is Station => !!x);
}

/** Every station of the sectors (main stations, posts, border points, harbours), for the regular roster of the area. */
export function sectorStationIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) for (const st of sectorById(id)?.stationIds ?? []) if (!out.includes(st)) out.push(st);
  return out;
}

/**
 * How much of a station's regular crews work for the sectors, 0..1: a station named by several sectors (one
 * main station for Lasnamäe and Ida-Harju) is shared by the sectors' population.
 */
export function stationShare(region: RegionDef, ids: string[], stationId: string): number {
  const pop = populations(region);
  let mine = 0;
  let all = 0;
  for (const sec of indexOf(region).sectors) {
    if (!sec.stationIds.includes(stationId)) continue;
    const n = Math.max(1, pop.get(sec.id) ?? 0);
    all += n;
    if (ids.includes(sec.id)) mine += n;
  }
  return all > 0 ? mine / all : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

interface Anchor {
  coord: LngLat;
  zone: string;
}

interface Geo {
  /** Points that make up each sector: towns, streets, places, stations and villages. */
  anchors: Map<string, Anchor[]>;
  /** Addressable points of each sector (towns, streets, places) for locations near a border. */
  spots: Map<string, LngLat[]>;
}

const geoCache = new WeakMap<RegionDef, Geo>();

type SettlementRow = [string, string, string, number, number];
let settlements: { name: string; county: string; coord: LngLat }[] | undefined;

function allSettlements(): { name: string; county: string; coord: LngLat }[] {
  settlements ??= (settlementsJson as unknown as SettlementRow[])
    .filter((r) => r[2] !== '')
    .map((r) => ({ name: r[0].split(' / ')[0].replace(/ küla$/, '').trim(), county: r[2], coord: [r[3], r[4]] as LngLat }));
  return settlements;
}

function geoOf(region: RegionDef): Geo {
  let geo = geoCache.get(region);
  if (geo) return geo;
  const anchors = new Map<string, Anchor[]>();
  const spots = new Map<string, LngLat[]>();
  const put = (id: string, coord: LngLat, zone: string | undefined, spot: boolean) => {
    if (!id) return;
    if (!anchors.has(id)) anchors.set(id, []);
    anchors.get(id)!.push({ coord, zone: zone ?? zoneFor(region, coord) });
    if (spot) {
      if (!spots.has(id)) spots.set(id, []);
      spots.get(id)!.push(coord);
    }
  };
  for (const t of region.towns) put(sectorOf(region, { coord: t.coord, city: t.name }), t.coord, t.zone ?? zoneFor(region, t.coord, t.county), true);
  for (const st of region.streets) {
    if (!st.points.length) continue;
    const mid = st.points[Math.floor(st.points.length / 2)];
    const id = sectorOf(region, { coord: mid, city: st.city, district: st.district });
    for (const p of st.points) put(id, p, st.zone, false);
    put(id, mid, st.zone, true);
  }
  for (const pl of region.places) put(sectorOf(region, pl), pl.coord, pl.zone, true);
  for (const st of region.stations) put(sectorOf(region, { coord: st.coord, city: st.city }), st.coord, st.zone, false);
  for (const s of allSettlements()) {
    if (!region.counties.includes(s.county)) continue;
    put(sectorOf(region, { coord: s.coord, city: s.name, district: s.county }), s.coord, zoneFor(region, s.coord, s.county), false);
  }
  geo = { anchors, spots };
  geoCache.set(region, geo);
  return geo;
}

/** Padding around a sector's points: a city sector hugs its streets, a county reaches past its last village. */
function padKm(id: string): number {
  return sectorById(id)?.match.counties?.length ? 2 : 0.8;
}

/** Bounding box [sw, ne] of the sectors (the prefecture's own bounds when empty), for the map camera. */
export function areaBounds(region: RegionDef, ids: string[]): [LngLat, LngLat] {
  const geo = geoOf(region);
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  let any = false;
  for (const id of ids) {
    const pad = padKm(id);
    for (const a of geo.anchors.get(id) ?? []) {
      const dx = pad / (111.32 * Math.cos((a.coord[1] * Math.PI) / 180));
      const dy = pad / 110.57;
      x0 = Math.min(x0, a.coord[0] - dx);
      x1 = Math.max(x1, a.coord[0] + dx);
      y0 = Math.min(y0, a.coord[1] - dy);
      y1 = Math.max(y1, a.coord[1] + dy);
      any = true;
    }
  }
  if (!any) return region.bounds;
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return [
    [r(x0), r(y0)],
    [r(x1), r(y1)],
  ];
}

type XY = [number, number];

function cross(o: XY, a: XY, b: XY): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Convex hull (Andrew's monotone chain), counter-clockwise, without the closing point. */
function hull(pts: XY[]): XY[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower: XY[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: XY[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Convex hull of the points grown by `pad` km (a circle of 12 points around each hull corner), as a closed ring. */
function paddedHull(points: LngLat[], pad: number, lat0: number): LngLat[] {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.57;
  const core = hull(points.map((p) => [p[0] * kx, p[1] * ky] as XY));
  const grown: XY[] = [];
  for (const [x, y] of core) for (let k = 0; k < 12; k++) grown.push([x + pad * Math.cos((k * Math.PI) / 6), y + pad * Math.sin((k * Math.PI) / 6)]);
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  const ring = hull(grown).map(([x, y]) => [r(x / kx), r(y / ky)] as LngLat);
  if (ring.length) ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/**
 * Outline rings of the sectors for the map mask and labels: a padded convex hull of each sector's towns,
 * streets, places, stations and villages, one per movement zone (Saaremaa and Ruhnu, Pärnumaa and Kihnu get
 * one ring each). Rings are closed (the first point repeats at the end), [lon, lat], counter-clockwise.
 */
export function sectorOutlines(region: RegionDef, ids: string[]): { id: string; ring: LngLat[] }[] {
  const geo = geoOf(region);
  const out: { id: string; ring: LngLat[] }[] = [];
  for (const id of ids) {
    const byZone = new Map<string, LngLat[]>();
    for (const a of geo.anchors.get(id) ?? []) {
      if (!byZone.has(a.zone)) byZone.set(a.zone, []);
      byZone.get(a.zone)!.push(a.coord);
    }
    for (const pts of byZone.values()) {
      const ring = paddedHull(pts, padKm(id), region.center[1]);
      if (ring.length >= 4) out.push({ id, ring });
    }
  }
  return out;
}

/**
 * Points of sector `to` nearest to the area `from` (towns, street middles, places), closest first: where a
 * call "just across the border" happens. Feed one to locationFromCoord (spawner) for a full address.
 */
export function borderPoints(region: RegionDef, from: string[], to: string, n = 8): LngLat[] {
  const geo = geoOf(region);
  const mine = from.flatMap((id) => geo.spots.get(id) ?? []);
  const theirs = geo.spots.get(to) ?? [];
  if (!mine.length || !theirs.length) return [];
  const scored = theirs.map((p) => {
    let d = Infinity;
    for (const q of mine) d = Math.min(d, haversineKm(p, q));
    return { p, d };
  });
  return scored
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(1, n))
    .map((x) => x.p);
}

/**
 * Points of sector `to` (towns, street middles, places) with their distance to the nearest of `refs` (the
 * player's crews and stations), nearest first: where a colleague's call for help is worth answering.
 */
export function spotsNear(region: RegionDef, to: string, refs: LngLat[], n = 8): { p: LngLat; km: number }[] {
  const theirs = geoOf(region).spots.get(to) ?? [];
  if (!refs.length || !theirs.length) return [];
  return theirs
    .map((p) => ({ p, km: Math.min(...refs.map((q) => haversineKm(p, q))) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, Math.max(1, n));
}

// ─────────────────────────────────────────────────────────────────────────────
// The area as a region of its own (address generator)
// ─────────────────────────────────────────────────────────────────────────────

const viewCache = new WeakMap<RegionDef, Map<string, RegionDef>>();

/**
 * Towns of the area. A town split between sectors (Tallinn) appears once per district of the area, at the
 * middle of the district's streets and places with the district's population, so a call "somewhere in town"
 * lands in the right district.
 */
export function areaTowns(region: RegionDef, ids: string[]): Town[] {
  const ix = indexOf(region);
  const out: Town[] = [];
  for (const t of region.towns) {
    const districts = ix.splitTowns.has(t.name) ? TOWN_DISTRICTS[t.name] : undefined;
    if (!districts) {
      if (ids.includes(sectorOf(region, { coord: t.coord, city: t.name }))) out.push(t);
      continue;
    }
    const total = Object.values(districts).reduce((a, b) => a + b, 0);
    for (const [d, n] of Object.entries(districts)) {
      const id = ix.byDistrict.get(d);
      const pts = ix.districtPts.filter((p) => p.district === d);
      if (!id || !ids.includes(id) || !pts.length) continue;
      const coord: LngLat = [pts.reduce((a, p) => a + p.coord[0], 0) / pts.length, pts.reduce((a, p) => a + p.coord[1], 0) / pts.length];
      out.push({ ...t, coord, population: Math.round((n / total) * t.population) });
    }
  }
  return out;
}

/**
 * The region narrowed to the area, for the address generator (gen/address pickLocation): the area's towns,
 * streets and places, the counties they lie in and the area's bounds. Calls it places can still fall outside
 * the area (a village of a county split in two), so the spawner checks every location with inArea. Cached.
 */
export function areaView(region: RegionDef, ids: string[]): RegionDef {
  const key = [...new Set(ids)].sort().join(',');
  let m = viewCache.get(region);
  if (!m) {
    m = new Map();
    viewCache.set(region, m);
  }
  let view = m.get(key);
  if (view) return view;
  const own = (loc: Loc) => ids.includes(sectorOf(region, loc));
  const towns = areaTowns(region, ids);
  const counties = new Set<string>(towns.map((t) => t.county));
  for (const id of ids) for (const c of sectorById(id)?.match.counties ?? []) counties.add(c);
  const bounds = areaBounds(region, ids);
  view = {
    ...region,
    counties: region.counties.filter((c) => counties.has(c)),
    bounds,
    center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2],
    towns,
    streets: region.streets.filter((st) => st.points.length > 0 && own({ coord: st.points[Math.floor(st.points.length / 2)], city: st.city, district: st.district })),
    places: region.places.filter((pl) => own(pl)),
  };
  m.set(key, view);
  return view;
}

/** Sectors next to the area that are not in it: the AI colleagues' desks. */
export function neighbourSectors(ids: string[]): SectorDef[] {
  const own = new Set(ids);
  const out = new Map<string, SectorDef>();
  for (const id of ids) for (const n of sectorById(id)?.neighbours ?? []) if (!own.has(n)) out.set(n, sectorById(n)!);
  return [...out.values()].filter(Boolean);
}
