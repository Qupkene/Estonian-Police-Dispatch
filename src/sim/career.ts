/**
 * Pure career/economy rules (DESIGN §4.12): new profile, roster building, applying a finished
 * shift (money, Staatus, xp & ranks, injuries, payday every 30 days, achievements), recruiting,
 * fleet and upgrades. Every function returns new objects and never mutates its input.
 *
 * Owned by engine-systems. Numbers live in data/economy.ts.
 */
import {
  ACHIEVEMENTS,
  BASE_SALARY,
  DAILY_BUDGET,
  EXTRA_REGION_RANKS,
  HIRE_COST_MONTHS,
  MAX_STAFF,
  RANKS,
  REGION_UNLOCK_ORDER,
  RESALE_FACTOR,
  SALARY_MAX,
  SALARY_MIN,
  SEVERANCE_MONTHS,
  START_MONEY,
  START_REPUTATION,
  UPGRADES,
  VEHICLE_CATALOG,
} from '@/data/economy';
import { REGIONS } from '@/data/regions';
import { randomName } from '@/gen/names';
import { makePlate } from '@/gen/vehicle';
import type { ReportExtras, ShiftReportX } from './report';
import { hashString, Rng } from './rng';
import type {
  Candidate,
  CareerProfile,
  FleetVehicle,
  Gender,
  LedgerEntry,
  Officer,
  RegionDef,
  RegionId,
  RosterUnit,
  ShiftReport,
  SpeakerLang,
  StaffMember,
  Text,
  UnitSpec,
  UnitType,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (x: number) => Math.round(x * 100) / 100;
const euro = (n: number) => `${Math.round(n).toLocaleString('et-EE').replace(/ /g, ' ')} €`;

/** Optional extras persisted on the profile object (JSON-safe, not part of the core type). */
export interface CareerCounters {
  nightShifts: number;
  pranksCaught: number;
  aStreak: number;
}
export type CareerProfileX = CareerProfile & { counters?: CareerCounters };

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function counters(p: CareerProfile): CareerCounters {
  return { nightShifts: 0, pranksCaught: 0, aStreak: 0, ...((p as CareerProfileX).counters ?? {}) };
}

function regionOf(id: RegionId): RegionDef | undefined {
  return REGIONS[id];
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranks
// ─────────────────────────────────────────────────────────────────────────────

export function rankOf(xp: number): { index: number; name: Text; next?: number } {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  return { index, name: RANKS[index]?.name ?? T('Nooremkonstaabel', 'Junior Constable'), next: RANKS[index + 1]?.xp };
}

/** Officer special rank (eriaste) for years of service. */
export function staffRank(years: number): Text {
  if (years < 1) return T('nooremkonstaabel', 'junior constable');
  if (years < 3) return T('konstaabel', 'constable');
  if (years < 7) return T('vanemkonstaabel', 'senior constable');
  if (years < 12) return T('ülemkonstaabel', 'chief constable');
  if (years < 18) return T('komissar', 'commissioner');
  return T('vanemkomissar', 'senior commissioner');
}

/** Job title (ametinimetus) for a specialty. */
export function staffTitle(spec: UnitType, years: number): Text {
  const senior = years >= 7;
  switch (spec) {
    case 'patrol':
      return senior ? T('vanempatrullpolitseinik', 'senior patrol officer') : T('patrullpolitseinik', 'patrol officer');
    case 'rapid':
      return T('kiirreageerija', 'rapid-response officer');
    case 'criminal':
      return senior ? T('vanemuurija', 'senior investigator') : T('uurija', 'investigator');
    case 'k9':
      return T('koerajuht', 'dog handler');
    case 'traffic':
      return T('liiklusjärelevalve politseinik', 'traffic police officer');
    case 'community':
      return T('piirkonnapolitseinik', 'community police officer');
    case 'aux':
      return T('abipolitseinik', 'auxiliary police officer');
    case 'transport':
      return T('konvoeerija', 'escort officer');
    case 'special':
      return T('K-komando operatiivametnik', 'K-komando operator');
    case 'heli':
      return T('lennusalga piloot', 'air unit pilot');
    case 'border':
      return senior ? T('vanempiirivalvur', 'senior border guard') : T('piirivalvur', 'border guard');
    case 'boat':
      return T('kaatrijuht', 'boat skipper');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidates
// ─────────────────────────────────────────────────────────────────────────────

const DOGS = ['Rex', 'Kaiser', 'Bella', 'Nora', 'Tuuli', 'Max', 'Indy', 'Pitsu', 'Odin', 'Saga'];

function bioFor(rng: Rng, spec: UnitType, years: number, lang: SpeakerLang, region: RegionDef | undefined): Text {
  const city = region?.towns.length ? rng.pick(region.towns.slice(0, 6)).name : region?.hqCity || 'Tallinn';
  let b: Text;
  switch (spec) {
    case 'patrol':
      b =
        years < 2
          ? rng.pick([
              T('Sisekaitseakadeemia värske lõpetaja, motiveeritud ja kiire õppija.', 'Fresh graduate of the Academy of Security Sciences, motivated and a fast learner.'),
              T('Noor patrullpolitseinik, endine kiirabi tehnik, kes ei kaota kriisis pead.', 'Young patrol officer and former ambulance technician who keeps a cool head in a crisis.'),
            ])
          : rng.pick([
              T(`${years} aastat patrullis, tunneb ${city} tänavaid peast.`, `${years} years on patrol, knows the streets of ${city} by heart.`),
              T('Rahulik ja kogenud toimkonna vanem, oskab pingeid maandada.', 'Calm, experienced crew leader who knows how to de-escalate.'),
            ]);
      break;
    case 'rapid':
      b = rng.pick([
        T('Endine kaitseväelane, läbinud kiirreageerija väljaõppe.', 'Former soldier who has completed rapid-response training.'),
        T('Taktikalise meditsiini instruktor ja kiirreageerija.', 'Tactical medicine instructor and rapid-response officer.'),
      ]);
      break;
    case 'criminal':
      b = rng.pick([
        T('Kogenud uurija, spetsialiseerunud varavastastele süütegudele.', 'Experienced investigator specialising in property crime.'),
        T('Isikuvastaste süütegude uurija, hea ülekuulaja.', 'Investigator of crimes against persons, a skilled interviewer.'),
      ]);
      break;
    case 'k9':
      b = T(`Koerajuht, partneriks belgia lambakoer ${rng.pick(DOGS)}.`, `Dog handler partnered with a Belgian Malinois called ${rng.pick(DOGS)}.`);
      break;
    case 'traffic':
      b = T('Liiklusjärelevalve spetsialist, tuhandeid joobekontrolle selja taga.', 'Traffic enforcement specialist with thousands of sobriety checks behind them.');
      break;
    case 'community':
      b = T(`Piirkonnapolitseinik ${city} kandist, kogukond usaldab teda.`, `Community officer from the ${city} area, trusted by the locals.`);
      break;
    case 'aux':
      b = rng.pick([
        T('Abipolitseinik, päevatööl IT-arendaja, panustab vabast ajast.', 'Auxiliary officer, a software developer by day who volunteers in their free time.'),
        T('Abipolitseinik ja vabatahtlik päästja, tunneb kohalikke.', 'Auxiliary officer and volunteer firefighter who knows the locals.'),
      ]);
      break;
    case 'transport':
      b = T('Konvoeerija, rahulik ja kindlakäeline.', 'Escort officer, calm and steady-handed.');
      break;
    case 'special':
      b = T('Endine K-komando operatiivametnik, täpsuslaskur ja parameedik.', 'Former K-komando operator, marksman and paramedic.');
      break;
    case 'heli':
      b = T('Lennusalga piloot, tuhandeid lennutunde merepäästes.', 'Air unit pilot with thousands of hours in maritime rescue.');
      break;
    case 'border':
      b = T('Endine piirivalvur, tunneb idapiiri ja selle radu.', 'Former border guard who knows the eastern border and its tracks.');
      break;
    case 'boat':
      b = T('Kogenud kaatrijuht, teenis aastaid merevalves.', 'Experienced skipper who served for years in maritime surveillance.');
      break;
  }
  if (lang === 'ru' || lang === 'uk') b = { et: `${b.et} Räägib vabalt vene keelt.`, en: `${b.en} Speaks fluent Russian.` };
  return b;
}

function specialtyWeights(p: CareerProfile): [UnitType, number][] {
  const rank = rankOf(p.xp).index;
  const owns = (id: string) => p.upgrades.includes(id);
  const borderRegion = p.regionId === 'ida' || p.regionId === 'louna';
  return [
    ['patrol', 40],
    ['rapid', 10],
    ['criminal', 11],
    ['traffic', 9],
    ['community', 8],
    ['aux', 7],
    ['k9', owns('k9kennel') ? 7 : 3],
    ['transport', 3],
    ['border', borderRegion ? 5 : 0],
    ['special', owns('kkomando') || rank >= 6 ? 3 : 0],
    ['boat', p.fleet.some((v) => v.suits.includes('boat')) || rank >= 5 ? 2 : 0],
  ];
}

/** Salary demand for a specialty / skill / experience (€/month gross, 1 700–3 400). */
export function salaryFor(spec: UnitType, skill: number, years: number, noise = 0): number {
  const base = BASE_SALARY[spec] ?? 2035;
  const s = base + Math.max(0, skill - 0.45) * 1400 + Math.min(20, years) * 14 + noise;
  return clamp(Math.round(s / 10) * 10, SALARY_MIN, SALARY_MAX);
}

export function generateCandidates(rng: Rng, n: number, p: CareerProfile): Candidate[] {
  const region = regionOf(p.regionId);
  const ruP = p.regionId === 'ida' ? 0.45 : p.regionId === 'pohja' ? 0.2 : 0.07;
  const weights = specialtyWeights(p).filter(([, w]) => w > 0);
  const out: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    const specialty = rng.weighted(weights, ([, w]) => w)[0];
    const gender: Gender = rng.chance(specialty === 'special' ? 0.05 : specialty === 'community' ? 0.45 : 0.33) ? 'F' : 'M';
    const lang: SpeakerLang = rng.chance(ruP) ? (rng.chance(0.08) ? 'uk' : 'ru') : 'et';
    let years = specialty === 'aux' ? rng.int(0, 10) : Math.max(0, Math.round(Math.abs(rng.normal(5, 6))));
    if (specialty === 'special' || specialty === 'heli') years = Math.max(years, rng.int(6, 15));
    if (specialty === 'criminal' || specialty === 'k9') years = Math.max(years, rng.int(2, 6));
    years = Math.min(30, years);
    const age = clamp(21 + years + rng.int(0, 8), 20, 63);
    const birthYear = new Date().getUTCFullYear() - age;
    const nm = randomName(rng, lang, gender, birthYear);
    const skill = r2(clamp(0.36 + Math.min(0.35, years * 0.022) + rng.normal(0, 0.08) - (specialty === 'aux' ? 0.06 : 0), 0.22, 0.97));
    const salary = salaryFor(specialty, skill, years, rng.normal(0, 70));
    out.push({
      id: `cand-${p.day}-${i}-${rng.int(1000, 9999)}`,
      firstName: nm.firstName,
      lastName: nm.lastName,
      gender,
      age,
      specialty,
      skill,
      salary,
      years,
      avatarSeed: rng.int(1, 0x7fffffff),
      bio: bioFor(rng, specialty, years, lang, region),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// New career
// ─────────────────────────────────────────────────────────────────────────────

const HOMAGE_2024: { firstName: string; lastName: string; badge: string; gender: Gender; specialty: UnitType; years: number; skill: number }[] = [
  { firstName: 'Kalle', lastName: 'Rebane', badge: '085', gender: 'M', specialty: 'patrol', years: 12, skill: 0.74 },
  { firstName: 'Priit', lastName: 'Saar', badge: '013', gender: 'M', specialty: 'patrol', years: 8, skill: 0.66 },
  { firstName: 'Eeva', lastName: 'Leht', badge: '044', gender: 'F', specialty: 'patrol', years: 6, skill: 0.63 },
  { firstName: 'Pille', lastName: 'Vits', badge: '051', gender: 'F', specialty: 'patrol', years: 4, skill: 0.58 },
  { firstName: 'Jenni', lastName: 'Must', badge: '052', gender: 'F', specialty: 'patrol', years: 2, skill: 0.52 },
  { firstName: 'Ursula', lastName: 'Treen', badge: '960', gender: 'F', specialty: 'criminal', years: 14, skill: 0.78 },
  { firstName: 'Reimo', lastName: 'Rann', badge: '961', gender: 'M', specialty: 'criminal', years: 9, skill: 0.7 },
  { firstName: 'Toomas', lastName: 'Perk', badge: '570', gender: 'M', specialty: 'rapid', years: 11, skill: 0.8 },
];

const START_SPECIALTIES: UnitType[] = ['patrol', 'patrol', 'patrol', 'patrol', 'patrol', 'criminal', 'rapid', 'traffic'];

function makeStaff(
  id: string,
  o: { firstName: string; lastName: string; badge: string; gender: Gender; specialty: UnitType; years: number; skill: number; avatarSeed: number },
  day: number,
): StaffMember {
  return {
    id,
    badge: o.badge,
    firstName: o.firstName,
    lastName: o.lastName,
    gender: o.gender,
    rank: staffRank(o.years),
    title: staffTitle(o.specialty, o.years),
    years: o.years,
    skill: o.skill,
    stress: 0,
    avatarSeed: o.avatarSeed,
    specialty: o.specialty,
    salary: salaryFor(o.specialty, o.skill, o.years),
    hiredDay: day,
    status: 'active',
    morale: 0.75,
    xp: 0,
    shifts: 0,
  };
}

function uniqueBadge(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 200; i++) {
    const b = String(rng.int(10, 999)).padStart(3, '0');
    if (!used.has(b)) {
      used.add(b);
      return b;
    }
  }
  const b = String(rng.int(1000, 9999));
  used.add(b);
  return b;
}

function fleetVehicle(id: string, catalogId: string, plate: string, day: number): FleetVehicle {
  const c = VEHICLE_CATALOG.find((v) => v.id === catalogId)!;
  return { id, model: c.model, plate, suits: [...c.suits], condition: 1, boughtDay: day, price: c.price, upkeep: c.upkeep };
}

export function newCareer(name: string, badge: string, regionId: RegionId, seed: number): CareerProfile {
  const rng = new Rng(seed >>> 0);
  const used = new Set<string>([badge]);
  const staff: StaffMember[] = [];
  if (regionId === 'pohja') {
    HOMAGE_2024.forEach((h, i) => {
      used.add(h.badge);
      staff.push(makeStaff(`staff-${i + 1}`, { ...h, avatarSeed: hashString(`${h.firstName} ${h.lastName}`) & 0x7fffffff }, 1));
    });
  } else {
    const ruP = regionId === 'ida' ? 0.4 : 0.06;
    START_SPECIALTIES.forEach((spec, i) => {
      const gender: Gender = rng.chance(0.35) ? 'F' : 'M';
      const lang: SpeakerLang = rng.chance(ruP) ? 'ru' : 'et';
      const years = i === 0 ? rng.int(9, 15) : rng.int(1, 12);
      const nm = randomName(rng, lang, gender, new Date().getUTCFullYear() - (22 + years));
      const skill = r2(clamp(0.45 + years * 0.02 + rng.normal(0, 0.05), 0.4, 0.85));
      staff.push(makeStaff(`staff-${i + 1}`, { ...nm, badge: uniqueBadge(rng, used), gender, specialty: spec, years, skill, avatarSeed: rng.int(1, 0x7fffffff) }, 1));
    });
  }
  const fleet: FleetVehicle[] = [
    fleetVehicle('veh-1', 'skoda_octavia_combi', makePlate(rng), 1),
    fleetVehicle('veh-2', 'skoda_octavia_combi', makePlate(rng), 1),
    // Starting cars cover every starting specialty (patrol, rapid, criminal, traffic).
    fleetVehicle('veh-3', 'skoda_superb_combi', makePlate(rng), 1),
    fleetVehicle('veh-4', 'skoda_scala', makePlate(rng), 1),
  ];
  const base: CareerProfileX = {
    version: 1,
    name,
    badge,
    regionId,
    createdAt: Date.now(),
    seed: seed >>> 0,
    day: 1,
    money: START_MONEY,
    reputation: START_REPUTATION,
    xp: 0,
    staff,
    fleet,
    upgrades: [],
    ledger: [],
    recruits: [],
    history: [],
    achievements: [],
    unlockedRegions: [regionId],
    stats: { shifts: 0, incidents: 0, arrests: 0, bestScore: 0, pursuitsCaught: 0 },
    counters: { nightShifts: 0, pranksCaught: 0, aStreak: 0 },
  };
  base.recruits = generateCandidates(rng, 8, base);
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Roster
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX: Record<RegionId, string> = { pohja: 'P', ida: 'I', louna: 'L', laane: 'W' };
const FALLBACK_CODE: Record<UnitType, string> = {
  patrol: '',
  rapid: 'K-',
  k9: 'KOER-',
  traffic: 'LIIK-',
  criminal: 'KRIM-',
  special: 'K-KOMANDO',
  heli: 'KOPTER ',
  border: 'PIIR-',
  aux: 'ABI-',
  community: 'PIIRK-',
  transport: 'KONVOI-',
  boat: 'KAATER ',
};

function toOfficer(m: StaffMember): Officer {
  return {
    id: m.id,
    badge: m.badge,
    firstName: m.firstName,
    lastName: m.lastName,
    gender: m.gender,
    rank: m.rank,
    title: m.title,
    years: m.years,
    skill: m.skill,
    stress: r2(clamp((1 - m.morale) * 0.3, 0, 0.6)),
    avatarSeed: m.avatarSeed,
  };
}

/** Callsign/station allocator that reuses the prefecture roster's scheme. */
function allocator(p: CareerProfile, shift: 'day' | 'night') {
  const region = regionOf(p.regionId);
  const specs: UnitSpec[] = (region?.roster ?? []).filter((x) => (x.shift ?? 'both') === 'both' || x.shift === shift);
  const allSpecs: UnitSpec[] = region?.roster ?? [];
  const stations = (region?.stations ?? []).filter((x) => x.kind === 'station' || x.kind === 'hq' || x.kind === 'post');
  const usedSigns = new Set<string>();
  const counters: Partial<Record<UnitType, number>> = {};
  let rr = 0;
  return (type: UnitType): { callsign: string; stationId: string; zone?: string } => {
    const spec = specs.find((x) => x.type === type && !usedSigns.has(x.callsign)) ?? allSpecs.find((x) => x.type === type && !usedSigns.has(x.callsign));
    if (spec) {
      usedSigns.add(spec.callsign);
      return { callsign: spec.callsign, stationId: spec.stationId, zone: spec.zone };
    }
    // Derive from the last roster callsign of this type ("P1-23" → "P1-24"), else a fallback scheme.
    const station = stations.length ? stations[rr++ % stations.length] : undefined;
    const proto = [...allSpecs].reverse().find((x) => x.type === type);
    let sign = '';
    for (let k = 0; k < 200 && (!sign || usedSigns.has(sign)); k++) {
      counters[type] = (counters[type] ?? 0) + 1;
      const n = counters[type]!;
      if (proto && /\d+$/.test(proto.callsign)) {
        const m = /^(.*?)(\d+)$/.exec(proto.callsign)!;
        sign = `${m[1]}${Number(m[2]) + n}`;
      } else if (type === 'special') sign = n === 1 ? 'K-KOMANDO' : `K-KOMANDO ${n}`;
      else if (type === 'patrol') sign = `${PREFIX[p.regionId]}${(rr % 3) + 1}-${20 + n}`;
      else sign = `${FALLBACK_CODE[type]}${PREFIX[p.regionId]}${n}`;
    }
    usedSigns.add(sign);
    return { callsign: sign, stationId: proto?.stationId && !station ? proto.stationId : station?.id ?? proto?.stationId ?? '', zone: station?.zone };
  };
}

/** Vehicle preferences per unit type (first matching suit wins). */
const VEHICLE_PREF: Partial<Record<UnitType, UnitType[]>> = {
  patrol: ['patrol', 'transport', 'aux', 'community'],
  rapid: ['rapid', 'special', 'patrol', 'transport'],
  criminal: ['criminal', 'community', 'patrol', 'aux'],
  k9: ['k9', 'patrol', 'community'],
  traffic: ['traffic', 'patrol'],
  community: ['community', 'aux', 'patrol'],
  aux: ['aux', 'patrol', 'community'],
  border: ['border', 'patrol'],
  transport: ['transport'],
  boat: ['boat'],
};

/** Round-robin order in which crews get vehicles: patrol first, specialists interleaved. */
const ASSIGN_ORDER: UnitType[] = ['patrol', 'rapid', 'patrol', 'criminal', 'k9', 'patrol', 'traffic', 'border', 'community', 'patrol', 'aux', 'transport', 'boat'];

/**
 * Crews of 2 (patrol) etc. from active staff + fleet for the given shift. Patrol crews are
 * formed first and vehicles are handed out round-robin (patrol, rapid, patrol, criminal, K9…)
 * so a small fleet yields a balanced shift; staff without a vehicle take a third seat in a
 * patrol car (or ride with an investigator). Officer ids equal staff ids.
 */
export function rosterFromCareer(p: CareerProfile, shift: 'day' | 'night'): RosterUnit[] {
  const owns = (id: string) => p.upgrades.includes(id);
  const active = p.staff.filter((m) => m.status === 'active').sort((a, b) => b.skill - a.skill);
  const pool = new Map<UnitType, StaffMember[]>();
  const take = (t: UnitType) => {
    if (!pool.has(t)) pool.set(t, []);
    return pool.get(t)!;
  };
  for (const m of active) {
    let spec = m.specialty;
    if (spec === 'k9' && !owns('k9kennel')) spec = 'patrol';
    if (spec === 'special' && !owns('kkomando')) spec = 'rapid';
    if (spec === 'heli' && !owns('heli_hours')) continue; // pilots fly only with helicopter hours
    if (spec === 'community' && shift === 'night') spec = 'patrol';
    if (spec === 'border' && p.regionId !== 'ida' && p.regionId !== 'louna') spec = 'patrol';
    if (spec === 'boat' && !p.fleet.some((v) => v.suits.includes('boat'))) spec = 'patrol';
    take(spec).push(m);
  }

  const vehicles = [...p.fleet].filter((v) => v.condition > 0.05).sort((a, b) => b.condition - a.condition);
  const usedV = new Set<string>();
  const pickVehicle = (type: UnitType): FleetVehicle | undefined => {
    for (const t of VEHICLE_PREF[type] ?? [type]) {
      // Prefer the most specialised vehicle (fewest suits) that fits.
      const v = vehicles.filter((x) => !usedV.has(x.id) && x.suits.includes(t)).sort((a, b) => a.suits.length - b.suits.length)[0];
      if (v) {
        usedV.add(v.id);
        return v;
      }
    }
    return undefined;
  };
  const alloc = allocator(p, shift);
  const units: (RosterUnit & { _staff: StaffMember[] })[] = [];
  const add = (type: UnitType, crew: StaffMember[], vehicle: string, onCall?: boolean) => {
    const a = alloc(type);
    units.push({ callsign: a.callsign, type, stationId: a.stationId, vehicle, crew: [], _staff: crew, ...(onCall ? { onCall: true } : {}), ...(a.zone ? { zone: a.zone } : {}) });
  };

  // On-call special assets (do not consume patrol vehicles).
  const special = take('special');
  if (special.length && owns('kkomando')) {
    const v = vehicles.find((x) => !usedV.has(x.id) && x.suits.includes('special') && !x.suits.includes('patrol'));
    if (v) usedV.add(v.id);
    add('special', special.splice(0), v?.model ?? 'Mercedes-Benz Sprinter', true);
  }
  const heli = take('heli');
  if (heli.length && owns('heli_hours')) add('heli', heli.splice(0), 'AgustaWestland AW139', true);

  // Form crews.
  const patrol = take('patrol');
  const rapid = take('rapid');
  const aux = take('aux');
  if (rapid.length % 2 === 1 && patrol.length >= 1) rapid.push(patrol.pop()!); // odd rapid officer gets a patrol partner
  const crews: Record<string, StaffMember[][]> = {};
  const pairs = (list: StaffMember[]) => {
    const out: StaffMember[][] = [];
    while (list.length >= 2) out.push(list.splice(0, 2));
    return out;
  };
  crews.rapid = pairs(rapid);
  if (rapid.length) patrol.push(...rapid.splice(0));
  crews.patrol = pairs(patrol);
  if (patrol.length) {
    const partner = aux.shift();
    crews[partner ? 'aux' : 'patrol'] = [...(crews[partner ? 'aux' : 'patrol'] ?? []), partner ? [patrol.shift()!, partner] : [patrol.shift()!]];
  }
  crews.aux = [...(crews.aux ?? []), ...pairs(aux)];
  crews.criminal = take('criminal').splice(0).map((m) => [m]);
  crews.k9 = take('k9').splice(0).map((m) => [m]);
  crews.traffic = take('traffic').splice(0).map((m) => [m]);
  crews.community = take('community').splice(0).map((m) => [m]);
  crews.border = pairs(take('border'));
  crews.transport = pairs(take('transport'));
  crews.boat = pairs(take('boat'));
  const leftovers: StaffMember[] = [...aux, ...take('border'), ...take('transport'), ...take('boat')];

  // Hand out vehicles round-robin.
  for (let progress = true; progress; ) {
    progress = false;
    for (const type of ASSIGN_ORDER) {
      const list = crews[type];
      if (!list?.length) continue;
      let v: FleetVehicle | undefined;
      if (type === 'traffic') {
        const moto = vehicles.find((x) => !usedV.has(x.id) && x.suits.length === 1 && x.suits[0] === 'traffic');
        if (moto) {
          usedV.add(moto.id);
          add('traffic', list.shift()!, moto.model);
          progress = true;
          continue;
        }
      }
      v = pickVehicle(type);
      if (!v) continue;
      const crew = list.shift()!;
      // A traffic car takes two traffic officers when available.
      if (type === 'traffic' && list.length) crew.push(...list.shift()!);
      add(type === 'aux' || crew.some((m) => m.specialty === 'aux') ? 'aux' : type, crew, v.model);
      progress = true;
    }
  }
  for (const list of Object.values(crews)) for (const crew of list) leftovers.push(...crew);

  // Staff without a vehicle: third seat in patrol cars, or a partner for an investigator.
  for (const m of leftovers) {
    const host =
      (m.specialty === 'criminal' ? units.find((u) => u.type === 'criminal' && u._staff.length < 2) : undefined) ??
      units.find((u) => (u.type === 'patrol' || u.type === 'aux' || u.type === 'rapid') && u._staff.length < 3) ??
      units.find((u) => u.type !== 'heli' && u.type !== 'special' && u._staff.length < 2);
    if (host) host._staff.push(m);
  }
  return units.map(({ _staff, ...u }) => ({ ...u, crew: _staff.map(toOfficer) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Costs
// ─────────────────────────────────────────────────────────────────────────────

/** Monthly running costs (salaries + upkeep) for display. */
export function monthlyCosts(p: CareerProfile): { salaries: number; upkeep: number; total: number } {
  const salaries = p.staff.reduce((a, m) => a + m.salary, 0);
  const upkeep = p.fleet.reduce((a, v) => a + v.upkeep, 0) + p.upgrades.reduce((a, id) => a + (UPGRADES.find((u) => u.id === id)?.upkeep ?? 0), 0);
  return { salaries, upkeep, total: salaries + upkeep };
}

function pushLedger(p: CareerProfile, e: LedgerEntry): void {
  p.ledger.push(e);
  if (p.ledger.length > 600) p.ledger.splice(0, p.ledger.length - 600);
}

// ─────────────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────────────

export interface AchievementContext {
  /** The player logged in the 2024 way (empty user + password); the UI reads its own localStorage flag. */
  legacyLogin?: boolean;
}

/** Ids of achievements newly earned (not yet in p.achievements). */
export function checkAchievements(p: CareerProfile, r?: ShiftReport, ctx?: AchievementContext): string[] {
  const have = new Set(p.achievements);
  const ex: ReportExtras | undefined = (r as ShiftReportX | undefined)?.extras;
  const c = counters(p);
  const rank = rankOf(p.xp).index;
  const idaIncidents = p.history.filter((h) => h.regionId === 'ida').reduce((a, h) => a + h.incidents, 0);
  const conds: Record<string, boolean> = {
    first_shift: p.stats.shifts >= 1,
    perfect_night: r?.grade === 'S',
    grade_a_streak: c.aStreak >= 5,
    pursuit_master: p.stats.pursuitsCaught >= 5,
    people_reader: (ex?.maxReplyStreak ?? 0) >= 10,
    nostalgia_2024: !!ctx?.legacyLogin,
    legend_2025: !!ex?.legendQueried,
    lasnamae_legend: (ex?.resolvedByDistrict?.['Lasnamäe'] ?? 0) >= 8,
    island_guard: (ex?.islandResolved ?? 0) >= 5,
    border_watch: idaIncidents >= 50,
    zero_expired: !!r && r.stats.incidents >= 15 && r.stats.expired === 0,
    lightning: !!r && (ex?.p1Count ?? r.stats.responseTimes[1]?.length ?? 0) >= 3 && (r.avgResponse[1] ?? 99) < 7,
    call_center: !!r && r.stats.callsAnswered >= 10,
    prank_hunter: c.pranksCaught >= 3,
    safe_shift: !!r && r.stats.incidents >= 20 && r.stats.officerInjuries === 0,
    midsummer: !!ex?.dayTags.includes('jaanipaev'),
    new_year: !!ex?.dayTags.includes('newyear'),
    night_owl: c.nightShifts >= 10,
    first_payday: p.day > 30,
    team_15: p.staff.length >= 15,
    fleet_6: p.fleet.length >= 6,
    commissioner: rank >= 4,
    general: rank >= RANKS.length - 1,
    peoples_favourite: p.reputation >= 80,
    hundred_arrests: p.stats.arrests >= 100,
    centurion: p.stats.shifts >= 100,
    air_support: p.upgrades.includes('heli_hours'),
    deep_red: p.money < 0,
  };
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && conds[a.id]).map((a) => a.id);
}

/** Award achievements that do not need a shift report (e.g. the 2024 login easter egg). */
export function awardAchievements(p: CareerProfile, ctx?: AchievementContext): { profile: CareerProfile; earned: string[] } {
  const earned = checkAchievements(p, undefined, ctx);
  if (!earned.length) return { profile: p, earned };
  const out = clone(p);
  out.achievements.push(...earned);
  return { profile: out, earned };
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply a shift
// ─────────────────────────────────────────────────────────────────────────────

const GRADE_MORALE: Record<ShiftReport['grade'], number> = { S: 0.05, A: 0.03, B: 0.01, C: 0, D: -0.02, F: -0.04 };

/** Apply a finished shift: money, reputation, xp, injuries, day++, payday every 30 days. Returns a new profile. */
export function applyShiftReport(
  p0: CareerProfile,
  r: ShiftReport,
  ctx?: AchievementContext,
): { profile: CareerProfile; ledger: LedgerEntry[]; messages: Text[] } {
  const p = clone(p0) as CareerProfileX;
  const rng = new Rng((p.seed ^ Math.imul(p.day + 1, 0x9e3779b1)) >>> 0);
  const day = p.day;
  const ledger: LedgerEntry[] = [];
  const messages: Text[] = [];
  const ex = (r as ShiftReportX).extras;
  const add = (kind: LedgerEntry['kind'], amount: number, text: Text) => {
    const a = Math.round(amount);
    if (a === 0) return;
    const e: LedgerEntry = { day, kind, amount: a, text };
    ledger.push(e);
  };

  // ── Money ─────────────────────────────────────────────────────────────────
  const costs = monthlyCosts(p);
  add('budget', DAILY_BUDGET[r.regionId] ?? DAILY_BUDGET[p.regionId] ?? 1200, T('Prefektuuri päevaeelarve', 'Prefecture daily budget'));
  if (r.earnings.bonus > 0) add('bonus', r.earnings.bonus, T(`Tulemustasu (hinne ${r.grade}, ${r.score} p)`, `Performance bonus (grade ${r.grade}, ${r.score} pts)`));
  add('salary', -costs.salaries / 30, T('Palgad (1/30 kuupalgast)', 'Salaries (1/30 of monthly pay)'));
  add('upkeep', -costs.upkeep / 30, T('Sõidukite ja täienduste ülalpidamine', 'Vehicle and upgrade upkeep'));
  if (r.earnings.fuel > 0) add('fuel', -r.earnings.fuel, T(`Kütus (${r.kmDriven} km × 0,14 €)`, `Fuel (${r.kmDriven} km × €0.14)`));
  if (r.earnings.overtime > 0) add('overtime', -r.earnings.overtime, T('Ületunnitöö', 'Overtime'));
  if (r.earnings.fines > 0) add('fine', -r.earnings.fines, T('Trahvid ja hüvitised (aegunud väljakutsed, valed suunamised)', 'Fines and compensation (expired calls, wrong referrals)'));

  // ── Reputation, xp, rank ──────────────────────────────────────────────────
  const oldRank = rankOf(p.xp).index;
  p.reputation = clamp(Math.round(p.reputation + r.reputationDelta), 0, 100);
  p.xp += Math.max(0, Math.round(r.xp));
  const newRank = rankOf(p.xp).index;
  for (let i = oldRank + 1; i <= newRank; i++) {
    const rk = RANKS[i];
    messages.push(T(`Ülendus! Teie uus auaste on ${rk.name.et.toLowerCase()}.`, `Promotion! Your new rank is ${rk.name.en}.`));
    for (const u of rk.unlocks) messages.push(T(`Avanes: ${u.et}`, `Unlocked: ${u.en}`));
  }
  // Region unlocks by rank.
  const order = REGION_UNLOCK_ORDER.filter((id) => id !== p.regionId);
  EXTRA_REGION_RANKS.forEach((minRank, i) => {
    const id = order[i];
    if (id && newRank >= minRank && !p.unlockedRegions.includes(id)) {
      p.unlockedRegions.push(id);
      const nm = REGIONS[id]?.name;
      messages.push(T(`Uus prefektuur avatud: ${nm?.et ?? id}.`, `New prefecture unlocked: ${nm?.en ?? id}.`));
    }
  });

  // ── Staff: injuries, recovery, xp, morale ─────────────────────────────────
  const injured = new Set(r.injuredOfficers);
  const moraleDelta = GRADE_MORALE[r.grade] + (p.upgrades.includes('psychologist') ? 0.01 : 0) - 0.004;
  for (const m of p.staff) {
    const worked = r.officerXp[m.id] !== undefined;
    if (worked) {
      const gain = Math.max(0, Math.round(r.officerXp[m.id]));
      m.xp += gain;
      m.shifts += 1;
      m.skill = r2(Math.min(0.97, m.skill + gain / 15000));
      m.morale = r2(clamp(m.morale + moraleDelta, 0.15, 1));
      m.stress = r2(clamp(m.stress * 0.5 + (r.grade === 'D' || r.grade === 'F' ? 0.08 : 0.02), 0, 1));
    } else {
      m.morale = r2(clamp(m.morale + (0.7 - m.morale) * 0.1, 0.15, 1));
    }
    if (injured.has(m.id) && m.status !== 'injured') {
      const days = rng.int(2, 10);
      m.status = 'injured';
      m.statusUntil = day + days;
      messages.push(T(`${m.firstName} ${m.lastName} sai teenistuses vigastada ja on ${days} päeva töölt eemal.`, `${m.firstName} ${m.lastName} was injured on duty and is off work for ${days} days.`));
    } else if (m.status !== 'active' && m.statusUntil !== undefined && m.statusUntil <= day + 1) {
      m.status = 'active';
      delete m.statusUntil;
      messages.push(T(`${m.firstName} ${m.lastName} on tagasi teenistuses.`, `${m.firstName} ${m.lastName} is back on duty.`));
    }
    if (m.morale < 0.3 && worked) messages.push(T(`${m.firstName} ${m.lastName} moraal on madal. Kaalu psühholoogi või paremat palka.`, `${m.firstName} ${m.lastName}'s morale is low. Consider a psychologist or a raise.`));
  }

  // ── Fleet wear ────────────────────────────────────────────────────────────
  if (p.fleet.length && r.kmDriven > 0) {
    const perCar = r.kmDriven / p.fleet.length;
    for (const v of p.fleet) v.condition = r2(Math.max(0.1, v.condition - perCar * 0.00002));
  }

  // ── Counters, stats & history ─────────────────────────────────────────────
  const c = counters(p);
  if (ex?.night) c.nightShifts++;
  c.pranksCaught += ex?.pranksCaught ?? 0;
  c.aStreak = r.grade === 'S' || r.grade === 'A' ? c.aStreak + 1 : 0;
  p.counters = c;
  p.stats.shifts += 1;
  p.stats.incidents += r.stats.incidents;
  p.stats.arrests += r.stats.arrests;
  p.stats.pursuitsCaught += r.stats.pursuitsCaught;
  p.stats.bestScore = Math.max(p.stats.bestScore, r.score);

  // ── Payday every 30 days ──────────────────────────────────────────────────
  const shiftTotal = ledger.reduce((a, e) => a + e.amount, 0);
  p.history.push({ day, regionId: r.regionId, score: r.score, grade: r.grade, incidents: r.stats.incidents, earnings: shiftTotal, reputationDelta: r.reputationDelta });
  if (p.history.length > 400) p.history.splice(0, p.history.length - 400);
  if (day % 30 === 0) {
    const month = p.history.filter((h) => h.day > day - 30 && h.day <= day);
    // 2025 formula: ratingDelta > 200 → floor(ratingDelta / 20) × 100 €, otherwise 1 000 €.
    const ratingDelta = month.reduce((a, h) => a + (h.score - 50) * 2, 0);
    const topUp = Math.min(15000, ratingDelta > 200 ? Math.floor(ratingDelta / 20) * 100 : 1000);
    add('budget', topUp, T(`Kuu lisaeelarve Staatuse põhjal (${month.length} vahetust)`, `Monthly top-up based on Staatus (${month.length} shifts)`));
    const monthLedger = [...p.ledger.filter((e) => e.day > day - 30), ...ledger];
    const income = monthLedger.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
    const expense = monthLedger.filter((e) => e.amount < 0).reduce((a, e) => a + e.amount, 0);
    const avg = month.length ? Math.round(month.reduce((a, h) => a + h.score, 0) / month.length) : 0;
    messages.push(
      T(
        `Palgapäev! ${Math.ceil(day / 30)}. kuu kokkuvõte: tulud ${euro(income)}, kulud ${euro(-expense)}, keskmine hinne ${avg} punkti. Lisaeelarve ${euro(topUp)}.`,
        `Payday! Month ${Math.ceil(day / 30)} summary: income ${euro(income)}, expenses ${euro(-expense)}, average score ${avg}. Top-up ${euro(topUp)}.`,
      ),
    );
    p.recruits = generateCandidates(rng, rng.int(8, 10), p);
    messages.push(T('Värbamisnimekiri on uuendatud. Uued kandidaadid ootavad.', 'The recruitment list has been refreshed. New candidates are waiting.'));
  }

  for (const e of ledger) pushLedger(p, e);
  p.money = Math.round(p.money + ledger.reduce((a, e) => a + e.amount, 0));
  p.day = day + 1;
  if (p.money < 0) messages.push(T('Eelarve on miinuses! Vähenda kulusid või paranda tulemusi.', 'The budget is in the red! Cut costs or improve your results.'));

  // ── Achievements ──────────────────────────────────────────────────────────
  const earned = checkAchievements(p, r, ctx);
  for (const id of earned) {
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    p.achievements.push(id);
    messages.push(T(`Saavutus: ${a.name.et}!`, `Achievement: ${a.name.en}!`));
  }

  return { profile: p, ledger, messages };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hiring, fleet, upgrades
// ─────────────────────────────────────────────────────────────────────────────

/** Up-front cost of hiring a candidate (first month's pay incl. uniform & gear). */
export function hireCost(c: Pick<Candidate, 'salary'>): number {
  return Math.round(c.salary * HIRE_COST_MONTHS);
}

export function hire(p: CareerProfile, candidateId: string): { profile: CareerProfile; error?: Text } {
  const c = p.recruits.find((x) => x.id === candidateId);
  if (!c) return { profile: p, error: T('Kandidaati ei leitud.', 'Candidate not found.') };
  if (p.staff.length >= MAX_STAFF) return { profile: p, error: T(`Koosseis on täis (${MAX_STAFF} ametnikku).`, `The roster is full (${MAX_STAFF} officers).`) };
  const cost = hireCost(c);
  if (p.money < cost) return { profile: p, error: T(`Eelarves pole piisavalt raha (vaja ${euro(cost)}).`, `Not enough money in the budget (${euro(cost)} needed).`) };
  const out = clone(p);
  const used = new Set(out.staff.map((m) => m.badge).concat(out.badge));
  const rng = new Rng((c.avatarSeed ^ out.seed) >>> 0);
  const m: StaffMember = {
    ...makeStaff(`staff-${c.id}`, { firstName: c.firstName, lastName: c.lastName, badge: uniqueBadge(rng, used), gender: c.gender, specialty: c.specialty, years: c.years, skill: c.skill, avatarSeed: c.avatarSeed }, out.day),
    salary: c.salary,
  };
  out.staff.push(m);
  out.recruits = out.recruits.filter((x) => x.id !== c.id);
  out.money -= cost;
  pushLedger(out, { day: out.day, kind: 'hire', amount: -cost, text: T(`Värbamine: ${c.firstName} ${c.lastName} (esimene kuupalk ja varustus)`, `Hired ${c.firstName} ${c.lastName} (first month's pay and gear)`) });
  return { profile: out };
}

export function fire(p: CareerProfile, staffId: string): CareerProfile {
  const m = p.staff.find((x) => x.id === staffId);
  if (!m) return p;
  const out = clone(p);
  out.staff = out.staff.filter((x) => x.id !== staffId);
  for (const s of out.staff) s.morale = r2(clamp(s.morale - 0.02, 0.15, 1));
  const severance = Math.round(m.salary * SEVERANCE_MONTHS);
  out.money -= severance;
  pushLedger(out, { day: out.day, kind: 'salary', amount: -severance, text: T(`Lõpparve: ${m.firstName} ${m.lastName}`, `Final settlement: ${m.firstName} ${m.lastName}`) });
  return out;
}

export function buyVehicle(p: CareerProfile, catalogId: string): { profile: CareerProfile; error?: Text } {
  const c = VEHICLE_CATALOG.find((v) => v.id === catalogId);
  if (!c) return { profile: p, error: T('Sellist sõidukit kataloogis ei ole.', 'No such vehicle in the catalogue.') };
  const rank = rankOf(p.xp).index;
  if (rank < c.minRank) {
    const need = RANKS[c.minRank]?.name;
    return { profile: p, error: T(`Vajalik auaste: ${need?.et.toLowerCase() ?? c.minRank}.`, `Rank required: ${need?.en ?? c.minRank}.`) };
  }
  if (p.money < c.price) return { profile: p, error: T(`Eelarves pole piisavalt raha (vaja ${euro(c.price)}).`, `Not enough money in the budget (${euro(c.price)} needed).`) };
  const out = clone(p);
  const rng = new Rng(hashString(`${out.seed}:${out.day}:${out.fleet.length}:${catalogId}`));
  const plates = new Set(out.fleet.map((v) => v.plate));
  let plate = makePlate(rng, c.suits.length === 1 && c.suits[0] === 'traffic' && /R 1250/.test(c.model) ? 'moto' : 'car');
  for (let i = 0; i < 20 && plates.has(plate); i++) plate = makePlate(rng);
  let n = out.fleet.length + 1;
  while (out.fleet.some((v) => v.id === `veh-${n}`)) n++;
  out.fleet.push(fleetVehicle(`veh-${n}`, c.id, plate, out.day));
  out.money -= c.price;
  pushLedger(out, { day: out.day, kind: 'vehicle', amount: -c.price, text: T(`Ost: ${c.model} (${plate})`, `Purchase: ${c.model} (${plate})`) });
  return { profile: out };
}

/** Resale value: 60 % of the purchase price × condition. */
export function resaleValue(v: Pick<FleetVehicle, 'price' | 'condition'>): number {
  return Math.round(v.price * RESALE_FACTOR * clamp(v.condition, 0, 1));
}

export function sellVehicle(p: CareerProfile, vehicleId: string): CareerProfile {
  const v = p.fleet.find((x) => x.id === vehicleId);
  if (!v) return p;
  const out = clone(p);
  const value = resaleValue(v);
  out.fleet = out.fleet.filter((x) => x.id !== vehicleId);
  out.money += value;
  pushLedger(out, { day: out.day, kind: 'vehicle', amount: value, text: T(`Müük: ${v.model} (${v.plate})`, `Sale: ${v.model} (${v.plate})`) });
  return out;
}

export function buyUpgrade(p: CareerProfile, upgradeId: string): { profile: CareerProfile; error?: Text } {
  const u = UPGRADES.find((x) => x.id === upgradeId);
  if (!u) return { profile: p, error: T('Tundmatu täiendus.', 'Unknown upgrade.') };
  if (p.upgrades.includes(u.id)) return { profile: p, error: T('See täiendus on juba olemas.', 'You already own this upgrade.') };
  const rank = rankOf(p.xp).index;
  if (rank < u.minRank) {
    const need = RANKS[u.minRank]?.name;
    return { profile: p, error: T(`Vajalik auaste: ${need?.et.toLowerCase() ?? u.minRank}.`, `Rank required: ${need?.en ?? u.minRank}.`) };
  }
  if (p.money < u.price) return { profile: p, error: T(`Eelarves pole piisavalt raha (vaja ${euro(u.price)}).`, `Not enough money in the budget (${euro(u.price)} needed).`) };
  const out = clone(p);
  out.upgrades.push(u.id);
  out.money -= u.price;
  pushLedger(out, { day: out.day, kind: 'upgrade', amount: -u.price, text: T(`Täiendus: ${u.name.et}`, `Upgrade: ${u.name.en}`) });
  return { profile: out };
}
