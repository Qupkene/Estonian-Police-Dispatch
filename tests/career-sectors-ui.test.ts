// Career screens' sector helpers (src/ui/screens/career/sectors.ts) and the game's help tag, on a small
// fixture of Lõuna sectors so they do not depend on the shape of the real data.
import { describe, expect, it, vi } from 'vitest';
import type { CareerProfile, RosterUnit, SectorDef } from '@/sim/types';

vi.mock('@/data/sectors', async (importOriginal) => {
  const T = (et: string, en = et) => ({ et, en });
  const colleague = (firstName: string, lastName: string) => ({ firstName, lastName, gender: 'F' as const });
  const SECTORS: SectorDef[] = [
    {
      id: 'louna-tartu',
      regionId: 'louna',
      name: T('Tartu linn', 'Tartu city'),
      short: 'TARTU',
      match: { towns: ['Tartu'] },
      stationIds: ['lo-tartu'],
      neighbours: ['louna-tartumaa'],
      starter: { difficulty: 'normal' },
      blurb: T('Ülikoolilinn.'),
      traits: [T('Tudengid', 'Students')],
      colleague: colleague('Kadri', 'Kask'),
    },
    {
      id: 'louna-tartumaa',
      regionId: 'louna',
      name: T('Tartumaa ja Elva', 'Tartu County and Elva'),
      short: 'TARTUMAA',
      match: { counties: ['Tartu maakond'] },
      stationIds: ['lo-tartu'],
      posts: [{ stationId: 'lo-elva', price: 12000, upkeep: 700 }],
      neighbours: ['louna-tartu', 'louna-viljandi'],
      blurb: T('Maakond.'),
      traits: [],
      colleague: colleague('Mart', 'Mänd'),
    },
    {
      id: 'louna-viljandi',
      regionId: 'louna',
      name: T('Viljandimaa'),
      short: 'VILJANDI',
      match: { counties: ['Viljandi maakond'] },
      stationIds: ['lo-viljandi'],
      neighbours: ['louna-tartumaa'],
      starter: { difficulty: 'easy' },
      blurb: T('Rahulik.'),
      traits: [],
      colleague: colleague('Maarja', 'Tamm'),
    },
  ];
  // The real populations and districts, the fixture's sectors.
  return { ...(await importOriginal<typeof import('@/data/sectors')>()), SECTORS };
});

const { careerShiftArea, colleagueName, coverageOf, postRows, rosterByStation, sectorMapGeometry, sectorRows, unlockedOrder, prefectureBounds } = await import(
  '@/ui/screens/career/sectors'
);
const { helpSectorId } = await import('@/ui/game/format');

function profile(over: Partial<CareerProfile> = {}): CareerProfile {
  return {
    version: 1,
    name: 'Mari Maasikas',
    badge: '123',
    regionId: 'louna',
    createdAt: 0,
    seed: 1,
    day: 1,
    money: 20000,
    reputation: 25,
    xp: 0,
    staff: [],
    fleet: [],
    upgrades: [],
    ledger: [],
    recruits: [],
    history: [],
    achievements: [],
    unlockedRegions: ['louna'],
    stats: { shifts: 0, incidents: 0, arrests: 0, bestScore: 0, pursuitsCaught: 0 },
    ...over,
  };
}

