/**
 * Data-integrity and geography checks for the Lõuna and Lääne prefecture definitions.
 * Geography is checked against the bundled geoBoundaries county polygons and settlements list,
 * so a misplaced marker (wrong county, wrong island, missing zone) fails the build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REGION_LOUNA } from '@/data/regions/louna';
import { REGION_LAANE } from '@/data/regions/laane';
import type { LngLat, PlaceKind, RegionDef, UnitSpec } from '@/sim/types';

type Ring = [number, number][];
interface CountyFeature {
  properties: { name: string };
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

const geoPath = (f: string) => fileURLToPath(new URL(`../src/data/geo/${f}`, import.meta.url));
const COUNTIES = (JSON.parse(readFileSync(geoPath('counties.json'), 'utf8')) as { features: CountyFeature[] })
  .features;
const SETTLEMENTS = JSON.parse(readFileSync(geoPath('settlements.json'), 'utf8')) as [
  string,
  string,
  string,
  number,
  number,
][];

/** Estonia incl. islands and Lake Peipus. */
const ESTONIA: [LngLat, LngLat] = [
  [21.5, 57.4],
  [28.3, 59.9],
];

function inRing([x, y]: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countyOf(p: LngLat): string | undefined {
  for (const f of COUNTIES) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      if (inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole))) return f.properties.name;
    }
  }
  return undefined;
}

function inBox([x, y]: LngLat, [[w, s], [e, n]]: [LngLat, LngLat]): boolean {
  return x >= w && x <= e && y >= s && y <= n;
}

/** Small islands that are not a county of their own (boxes around the whole island). */
const ISLAND_BOXES: Record<string, [LngLat, LngLat]> = {
  piirissaar: [
    [27.46, 58.34],
    [27.57, 58.41],
  ],
  vormsi: [
    [23.08, 58.95],
    [23.47, 59.06],
  ],
  kihnu: [
    [23.9, 58.07],
    [24.07, 58.18],
  ],
  ruhnu: [
    [23.18, 57.76],
    [23.33, 57.84],
  ],
};

/** Zone a coordinate must carry, derived from geography. */
function expectedZone(p: LngLat): string {
  for (const [zone, box] of Object.entries(ISLAND_BOXES)) if (inBox(p, box)) return zone;
  const c = countyOf(p);
  if (c === 'Saare maakond') return 'saaremaa';
  if (c === 'Hiiu maakond') return 'hiiumaa';
  return 'mainland';
}

interface Pt {
  what: string;
  coord: LngLat;
  zone?: string;
  kind?: string;
}

function allPoints(r: RegionDef): Pt[] {
  return [
    ...r.stations.map((s) => ({ what: `station ${s.id}`, coord: s.coord, zone: s.zone, kind: s.kind })),
    ...r.places.map((p) => ({ what: `place ${p.id}`, coord: p.coord, zone: p.zone, kind: p.kind })),
    ...r.streets.flatMap((s) =>
      s.points.map((c, i) => ({ what: `street ${s.id}#${i}`, coord: c, zone: s.zone, kind: 'street' })),
    ),
    ...r.towns.map((t) => ({ what: `town ${t.name}`, coord: t.coord, zone: t.zone, kind: 'town' })),
  ];
}

const REQUIRED_KINDS: PlaceKind[] = [
  'bar',
  'mall',
  'shop',
  'bank',
  'school',
  'hospital',
  'park',
  'beach',
  'highway',
  'forest',
  'port',
  'lake',
];

function patrolsPerShift(roster: UnitSpec[], shift: 'day' | 'night'): number {
  return roster.filter(
    (u) =>
      u.type === 'patrol' && !u.minDifficulty && (u.shift ?? 'both') !== (shift === 'day' ? 'night' : 'day'),
  ).length;
}

const CASES: [string, RegionDef][] = [
  ['louna', REGION_LOUNA],
  ['laane', REGION_LAANE],
];

