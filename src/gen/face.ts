/**
 * Pick a photo portrait (src/data/faces.ts) for a made-up person: the same sex, an age close to theirs, and where
 * the pool allows the same hair colour, baldness and beard. The skin tones follow the drawn avatars' mix (mostly
 * Northern European with some variety). Deterministic per avatar seed, so a person keeps their face. Undefined when
 * nothing fits; the drawn avatar is used then.
 */
import { FACES, type FaceDef, type FaceTone } from '@/data/faces';
import { isCelebrity } from '@/sim/celebrities';
import { Rng } from '@/sim/rng';
import type { Appearance, Gender, Person } from '@/sim/types';

export interface FaceQuery {
  gender: Gender;
  age: number;
  hair?: Appearance['hair'];
  hairColor?: Appearance['hairColor'];
  beard?: Appearance['beard'];
}

/** Same weights as the light, medium and dark ends of the drawn avatars' skin palette (src/gen/avatar.ts). */
const TONE_WEIGHT: Record<FaceTone, number> = { light: 16, medium: 0.5, dark: 0.25 };

const GREYISH = new Set<Appearance['hairColor']>(['grey', 'white']);

function hairScore(f: FaceDef, q: FaceQuery): number {
  let s = 0;
  if (q.hair === 'bald' || q.hair === 'shaved') s += f.bald ? 2 : 0;
  else if (f.bald) s -= 2;
  if (q.hairColor && q.hairColor !== 'dyed') {
    if (f.hair === q.hairColor) s += 2;
    else if (GREYISH.has(f.hair) && GREYISH.has(q.hairColor)) s += 1.5;
  }
  if (q.gender === 'M') s += !!q.beard === f.beard ? 1 : 0;
  return s;
}

export function pickFace(seed: number, q: FaceQuery, pool: readonly FaceDef[] = FACES): FaceDef | undefined {
  const same = pool.filter((f) => f.gender === q.gender);
  if (!same.length) return undefined;
  const tol = Math.max(4, q.age * 0.12);
  let near = same.filter((f) => Math.abs(f.age - q.age) <= tol);
  if (!near.length) near = same.filter((f) => Math.abs(f.age - q.age) <= tol * 2);
  if (!near.length) return undefined;
  const best = Math.max(...near.map((f) => hairScore(f, q)));
  const top = near.filter((f) => hairScore(f, q) >= best - 0.5);
  const r = new Rng(seed ^ 0x5eed_face);
  return r.weighted(top, (f) => TONE_WEIGHT[f.tone]);
}

/** Where a face is served. */
export function faceUrl(f: FaceDef): string {
  return `${import.meta.env.BASE_URL}faces/${f.id}.webp`;
}

/** Made-up civilians get a photo; public figures and the 2025 legends keep their drawing. */
export function hasPhoto(p: Pick<Person, 'id'>): boolean {
  return !isCelebrity(p) && !p.id.startsWith('legend-');
}
