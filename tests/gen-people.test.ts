import { describe, expect, it } from 'vitest';
import { LAWS } from '@/data/laws';
import { OCCUPATIONS } from '@/data/occupations';
import { homeAddress, pickLocation } from '@/gen/address';
import { avatarDataUri, avatarSvg, type AvatarOptions } from '@/gen/avatar';
import { ageOf, describePerson, describeVehicle, shortPerson } from '@/gen/describe';
import { parseIdcode } from '@/gen/isikukood';
import * as N from '@/gen/names';
import { generatePerson, type PersonGenOptions } from '@/gen/person';
import { landlineNumber, mobileNumber } from '@/gen/phone';
import { pointInBounds } from '@/sim/geo';
import { Rng } from '@/sim/rng';
import { tallinnTime } from '@/sim/time';
import type { Person, PlaceKind, RegionDef, Text, Vehicle } from '@/sim/types';

const WINTER = tallinnTime(2026, 1, 15, 22, 0);
const SUMMER = tallinnTime(2026, 7, 10, 14, 0);

/** Small Ida prefecture-like fixture (independent of the real region files). */
const REGION: RegionDef = {
  id: 'ida',
  name: { et: 'Testi prefektuur', en: 'Test prefecture' },
  short: 'TEST',
  hqCity: 'Jõhvi',
  counties: ['Ida-Viru maakond', 'Lääne-Viru maakond'],
  center: [27.4, 59.35],
  zoom: 9,
  bounds: [
    [25.5, 58.6],
    [28.4, 59.8],
  ],
  description: { et: '', en: '' },
  callVolume: 3,
  zones: [{ id: 'mainland', name: { et: 'Mandriosa', en: 'Mainland' }, ferryMinutes: 0 }],
  stations: [],
  arrestHouseId: '',
  roster: [],
  towns: [
    { name: 'Narva', county: 'Ida-Viru maakond', coord: [28.19, 59.377], population: 53000, ruShare: 0.95 },
    {
      name: 'Rakvere',
      county: 'Lääne-Viru maakond',
      coord: [26.355, 59.346],
      population: 15000,
      ruShare: 0.06,
    },
    { name: 'Jõhvi', county: 'Ida-Viru maakond', coord: [27.41, 59.359], population: 10000, ruShare: 0.55 },
  ],
  streets: [
    {
      id: 'narva-tallinna',
      name: 'Tallinna mnt',
      city: 'Narva',
      points: [
        [28.17, 59.375],
        [28.19, 59.377],
      ],
      houses: [1, 80],
      kind: 'apartment',
    },
    {
      id: 'rakvere-pikk',
      name: 'Pikk tn',
      city: 'Rakvere',
      points: [
        [26.35, 59.35],
        [26.36, 59.352],
        [26.37, 59.351],
      ],
      houses: [1, 60],
      kind: 'house',
    },
  ],
  places: [
    {
      id: 'bar1',
      name: 'Baar Kuldne Kala',
      kind: 'bar',
      city: 'Rakvere',
      address: 'Lai tn 10',
      coord: [26.356, 59.347],
    },
  ],
  radioName: 'Ida',
};

/** A region with no curated data at all (placeholder regions during development). */
const EMPTY_REGION: RegionDef = {
  ...REGION,
  counties: [],
  towns: [],
  streets: [],
  places: [],
  bounds: [
    [24.5, 58.9],
    [25.5, 59.5],
  ],
  center: [25, 59.2],
};

const opts = (id: string, extra: Partial<PersonGenOptions> = {}): PersonGenOptions => ({
  id,
  now: WINTER,
  region: REGION,
  ...extra,
});

function people(seed: number, count: number, extra: Partial<PersonGenOptions> = {}): Person[] {
  const rng = new Rng(seed);
  return Array.from({ length: count }, (_, i) => generatePerson(rng, opts(`p${i}`, extra)));
}

/** All bilingual texts inside a person record. */
function textsOf(p: Person): Text[] {
  const out: Text[] = [
    p.occupation,
    p.appearance.clothing,
    ...p.notes,
    ...p.records.map((r) => r.punishment),
  ];
  if (p.weaponPermit) out.push(p.weaponPermit.kind);
  if (p.flags.wanted) out.push(p.flags.wanted.reason);
  if (p.flags.sis) out.push(p.flags.sis);
  return out;
}

