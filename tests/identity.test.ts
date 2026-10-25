/**
 * Fixed identities (2.33.0): the same person keeps the same name and face. A callsign has the same day crew and
 * the same night crew in every shift; a prefecture has the same residents (names, codes, homes, cars) while their
 * warrants and court orders change from shift to shift; public figures, legends and crews keep one face each, and
 * residents keep theirs between shifts.
 */
import { describe, expect, it } from 'vitest';
import type { FaceDef } from '@/data/faces';
import { faceFor, officerFace } from '@/gen/face';
import { createShift } from '@/sim/engine';
import { searchPersons } from '@/sim/registry';
import { tallinnTime } from '@/sim/time';
import type { Difficulty, RegionId, SimState } from '@/sim/types';

function shift(
  seed: number,
  o: { regionId?: RegionId; hour?: number; day?: number; difficulty?: Difficulty } = {},
): SimState {
  return createShift({
    seed,
    regionId: o.regionId ?? 'louna',
    mode: 'free',
    difficulty: o.difficulty ?? 'normal',
    start: tallinnTime(2026, 10, o.day ?? 24, o.hour ?? 12, 0),
    hours: 4,
    playerName: 'Test',
  });
}

const crews = (s: SimState) =>
  Object.fromEntries(
    Object.values(s.units).map((u) => [
      u.callsign,
      u.crew.map((o) => `${o.firstName} ${o.lastName} #${o.badge} ${o.avatarSeed}`),
    ]),
  );

const residents = (s: SimState) =>
  Object.values(s.persons)
    .filter((p) => /^p\d+$/.test(p.id) && Number(p.id.slice(1)) <= 150)
    .map((p) => `${p.firstName} ${p.lastName} ${p.idcode} ${p.address} ${p.vehicles.join(',')}`);

describe('fixed identities: crews', () => {
  it('give a callsign the same crew in every day shift, whatever the seed, date or difficulty', () => {
    const a = crews(shift(1));
    const b = crews(shift(987, { day: 26, difficulty: 'veteran' }));
    const shared = Object.keys(a).filter((c) => c in b);
    expect(shared.length).toBeGreaterThan(5);
    for (const c of shared) expect(b[c], c).toEqual(a[c]);
  });

  it('give the night its own crews', () => {
    const day = crews(shift(1));
    const night = crews(shift(1, { hour: 23 }));
    const shared = Object.keys(day).filter((c) => c in night);
    expect(shared.length).toBeGreaterThan(3);
    expect(shared.some((c) => day[c].join() !== night[c].join())).toBe(true);
    expect(crews(shift(55, { hour: 23, day: 27 }))).toEqual(night);
  });
});

describe('fixed identities: residents', () => {
  it('are the same people with the same codes, homes and cars in every shift of a prefecture', () => {
    const a = shift(1);
    const b = shift(4242, { day: 27, hour: 20 });
    expect(residents(a).length).toBe(150);
    expect(residents(b)).toEqual(residents(a));
    const plates = (s: SimState) =>
      Object.values(s.vehicles)
        .filter((v) => v.ownerId && /^p\d+$/.test(v.ownerId))
        .map((v) => `${v.plate} ${v.make} ${v.model}`);
    expect(plates(b)).toEqual(plates(a));
  });

  it('differ between prefectures', () => {
    expect(residents(shift(1, { regionId: 'pohja' }))).not.toEqual(residents(shift(1)));
  });

  it('change warrants and court orders from shift to shift', () => {
    const wanted = (s: SimState) =>
      Object.values(s.persons)
        .filter((p) => /^p\d+$/.test(p.id) && p.flags.wanted)
        .map((p) => p.idcode)
        .sort();
    const sets = [1, 2, 3, 4, 5, 6].map((seed) => wanted(shift(seed)).join());
    expect(new Set(sets).size).toBeGreaterThan(1);
  });
});

describe('fixed identities: faces', () => {
  const POOL: FaceDef[] = [];
  for (const g of ['M', 'F'] as const)
    for (let age = 2; age <= 92; age += 5)
      for (let i = 0; i < 80; i++)
        POOL.push({
          id: `${g}${age}-${i}`,
          gender: g,
          age: age + (i % 5),
          hair: (['brown', 'blond', 'black', 'grey', 'red'] as const)[i % 5],
          bald: i % 11 === 0,
          beard: g === 'M' && i % 3 === 0,
          tone: 'light',
        });

  it('give a public figure the same face in any shift, found in any order', () => {
    const a = shift(1);
    searchPersons(a, 'Kaja Kallas');
    searchPersons(a, 'Tanel Padar');
    const b = shift(9, { regionId: 'ida' });
    searchPersons(b, 'Tanel Padar');
    const padar = (s: SimState) =>
      faceFor(
        s,
        Object.values(s.persons).find((p) => p.lastName === 'Padar')!,
        POOL,
      )!.id;
    expect(padar(b)).toBe(padar(a));
  });

  it('give a crew member the same face in every shift, and residents theirs', () => {
    const a = shift(1);
    const b = shift(777, { day: 28 });
    const oa = Object.values(a.units)[0].crew[0];
    const ob = Object.values(b.units).find((u) => u.callsign === Object.values(a.units)[0].callsign)!.crew[0];
    expect(officerFace(ob, POOL)!.id).toBe(officerFace(oa, POOL)!.id);
    const faces = (s: SimState) =>
      Object.values(s.persons)
        .filter((p) => /^p\d+$/.test(p.id) && Number(p.id.slice(1)) <= 150)
        .map((p) => faceFor(s, p, POOL)!.id);
    expect(faces(b)).toEqual(faces(a));
  });

  it('give the crews a shift shows a face each, mostly light-skinned like the drawn avatars, from the shipped pool', () => {
    for (const s of [shift(1, { regionId: 'pohja' }), shift(1, { regionId: 'pohja', hour: 23 }), shift(2)]) {
      const faces = Object.values(s.units).flatMap((u) => u.crew.map((o) => officerFace(o)!));
      expect(new Set(faces.map((f) => f.id)).size).toBe(faces.length);
      expect(faces.filter((f) => f.tone === 'light').length / faces.length).toBeGreaterThan(0.85);
    }
  });

  it('keep the faces of fixed people apart from everyone else in a shift', () => {
    const s = shift(3);
    searchPersons(s, 'Ott Tänak');
    const fixed = new Set([
      ...Object.values(s.units).flatMap((u) => u.crew.map((o) => officerFace(o, POOL)!.id)),
      ...Object.values(s.persons)
        .filter((p) => !/^p\d+$/.test(p.id))
        .map((p) => faceFor(s, p, POOL)!.id),
    ]);
    const others = Object.values(s.persons)
      .filter((p) => /^p\d+$/.test(p.id))
      .map((p) => faceFor(s, p, POOL)!.id);
    expect(others.filter((id) => fixed.has(id))).toEqual([]);
    expect(new Set(others).size).toBe(others.length);
  });
});
