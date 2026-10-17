/**
 * Procedural vehicle registry records (liiklusregistri kanne). Owned by registry-data.
 * Pure: all randomness comes from the passed Rng, so the same seed gives the same vehicle.
 */
import {
  CAR_MODELS,
  COLORS,
  FLEET_OWNERS,
  FLEET_OWNER_MIX,
  INSURERS,
  INSURER_WEIGHTS,
  KIND_WEIGHTS,
  MAKE_WMI,
  type CarModel,
  type FleetOwnerKind,
} from '@/data/vehicles';
import type { Rng } from '@/sim/rng';
import { DAY, HOUR, ddmmyyyy, isoDate, wall } from '@/sim/time';
import type { Person, RegionId, Text, Vehicle, VehicleKind, VehicleSpec } from '@/sim/types';

export interface VehicleGenOptions {
  now: number;
  kind?: VehicleKind;
  owner?: Person;
  spec?: VehicleSpec;
  /** Region flavour (e.g. more Ladas in Ida-Virumaa). */
  region?: RegionId;
  /** Return true when a plate is already used; the generator then draws another one. */
  isTaken?: (plate: string) => boolean;
  /** Restrict the model choice (e.g. only Toyotas for a scripted BOLO). */
  filter?: (m: CarModel) => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules & constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plate layouts per kind: '9' = digit, 'A' = letter.
 * Standard Estonian plate is "123 ABC" (3 digits + 3 letters, EU strip "EST").
 * Motorcycles and mopeds carry a small two-row rear plate (digits over letters); we store it on
 * one line. unverified: digit/letter counts for moto, moped and ATV plates
 * (docs/research/vehicles-plates.md § 1.2 / § 10.1).
 */
export const PLATE_FORMATS: Record<VehicleKind, string> = {
  car: '999 AAA',
  van: '999 AAA',
  truck: '999 AAA',
  bus: '999 AAA',
  moto: '99 AAA', // unverified
  moped: '99 AA', // unverified
  quad: '999 AA', // unverified
};

/**
 * Letters used on plates: basic Latin capitals, never Õ Ä Ö Ü Š Ž. I, O, Q and W are left out as
 * the safe choice recommended by docs/research/vehicles-plates.md § 10.1 (unverified: whether real
 * series skip them).
 */
export const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVXYZ';

/** Regex that every generated plate of the kind matches (canonical, with the space). */
export const PLATE_PATTERNS: Record<VehicleKind, RegExp> = Object.fromEntries(
  (Object.keys(PLATE_FORMATS) as VehicleKind[]).map((k) => [
    k,
    new RegExp(
      '^' +
        PLATE_FORMATS[k].replace(/9+|A+/g, (run) => (run[0] === '9' ? `\\d{${run.length}}` : `[${PLATE_LETTERS}]{${run.length}}`)) +
        '$',
    ),
  ]),
) as Record<VehicleKind, RegExp>;

/**
 * Periodic roadworthiness test (tehnoülevaatus) intervals in years after first registration;
 * the last interval repeats. null = no periodic test.
 * unverified (docs/research/vehicles-plates.md § 4.4): cars & vans first at 4 years, then every
 * 2 years until 10 years old, then yearly; taxis and rental cars yearly (see generateVehicle);
 * motorcycles/ATVs every 2 years after the first 4; trucks and buses yearly. Mopeds are probably
 * exempt in reality, but the registry/UI treat any `until` before today as expired, so they get
 * the motorcycle schedule here.
 */
export const INSPECTION_SCHEDULE: Record<VehicleKind, number[] | null> = {
  car: [4, 2, 2, 2, 1],
  van: [4, 2, 2, 2, 1],
  moto: [4, 2],
  moped: [4, 2],
  quad: [4, 2],
  truck: [1],
  bus: [1],
};

/**
 * Background chance of a lapsed insurance / test / suspended registration when the spec does not
 * set it (research § 9: per random traffic stop ≈ 8–12 % expired test, 2–4 % uninsured,
 * 0.5–1 % suspended). An explicit spec value (including 0) always wins.
 */
const BASE_NO_INSURANCE: Record<VehicleKind, number> = { car: 0.035, van: 0.03, truck: 0.01, bus: 0.005, moto: 0.05, moped: 0.08, quad: 0.08 };
const BASE_NO_INSPECTION: Record<VehicleKind, number> = { car: 0.09, van: 0.07, truck: 0.03, bus: 0.01, moto: 0.08, moped: 0.03, quad: 0.06 };
const BASE_SUSPENDED = 0.007;
/** Makes/models where black dominates (research § 2.4). */
const BLACK_PREMIUM = new Set(['Audi', 'BMW', 'Mercedes-Benz', 'Lexus', 'Porsche', 'Land Rover']);

const EAST_MAKES = new Set(['Lada', 'UAZ', 'GAZ', 'IŽ', 'Ural', 'Minsk', 'Riga']);

const pad = (n: number) => String(n).padStart(2, '0');
const isoParts = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);

