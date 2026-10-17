// Owned by gen-people. Deterministic flat-vector head-and-shoulders portraits (viewBox 0 0 120 120).
import { Rng } from '@/sim/rng';
import type { Appearance, Gender } from '@/sim/types';

export interface AvatarOptions {
  gender: Gender;
  age: number;
  hair?: Appearance['hair'];
  hairColor?: Appearance['hairColor'];
  beard?: Appearance['beard'];
  glasses?: boolean;
  /** Draw a police uniform (officers). */
  uniform?: boolean;
  /** Iris colour (otherwise derived from the seed). */
  eyes?: Appearance['eyes'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────────────────────────

/** Skin tones, mostly Northern European with some variety (hex, weight). */
const SKIN: [string, number][] = [
  ['#f7dac6', 3],
  ['#f1ccb0', 4],
  ['#eabf9e', 4],
  ['#e0ae8a', 3],
  ['#d39d76', 2],
  ['#bf8660', 0.5],
  ['#a46d4a', 0.25],
  ['#87553a', 0.15],
  ['#66402b', 0.1],
];

const HAIR: Record<Exclude<Appearance['hairColor'], 'dyed'>, string> = {
  black: '#241d1a',
  brown: '#5a3a24',
  blond: '#c7a062',
  red: '#a5492b',
  grey: '#a3a19d',
  white: '#e8e5de',
};
/** Dye colours: the first four look natural (used from 35 up), the rest are vivid. */
const DYED = ['#7b2a45', '#8d3a2a', '#ddcda6', '#a5552f', '#4c3b7c', '#2f3d63', '#b4527a'];
const BLONDS = ['#c7a062', '#d6b77c', '#b8925a'];

const EYES: Record<Appearance['eyes'], string> = {
  blue: '#4f7fb3',
  grey: '#7a8a93',
  green: '#5f8a4f',
  brown: '#6a4329',
};

const BACKDROPS: [string, string][] = [
  ['#4b5f76', '#28323f'],
  ['#55706a', '#2c3d3a'],
  ['#6a5b6e', '#382f40'],
  ['#6e6656', '#3b352d'],
  ['#4d6580', '#232e3c'],
  ['#5c6b4e', '#323b2b'],
  ['#78605a', '#42312e'],
  ['#5a6a7d', '#2f3846'],
];

// prettier-ignore
const CLOTHES = [
  '#2b2f36', '#3e4a5b', '#5b6371', '#1f3a5f', '#6b2f38', '#3c5a40', '#7a6a4f', '#a33b2e', '#c49a2a',
  '#4a6d8c', '#e3dfd6', '#59692f', '#8a8f96',
];

const UNIFORM = '#1d2a44';
const LINE = '#2a211e';

// ─────────────────────────────────────────────────────────────────────────────
// SVG helpers
// ─────────────────────────────────────────────────────────────────────────────

const n = (x: number) => String(Math.round(x * 10) / 10);

/** Tagged template for path data: interpolated numbers are rounded to 0.1. */
function p(strs: TemplateStringsArray, ...vals: (number | string)[]): string {
  let out = strs[0];
  vals.forEach((v, i) => {
    out += (typeof v === 'number' ? n(v) : v) + strs[i + 1];
  });
  return out;
}

type Attrs = Record<string, string | number | undefined>;

/** `<tag a="…"/>`; numbers are rounded, undefined attributes skipped. */
function el(tag: string, attrs: Attrs, inner?: string): string {
  let s = `<${tag}`;
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) s += ` ${k}="${typeof v === 'number' ? n(v) : v}"`;
  }
  return inner === undefined ? `${s}/>` : `${s}>${inner}</${tag}>`;
}

const path = (d: string, fill: string, extra: Attrs = {}) => el('path', { d, fill, ...extra });
const stroke = (d: string, color: string, width: number, extra: Attrs = {}) =>
  el('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', ...extra });

/** Mix a hex colour towards black (f < 0) or white (f > 0). */
function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) =>
    Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f),
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Traits
// ─────────────────────────────────────────────────────────────────────────────

