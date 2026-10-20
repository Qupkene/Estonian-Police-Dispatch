/**
 * Sectors (docs/SECTORS.md): the data of all four prefectures, membership and geometry (src/sim/sectors.ts),
 * calls only inside the area (src/sim/spawner.ts), crews from the area's stations (rosterFromCareer, the
 * default roster), the fixed schedule of the daily challenge, and older saves that know nothing of sectors.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { COUNTY_POPULATION, SECTORS, TOWN_DISTRICTS } from '@/data/sectors';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { TEMPLATES } from '@/data/incidents';
import { pickLocation } from '@/gen/address';
import { newCareer, rosterFromCareer } from '@/sim/career';
import { acknowledge, answerCall, dispatchUnits, endCall } from '@/sim/commands';
import { helpSector } from '@/sim/colleagues';
import { createShift, step } from '@/sim/engine';
import { Rng } from '@/sim/rng';
import { queue, recommendUnits } from '@/sim/selectors';
import {
  areaBounds,
  areaShare,
  areaStations,
  areaView,
  borderPoints,
  inArea,
  mainStation,
  neighbourSectors,
  normalizeArea,
  sectorAt,
  sectorById,
  sectorOf,
  sectorOutlines,
  sectorPopulation,
  sectorsOf,
  sectorStationIds,
  starterSectors,
} from '@/sim/sectors';
import {
  AREA_MIN_VOLUME,
  areaCallFactor,
  borderLocation,
  FIXED_FOLLOW_UP_SEQ,
  spawnIncident,
  spawnRatePerHour,
  updateSpawner,
} from '@/sim/spawner';
import { MIN, tallinnTime } from '@/sim/time';
import { MIN_AREA_RESPONSE, RESPONSE_TYPES } from '@/sim/units';
import type { CareerProfile, Incident, LngLat, NewShiftOptions, RegionDef, RegionId, SimState } from '@/sim/types';

const ready = REGION_IDS.every((id) => REGIONS[id].roster.length > 0) && TEMPLATES.length > 50;

// Whole shifts and every sector of four prefectures: more than the default 5 s on a busy machine.
vi.setConfig({ testTimeout: 60_000 });

/** Even-odd point in ring ([lon, lat], closed). */
function inRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Every addressable location of a prefecture: its towns, the middle of each street, its places. */
function locations(region: RegionDef) {
  return [
    ...region.towns.map((t) => ({ what: `town ${t.name}`, loc: { coord: t.coord, city: t.name } })),
    ...region.streets
      .filter((st) => st.points.length)
      .map((st) => ({ what: `street ${st.name}, ${st.city}`, loc: { coord: st.points[Math.floor(st.points.length / 2)], city: st.city, district: st.district } })),
    ...region.places.map((pl) => ({ what: `place ${pl.name}`, loc: pl })),
  ];
}