// ─────────────────────────────────────────────────────────────────────────────
// Plates
// ─────────────────────────────────────────────────────────────────────────────

/** "123 ABC" style plate (other formats for moto/moped/ATV, see PLATE_FORMATS). */
export function makePlate(rng: Rng, kind: VehicleKind = 'car'): string {
  const fmt = PLATE_FORMATS[kind] ?? PLATE_FORMATS.car;
  for (;;) {
    let out = '';
    for (const ch of fmt) {
      if (ch === '9') out += String(rng.int(0, 9));
      else if (ch === 'A') out += PLATE_LETTERS[rng.int(0, PLATE_LETTERS.length - 1)];
      else out += ch;
    }
    if (!/^0+ /.test(out)) return out; // no all-zero number part ("000 ABC")
  }
}

/** Normalise user input for plate search: uppercase, whitespace (and dashes) removed. */
export function normalizePlate(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, '');
}

/** Canonical display form: "123abc" / " 123  abc " → "123 ABC"; other layouts kept normalised. */
export function formatPlate(s: string): string {
  const n = normalizePlate(s);
  let m = /^(\d{1,3})([A-Z]{2,3})$/.exec(n);
  if (m) return `${m[1]} ${m[2]}`;
  m = /^([A-Z]{1,3})(\d{1,4})$/.exec(n);
  if (m) return `${m[1]} ${m[2]}`;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIN (ISO 3779)
// ─────────────────────────────────────────────────────────────────────────────

/** VIN alphabet: digits and A–Z without I, O, Q. */
export const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
/** Model-year codes (position 10), 30-year cycle starting 1980 = 'A'. */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function vinYearCode(year: number): string {
  return YEAR_CODES[(((year - 1980) % 30) + 30) % 30];
}

/** Check digit (position 9) per the North American scheme: '0'–'9' or 'X'. */
export function vinCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = c >= '0' && c <= '9' ? Number(c) : (TRANSLIT[c] ?? 0);
    sum += v * VIN_WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}

export function isValidVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) && vinCheckDigit(vin) === vin[8];
}

/**
 * Production-year windows of WMIs that changed over time (Mercedes-Benz moved from WDx to W1x
 * around 2019, Opel to W0V under PSA, Tesla added Shanghai and Berlin plants).
 */
const WMI_SINCE: Record<string, number> = { W1K: 2019, W1N: 2019, W1V: 2019, W1T: 2019, W0V: 2018, VR3: 2019, VR7: 2019, LRW: 2020, XP7: 2022 };
const WMI_UNTIL: Record<string, number> = { WDD: 2020, WDB: 2020, WDC: 2020, WDF: 2020 };

/** WMI candidates for a make (and optionally a specific model). */
export function wmiFor(make: string, model?: string): string[] {
  if (model) {
    const cm = CAR_MODELS.find((c) => c.make === make && c.model === model);
    if (cm?.wmi?.length) return cm.wmi;
  }
  return MAKE_WMI[make] ?? [];
}