describe.each(CASES)('region %s', (id, r) => {
  it('has identity, counties from settlements.json and sane map settings', () => {
    expect(r.id).toBe(id);
    expect(r.counties).toHaveLength(6);
    const known = new Set(SETTLEMENTS.map((row) => row[2]));
    for (const c of r.counties) expect(known.has(c), c).toBe(true);
    expect(inBox(r.center, r.bounds)).toBe(true);
    expect(r.zoom).toBeGreaterThan(7);
    expect(r.zoom).toBeLessThan(11);
    expect(r.callVolume).toBeGreaterThan(2);
    expect(r.description.et.length).toBeGreaterThan(80);
    expect(r.description.en.length).toBeGreaterThan(80);
    expect(r.commander?.title.et).toMatch(/^Prefekt/);
  });

  it('keeps every coordinate inside region bounds and Estonia', () => {
    for (const p of allPoints(r)) {
      expect(inBox(p.coord, ESTONIA), p.what).toBe(true);
      expect(inBox(p.coord, r.bounds), p.what).toBe(true);
    }
  });

  it('puts every point (except open water) inside one of its own counties', () => {
    const own = new Set(r.counties);
    for (const p of allPoints(r)) {
      if (p.kind === 'lake') continue;
      expect(own.has(countyOf(p.coord) ?? '(none)'), `${p.what} → ${countyOf(p.coord)}`).toBe(true);
    }
  });

  it('places towns in their declared county and covers every linn of settlements.json', () => {
    for (const t of r.towns) {
      expect(countyOf(t.coord), t.name).toBe(t.county);
      expect(t.population, t.name).toBeGreaterThan(0);
      expect(t.ruShare, t.name).toBeGreaterThanOrEqual(0);
      expect(t.ruShare, t.name).toBeLessThanOrEqual(1);
    }
    const names = new Set(r.towns.map((t) => t.name));
    expect(names.size).toBe(r.towns.length);
    const linnad = SETTLEMENTS.filter((row) => row[1] === 'linn' && r.counties.includes(row[2]));
    expect(linnad.length).toBeGreaterThan(5);
    for (const row of linnad) expect(names.has(row[0]), `missing town ${row[0]}`).toBe(true);
    expect(names.has(r.hqCity)).toBe(true);
  });

  it('has unique ids and callsigns', () => {
    for (const list of [
      r.stations.map((s) => s.id),
      r.places.map((p) => p.id),
      r.streets.map((s) => s.id),
      r.roster.map((u) => u.callsign),
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('references existing stations, zones and an arrest house', () => {
    const stations = new Map(r.stations.map((s) => [s.id, s]));
    const arrest = stations.get(r.arrestHouseId);
    expect(arrest?.kind).toBe('arrest');
    expect(r.stations.filter((s) => s.kind === 'hq')).toHaveLength(1);
    const zones = new Set(r.zones.map((z) => z.id));
    expect(zones.has('mainland')).toBe(true);
    for (const u of r.roster) {
      const st = stations.get(u.stationId);
      expect(st, `${u.callsign} → ${u.stationId}`).toBeDefined();
      expect(u.zone ?? 'mainland', u.callsign).toBe(st?.zone ?? 'mainland');
      expect(u.crew, u.callsign).toBeGreaterThan(0);
      expect(u.callsign.startsWith(r.short + ' '), u.callsign).toBe(true);
      expect(u.type === 'heli' || u.type === 'special', `${u.callsign}: no heli/K-komando in ${id}`).toBe(
        false,
      );
    }
    for (const p of allPoints(r)) if (p.zone) expect(zones.has(p.zone), p.what).toBe(true);
  });

  it('gives every island point the right zone (and mainland points none)', () => {
    for (const p of allPoints(r)) {
      expect(p.zone ?? 'mainland', p.what).toBe(expectedZone(p.coord));
    }
  });

  it('has valid streets', () => {
    expect(r.streets.length).toBeGreaterThan(60);
    for (const s of r.streets) {
      expect(s.points.length, s.id).toBeGreaterThanOrEqual(2);
      const [lo, hi] = s.houses;
      expect(Number.isInteger(lo) && Number.isInteger(hi), s.id).toBe(true);
      expect(lo, s.id).toBeGreaterThanOrEqual(1);
      expect(hi, s.id).toBeGreaterThan(lo);
      expect(s.name, s.id).toMatch(/ (tn|mnt|pst|tee|allee|plats|väljak)$|Ringtee/);
      expect(
        r.towns.some((t) => t.name === s.city),
        `${s.id} city ${s.city}`,
      ).toBe(true);
    }
  });

  it('covers the required place kinds with real POIs', () => {
    expect(r.places.length).toBeGreaterThanOrEqual(90);
    const kinds = new Set(r.places.map((p) => p.kind));
    for (const k of REQUIRED_KINDS) expect(kinds.has(k), k).toBe(true);
    expect(kinds.has('trainstation') || kinds.has('busstation')).toBe(true);
    for (const p of r.places) {
      expect(p.name.length, p.id).toBeGreaterThan(2);
      expect(p.address.length, p.id).toBeGreaterThan(2);
    }
  });

  it('staffs a realistic normal-difficulty roster with day/night split', () => {
    const day = patrolsPerShift(r.roster, 'day');
    const night = patrolsPerShift(r.roster, 'night');
    expect(day).toBeGreaterThanOrEqual(7);
    expect(day).toBeLessThanOrEqual(10);
    expect(night).toBeGreaterThanOrEqual(day);
    for (const type of ['rapid', 'k9', 'traffic', 'criminal', 'boat', 'transport'] as const) {
      expect(
        r.roster.some((u) => u.type === type && !u.minDifficulty),
        type,
      ).toBe(true);
    }
    expect(r.roster.some((u) => u.minDifficulty === 'veteran')).toBe(true);
    expect(r.roster.some((u) => u.minDifficulty === 'realistic')).toBe(true);
  });
});

describe('Lõuna specifics', () => {
  const r = REGION_LOUNA;
  const tartu = r.streets.filter((s) => s.city === 'Tartu');
  it('has a detailed Tartu and county towns', () => {
    expect(tartu.length).toBeGreaterThanOrEqual(45);
    const count = (city: string) => r.streets.filter((s) => s.city === city).length;
    expect(count('Viljandi')).toBeGreaterThanOrEqual(10);
    expect(count('Võru')).toBeGreaterThanOrEqual(8);
    expect(count('Valga')).toBeGreaterThanOrEqual(8);
    expect(count('Põlva')).toBeGreaterThanOrEqual(6);
    expect(count('Jõgeva')).toBeGreaterThanOrEqual(5);
  });
  it('has the border, Peipsi and Piirissaar set up', () => {
    expect(r.stations.filter((s) => s.kind === 'border').map((s) => s.id)).toEqual(
      expect.arrayContaining(['lo-koidula', 'lo-luhamaa']),
    );
    expect(r.roster.filter((u) => u.type === 'border' && !u.minDifficulty)).toHaveLength(2);
    expect(r.zones.find((z) => z.id === 'piirissaar')?.ferryMinutes).toBeGreaterThan(0);
    expect(r.places.some((p) => p.zone === 'piirissaar' && p.kind === 'port')).toBe(true);
    const ids = new Set(r.places.map((p) => p.id));
    for (const id of [
      'lo-raekoja-plats',
      'lo-lounakeskus',
      'lo-kliinikum',
      'lo-erm',
      'lo-koidula-pp',
      'lo-luhamaa-pp',
      'lo-tehvandi',
      'lo-suur-munamagi',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
  it('keeps Old Believer settlements Russian-speaking and Valga mixed', () => {
    const ru = (n: string) => r.towns.find((t) => t.name === n)?.ruShare ?? -1;
    expect(ru('Kallaste')).toBeGreaterThan(0.4);
    expect(ru('Mustvee')).toBeGreaterThan(0.3);
    expect(ru('Valga')).toBeGreaterThan(0.25);
    expect(ru('Viljandi')).toBeLessThan(0.1);
  });
});

describe('Lääne specifics', () => {
  const r = REGION_LAANE;
  it('has detailed Pärnu and county towns', () => {
    const count = (city: string) => r.streets.filter((s) => s.city === city).length;
    expect(count('Pärnu')).toBeGreaterThanOrEqual(35);
    expect(count('Kuressaare')).toBeGreaterThanOrEqual(12);
    expect(count('Haapsalu')).toBeGreaterThanOrEqual(10);
    expect(count('Paide')).toBeGreaterThanOrEqual(8);
    expect(count('Rapla')).toBeGreaterThanOrEqual(8);
  });
  it('defines island zones with ferries and staffs the islands', () => {
    const z = new Map(r.zones.map((x) => [x.id, x.ferryMinutes]));
    expect(z.get('saaremaa')).toBeGreaterThan(30);
    expect(z.get('hiiumaa')).toBeGreaterThan(z.get('saaremaa') ?? 0);
    expect(z.get('vormsi')).toBeGreaterThan(0);
    expect(z.get('kihnu')).toBeGreaterThan(0);
    expect(z.get('ruhnu')).toBeNull();
    const normal = r.roster.filter((u) => u.type === 'patrol' && !u.minDifficulty);
    expect(normal.filter((u) => u.zone === 'saaremaa')).toHaveLength(2);
    expect(normal.filter((u) => u.zone === 'hiiumaa')).toHaveLength(1);
    for (const zone of ['saaremaa', 'hiiumaa', 'vormsi', 'kihnu', 'ruhnu']) {
      expect(
        r.places.some((p) => p.zone === zone),
        zone,
      ).toBe(true);
    }
  });
  it('has the ferry ports on both sides', () => {
    const ports = new Map(r.places.filter((p) => p.kind === 'port').map((p) => [p.id, p.zone ?? 'mainland']));
    expect(ports.get('la-virtsu')).toBe('mainland');
    expect(ports.get('la-kuivastu')).toBe('saaremaa');
    expect(ports.get('la-rohukula')).toBe('mainland');
    expect(ports.get('la-heltermaa')).toBe('hiiumaa');
    expect(ports.get('la-munalaiu')).toBe('mainland');
    expect(ports.get('la-kihnu-sadam')).toBe('kihnu');
  });
});
