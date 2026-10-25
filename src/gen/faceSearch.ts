/**
 * Profiilipildi otsing (2.35.0): a player looks for their profile picture among the game's photo portraits
 * (src/data/faces.ts) by writing what they want, in Estonian or English ("naine 30 blond", "vana mees habemega",
 * "kiilas 50ndad"), or with the picker's chips. Pure: the query in, the matching faces out, best first.
 */
import { FACES, type FaceDef } from '@/data/faces';
import type { Appearance, Gender } from '@/sim/types';

export type HairColor = Exclude<Appearance['hairColor'], 'dyed'>;

/** What a player asks for. Every field is optional; the chips and the text fill the same fields. */
export interface FaceFilter {
  gender?: Gender;
  /** Inclusive age range. */
  ageMin?: number;
  ageMax?: number;
  hair?: HairColor[];
  beard?: boolean;
  bald?: boolean;
}

/** Age bands of the picker's chips. */
export const AGE_BANDS = {
  child: [0, 12],
  teen: [13, 19],
  young: [18, 29],
  '30s': [30, 39],
  '40s': [40, 49],
  '50s': [50, 59],
  old: [60, 120],
} as const satisfies Record<string, readonly [number, number]>;
export type AgeBand = keyof typeof AGE_BANDS;

const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Words and what they ask for (folded: no diacritics, lower case). A word may set several fields. */
const WORDS: [RegExp, Partial<FaceFilter>][] = [
  [/^(mees|mehe|mehed|meest|mehi|man|men|male|harra)$/, { gender: 'M' }],
  [/^(naine|naise|naised|naist|naisi|woman|women|female|proua|daam)$/, { gender: 'F' }],
  [/^(poiss|poisi|boy)$/, { gender: 'M', ageMin: 3, ageMax: 15 }],
  [/^(tudruk|tudruku|girl)$/, { gender: 'F', ageMin: 3, ageMax: 15 }],
  [/^(laps|lapse|lapsed|child|kid|kids)$/, { ageMin: 0, ageMax: 12 }],
  [/^(teismeline|nooruk|teen|teenager)$/, { ageMin: 13, ageMax: 19 }],
  [/^(noor|noore|noored|young)$/, { ageMin: 18, ageMax: 30 }],
  [/^(keskealine|keskeas|middle)$/, { ageMin: 38, ageMax: 58 }],
  [/^(vana|vanem|vanema|eakas|eaka|pensionar|old|elderly|senior)$/, { ageMin: 60, ageMax: 120 }],
  [/^(blond|blondi|blonde|hele|heledad|heledate|heledajuukseline|valkjas)$/, { hair: ['blond'] }],
  [/^(pruun|pruunid|pruunide|brunett|brown|brunette)$/, { hair: ['brown'] }],
  [/^(must|mustad|mustade|black)$/, { hair: ['black'] }],
  [/^(tume|tumedad|tumedate|dark)$/, { hair: ['black', 'brown'] }],
  [/^(hall|hallid|hallide|hallipaine|grey|gray|hobe|hobedane)$/, { hair: ['grey', 'white'] }],
  [/^(valge|valged|valgete|white)$/, { hair: ['white', 'grey'] }],
  [/^(punane|punased|punaste|punapea|ruske|red|redhead|ginger)$/, { hair: ['red'] }],
  [/^(habe|habemega|habemik|habemed|beard|bearded|vuntsid|vuntsidega|moustache)$/, { beard: true }],
  [/^(habetu|raseeritud|clean|shaven|habemeta)$/, { beard: false }],
  [/^(kiilas|kiilaspea|kiilaspaine|bald|kiilaspaisus)$/, { bald: true }],
];

/**
 * A written query as a filter. Numbers are ages: "30" about 30 (26 to 34), "30ndad" or "30s" the thirties, "20-35"
 * a range. Unknown words are left out (the query is a wish, not a form).
 */