function expectText(t: Text): void {
  expect(t.et.length).toBeGreaterThan(0);
  expect(t.en.length).toBeGreaterThan(0);
  for (const s of [t.et, t.en]) {
    expect(s).not.toMatch(/[{}]|undefined|NaN/);
  }
}

describe('names', () => {
  it('has realistic pool sizes without duplicates', () => {
    const sizes: [string[], number][] = [
      [N.EST_MALE, 120],
      [N.EST_FEMALE, 120],
      [N.EST_SURNAMES, 200],
      [N.RU_MALE, 60],
      [N.RU_FEMALE, 60],
      [N.RU_SURNAMES, 120],
      [N.UA_MALE, 30],
      [N.UA_FEMALE, 30],
      [N.UA_SURNAMES, 50],
      [N.FARM_NAMES, 80],
    ];
    for (const [list, min] of sizes) {
      expect(list.length).toBeGreaterThanOrEqual(min);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('forms Russian feminine and masculine surnames correctly', () => {
    const fem: [string, string][] = [
      ['Ivanov', 'Ivanova'],
      ['Vassiljev', 'Vassiljeva'],
      ['Solovjov', 'Solovjova'],
      ['Nikitin', 'Nikitina'],
      ['Sinitsõn', 'Sinitsõna'],
      ['Kovalevski', 'Kovalevskaja'],
      ['Zaretski', 'Zaretskaja'],
      ['Tolstoi', 'Tolstaja'],
      ['Bondarenko', 'Bondarenko'],
      ['Sedõh', 'Sedõh'],
      ['Rabinovitš', 'Rabinovitš'],
      ['Šapiro', 'Šapiro'],
    ];
    for (const [m, f] of fem) {
      expect(N.russianFeminine(m)).toBe(f);
      expect(N.russianSurnameForGender(f, 'M')).toBe(m);
      expect(N.russianSurnameForGender(f, 'F')).toBe(f);
    }
  });

  it('keeps Ukrainian surnames mostly invariant', () => {
    expect(N.ukrainianSurnameForGender('Kovalenko', 'F')).toBe('Kovalenko');
    expect(N.ukrainianSurnameForGender('Shevchenko', 'F')).toBe('Shevchenko');
    expect(N.ukrainianSurnameForGender('Bilyi', 'F')).toBe('Bila');
    expect(N.ukrainianSurnameForGender('Hrabovskyi', 'F')).toBe('Hrabovska');
    expect(N.ukrainianSurnameForGender('Hrabovska', 'M')).toBe('Hrabovskyi');
  });

  it('weights names by frequency and generation', () => {
    const rng = new Rng(3);
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const { lastName } = N.randomName(rng, 'et', 'M');
      counts.set(lastName, (counts.get(lastName) ?? 0) + 1);
    }
    const tail = N.EST_SURNAMES[N.EST_SURNAMES.length - 1];
    expect(counts.get('Tamm') ?? 0).toBeGreaterThan(counts.get(tail) ?? 0);
    const young = Array.from({ length: 300 }, () => N.randomName(rng, 'et', 'F', 2012).firstName);
    expect(young).not.toContain('Leida');
  });

  it('gives Russian women feminine surnames', () => {
    const rng = new Rng(11);
    const masculine = new Set(N.RU_SURNAMES.filter((m) => N.russianFeminine(m) !== m));
    let feminine = 0;
    for (let i = 0; i < 300; i++) {
      const { lastName } = N.randomName(rng, 'ru', 'F');
      expect(masculine.has(lastName)).toBe(false);
      if (/(ova|eva|ina|õna|skaja|aja)$/.test(lastName)) feminine++;
    }
    expect(feminine).toBeGreaterThan(200);
  });
});

describe('generatePerson', () => {
  const crowd = people(42, 300, {
    spec: { role: 'suspect', record: 0.4, wanted: 0.15, weapon: 0.1, restraining: 0.1 },
  });

  it('creates valid isikukood consistent with birth date and gender', () => {
    for (const p of crowd) {
      const info = parseIdcode(p.idcode);
      expect(info.valid).toBe(true);
      expect(info.gender).toBe(p.gender);
      expect(info.birthDate).toBe(p.birthDate);
    }
  });

  it('uses an adult age distribution by default and honours explicit ranges', () => {
    const ages = crowd.map((p) => ageOf(p, WINTER));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...ages)).toBeLessThanOrEqual(80);
    const core = ages.filter((a) => a >= 25 && a <= 55).length / ages.length;
    expect(core).toBeGreaterThan(0.5);
    for (const p of people(5, 40, { age: [30, 32] })) {
      const a = ageOf(p, WINTER);
      expect(a).toBeGreaterThanOrEqual(30);
      expect(a).toBeLessThanOrEqual(32);
    }
    const kids = people(6, 20, { age: [8, 12] });
    for (const k of kids) {
      expect(k.license.status).toBe('none');
      expect(k.records).toHaveLength(0);
      expect(k.weaponPermit).toBeUndefined();
    }
  });

  it('is fully deterministic for the same seed', () => {
    const a = people(1234, 25, { spec: { role: 'suspect', record: 0.5, wanted: 0.3 } });
    const b = people(1234, 25, { spec: { role: 'suspect', record: 0.5, wanted: 0.3 } });
    expect(a).toEqual(b);
    expect(people(1235, 25)).not.toEqual(people(1234, 25));
  });

  it('fills bilingual texts without leftover placeholders', () => {
    for (const p of crowd) {
      for (const t of textsOf(p)) expectText(t);
      expectText(describePerson(p, WINTER));
      expectText(shortPerson(p, WINTER));
      expect(p.firstName).toMatch(/\S/);
      expect(p.lastName).toMatch(/\S/);
      expect(p.address).toMatch(/\S/);
      expect(p.city).toMatch(/\S/);
    }
  });

  it('matches citizenship to language', () => {
    const rng = new Rng(77);
    for (let i = 0; i < 120; i++) {
      const ru = generatePerson(rng, opts(`r${i}`, { lang: 'ru' }));
      expect(['EST', 'RUS', 'XXA']).toContain(ru.citizenship);
      expect(generatePerson(rng, opts(`u${i}`, { lang: 'uk' })).citizenship).toBe('UKR');
      expect(generatePerson(rng, opts(`f${i}`, { lang: 'fi' })).citizenship).toBe('FIN');
      expect(generatePerson(rng, opts(`e${i}`, { lang: 'et' })).citizenship).toBe('EST');
    }
  });

  it('derives language from the home town', () => {
    const narva = crowd.filter((p) => p.city === 'Narva');
    const rakvere = crowd.filter((p) => p.city === 'Rakvere');
    const ruShare = (ps: Person[]) => ps.filter((p) => p.lang === 'ru').length / Math.max(1, ps.length);
    expect(narva.length).toBeGreaterThan(10);
    expect(ruShare(narva)).toBeGreaterThan(0.75);
    expect(ruShare(rakvere)).toBeLessThan(0.3);
  });

  it('respects licence rules (esmane juhiluba under 2 years)', () => {
    const young = people(9, 60, { age: [18, 18] });
    const licensed = young.filter((p) => p.license.status === 'valid');
    expect(licensed.length).toBeGreaterThan(0);
    for (const p of licensed) {
      expect(p.license.probationary).toBe(true);
      expect(p.license.categories).toEqual(['B']);
    }
    const banned = people(10, 60, { spec: { role: 'driver', noLicense: 1 } });
    for (const p of banned) expect(['suspended', 'revoked', 'none', 'expired']).toContain(p.license.status);
  });

  it('applies spec flags', () => {
    const wanted = people(12, 30, {
      spec: { role: 'suspect', wanted: 1, restraining: 1, probation: 1, weapon: 1 },
    });
    for (const p of wanted) {
      expect(p.flags.wanted).toBeDefined();
      expect(p.flags.wanted!.authority).toMatch(/Maakohus|Ringkonnaprokuratuur/);
      expect(p.flags.restrainingOrder!.protectedName).toMatch(/\S+ \S+/);
      expect(p.flags.restrainingOrder!.until > '2026-01-15').toBe(true);
      expect(p.flags.probation!.until > '2026-01-15').toBe(true);
      expect(p.weaponPermit!.weapons.length).toBeGreaterThan(0);
    }
  });

  it('cites laws from the law table in records', () => {
    const recs = people(13, 40, { spec: { role: 'suspect', record: 1 } }).flatMap((p) =>
      p.records.map((r) => ({ r, p })),
    );
    if (LAWS.length === 0) {
      expect(recs).toHaveLength(0);
      return;
    }
    expect(recs.length).toBeGreaterThan(0);
    for (const { r, p } of recs) {
      const law = LAWS.find((l) => l.id === r.lawId);
      expect(law).toBeDefined();
      expect(law!.tags).not.toContain('sexual');
      expect(r.kind).toBe(law!.kind);
      const adult = `${Number(p.birthDate.slice(0, 4)) + 18}${p.birthDate.slice(4)}`;
      expect(r.date >= adult).toBe(true);
      expect(r.date <= '2026-01-15').toBe(true);
    }
  });

  it('dresses people for the season', () => {
    const winter = people(14, 80).map((p) => p.appearance.clothing.et);
    const summer = people(14, 80, { now: SUMMER }).map((p) => p.appearance.clothing.et);
    expect(winter.some((c) => /talvejope|sulejope|parka|mantel/.test(c))).toBe(true);
    expect(winter.some((c) => /T-särk|lühikesed püksid|kleit/.test(c))).toBe(false);
    expect(summer.some((c) => /talvejope|sulejope|parka/.test(c))).toBe(false);
    for (const c of [...winter, ...summer]) expect(c.startsWith('seljas ')).toBe(true);
  });
});

