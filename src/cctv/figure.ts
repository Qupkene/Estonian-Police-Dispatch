/**
 * The people a camera sees (docs/CCTV.md): what they wear (`Look`) and how they hold themselves (`Pose`). A
 * figure is a jointed mannequin; every way of standing, walking, fighting or lying is a small function of time
 * that returns the joints' angles, so a picture is the same whenever it is drawn. Pure: no three.js.
 *
 * Angles are radians. A limb's `swing` is forwards (negative: back), `out` away from the body, the third angle
 * bends the elbow or the knee.
 */
import type { Appearance, Gender, Season } from '@/sim/types';
import { clamp, hash32, lerp, rand, smooth, wobble } from './math';

export type Limb = readonly [swing: number, out: number, bend: number];

export interface Pose {
  /** Hip height as a share of the standing leg (1: standing). */
  hip: number;
  /** The whole body tipped forwards (pi/2: flat on the face; negative: on the back). */
  lean: number;
  roll: number;
  /** The back bent forwards at the waist, and turned. */
  bend: number;
  twist: number;
  headPitch: number;
  headYaw: number;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  /** Metres up (a step's bob). */
  lift: number;
}

export const REST: Pose = {
  hip: 1,
  lean: 0,
  roll: 0,
  bend: 0,
  twist: 0,
  headPitch: 0,
  headYaw: 0,
  armL: [0, 0.07, 0.15],
  armR: [0, 0.07, 0.15],
  legL: [0, 0.03, 0.03],
  legR: [0, 0.03, 0.03],
  lift: 0,
};

const limb = (a: Limb, b: Limb, k: number): Limb => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Pose a blended towards pose b by k (0..1). */
export function mixPose(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  return {
    hip: lerp(a.hip, b.hip, k),
    lean: lerp(a.lean, b.lean, k),
    roll: lerp(a.roll, b.roll, k),
    bend: lerp(a.bend, b.bend, k),
    twist: lerp(a.twist, b.twist, k),
    headPitch: lerp(a.headPitch, b.headPitch, k),
    headYaw: lerp(a.headYaw, b.headYaw, k),
    armL: limb(a.armL, b.armL, k),
    armR: limb(a.armR, b.armR, k),
    legL: limb(a.legL, b.legL, k),
    legR: limb(a.legR, b.legR, k),
    lift: lerp(a.lift, b.lift, k),
  };
}

// ---------------------------------------------------------------------------- what a figure is doing

/** What a figure does while it stays where it is (or, with `UPPER`, what its arms do while it walks). */
export type Act =
  | 'stand'
  | 'idle'
  | 'talk'
  | 'argue'
  | 'phone'
  | 'wave'
  | 'notes'
  | 'guard'
  | 'aim'
  | 'handsUp'
  | 'cuffed'
  | 'hold'
  | 'point'
  | 'look'
  | 'chant'
  | 'carry'
  | 'smoke'
  | 'cold'
  | 'cower'
  | 'brandish'
  | 'fight'
  | 'grapple'
  | 'kick'
  | 'sway'
  | 'fall'
  | 'lie'
  | 'prone'
  | 'sit'
  | 'kneel'
  | 'kneelUp'
  | 'crouch'
  | 'aid'
  | 'cpr'
  | 'lean'
  | 'direct';

export type Gait = 'walk' | 'run' | 'stagger' | 'back' | 'escort';

/** Acts whose arms are kept while walking (a phone at the ear, hands cuffed behind the back). */
const UPPER: ReadonlySet<Act> = new Set<Act>(['phone', 'cuffed', 'hold', 'carry', 'cower', 'handsUp', 'aim', 'brandish', 'point', 'cold']);

/** Acts on the ground: the figure does not turn or get moved about while in them. */
export const DOWN: ReadonlySet<Act> = new Set<Act>(['lie', 'prone', 'sit', 'fall']);

type Maker = (t: number, seed: number) => Pose;

const pulse = (x: number) => Math.max(0, Math.sin(x));

const stand: Maker = (t, s) => ({
  ...REST,
  roll: 0.02 * wobble(s, t, 0.6),
  twist: 0.04 * wobble(s + 3, t, 0.4),
  headYaw: 0.15 * wobble(s + 5, t, 0.35),
});