export function parseFaceQuery(query: string): FaceFilter {
  const out: FaceFilter = {};
  const text = fold(query);
  const range = text.match(/(\d{1,3})\s*(?:-|\.\.|kuni|to)\s*(\d{1,3})/);
  let rest = text;
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    out.ageMin = Math.min(a, b);
    out.ageMax = Math.max(a, b);
    rest = rest.replace(range[0], ' ');
  }
  for (const token of rest.split(/[^a-z0-9]+/).filter(Boolean)) {
    const decade = token.match(/^(\d)0(ndad|ndates|ndate|s)?$/);
    const age = token.match(/^(\d{1,3})(aastane|a)?$/);
    if (decade && decade[2]) {
      out.ageMin = Number(decade[1]) * 10;
      out.ageMax = out.ageMin + 9;
      continue;
    }
    if (age) {
      const n = Number(age[1]);
      out.ageMin = Math.max(0, n - 4);
      out.ageMax = n + 4;
      continue;
    }
    for (const [re, f] of WORDS) {
      if (!re.test(token)) continue;
      if (f.gender) out.gender = f.gender;
      if (f.ageMin !== undefined) out.ageMin = f.ageMin;
      if (f.ageMax !== undefined) out.ageMax = f.ageMax;
      if (f.hair) out.hair = [...new Set([...(out.hair ?? []), ...f.hair])];
      if (f.beard !== undefined) out.beard = f.beard;
      if (f.bald !== undefined) out.bald = f.bald;
      break;
    }
  }
  return out;
}

/** The chips' filter and the text's together: what the text says wins. */
export function mergeFilters(chips: FaceFilter, text: FaceFilter): FaceFilter {
  return { ...chips, ...Object.fromEntries(Object.entries(text).filter(([, v]) => v !== undefined)) };
}

/** Is the filter empty (everyone matches)? */
export const isEmptyFilter = (f: FaceFilter): boolean => Object.values(f).every((v) => v === undefined);

function matches(face: FaceDef, f: FaceFilter, ages: boolean): boolean {
  if (f.gender && face.gender !== f.gender) return false;
  if (ages && f.ageMin !== undefined && face.age < f.ageMin) return false;
  if (ages && f.ageMax !== undefined && face.age > f.ageMax) return false;
  if (f.hair?.length && !f.hair.includes(face.hair as HairColor)) return false;
  if (f.beard !== undefined && face.beard !== f.beard) return false;
  if (f.bald !== undefined && face.bald !== f.bald) return false;
  return true;
}

export interface FaceSearch {
  faces: FaceDef[];
  /** True when no face had the asked age, so the nearest ages are shown instead. */
  nearest: boolean;
}

/**
 * The faces that fit, best first: within the asked ages the middle of the range first (without an age, the faces
 * nearest 32); when no face has those ages, every other wish still holds and the nearest ages come first.
 */
export function searchFaces(f: FaceFilter, pool: readonly FaceDef[] = FACES): FaceSearch {
  const hasAge = f.ageMin !== undefined || f.ageMax !== undefined;
  // Without an age, grown-ups first (a profile picture is mostly of one): the faces nearest 32 lead.
  const mid = hasAge ? ((f.ageMin ?? 0) + (f.ageMax ?? (f.ageMin ?? 0) + 20)) / 2 : 32;
  const byAge = (a: FaceDef, b: FaceDef) =>
    Math.abs(a.age - mid) - Math.abs(b.age - mid) || (a.id < b.id ? -1 : 1);
  const exact = pool.filter((x) => matches(x, f, true)).sort(byAge);
  if (exact.length || !hasAge) return { faces: exact, nearest: false };
  const near = pool.filter((x) => matches(x, f, false)).sort(byAge);
  return { faces: near, nearest: near.length > 0 };
}

// ── The stored value ─────────────────────────────────────────────────────────

/** A player's profile picture: a face of the pool, a drawing with a seed, or the drawing of their name. */
export type PlayerPicture = { kind: 'face'; face: FaceDef } | { kind: 'draw'; seed: number };

const BY_ID = new Map(FACES.map((f) => [f.id, f]));

/** FNV-1a of the name: the seed of the drawing a player has before they choose a picture. */
export function nameSeed(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The picture a stored avatar means ('' or anything unknown: the drawing of the name; a face the pool no longer has:
 * the drawing too).
 */
export function playerPicture(
  avatar: string | undefined,
  name: string,
  pool: ReadonlyMap<string, FaceDef> = BY_ID,
): PlayerPicture {
  const m = /^(face|draw):([0-9a-f]+)$/.exec(avatar ?? '');
  if (m?.[1] === 'face') {
    const face = pool.get(m[2]);
    if (face) return { kind: 'face', face };
  }
  if (m?.[1] === 'draw' && /^\d{1,10}$/.test(m[2])) return { kind: 'draw', seed: Number(m[2]) };
  return { kind: 'draw', seed: nameSeed(name) };
}

/** The stored value of a picture. */
export const avatarValue = (p: PlayerPicture): string =>
  p.kind === 'face' ? `face:${p.face.id}` : `draw:${p.seed >>> 0}`;