interface Face {
  w: number; // half width at the cheeks
  jw: number; // jaw squareness (control x offset near the chin)
  c: number; // chin y
}

const FACES: Face[] = [
  { w: 20.5, jw: 12, c: 84 }, // oval
  { w: 22.5, jw: 16, c: 82 }, // round
  { w: 22, jw: 19, c: 83 }, // square
  { w: 19.5, jw: 11, c: 86 }, // long
  { w: 21.5, jw: 8, c: 84 }, // heart
];

const TOP = 31; // top of the skull
const EYE_Y = 57.5;

/** Traits derived from the seed only, drawn in a fixed order so options never shift them. */
interface Traits {
  skin: string;
  face: Face;
  backdrop: [string, string];
  clothes: string;
  garment: number; // 0 tee, 1 hoodie, 2 jacket, 3 collared shirt, 4 sweater
  brow: number;
  nose: number;
  mouth: number;
  eyeGap: number;
  hairStyle: Appearance['hair'];
  hairColor: string;
  dyed: string;
  blond: string;
  glassesRound: boolean;
  earring: boolean;
  eyes: Appearance['eyes'];
  receding: number; // 0..1 how far a man's hairline recedes (grows with age)
}

function traits(seed: number, o: AvatarOptions): Traits {
  const r = new Rng((seed ^ 0x2545f491) >>> 0);
  const skin = r.weighted(SKIN, (x) => x[1])[0];
  const face = r.pick(FACES);
  const backdrop = r.pick(BACKDROPS);
  const clothes = r.pick(CLOTHES);
  const garment = r.int(0, 4);
  const brow = r.int(0, 2);
  const nose = r.int(0, 2);
  const mouth = r.int(0, 2);
  const eyeGap = r.range(-0.6, 0.6);
  const styles: Appearance['hair'][] =
    o.gender === 'M'
      ? ['short', 'short', 'short', 'buzz', 'curly', 'long', 'shaved']
      : ['long', 'long', 'ponytail', 'short', 'curly'];
  const hairStyle = r.pick(styles);
  const natural = r.weighted(
    ['blond', 'brown', 'black', 'red'] as const,
    (k) => ({ blond: 0.35, brown: 0.42, black: 0.15, red: 0.08 })[k],
  );
  const dyed = o.age >= 35 ? DYED[r.int(0, 3)] : r.pick(DYED);
  const blond = r.pick(BLONDS);
  const glassesRound = r.chance(0.45);
  const earring = r.chance(0.35);
  const eyes = r.weighted(
    ['blue', 'grey', 'green', 'brown'] as const,
    (k) => ({ blue: 0.42, grey: 0.2, green: 0.15, brown: 0.23 })[k],
  );
  const receding = Math.max(0, Math.min(1, (o.age - 35) / 30 + r.range(-0.3, 0.3)));
  const hairColor = natural === 'blond' ? blond : HAIR[natural];
  // prettier-ignore
  return {
    skin, face, backdrop, clothes, garment, brow, nose, mouth, eyeGap, hairStyle, hairColor, dyed, blond,
    glassesRound, earring, eyes, receding,
  };
}

function hairHex(t: Traits, c: Appearance['hairColor'] | undefined, age: number): string {
  if (!c) return age >= 62 ? HAIR.grey : t.hairColor;
  if (c === 'dyed') return t.dyed;
  if (c === 'blond') return t.blond;
  return HAIR[c];
}

// ─────────────────────────────────────────────────────────────────────────────
// Parts
// ─────────────────────────────────────────────────────────────────────────────

function facePath(f: Face): string {
  const { w, jw, c } = f;
  return (
    p`M${60 - w} 56C${60 - w} ${TOP + 8} ${60 - w * 0.55} ${TOP} 60 ${TOP}` +
    p`C${60 + w * 0.55} ${TOP} ${60 + w} ${TOP + 8} ${60 + w} 56` +
    p`C${60 + w} ${c - 14} ${60 + jw} ${c - 2} 60 ${c}C${60 - jw} ${c - 2} ${60 - w} ${c - 14} ${60 - w} 56Z`
  );
}

