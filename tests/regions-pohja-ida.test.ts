import { describe, expect, it } from 'vitest';
import type { LngLat, PlaceKind, RegionDef, UnitSpec, UnitType } from '@/sim/types';
import { REGION_POHJA } from '@/data/regions/pohja';
import { REGION_IDA } from '@/data/regions/ida';
import settlementsJson from '@/data/geo/settlements.json';
import districtsJson from '@/data/geo/tallinn_districts.json';
import countiesJson from '@/data/geo/counties.json';

// ── geometry helpers (point-in-polygon, ray casting) ─────────────────────────

type Ring = number[][];
interface GeoFeature {
  properties: { name: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}
interface GeoCollection {
  features: GeoFeature[];
}

const DISTRICTS = districtsJson as unknown as GeoCollection;
const COUNTIES = countiesJson as unknown as GeoCollection;
const SETTLEMENTS = settlementsJson as unknown as [string, string, string, number, number][];

function polygonsOf(f: GeoFeature): Ring[][] {
  return f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates as Ring[]]
    : (f.geometry.coordinates as Ring[][]);
}

function inRing(pt: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inFeature(pt: LngLat, f: GeoFeature): boolean {
  return polygonsOf(f).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((hole) => inRing(pt, hole)));
}

function featureByName(fc: GeoCollection, name: string): GeoFeature {
  const f = fc.features.find((x) => x.properties.name === name);
  if (!f) throw new Error(`feature ${name} missing`);
  return f;
}

/** Street/place district names → polygon names in tallinn_districts.json (genitive forms there). */
const DISTRICT_POLYGON: Record<string, string> = {
  Kesklinn: 'Kesklinna',
  'Põhja-Tallinn': 'Põhja-Tallinna',
  Lasnamäe: 'Lasnamäe',
  Mustamäe: 'Mustamäe',
  Haabersti: 'Haabersti',
  Kristiine: 'Kristiine',
  Nõmme: 'Nõmme',
  Pirita: 'Pirita',
  // Kohtla-Järve linnaosad
  Järve: 'Järve',
  Ahtme: 'Ahtme',
  Sompa: 'Sompa',
  Kukruse: 'Kukruse',
  Oru: 'Oru',
};
const TALLINN_DISTRICTS = [
  'Kesklinn',
  'Lasnamäe',
  'Mustamäe',
  'Põhja-Tallinn',
  'Haabersti',
  'Kristiine',
  'Nõmme',
  'Pirita',
];
const KJ_DISTRICTS = ['Järve', 'Ahtme', 'Sompa', 'Kukruse', 'Oru'];

/** Parent city of the settlements.json 'linnaosa' rows per county. */
const LINNAOSA_PARENT: Record<string, string> = {
  'Harju maakond': 'Tallinn',
  'Ida-Viru maakond': 'Kohtla-Järve',
};

const EE_BBOX = { minLon: 21.6, minLat: 57.45, maxLon: 28.25, maxLat: 59.85 };

interface LabeledPoint {
  label: string;
  pt: LngLat;
  city?: string;
  district?: string;
}

function allPoints(r: RegionDef): LabeledPoint[] {
  const out: LabeledPoint[] = [];
  for (const s of r.stations) out.push({ label: `station ${s.id}`, pt: s.coord, city: s.city });
  for (const t of r.towns) out.push({ label: `town ${t.name}`, pt: t.coord, city: t.name });
  for (const s of r.streets)
    s.points.forEach((pt, i) =>
      out.push({ label: `street ${s.id}#${i}`, pt, city: s.city, district: s.district }),
    );
  for (const p of r.places)
    out.push({ label: `place ${p.id}`, pt: p.coord, city: p.city, district: p.district });
  return out;
}

