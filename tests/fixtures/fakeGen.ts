/**
 * Simple deterministic stand-ins for the procedural generators and engine-systems modules, so the
 * engine-core tests do not depend on other agents' work in progress.
 */
import type { Rng } from '@/sim/rng';
import type {
  ActiveCall,
  Gender,
  IncidentLocation,
  LngLat,
  Person,
  PersonSpec,
  PlaceKind,
  RegionDef,
  ShiftReport,
  SimState,
  SpeakerLang,
  Text,
  Vehicle,
  VehicleKind,
  VehicleSpec,
  Weather,
} from '@/sim/types';

const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
const W2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];
function checksum(f: string): number {
  const d = f.split('').map(Number);
  let s = d.reduce((a, v, i) => a + v * W1[i], 0) % 11;
  if (s < 10) return s;
  s = d.reduce((a, v, i) => a + v * W2[i], 0) % 11;
  return s < 10 ? s : 0;
}

// ── gen/names ───────────────────────────────────────────────────────────────
export const namesModule = {
  randomName(rng: Rng, lang: SpeakerLang, gender: Gender) {
    const m = lang === 'ru' ? ['Sergei', 'Dmitri', 'Andrei'] : ['Jaan', 'Toomas', 'Mart', 'Priit'];
    const f = lang === 'ru' ? ['Jelena', 'Olga', 'Natalja'] : ['Mari', 'Kadri', 'Liis', 'Tiina'];
    const l = lang === 'ru' ? ['Ivanov', 'Petrov', 'Smirnov'] : ['Tamm', 'Saar', 'Kask', 'Sepp', 'Mägi'];
    return { firstName: rng.pick(gender === 'M' ? m : f), lastName: rng.pick(l) };
  },
  surnameForGender(surname: string, gender: Gender, origin: string) {
    if (origin === 'ru' && gender === 'F' && /ov$/.test(surname)) return surname + 'a';
    return surname;
  },
};

// ── gen/person ──────────────────────────────────────────────────────────────
interface PersonGenOptions {
  id: string;
  now: number;
  region: RegionDef;
  gender?: Gender;
  age?: [number, number];
  lang?: SpeakerLang;
  spec?: PersonSpec;
  home?: { address: string; city: string; coord?: LngLat };
  lastName?: string;
}