describe('describe', () => {
  const base = people(99, 1)[0];
  const subject: Person = {
    ...base,
    gender: 'M',
    birthDate: '1990-06-01',
    appearance: {
      heightCm: 182,
      build: 'heavy',
      hair: 'short',
      hairColor: 'brown',
      eyes: 'blue',
      beard: 'full',
      glasses: true,
      clothing: { et: 'seljas must talvejope', en: 'wearing a black winter jacket' },
    },
  };

  it('writes witness-style Estonian and English', () => {
    expect(describePerson(subject, WINTER)).toEqual({
      et:
        'mees, umbes 35-aastane, u 182 cm, tugeva kehaehitusega, lühikeste tumedate juustega, ' +
        'habemega, prillidega; seljas must talvejope',
      en:
        'man, about 35 years old, approx. 182 cm, heavy build, short dark hair, ' +
        'with a beard and glasses; wearing a black winter jacket',
    });
    expect(shortPerson(subject, WINTER)).toEqual({ et: 'mees, 35a', en: 'male, 35' });
  });

  it('describes vehicles with a lowercase colour', () => {
    const v = {
      plate: '123 ABC',
      make: 'Toyota',
      model: 'Avensis',
      color: { et: 'Hall', en: 'Grey' },
    } as Vehicle;
    expect(describeVehicle(v)).toEqual({
      et: 'hall Toyota Avensis (123 ABC)',
      en: 'grey Toyota Avensis (123 ABC)',
    });
  });
});