function uniformDetails(): string {
  const ep = shade(UNIFORM, 0.2);
  return (
    path('M47 92L60 106L73 92L69 90L60 99L51 90Z', '#c9d4e4') +
    path('M57 101L60 120L63 101L60 98Z', '#141d31') +
    el(
      'g',
      { fill: ep },
      el('rect', { x: 22, y: 96, width: 17, height: 4.4, rx: 1.3, transform: 'rotate(-15 30 98)' }) +
        el('rect', { x: 81, y: 96, width: 17, height: 4.4, rx: 1.3, transform: 'rotate(15 90 98)' }),
    ) +
    // Generic shield patch and a radio handset; deliberately not any real insignia.
    path('M73 100h10v6q0 4-5 6.4q-5-2.4-5-6.4z', '#2f63b5', { stroke: '#d9e2f0', 'stroke-width': 0.8 }) +
    el('circle', { cx: 78, cy: 105, r: 1.7, fill: '#e9eef7' }) +
    el('rect', { x: 36, y: 100, width: 6, height: 9, rx: 1.5, fill: '#111' })
  );
}

function body(t: Traits, o: AvatarOptions, id: string): string {
  const fill = o.uniform ? UNIFORM : t.clothes;
  const torso = path('M8 120C9 103 24 95 44 92Q60 97 76 92C96 95 111 103 112 120Z', `url(#${id}c)`);
  if (o.uniform) return torso + uniformDetails();
  const dark = shade(fill, -0.3);
  const light = shade(fill, 0.25);
  switch (t.garment) {
    case 1: // hoodie: hood bunched around the neck + drawstrings
      return (
        torso +
        path('M38 95Q60 112 82 95Q80 87 60 89Q40 87 38 95Z', dark) +
        stroke('M55 99l-1 11M65 99l1 11', light, 1.2)
      );
    case 2: // jacket: collar flaps + zip
      return (
        torso +
        path('M44 92L53 89L59 104L50 112ZM76 92L67 89L61 104L70 112Z', light) +
        stroke('M60 100V120', dark, 1.4)
      );
    case 3: // collared shirt with buttons
      return (
        torso +
        path('M49 91L56 102L60 96L64 102L71 91L60 97Z', shade(fill, 0.55)) +
        el('circle', { cx: 60, cy: 106, r: 0.9, fill: dark }) +
        el('circle', { cx: 60, cy: 113, r: 0.9, fill: dark })
      );
    case 4: // sweater: ribbed crew neck
      return torso + stroke('M46 92.5Q60 103 74 92.5', dark, 3.2);
    default: // t-shirt
      return torso + stroke('M47 92.5Q60 101 73 92.5', dark, 1.8);
  }
}

function neck(t: Traits): string {
  return (
    path('M51.5 70L51 93Q60 99 69 93L68.5 70Z', shade(t.skin, -0.12)) +
    path('M51.5 78Q60 84 68.5 78V74H51.5Z', shade(t.skin, -0.2), { opacity: 0.5 })
  );
}

function ears(t: Traits, o: AvatarOptions): string {
  const { w } = t.face;
  const s = shade(t.skin, -0.14);
  const ear = (x: number, dir: number) =>
    el('ellipse', { cx: x, cy: 59, rx: 3.8, ry: 6, fill: t.skin }) +
    stroke(p`M${x + dir * 1.3} 55.5q${dir * -2.2} 3.5 0 7`, s, 1);
  let out = ear(60 - w, -1) + ear(60 + w, 1);
  if (o.gender === 'F' && t.earring && !o.uniform) {
    out += el(
      'g',
      { fill: '#e2c062' },
      el('circle', { cx: 60 - w, cy: 66, r: 1.3 }) + el('circle', { cx: 60 + w, cy: 66, r: 1.3 }),
    );
  }
  return out;
}