export const personModule = {
  generatePerson(rng: Rng, o: PersonGenOptions): Person {
    const gender: Gender = o.gender ?? (rng.chance(0.5) ? 'M' : 'F');
    const [a0, a1] = o.age ?? [18, 80];
    const age = rng.int(a0, a1);
    const year = new Date(o.now).getUTCFullYear() - age;
    const month = rng.int(1, 12);
    const day = rng.int(1, 28);
    const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cd = (year < 2000 ? 3 : 5) + (gender === 'F' ? 1 : 0);
    const f10 = `${cd}${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${String(rng.int(1, 999)).padStart(3, '0')}`;
    const nm = namesModule.randomName(rng, o.lang ?? 'et', gender);
    const sp = o.spec;
    const p: Person = {
      id: o.id,
      idcode: f10 + checksum(f10),
      firstName: nm.firstName,
      lastName: o.lastName ?? nm.lastName,
      gender,
      birthDate,
      citizenship: 'EST',
      lang: o.lang ?? 'et',
      address: o.home?.address ?? `Testi tn ${rng.int(1, 99)}`,
      city: o.home?.city ?? 'Testlinn',
      coord: o.home?.coord ?? [24.75 + rng.range(-0.05, 0.05), 59.43 + rng.range(-0.02, 0.02)],
      phone: `+372 5${rng.int(100, 999)} ${rng.int(1000, 9999)}`,
      occupation: { et: 'lukksepp', en: 'locksmith' },
      appearance: { heightCm: 175, build: 'average', hair: 'short', hairColor: 'brown', eyes: 'blue', clothing: { et: 'must jope', en: 'black jacket' } },
      license: rng.chance(sp?.noLicense ?? 0) ? { status: 'suspended', categories: ['B'] } : { status: 'valid', categories: ['B'], validUntil: '2035-01-01' },
      records: [],
      flags: {},
      vehicles: [],
      notes: [],
      avatarSeed: rng.int(1, 1e9),
    };
    if (rng.chance(sp?.wanted ?? 0)) p.flags.wanted = { reason: { et: 'Vargus', en: 'Theft' }, since: '2026-01-01', dangerous: false, authority: 'Harju Maakohus' };
    if (rng.chance(sp?.restraining ?? 0)) p.flags.restrainingOrder = { protectedName: 'Keegi Teine', until: '2099-01-01' };
    if (rng.chance(sp?.weapon ?? 0)) p.weaponPermit = { kind: { et: 'relvaluba', en: 'permit' }, validUntil: '2030-01-01', weapons: ['Glock 17'] };
    if (rng.chance(sp?.probation ?? 0)) p.flags.probation = { until: '2099-01-01' };
    return p;
  },
  RESIDENT_EPOCH: Date.UTC(2026, 0, 1, 10, 0),
  /** Per-shift status of a fixed resident (the real one: gen/person refreshResident). */
  refreshResident(rng: Rng, p: Person, o: { now: number; spec?: PersonSpec }): void {
    delete p.flags.wanted;
    delete p.flags.restrainingOrder;
    delete p.flags.probation;
    if (rng.chance(o.spec?.wanted ?? 0)) p.flags.wanted = { reason: { et: 'Vargus', en: 'Theft' }, since: '2026-01-01', dangerous: false, authority: 'Harju Maakohus' };
    if (rng.chance(o.spec?.restraining ?? 0)) p.flags.restrainingOrder = { protectedName: 'Keegi Teine', until: '2099-01-01' };
    if (rng.chance(o.spec?.probation ?? 0)) p.flags.probation = { until: '2099-01-01' };
  },
};

// ── gen/vehicle ─────────────────────────────────────────────────────────────
export const vehicleModule = {
  generateVehicle(rng: Rng, o: { now: number; kind?: VehicleKind; owner?: Person; spec?: VehicleSpec }): Vehicle {
    const L = 'ABCDEFGHJKLMNPRSTUVZ';
    const plate = `${rng.int(100, 999)} ${L[rng.int(0, L.length - 1)]}${L[rng.int(0, L.length - 1)]}${L[rng.int(0, L.length - 1)]}`;
    const sp = o.spec;
    const v: Vehicle = {
      plate,
      vin: 'TESTVIN' + rng.int(1e9, 9e9),
      make: 'Toyota',
      model: 'Corolla',
      year: 2015,
      color: { et: 'hall', en: 'grey' },
      kind: o.kind ?? 'car',
      ownerId: o.owner?.id,
      insurance: { valid: !rng.chance(sp?.noInsurance ?? 0), until: '2030-01-01', insurer: 'Kindlustus AS' },
      inspection: { valid: !rng.chance(sp?.noInspection ?? 0), until: '2030-01-01' },
      flags: {},
      notes: [],
    };
    if (rng.chance(sp?.stolen ?? 0)) v.flags.stolen = { since: '2026-10-01', text: { et: 'Varastatud', en: 'Stolen' } };
    if (rng.chance(sp?.suspended ?? 0)) v.flags.suspended = true;
    return v;
  },
  makePlate: () => '123 ABC',
  makeVin: () => 'VIN',
  normalizePlate: (s: string) => s.toUpperCase().replace(/\s+/g, ''),
};