describe('phone', () => {
  it('formats Estonian numbers', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      expect(mobileNumber(rng)).toMatch(/^\+372 (5\d{3} \d{4}|5\d{2} \d{4}|8[1-4]\d{2} \d{4})$/);
    }
    expect(landlineNumber(rng, 'Tallinn')).toMatch(/^\+372 6\d{2} \d{4}$/);
    expect(landlineNumber(rng, 'Pärnu')).toMatch(/^\+372 44\d \d{4}$/);
    expect(landlineNumber(rng, 'Narva')).toMatch(/^\+372 35\d \d{4}$/);
    expect(landlineNumber(rng, 'Tartu')).toMatch(/^\+372 7[34]\d \d{4}$/);
  });
});

describe('occupations', () => {
  it('has enough bilingual, age-bounded entries', () => {
    expect(OCCUPATIONS.length).toBeGreaterThanOrEqual(90);
    for (const o of OCCUPATIONS) {
      expectText(o.text);
      expect(o.minAge).toBeLessThanOrEqual(o.maxAge);
    }
  });
});

describe('address', () => {
  const kinds: PlaceKind[] = [
    'residential',
    'house',
    'street',
    'bar',
    'farm',
    'village',
    'summerhouse',
    'forest',
    'ruralroad',
    'lake',
    'highway',
    'hospital',
    'embassy',
    'beach',
  ];

  it('returns valid locations inside the region for every kind', () => {
    const rng = new Rng(21);
    for (const k of kinds) {
      for (let i = 0; i < 15; i++) {
        const loc = pickLocation(rng, REGION, [k]);
        expect(pointInBounds(loc.coord, REGION.bounds)).toBe(true);
        expect(loc.address).toMatch(/\S/);
        expect(loc.city).toMatch(/\S/);
        expect(loc.zone).toBe('mainland');
        expect(loc.placeKind).toBeTruthy();
      }
    }
  });

  it('uses the expected address formats', () => {
    const rng = new Rng(22);
    for (let i = 0; i < 20; i++) {
      const res = pickLocation(rng, REGION, ['residential']);
      if (res.city === 'Narva') expect(res.address).toMatch(/^Tallinna mnt \d+-\d+$/);
      expect(pickLocation(rng, REGION, ['farm']).address).toMatch(/^\S.* talu, .+ maakond$/);
      expect(pickLocation(rng, REGION, ['highway']).address).toMatch(/(maantee|ringtee).*, \d+\. km$/);
    }
    const bar = pickLocation(rng, REGION, ['bar']);
    expect(bar.placeName).toBe('Baar Kuldne Kala');
    expect(bar.placeKind).toBe('bar');
  });

  it('places Russian speakers mostly in Russian-speaking towns', () => {
    const rng = new Rng(23);
    const homes = Array.from({ length: 200 }, () => homeAddress(rng, REGION, 'ru'));
    const narva = homes.filter((h) => h.city === 'Narva').length;
    const rakvere = homes.filter((h) => h.city === 'Rakvere').length;
    expect(narva).toBeGreaterThan(rakvere * 5);
    for (const h of homes) expect(pointInBounds(h.coord, REGION.bounds)).toBe(true);
  });

  it('copes with a region that has no curated data', () => {
    const rng = new Rng(24);
    for (const k of kinds) {
      const loc = pickLocation(rng, EMPTY_REGION, [k]);
      expect(loc.address).toMatch(/\S/);
      expect(Number.isFinite(loc.coord[0]) && Number.isFinite(loc.coord[1])).toBe(true);
    }
    expect(homeAddress(rng, EMPTY_REGION).address).toMatch(/\S/);
    const p = generatePerson(rng, opts('e1', { region: EMPTY_REGION }));
    expect(parseIdcode(p.idcode).valid).toBe(true);
    expect(pickLocation(rng, EMPTY_REGION, []).address).toMatch(/\S/);
  });
});