/** Hair drawn behind the head (long hair, curls, ponytail). */
function hairBack(style: Appearance['hair'], t: Traits, o: AvatarOptions, hc: string): string {
  const { w } = t.face;
  if (style === 'long') {
    const b = o.gender === 'F' ? 98 : 84;
    return path(
      p`M${60 - w - 5} 52C${60 - w - 6} 22 ${60 + w + 6} 22 ${60 + w + 5} 52` +
        p`L${60 + w + 7} ${b}Q60 ${b + 6} ${60 - w - 7} ${b}Z`,
      hc,
    );
  }
  if (style === 'curly' && o.gender === 'F') {
    let curls = '';
    const rows = o.age >= 55 ? 4 : 7;
    for (let i = 0; i < rows; i++) {
      for (const x of [60 - w - 3, 60 + w + 3]) curls += el('circle', { cx: x, cy: 46 + i * 7, r: 6.5 });
    }
    return el('g', { fill: hc }, curls);
  }
  if (style === 'ponytail') {
    return (
      path(p`M${60 + w - 2} 40Q${60 + w + 13} 48 ${60 + w + 9} 80Q${60 + w + 2} 66 ${60 + w - 1} 50Z`, hc) +
      el('circle', { cx: 60 + w + 2, cy: 44, r: 2.4, fill: shade(hc, -0.35) })
    );
  }
  return '';
}

/** Hair cap with a hairline at `hy`, side locks reaching `sy`, `vol` units of volume above the skull. */
function cap(t: Traits, hy: number, sy: number, vol: number): string {
  const { w } = t.face;
  // Control height so the dome's apex lands `vol` above the skull top.
  const cy = (TOP - vol - 0.25 * sy) / 0.75;
  return (
    p`M${60 - w - 1.5} ${sy}C${60 - w - 2} ${cy} ${60 + w + 2} ${cy} ${60 + w + 1.5} ${sy}` +
    p`L${60 + w - 1} ${sy}C${60 + w - 2} ${hy - 1} ${67} ${hy - 2.5} 60 ${hy}` +
    p`C${53} ${hy - 2.5} ${60 - w + 2} ${hy - 1} ${60 - w + 1} ${sy}Z`
  );
}

/** Long women's hair or a bob: a hood of hair down to `b`, fringe swept to one side. */
function framedHair(t: Traits, b: number, hc: string): string {
  const { w } = t.face;
  return path(
    p`M${60 - w - 2.5} ${b}C${60 - w - 5.5} 48 ${60 - w} 25.5 60 26.5` +
      p`C${60 + w} 25.5 ${60 + w + 5.5} 48 ${60 + w + 2.5} ${b}` +
      p`L${60 + w - 1.5} ${b}C${60 + w - 0.5} 61 ${60 + w - 2} 50 ${60 + w - 6.5} 44.5` +
      p`C${63} 47.5 ${51} 43 ${60 - w + 2.5} 51.5C${60 - w + 1} 61 ${60 - w + 1} 70 ${60 - w + 1.5} ${b}Z`,
    hc,
  );
}

function shortMale(t: Traits, hc: string, shine: (y: number) => string): string {
  const { w } = t.face;
  const hy = 42 - t.receding * 5;
  const thin = t.receding > 0.8;
  const capEl = path(cap(t, hy, 55, 4), hc, { opacity: thin ? 0.55 : undefined });
  if (thin) return capEl;
  // Receding temples and a swept fringe.
  const temples =
    t.receding > 0.45
      ? path(
          p`M${60 - w + 2} 46Q50 40 52 ${hy + 2}L${60 - w + 1} 44Z` +
            p`M${60 + w - 2} 46Q70 40 68 ${hy + 2}L${60 + w - 1} 44Z`,
          t.skin,
        )
      : '';
  const quiff = path(p`M47 ${hy + 1.5}Q57 ${hy - 7} 72 ${hy - 0.5}Q60 ${hy - 3} 47 ${hy + 1.5}Z`, hc);
  return capEl + quiff + temples + shine(34);
}