/**
 * 17-character VIN: WMI (by make, or `wmi` override) + 5-char descriptor + check digit +
 * model-year code + plant code + 6-digit serial.
 */
export function makeVin(rng: Rng, make: string, year: number, wmi?: readonly string[]): string {
  const all = wmi && wmi.length ? wmi : wmiFor(make);
  const inYear = all.filter((c) => year >= (WMI_SINCE[c] ?? 0) && year <= (WMI_UNTIL[c] ?? 9999));
  const opts = inYear.length ? inYear : all;
  const randChar = () => VIN_CHARS[rng.int(0, VIN_CHARS.length - 1)];
  const w = opts.length ? rng.pick(opts) : 'X' + randChar() + randChar();
  let vds = '';
  for (let i = 0; i < 5; i++) vds += randChar();
  const plant = randChar();
  let serial = '';
  for (let i = 0; i < 6; i++) serial += String(rng.int(0, 9));
  const draft = `${w}${vds}0${vinYearCode(year)}${plant}${serial}`;
  return draft.slice(0, 8) + vinCheckDigit(draft) + draft.slice(9);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────────────────────

function pickKind(rng: Rng, month: number, stolen: boolean): VehicleKind {
  const winter = month >= 11 || month <= 3;
  const shoulder = month === 4 || month === 10;
  const season: Partial<Record<VehicleKind, number>> = winter
    ? { moto: 0.12, moped: 0.15, quad: 0.8 }
    : shoulder
      ? { moto: 0.6, moped: 0.6 }
      : {};
  // Stolen: two-wheelers and ATVs are a big share of thefts (research § 10.4).
  const theft: Partial<Record<VehicleKind, number>> = stolen ? { moto: 2.5, moped: 2.5, quad: 2, truck: 0.3, bus: 0 } : {};
  const kinds = Object.keys(KIND_WEIGHTS) as VehicleKind[];
  return rng.weighted(kinds, (k) => KIND_WEIGHTS[k] * (season[k] ?? 1) * (theft[k] ?? 1));
}

function sampleAge(rng: Rng, kind: VehicleKind, stolen: boolean): number {
  const r = rng.next();
  if (stolen && (kind === 'car' || kind === 'van')) {
    if (r < 0.45) return rng.int(0, 4);
    if (r < 0.8) return rng.int(5, 10);
    return rng.int(11, 20);
  }
  switch (kind) {
    case 'truck':
    case 'bus':
      if (r < 0.25) return rng.int(0, 4);
      if (r < 0.6) return rng.int(5, 10);
      if (r < 0.9) return rng.int(11, 18);
      return rng.int(19, 28);
    case 'moped':
      if (r < 0.35) return rng.int(0, 4);
      if (r < 0.75) return rng.int(5, 10);
      return rng.int(11, 20);
    case 'quad':
      if (r < 0.4) return rng.int(0, 4);
      if (r < 0.85) return rng.int(5, 10);
      return rng.int(11, 18);
    default:
      // Estonian passenger-car fleet: one of the oldest in the EU, average age ≈ 14–15 years.
      if (r < 0.13) return rng.int(0, 4);
      if (r < 0.35) return rng.int(5, 10);
      if (r < 0.76) return rng.int(11, 20);
      return rng.int(21, 32);
  }
}

function sampleYear(rng: Rng, model: CarModel, nowYear: number, minAge: number, stolen: boolean): number {
  const lo = model.years[0];
  const hi = Math.min(model.years[1], nowYear);
  for (let i = 0; i < 12; i++) {
    const age = sampleAge(rng, model.kind, stolen);
    const y = nowYear - age;
    if (y >= lo && y <= hi && age >= minAge) return y;
  }
  const hiAllowed = Math.min(hi, nowYear - minAge);
  return hiAllowed >= lo ? rng.int(lo, hiAllowed) : rng.int(lo, hi);
}

function pickCompany(rng: Rng, kind: VehicleKind): { name: string; cat: FleetOwnerKind } {
  const mix = FLEET_OWNER_MIX[kind];
  const cats = Object.keys(mix) as FleetOwnerKind[];
  const cat = rng.weighted(cats, (c) => mix[c] ?? 0);
  return { name: rng.pick(FLEET_OWNERS[cat]), cat };
}

/** Roadworthiness-test validity date. Valid → first due date ≥ today; lapsed → last missed one. */
function inspectionUntil(
  rng: Rng,
  reg: { y: number; m: number; d: number },
  schedule: number[],
  now: number,
  lapsed: boolean,
): string {
  const today = isoDate(now);
  let after = 0;
  let prev: string | null = null;
  for (let i = 0; i < 200; i++) {
    after += schedule[Math.min(i, schedule.length - 1)];
    const due = isoParts(reg.y + after, reg.m, reg.d);
    if (due >= today) {
      if (!lapsed) return due;
      return prev ?? isoDate(now - rng.int(10, 200) * DAY);
    }
    prev = due;
  }
  return lapsed ? isoDate(now - rng.int(10, 200) * DAY) : isoDate(now + 365 * DAY);
}

function stolenFlag(rng: Rng, now: number, model: CarModel, rentalCompany: boolean): { since: string; text: Text } {
  // Theft at least 10 h ago (so "ööl vastu <date>" is never in the future), at most ~9 days.
  const t = now - 10 * HOUR - Math.pow(rng.next(), 1.6) * 9 * DAY;
  const w = wall(t);
  const night = w.hour >= 21 || w.hour < 6;
  const morning = night && w.hour >= 21 ? t + 12 * HOUR : t;
  const date = ddmmyyyy(morning);
  const since = isoDate(morning);
  const twoWheel = model.kind === 'moto' || model.kind === 'moped' || model.kind === 'quad';

  if (rentalCompany && rng.chance(0.5)) {
    return {
      since,
      text: {
        et: `Rendileandja teatas ${date}, et renditud sõidukit ei ole tagastatud. Avaldus esitatud.`,
        en: `On ${date} the rental company reported that the rented vehicle has not been returned. Report filed.`,
      },
    };
  }
  if (night) {
    if (twoWheel)
      return {
        since,
        text: {
          et: `Varastatud ööl vastu ${date} lukustatud garaažist. Avaldus esitatud.`,
          en: `Stolen from a locked garage overnight into ${date}. Report filed.`,
        },
      };
    if ((model.theft ?? 1) >= 2 && rng.chance(0.6))
      return {
        since,
        text: {
          et: `Varastatud ööl vastu ${date}. Kahtlus võtmeta avamise seadme kasutamisele. Avaldus esitatud.`,
          en: `Stolen overnight into ${date}. A keyless-entry relay device is suspected. Report filed.`,
        },
      };
    return rng.chance(0.5)
      ? {
          since,
          text: { et: `Varastatud ööl vastu ${date}, avaldus esitatud.`, en: `Stolen overnight into ${date}; report filed.` },
        }
      : {
          since,
          text: {
            et: `Ära viidud ööl vastu ${date} elukoha juurest parklast. Omanik teatas hommikul.`,
            en: `Taken from the car park outside the owner’s home overnight into ${date}. Reported by the owner in the morning.`,
          },
        };
  }
  const startMin = w.hour * 60 + (w.minute < 30 ? 0 : 30);
  const endMin = Math.min(startMin + rng.int(2, 10) * 30, 23 * 60 + 30);
  const hm = (x: number) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
  return rng.chance(0.6)
    ? {
        since,
        text: {
          et: `Varastatud ${date} ajavahemikus ${hm(startMin)}–${hm(endMin)} parklast, avaldus esitatud.`,
          en: `Stolen from a car park on ${date} between ${hm(startMin)} and ${hm(endMin)}; report filed.`,
        },
      }
    : {
        since,
        text: {
          et: `Varastatud ${date} kella ${hm(startMin)} paiku kaubanduskeskuse parklast. Avaldus esitatud.`,
          en: `Stolen from a shopping centre car park on ${date} at around ${hm(startMin)}. Report filed.`,
        },
      };
}

export function generateVehicle(rng: Rng, o: VehicleGenOptions): Vehicle {
  const { now, spec } = o;
  const w = wall(now);
  const nowYear = w.year;

  // Flags first, in a fixed order (determinism).
  const stolen = rng.chance(spec?.stolen ?? 0);
  const kind: VehicleKind = o.kind ?? spec?.kind ?? pickKind(rng, w.month, stolen);
  const noInsurance = rng.chance(spec?.noInsurance ?? BASE_NO_INSURANCE[kind]);
  const schedule = INSPECTION_SCHEDULE[kind];
  const noInspection = schedule !== null && rng.chance(spec?.noInspection ?? BASE_NO_INSPECTION[kind]);
  const suspended = rng.chance(spec?.suspended ?? BASE_SUSPENDED);
  // A lapsed test needs a vehicle old enough to have had a due date.
  const minAge = noInspection && schedule ? schedule[0] + 1 : 0;

  // Model.
  const eligible = (m: CarModel) => m.kind === kind && m.years[0] <= nowYear - minAge && (!o.filter || o.filter(m));
  let pool = CAR_MODELS.filter(eligible);
  if (pool.length === 0) pool = CAR_MODELS.filter((m) => m.kind === kind && m.years[0] <= nowYear);
  if (pool.length === 0) pool = CAR_MODELS.filter((m) => m.kind === 'car');
  const model = rng.weighted(pool, (m) => {
    let wt = m.weight;
    if (stolen) wt *= (m.theft ?? 1) ** 3;
    if (o.region === 'ida' && EAST_MAKES.has(m.make)) wt *= 4;
    return wt;
  });

  // Year & first registration date.
  const year = sampleYear(rng, model, nowYear, minAge, stolen);
  let regM = rng.int(1, 12);
  let regD = rng.int(1, 28);
  if (year === nowYear) {
    regM = rng.int(1, w.month);
    regD = regM === w.month ? rng.int(1, Math.max(1, Math.min(28, w.day))) : rng.int(1, 28);
  }
  const reg = { y: year, m: regM, d: regD };
  const age = nowYear - year;

  // Colour.
  const color = rng.weighted(COLORS, (c) => {
    let wt = c.weight;
    if (model.color === c.et) wt *= 25;
    if (c.et === 'valge' && (kind === 'truck' || kind === 'bus' || kind === 'van' || model.make === 'Tesla')) wt *= 3;
    if (c.et === 'valge' && year >= 2018) wt *= 1.6;
    if (c.et === 'must' && (BLACK_PREMIUM.has(model.make) || model.model === 'Land Cruiser')) wt *= 2;
    if ((c.et === 'roheline' || c.et === 'tumeroheline' || c.et === 'bordoo') && year >= 1993 && year <= 2006) wt *= 2.5;
    return wt;
  });

  // Plate & VIN.
  let plate = makePlate(rng, kind);
  for (let i = 0; i < 200 && o.isTaken?.(plate); i++) plate = makePlate(rng, kind);
  const vin = makeVin(rng, model.make, year, model.wmi);

  // Ownership.
  const notes: Text[] = [];
  let ownerCompany: string | undefined;
  let companyCat: FleetOwnerKind | undefined;
  if (o.owner) {
    const leaseChance = kind === 'car' || kind === 'van' || kind === 'moto' ? (age <= 3 ? 0.45 : age <= 7 ? 0.25 : 0.04) : 0;
    if (rng.chance(leaseChance)) {
      ownerCompany = rng.pick(FLEET_OWNERS.leasing);
      companyCat = 'leasing';
      notes.push({
        et: `Liisingusõiduk: omanik ${ownerCompany}, vastutav kasutaja on registreeritud isik.`,
        en: `Leased vehicle: owned by ${ownerCompany}; the registered person is the responsible user.`,
      });
    }
  } else {
    const c = pickCompany(rng, kind);
    ownerCompany = c.name;
    companyCat = c.cat;
    if (c.cat === 'taxi') notes.push({ et: 'Kasutatakse taksoveoks.', en: 'Used as a taxi.' });
    if (c.cat === 'rental')
      notes.push({
        et: 'Rendisõiduk. Rentniku andmed saab rendileandjalt.',
        en: 'Rental vehicle. Renter details are available from the rental company.',
      });
  }

  // Insurance (liikluskindlustus).
  const insurer = INSURERS[rng.weighted(INSURERS.map((_, i) => i), (i) => INSURER_WEIGHTS[i] ?? 1)];
  const insurance = noInsurance
    ? { valid: false, until: isoDate(now - rng.int(3, 240) * DAY), insurer }
    : { valid: true, until: isoDate(now + rng.int(4, 365) * DAY), insurer };

  // Roadworthiness test (tehnoülevaatus). Taxis and rental cars are tested yearly.
  const sched = schedule && (companyCat === 'taxi' || companyCat === 'rental') && (kind === 'car' || kind === 'van') ? [1] : schedule;
  const inspection = sched
    ? { valid: !noInspection, until: inspectionUntil(rng, reg, sched, now, noInspection) }
    : { valid: true, until: isoDate(now + 365 * DAY) };

  // Flags.
  const flags: Vehicle['flags'] = {};
  if (stolen) flags.stolen = stolenFlag(rng, now, model, !o.owner && companyCat === 'rental');
  if (suspended) {
    flags.suspended = true;
    const d = ddmmyyyy(now - rng.int(20, 900) * DAY);
    notes.unshift(
      rng.chance(0.5)
        ? { et: `Registreering peatatud ${d} omaniku taotlusel.`, en: `Registration suspended on ${d} at the owner’s request.` }
        : {
            et: `Registreering peatatud ${d}. Sõidukiga liiklemine on keelatud.`,
            en: `Registration suspended on ${d}. The vehicle may not be used on public roads.`,
          },
    );
  }

  // Occasional registry notes.
  if (schedule && age >= schedule[0] && rng.chance(0.25)) {
    const perYear = kind === 'truck' || kind === 'bus' ? rng.int(70_000, 130_000) : kind === 'car' || kind === 'van' ? rng.int(13_000, 24_000) : rng.int(2_000, 6_000);
    const km = Math.max(1, age - 1) * perYear + rng.int(0, 9_999);
    notes.push({ et: `Läbisõit viimasel ülevaatusel ${group(km, ' ')} km.`, en: `Odometer at last inspection: ${group(km, ',')} km.` });
  }
  if (rng.chance(0.025)) notes.push({ et: 'Kohtutäituri käsutamiskeeld.', en: 'Disposal ban imposed by a bailiff.' });
  if (kind === 'car' && age >= 8 && rng.chance(0.02))
    notes.push({ et: 'Sõidukile on paigaldatud gaasiseade (LPG).', en: 'LPG conversion installed.' });
  if (age >= 30 && rng.chance(0.6)) notes.push({ et: 'Registreeritud ajaloolise sõidukina.', en: 'Registered as a historic vehicle.' });
  if (rng.chance(0.01))
    notes.push({
      et: 'Registreerimismärk asendatud, varasem märk kehtetu (kadunud).',
      en: 'Plate replaced; the previous plate is invalid (lost).',
    });

  const v: Vehicle = {
    plate,
    vin,
    make: model.make,
    model: model.model,
    year,
    color: { et: color.et, en: color.en },
    kind,
    insurance,
    inspection,
    flags,
    notes,
  };
  if (o.owner) v.ownerId = o.owner.id;
  if (ownerCompany) v.ownerCompany = ownerCompany;
  return v;
}

/** "hall Toyota Avensis" / "grey Toyota Avensis", used for the {car} placeholder. */
export function describeVehicle(v: Pick<Vehicle, 'color' | 'make' | 'model'>): Text {
  return { et: `${v.color.et} ${v.make} ${v.model}`, en: `${v.color.en} ${v.make} ${v.model}` };
}
