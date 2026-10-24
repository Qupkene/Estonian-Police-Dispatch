/**
 * Public figures in the registry (src/data/celebrities.ts). They are not part of a shift until someone looks them
 * up: a logged registry search (single player, or the co-op room's 'q' command that every client replays) copies the
 * people it finds, and their cars, into the state. The 300 people would otherwise triple every save and co-op
 * snapshot. It stays deterministic: the catalogue depends only on the list, the shift's day and its prefecture.
 *
 * A public figure's record is always clean: no records, no flags, never a suspect, never picked for a story or a
 * bulletin (nothing else in the sim reads the catalogue, and the background population never contains them).
 */
import { CELEBRITIES, type CelebrityDef, type CelebrityField } from '@/data/celebrities';
import { idcodeChecksum } from '@/gen/isikukood';
import { generateVehicle } from '@/gen/vehicle';
import { Rng, hashString } from './rng';
import { DAY, HOUR, isoDate } from './time';
import type { Appearance, Person, PersonRole, PersonSpec, RegionId, SimState, Text, Vehicle } from './types';

export const CELEB_PREFIX = 'vip-';

export function isCelebrity(p: Pick<Person, 'id'>): boolean {
  return p.id.startsWith(CELEB_PREFIX);
}

const BY_ID = new Map(CELEBRITIES.map((c) => [`${CELEB_PREFIX}${c.nr}`, c]));

/** The list entry behind a `vip-` person, for the name people know them by. */
export function celebrityDef(id: string): CelebrityDef | undefined {
  return BY_ID.get(id);
}