function decimals(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function districtOffenders(points: LabeledPoint[]): string[] {
  const offenders: string[] = [];
  for (const p of points) {
    if (!p.district) continue;
    const want = featureByName(DISTRICTS, DISTRICT_POLYGON[p.district]);
    if (!inFeature(p.pt, want)) {
      const got = DISTRICTS.features.find((f) => inFeature(p.pt, f));
      offenders.push(
        `${p.label} [${p.pt.join(', ')}] should be in ${p.district}, is in ${got ? got.properties.name : 'none'}`,
      );
    }
  }
  return offenders;
}

const isNormal = (u: UnitSpec) =>
  !u.minDifficulty || u.minDifficulty === 'cadet' || u.minDifficulty === 'normal';
const countNormal = (r: RegionDef, type: UnitType) =>
  r.roster.filter((u) => isNormal(u) && u.type === type).length;
const works = (u: UnitSpec, shift: 'day' | 'night') => !u.shift || u.shift === 'both' || u.shift === shift;

// ── generic checks for both regions ─────────────────────────────────────────

describe.each([REGION_POHJA, REGION_IDA])('region $id', (r) => {
  it('has complete metadata', () => {
    expect(r.name.et).toMatch(/prefektuur/);
    expect(r.name.en.length).toBeGreaterThan(3);
    expect(r.description.et.length).toBeGreaterThan(80);
    expect(r.description.en.length).toBeGreaterThan(80);
    expect(r.radioName.length).toBeGreaterThan(1);
    expect(r.commander?.name).toBeTruthy();
    expect(r.zones.map((z) => z.id)).toContain('mainland');
    const countyNames = COUNTIES.features.map((f) => f.properties.name);
    for (const c of r.counties) expect(countyNames).toContain(c);
    const [sw, ne] = r.bounds;
    expect(sw[0]).toBeLessThan(ne[0]);
    expect(sw[1]).toBeLessThan(ne[1]);
    expect(r.center[0]).toBeGreaterThan(sw[0]);
    expect(r.center[0]).toBeLessThan(ne[0]);
    expect(r.center[1]).toBeGreaterThan(sw[1]);
    expect(r.center[1]).toBeLessThan(ne[1]);
  });

  it('has unique ids and callsigns', () => {
    const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
    expect(dup(r.stations.map((s) => s.id))).toEqual([]);
    expect(dup(r.streets.map((s) => s.id))).toEqual([]);
    expect(dup(r.places.map((p) => p.id))).toEqual([]);
    expect(dup(r.roster.map((u) => u.callsign))).toEqual([]);
    expect(dup(r.towns.map((t) => t.name))).toEqual([]);
  });

  it('references existing stations (arrest house, roster)', () => {
    const ids = new Set(r.stations.map((s) => s.id));
    const arrest = r.stations.find((s) => s.id === r.arrestHouseId);
    expect(arrest, `arrestHouseId ${r.arrestHouseId}`).toBeDefined();
    expect(arrest?.kind).toBe('arrest');
    expect(r.stations.filter((s) => s.kind === 'hq')).toHaveLength(1);
    for (const u of r.roster) expect(ids.has(u.stationId), `${u.callsign} → ${u.stationId}`).toBe(true);
    for (const u of r.roster) expect(u.crew).toBeGreaterThan(0);
  });

  it('has valid coordinates inside Estonia and the region bounds (≤ 5 decimals)', () => {
    const [sw, ne] = r.bounds;
    const bad: string[] = [];
    for (const p of [...allPoints(r), { label: 'center', pt: r.center }]) {
      const [lon, lat] = p.pt;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) bad.push(`${p.label}: not finite`);
      else if (lon < EE_BBOX.minLon || lon > EE_BBOX.maxLon || lat < EE_BBOX.minLat || lat > EE_BBOX.maxLat)
        bad.push(`${p.label}: outside Estonia`);
      else if (lon < sw[0] || lon > ne[0] || lat < sw[1] || lat > ne[1])
        bad.push(`${p.label}: outside region bounds`);
      else if (decimals(lon) > 5 || decimals(lat) > 5) bad.push(`${p.label}: more than 5 decimals`);
    }
    expect(bad).toEqual([]);
  });

  it("places all points inside the region's counties (≤ 2 % tolerance for coastline)", () => {
    const counties = r.counties.map((c) => featureByName(COUNTIES, c));
    const pts = allPoints(r);
    const offenders = pts
      .filter((p) => !counties.some((c) => inFeature(p.pt, c)))
      .map((p) => `${p.label} [${p.pt.join(', ')}]`);
    expect(
      offenders.length,
      `outside ${r.counties.join(' / ')}:\n${offenders.join('\n')}`,
    ).toBeLessThanOrEqual(Math.floor(pts.length * 0.02));
  });

  it('has well-formed streets', () => {
    expect(r.streets.length).toBeGreaterThan(0);
    for (const s of r.streets) {
      expect(s.points.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.name.trim().length, s.id).toBeGreaterThan(1);
      expect(s.city.trim().length, s.id).toBeGreaterThan(1);
      const [a, b] = s.houses;
      expect(Number.isInteger(a) && Number.isInteger(b), `${s.id} houses integers`).toBe(true);
      expect(a, s.id).toBeGreaterThanOrEqual(1);
      expect(b, s.id).toBeGreaterThanOrEqual(a);
      expect(['apartment', 'house', 'mixed', 'commercial']).toContain(s.kind);
      expect(s.weight ?? 1, s.id).toBeGreaterThan(0);
      if (s.district) expect(Object.keys(DISTRICT_POLYGON), s.id).toContain(s.district);
      // consecutive points are distinct and closer than ~4 km (a street, not a jump across town)
      for (let i = 1; i < s.points.length; i++) {
        const [x0, y0] = s.points[i - 1];
        const [x1, y1] = s.points[i];
        const km = Math.hypot((x1 - x0) * 56.6, (y1 - y0) * 111.2);
        expect(km, `${s.id} segment ${i}`).toBeGreaterThan(0.02);
        expect(km, `${s.id} segment ${i}`).toBeLessThan(4);
      }
    }
  });

  it('covers the required place kinds', () => {
    const kinds = new Set<PlaceKind>(r.places.map((p) => p.kind));
    const required: PlaceKind[] = [
      'bar',
      'mall',
      'shop',
      'bank',
      'school',
      'hospital',
      'park',
      'highway',
      'forest',
      'port',
    ];
    for (const k of required) expect(kinds.has(k), `missing place kind ${k}`).toBe(true);
    expect(kinds.has('trainstation') || kinds.has('busstation')).toBe(true);
    // residential addresses come from apartment-block streets
    expect(r.streets.some((s) => s.kind === 'apartment')).toBe(true);
    expect(r.streets.some((s) => s.kind === 'house')).toBe(true);
    for (const p of r.places) {
      expect(p.name.trim().length, p.id).toBeGreaterThan(1);
      expect(p.address.trim().length, p.id).toBeGreaterThan(1);
    }
  });

  it("has towns for every 'linn' of its counties (linnaosa rows → parent city)", () => {
    const names = new Set(r.towns.map((t) => t.name));
    const missing: string[] = [];
    for (const [name, type, county] of SETTLEMENTS) {
      if (!r.counties.includes(county)) continue;
      if (type === 'linn' && !names.has(name)) missing.push(name);
      if (type === 'linnaosa') {
        const parent = LINNAOSA_PARENT[county];
        if (!parent || !names.has(parent)) missing.push(`${parent ?? '?'} (for linnaosa ${name})`);
      }
    }
    expect(missing).toEqual([]);
    for (const t of r.towns) {
      expect(r.counties, t.name).toContain(t.county);
      expect(t.population, t.name).toBeGreaterThan(0);
      expect(t.ruShare, t.name).toBeGreaterThanOrEqual(0);
      expect(t.ruShare, t.name).toBeLessThanOrEqual(1);
    }
  });

  it('has more patrols at night than by day and keeps night/day cover', () => {
    const patrols = r.roster.filter((u) => isNormal(u) && u.type === 'patrol');
    const day = patrols.filter((u) => works(u, 'day')).length;
    const night = patrols.filter((u) => works(u, 'night')).length;
    expect(day).toBeGreaterThan(0);
    expect(night).toBeGreaterThanOrEqual(day);
    // harder difficulties add units
    expect(r.roster.some((u) => u.minDifficulty === 'veteran')).toBe(true);
    expect(r.roster.some((u) => u.minDifficulty === 'realistic')).toBe(true);
  });
});

