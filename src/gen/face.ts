/**
 * Photo portraits (src/data/faces.ts) for everyone in the game. A face has the same sex and an age close to the
 * person's, and where the pool allows the same hair colour, baldness and beard. The skin tones follow the drawn
 * avatars' mix (mostly Northern European with some variety). `faceFor` keeps faces apart within a shift: people get
 * faces in the order they joined the shift, each the best one nobody has yet, so the result is the same on every
 * client and after a reload. Officers and anyone outside a shift get `pickFace` by their avatar seed.
 */
import { FACES, type FaceDef, type FaceTone } from '@/data/faces';
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

/**
 * The best face for a person, or undefined only when the pool is empty. `uses` counts faces already given out:
 * an unused face of a close age wins, then a reused one of a close age, then the closest age there is.
 */
export function pickFace(
  seed: number,
  q: FaceQuery,
  pool: readonly FaceDef[] = FACES,
  uses?: ReadonlyMap<string, number>,
): FaceDef | undefined {
  if (!pool.length) return undefined;
  const same = pool.filter((f) => f.gender === q.gender);
  const base = same.length ? same : pool;
  const used = (f: FaceDef) => uses?.get(f.id) ?? 0;
  const tol = Math.max(4, q.age * 0.12);
  const within = (k: number) => base.filter((f) => Math.abs(f.age - q.age) <= tol * k);
  let near = within(1).filter((f) => !used(f));
  if (!near.length) near = within(2).filter((f) => !used(f));
  if (!near.length) {
    const close = within(1);
    if (close.length) {
      const least = Math.min(...close.map(used));
      near = close.filter((f) => used(f) === least);
    } else {
      const d = Math.min(...base.map((f) => Math.abs(f.age - q.age)));
      near = base.filter((f) => Math.abs(f.age - q.age) <= d + 2);
    }
  }
  const best = Math.max(...near.map((f) => hairScore(f, q)));
  const top = near.filter((f) => hairScore(f, q) >= best - 0.5);
  const r = new Rng(seed ^ 0x5eed_face);
  return r.weighted(top, (f) => TONE_WEIGHT[f.tone]);
}

function queryOf(p: Person, at: number): FaceQuery {
  const born = Date.parse(`${p.birthDate}T12:00:00Z`);
  const age = Number.isFinite(born) ? Math.max(0, Math.floor((at - born) / (365.25 * 86_400_000))) : 35;
  return {
    gender: p.gender,
    age,
    hair: p.appearance?.hair,
    hairColor: p.appearance?.hairColor,
    beard: p.appearance?.beard,
  };
}

interface Assignment {
  pool: readonly FaceDef[];
  byPerson: Map<string, FaceDef>;
  uses: Map<string, number>;
}

const ASSIGNED = new WeakMap<object, Assignment>();

/** The face of a person in a shift, different from everyone else's in it while the pool lasts. */
export function faceFor(
  sim: { persons: Record<string, Person>; startTime: number },
  p: Person,
  pool: readonly FaceDef[] = FACES,
): FaceDef | undefined {
  if (!pool.length) return undefined;
  if (sim.persons[p.id] !== p) return pickFace(p.avatarSeed, queryOf(p, sim.startTime), pool);
  let a = ASSIGNED.get(sim.persons);
  if (!a || a.pool !== pool) {
    a = { pool, byPerson: new Map(), uses: new Map() };
    ASSIGNED.set(sim.persons, a);
  }
  if (!a.byPerson.has(p.id)) {
    for (const [id, q] of Object.entries(sim.persons)) {
      if (a.byPerson.has(id)) continue;
      const f = pickFace(q.avatarSeed, queryOf(q, sim.startTime), pool, a.uses);
      if (!f) continue;
      a.byPerson.set(id, f);
      a.uses.set(f.id, (a.uses.get(f.id) ?? 0) + 1);
    }
  }
  return a.byPerson.get(p.id);
}

/** Where a face is served. */
export function faceUrl(f: FaceDef): string {
  return `${import.meta.env.BASE_URL}faces/${f.id}.webp`;
}