const shiftOpts = (regionId: RegionId, o: Partial<NewShiftOptions> = {}): NewShiftOptions => ({
  seed: 7,
  regionId,
  mode: 'free',
  difficulty: 'normal',
  start: tallinnTime(2026, 10, 14, 7, 0),
  hours: 8,
  playerName: 'Test',
  ...o,
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sector data', () => {
  it('cuts each prefecture as docs/SECTORS.md lays out', () => {
    const names = (r: RegionId) => sectorsOf(r).map((x) => x.name.et);
    expect(names('pohja')).toEqual(['Tallinna kesklinn', 'Lasnamäe', 'Lääne-Tallinn', 'Ida-Harju', 'Lääne-Harju']);
    expect(names('louna')).toEqual(['Tartu linn', 'Tartumaa ja Elva', 'Jõgevamaa', 'Viljandimaa', 'Põlvamaa', 'Võrumaa', 'Valgamaa']);
    expect(names('ida')).toEqual(['Narva', 'Jõhvi ja Kohtla-Järve', 'Lääne-Virumaa']);
    expect(names('laane')).toEqual(['Pärnu', 'Pärnumaa', 'Läänemaa', 'Saaremaa', 'Hiiumaa', 'Raplamaa', 'Järvamaa']);
    const starters = REGION_IDS.flatMap((r) => starterSectors(r).map((x) => `${x.id}:${x.starter!.difficulty}`));
    expect(starters.sort()).toEqual(
      [
        'pohja-kesklinn:normal',
        'pohja-lasnamae:hard',
        'louna-tartu:normal',
        'louna-viljandi:easy',
        'ida-laaneviru:easy',
        'ida-narva:hard',
        'laane-parnu:normal',
        'laane-saaremaa:easy',
      ].sort(),
    );
    expect(new Set(SECTORS.map((x) => x.id)).size).toBe(SECTORS.length);
  });

  it('builds on the real region data: towns, counties, districts and stations', () => {
    for (const x of SECTORS) {
      const region = REGIONS[x.regionId];
      expect(x.id.startsWith(`${x.regionId}-`), x.id).toBe(true);
      for (const t of x.match.towns ?? []) expect(region.towns.some((y) => y.name === t), `${x.id}: town ${t}`).toBe(true);
      for (const c of x.match.counties ?? []) expect(region.counties, `${x.id}: county ${c}`).toContain(c);
      for (const d of x.match.districts ?? []) expect(Object.values(TOWN_DISTRICTS).some((m) => d in m), `${x.id}: district ${d}`).toBe(true);
      expect(x.stationIds.length, x.id).toBeGreaterThan(0);
      for (const id of x.stationIds) expect(region.stations.some((st) => st.id === id), `${x.id}: station ${id}`).toBe(true);
      // The main station is a staffed police station.
      expect(['station', 'hq'], x.id).toContain(mainStation(region, x.id)?.kind);
      for (const p of x.posts ?? []) {
        expect(region.stations.find((st) => st.id === p.stationId)?.kind, `${x.id}: post ${p.stationId}`).toBe('post');
        expect(x.stationIds, x.id).toContain(p.stationId);
        expect(p.price).toBeGreaterThanOrEqual(8000);
        expect(p.price).toBeLessThanOrEqual(20000);
        expect(p.upkeep).toBeGreaterThanOrEqual(400);
        expect(p.upkeep).toBeLessThanOrEqual(900);
      }
    }
    for (const r of REGION_IDS) for (const c of REGIONS[r].counties) expect(COUNTY_POPULATION[c], c).toBeGreaterThan(0);
  });

  it('has symmetric neighbours inside the prefecture, and every sector is reachable', () => {
    for (const x of SECTORS) {
      expect(x.neighbours.length, x.id).toBeGreaterThan(0);
      for (const n of x.neighbours) {
        const other = sectorById(n);
        expect(other?.regionId, `${x.id} -> ${n}`).toBe(x.regionId);
        expect(other!.neighbours, `${n} -> ${x.id}`).toContain(x.id);
        expect(n).not.toBe(x.id);
      }
    }
    for (const r of REGION_IDS) {
      const all = sectorsOf(r);
      const seen = new Set([all[0].id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const id of [...seen]) for (const n of sectorById(id)!.neighbours) if (!seen.has(n)) grew = !!seen.add(n);
      }
      expect(seen.size, r).toBe(all.length);
    }
  });

  it('has a blurb, 3-5 traits and an AI colleague, in Estonian and English', () => {
    const colleagues = new Set<string>();
    for (const x of SECTORS) {
      for (const t of [x.name, x.blurb, ...x.traits]) {
        expect(t.et.trim().length, x.id).toBeGreaterThan(0);
        expect(t.en.trim().length, x.id).toBeGreaterThan(0);
        expect(`${t.et} ${t.en}`, x.id).not.toMatch(/[\u2013\u2014]/);
      }
      expect(x.blurb.et.length, x.id).toBeGreaterThan(60);
      expect(x.traits.length, x.id).toBeGreaterThanOrEqual(3);
      expect(x.traits.length, x.id).toBeLessThanOrEqual(5);
      expect(x.short).toBe(x.short.toUpperCase());
      const { firstName, lastName, gender } = x.colleague;
      expect(firstName.length * lastName.length, x.id).toBeGreaterThan(0);
      expect(['M', 'F']).toContain(gender);
      colleagues.add(`${firstName} ${lastName}`);
    }
    expect(colleagues.size).toBe(SECTORS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('membership (sectorOf)', () => {
  it('puts every town, street and place of a prefecture in exactly one of its sectors', () => {
    for (const r of REGION_IDS) {
      const region = REGIONS[r];
      const ids = new Set(sectorsOf(r).map((x) => x.id));
      const hits = new Map<string, number>();
      for (const { what, loc } of locations(region)) {
        const id = sectorOf(region, loc);
        expect(ids.has(id), `${r}: ${what} -> '${id}'`).toBe(true);
        expect(sectorOf(region, loc), what).toBe(id); // stable
        hits.set(id, (hits.get(id) ?? 0) + 1);
      }
      // Every sector holds some of them (a desk with nothing to cover would be pointless).
      for (const id of ids) expect(hits.get(id) ?? 0, id).toBeGreaterThanOrEqual(8);
    }
  });

  it('puts generated addresses (villages, farms, forests, highways) in a sector of their prefecture', () => {
    const kinds = ['street', 'residential', 'house', 'village', 'farm', 'summerhouse', 'forest', 'ruralroad', 'lake', 'highway', 'shop', 'bar'] as const;
    for (const r of REGION_IDS) {
      const region = REGIONS[r];
      const ids = new Set(sectorsOf(r).map((x) => x.id));
      const rng = new Rng(17);
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const loc = pickLocation(rng, region, [kinds[i % kinds.length]]);
        const id = sectorOf(region, loc);
        expect(ids.has(id), `${r}: ${loc.address} -> '${id}'`).toBe(true);
        seen.add(id);
      }
      expect(seen.size, r).toBeGreaterThanOrEqual(Math.min(3, ids.size));
    }
  });

  it('follows the precedence: Tallinn district, then town, then county', () => {
    const at = (r: RegionId, town: string) => {
      const t = REGIONS[r].towns.find((x) => x.name === town)!;
      return sectorOf(REGIONS[r], { coord: t.coord, city: t.name });
    };
    const expected: [RegionId, string, string][] = [
      ['pohja', 'Maardu', 'pohja-idaharju'],
      ['pohja', 'Loksa', 'pohja-idaharju'],
      ['pohja', 'Kose', 'pohja-idaharju'],
      ['pohja', 'Keila', 'pohja-laaneharju'],
      ['pohja', 'Paldiski', 'pohja-laaneharju'],
      ['pohja', 'Saku', 'pohja-laaneharju'],
      ['ida', 'Narva', 'ida-narva'],
      ['ida', 'Narva-Jõesuu', 'ida-narva'],
      ['ida', 'Sillamäe', 'ida-johvi'],
      ['ida', 'Kohtla-Järve', 'ida-johvi'],
      ['ida', 'Kiviõli', 'ida-johvi'],
      ['ida', 'Rakvere', 'ida-laaneviru'],
      ['louna', 'Tartu', 'louna-tartu'],
      ['louna', 'Elva', 'louna-tartumaa'],
      ['louna', 'Otepää', 'louna-valga'],
      ['louna', 'Räpina', 'louna-polva'],
      ['laane', 'Pärnu', 'laane-parnu'],
      ['laane', 'Sindi', 'laane-parnumaa'],
      ['laane', 'Lihula', 'laane-parnumaa'],
      ['laane', 'Ruhnu', 'laane-saaremaa'],
      ['laane', 'Hullo', 'laane-laanemaa'],
    ];
    for (const [r, town, id] of expected) expect(at(r, town), town).toBe(id);
    // Tallinn by its districts, whatever the street is called.
    const pohja = REGIONS.pohja;
    const byDistrict: Record<string, string> = {
      Kesklinn: 'pohja-kesklinn',
      Pirita: 'pohja-kesklinn',
      Lasnamäe: 'pohja-lasnamae',
      'Põhja-Tallinn': 'pohja-laanetallinn',
      Mustamäe: 'pohja-laanetallinn',
      Nõmme: 'pohja-laanetallinn',
    };
    for (const st of pohja.streets.filter((x) => x.city === 'Tallinn' && x.district && x.district in byDistrict)) {
      expect(sectorOf(pohja, { coord: st.points[0], city: st.city, district: st.district }), st.name).toBe(byDistrict[st.district!]);
    }
    // A Kesklinn of another town is not Tallinn's.
    const tartu = REGIONS.louna.streets.find((x) => x.city === 'Tartu' && x.district === 'Kesklinn')!;
    expect(sectorOf(REGIONS.louna, { coord: tartu.points[0], city: 'Tartu', district: 'Kesklinn' })).toBe('louna-tartu');
    // A town's name far outside the town (a rural spot named after the nearest town) goes by its county.
    const tartuTown = REGIONS.louna.towns.find((x) => x.name === 'Tartu')!;
    expect(sectorOf(REGIONS.louna, { coord: [tartuTown.coord[0] + 0.3, tartuTown.coord[1]], city: 'Tartu' })).toBe('louna-tartumaa');
  });

  it('splits a county shared by two sectors by the nearest town they name, then the nearest main station', () => {
    const pohja = REGIONS.pohja;
    const near = (town: string, dLon: number) => {
      const t = pohja.towns.find((x) => x.name === town)!;
      return sectorOf(pohja, { coord: [t.coord[0] + dLon, t.coord[1]], city: 'Küla', district: 'Harju maakond' });
    };
    expect(near('Paldiski', 0.03)).toBe('pohja-laaneharju');
    expect(near('Loksa', -0.03)).toBe('pohja-idaharju');
    expect(near('Kehra', 0.03)).toBe('pohja-idaharju');
    expect(near('Riisipere', 0.03)).toBe('pohja-laaneharju');
    // A point off every map (the sea north of Tallinn) still gets one sector.
    expect(sectorsOf('pohja').map((x) => x.id)).toContain(sectorOf(pohja, { coord: [24.9, 59.8], city: '' }));
    // sectorAt: a bare map point.
    const lasna = pohja.streets.find((x) => x.district === 'Lasnamäe')!;
    expect(sectorAt(pohja, lasna.points[0])).toBe('pohja-lasnamae');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('geometry and shares', () => {
  it('outlines each sector with padded rings, one per movement zone, around all its towns', () => {
    for (const r of REGION_IDS) {
      const region = REGIONS[r];
      for (const x of sectorsOf(r)) {
        const rings = sectorOutlines(region, [x.id]);
        expect(rings.length, x.id).toBeGreaterThan(0);
        for (const { id, ring } of rings) {
          expect(id).toBe(x.id);
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring[ring.length - 1]);
        }
        for (const t of region.towns.filter((y) => sectorOf(region, { coord: y.coord, city: y.name }) === x.id)) {
          expect(rings.some(({ ring }) => inRing(t.coord, ring)), `${x.id}: ${t.name}`).toBe(true);
        }
        const [[w, s], [e, n]] = areaBounds(region, [x.id]);
        for (const { ring } of rings) for (const [lon, lat] of ring) expect(lon >= w - 0.05 && lon <= e + 0.05 && lat >= s - 0.05 && lat <= n + 0.05, x.id).toBe(true);
      }
    }
    // Saaremaa and Ruhnu are two islands: two rings.
    expect(sectorOutlines(REGIONS.laane, ['laane-saaremaa'])).toHaveLength(2);
    expect(areaBounds(REGIONS.pohja, [])).toEqual(REGIONS.pohja.bounds);
  });

  it('shares the population among the sectors', () => {
    for (const r of REGION_IDS) {
      const region = REGIONS[r];
      const ids = sectorsOf(r).map((x) => x.id);
      const total = ids.reduce((a, id) => a + areaShare(region, [id]), 0);
      expect(total, r).toBeCloseTo(1, 6);
      expect(areaShare(region, ids)).toBeCloseTo(1, 6);
      expect(areaShare(region, [])).toBe(1);
      for (const id of ids) expect(sectorPopulation(region, id), id).toBeGreaterThan(5000);
      const counties = region.counties.reduce((a, c) => a + COUNTY_POPULATION[c], 0);
      const people = ids.reduce((a, id) => a + sectorPopulation(region, id), 0);
      expect(Math.abs(people - counties) / counties, r).toBeLessThan(0.01);
    }
    // Tallinn's districts by their residents.
    expect(sectorPopulation(REGIONS.pohja, 'pohja-lasnamae')).toBeGreaterThan(sectorPopulation(REGIONS.pohja, 'pohja-kesklinn'));
    expect(areaShare(REGIONS.louna, ['louna-tartu'])).toBeGreaterThan(0.25);
  });

  it('lists the stations, neighbours and areas of a selection', () => {
    const pohja = REGIONS.pohja;
    expect(areaStations(pohja, ['pohja-kesklinn']).map((x) => x.id)).toEqual(['pohja-hq']);
    expect(areaStations(pohja, ['pohja-idaharju']).map((x) => x.id)).toEqual(['pohja-idaharju']);
    expect(areaStations(pohja, ['pohja-idaharju'], ['pohja-kose', 'pohja-saku']).map((x) => x.id)).toEqual(['pohja-idaharju', 'pohja-kose']);
    expect(areaStations(pohja, ['pohja-lasnamae', 'pohja-idaharju']).map((x) => x.id)).toEqual(['pohja-idaharju']);
    expect(areaStations(pohja, []).length).toBeGreaterThan(3);
    expect(neighbourSectors(['pohja-kesklinn']).map((x) => x.id).sort()).toEqual(['pohja-idaharju', 'pohja-laanetallinn', 'pohja-lasnamae']);
    expect(neighbourSectors(['pohja-kesklinn', 'pohja-lasnamae']).map((x) => x.id)).not.toContain('pohja-lasnamae');
    expect(normalizeArea('louna', ['louna-tartu', 'pohja-kesklinn', 'nope', 'louna-tartu'])).toEqual(['louna-tartu']);
    expect(normalizeArea('ida', sectorsOf('ida').map((x) => x.id))).toEqual([]);
    expect(normalizeArea('ida', undefined)).toEqual([]);
    expect(sectorStationIds(['ida-narva'])).toContain('ida-narva-pp');
    expect(mainStation(REGIONS.ida, 'ida-johvi')?.id).toBe('ida-hq');
    // The area as a region of its own holds only the area's streets and places.
    const view = areaView(REGIONS.ida, ['ida-narva']);
    expect(view.streets.length).toBeGreaterThan(5);
    for (const pl of view.places) expect(sectorOf(REGIONS.ida, pl), pl.name).toBe('ida-narva');
    // Border points of a neighbour lie in the neighbour, nearest first.
    const pts = borderPoints(REGIONS.louna, ['louna-tartu'], 'louna-tartumaa', 5);
    expect(pts).toHaveLength(5);
    for (const p of pts) expect(sectorAt(REGIONS.louna, p)).toBe('louna-tartumaa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!ready)('calls only inside the area', () => {
  it('spawns every call of a sector shift inside the area, a whole shift long', () => {
    for (const [regionId, sector] of [
      ['pohja', 'pohja-kesklinn'],
      ['ida', 'ida-narva'],
      ['laane', 'laane-saaremaa'],
      ['louna', 'louna-tartumaa'],
    ] as const) {
      const s = createShift(shiftOpts(regionId, { hours: 12, sectors: [sector], difficulty: 'realistic' }));
      expect(s.sectors).toEqual([sector]);
      while (s.now < s.endTime) step(s, 5 * MIN);
      const incs = s.incidentOrder.map((id) => s.incidents[id]);
      expect(incs.length, sector).toBeGreaterThan(10);
      for (const inc of incs) {
        // A neighbouring colleague's call for help lies just across the border, in their sector (src/sim/colleagues.ts).
        const help = helpSector(inc);
        if (help) expect(sectorOf(REGIONS[regionId], inc.location), `${sector}: ${inc.location.address}`).toBe(help);
        else expect(inArea(s, REGIONS[regionId], inc.location), `${sector}: ${inc.location.address}`).toBe(true);
      }
      // The spawner kept going (no template it could not place stalled it).
      expect(s.nextSpawnAt).toBeGreaterThan(s.endTime - 2 * 60 * MIN);
    }
  });

  it('skips a call it cannot place in the area, without using up its number', () => {
    const s = createShift(shiftOpts('pohja', { sectors: ['pohja-kesklinn'] }));
    const farm = { ...TEMPLATES.find((t) => !t.easterEgg && t.places.includes('farm'))!, id: 'test:farm', places: ['farm' as const] };
    const before = { seq: s.seq.incident, n: s.incidentOrder.length };
    expect(spawnIncident(s, farm, { areaOnly: true })).toBeUndefined();
    expect(s.seq.incident).toBe(before.seq);
    expect(s.incidentOrder).toHaveLength(before.n);
    // Without areaOnly (the director), it lands anywhere in the prefecture.
    expect(spawnIncident(s, farm)).toBeDefined();
    // The arrival loop moves on: a shift whose every arrival is such a call still advances.
    const t = s.nextSpawnAt;
    s.now = t + MIN;
    updateSpawner(s);
    expect(s.nextSpawnAt).toBeGreaterThan(t);
  });

  it('scales the volume by the softened population share, at least a desk of calls an hour', () => {
    const t = tallinnTime(2026, 10, 14, 11, 0);
    for (const r of REGION_IDS) {
      const whole = createShift(shiftOpts(r));
      expect(areaCallFactor(whole)).toBe(1);
      for (const x of sectorsOf(r)) {
        const s = createShift(shiftOpts(r, { sectors: [x.id] }));
        s.weather = whole.weather;
        const f = areaCallFactor(s);
        expect(f, x.id).toBeLessThan(1);
        expect(f * REGIONS[r].callVolume, x.id).toBeGreaterThanOrEqual(AREA_MIN_VOLUME - 1e-9);
        expect(f, x.id).toBeGreaterThanOrEqual(areaShare(REGIONS[r], [x.id]));
        expect(spawnRatePerHour(s, t)).toBeCloseTo(spawnRatePerHour(whole, t) * f, 9);
      }
    }
    // More sectors, more calls; the whole prefecture is the old volume.
    const one = createShift(shiftOpts('pohja', { sectors: ['pohja-laanetallinn'] }));
    const two = createShift(shiftOpts('pohja', { sectors: ['pohja-laanetallinn', 'pohja-kesklinn'] }));
    expect(areaCallFactor(two)).toBeGreaterThan(areaCallFactor(one));
    const all = createShift(shiftOpts('pohja', { sectors: sectorsOf('pohja').map((x) => x.id) }));
    expect(all.sectors).toBeUndefined();
    expect(areaCallFactor(all)).toBe(1);
  });

  it("finds a place just across the border for a colleague's call", () => {
    const s = createShift(shiftOpts('louna', { sectors: ['louna-tartu'] }));
    const rng = new Rng(3);
    for (const n of neighbourSectors(['louna-tartu'])) {
      const loc = borderLocation(s, rng, n.id);
      expect(loc, n.id).toBeDefined();
      expect(sectorOf(REGIONS.louna, loc!)).toBe(n.id);
      expect(inArea(s, REGIONS.louna, loc!)).toBe(false);
    }
    expect(borderLocation(createShift(shiftOpts('louna')), rng, 'louna-tartumaa')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!ready)('crews from the area', () => {
  it('bases a new career at its starter sector, and an opened post gets one crew', () => {
    for (const r of REGION_IDS) {
      for (const x of starterSectors(r)) {
        const p = newCareer('Test', '777', r, 42, x.id);
        for (const shift of ['day', 'night'] as const) {
          const roster = rosterFromCareer(p, shift, r);
          const field = roster.filter((u) => !u.onCall);
          expect(field.length, x.id).toBeGreaterThanOrEqual(4);
          for (const u of field) expect(x.stationIds, `${x.id}: ${u.callsign}`).toContain(u.stationId);
          expect(new Set(roster.map((u) => u.callsign)).size).toBe(roster.length);
        }
      }
    }
    const p = newCareer('Test', '777', 'ida', 42, 'ida-laaneviru');
    const opened = rosterFromCareer({ ...p, openPosts: ['ida-tapa', 'ida-sillamae'] }, 'day', 'ida');
    expect(opened.filter((u) => u.stationId === 'ida-tapa')).toHaveLength(1);
    expect(opened.filter((u) => u.stationId === 'ida-sillamae')).toHaveLength(0); // a post of a sector not covered
    expect(opened.filter((u) => u.stationId === 'ida-rakvere').length).toBeGreaterThanOrEqual(3);
    expect(opened.find((u) => u.stationId === 'ida-tapa')?.callsign).toBe('IDA 61');
  });

  it('shares the crews among the main stations by population, and keeps the old allocation for a whole prefecture', () => {
    const p = newCareer('Test', '777', 'pohja', 42, 'pohja-kesklinn');
    const extra = Array.from({ length: 8 }, (_, i) => ({ ...p.staff[0], id: `x${i}`, badge: `8${i}0`, specialty: 'patrol' as const }));
    const cars = Array.from({ length: 4 }, (_, i) => ({ ...p.fleet[0], id: `c${i}`, plate: `111 XX${i}` }));
    const big: CareerProfile = { ...p, staff: [...p.staff, ...extra], fleet: [...p.fleet, ...cars] };
    const two = rosterFromCareer({ ...big, sectors: { pohja: ['pohja-kesklinn', 'pohja-lasnamae'] } }, 'day', 'pohja').filter((u) => !u.onCall);
    const hq = two.filter((u) => u.stationId === 'pohja-hq').length;
    const lasna = two.filter((u) => u.stationId === 'pohja-idaharju').length;
    expect(hq + lasna).toBe(two.length);
    expect(lasna).toBeGreaterThan(hq); // Lasnamäe has more residents than the centre
    expect(hq).toBeGreaterThanOrEqual(3);
    // The whole prefecture (or a career from before sectors) as before sectors existed.
    const whole = rosterFromCareer({ ...big, sectors: { pohja: sectorsOf('pohja').map((x) => x.id) } }, 'day', 'pohja');
    const old = { ...big } as CareerProfile;
    delete old.sectors;
    expect(rosterFromCareer(old, 'day', 'pohja')).toEqual(whole);
    expect(new Set(whole.map((u) => u.stationId)).size).toBeGreaterThan(2);
  });

  it('filters the default roster to the area, with at least three response units', () => {
    for (const r of REGION_IDS) {
      for (const x of sectorsOf(r)) {
        for (const start of [tallinnTime(2026, 10, 14, 7, 0), tallinnTime(2026, 10, 14, 19, 0)]) {
          for (const difficulty of ['cadet', 'normal'] as const) {
            const s = createShift(shiftOpts(r, { sectors: [x.id], start, difficulty }));
            const units = s.unitOrder.map((id) => s.units[id]);
            const response = units.filter((u) => !u.onCall && RESPONSE_TYPES.has(u.type));
            expect(response.length, `${x.id} ${difficulty}`).toBeGreaterThanOrEqual(MIN_AREA_RESPONSE);
            for (const u of units) if (!u.onCall) expect(x.stationIds, `${x.id}: ${u.callsign}`).toContain(u.stationId);
            expect(new Set(units.map((u) => u.callsign)).size, x.id).toBe(units.length);
          }
        }
      }
    }
    // The whole prefecture keeps its full roster.
    const whole = createShift(shiftOpts('pohja'));
    const kesk = createShift(shiftOpts('pohja', { sectors: ['pohja-kesklinn'] }));
    expect(kesk.unitOrder.length).toBeLessThan(whole.unitOrder.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/** An eager player: answers every call at once, files it, and sends the recommended crews to everything. */
function eager(s: SimState): void {
  for (const call of s.calls) {
    if (call.endedAt) continue;
    if (!call.answeredAt) answerCall(s, call.id);
    else endCall(s, call.id, { action: 'create', priority: s.incidents[call.incidentId]?.truePriority ?? 3 });
  }
  for (const inc of queue(s)) {
    if (inc.state === 'incoming') acknowledge(s, inc.id);
    if (!inc.assigned.length) {
      const recs = recommendUnits(s, inc.id).filter((x) => x.fit === 'ideal' || x.fit === 'need' || x.fit === 'weak');
      if (recs.length) dispatchUnits(s, inc.id, [recs[0].unit.id]);
    }
  }
}

/** The calls of a shift as the spawner made them (time, place, story, people), in order. */
function schedule(s: SimState, seen: Map<string, string>): void {
  for (const id of s.incidentOrder) {
    if (seen.has(id)) continue;
    const i: Incident = s.incidents[id];
    if (i.source === 'field') continue;
    seen.set(id, JSON.stringify([i.id, i.templateId, i.scenarioId, i.createdAt, i.location, i.truePriority, i.summary, i.caller?.name, i.persons.length, i.vehicles, i.falseAlarm]));
  }
}

function playFixed(o: NewShiftOptions, how: 'eager' | 'idle' | 'ragged'): string[] {
  const s = createShift(o);
  const seen = new Map<string, string>();
  const jitter = new Rng(99);
  while (s.now < o.start + o.hours * 3_600_000 && !s.ended) {
    step(s, how === 'ragged' ? jitter.range(300, 45_000) : MIN);
    schedule(s, seen);
    if (how !== 'idle') eager(s);
  }
  return [...seen.values()];
}

describe.skipIf(!ready)('fixed schedule (daily challenge)', () => {
  it('gives every player the same first 15 calls at the same times and places, whatever they do', { timeout: 120_000 }, () => {
    for (const [regionId, sector] of [
      ['louna', 'louna-tartu'],
      ['pohja', 'pohja-lasnamae'],
    ] as const) {
      const o = shiftOpts(regionId, { seed: 20261019, start: tallinnTime(2026, 10, 19, 16, 0), hours: 8, sectors: [sector], fixedSchedule: true });
      const busy = playFixed(o, 'eager');
      const idle = playFixed(o, 'idle');
      const ragged = playFixed(o, 'ragged'); // another frame rate and speed
      expect(busy.length, sector).toBeGreaterThanOrEqual(15);
      expect(idle.slice(0, 15), sector).toEqual(busy.slice(0, 15));
      expect(ragged.slice(0, 15), sector).toEqual(busy.slice(0, 15));
      // Without a fixed schedule the player's actions do move the calls.
      const free = { ...o, fixedSchedule: false };
      expect(playFixed(free, 'idle').slice(0, 15)).not.toEqual(playFixed(free, 'eager').slice(0, 15));
    }
  });

  it('keeps its own stream and numbers, and changes nothing without it', () => {
    const o = shiftOpts('ida', { sectors: ['ida-narva'] });
    const fixed = createShift({ ...o, fixedSchedule: true });
    expect(fixed.spawnRng).toBeTypeOf('number');
    expect(fixed.seq.incident).toBe(FIXED_FOLLOW_UP_SEQ);
    const plain = createShift(o);
    expect(plain.spawnRng).toBeUndefined();
    expect(plain.seq.incident).toBe(0);
    // The same start: units, weather, registry.
    expect(Object.keys(fixed.units)).toEqual(Object.keys(plain.units));
    expect(fixed.weather).toEqual(plain.weather);
    step(fixed, 3 * 60 * MIN);
    const ids = fixed.incidentOrder.filter((id) => fixed.incidents[id].source !== 'field');
    expect(ids.slice(0, 3)).toEqual(['i1', 'i2', 'i3']);
    expect(() => JSON.parse(JSON.stringify(fixed))).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const SAVES = join(__dirname, 'fixtures', 'saves');

function autosaves(): { name: string; sim: SimState }[] {
  const out: { name: string; sim: SimState }[] = [];
  for (const set of readdirSync(SAVES)) {
    for (const f of readdirSync(join(SAVES, set))) {
      if (!/autosave.*\.json$/.test(f)) continue;
      const sim = JSON.parse(readFileSync(join(SAVES, set, f), 'utf8')) as SimState;
      if (sim && typeof sim === 'object' && 'incidents' in sim) out.push({ name: `${set}/${f}`, sim });
    }
  }
  return out;
}

describe.skipIf(!ready)('older saves', () => {
  it('resume and play on without sectors, over the whole prefecture', () => {
    const saves = autosaves().filter((x) => !x.sim.ended);
    expect(saves.length).toBeGreaterThanOrEqual(2);
    for (const { name, sim } of saves) {
      expect(sim.sectors, name).toBeUndefined();
      expect(sim.spawnRng, name).toBeUndefined();
      const before = sim.incidentOrder.length;
      const seq = sim.seq.incident;
      step(sim, 3 * 60 * MIN);
      expect(sim.sectors, name).toBeUndefined();
      expect(sim.spawnRng, name).toBeUndefined();
      expect(areaCallFactor(sim), name).toBe(1);
      expect(sim.incidentOrder.length, name).toBeGreaterThan(before);
      // Numbering carries on from the save.
      expect(sim.incidentOrder.slice(before).every((id) => Number(id.slice(1)) > seq), name).toBe(true);
      const region = REGIONS[sim.regionId];
      const sectors = new Set(sim.incidentOrder.slice(before).map((id) => sectorOf(region, sim.incidents[id].location)));
      expect(sectors.size, name).toBeGreaterThan(1);
    }
  });

  it('a save naming a sector this version does not know (a rollback) or of another prefecture plays as the whole prefecture', () => {
    const calls = (s: SimState) => s.incidentOrder.map((id) => [id, s.incidents[id].templateId, s.incidents[id].location.address]);
    const whole = createShift(shiftOpts('pohja', { hours: 3 }));
    const later = createShift(shiftOpts('pohja', { hours: 3 }));
    later.sectors = ['pohja-tulevik'];
    const other = createShift(shiftOpts('pohja', { hours: 3 }));
    other.coverSectors = ['louna-tartu'];
    for (const s of [whole, later, other]) step(s, 3 * 60 * MIN);
    expect(whole.incidentOrder.length).toBeGreaterThan(5);
    // Before: an empty area view, every call at a generated rural address and none in Tallinn.
    expect(whole.incidentOrder.some((id) => whole.incidents[id].location.city === 'Tallinn')).toBe(true);
    expect(calls(later)).toEqual(calls(whole));
    expect(calls(other)).toEqual(calls(whole));
    expect(areaCallFactor(later)).toBe(1);
  });
});