// ── district polygons ────────────────────────────────────────────────────────

describe('district accuracy', () => {
  it('Tallinn streets and places lie inside their linnaosa polygon (≤ 5 % tolerance)', () => {
    const pts = allPoints(REGION_POHJA).filter((p) => p.city === 'Tallinn');
    for (const p of pts) {
      if (p.label.startsWith('street') || p.label.startsWith('place')) {
        expect(TALLINN_DISTRICTS, `${p.label} needs a Tallinn district`).toContain(p.district);
      }
    }
    const withDistrict = pts.filter((p) => p.district);
    const offenders = districtOffenders(withDistrict);
    expect(
      offenders.length,
      `Tallinn district mismatches (${offenders.length}/${withDistrict.length}):\n${offenders.join('\n')}`,
    ).toBeLessThanOrEqual(Math.floor(withDistrict.length * 0.05));
  });

  it('Kohtla-Järve streets and places lie inside their linnaosa polygon (≤ 5 % tolerance)', () => {
    const pts = allPoints(REGION_IDA).filter((p) => p.city === 'Kohtla-Järve');
    for (const p of pts)
      if (p.label.startsWith('street') || p.label.startsWith('place'))
        expect(KJ_DISTRICTS, p.label).toContain(p.district);
    const withDistrict = pts.filter((p) => p.district);
    const offenders = districtOffenders(withDistrict);
    expect(
      offenders.length,
      `Kohtla-Järve district mismatches:\n${offenders.join('\n')}`,
    ).toBeLessThanOrEqual(Math.floor(withDistrict.length * 0.05));
  });

  it('non-Tallinn Harju points do not fall inside Tallinn', () => {
    const tallinn = TALLINN_DISTRICTS.map((d) => featureByName(DISTRICTS, DISTRICT_POLYGON[d]));
    const offenders = allPoints(REGION_POHJA)
      .filter((p) => p.city !== 'Tallinn' && tallinn.some((f) => inFeature(p.pt, f)))
      .map((p) => p.label);
    expect(offenders).toEqual([]);
  });
});