/** One knee on the ground. */
const kneel = (t: number, s: number): Pose => ({
  ...REST,
  hip: 0.5,
  bend: 0.25 + 0.03 * wobble(s, t, 1),
  legL: [1.45, 0.08, 1.5],
  legR: [0.05, 0.05, 1.62],
});

const ACTS: Record<Act, Maker> = {
  stand,
  idle: (t, s) => {
    const p = stand(t, s);
    // Weight from one foot to the other; a look around now and then.
    const shift = wobble(s + 11, t, 0.25);
    return { ...p, roll: 0.035 * shift, headYaw: 0.5 * wobble(s + 7, t, 0.22), legL: [0.03 * shift, 0.04, 0.05], legR: [-0.03 * shift, 0.04, 0.05] };
  },
  talk: (t, s) => {
    const p = stand(t, s);
    const g = wobble(s + 1, t, 2.1);
    return { ...p, headPitch: 0.05 * g, armR: [0.55 + 0.25 * g, 0.2, 1.25 + 0.35 * wobble(s + 2, t, 2.7)], armL: [0.15 + 0.1 * wobble(s + 4, t, 1.3), 0.1, 0.5] };
  },
  argue: (t, s) => {
    const g = wobble(s + 1, t, 3.4);
    const h = wobble(s + 9, t, 2.6);
    return { ...REST, lean: 0.1 + 0.05 * g, twist: 0.12 * h, headPitch: -0.05, armR: [0.9 + 0.5 * g, 0.35, 0.8 + 0.5 * h], armL: [0.7 + 0.4 * h, 0.4, 0.9 + 0.4 * g], legL: [0.12, 0.07, 0.05], legR: [-0.1, 0.07, 0.05] };
  },
  phone: (t, s) => ({ ...stand(t, s), headPitch: 0.08, roll: 0.03, armR: [0.5, 0.3, 2.45], armL: [0.05 * wobble(s, t, 0.8), 0.08, 0.2] }),
  wave: (t, s) => ({ ...stand(t, s), armR: [2.75, 0.25 + 0.4 * Math.sin(t * 7), 0.3], armL: [0, 0.08, 0.2] }),
  notes: (t, s) => ({ ...stand(t, s), headPitch: 0.4, armL: [0.55, 0.05, 1.55], armR: [0.5, 0.02, 1.6 + 0.08 * Math.sin(t * 9)] }),
  guard: (t, s) => ({ ...stand(t, s), armL: [0.3, 0.12, 1.75], armR: [0.3, 0.12, 1.75], legL: [0, 0.1, 0.03], legR: [0, 0.1, 0.03], headYaw: 0.35 * wobble(s + 7, t, 0.3) }),
  aim: (t, s) => ({ ...REST, hip: 0.95, lean: 0.1, armL: [1.42, -0.12, 0.12], armR: [1.45 + 0.02 * wobble(s, t, 3), -0.1, 0.08], legL: [0.28, 0.08, 0.2], legR: [-0.3, 0.08, 0.12] }),
  handsUp: (t, s) => ({ ...REST, armL: [2.85, 0.4, 0.3 + 0.05 * wobble(s, t, 2)], armR: [2.85, 0.4, 0.3], headPitch: 0.1 }),
  cuffed: () => ({ ...REST, lean: 0.12, headPitch: 0.3, armL: [-0.6, -0.14, 0.35], armR: [-0.6, -0.14, 0.35] }),
  hold: (t, s) => ({ ...stand(t, s), armR: [0.95, 0.05, 0.55], armL: [0.3, 0.12, 1.6] }),
  point: (t, s) => ({ ...stand(t, s), armR: [1.5 + 0.04 * wobble(s, t, 2), 0.05, 0.05], twist: -0.12 }),
  look: (t, s) => ({ ...stand(t, s), headYaw: 1.0 * wobble(s + 7, t, 0.5), twist: 0.3 * wobble(s + 7, t, 0.5) }),
  chant: (t, s) => ({ ...stand(t, s), armR: [2.6 + 0.3 * Math.sin(t * 4 + (s % 7)), 0.2, 0.7], lift: 0.03 * pulse(t * 4 + (s % 7)) }),
  carry: (t, s) => ({ ...stand(t, s), armL: [0.35, 0.2, 1.45], roll: -0.04 }),
  smoke: (t, s) => {
    // A hand to the mouth for a moment, every few seconds.
    const cycle = ((t + (s % 50) / 10) % 6.5) / 6.5;
    const up = smooth(clamp(1 - Math.abs(cycle - 0.2) / 0.12, 0, 1));
    return { ...stand(t, s), armR: [0.15 + 0.45 * up, 0.12, 0.4 + 2.0 * up], headPitch: -0.05 * up };
  },
  cold: (t, s) => ({ ...stand(t, s), bend: 0.08, armL: [0.6, -0.45, 1.9], armR: [0.55, -0.45, 1.95], lift: 0.012 * pulse(t * 5) }),
  cower: (t, s) => ({ ...REST, lean: -0.08, hip: 0.97, armL: [1.2, 0.3, 1.7], armR: [1.25, 0.3, 1.7], headPitch: 0.1, twist: 0.05 * wobble(s, t, 3) }),
  brandish: (t, s) => {
    const sw = wobble(s, t, 3.6);
    return { ...REST, lean: 0.12, hip: 0.96, twist: 0.25 * sw, armR: [1.15 + 0.3 * sw, 0.45 + 0.3 * wobble(s + 2, t, 2.4), 0.3], armL: [0.5, 0.5, 0.6], legL: [0.25, 0.1, 0.15], legR: [-0.25, 0.1, 0.1] };
  },
  fight: (t, s) => {
    // A beat is a blow or a guard; which one comes from the seed, so two fighters hit out of step.
    const beat = 0.5;
    const n = Math.floor(t / beat + (s % 5) * 0.37);
    const ph = (t / beat + (s % 5) * 0.37) % 1;
    const kind = hash32(s, n) % 5;
    const hit = Math.sin(Math.PI * clamp(ph * 1.5, 0, 1));
    const bounce = 0.02 * pulse(t * 9 + (s % 3));
    const guardL: Limb = [0.95, 0.12, 2.05];
    const guardR: Limb = [0.9, 0.12, 2.1];
    const base: Pose = { ...REST, hip: 0.94, lean: 0.14, lift: bounce, armL: guardL, armR: guardR, legL: [0.3, 0.08, 0.2], legR: [-0.28, 0.08, 0.14], headPitch: 0.05 };
    if (kind === 0) return { ...base, twist: -0.4 * hit, lean: 0.14 + 0.12 * hit, armR: [0.9 + 0.6 * hit, 0.05, 2.1 - 1.95 * hit] };
    if (kind === 1) return { ...base, twist: 0.35 * hit, lean: 0.14 + 0.1 * hit, armL: [0.95 + 0.55 * hit, 0.05, 2.05 - 1.9 * hit] };
    // Taking a blow: the head and the body go back.
    if (kind === 2) return { ...base, lean: 0.14 - 0.28 * hit, headPitch: -0.3 * hit, roll: 0.1 * hit };
    if (kind === 3) return { ...base, hip: 0.94 - 0.1 * hit, bend: 0.3 * hit };
    return base;
  },
  grapple: (t, s) => ({
    ...REST,
    hip: 0.92,
    lean: 0.32 + 0.06 * wobble(s, t, 3),
    roll: 0.1 * wobble(s + 2, t, 2.2),
    armL: [1.3, 0.2, 0.55],
    armR: [1.28, 0.2, 0.5],
    legL: [0.35 + 0.1 * wobble(s + 4, t, 3), 0.1, 0.3],
    legR: [-0.4, 0.1, 0.2],
  }),
  kick: (t, s) => {
    const k = pulse((t + (s % 9) / 9) * 4.2) ** 2;
    return { ...REST, lean: -0.08 * k, armL: [0.3, 0.5, 0.4], armR: [-0.2, 0.5, 0.4], legR: [0.95 * k, 0.05, 0.5 * (1 - k)], legL: [-0.05, 0.05, 0.08] };
  },
  sway: (t, s) => {
    // Drunk on the spot: the body goes round, the arms hang.
    const a = wobble(s, t, 0.9);
    const b = wobble(s + 6, t, 0.7);
    return { ...REST, lean: 0.1 + 0.12 * a, roll: 0.14 * b, headPitch: 0.25 + 0.1 * a, armL: [0.1 * b, 0.12, 0.2], armR: [-0.1 * b, 0.12, 0.2], legL: [0.06 * a, 0.1, 0.08], legR: [-0.06 * a, 0.1, 0.08] };
  },
  fall: (t) => {
    // Backwards onto the ground in a little over half a second.
    const k = smooth(t / 0.65);
    return { ...REST, hip: lerp(1, 0.13, k), lean: lerp(0, -Math.PI / 2, k), armL: [lerp(0, 1.2, k), 0.6 * k, 0.4], armR: [lerp(0, 0.9, k), 0.7 * k, 0.5], legL: [0.5 * k * (1 - k), 0.12, 0.6 * (1 - k) * k * 4], legR: [0.1, 0.12, 0.2 * k] };
  },
  lie: (t, s) => ({
    ...REST,
    hip: 0.13,
    lean: -Math.PI / 2,
    roll: 0.05,
    armL: [0.4, 0.75, 0.3 + 0.02 * wobble(s, t, 0.5)],
    armR: [0.2, 0.6, 0.5],
    legL: [0.12, 0.15, 0.25],
    legR: [-0.05, 0.12, 0.1],
  }),
  prone: () => ({ ...REST, hip: 0.13, lean: Math.PI / 2, headYaw: 0.9, armL: [2.4, 0.5, 1.4], armR: [2.5, 0.5, 1.3], legL: [0, 0.14, 0.05], legR: [0, 0.14, 0.12] }),
  sit: (t, s) => ({ ...REST, hip: 0.16, bend: 0.35 + 0.04 * wobble(s, t, 0.5), headPitch: 0.3, armL: [0.8, 0.15, 0.6], armR: [0.85, 0.15, 0.6], legL: [1.75, 0.12, 1.5], legR: [1.7, 0.12, 1.55] }),
  kneel: (t, s) => ({ ...REST, hip: 0.52, lean: 0.05, headPitch: 0.3, armL: [2.2, 0.9, 2.2], armR: [2.2, 0.9, 2.2], legL: [0, 0.1, 1.6 + 0.01 * wobble(s, t, 1)], legR: [0, 0.1, 1.6] }),
  kneelUp: (t, s) => ({ ...kneel(t, s), armL: [0.4, 0.1, 0.8], armR: [0.4, 0.1, 0.8] }),
  crouch: (t, s) => {
    const f = wobble(s, t, 4);
    return { ...REST, hip: 0.44, bend: 0.55, headPitch: 0.2, armL: [1.1 + 0.1 * f, 0.1, 0.9], armR: [1.15 - 0.1 * f, 0.1, 0.85 + 0.15 * f], legL: [1.9, 0.14, 2.4], legR: [1.85, 0.14, 2.45] };
  },
  aid: (t, s) => {
    const f = wobble(s, t, 2.2);
    return { ...kneel(t, s), bend: 0.55 + 0.05 * f, headPitch: 0.35, armL: [0.9 + 0.1 * f, 0.1, 0.5], armR: [0.95 - 0.1 * f, 0.1, 0.45] };
  },
  cpr: (t, s) => {
    const push = pulse(t * 11.5 + (s % 3)) ** 1.5;
    return { ...kneel(t, s), hip: 0.5 - 0.03 * push, bend: 0.75 + 0.16 * push, headPitch: 0.4, armL: [0.75, -0.12, 0.05], armR: [0.75, -0.12, 0.05] };
  },
  lean: (t, s) => ({ ...stand(t, s), bend: 0.5, hip: 0.97, headPitch: -0.2, armR: [0.9, 0.1, 0.9], armL: [0.2, 0.1, 0.3] }),
  direct: (t, s) => {
    // Waving traffic past: one arm out, the other beckoning.
    const b = Math.sin(t * 3.2 + (s % 5));
    return { ...stand(t, s), armL: [0.2, 1.35, 0.1], armR: [1.2 + 0.4 * b, 0.3, 0.9 - 0.6 * b] };
  },
};

