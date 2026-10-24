/**
 * Photo portraits (src/data/faces.ts) for everyone in the game, the same face for the same person every time.
 * A face has the same sex and an age close to the person's, and where the pool allows the same hair colour,
 * baldness and beard; the skin tones follow the drawn avatars' mix (mostly Northern European with some variety).
 *
 * Half the pool is kept for people who are the same in every shift: the public figures, the 2025 legends and the
 * crews (src/sim/units.ts crewRng). Their faces are handed out once, in a fixed order, so nobody shares one while
 * the half lasts. The other half goes to a shift's residents and the people of its calls, in the order they joined
 * the shift (residents first, always in the same order), each one nobody in the shift has yet.
 */
import { CELEBRITIES } from '@/data/celebrities';
import { FACES, type FaceDef, type FaceTone } from '@/data/faces';
import { REGIONS } from '@/data/regions';
import { Rng, hashString } from '@/sim/rng';
import type { Appearance, Gender, Officer, Person } from '@/sim/types';
import { crewRng, generateOfficer } from '@/sim/units';

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

/** The half of a pool kept for the people who are the same in every shift. */
const kept = (f: FaceDef) => (hashString(f.id) & 1) === 1;

interface Split {
  fixed: readonly FaceDef[];
  open: readonly FaceDef[];
  /** Face per public figure / legend id and per crew member's name. */
  byKey: Map<string, FaceDef>;
}

const SPLITS = new WeakMap<readonly FaceDef[], Split>();

const crewKey = (o: Pick<Officer, 'firstName' | 'lastName'>) => `crew:${o.firstName} ${o.lastName}`;

/** The age a crew member's face shows (as the drawn avatar does). */
const crewAge = (o: Pick<Officer, 'years'>) => Math.min(62, 22 + o.years);

function split(pool: readonly FaceDef[]): Split {
  let sp = SPLITS.get(pool);
  if (sp) return sp;
  const fixed = pool.filter(kept);
  const open = pool.filter((f) => !kept(f));
  const byKey = new Map<string, FaceDef>();
  const uses = new Map<string, number>();
  const give = (key: string, seed: number, q: FaceQuery) => {
    if (byKey.has(key)) return;
    const f = pickFace(seed, q, fixed.length ? fixed : pool, uses);
    if (!f) return;
    byKey.set(key, f);
    uses.set(f.id, (uses.get(f.id) ?? 0) + 1);
  };
  // Public figures (their age in the year the people were set), the legends, then every crew in every prefecture.
  for (const c of CELEBRITIES)
    give(`vip-${c.nr}`, hashString(`vip-avatar-${c.nr}`), {
      gender: c.gender,
      age: 2026 - Number(c.born.slice(0, 4)),
    });
  give('legend-okimum', 2025_0001, { gender: 'M', age: 22, hair: 'short', hairColor: 'brown' });
  give('legend-sarmert', 2025_0438, {
    gender: 'M',
    age: 38,
    hair: 'curly',
    hairColor: 'grey',
    beard: 'full',
  });
  for (const id of Object.keys(REGIONS).sort()) {
    const region = REGIONS[id as keyof typeof REGIONS];
    for (const u of region.roster) {
      for (const shift of ['day', 'night'] as const) {
        if ((u.shift ?? 'both') !== 'both' && u.shift !== shift) continue;
        for (let k = 0; k < Math.max(1, u.crew ?? 2); k++) {
          const o = generateOfficer(
            crewRng(region.id, u.callsign, shift, k),
            region,
            u.type,
            k,
            'face',
            new Set(),
            u.crewNames?.[k],
          );
          give(crewKey(o), o.avatarSeed, { gender: o.gender, age: crewAge(o) });
        }
      }
    }
  }
  sp = { fixed, open, byKey };
  SPLITS.set(pool, sp);
  return sp;
}

interface Assignment {
  byPerson: Map<string, FaceDef>;
  uses: Map<string, number>;
}

const ASSIGNED = new WeakMap<object, Map<readonly FaceDef[], Assignment>>();

/** The face of a person: their own if they are the same in every shift, else one nobody in the shift has yet. */
export function faceFor(
  sim: { persons: Record<string, Person>; startTime: number },
  p: Person,
  pool: readonly FaceDef[] = FACES,
): FaceDef | undefined {
  if (!pool.length) return undefined;
  const sp = split(pool);
  const own = sp.byKey.get(p.id);
  if (own) return own;
  const open = sp.open.length ? sp.open : pool;
  if (sim.persons[p.id] !== p) return pickFace(p.avatarSeed, queryOf(p, sim.startTime), open);
  let byPool = ASSIGNED.get(sim.persons);
  if (!byPool) ASSIGNED.set(sim.persons, (byPool = new Map()));
  let a = byPool.get(pool);
  if (!a) byPool.set(pool, (a = { byPerson: new Map(), uses: new Map() }));
  if (!a.byPerson.has(p.id)) {
    for (const [id, q] of Object.entries(sim.persons)) {
      if (a.byPerson.has(id) || sp.byKey.has(id)) continue;
      const f = pickFace(q.avatarSeed, queryOf(q, sim.startTime), open, a.uses);
      if (!f) continue;
      a.byPerson.set(id, f);
      a.uses.set(f.id, (a.uses.get(f.id) ?? 0) + 1);
    }
  }
  return a.byPerson.get(p.id);
}

/** A crew member's face: the same one in every shift (career staff keep theirs by their avatar seed). */
export function officerFace(
  o: Pick<Officer, 'firstName' | 'lastName' | 'avatarSeed' | 'gender' | 'years'>,
  pool: readonly FaceDef[] = FACES,
): FaceDef | undefined {
  if (!pool.length) return undefined;
  const sp = split(pool);
  return (
    sp.byKey.get(crewKey(o)) ??
    pickFace(o.avatarSeed, { gender: o.gender, age: crewAge(o) }, sp.fixed.length ? sp.fixed : pool)
  );
}

/** Where a face is served. */
export function faceUrl(f: FaceDef): string {
  return `${import.meta.env.BASE_URL}faces/${f.id}.webp`;
}