function hairFront(style: Appearance['hair'], t: Traits, o: AvatarOptions, hc: string): string {
  const { w } = t.face;
  const male = o.gender === 'M';
  const shine = (y: number) =>
    stroke(p`M${60 - w * 0.5} ${y}Q60 ${y - 3.5} ${60 + w * 0.45} ${y}`, shade(hc, 0.22), 1.6, {
      opacity: 0.55,
    });
  switch (style) {
    case 'bald': {
      // Horseshoe fringe for most bald men; a highlight on the skull.
      const fringe = path(
        p`M${60 - w - 1.2} 62C${60 - w - 2.5} 50 ${60 - w} 44 ${60 - w + 4} 41L${60 - w + 3} 50Z` +
          p`M${60 + w + 1.2} 62C${60 + w + 2.5} 50 ${60 + w} 44 ${60 + w - 4} 41L${60 + w - 3} 50Z`,
        hc,
      );
      const sheen = el('ellipse', { cx: 55, cy: 37, rx: 7, ry: 3, fill: '#fff', opacity: 0.18 });
      return (t.receding > 0.2 ? fringe : '') + sheen;
    }
    case 'shaved':
      return path(cap(t, 41, 54, 0.5), hc, { opacity: 0.32 });
    case 'buzz':
      return path(cap(t, 41, 55, 1), hc, { opacity: 0.88 });
    case 'curly': {
      let puffs = '';
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.02 + (0.96 * i) / 8);
        puffs += el('circle', {
          cx: 60 + Math.cos(a) * (w + 1),
          cy: 47 + Math.sin(a) * 17,
          r: male ? 5.2 : 6,
        });
      }
      return el('g', { fill: hc }, path(cap(t, 43, male ? 54 : 60, 3), hc) + puffs);
    }
    case 'long':
      return male ? path(cap(t, 42, 70, 2.5), hc) + shine(36) : framedHair(t, 82, hc) + shine(34);
    case 'ponytail':
      return path(cap(t, 41, 56, 1.5), hc) + shine(36);
    default:
      return male ? shortMale(t, hc, shine) : framedHair(t, 74, hc) + shine(34);
  }
}

function eyesAndBrows(t: Traits, o: AvatarOptions, hc: string): string {
  const gap = 8.5 + t.eyeGap;
  const kid = o.age < 14;
  const female = o.gender === 'F';
  const iris = EYES[o.eyes ?? t.eyes];
  const browCol = shade(hc === HAIR.white || hc === HAIR.grey ? '#8e8a84' : hc, -0.25);
  const rx = kid ? 3.8 : 3.4;
  const by = EYE_Y - 6;
  let out = '';
  for (const dir of [-1, 1]) {
    const x = 60 + dir * gap;
    out +=
      el('ellipse', { cx: x, cy: EYE_Y, rx, ry: kid ? 2.6 : 2.2, fill: '#fbfaf6' }) +
      el('circle', { cx: x, cy: EYE_Y, r: kid ? 2.1 : 1.9, fill: iris }) +
      el('circle', { cx: x, cy: EYE_Y, r: 1, fill: '#181514' }) +
      el('circle', { cx: x + 0.6, cy: EYE_Y - 0.7, r: 0.5, fill: '#fff' }) +
      stroke(
        p`M${x - rx - 0.3} ${EYE_Y}Q${x} ${EYE_Y - 3.6} ${x + rx + 0.3} ${EYE_Y}`,
        LINE,
        female ? 1.2 : 0.9,
      );
    if (female && !kid) out += stroke(p`M${x + dir * (rx + 0.2)} ${EYE_Y - 0.4}l${dir * 1.4} -1`, LINE, 0.9);
    // Brows: straight, arched or angled.
    const mid = [by - 0.9, by - 2, by - 1.2][t.brow];
    const end = [by + 0.2, by + 0.8, by + 1.4][t.brow];
    out += stroke(
      p`M${x - dir * 4} ${by + 0.5}Q${x} ${mid} ${x + dir * 4} ${end}`,
      browCol,
      female ? 1.5 : 2.1,
    );
  }
  return out;
}