/** A walking, running or stumbling body at step phase `th` (radians, a full turn every two steps). */
function gaitPose(gait: Gait, th: number, seed: number, t: number): Pose {
  const sn = Math.sin(th);
  const cs = Math.cos(th);
  if (gait === 'run') {
    return {
      ...REST,
      hip: 0.95,
      lean: 0.24,
      roll: 0.04 * sn,
      twist: 0.14 * sn,
      lift: 0.06 * Math.abs(cs),
      armL: [-0.95 * sn, 0.12, 1.55],
      armR: [0.95 * sn, 0.12, 1.55],
      legL: [0.9 * sn + 0.15, 0.03, 0.15 + 1.6 * Math.max(0, cs)],
      legR: [-0.9 * sn + 0.15, 0.03, 0.15 + 1.6 * Math.max(0, -cs)],
    };
  }
  const drunk = gait === 'stagger';
  const back = gait === 'back';
  const a = drunk ? 0.38 : back ? 0.32 : 0.5;
  const w1 = drunk ? wobble(seed, t, 1.1) : 0;
  const w2 = drunk ? wobble(seed + 5, t, 0.8) : 0;
  return {
    ...REST,
    hip: drunk ? 0.97 : 1,
    lean: (back ? -0.05 : 0.045) + 0.12 * w1,
    roll: 0.03 * sn + 0.16 * w2,
    twist: 0.07 * sn,
    headPitch: drunk ? 0.25 : 0,
    lift: 0.025 * Math.abs(cs),
    armL: [-0.38 * sn + 0.1 * w2, 0.08 + (drunk ? 0.12 : 0), 0.25],
    armR: [0.38 * sn - 0.1 * w1, 0.08 + (drunk ? 0.12 : 0), 0.25],
    legL: [a * sn, 0.03, 0.06 + 0.85 * Math.max(0, back ? -cs : cs)],
    legR: [-a * sn, 0.03, 0.06 + 0.85 * Math.max(0, back ? cs : -cs)],
  };
}