describe('avatar', () => {
  /** Minimal XML well-formedness check: balanced tags, quoted attributes. */
  function wellFormed(svg: string): boolean {
    const stack: string[] = [];
    for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g)) {
      const [, close, tag, , self] = m;
      if (self) continue;
      if (close) {
        if (stack.pop() !== tag) return false;
      } else stack.push(tag);
    }
    return stack.length === 0 && !/<[^>]*<|>[^<]*>/.test(svg.replace(/>[^<]*</g, '><'));
  }

  const variants: AvatarOptions[] = [];
  const hairs = ['short', 'long', 'bald', 'ponytail', 'curly', 'shaved', 'buzz'] as const;
  const colors = ['black', 'brown', 'blond', 'red', 'grey', 'white', 'dyed'] as const;
  const beards = [undefined, 'stubble', 'full', 'moustache', 'goatee'] as const;
  for (const gender of ['M', 'F'] as const) {
    hairs.forEach((hair, i) =>
      colors.forEach((hairColor, j) =>
        variants.push({
          gender,
          age: 10 + i * 9 + j,
          hair,
          hairColor,
          beard: beards[(i + j) % 5],
          glasses: j % 2 === 0,
        }),
      ),
    );
  }
  variants.push(
    { gender: 'M', age: 40, uniform: true },
    { gender: 'F', age: 30, uniform: true, glasses: true },
  );

  it('renders well-formed, compact SVG for every style', () => {
    variants.forEach((v, i) => {
      const svg = avatarSvg(1000 + i * 7919, v);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 120 120"');
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(wellFormed(svg)).toBe(true);
      expect(svg.length).toBeLessThan(6000);
    });
  });

  it('is deterministic with per-seed gradient ids', () => {
    const o: AvatarOptions = { gender: 'F', age: 33, hair: 'long', hairColor: 'blond' };
    expect(avatarSvg(42, o)).toBe(avatarSvg(42, o));
    expect(avatarSvg(42, o)).not.toBe(avatarSvg(43, o));
    const ids = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const a = ids(avatarSvg(42, o));
    const b = ids(avatarSvg(43, o));
    expect(a.length).toBeGreaterThan(0);
    expect(a.some((id) => b.includes(id))).toBe(false);
    expect(avatarDataUri(42, o).startsWith('data:image/svg+xml;utf8,')).toBe(true);
  });
});