/** "Toomas Hendrik Ilves" → first names and the last name. */
function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  return parts.length < 2 ? [full, ''] : [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

/**
 * A valid isikukood on the real birth date. Hospitals handed out serials 001-700 before 2013 (everyone on the list
 * was born earlier), so a serial of 701-999 is not anyone's real code.
 */
function vipIdcode(rng: Rng, c: CelebrityDef): string {
  const [y, m, d] = c.born.split('-').map(Number);
  const century = (y < 1900 ? 1 : y < 2000 ? 3 : 5) + (c.gender === 'F' ? 1 : 0);
  const first10 = `${century}${String(y % 100).padStart(2, '0')}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}${rng.int(701, 999)}`;
  return first10 + idcodeChecksum(first10);
}

const CLOTHING: Record<CelebrityField, Text[]> = {
  politics: [
    { et: 'tume ülikond, valge särk', en: 'dark suit, white shirt' },
    { et: 'mantel ja sall', en: 'overcoat and scarf' },
  ],
  music: [
    { et: 'nahktagi, tumedad teksad', en: 'leather jacket, dark jeans' },
    { et: 'kapuutsiga pusa, päikeseprillid', en: 'hoodie, sunglasses' },
  ],
  sport: [
    { et: 'koondise dressipluus', en: 'national team track top' },
    { et: 'spordijope, tossud', en: 'sports jacket, trainers' },
  ],
  acting: [
    { et: 'pikk mantel, kaelasall', en: 'long coat, neck scarf' },
    { et: 'teksajakk, triibuline särk', en: 'denim jacket, striped shirt' },
  ],
  media: [
    { et: 'pintsak ja teksad', en: 'blazer and jeans' },
    { et: 'erksavärviline jope', en: 'brightly coloured jacket' },
  ],
  literature: [
    { et: 'villane kampsun, õlakott', en: 'wool jumper, shoulder bag' },
    { et: 'tviidpintsak', en: 'tweed jacket' },
  ],
  business: [
    { et: 'tume pusa ja vest', en: 'dark sweatshirt and gilet' },
    { et: 'ülikond ilma lipsuta', en: 'suit without a tie' },
  ],
  science: [
    { et: 'kampsun ja triiksärk', en: 'jumper and shirt' },
    { et: 'tuulejope, seljakott', en: 'windbreaker, backpack' },
  ],
  art: [
    { et: 'värviplekkidega jope', en: 'paint-flecked jacket' },
    { et: 'must rull-kaelus', en: 'black turtleneck' },
  ],
  fashion: [
    { et: 'pikk kamelmantel', en: 'long camel coat' },
    { et: 'must nahkjope, kõrge kontsaga saapad', en: 'black leather jacket, high-heeled boots' },
  ],
};

/** Car makes that suit the line of work; the model and year still come from the Estonian fleet. */
const MAKES: Record<CelebrityField, string[]> = {
  politics: ['Škoda', 'Volkswagen', 'Audi', 'BMW', 'Volvo', 'Toyota', 'Mercedes-Benz', 'Lexus'],
  business: ['Tesla', 'Porsche', 'BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Volvo', 'Land Rover', 'Polestar'],
  sport: ['Toyota', 'BMW', 'Audi', 'Volvo', 'Tesla', 'Subaru', 'Volkswagen', 'Mercedes-Benz', 'Porsche'],
  music: ['Tesla', 'BMW', 'Audi', 'Volkswagen', 'Mini', 'Toyota', 'Volvo', 'Mercedes-Benz', 'Cupra', 'Jeep'],
  acting: ['Volvo', 'Volkswagen', 'Toyota', 'Škoda', 'BMW', 'Audi', 'Mini', 'Peugeot', 'Citroën'],
  media: ['Tesla', 'BMW', 'Audi', 'Volkswagen', 'Mini', 'Mercedes-Benz', 'Kia', 'Hyundai', 'Cupra'],
  fashion: ['Mercedes-Benz', 'Porsche', 'Mini', 'Tesla', 'Audi', 'BMW', 'Land Rover'],
  literature: ['Škoda', 'Toyota', 'Volvo', 'Volkswagen', 'Subaru', 'Peugeot', 'Renault', 'Citroën'],
  science: ['Škoda', 'Toyota', 'Volvo', 'Volkswagen', 'Subaru', 'Nissan', 'Mazda'],
  art: ['Volvo', 'Saab', 'Citroën', 'Volkswagen', 'Fiat', 'Subaru', 'Renault'],
};

function appearanceOf(rng: Rng, c: CelebrityDef, age: number): Appearance {
  const male = c.gender === 'M';
  const heightCm = c.heightCm ?? (male ? rng.int(172, 190) : rng.int(160, 176));
  const build: Appearance['build'] =
    c.field === 'sport' ? 'athletic' : rng.pick(['slim', 'average', 'average', 'athletic']);
  const hair: Appearance['hair'] = male
    ? age > 55 && rng.chance(0.3)
      ? 'bald'
      : rng.pick(['short', 'short', 'buzz', 'curly'])
    : rng.pick(['long', 'long', 'ponytail', 'short', 'curly']);
  const hairColor: Appearance['hairColor'] =
    age > 62
      ? rng.pick(['grey', 'grey', 'white'])
      : rng.pick(['blond', 'blond', 'brown', 'brown', 'black', 'red']);
  const out: Appearance = {
    heightCm,
    build,
    hair,
    hairColor,
    eyes: rng.pick(['blue', 'blue', 'grey', 'green', 'brown']),
    clothing: rng.pick(CLOTHING[c.field]),
  };
  if (male && rng.chance(0.25)) out.beard = rng.pick(['stubble', 'full', 'goatee']);
  if (rng.chance(age > 50 ? 0.4 : 0.15)) out.glasses = true;
  return out;
}

const MADE_UP: Text = {
  et: 'Avaliku elu tegelane. Isikukood, sõiduk, telefon ja välimus on mängu jaoks välja mõeldud; päris on nimi, sünniaeg ja avalik info.',
  en: 'Public figure. ID code, vehicle, phone and appearance are made up for the game; the name, birth date and public facts are real.',
};

function buildPerson(rng: Rng, c: CelebrityDef, now: number): Person {
  const [firstName, lastName] = splitName(c.legal ?? c.name);
  const by = Number(c.born.slice(0, 4));
  const age = Number(isoDate(now).slice(0, 4)) - by;
  const known: Text = c.legal
    ? { et: `Tuntud kui ${c.name}: ${c.knownAs.et}.`, en: `Known as ${c.name}: ${c.knownAs.en}.` }
    : { et: `Tuntud: ${c.knownAs.et}.`, en: `Known for: ${c.knownAs.en}.` };
  return {
    id: `${CELEB_PREFIX}${c.nr}`,
    idcode: vipIdcode(rng, c),
    firstName,
    lastName,
    gender: c.gender,
    birthDate: c.born,
    citizenship: 'EST',
    lang: 'et',
    // No home address for real people: only the country.
    address: 'Eesti',
    city: 'Eesti',
    phone: '+372 •••• ••••',
    occupation: c.occupation,
    appearance: appearanceOf(rng, c, age),
    license: {
      status: 'valid',
      categories: rng.chance(0.15) ? ['A', 'B'] : ['B'],
      validUntil: isoDate(now + rng.int(300, 3600) * DAY),
    },
    records: [],
    flags: {},
    vehicles: [],
    notes: [known, MADE_UP],
    avatarSeed: hashString(`vip-avatar-${c.nr}`),
  };
}

function buildVehicle(
  rng: Rng,
  owner: Person,
  c: CelebrityDef,
  now: number,
  region: RegionId,
  taken: Set<string>,
): Vehicle {
  const makes = new Set(MAKES[c.field]);
  const v = generateVehicle(rng, {
    now,
    owner,
    kind: 'car',
    region,
    isTaken: (pl) => taken.has(pl),
    filter: (m) => makes.has(m.make),
    spec: { role: 'involved', stolen: 0, noInsurance: 0, noInspection: 0, suspended: 0 },
  });
  // Registered to the person, not to a leasing company, so the car shows up on their card.
  if (v.ownerCompany) {
    delete v.ownerCompany;
    v.notes = v.notes.filter((n) => !n.et.startsWith('Liisingusõiduk'));
  }
  v.ownerId = owner.id;
  return v;
}

export interface CelebrityCatalogue {
  key: string;
  persons: Person[];
  byId: Map<string, Person>;
  vehicles: Map<string, Vehicle>;
}

let cache: CelebrityCatalogue | undefined;

/** Everyone on the list with a car, as of the shift's day (noon UTC, so the hour of the search does not matter). */
export function celebrityCatalogue(now: number, region: RegionId): CelebrityCatalogue {
  const day = Math.floor(now / DAY);
  const key = `${day}|${region}`;
  if (cache?.key === key) return cache;
  const t = day * DAY + 12 * HOUR;
  const persons: Person[] = [];
  const vehicles = new Map<string, Vehicle>();
  const taken = new Set<string>();
  for (const c of CELEBRITIES) {
    const rng = new Rng(hashString(`vip-${c.nr}`));
    const p = buildPerson(rng, c, t);
    const v = buildVehicle(rng, p, c, t, region, taken);
    taken.add(v.plate);
    p.vehicles.push(v.plate);
    persons.push(p);
    vehicles.set(v.plate, v);
  }
  cache = { key, persons, byId: new Map(persons.map((p) => [p.id, p])), vehicles };
  return cache;
}

/**
 * Copy the public figures among `ids` into the shift with their cars (once). A car whose plate the shift already
 * uses for another vehicle stays out, so a plate always means one vehicle.
 */
export function materialiseCelebrities(s: SimState, ids: string[]): void {
  const cat = celebrityCatalogue(s.now, s.regionId);
  for (const id of ids) {
    if (!id.startsWith(CELEB_PREFIX) || s.persons[id]) continue;
    const src = cat.byId.get(id);
    if (!src) continue;
    const p: Person = structuredClone(src);
    p.vehicles = p.vehicles.filter((plate) => {
      const mine = cat.vehicles.get(plate);
      if (!mine || s.vehicles[plate]) return false;
      s.vehicles[plate] = structuredClone(mine);
      return true;
    });
    s.persons[id] = p;
  }
}

/** The roles a public figure may play in a story: never a suspect, a driver, a missing person or a death. */
export const CELEBRITY_ROLES: ReadonlySet<PersonRole> = new Set(['caller', 'witness', 'victim']);

/**
 * Cast a public figure for a story's person (PersonSpec.celebrity): someone who fits the spec's fields, gender and
 * age and is not in the shift yet, copied into the shift with their car. Undefined when the role is not allowed or
 * nobody fits (the story then makes someone up).
 */
export function castCelebrity(s: SimState, r: Rng, sp: PersonSpec): Person | undefined {
  if (!sp.celebrity || !CELEBRITY_ROLES.has(sp.role)) return undefined;
  const fields = sp.celebrity === true ? undefined : sp.celebrity;
  const year = Number(isoDate(s.now).slice(0, 4));
  const pool = CELEBRITIES.filter((c) => {
    const age = year - Number(c.born.slice(0, 4));
    return (
      (!fields || fields.includes(c.field)) &&
      (!sp.gender || sp.gender === 'any' || c.gender === sp.gender) &&
      (!sp.age || (age >= sp.age[0] && age <= sp.age[1])) &&
      !s.persons[`${CELEB_PREFIX}${c.nr}`]
    );
  });
  if (!pool.length) return undefined;
  const id = `${CELEB_PREFIX}${r.pick(pool).nr}`;
  materialiseCelebrities(s, [id]);
  return s.persons[id];
}

/** The name people know a public figure by (a stage name where there is one). */
export function knownName(p: Pick<Person, 'id' | 'firstName' | 'lastName'>): string {
  return celebrityDef(p.id)?.name ?? `${p.firstName} ${p.lastName}`;
}