/** Metres covered by two steps of a gait, for a person 1.75 m tall. */
export const STRIDE: Record<Gait, number> = { walk: 1.45, run: 2.5, stagger: 1.05, back: 1.0, escort: 1.3 };
/** Usual speed of a gait, metres a second. */
export const PACE: Record<Gait, number> = { walk: 1.35, run: 4.6, stagger: 0.75, back: 0.8, escort: 1.1 };

export interface PoseInput {
  act: Act;
  /** Seconds the act has lasted. */
  actT: number;
  /** Walking: the gait and the step phase; null when standing. */
  gait: Gait | null;
  phase: number;
  seed: number;
  /** The world's clock in seconds (sway and noise run on it). */
  t: number;
}

/** The pose of a figure right now. */
export function poseOf(p: PoseInput): Pose {
  if (!p.gait) return ACTS[p.act](p.actT, p.seed);
  const g = gaitPose(p.gait === 'escort' ? 'walk' : p.gait, p.phase, p.seed, p.t);
  if (!UPPER.has(p.act)) return g;
  const up = ACTS[p.act](p.actT, p.seed);
  return { ...g, armL: up.armL, armR: up.armR, headPitch: up.headPitch, lean: g.lean + up.lean * 0.6 };
}

// ---------------------------------------------------------------------------- what a figure looks like