// ── gen/address ─────────────────────────────────────────────────────────────
export const addressModule = {
  pickLocation(rng: Rng, region: RegionDef, kinds: PlaceKind[]): IncidentLocation {
    const k = rng.pick(kinds.length ? kinds : (['street'] as PlaceKind[]));
    const places = region.places.filter((p) => p.kind === k && (p.zone ?? 'mainland') === 'mainland');
    if (places.length) {
      const p = rng.pick(places);
      return { address: p.address, coord: p.coord, city: p.city, district: p.district, placeName: p.name, placeKind: p.kind, zone: p.zone ?? 'mainland' };
    }
    const st = rng.pick(region.streets);
    const n = rng.int(st.houses[0], st.houses[1]);
    const t = rng.next();
    const a = st.points[0];
    const b = st.points[st.points.length - 1];
    const coord: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const address = st.kind === 'apartment' ? `${st.name} ${n}-${rng.int(1, 60)}` : `${st.name} ${n}`;
    return { address, coord, city: st.city, district: st.district, placeKind: k, zone: 'mainland' };
  },
  homeAddress(rng: Rng) {
    return { address: `Kodu tn ${rng.int(1, 50)}`, city: 'Testlinn', coord: [24.75, 59.43] as LngLat };
  },
};

// ── gen/describe ────────────────────────────────────────────────────────────
export const describeModule = {
  ageOf(p: Person, now: number): number {
    const b = new Date(p.birthDate + 'T00:00:00Z').getTime();
    return Math.floor((now - b) / (365.2425 * 86400000));
  },
  describePerson(p: Person, now: number): Text {
    const a = describeModule.ageOf(p, now);
    return p.gender === 'M' ? { et: `mees, u ${a}a, must jope`, en: `man, about ${a}, black jacket` } : { et: `naine, u ${a}a`, en: `woman, about ${a}` };
  },
  shortPerson(p: Person, now: number): Text {
    const a = describeModule.ageOf(p, now);
    return { et: `${p.gender === 'M' ? 'mees' : 'naine'}, ${a}a`, en: `${p.gender === 'M' ? 'man' : 'woman'}, ${a}` };
  },
  describeVehicle(v: Vehicle): Text {
    return { et: `${v.color.et} ${v.make} ${v.model} (${v.plate})`, en: `${v.color.en} ${v.make} ${v.model} (${v.plate})` };
  },
};

// ── engine-systems stand-ins ────────────────────────────────────────────────
export const callsModule = {
  maybeCreateCall: (): ActiveCall | null => null,
  updateCalls: () => {},
  callAnswer: () => {},
  callAsk: () => {},
  callInterpreter: () => {},
  callEnd: () => {},
};

export const weatherModule = {
  initialWeather: (): Weather => ({ kind: 'clear', tempC: 10, windMs: 3, roadFactor: 1, text: { et: 'Selge', en: 'Clear' } }),
  updateWeather: () => {},
  weatherCallFactor: () => 1,
  weatherTrafficFactor: () => 1,
};

export const calendarModule = {
  hourCurve: () => 1,
  weekdayFactor: () => 1,
  dayInfo: () => ({ factor: 1, tags: [] as string[] }),
};

export const pursuitModule = {
  startPursuit(s: SimState, inc: { pursuit?: unknown }, from: LngLat) {
    (inc as { pursuit: unknown }).pursuit = { suspectPos: from, heading: 0, speedKmh: 90, startedAt: s.now, risk: 0, pressure: 0, heli: false, spikes: false, trail: [] };
  },
  updatePursuit(s: SimState, inc: { pursuit?: { startedAt: number; ended?: string } }) {
    if (inc.pursuit && s.now - inc.pursuit.startedAt > 5 * 60_000) {
      inc.pursuit.ended = 'caught';
      return true;
    }
    return false;
  },
  pursuitCommand: () => {},
};

export const searchModule = {
  startSearch(s: SimState, inc: { search?: unknown; location: { coord: LngLat } }, radiusKm: number) {
    (inc as { search: unknown }).search = { center: inc.location.coord, radiusKm, progress: 0, startedAt: s.now };
  },
  updateSearch(s: SimState, inc: { search?: { startedAt: number; found?: boolean } }) {
    if (inc.search && s.now - inc.search.startedAt > 10 * 60_000) {
      inc.search.found = true;
      return true;
    }
    return false;
  },
};

export const sunModule = {
  sunTimes: (t: number) => ({ sunrise: t - 3_600_000, sunset: t + 3_600_000 }),
  sunAltitude: () => 20,
};

export const reportModule = {
  buildReport: (s: SimState): ShiftReport => ({ score: s.stats.score }) as unknown as ShiftReport,
};
