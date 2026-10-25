/**
 * Profiilipildi otsing (src/gen/faceSearch.ts, 2.35.0): a written wish in Estonian or English becomes a filter,
 * the filter finds the fitting faces of the pool best first, and a stored avatar means the same picture everywhere.
 */
import { describe, expect, it } from 'vitest';
import { FACES, type FaceDef } from '@/data/faces';
import {
  avatarValue,
  isEmptyFilter,
  mergeFilters,
  nameSeed,
  parseFaceQuery,
  playerPicture,
  searchFaces,
} from '@/gen/faceSearch';

const POOL: FaceDef[] = [
  { id: 'aaaaaaaaa1', gender: 'F', age: 29, hair: 'blond', bald: false, beard: false, tone: 'light' },
  { id: 'aaaaaaaaa2', gender: 'F', age: 33, hair: 'blond', bald: false, beard: false, tone: 'light' },
  { id: 'aaaaaaaaa3', gender: 'F', age: 62, hair: 'grey', bald: false, beard: false, tone: 'light' },
  { id: 'aaaaaaaaa4', gender: 'M', age: 45, hair: 'brown', bald: false, beard: true, tone: 'light' },
  { id: 'aaaaaaaaa5', gender: 'M', age: 52, hair: 'brown', bald: true, beard: false, tone: 'light' },
  { id: 'aaaaaaaaa6', gender: 'M', age: 8, hair: 'blond', bald: false, beard: false, tone: 'light' },
  { id: 'aaaaaaaaa7', gender: 'M', age: 70, hair: 'white', bald: false, beard: true, tone: 'light' },
];
const ids = (fs: FaceDef[]) => fs.map((f) => f.id.slice(-1));

describe('profile picture search: the written wish', () => {
  it('reads sex, age, hair, beard and baldness in Estonian and English', () => {
    expect(parseFaceQuery('naine 30 blond')).toEqual({
      gender: 'F',
      ageMin: 26,
      ageMax: 34,
      hair: ['blond'],
    });
    expect(parseFaceQuery('Vana mees habemega')).toEqual({
      gender: 'M',
      ageMin: 60,
      ageMax: 120,
      beard: true,
    });
    expect(parseFaceQuery('kiilas 50ndad')).toEqual({ ageMin: 50, ageMax: 59, bald: true });
    expect(parseFaceQuery('tüdruk')).toEqual({ gender: 'F', ageMin: 3, ageMax: 15 });
    expect(parseFaceQuery('old bald man')).toEqual({ gender: 'M', ageMin: 60, ageMax: 120, bald: true });
    expect(parseFaceQuery('woman 30s red')).toEqual({ gender: 'F', ageMin: 30, ageMax: 39, hair: ['red'] });
    expect(parseFaceQuery('hallide juustega naine 40-55')).toEqual({
      gender: 'F',
      ageMin: 40,
      ageMax: 55,
      hair: ['grey', 'white'],
    });
    expect(parseFaceQuery('tume habetu')).toEqual({ hair: ['black', 'brown'], beard: false });
    expect(parseFaceQuery('33-aastane')).toEqual({ ageMin: 29, ageMax: 37 });
    // Words it does not know change nothing.
    expect(parseFaceQuery('lahe tüüp prillidega')).toEqual({});
    expect(isEmptyFilter(parseFaceQuery(''))).toBe(true);
  });

  it('lets the text win over the chips', () => {
    expect(mergeFilters({ gender: 'M', beard: true }, parseFaceQuery('naine'))).toEqual({
      gender: 'F',
      beard: true,
    });
  });
});

describe('profile picture search: the faces', () => {
  it('finds the fitting faces, the middle of the asked ages first', () => {
    // Without an age, grown-ups first: the faces nearest 32 lead.
    expect(ids(searchFaces(parseFaceQuery('naine blond'), POOL).faces)).toEqual(['2', '1']);
    expect(ids(searchFaces(parseFaceQuery('naine 31'), POOL).faces)).toEqual(['1', '2']);
    expect(ids(searchFaces(parseFaceQuery('mees habemega'), POOL).faces)).toEqual(['4', '7']);
    expect(ids(searchFaces(parseFaceQuery('kiilas'), POOL).faces)).toEqual(['5']);
    expect(ids(searchFaces(parseFaceQuery('laps'), POOL).faces)).toEqual(['6']);
    expect(searchFaces({}, POOL).faces).toHaveLength(POOL.length);
  });

  it('shows the nearest ages when nobody has the asked ones', () => {
    const r = searchFaces(parseFaceQuery('naine 45'), POOL);
    expect(r.nearest).toBe(true);
    expect(ids(r.faces)).toEqual(['2', '1', '3']);
    expect(searchFaces(parseFaceQuery('naine habemega'), POOL)).toEqual({ faces: [], nearest: false });
  });

  it('finds something for the common wishes in the shipped pool', () => {
    for (const q of [
      'mees 30',
      'naine 30',
      'mees habemega',
      'naine blond',
      'vana mees',
      'laps',
      'kiilas mees',
    ])
      expect(searchFaces(parseFaceQuery(q)).faces.length, q).toBeGreaterThan(0);
  });
});

describe('profile picture: the stored value', () => {
  it('means the same picture everywhere, and the name’s drawing by default', () => {
    const face = FACES[0];
    const picked = playerPicture(`face:${face.id}`, 'Mari');
    expect(picked).toEqual({ kind: 'face', face });
    expect(avatarValue(picked)).toBe(`face:${face.id}`);
    expect(playerPicture('draw:12345', 'Mari')).toEqual({ kind: 'draw', seed: 12345 });
    expect(avatarValue({ kind: 'draw', seed: 12345 })).toBe('draw:12345');
    expect(playerPicture('', 'Mari')).toEqual({ kind: 'draw', seed: nameSeed('Mari') });
    expect(playerPicture(undefined, 'Mari')).toEqual(playerPicture('', 'Mari'));
    // A face the pool no longer has, or nonsense: the drawing of the name.
    expect(playerPicture('face:ffffffffff', 'Mari')).toEqual({ kind: 'draw', seed: nameSeed('Mari') });
    expect(playerPicture('javascript:alert(1)', 'Mari')).toEqual({ kind: 'draw', seed: nameSeed('Mari') });
    expect(nameSeed('Mari')).not.toBe(nameSeed('Jüri'));
  });
});
