/**
 * Photo portraits (src/data/faces.ts, src/gen/face.ts): a made-up person gets a face of the same sex and a close
 * age, the same hair colour and beard where the pool has one, always the same face for the same person, and the
 * drawing when nothing fits. Public figures and the 2025 legends keep their drawings.
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACES, type FaceDef } from '@/data/faces';
import { hasPhoto, pickFace } from '@/gen/face';

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
    expect(pickFace(3, { gender: 'M', age: 31, hairColor: 'brown', beard: 'full' }, POOL)?.id).toBe('m32beard');
    expect(pickFace(3, { gender: 'M', age: 62, hair: 'bald' }, POOL)?.id).toBe('m60bald');
    expect(pickFace(3, { gender: 'M', age: 64, hair: 'short', hairColor: 'white' }, POOL)?.id).toBe('m66grey');
  });

  it('gives a person the same face every time', () => {
    const q = { gender: 'M' as const, age: 31, hairColor: 'brown' as const };
    for (let seed = 0; seed < 50; seed++) expect(pickFace(seed, q, POOL)).toBe(pickFace(seed, q, POOL));
  });

  it('falls back to the drawing when nothing fits', () => {
    expect(pickFace(1, { gender: 'M', age: 8 }, POOL)).toBeUndefined();
    expect(pickFace(1, { gender: 'F', age: 45 }, POOL)).toBeUndefined();
    expect(pickFace(1, { gender: 'M', age: 30 }, [])).toBeUndefined();
  });

  it('leaves public figures and the legends their drawings', () => {
    expect(hasPhoto({ id: 'p12' })).toBe(true);
    expect(hasPhoto({ id: 'vip-101' })).toBe(false);
    expect(hasPhoto({ id: 'legend-okimum' })).toBe(false);
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