export type Dress = 'civil' | 'police' | 'medic' | 'rescue' | 'guard';

export interface Look {
  /** Metres tall. */
  height: number;
  /** Width of the body: 1 average, 0.86 slim, 1.25 heavy. */
  build: number;
  skin: number;
  /** Hair colour, or null for a bald or covered head. */
  hair: number | null;
  /** Long hair shows below the head. */
  longHair: boolean;
  /** A hat or hood over the head, in this colour. */
  hat: number | null;
  top: number;
  legs: number;
  shoes: number;
  /** A long coat: the top's colour reaches down over the hips. */
  coat: boolean;
  /** Bare arms and lower legs (summer). */
  bare: boolean;
  dress: Dress;
  /** Bright bands that shine in headlights and infrared (police, medics, rescuers). */
  bands: boolean;
  female: boolean;
}

const SKIN = [0xe8c4a4, 0xdcb596, 0xd2a888, 0xe6c9b0, 0xc79a7a];
const HAIR: Record<Appearance['hairColor'], number> = {
  black: 0x1c1a18,
  brown: 0x4a3525,
  blond: 0xc9aa6a,
  red: 0x8a3f22,
  grey: 0x8c8c8a,
  white: 0xd9d9d6,
  dyed: 0x6a3a7a,
};
/** Everyday clothes: mostly dark and plain, as in a northern street. */
const TOPS_COLD = [0x1d1f24, 0x23272e, 0x2c3340, 0x3a3a3c, 0x34402f, 0x4a3328, 0x5a1f24, 0x27405a, 0x6b6b68, 0x1f3550, 0x7a2a2a, 0x8a7a5a];
const TOPS_WARM = [0xd8d8d2, 0x9aa7b5, 0x2c3340, 0xb04a3c, 0x4f7a5a, 0xd2b24a, 0x3a5f8a, 0x1d1f24, 0xc8a0a0, 0x7a8a9a, 0xe6e2d6, 0x596a3a];
const LEGS = [0x1f2630, 0x2a3442, 0x1b1b1d, 0x3b3f45, 0x4a4438, 0x263a55, 0x2e2e30];
const SHOES = [0x161616, 0x2a2420, 0x3a3a3a, 0xc8c8c8, 0x4a3a2a];
const HATS = [0x1d1f24, 0x3a3a3c, 0x7a2a2a, 0x27405a, 0x8a8a86, 0x34402f];

