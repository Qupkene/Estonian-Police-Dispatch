/**
 * County geography after the 2017 administrative reform: the county polygons, the county column of
 * settlements.json, the hand-written towns of every prefecture and the prefecture that ends up
 * handling a rural call must all agree on the current borders (Maa- ja Ruumiamet data).
 */
import { describe, expect, it } from 'vitest';
import countiesJson from '@/data/geo/counties.json';
import settlementsJson from '@/data/geo/settlements.json';
import { REGIONS, regionForCounty } from '@/data/regions';
import { REGION_IDA } from '@/data/regions/ida';
import { REGION_LOUNA } from '@/data/regions/louna';
import { countyAt, pickLocation } from '@/gen/address';
import { Rng } from '@/sim/rng';
import type { LngLat, RegionDef } from '@/sim/types';

type Row = [string, string, string, number, number];
const SETTLEMENTS = settlementsJson as unknown as Row[];
const COUNTIES = (countiesJson as unknown as { features: { properties: { name: string; iso: string } }[] })
  .features;
const ALL_REGIONS = Object.values(REGIONS).filter((r): r is RegionDef => !!r);

const km = (a: LngLat, b: LngLat) =>
  Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110.57);

/** The settlements.json row for a name; `near` picks one of several same-named villages. */
function settlement(name: string, kind: string, near?: LngLat): Row {
  let rows = SETTLEMENTS.filter((r) => r[0] === name && r[1] === kind);
  if (near) rows = rows.filter((r) => km(near, [r[3], r[4]]) < 5);
  expect(rows, `${name} (${kind})`).toHaveLength(1);
  return rows[0];
}

/** Settlements that changed county in the 2017 reform, with their current county. */
const MOVED: [string, string, string, LngLat?][] = [
  // Avinurme and Lohusuu vald: Ida-Viru → Mustvee vald, Jõgeva
  ['Avinurme', 'alevik', 'Jõgeva maakond'],
  ['Lohusuu', 'alevik', 'Jõgeva maakond'],
  ['Separa', 'küla', 'Jõgeva maakond'],
  ['Kõveriku', 'küla', 'Jõgeva maakond'],
  ['Maetsma', 'küla', 'Jõgeva maakond'],
  // Värska and Mikitamäe vald: Põlva → Setomaa vald, Võru; Orava vald → Võru vald
  ['Värska', 'alevik', 'Võru maakond'],
  ['Saatse', 'küla', 'Võru maakond'],
  ['Koidula', 'küla', 'Võru maakond', [27.6, 57.84]],
  ['Mikitamäe', 'küla', 'Võru maakond'],
  ['Orava', 'küla', 'Võru maakond'],
  // Meeksi vald: Tartu → Räpina vald, Põlva
  ['Mehikoorma', 'alevik', 'Põlva maakond'],
  ['Meeksi', 'küla', 'Põlva maakond'],
  // Lihula and Hanila vald: Lääne → Lääneranna vald, Pärnu
  ['Lihula', 'linn', 'Pärnu maakond'],
  ['Virtsu', 'alevik', 'Pärnu maakond'],
  ['Hanila', 'küla', 'Pärnu maakond'],
  // Tabivere and Pala vald: Jõgeva → Tartu vald / Peipsiääre vald, Tartu
  ['Tabivere', 'alevik', 'Tartu maakond'],
  ['Pala', 'küla', 'Tartu maakond', [27.02, 58.68]],
  // Aseri vald: Ida-Viru → Viru-Nigula vald, Lääne-Viru
  ['Aseri', 'alevik', 'Lääne-Viru maakond'],
  // Käru vald: Rapla → Türi vald, Järva
  ['Käru', 'alevik', 'Järva maakond'],
  // Palupera vald and the Aakre villages of Puka vald: Valga → Elva vald, Tartu
  ['Palupera', 'küla', 'Tartu maakond'],
  ['Aakre', 'küla', 'Tartu maakond'],
  // Rehemäe: Nissi vald (Harju) → Lääne-Nigula vald (Lääne), 1 March 2017
  ['Rehemäe', 'küla', 'Lääne maakond'],
];