// ── Põhja specifics ──────────────────────────────────────────────────────────

describe('Põhja prefektuur', () => {
  const r = REGION_POHJA;

  it('covers Harju county with Tallinn as HQ', () => {
    expect(r.counties).toEqual(['Harju maakond']);
    expect(r.hqCity).toBe('Tallinn');
    expect(r.callVolume).toBeCloseTo(6, 0);
    expect(r.zoom).toBeGreaterThanOrEqual(10.5);
    expect(r.commander).toEqual({
      name: 'Liisa Tamm',
      title: { et: 'Prefekt, politseikolonel', en: 'Prefect, Police Colonel' },
      badge: '002',
      gender: 'F',
    });
    expect(r.stations.some((s) => s.kind === 'airbase')).toBe(true);
  });

  it('gives prefects the colonel rank (politseikindral is the Director General)', () => {
    for (const reg of [REGION_POHJA, REGION_IDA]) {
      expect(reg.commander?.title.et, reg.id).toBe('Prefekt, politseikolonel');
    }
  });

  it('takes arrestees to Tallinna Vangla (arrest-house duties since 1 April 2025)', () => {
    const arrest = r.stations.find((s) => s.id === r.arrestHouseId);
    expect(arrest?.kind).toBe('arrest');
    expect(arrest?.name).toEqual({
      et: 'Tallinna Vangla (arestimaja ülesanded)',
      en: 'Tallinn Prison (arrest-house duties)',
    });
    expect(arrest?.short).toBe('Tallinna Vangla');
    expect(arrest?.address).toBe('Linnaaru tee 5, Soodevahe küla');
    expect(arrest?.city).toBe('Rae vald');
    // No PPA "kinnipidamiskeskus" (in PPA usage that is the Harku centre for foreigners).
    for (const s of r.stations) expect(s.name.et.toLowerCase(), s.id).not.toContain('kinnipidamiskeskus');
  });

  it('has the realistic normal roster', () => {
    expect(countNormal(r, 'patrol')).toBeGreaterThanOrEqual(12);
    expect(countNormal(r, 'rapid')).toBeGreaterThanOrEqual(2);
    for (const t of ['k9', 'traffic', 'criminal', 'community', 'transport', 'aux'] as UnitType[])
      expect(countNormal(r, t), t).toBeGreaterThanOrEqual(1);
    const special = r.roster.find((u) => u.type === 'special' && isNormal(u));
    expect(special?.onCall).toBe(true);
    const heli = r.roster.find((u) => u.type === 'heli' && isNormal(u));
    expect(heli?.onCall).toBe(true);
    expect(r.stations.find((s) => s.id === heli?.stationId)?.kind).toBe('airbase');
    expect(r.roster.filter((u) => u.type === 'aux' && isNormal(u)).every((u) => u.shift === 'night')).toBe(
      true,
    );
  });

  it('keeps the original 2024 officers (homage)', () => {
    const crew = r.roster.flatMap((u) => (u.crewNames ?? []).map((c) => ({ ...c, type: u.type })));
    const expected: [string, string, string, 'M' | 'F', UnitType][] = [
      ['Kalle', 'Rebane', '085', 'M', 'patrol'],
      ['Priit', 'Saar', '013', 'M', 'patrol'],
      ['Eeva', 'Leht', '044', 'F', 'patrol'],
      ['Pille', 'Vits', '051', 'F', 'patrol'],
      ['Jenni', 'Must', '052', 'F', 'patrol'],
      ['Ursula', 'Treen', '960', 'F', 'criminal'],
      ['Reimo', 'Rann', '961', 'M', 'criminal'],
      ['Toomas', 'Perk', '570', 'M', 'rapid'],
      ['Karel', 'Tael', '571', 'M', 'rapid'],
    ];
    for (const [firstName, lastName, badge, gender, type] of expected) {
      expect(crew, `${firstName} ${lastName}`).toContainEqual({ firstName, lastName, badge, gender, type });
    }
    // homage crews exist at normal difficulty
    for (const u of r.roster.filter((x) => x.crewNames)) expect(isNormal(u), u.callsign).toBe(true);
  });

  it('has ≥ 90 Tallinn streets across all 8 districts incl. every legacy (2025) street', () => {
    const tln = r.streets.filter((s) => s.city === 'Tallinn');
    expect(tln.length).toBeGreaterThanOrEqual(90);
    for (const d of TALLINN_DISTRICTS)
      expect(tln.filter((s) => s.district === d).length, d).toBeGreaterThanOrEqual(6);
    const legacy = [
      'Pärnu mnt',
      'Narva mnt',
      'Tartu mnt',
      'Kopli tn',
      'Liivalaia tn',
      'Endla tn',
      'Vabaduse pst',
      'Sõpruse pst',
      'Mustamäe tee',
      'Õismäe tee',
      'Tammsaare tee',
      'Kreutzwaldi tn',
      'Gonsiori tn',
      'Tõnismägi',
      'Vana-Lõuna tn',
      'Kalaranna tn',
      'Põhja pst',
      'Suur-Ameerika tn',
      'Väike-Ameerika tn',
      'Koidu tn',
      'Liiva tn',
      'Pikk tn',
      'Suur-Karja tn',
      'Vene tn',
      'Sakala tn',
      'Roosikrantsi tn',
    ];
    for (const name of legacy) {
      expect(
        tln.some((s) => s.name === name || s.name.endsWith(` ${name}`)),
        `legacy street ${name}`,
      ).toBe(true);
    }
    // Harju towns have streets too
    for (const town of ['Maardu', 'Keila', 'Saue', 'Paldiski', 'Kehra', 'Loksa']) {
      expect(
        r.streets.some((s) => s.city === town),
        town,
      ).toBe(true);
    }
  });

  it('has ≥ 120 curated places with sensible town data', () => {
    expect(r.places.length).toBeGreaterThanOrEqual(120);
    const tallinn = r.towns.find((t) => t.name === 'Tallinn');
    expect(tallinn?.population).toBeGreaterThan(400000);
    expect(r.towns.find((t) => t.name === 'Maardu')!.ruShare).toBeGreaterThan(0.5);
    for (const name of [
      'Viru Keskus',
      'Balti jaam',
      'Tallinna bussijaam',
      'Lennart Meri Tallinna lennujaam',
      'Tallinna Vangla',
    ]) {
      expect(
        r.places.some((p) => p.name === name),
        name,
      ).toBe(true);
    }
  });
});