const NOSES = [
  'M60.6 59Q58 66 59 67.6Q60.6 68.7 62.5 67.4',
  'M60.2 60Q58.4 65.5 58.6 67.2Q60.4 68.2 61.8 67.3',
  'M61 58.5Q57.4 66.5 58.4 68Q60.6 69.3 63 67.8',
];

function noseMouth(t: Traits, o: AvatarOptions): string {
  const my = t.face.c - 10.5;
  let out = stroke(NOSES[t.nose], shade(t.skin, -0.22), 1.15);
  if (o.gender === 'F' && o.age >= 14) {
    const lc = shade('#c4675e', t.mouth === 2 ? 0.1 : 0);
    out +=
      path(
        p`M54.5 ${my}Q57.5 ${my - 1.8} 60 ${my - 0.9}Q62.5 ${my - 1.8} 65.5 ${my}Q60 ${my + 0.9} 54.5 ${my}Z`,
        shade(lc, -0.1),
      ) + path(p`M55 ${my}Q60 ${my + 0.9} 65 ${my}Q60 ${my + 4} 55 ${my}Z`, lc);
  } else {
    const curve = [1.2, 2.8, 0.4][t.mouth];
    out += stroke(p`M54.6 ${my}Q60 ${my + curve} 65.4 ${my}`, shade(t.skin, -0.35), 1.5);
  }
  if (o.age < 30 && t.mouth !== 2) {
    const cheek = (cx: number) => el('circle', { cx, cy: 66, r: 3.6 });
    out += el('g', { fill: '#e07a6f', opacity: 0.16 }, cheek(47) + cheek(73));
  }
  return out;
}

/** Age cues: nasolabial folds, crow's feet, forehead lines, under-eye bags. */
function wrinkles(t: Traits, age: number): string {
  if (age < 38) return '';
  const gap = 8.5 + t.eyeGap;
  const l = 60 - gap;
  const r = 60 + gap;
  let d = 'M54 65Q51.2 70 52.6 75M66 65Q68.8 70 67.4 75';
  if (age >= 48)
    d += p`M${l - 4.4} 56.5l-2 -1M${l - 4.4} 58.5l-2 .8M${r + 4.4} 56.5l2 -1M${r + 4.4} 58.5l2 .8`;
  if (age >= 52) d += 'M52 44.5Q60 43 68 44.5M53.5 47.5Q60 46.3 66.5 47.5';
  if (age >= 60) d += p`M${l - 2.5} 61Q${l} 62.5 ${l + 2.5} 61M${r - 2.5} 61Q${r} 62.5 ${r + 2.5} 61`;
  return stroke(d, shade(t.skin, -0.3), 0.8, { opacity: Math.min(0.7, (age - 34) / 45) });
}

function beard(kind: AvatarOptions['beard'], t: Traits, hc: string): string {
  if (!kind) return '';
  const { w, jw, c } = t.face;
  const my = c - 10.5;
  const jaw =
    p`M${60 - w + 0.5} 58C${60 - w + 0.5} ${c - 13} ${60 - jw} ${c + 1.5} 60 ${c + 2}` +
    p`C${60 + jw} ${c + 1.5} ${60 + w - 0.5} ${c - 13} ${60 + w - 0.5} 58` +
    p`C${60 + w - 4} 67 67 ${my - 2.5} 60 ${my - 2.5}C53 ${my - 2.5} ${60 - w + 4} 67 ${60 - w + 0.5} 58Z`;
  const tache =
    p`M53 ${my - 0.8}Q60 ${my - 5.2} 67 ${my - 0.8}` +
    p`Q64 ${my - 1.4} 60 ${my - 2}Q56 ${my - 1.4} 53 ${my - 0.8}Z`;
  switch (kind) {
    case 'stubble':
      return path(jaw, hc, { opacity: 0.26 });
    case 'moustache':
      return path(tache, hc);
    case 'goatee':
      return path(
        tache +
          p`M55.5 ${my + 2.2}Q60 ${my + 1.2} 64.5 ${my + 2.2}` +
          p`Q63.5 ${c + 1.5} 60 ${c + 2}Q56.5 ${c + 1.5} 55.5 ${my + 2.2}Z`,
        hc,
      );
    default:
      return (
        path(jaw, hc) +
        path(tache, shade(hc, -0.15)) +
        stroke(p`M55.5 ${my + 0.3}Q60 ${my + 2} 64.5 ${my + 0.3}`, shade(t.skin, -0.55), 1.4)
      );
  }
}