describe('county polygons and settlements (2017 borders)', () => {
  it('has the 15 counties every region refers to', () => {
    expect(COUNTIES).toHaveLength(15);
    const names = new Set(COUNTIES.map((f) => f.properties.name));
    expect(names.size).toBe(15);
    for (const f of COUNTIES) expect(f.properties.iso, f.properties.name).toMatch(/^EE-\d\d$/);
    for (const r of ALL_REGIONS) for (const c of r.counties) expect(names.has(c), `${r.id}: ${c}`).toBe(true);
  });

  it.each(MOVED)('puts %s (%s) in %s, in the data and in the polygons', (name, kind, county, near) => {
    const row = settlement(name, kind, near);
    expect(row[2]).toBe(county);
    expect(countyAt([row[3], row[4]])).toBe(county);
  });

  it('keeps every settlement inside the county it is labelled with', () => {
    const wrong = SETTLEMENTS.filter((r) => r[2] !== '' && countyAt([r[3], r[4]]) !== r[2]).map(
      (r) => `${r[0]} (${r[2]} → ${countyAt([r[3], r[4]])})`,
    );
    expect(wrong).toEqual([]);
  });

  it('hands calls in the reform areas to the right prefecture', () => {
    const regionAt = (name: string, kind: string) => {
      const r = settlement(name, kind);
      return regionForCounty(countyAt([r[3], r[4]]) ?? '');
    };
    expect(regionForCounty(countyAt([26.862, 58.987]) ?? '')).toBe('louna');
    expect(regionAt('Lohusuu', 'alevik')).toBe('louna');
    expect(regionAt('Värska', 'alevik')).toBe('louna');
    expect(regionAt('Lihula', 'linn')).toBe('laane');
    expect(regionAt('Käru', 'alevik')).toBe('laane');
    expect(regionAt('Aseri', 'alevik')).toBe('ida');
    expect(regionAt('Rehemäe', 'küla')).toBe('laane');
  });

  it('puts every town of every prefecture in its declared county, which the prefecture owns', () => {
    for (const r of ALL_REGIONS) {
      for (const t of r.towns) {
        expect(countyAt(t.coord as LngLat), `${r.id}: ${t.name}`).toBe(t.county);
        expect(r.counties, `${r.id}: ${t.name}`).toContain(t.county);
      }
    }
    const owner = (town: string) => ALL_REGIONS.filter((r) => r.towns.some((t) => t.name === town)).map((r) => r.id);
    expect(owner('Avinurme')).toEqual(['louna']);
    expect(owner('Lohusuu')).toEqual(['louna']);
  });
});

describe('generated rural locations follow the current borders', () => {
  /** Settlements of the former Avinurme and Lohusuu vald (Ida-Viru until 2017, now Mustvee vald). */
  const FORMER_IV = new Set([
    'Adraku', 'Alekere', 'Avinurme', 'Jõemetsa', 'Kaevussaare', 'Kalmaküla', 'Kiissa', 'Kõrve',
    'Kõrvemetsa', 'Kõveriku', 'Kärasi', 'Laekannu', 'Lepiksaare', 'Lohusuu', 'Maetsma', 'Ninasi',
    'Paadenurme', 'Piilsi', 'Raadna', 'Separa', 'Sälliksaare', 'Tammessaare', 'Tammispää', 'Ulvi',
    'Vadi', 'Vilusi', 'Änniksaare',
  ]);
  const moved = SETTLEMENTS.filter((r) => FORMER_IV.has(r[0]) && r[3] > 26.6 && r[4] > 58.85 && r[4] < 59.1);
  const nearMoved = (city: string, p: LngLat) => moved.some((r) => r[0] === city && km(p, [r[3], r[4]]) < 1.5);

  it('labels the former Avinurme and Lohusuu vald as Jõgeva maakond', () => {
    expect(moved).toHaveLength(FORMER_IV.size);
    for (const r of moved) expect(r[2], r[0]).toBe('Jõgeva maakond');
  });

  it('keeps Ida rural calls out of Mustvee vald', () => {
    const rng = new Rng(2017);
    for (let i = 0; i < 1500; i++) {
      const loc = pickLocation(rng, REGION_IDA, [i % 2 ? 'farm' : 'village']);
      // Curated places carry no district; generated rural ones carry the settlement's county.
      if (loc.district) expect(REGION_IDA.counties, loc.address).toContain(loc.district);
      expect(nearMoved(loc.city, loc.coord), loc.address).toBe(false);
    }
  });

  it('lets Lõuna generate rural calls around Avinurme and Lohusuu, labelled Jõgeva maakond', () => {
    const rng = new Rng(4);
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const loc = pickLocation(rng, REGION_LOUNA, ['village']);
      if (loc.district) expect(REGION_LOUNA.counties, loc.address).toContain(loc.district);
      if (nearMoved(loc.city, loc.coord)) {
        hits++;
        // Generated: "<küla>, Jõgeva maakond"; curated (lo-avinurme, lo-lohusuu): "..., Mustvee vald".
        expect(loc.address).toMatch(/, (Jõgeva maakond|Mustvee vald)$/);
      }
    }
    expect(hits).toBeGreaterThan(0);
  });
});