describe('the career area', () => {
  it('sorts the sectors by what they are to the career', () => {
    const p = profile({ sectors: { louna: ['louna-tartu'] }, sectorsChangedDay: 1 });
    expect(sectorRows(p, 'louna').map((r) => [r.sector.id, r.state])).toEqual([
      ['louna-tartu', 'covered'],
      ['louna-tartumaa', 'neighbour'],
      ['louna-viljandi', 'later'],
    ]);
    const offered = profile({ ...p, offer: { regionId: 'louna', choices: ['louna-tartumaa'], day: 4 } });
    expect(sectorRows(offered, 'louna')[1]).toMatchObject({ state: 'offered', colleague: 'Mart Mänd' });
    expect(colleagueName(undefined)).toBe('');
  });

  it('counts the coverage, whole for a career from before sectors', () => {
    const p = profile({ sectors: { louna: ['louna-tartu'] }, sectorsChangedDay: 1 });
    expect(coverageOf(p, 'louna')).toMatchObject({ covered: 1, total: 3, whole: false, names: [{ et: 'Tartu linn', en: 'Tartu city' }] });
    const old = profile();
    expect(coverageOf(old, 'louna')).toMatchObject({ covered: 3, total: 3, whole: true, names: [] });
  });

  it('lists the posts of the covered sectors with their station', () => {
    expect(postRows(profile({ sectors: { louna: ['louna-tartu'] } }), 'louna')).toEqual([]);
    const p = profile({ sectors: { louna: ['louna-tartu', 'louna-tartumaa'] } });
    const rows = postRows(p, 'louna');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stationId: 'lo-elva', price: 12000, upkeep: 700, open: false });
    expect(rows[0].station?.short).toBe('Elva PP');
    expect(postRows({ ...p, openPosts: ['lo-elva'] }, 'louna')[0].open).toBe(true);
  });

  it('passes the area to a career shift, nothing for a whole prefecture', () => {
    const p = profile({ sectors: { louna: ['louna-tartu', 'louna-tartumaa'] }, openPosts: ['lo-elva', 'lo-elva', 'po-kesklinn'], sectorsChangedDay: 1 });
    expect(careerShiftArea(p, 'louna')).toEqual({ sectors: ['louna-tartu', 'louna-tartumaa'], posts: ['lo-elva'], cover: [] });
    expect(careerShiftArea(profile(), 'louna')).toEqual({ sectors: [], posts: [], cover: [] });
    const all = profile({ sectors: { louna: ['louna-tartu', 'louna-tartumaa', 'louna-viljandi'] }, sectorsChangedDay: 1 });
    expect(careerShiftArea(all, 'louna').sectors).toEqual([]);
    // A prefecture without sector data is always whole.
    expect(careerShiftArea(profile({ regionId: 'ida', unlockedRegions: ['ida'], sectors: { ida: [] } }), 'ida').sectors).toEqual([]);
  });

  it('lists the home prefecture first', () => {
    expect(unlockedOrder({ regionId: 'laane', unlockedRegions: ['pohja', 'laane', 'louna'] })).toEqual(['laane', 'pohja', 'louna']);
  });

  it('groups the roster by station in the order of the region data', () => {
    const u = (callsign: string, stationId: string): RosterUnit => ({ callsign, type: 'patrol', stationId, vehicle: 'Škoda', crew: [] });
    const groups = rosterByStation('louna', [u('A', 'lo-elva'), u('B', 'lo-tartu'), u('C', 'lo-elva'), u('D', 'nowhere')]);
    expect(groups.map((g) => [g.stationId, g.units.map((x) => x.callsign)])).toEqual([
      ['lo-tartu', ['B']],
      ['lo-elva', ['A', 'C']],
      ['nowhere', ['D']],
    ]);
    expect(groups[0].name.et).toContain('Tartu');
    expect(groups[2].name).toEqual({ et: 'nowhere', en: 'nowhere' });
  });

  it('draws the prefecture map from its counties', () => {
    const [[w, s], [e, n]] = prefectureBounds('louna');
    expect(w).toBeLessThan(26);
    expect(e).toBeGreaterThan(27.5);
    expect(s).toBeLessThan(57.6);
    expect(n).toBeGreaterThan(58.8);
    const g = sectorMapGeometry('louna', 300);
    expect(g.width).toBe(300);
    expect(g.height).toBeGreaterThan(100);
    expect(g.land.startsWith('M')).toBe(true);
    expect(new Set(g.shapes.map((x) => x.id))).toEqual(new Set(['louna-tartu', 'louna-tartumaa', 'louna-viljandi']));
    for (const shape of g.shapes) {
      expect(shape.d.startsWith('M')).toBe(true);
      expect(shape.area).toBeGreaterThan(0);
    }
    // Largest first, so a city sector is painted over its county.
    for (let i = 1; i < g.shapes.length; i++) expect(g.shapes[i - 1].area).toBeGreaterThanOrEqual(g.shapes[i].area);
    expect(sectorMapGeometry('louna', 300)).toBe(g);
  });

  it("passes tonight's cover only for sectors of the prefecture the career does not cover", () => {
    const p = profile({ sectors: { louna: ['louna-tartu'] }, sectorsChangedDay: 1 });
    expect(careerShiftArea(p, 'louna', ['louna-viljandi', 'louna-tartu', 'pohja-kesklinn', 'louna-viljandi']).cover).toEqual(['louna-viljandi']);
    expect(careerShiftArea(profile(), 'louna', ['louna-viljandi']).cover).toEqual([]);
  });
});

describe('help requests in the game', () => {
  it('reads the sector of a colleague asking for help', () => {
    expect(helpSectorId({ tags: ['class:ok', 'help:louna-viljandi'] })).toBe('louna-viljandi');
    expect(helpSectorId({ tags: ['class:ok'] })).toBeNull();
    expect(helpSectorId({ tags: [] })).toBeNull();
  });
});