const BUILD: Record<Appearance['build'], number> = { slim: 0.87, average: 1, athletic: 1.08, heavy: 1.26 };

export interface DressFor {
  season: Season;
  /** Degrees C. */
  temp: number;
}

function civil(seed: number, w: DressFor, female: boolean, height: number, build: number, hairColor: number | null, long: boolean): Look {
  const r = rand(seed);
  const cold = w.temp < 9 || w.season === 'winter';
  const warm = w.temp >= 19 && w.season === 'summer';
  const hat = cold && r.chance(w.temp < 0 ? 0.75 : 0.35) ? r.pick(HATS) : !cold && r.chance(0.08) ? r.pick(HATS) : null;
  return {
    height,
    build: build * (cold ? 1.1 : 1),
    skin: r.pick(SKIN),
    hair: hairColor,
    longHair: long,
    hat,
    top: r.pick(cold ? TOPS_COLD : TOPS_WARM),
    legs: r.pick(LEGS),
    shoes: r.pick(SHOES),
    coat: cold && r.chance(0.45),
    bare: warm && r.chance(0.7),
    dress: 'civil',
    bands: false,
    female,
  };
}

/** A resident of the game's registry, dressed for the weather. */
export function lookOfPerson(p: { id: string; gender: Gender; appearance: Appearance }, w: DressFor): Look {
  const a = p.appearance;
  const bald = a.hair === 'bald' || a.hair === 'shaved';
  return civil(hash32('look', p.id), w, p.gender === 'F', a.heightCm / 100, BUILD[a.build], bald ? null : HAIR[a.hairColor], a.hair === 'long' || a.hair === 'ponytail' || a.hair === 'curly');
}

/** Somebody passing by. */
export function lookOfStranger(seed: number, w: DressFor): Look {
  const r = rand(seed ^ 0x9e3779b9);
  const female = r.chance(0.48);
  const colours = [0x1c1a18, 0x4a3525, 0x4a3525, 0xc9aa6a, 0x8c8c8a, 0x8a3f22];
  return civil(seed, w, female, female ? r.range(1.56, 1.76) : r.range(1.68, 1.92), r.pick([0.87, 1, 1, 1.08, 1.26]), r.chance(0.08) ? null : r.pick(colours), female && r.chance(0.7));
}

/** A uniformed figure: a police officer, a paramedic, a rescuer, a security guard. */
export function lookOfCrew(dress: Exclude<Dress, 'civil'>, seed: number, gender: Gender, w: DressFor): Look {
  const r = rand(seed ^ 0x51ed270b);
  const female = gender === 'F';
  const cold = w.temp < 6;
  const base = {
    height: female ? r.range(1.62, 1.76) : r.range(1.74, 1.92),
    build: r.range(0.98, 1.14) * (cold ? 1.06 : 1),
    skin: r.pick(SKIN),
    hair: r.pick([0x1c1a18, 0x4a3525, 0xc9aa6a, 0x4a3525]),
    longHair: false,
    coat: false,
    bare: false,
    bands: true,
    female,
    dress,
  };
  // Police: dark blue with a yellow-green vest. Paramedics: red. Rescuers: dark with a helmet. Guards: black.
  if (dress === 'police') return { ...base, top: 0xc6dc2e, legs: 0x141c2c, shoes: 0x101010, hat: cold || r.chance(0.6) ? 0x141c2c : null };
  if (dress === 'medic') return { ...base, top: 0xc22a24, legs: 0xa8201c, shoes: 0x101010, hat: cold ? 0x8a1a18 : null };
  if (dress === 'rescue') return { ...base, top: 0x2a2c33, legs: 0x23252b, shoes: 0x101010, hat: 0xd8c22a };
  return { ...base, top: 0x16171a, legs: 0x16171a, shoes: 0x101010, hat: r.chance(0.4) ? 0x16171a : null, bands: false };
}