// ── Ida specifics ────────────────────────────────────────────────────────────

describe('Ida prefektuur', () => {
  const r = REGION_IDA;

  it('covers Ida-Viru and Lääne-Viru with Jõhvi as HQ', () => {
    expect([...r.counties].sort()).toEqual(['Ida-Viru maakond', 'Lääne-Viru maakond']);
    expect(r.hqCity).toBe('Jõhvi');
    expect(r.callVolume).toBeCloseTo(3.5, 1);
    expect(r.zoom).toBeGreaterThan(8.5);
    expect(r.zoom).toBeLessThan(10);
    expect(r.stations.filter((s) => s.kind === 'border').length).toBeGreaterThanOrEqual(2);
  });

  it('has the realistic normal roster', () => {
    expect(countNormal(r, 'patrol')).toBeGreaterThanOrEqual(8);
    expect(countNormal(r, 'border')).toBeGreaterThanOrEqual(2);
    for (const t of ['rapid', 'k9', 'traffic', 'criminal', 'boat', 'transport'] as UnitType[])
      expect(countNormal(r, t), t).toBeGreaterThanOrEqual(1);
    for (const u of r.roster.filter((x) => x.type === 'border' || x.type === 'boat')) {
      expect(['border', 'harbour']).toContain(r.stations.find((s) => s.id === u.stationId)?.kind);
    }
  });

  it('has the required street coverage per town', () => {
    const count = (city: string) => r.streets.filter((s) => s.city === city).length;
    expect(count('Narva')).toBeGreaterThanOrEqual(25);
    expect(count('Kohtla-Järve')).toBeGreaterThanOrEqual(12);
    expect(count('Jõhvi')).toBeGreaterThanOrEqual(10);
    expect(count('Sillamäe')).toBeGreaterThanOrEqual(8);
    expect(count('Rakvere')).toBeGreaterThanOrEqual(12);
    for (const town of ['Kunda', 'Kiviõli', 'Narva-Jõesuu', 'Tapa', 'Tamsalu'])
      expect(count(town), town).toBeGreaterThanOrEqual(2);
    expect(r.streets.filter((s) => s.city === 'Kohtla-Järve').map((s) => s.district)).toEqual(
      expect.arrayContaining(['Järve', 'Ahtme']),
    );
  });

  it('has ≥ 70 places and Russian-speaking towns', () => {
    expect(r.places.length).toBeGreaterThanOrEqual(70);
    const ru = (name: string) => r.towns.find((t) => t.name === name)!.ruShare;
    expect(ru('Narva')).toBeGreaterThanOrEqual(0.9);
    expect(ru('Sillamäe')).toBeGreaterThanOrEqual(0.85);
    expect(ru('Kohtla-Järve')).toBeGreaterThanOrEqual(0.7);
    expect(ru('Rakvere')).toBeLessThan(0.2);
    expect(r.places.some((p) => p.kind === 'border' && p.city === 'Narva')).toBe(true);
    expect(r.places.some((p) => p.kind === 'prison')).toBe(true);
  });
});

// ── cross-region ─────────────────────────────────────────────────────────────

describe('Põhja + Ida together', () => {
  it('do not share ids or callsigns', () => {
    const ids = (r: RegionDef) => [
      ...r.stations.map((s) => s.id),
      ...r.streets.map((s) => s.id),
      ...r.places.map((p) => p.id),
      ...r.roster.map((u) => u.callsign),
    ];
    const a = new Set(ids(REGION_POHJA));
    expect(ids(REGION_IDA).filter((x) => a.has(x))).toEqual([]);
  });
});
