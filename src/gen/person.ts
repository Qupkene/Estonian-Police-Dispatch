// Owned by gen-people. Registry person generator (rahvastikuregister + karistusregister mock).
import { LAWS, type Law } from '@/data/laws';
import { OCCUPATION_BY_ID, OCCUPATIONS, type Occupation } from '@/data/occupations';
import { homeAddress, townRuShare } from '@/gen/address';
import { TATTOOS } from '@/gen/describe';
import { makeIdcode } from '@/gen/isikukood';
import { randomNameFor, surnameForGender, type NameOrigin } from '@/gen/names';
import { foreignMobile, mobileNumber } from '@/gen/phone';
import type { Rng } from '@/sim/rng';
import { DAY, seasonOf, wall } from '@/sim/time';
import type {
  Appearance,
  Citizenship,
  CriminalRecord,
  Gender,
  LngLat,
  Person,
  PersonSpec,
  RegionDef,
  RegionId,
  SpeakerLang,
  Text,
  WantedFlag,
} from '@/sim/types';

export interface PersonGenOptions {
  id: string;
  now: number;
  region: RegionDef;
  gender?: Gender;
  age?: [number, number];
  lang?: SpeakerLang;
  spec?: PersonSpec;
  home?: { address: string; city: string; coord?: LngLat };
  /** Last name to reuse (family members). */
  lastName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates
// ─────────────────────────────────────────────────────────────────────────────

const isoUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
const dateMs = (iso: string) => Date.parse(iso + 'T00:00:00Z');

/** Today's Tallinn calendar date as UTC midnight ms. */
function todayUtc(now: number): number {
  const w = wall(now);
  return Date.UTC(w.year, w.month - 1, w.day);
}

/** A date `days` from today (negative = past) as YYYY-MM-DD. */
const relDate = (now: number, days: number) => isoUtc(todayUtc(now) + days * DAY);

/** A birth date such that the person is exactly `age` today. */
function birthDateFor(rng: Rng, now: number, age: number): string {
  const w = wall(now);
  const end = Date.UTC(w.year - age, w.month - 1, w.day);
  const start = Date.UTC(w.year - age - 1, w.month - 1, w.day) + DAY;
  return isoUtc(start + rng.int(0, Math.round((end - start) / DAY)) * DAY);
}

/** Random date between two YYYY-MM-DD / ms bounds. */
function dateBetween(rng: Rng, fromMs: number, toMs: number): string {
  return isoUtc(fromMs + rng.int(0, Math.max(0, Math.floor((toMs - fromMs) / DAY))) * DAY);
}

/** Adult age bands: Estonian demographics, nudged towards the 25–55 who dominate police calls. */
const AGE_BANDS: [number, number, number][] = [
  [18, 24, 0.1],
  [25, 34, 0.18],
  [35, 44, 0.21],
  [45, 54, 0.18],
  [55, 64, 0.15],
  [65, 74, 0.12],
  [75, 80, 0.06],
];

function pickAge(rng: Rng, range?: [number, number]): number {
  if (range) return rng.int(Math.min(range[0], range[1]), Math.max(range[0], range[1]));
  const [lo, hi] = rng.weighted(AGE_BANDS, (b) => b[2]);
  return rng.int(lo, hi);
}

// ─────────────────────────────────────────────────────────────────────────────
// Language, home, citizenship
// ─────────────────────────────────────────────────────────────────────────────

interface Origin {
  lang: SpeakerLang;
  names: NameOrigin;
  citizenship: Citizenship;
  /** Lives abroad (tourist, visiting worker): foreign address and phone. */
  abroad: boolean;
}

interface Home {
  address: string;
  city: string;
  coord?: LngLat;
  ruShare: number;
  population?: number;
}

/** Russian speakers' citizenship by age and town (research §6.4): EST, else RUS, else grey passport. */
function pickRuCitizenship(rng: Rng, ruShare: number, age: number): Citizenship {
  const [est, rus] =
    ruShare > 0.8 ? [0.51, 0.36] : age < 35 ? [0.87, 0.07] : age < 60 ? [0.6, 0.2] : [0.41, 0.34];
  const r = rng.next();
  return r < est ? 'EST' : r < est + rus ? 'RUS' : 'XXA';
}

/** Name origin & citizenship for foreigners who speak Finnish or English. */
function foreignOrigin(rng: Rng, lang: 'fi' | 'en'): Origin {
  if (lang === 'fi') return { lang, names: 'fi', citizenship: 'FIN', abroad: rng.chance(0.85) };
  // English is the common language of Latvian/Lithuanian visitors; native speakers are expats.
  const r = rng.next();
  if (r < 0.4) return { lang, names: 'lv', citizenship: 'LVA', abroad: rng.chance(0.6) };
  if (r < 0.7) return { lang, names: 'lt', citizenship: 'LTU', abroad: rng.chance(0.6) };
  return { lang, names: 'en', citizenship: 'EST', abroad: false };
}

// prettier-ignore
const FOREIGN_CITIES: Partial<
  Record<Citizenship, { country: string; cities: [string, string][]; streets: string[] }>
> = {
  FIN: {
    country: 'Soome',
    cities: [
      ['Helsinki', '00'],
      ['Espoo', '02'],
      ['Vantaa', '01'],
      ['Tampere', '33'],
      ['Turku', '20'],
      ['Lahti', '15'],
      ['Kotka', '48'],
      ['Oulu', '90'],
    ],
    streets: [
      'Koulukatu', 'Kirkkokatu', 'Rantatie', 'Puistokatu', 'Asemakatu', 'Kauppakatu', 'Mäkitie', 'Koivukuja',
    ],
  },
  LVA: {
    country: 'Läti',
    cities: [
      ['Rīga', 'LV-10'],
      ['Valmiera', 'LV-42'],
      ['Valka', 'LV-47'],
      ['Cēsis', 'LV-41'],
      ['Liepāja', 'LV-34'],
    ],
    streets: ['Brīvības iela', 'Lāčplēša iela', 'Dzirnavu iela', 'Avotu iela', 'Rīgas iela', 'Skolas iela'],
  },
  LTU: {
    country: 'Leedu',
    cities: [
      ['Vilnius', 'LT-0'],
      ['Kaunas', 'LT-4'],
      ['Klaipėda', 'LT-9'],
      ['Šiauliai', 'LT-7'],
      ['Panevėžys', 'LT-3'],
    ],
    streets: ['Savanorių pr.', 'Gedimino pr.', 'Taikos pr.', 'Vytauto g.', 'Žalgirio g.', 'Liepų g.'],
  },
};

function foreignHome(rng: Rng, citizenship: Citizenship): Home | undefined {
  const f = FOREIGN_CITIES[citizenship];
  if (!f) return undefined;
  const [city, post] = rng.pick(f.cities);
  const street = rng.pick(f.streets);
  const num = rng.int(1, 120);
  if (citizenship === 'FIN') {
    const code = `${post}${rng.int(100, 990)}`.slice(0, 5).padEnd(5, '0');
    const flat = `${rng.pick(['A', 'B', 'C'])} ${rng.int(1, 40)}`;
    return { address: `${street} ${num} ${flat}, ${code} ${city}, ${f.country}`, city, ruShare: 0 };
  }
  return { address: `${street} ${num}-${rng.int(1, 60)}, ${city}, ${f.country}`, city, ruShare: 0 };
}

/** Decide language, home and citizenship (DESIGN: language follows the home town's ruShare). */
function resolveOrigin(rng: Rng, o: PersonGenOptions, age: number): { origin: Origin; home: Home } {
  const lang = o.lang;
  if (lang === 'fi' || lang === 'en') {
    const origin = foreignOrigin(rng, lang);
    const abroad = origin.abroad ? foreignHome(rng, origin.citizenship) : undefined;
    if (abroad && !o.home) return { origin, home: abroad };
    origin.abroad = false;
    return { origin, home: o.home ? withRu(o) : homeAddress(rng, o.region, lang) };
  }
  let home: Home;
  let chosen: SpeakerLang;
  if (lang) {
    chosen = lang;
    home = o.home ? withRu(o) : homeAddress(rng, o.region, lang);
  } else {
    home = o.home ? withRu(o) : homeAddress(rng, o.region);
    const r = rng.next();
    // Recent Ukrainian arrivals cluster where Russian is widely spoken (≈2 % rural … 6 % Narva).
    const uk = 0.015 + 0.05 * home.ruShare;
    chosen = r < uk ? 'uk' : r < uk + home.ruShare * (1 - uk) ? 'ru' : 'et';
    // A few English-speaking expats in the bigger, mostly Estonian-speaking towns.
    if (chosen === 'et' && (home.population ?? 0) >= 50000 && home.ruShare < 0.5 && rng.chance(0.004)) {
      return { origin: { lang: 'en', names: 'en', citizenship: 'EST', abroad: false }, home };
    }
  }
  if (chosen === 'ru') {
    return {
      origin: {
        lang: 'ru',
        names: 'ru',
        citizenship: pickRuCitizenship(rng, home.ruShare, age),
        abroad: false,
      },
      home,
    };
  }
  if (chosen === 'uk')
    return { origin: { lang: 'uk', names: 'uk', citizenship: 'UKR', abroad: false }, home };
  return { origin: { lang: 'et', names: 'et', citizenship: 'EST', abroad: false }, home };
}

function withRu(o: PersonGenOptions): Home {
  const h = o.home!;
  return { address: h.address, city: h.city, coord: h.coord, ruShare: townRuShare(o.region, h.city) };
}

function phoneFor(rng: Rng, origin: Origin, age: number): string {
  if (age < 7) return '';
  if (origin.abroad && rng.chance(0.85)) return foreignMobile(rng, origin.citizenship);
  if (origin.citizenship === 'UKR' && rng.chance(0.25)) return foreignMobile(rng, 'UKR');
  return mobileNumber(rng, age);
}

// ─────────────────────────────────────────────────────────────────────────────
// Occupation
// ─────────────────────────────────────────────────────────────────────────────

function pensionChance(age: number): number {
  if (age < 63) return 0;
  if (age < 65) return 0.35;
  if (age < 70) return 0.72;
  if (age < 75) return 0.88;
  return 0.97;
}

function pickJob(rng: Rng, age: number, gender: Gender, lang: SpeakerLang, region: RegionId): Occupation {
  const ruLike = lang === 'ru' || lang === 'uk';
  const jobs = OCCUPATIONS.filter((x) => !x.status && x.minAge <= age && x.maxAge >= age);
  if (!jobs.length) return OCCUPATION_BY_ID.pensionar;
  return rng.weighted(jobs, (x) => {
    const f = x.female ?? 0.5;
    const g = gender === 'F' ? f * 2 : (1 - f) * 2;
    const ru = ruLike ? (x.ru ?? 1) : 1;
    const reg = x.regions ? (x.regions.includes(region) ? 3 : 0.4) : 1;
    return x.weight * g * ru * reg;
  });
}

function pickOccupation(
  rng: Rng,
  age: number,
  gender: Gender,
  lang: SpeakerLang,
  region: RegionId,
): Occupation {
  const id = (k: string) => OCCUPATION_BY_ID[k];
  if (age < 7) return id('lasteaialaps');
  if (age < 16) return id('opilane');
  if (age < 19) {
    const r = rng.next();
    if (r < 0.75) return id('opilane');
    if (r < 0.92) return id('kutseopilane');
    return pickJob(rng, age, gender, lang, region);
  }
  if (age <= 26 && rng.chance(age <= 24 ? (lang === 'et' ? 0.4 : 0.25) : 0.1)) return id('yliopilane');
  if (rng.chance(pensionChance(age))) return id('pensionar');
  if (age >= 20 && age <= 43 && rng.chance(gender === 'F' ? 0.07 : 0.006)) return id('lapsehoolduspuhkus');
  if (age < 65) {
    const jobless = (lang === 'et' ? 0.055 : 0.09) * (region === 'ida' ? 1.6 : 1);
    if (rng.chance(jobless)) return id('tootu');
    if (rng.chance(age >= 40 ? 0.03 : 0.012)) return id('toovoimetu');
  }
  return pickJob(rng, age, gender, lang, region);
}

// ─────────────────────────────────────────────────────────────────────────────
// Appearance & clothing
// ─────────────────────────────────────────────────────────────────────────────

/** Colours: Estonian nominative singular, nominative plural, English. */
const COLORS: [string, string, string][] = [
  ['must', 'mustad', 'black'], // 0
  ['valge', 'valged', 'white'], // 1
  ['hall', 'hallid', 'grey'], // 2
  ['tumehall', 'tumehallid', 'dark grey'], // 3
  ['sinine', 'sinised', 'blue'], // 4
  ['tumesinine', 'tumesinised', 'navy blue'], // 5
  ['helesinine', 'helesinised', 'light blue'], // 6
  ['punane', 'punased', 'red'], // 7
  ['bordoopunane', 'bordoopunased', 'burgundy'], // 8
  ['roheline', 'rohelised', 'green'], // 9
  ['tumeroheline', 'tumerohelised', 'dark green'], // 10
  ['oliivroheline', 'oliivrohelised', 'olive green'], // 11
  ['pruun', 'pruunid', 'brown'], // 12
  ['beež', 'beežid', 'beige'], // 13
  ['kollane', 'kollased', 'yellow'], // 14
  ['oranž', 'oranžid', 'orange'], // 15
  ['lilla', 'lillad', 'purple'], // 16
  ['roosa', 'roosad', 'pink'], // 17
  ['khakivärvi', 'khakivärvi', 'khaki'], // 18
];

type Wear = 'winter' | 'mild' | 'summer';
type Slot = 'top' | 'dress' | 'bottom' | 'skirt' | 'hat';

interface Garment {
  et: string;
  en: string;
  slot: Slot;
  wear: Wear[];
  colors: number[];
  w: number;
  gender?: Gender;
  minAge?: number;
  maxAge?: number;
  hood?: boolean;
}

const GARMENTS: Garment[] = [
  // Tops
  {
    et: 'talvejope',
    en: 'winter jacket',
    slot: 'top',
    wear: ['winter'],
    colors: [0, 0, 0, 3, 5, 10, 7, 2, 11],
    w: 4,
  },
  {
    et: 'sulejope',
    en: 'down jacket',
    slot: 'top',
    wear: ['winter'],
    colors: [0, 0, 5, 7, 2, 13, 10],
    w: 2.5,
  },
  { et: 'parka', en: 'parka', slot: 'top', wear: ['winter'], colors: [11, 0, 5, 10, 18], w: 1.2, maxAge: 55 },
  {
    et: 'villane mantel',
    en: 'wool coat',
    slot: 'top',
    wear: ['winter', 'mild'],
    colors: [0, 2, 13, 12, 8, 5],
    w: 1.5,
    minAge: 30,
  },
  {
    et: 'kerge jope',
    en: 'light jacket',
    slot: 'top',
    wear: ['mild'],
    colors: [0, 0, 5, 2, 11, 8, 13],
    w: 3,
  },
  {
    et: 'tuulejope',
    en: 'windbreaker',
    slot: 'top',
    wear: ['mild', 'summer'],
    colors: [0, 5, 7, 9, 14, 2, 15],
    w: 1.6,
  },
  { et: 'nahkjope', en: 'leather jacket', slot: 'top', wear: ['mild'], colors: [0, 0, 0, 12], w: 1.4 },
  {
    et: 'teksajakk',
    en: 'denim jacket',
    slot: 'top',
    wear: ['mild', 'summer'],
    colors: [4, 6, 0],
    w: 0.8,
    maxAge: 55,
  },
  {
    et: 'kapuutsiga pusa',
    en: 'hoodie',
    slot: 'top',
    wear: ['mild', 'summer', 'winter'],
    colors: [0, 0, 2, 3, 5, 8, 10],
    w: 2.4,
    maxAge: 40,
    hood: true,
  },
  { et: 'vihmajope', en: 'rain jacket', slot: 'top', wear: ['mild'], colors: [14, 5, 0, 7, 9], w: 0.8 },
  { et: 'mantel', en: 'coat', slot: 'top', wear: ['mild'], colors: [13, 0, 2, 12, 8], w: 1.2, minAge: 25 },
  { et: 'kampsun', en: 'jumper', slot: 'top', wear: ['mild'], colors: [2, 5, 8, 12, 13, 10], w: 1 },
  { et: 'T-särk', en: 'T-shirt', slot: 'top', wear: ['summer'], colors: [1, 1, 0, 0, 2, 5, 7, 9, 14], w: 5 },
  {
    et: 'polosärk',
    en: 'polo shirt',
    slot: 'top',
    wear: ['summer'],
    colors: [1, 5, 0, 7, 6],
    w: 1.2,
    gender: 'M',
  },
  { et: 'triiksärk', en: 'shirt', slot: 'top', wear: ['summer'], colors: [1, 6, 5, 2], w: 1.2 },
  {
    et: 'pluus',
    en: 'blouse',
    slot: 'top',
    wear: ['summer'],
    colors: [1, 6, 17, 7, 13, 0],
    w: 2,
    gender: 'F',
  },
  {
    et: 'topp',
    en: 'top',
    slot: 'top',
    wear: ['summer'],
    colors: [1, 0, 17, 7],
    w: 1.2,
    gender: 'F',
    maxAge: 35,
  },
  {
    et: 'kleit',
    en: 'dress',
    slot: 'dress',
    wear: ['summer'],
    colors: [0, 7, 5, 9, 1, 17, 14],
    w: 2.2,
    gender: 'F',
  },
  // Bottoms
  {
    et: 'teksad',
    en: 'jeans',
    slot: 'bottom',
    wear: ['winter', 'mild', 'summer'],
    colors: [4, 4, 4, 6, 0, 0, 2],
    w: 5,
  },
  {
    et: 'püksid',
    en: 'trousers',
    slot: 'bottom',
    wear: ['winter', 'mild', 'summer'],
    colors: [0, 0, 3, 5, 13, 18],
    w: 3,
  },
  {
    et: 'dressipüksid',
    en: 'tracksuit bottoms',
    slot: 'bottom',
    wear: ['winter', 'mild'],
    colors: [0, 0, 2, 5],
    w: 1.4,
    maxAge: 55,
  },
  { et: 'lühikesed püksid', en: 'shorts', slot: 'bottom', wear: ['summer'], colors: [4, 13, 0, 18, 2], w: 3 },
  {
    et: 'retuusid',
    en: 'leggings',
    slot: 'bottom',
    wear: ['winter', 'mild'],
    colors: [0, 0, 2],
    w: 1.5,
    gender: 'F',
    maxAge: 50,
  },
  {
    et: 'seelik',
    en: 'skirt',
    slot: 'skirt',
    wear: ['mild', 'summer'],
    colors: [0, 5, 2, 7, 13],
    w: 1.6,
    gender: 'F',
  },
  // Headwear
  {
    et: 'kootud müts',
    en: 'knitted hat',
    slot: 'hat',
    wear: ['winter', 'mild'],
    colors: [0, 2, 7, 5, 1, 14],
    w: 1,
  },
  {
    et: 'nokamüts',
    en: 'cap',
    slot: 'hat',
    wear: ['mild', 'summer'],
    colors: [0, 5, 1, 7, 2],
    w: 1,
    gender: 'M',
    maxAge: 50,
  },
];

/** Clothing weather class for the month (November and March can go either way). */
function wearFor(rng: Rng, month: number): Wear {
  const season = seasonOf(month);
  if (season === 'winter') return 'winter';
  if (season === 'summer') return month === 6 || month === 7 || rng.chance(0.7) ? 'summer' : 'mild';
  if (month === 11 || month === 3) return rng.chance(0.55) ? 'winter' : 'mild';
  if (month === 5 || month === 9) return rng.chance(0.3) ? 'summer' : 'mild';
  return 'mild';
}

function pickGarment(rng: Rng, slots: Slot[], wear: Wear, gender: Gender, age: number): Garment | undefined {
  const pool = GARMENTS.filter(
    (g) =>
      slots.includes(g.slot) &&
      g.wear.includes(wear) &&
      (!g.gender || g.gender === gender) &&
      (g.minAge === undefined || age >= g.minAge) &&
      (g.maxAge === undefined || age <= g.maxAge),
  );
  return pool.length ? rng.weighted(pool, (g) => g.w) : undefined;
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function listEn(items: string[]): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Season-appropriate clothing: "seljas must talvejope, jalas sinised teksad, peas hall kootud müts". */
export function makeClothing(rng: Rng, gender: Gender, age: number, month: number): Text {
  const wear = wearFor(rng, month);
  const top = pickGarment(rng, ['top', 'dress'], wear, gender, age)!;
  // One retry avoids head-to-toe single-colour outfits.
  const color = (g: Garment, avoid?: (typeof COLORS)[number]) => {
    const c = COLORS[rng.pick(g.colors)];
    return c === avoid ? COLORS[rng.pick(g.colors)] : c;
  };
  const tc = color(top);
  const etParts: string[] = [];
  const enItems: string[] = [];
  let etTop = `${tc[0]} ${top.et}`;
  let enTop = `${article(tc[2])} ${tc[2]} ${top.en}`;
  const hoodUp = top.hood && rng.chance(0.25);
  if (hoodUp) enTop += ' with the hood up';
  if (top.slot !== 'dress') {
    const bottom = pickGarment(
      rng,
      gender === 'F' && wear !== 'winter' ? ['bottom', 'skirt'] : ['bottom'],
      wear,
      gender,
      age,
    );
    if (bottom?.slot === 'skirt') {
      const bc = color(bottom, tc);
      etTop += ` ja ${bc[0]} ${bottom.et}`;
      enItems.push(enTop, `${article(bc[2])} ${bc[2]} ${bottom.en}`);
      etParts.push(`seljas ${etTop}`);
    } else {
      etParts.push(`seljas ${etTop}`);
      enItems.push(enTop);
      if (bottom) {
        const bc = color(bottom, tc);
        etParts.push(`jalas ${bc[1]} ${bottom.et}`);
        enItems.push(`${bc[2]} ${bottom.en}`);
      }
    }
  } else {
    etParts.push(`seljas ${etTop}`);
    enItems.push(enTop);
  }
  if (hoodUp) etParts.push('kapuuts peas');
  else {
    const hatChance = wear === 'winter' ? 0.7 : wear === 'mild' ? 0.15 : 0.08;
    const hat = rng.chance(hatChance) ? pickGarment(rng, ['hat'], wear, gender, age) : undefined;
    if (hat) {
      const hc = color(hat);
      etParts.push(`peas ${hc[0]} ${hat.et}`);
      enItems.push(`${article(hc[2])} ${hc[2]} ${hat.en}`);
    }
  }
  return { et: etParts.join(', '), en: `wearing ${listEn(enItems)}` };
}

function pickBuild(rng: Rng, age: number): Appearance['build'] {
  const w: Record<Appearance['build'], number> =
    age < 30
      ? { slim: 0.3, average: 0.42, athletic: 0.18, heavy: 0.1 }
      : age < 60
        ? { slim: 0.15, average: 0.45, athletic: 0.12, heavy: 0.28 }
        : { slim: 0.2, average: 0.47, athletic: 0.05, heavy: 0.28 };
  return rng.weighted(Object.keys(w) as Appearance['build'][], (k) => w[k]);
}

function pickHair(rng: Rng, gender: Gender, age: number): Appearance['hair'] {
  if (gender === 'M') {
    const bald = age < 30 ? 0.02 : age < 45 ? 0.07 : age < 55 ? 0.16 : 0.3;
    if (rng.chance(bald)) return 'bald';
    return rng.weighted(
      ['short', 'buzz', 'shaved', 'long', 'ponytail', 'curly'] as const,
      (h) =>
        ({
          short: 0.55,
          buzz: 0.18,
          shaved: 0.08,
          long: age < 40 ? 0.06 : 0.03,
          ponytail: 0.02,
          curly: 0.05,
        })[h],
    );
  }
  const older = age >= 55;
  return rng.weighted(
    ['long', 'ponytail', 'short', 'curly', 'buzz'] as const,
    (h) =>
      ({
        long: older ? 0.2 : 0.46,
        ponytail: older ? 0.05 : 0.16,
        short: older ? 0.6 : 0.22,
        curly: 0.12,
        buzz: 0.01,
      })[h],
  );
}

function pickHairColor(rng: Rng, gender: Gender, age: number, lang: SpeakerLang): Appearance['hairColor'] {
  const greyP = age < 40 ? 0.02 : age < 50 ? 0.12 : age < 60 ? 0.4 : age < 70 ? 0.72 : 0.9;
  // Women often dye instead of going grey.
  if (gender === 'F' && age >= 40 && rng.chance(0.35)) return 'dyed';
  if (rng.chance(greyP)) return age >= 72 && rng.chance(0.5) ? 'white' : 'grey';
  if (gender === 'F' && rng.chance(0.12)) return 'dyed';
  const nordic = lang === 'et' || lang === 'fi' || lang === 'en';
  const w = nordic
    ? { blond: 0.36, brown: 0.43, black: 0.07, red: 0.04 }
    : { blond: 0.2, brown: 0.5, black: 0.17, red: 0.03 };
  return rng.weighted(['blond', 'brown', 'black', 'red'] as const, (k) => w[k]);
}

function pickEyes(rng: Rng, lang: SpeakerLang): Appearance['eyes'] {
  const nordic = lang === 'et' || lang === 'fi';
  const w = nordic
    ? { blue: 0.5, grey: 0.2, green: 0.15, brown: 0.15 }
    : { blue: 0.3, grey: 0.2, green: 0.15, brown: 0.35 };
  return rng.weighted(['blue', 'grey', 'green', 'brown'] as const, (k) => w[k]);
}

function pickBeard(rng: Rng, gender: Gender, age: number): Appearance['beard'] {
  if (gender !== 'M' || age < 16) return undefined;
  const w =
    age < 25
      ? { none: 0.65, stubble: 0.2, goatee: 0.07, full: 0.08, moustache: 0 }
      : age < 60
        ? { none: 0.55, stubble: 0.2, full: 0.14, goatee: 0.06, moustache: 0.05 }
        : { none: 0.6, stubble: 0.1, full: 0.15, goatee: 0, moustache: 0.15 };
  const b = rng.weighted(['none', 'stubble', 'full', 'goatee', 'moustache'] as const, (k) => w[k]);
  return b === 'none' ? undefined : b;
}

function pickHeight(rng: Rng, gender: Gender, age: number): number {
  const adult = gender === 'M' ? rng.normal(180.5, 6.8) : rng.normal(167, 6.2);
  if (age < 18) {
    const f = gender === 'M' ? Math.min(1, 0.45 + age * 0.032) : Math.min(1, 0.47 + age * 0.035);
    return Math.round(adult * f);
  }
  const h = adult - (age > 65 ? 2 : 0);
  return Math.round(gender === 'M' ? Math.min(205, Math.max(155, h)) : Math.min(192, Math.max(145, h)));
}

function makeAppearance(
  rng: Rng,
  gender: Gender,
  age: number,
  lang: SpeakerLang,
  month: number,
  rough: boolean,
): Appearance {
  const glassesP = age < 30 ? 0.15 : age < 45 ? 0.25 : age < 60 ? 0.45 : 0.65;
  const tattooP = age < 16 ? 0 : (gender === 'M' ? 0.14 : 0.1) * (rough ? 2.2 : 1) * (age > 65 ? 0.5 : 1);
  const tattoos = TATTOOS.filter((t) => (!t.gender || t.gender === gender) && (!t.rough || rough));
  const a: Appearance = {
    heightCm: pickHeight(rng, gender, age),
    build: pickBuild(rng, age),
    hair: pickHair(rng, gender, age),
    hairColor: pickHairColor(rng, gender, age, lang),
    eyes: pickEyes(rng, lang),
    clothing: { et: '', en: '' },
  };
  const beard = pickBeard(rng, gender, age);
  if (beard) a.beard = beard;
  if (rng.chance(glassesP)) a.glasses = true;
  if (rng.chance(tattooP)) a.tattoo = rng.pick(tattoos).text.et;
  a.clothing = makeClothing(rng, gender, age, month);
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Driving licence & weapon permit
// ─────────────────────────────────────────────────────────────────────────────

function licenseHoldChance(age: number, gender: Gender): number {
  if (age < 18) return 0;
  if (age < 20) return 0.45;
  if (age < 25) return 0.72;
  if (age < 65) return gender === 'M' ? 0.9 : 0.82;
  if (age < 75) return gender === 'M' ? 0.85 : 0.65;
  return gender === 'M' ? 0.65 : 0.4;
}

function licenseCategories(rng: Rng, gender: Gender, job: Occupation): string[] {
  const m = gender === 'M';
  const cats = new Set<string>(['B']);
  if (rng.chance(m ? 0.1 : 0.015)) cats.add('A');
  if (rng.chance(m ? 0.12 : 0.02)) cats.add('BE');
  const trucker = job.id === 'veoautojuht' || (job.id === 'autojuht' && rng.chance(0.5));
  if (trucker || (m && rng.chance(0.08))) {
    cats.add('C');
    if (trucker ? rng.chance(0.8) : rng.chance(0.4)) cats.add('CE');
  }
  if (job.id === 'bussijuht') cats.add('D');
  return ['A', 'B', 'BE', 'C', 'CE', 'D'].filter((c) => cats.has(c));
}

/** Age at first licence: most Estonians get it at 18–19. */
const FIRST_LICENSE_AGE: [number, number][] = [
  [18, 0.42],
  [19, 0.18],
  [21, 0.15],
  [24, 0.1],
  [30, 0.1],
  [38, 0.05],
];

function makeLicense(
  rng: Rng,
  o: { now: number; age: number; gender: Gender; job: Occupation; noLicense?: number },
): Person['license'] {
  const { now, age, gender, job } = o;
  if (age < 18) return { status: 'none', categories: [] };
  if (o.noLicense && rng.chance(o.noLicense)) {
    const status = rng.weighted(
      ['suspended', 'revoked', 'none', 'expired'] as const,
      (s) => ({ suspended: 0.35, revoked: 0.25, none: 0.25, expired: 0.15 })[s],
    );
    if (status === 'none') return { status, categories: [] };
    const validUntil =
      status === 'expired' ? relDate(now, -rng.int(20, 900)) : relDate(now, rng.int(60, 3000));
    return { status, categories: licenseCategories(rng, gender, job), validUntil };
  }
  if (!rng.chance(licenseHoldChance(age, gender))) return { status: 'none', categories: [] };
  const firstAge = Math.min(age, rng.weighted(FIRST_LICENSE_AGE, (x) => x[1])[0]);
  const licensedDays = Math.max(0, (age - firstAge) * 365 + rng.int(0, 300));
  const categories = licenseCategories(rng, gender, job);
  if (licensedDays < 730) {
    // Esmane juhiluba: valid for 2 years from issue.
    return {
      status: 'valid',
      categories: ['B'],
      validUntil: relDate(now, 730 - licensedDays),
      probationary: true,
    };
  }
  const r = rng.next();
  if (r < 0.04) return { status: 'expired', categories, validUntil: relDate(now, -rng.int(15, 900)) };
  if (r < 0.056) return { status: 'suspended', categories, validUntil: relDate(now, rng.int(60, 3000)) };
  if (r < 0.066) return { status: 'revoked', categories };
  return { status: 'valid', categories, validUntil: relDate(now, rng.int(30, 3650)) };
}

// prettier-ignore
const PERMIT_KINDS: { kind: Text; weapons: string[]; w: number; minAge: number; max: number }[] = [
  {
    kind: { et: 'Jahirelvaluba', en: 'Hunting firearms licence' },
    weapons: [
      'Sauer 101 (vintraud)', 'Tikka T3x (vintraud)', 'Blaser R8 (vintraud)', 'Sako 85 (vintraud)',
      'CZ 557 (vintraud)', 'Merkel RX Helix (vintraud)', 'Beretta A400 (sileraudne)',
      'Browning B525 (sileraudne)', 'Benelli M2 (sileraudne)', 'Baikal MP-27 (sileraudne)',
      'Franchi Affinity (sileraudne)',
    ],
    w: 0.6,
    minAge: 18,
    max: 3,
  },
  {
    kind: { et: 'Relvaluba enesekaitseks', en: 'Firearms licence (self-defence)' },
    weapons: [
      'Glock 17', 'Glock 19', 'CZ P-10 C', 'Walther PPQ', 'SIG Sauer P320', 'Heckler & Koch SFP9',
      'Beretta APX',
    ],
    w: 0.25,
    minAge: 21,
    max: 2,
  },
  {
    kind: { et: 'Spordirelvaluba', en: 'Sport shooting licence' },
    weapons: [
      'CZ Shadow 2',
      'Glock 34',
      'Tanfoglio Stock II',
      'Anschütz 1903 (väikekaliibriline)',
      'Ruger 10/22 (väikekaliibriline)',
    ],
    w: 0.15,
    minAge: 18,
    max: 2,
  },
];

function makeWeaponPermit(rng: Rng, now: number, age: number): Person['weaponPermit'] {
  const kinds = PERMIT_KINDS.filter((k) => age >= k.minAge);
  if (!kinds.length) return undefined;
  const k = rng.weighted(kinds, (x) => x.w);
  const n = rng.int(1, k.max);
  const weapons = rng.shuffle([...k.weapons]).slice(0, n);
  return { kind: k.kind, validUntil: relDate(now, rng.int(30, 1825)), weapons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Criminal records & flags
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
/** Never use these in random backgrounds (tone; see docs/research/law-references.md). */
const EXCLUDED_TAGS = [
  'sexual', 'sex', 'child', 'children', 'minor', 'terror', 'treason', 'state', 'legal_person',
];
/** Background frequency of a law (registry-data's optional `weight`; 0 = never random). */
const lawWeight = (l: Law): number => (l as Law & { weight?: number }).weight ?? 1;
const usableLaws = (): Law[] =>
  LAWS.filter((l) => lawWeight(l) > 0 && !l.tags.some((t) => EXCLUDED_TAGS.includes(t)));

const RECORD_TAGS: { tag: string; m: number; f: number }[] = [
  { tag: 'traffic', m: 0.32, f: 0.3 },
  { tag: 'property', m: 0.22, f: 0.36 },
  { tag: 'violence', m: 0.17, f: 0.08 },
  { tag: 'order', m: 0.12, f: 0.1 },
  { tag: 'drugs', m: 0.09, f: 0.1 },
  { tag: 'domestic', m: 0.06, f: 0.01 },
  { tag: 'weapons', m: 0.02, f: 0.005 },
  { tag: 'fraud', m: 0.04, f: 0.06 },
];

const FALLBACK_PUNISHMENT: Record<Law['kind'], Text> = {
  crime: { et: 'Rahaline karistus', en: 'Pecuniary punishment' },
  misdemeanour: { et: 'Rahatrahv', en: 'Fine' },
};

function pickLaw(rng: Rng, laws: Law[], gender: Gender, tag?: string): Law {
  const t = tag ?? rng.weighted(RECORD_TAGS, (x) => (gender === 'M' ? x.m : x.f)).tag;
  const tagged = laws.filter((l) => l.tags.includes(t));
  return rng.weighted(tagged.length ? tagged : laws, lawWeight);
}

function makeRecord(rng: Rng, law: Law, fromMs: number, toMs: number): CriminalRecord {
  return {
    date: dateBetween(rng, fromMs, toMs),
    lawId: law.id,
    kind: law.kind,
    punishment: law.punishments.length ? rng.pick(law.punishments) : FALLBACK_PUNISHMENT[law.kind],
  };
}

function makeRecords(
  rng: Rng,
  o: { now: number; birthDate: string; gender: Gender; count: number },
): CriminalRecord[] {
  const laws = usableLaws();
  if (!laws.length || o.count <= 0) return [];
  const adult = dateMs(o.birthDate) + 18 * 365.25 * DAY;
  const today = todayUtc(o.now);
  if (adult >= today) return [];
  const out: CriminalRecord[] = [];
  for (let i = 0; i < o.count; i++) out.push(makeRecord(rng, pickLaw(rng, laws, o.gender), adult, today));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const RECORD_COUNT: [number, number][] = [
  [1, 0.45],
  [2, 0.25],
  [3, 0.15],
  [4, 0.1],
  [5, 0.05],
];

const REGION_AUTHORITY: Record<RegionId, { court: string; prosecutor: string }> = {
  pohja: { court: 'Harju Maakohus', prosecutor: 'Põhja Ringkonnaprokuratuur' },
  ida: { court: 'Viru Maakohus', prosecutor: 'Viru Ringkonnaprokuratuur' },
  louna: { court: 'Tartu Maakohus', prosecutor: 'Lõuna Ringkonnaprokuratuur' },
  laane: { court: 'Pärnu Maakohus', prosecutor: 'Lääne Ringkonnaprokuratuur' },
};

interface WantedReason {
  reason: Text;
  by: 'court' | 'prosecutor';
  w: number;
  dangerous: number;
  armed: number;
}

const WANTED_REASONS: WantedReason[] = [
  {
    reason: {
      et: 'Vahistamismäärus — kahtlustatav röövimises (KarS § 200)',
      en: 'Arrest warrant — suspected of robbery (Penal Code § 200)',
    },
    by: 'court',
    w: 1,
    dangerous: 0.6,
    armed: 0.3,
  },
  {
    reason: { et: 'Kõrvalehoidumine vangistuse kandmisest', en: 'Evading a prison sentence' },
    by: 'court',
    w: 1.2,
    dangerous: 0.25,
    armed: 0.05,
  },
  {
    reason: {
      et: 'Vahistamismäärus — kahtlustatav raske tervisekahjustuse tekitamises (KarS § 118)',
      en: 'Arrest warrant — suspected of causing serious harm to health (Penal Code § 118)',
    },
    by: 'court',
    w: 0.6,
    dangerous: 0.75,
    armed: 0.25,
  },
  {
    reason: {
      et: 'Vahistamismäärus — kahtlustatav narkootilise aine suures koguses käitlemises (KarS § 184)',
      en: 'Arrest warrant — suspected of handling a large quantity of drugs (Penal Code § 184)',
    },
    by: 'court',
    w: 0.8,
    dangerous: 0.35,
    armed: 0.15,
  },
  {
    reason: {
      et: 'Vahistamismäärus — kahtlustatav varguste toimepanemises (KarS § 199)',
      en: 'Arrest warrant — suspected of a series of thefts (Penal Code § 199)',
    },
    by: 'court',
    w: 1,
    dangerous: 0.1,
    armed: 0.02,
  },
  {
    reason: {
      et: 'Vahistamismäärus — kahtlustatav kelmuses (KarS § 209)',
      en: 'Arrest warrant — suspected of fraud (Penal Code § 209)',
    },
    by: 'court',
    w: 0.6,
    dangerous: 0.05,
    armed: 0,
  },
  {
    reason: {
      et: 'Tagaotsitav — kriminaalmenetlusest kõrvalehoidumine',
      en: 'Wanted — evading criminal proceedings',
    },
    by: 'prosecutor',
    w: 1,
    dangerous: 0.2,
    armed: 0.05,
  },
  {
    reason: {
      et: 'Vahistamismäärus — kahtlustatav tapmises (KarS § 113)',
      en: 'Arrest warrant — suspected of manslaughter (Penal Code § 113)',
    },
    by: 'court',
    w: 0.15,
    dangerous: 1,
    armed: 0.5,
  },
  {
    reason: {
      et: 'Vahistamismäärus — lähenemiskeelu korduv rikkumine (KarS § 331²)',
      en: 'Arrest warrant — repeated breach of a restraining order (Penal Code § 331²)',
    },
    by: 'court',
    w: 0.5,
    dangerous: 0.5,
    armed: 0.1,
  },
  {
    reason: {
      et: 'Sundtoomine — korduv kohtuistungilt puudumine',
      en: 'Compulsory attendance — repeatedly failed to appear in court',
    },
    by: 'court',
    w: 0.6,
    dangerous: 0.05,
    armed: 0,
  },
];

function pickAuthority(rng: Rng, region: RegionId, by: WantedReason['by']): string {
  const home = rng.chance(0.8) ? region : rng.pick(Object.keys(REGION_AUTHORITY) as RegionId[]);
  return REGION_AUTHORITY[home][by];
}

function makeWanted(rng: Rng, now: number, region: RegionId): WantedFlag {
  const r = rng.weighted(WANTED_REASONS, (x) => x.w);
  const flag: WantedFlag = {
    reason: r.reason,
    since: relDate(now, -rng.int(2, 420)),
    dangerous: rng.chance(r.dangerous),
    authority: pickAuthority(rng, region, r.by),
  };
  if (rng.chance(r.armed)) flag.armed = true;
  return flag;
}

const EU = new Set<Citizenship>(['EST', 'LVA', 'LTU', 'FIN']);

function makeSis(rng: Rng, citizenship: Citizenship, wanted: boolean): Text {
  const country = rng.pick([
    { et: 'Soome', en: 'Finland' },
    { et: 'Läti', en: 'Latvia' },
    { et: 'Leedu', en: 'Lithuania' },
    { et: 'Saksamaa', en: 'Germany' },
    { et: 'Rootsi', en: 'Sweden' },
    { et: 'Poola', en: 'Poland' },
  ]);
  const options: Text[] = [
    {
      et: `SIS: diskreetne kontroll (${country.et} taotlusel)`,
      en: `SIS: discreet check (requested by ${country.en})`,
    },
    {
      et: `SIS: isik otsitav tunnistajana kohtumenetluses (${country.et})`,
      en: `SIS: sought as a witness in court proceedings (${country.en})`,
    },
  ];
  if (wanted)
    options.push({
      et: `SIS: Euroopa vahistamismäärus (${country.et})`,
      en: `SIS: European Arrest Warrant (${country.en})`,
    });
  if (!EU.has(citizenship))
    options.push({ et: 'SIS: sissesõidukeeld Schengeni alale', en: 'SIS: entry ban to the Schengen area' });
  return rng.pick(options);
}

const NOTE = {
  aggressive: { et: 'Agressiivne alkoholijoobes', en: 'Aggressive when intoxicated' },
  resisted: { et: 'Osutanud varem politseile vastupanu', en: 'Has resisted police before' },
  knife: { et: 'Võib kanda nuga', en: 'May carry a knife' },
  drugs: { et: 'Narkootikumide tarvitaja', en: 'Known drug user' },
  flight: { et: 'Põgenemisoht', en: 'Flight risk' },
  dog: { et: 'Aadressil agressiivne koer', en: 'Aggressive dog at the address' },
  diabetic: { et: 'Diabeetik', en: 'Diabetic' },
  epileptic: { et: 'Epileptik', en: 'Epileptic' },
  asthma: { et: 'Astmaatik', en: 'Asthmatic' },
  heart: { et: 'Südamehaige', en: 'Heart condition' },
  hearing: { et: 'Kuulmispuudega', en: 'Hearing impaired' },
  dementia: { et: 'Dementsus', en: 'Dementia' },
  noEstonian: { et: 'Eesti keelt ei valda', en: 'Does not speak Estonian' },
} satisfies Record<string, Text>;

function makeNotes(
  rng: Rng,
  o: {
    age: number;
    lang: SpeakerLang;
    tags: Set<string>;
    hasRecords: boolean;
    wanted: boolean;
    intoxicated: number;
  },
): Text[] {
  const notes: Text[] = [];
  const add = (p: number, t: Text) => {
    if (notes.length < 3 && rng.chance(p)) notes.push(t);
  };
  add((o.hasRecords ? 0.22 : 0.01) + o.intoxicated * 0.3, NOTE.aggressive);
  if (o.hasRecords) add(0.12, NOTE.resisted);
  if (o.tags.has('violence') || o.tags.has('weapons')) add(0.15, NOTE.knife);
  if (o.tags.has('drugs')) add(0.4, NOTE.drugs);
  if (o.wanted) add(0.4, NOTE.flight);
  add(0.02, NOTE.dog);
  add(0.03, NOTE.diabetic);
  add(0.01, NOTE.epileptic);
  add(0.02, NOTE.asthma);
  if (o.age > 55) add(0.04, NOTE.heart);
  add(o.age > 65 ? 0.03 : 0.005, NOTE.hearing);
  if (o.age > 75) add(0.06, NOTE.dementia);
  const noEt =
    o.lang === 'ru' ? (o.age > 50 ? 0.35 : 0.08) : o.lang === 'uk' ? 0.7 : o.lang === 'et' ? 0 : 0.9;
  add(noEt, NOTE.noEstonian);
  return notes;
}

// ─────────────────────────────────────────────────────────────────────────────
// generatePerson
// ─────────────────────────────────────────────────────────────────────────────

/** Women are ~51 % of working-age adults and ~63 % of people over 65. */
function pickGender(rng: Rng, o: PersonGenOptions, age: number): Gender {
  if (o.gender) return o.gender;
  const g = o.spec?.gender;
  if (g && g !== 'any') return g;
  return rng.chance(age >= 65 ? 0.63 : 0.51) ? 'F' : 'M';
}

/** Random person registry record; fully deterministic for a given rng state and options. */
export function generatePerson(rng: Rng, o: PersonGenOptions): Person {
  const spec = o.spec;
  const age = pickAge(rng, o.age ?? spec?.age);
  const gender = pickGender(rng, o, age);
  const birthDate = birthDateFor(rng, o.now, age);
  const birthYear = Number(birthDate.slice(0, 4));
  const { origin, home } = resolveOrigin(rng, o, age);
  const name = randomNameFor(rng, origin.names, gender, birthYear);
  const lastName = o.lastName ? surnameForGender(o.lastName, gender, origin.names) : name.lastName;
  const job = pickOccupation(rng, age, gender, origin.lang, o.region.id);
  const month = wall(o.now).month;

  // Flags first: they influence records, notes and appearance.
  const wanted = age >= 14 && rng.chance(spec?.wanted ?? 0);
  const probation = age >= 18 && rng.chance(spec?.probation ?? 0);
  const recordP = Math.max(
    spec?.record ?? (age < 18 ? 0 : (gender === 'M' ? 0.11 : 0.045) * (age < 35 ? 1.3 : age > 60 ? 0.5 : 1)),
    wanted ? 0.85 : 0,
    probation ? 1 : 0,
  );
  const count = rng.chance(recordP) ? rng.weighted(RECORD_COUNT, (x) => x[1])[0] : 0;
  const records = makeRecords(rng, { now: o.now, birthDate, gender, count });
  if (probation && records.length) {
    // The sentence behind the probation is recent.
    const last = records[records.length - 1];
    last.date = relDate(o.now, -rng.int(30, 700));
    records.sort((a, b) => a.date.localeCompare(b.date));
  }
  const lawTags = new Set(records.flatMap((r) => LAWS.find((l) => l.id === r.lawId)?.tags ?? []));
  const hasCrime = records.some((r) => r.kind === 'crime');

  const license = makeLicense(rng, { now: o.now, age, gender, job, noLicense: spec?.noLicense });
  if ((license.status === 'suspended' || license.status === 'revoked') && rng.chance(0.6)) {
    const traffic = usableLaws().filter((l) => l.tags.includes('traffic'));
    const adult = dateMs(birthDate) + 18 * 365.25 * DAY;
    const today = todayUtc(o.now);
    if (traffic.length && adult < today) {
      const law = rng.weighted(traffic, lawWeight);
      records.push(makeRecord(rng, law, Math.max(adult, today - 900 * DAY), today));
      records.sort((a, b) => a.date.localeCompare(b.date));
      lawTags.add('traffic');
    }
  }

  const baseWeapon = gender === 'M' && age >= 30 && age <= 70 ? 0.04 : age >= 21 ? 0.006 : 0;
  const weaponP = spec?.weapon ?? (hasCrime ? 0 : baseWeapon);
  const weaponPermit = age >= 18 && rng.chance(weaponP) ? makeWeaponPermit(rng, o.now, age) : undefined;

  const person: Person = {
    id: o.id,
    idcode: makeIdcode(rng, gender, birthDate),
    firstName: name.firstName,
    lastName,
    gender,
    birthDate,
    citizenship: origin.citizenship,
    lang: origin.lang,
    address: home.address,
    city: home.city,
    phone: phoneFor(rng, origin, age),
    occupation: job.text,
    appearance: makeAppearance(rng, gender, age, origin.lang, month, records.length > 0 || wanted),
    license,
    records,
    flags: {},
    vehicles: [],
    notes: [],
    avatarSeed: rng.int(1, 0x7fffffff),
  };
  if (home.coord) person.coord = home.coord;
  if (weaponPermit) person.weaponPermit = weaponPermit;
  if (wanted) person.flags.wanted = makeWanted(rng, o.now, o.region.id);
  if (age >= 16 && rng.chance(spec?.restraining ?? 0)) {
    const partner: Gender = rng.chance(0.85) ? (gender === 'M' ? 'F' : 'M') : gender;
    const p = randomNameFor(rng, origin.names, partner, birthYear + rng.int(-6, 6));
    person.flags.restrainingOrder = {
      protectedName: `${p.firstName} ${p.lastName}`,
      until: relDate(o.now, rng.int(45, 730)),
    };
  }
  if (probation) person.flags.probation = { until: relDate(o.now, rng.int(90, 1095)) };
  else if (records.length && rng.chance(0.06))
    person.flags.probation = { until: relDate(o.now, rng.int(60, 900)) };
  const sisP = wanted ? 0.15 : records.length ? 0.015 : 0.002;
  if (age >= 18 && rng.chance(sisP)) person.flags.sis = makeSis(rng, origin.citizenship, wanted);
  person.notes = makeNotes(rng, {
    age,
    lang: origin.lang,
    tags: lawTags,
    hasRecords: records.length > 0,
    wanted,
    intoxicated: spec?.intoxicated ?? 0,
  });
  return person;
}