function glasses(t: Traits): string {
  const gap = 8.5 + t.eyeGap;
  const { w } = t.face;
  const frame = t.glassesRound ? '#3a3330' : '#1f1f22';
  const ex = t.glassesRound ? 5 : 5.6;
  const lens = (x: number) =>
    t.glassesRound
      ? el('circle', { cx: x, cy: EYE_Y, r: 5 })
      : el('rect', { x: x - 5.6, y: EYE_Y - 3.9, width: 11.2, height: 7.8, rx: 2 });
  const lenses = el(
    'g',
    { fill: '#fff', 'fill-opacity': 0.14, stroke: frame, 'stroke-width': 1.3 },
    lens(60 - gap) + lens(60 + gap),
  );
  const bridge =
    p`M${60 - gap + ex} ${EYE_Y - 0.6}Q60 ${EYE_Y - 2} ${60 + gap - ex} ${EYE_Y - 0.6}` +
    p`M${60 - gap - ex} ${EYE_Y - 1}L${60 - w + 0.5} ${EYE_Y - 2}` +
    p`M${60 + gap + ex} ${EYE_Y - 1}L${60 + w - 0.5} ${EYE_Y - 2}`;
  return lenses + stroke(bridge, frame, 1.3);
}

function defs(id: string, bg: [string, string], cloth: string): string {
  const grad = (suffix: string, top: string, bottom: string) =>
    el(
      'linearGradient',
      { id: id + suffix, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': top }) + el('stop', { offset: 1, 'stop-color': bottom }),
    );
  return el('defs', {}, grad('b', bg[0], bg[1]) + grad('c', shade(cloth, 0.12), shade(cloth, -0.18)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic flat-style SVG portrait (viewBox 0 0 120 120). Gradient ids are unique per seed. */
export function avatarSvg(seed: number, o: AvatarOptions): string {
  const t = traits(seed, o);
  const id = `av${(seed >>> 0).toString(36)}${o.uniform ? 'u' : ''}`;
  const style = o.hair ?? (o.gender === 'M' && t.receding > 0.85 ? 'bald' : t.hairStyle);
  const hc = hairHex(t, o.hairColor, o.age);
  const bg: [string, string] = o.uniform ? ['#40556f', '#1c2534'] : t.backdrop;
  const figure = [
    body(t, o, id),
    hairBack(style, t, o, hc),
    neck(t),
    ears(t, o),
    path(facePath(t.face), t.skin),
    wrinkles(t, o.age),
    eyesAndBrows(t, o, hc),
    noseMouth(t, o),
    o.gender === 'M' && o.age >= 16 ? beard(o.beard, t, hc) : '',
    hairFront(style, t, o, hc),
    o.glasses ? glasses(t) : '',
  ].join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    defs(id, bg, o.uniform ? UNIFORM : t.clothes) +
    el('rect', { width: 120, height: 120, fill: `url(#${id}b)` }) +
    el('circle', { cx: 60, cy: 52, r: 46, fill: '#fff', opacity: 0.05 }) +
    // The figure is drawn ~12 % larger so the face fills small thumbnails.
    el('g', { transform: 'matrix(1.12 0 0 1.12 -7.2 -5.8)' }, figure) +
    '</svg>'
  );
}

export function avatarDataUri(seed: number, o: AvatarOptions): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(avatarSvg(seed, o));
}
