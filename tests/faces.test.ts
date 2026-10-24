/**
 * Photo portraits (src/data/faces.ts, src/gen/face.ts): everyone gets a face of the same sex and a close age, the
 * same hair colour and beard where the pool has one, always the same face for the same person, and nobody in a
 * shift shares a face while the pool lasts.
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACES, type FaceDef } from '@/data/faces';
import { faceFor, pickFace } from '@/gen/face';
import { createShift } from '@/sim/engine';
import { searchPersons } from '@/sim/registry';
import { tallinnTime } from '@/sim/time';

const POOL: FaceDef[] = [
  { id: 'm30brown', gender: 'M', age: 30, hair: 'brown', bald: false, beard: false, tone: 'light' },
  { id: 'm32beard', gender: 'M', age: 32, hair: 'brown', bald: false, beard: true, tone: 'light' },
  { id: 'm34blond', gender: 'M', age: 34, hair: 'blond', bald: false, beard: false, tone: 'light' },
  { id: 'm66grey', gender: 'M', age: 66, hair: 'grey', bald: false, beard: false, tone: 'light' },
  { id: 'm60bald', gender: 'M', age: 60, hair: 'brown', bald: true, beard: false, tone: 'light' },
  { id: 'f25red', gender: 'F', age: 25, hair: 'red', bald: false, beard: false, tone: 'light' },
  { id: 'f27blond', gender: 'F', age: 27, hair: 'blond', bald: false, beard: false, tone: 'medium' },
  { id: 'f72white', gender: 'F', age: 72, hair: 'white', bald: false, beard: false, tone: 'light' },
  { id: 'f12kid', gender: 'F', age: 12, hair: 'blond', bald: false, beard: false, tone: 'light' },
];

describe('photo portraits: picking a face', () => {
  it('keeps the sex and a close age', () => {
    for (let seed = 0; seed < 200; seed++) {
      const f = pickFace(seed, { gender: 'F', age: 26 }, POOL)!;
      expect(f.gender).toBe('F');
      expect(Math.abs(f.age - 26)).toBeLessThanOrEqual(4);
    }
    expect(pickFace(1, { gender: 'F', age: 11 }, POOL)?.id).toBe('f12kid');
  });

  it('matches hair colour, baldness and beard when it can', () => {
    expect(pickFace(3, { gender: 'M', age: 33, hairColor: 'blond' }, POOL)?.id).toBe('m34blond');
    expect(pickFace(3, { gender: 'M', age: 31, hairColor: 'brown', beard: 'full' }, POOL)?.id).toBe(
      'm32beard',
    );
    expect(pickFace(3, { gender: 'M', age: 62, hair: 'bald' }, POOL)?.id).toBe('m60bald');
    expect(pickFace(3, { gender: 'M', age: 64, hair: 'short', hairColor: 'white' }, POOL)?.id).toBe(
      'm66grey',
    );
  });

  it('gives a person the same face every time', () => {
    const q = { gender: 'M' as const, age: 31, hairColor: 'brown' as const };
    for (let seed = 0; seed < 50; seed++) expect(pickFace(seed, q, POOL)).toBe(pickFace(seed, q, POOL));
  });

  it('always finds a face while the pool has one, nearest age first', () => {
    expect(pickFace(1, { gender: 'M', age: 8 }, POOL)?.id).toBe('m30brown');
    expect(pickFace(1, { gender: 'F', age: 45 }, POOL)?.gender).toBe('F');
    expect(pickFace(1, { gender: 'M', age: 30 }, [])).toBeUndefined();
  });

  it('prefers a face nobody has yet, then reuses the least used', () => {
    const uses = new Map([['m30brown', 1]]);
    expect(pickFace(5, { gender: 'M', age: 30, hairColor: 'brown' }, POOL, uses)?.id).toBe('m32beard');
    const all = new Map(POOL.map((f) => [f.id, f.id === 'm34blond' ? 1 : 2]));
    expect(pickFace(5, { gender: 'M', age: 31 }, POOL, all)?.id).toBe('m34blond');
  });
});

describe('photo portraits: a shift', () => {
  // A big synthetic pool: 30 faces per sex and five-year band.
  const BIG: FaceDef[] = [];
  for (const g of ['M', 'F'] as const)
    for (let age = 2; age <= 92; age += 5)
      for (let i = 0; i < 30; i++)
        BIG.push({
          id: `${g}${age}-${i}`,
          gender: g,
          age: age + (i % 5),
          hair: (['brown', 'blond', 'black', 'grey', 'red'] as const)[i % 5],
          bald: i % 11 === 0,
          beard: g === 'M' && i % 3 === 0,
          tone: i % 20 === 0 ? 'medium' : 'light',
        });

  it('gives everyone a face of their sex, nobody the same one, the same on every call', () => {
    const s = createShift({
      seed: 4,
      regionId: 'pohja',
      mode: 'free',
      difficulty: 'normal',
      start: tallinnTime(2026, 10, 24, 12, 0),
      hours: 4,
      playerName: 'Test',
    });
    searchPersons(s, 'Tanel Padar');
    const people = Object.values(s.persons);
    expect(people.length).toBeGreaterThan(100);
    const faces = people.map((p) => faceFor(s, p, BIG));
    for (const [i, f] of faces.entries()) {
      expect(f, people[i].id).toBeDefined();
      expect(f!.gender).toBe(people[i].gender);
    }
    expect(new Set(faces.map((f) => f!.id)).size).toBe(people.length);
    // Same answer in any order of asking (another client, a reload).
    const again = [...people]
      .reverse()
      .map((p) => faceFor({ persons: { ...s.persons }, startTime: s.startTime }, p, BIG)?.id);
    expect(again.reverse()).toEqual(faces.map((f) => f!.id));
  });
});

describe('photo portraits: the shipped pool', () => {
  it('has a file for every face and sensible labels', () => {
    expect(new Set(FACES.map((f) => f.id)).size).toBe(FACES.length);
    for (const f of FACES) {
      expect(existsSync(`public/faces/${f.id}.webp`), f.id).toBe(true);
      expect(['M', 'F']).toContain(f.gender);
      expect(f.age).toBeGreaterThanOrEqual(1);
      expect(f.age).toBeLessThanOrEqual(100);
    }
  });
});
