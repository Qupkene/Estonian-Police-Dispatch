/**
 * Engine entry points (engine-core): createShift, step, drainEvents, finalizeShift.
 * See DESIGN §4. The SimState is mutated in place and stays JSON-serialisable.
 */
import { ageOf, describePerson, describeVehicle } from '@/gen/describe';
import { generatePerson, refreshResident, RESIDENT_EPOCH } from '@/gen/person';
import { generateVehicle } from '@/gen/vehicle';
import { dayInfo } from './calendar';
import { updateCalls } from './calls';
import { expandCustom } from './custom';
import { initColleagues, updateColleagues } from './colleagues';
import { updateDesks } from './desks';
import { settleFallout, updateFallout } from './fallout';
import { emit, regionOf } from './internal';
import { isHidden, openIncidentIds, updateIncidents } from './incidents';
import { jkPhrase } from './radio';
import { buildReport, earlyEndFactor } from './report';
import { fmtDate } from './registry';
import { hashString, Rng } from './rng';
import { updateShiftScore } from './scoring';
import { neighbourSectors, normalizeArea, sectorById } from './sectors';
import { FIXED_FOLLOW_UP_SEQ, initCareerLoad, skippedZones, updateSpawner } from './spawner';
import { ddmmyyyy, hhmm, isoDate, MIN, seasonOf, wall, DAY } from './time';
import { buildUnits, updateUnits } from './units';
import { initialWeather, updateWeather } from './weather';
import type {
  Bulletin,
  GameEvent,
  NewShiftOptions,
  Person,
  PersonSpec,
  Priority,
  RegionDef,
  ShiftReport,
  ShiftStats,
  SimState,
  Text,
  Vehicle,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });

/** Engine sub-step length (game ms). */
export const SUBSTEP_MS = 5_000;
/** Overtime after the shift end while P1/P2 events are still open. */
export const OVERTIME_MS = 60 * MIN;

export function emptyStats(): ShiftStats {
  return {
    incidents: 0,
    closed: 0,
    byPriority: { 1: 0, 2: 0, 3: 0, 4: 0 },
    responseTimes: { 1: [], 2: [], 3: [], 4: [] },
    arrests: 0,
    civilianInjuries: 0,
    officerInjuries: 0,
    escaped: 0,
    expired: 0,
    falseAlarms: 0,
    referralsCorrect: 0,
    referralsWrong: 0,
    queries: 0,
    repliesCorrect: 0,
    repliesWrong: 0,
    beatsMissed: 0,
    pursuits: 0,
    pursuitsCaught: 0,
    callsAnswered: 0,
    callsMissed: 0,
    score: 0,
  };
}

/** 'day' when the shift starts 06:00-17:59 local time, else 'night'. */
export function shiftKindOf(start: number): 'day' | 'night' {
  const h = wall(start).hour;
  return h >= 6 && h < 18 ? 'day' : 'night';
}

// ─────────────────────────────────────────────────────────────────────────────
// createShift
// ─────────────────────────────────────────────────────────────────────────────

export function createShift(opts: NewShiftOptions): SimState {
  const seed = opts.seed >>> 0;
  const s: SimState = {
    version: 2,
    seed,
    rng: (seed ^ 0x9e3779b9) >>> 0 || 1,
    mode: opts.mode,
    difficulty: opts.difficulty,
    regionId: opts.regionId,
    playerName: opts.playerName,
    startTime: opts.start,
    endTime: opts.start + Math.max(0.25, opts.hours) * 3_600_000,
    now: opts.start,
    ended: false,
    weather: { kind: 'clear', tempC: 5, windMs: 3, roadFactor: 1, text: T('Selge', 'Clear') },
    units: {},
    unitOrder: [],
    incidents: {},
    incidentOrder: [],
    persons: {},
    vehicles: {},
    radio: [],
    calls: [],
    bulletins: [],
    queries: [],
    events: [],
    seq: { incident: 0, radio: 0, person: 0, call: 0, bulletin: 0 },
    nextSpawnAt: opts.start,
    trust: 50,
    stats: emptyStats(),
    flags: {},
  };
  const region = regionOf(s);
  if (!region) throw new Error(`createShift: unknown region ${opts.regionId}`);
  // Sectors (docs/SECTORS.md): only a part of the prefecture is set on the state, the whole stays as before.
  const area = normalizeArea(opts.regionId, opts.sectors);
  if (area.length) s.sectors = area;
  // Fixed schedule: the spawner draws from its own stream; incidents raised from the field number apart.
  if (opts.fixedSchedule) {
    s.spawnRng = hashString(`epd-spawn:${seed}`) || 1;
    s.seq.incident = FIXED_FOLLOW_UP_SEQ;
  }
  // Independent sub-streams so content changes in one part don't reshuffle the others.
  const root = new Rng(s.rng);
  const rWeather = root.fork(1);
  const rUnits = root.fork(2);
  const rReg = root.fork(3);
  const rMisc = root.fork(4);
  s.rng = root.int(1, 0xffffffff);

  s.flags.shiftKind = shiftKindOf(opts.start);
  s.flags.autoSpawn = opts.mode !== 'director';
  s.flags.kmDriven = 0;
  for (const u of opts.upgrades ?? []) s.flags[`upg:${u}`] = true;
  // Spike strips are standard PPA kit; only career makes them an upgrade to buy.
  if (opts.mode !== 'career') s.flags['upg:spikes'] = true;
  if (opts.weather) s.flags['wx:locked'] = true;

  try {
    s.weather = initialWeather(rWeather, opts.start, opts.weather, opts.regionId);
  } catch (err) {
    console.warn('[EPD] initialWeather failed', err);
  }
  s.flags['wx:last'] = opts.start;

  if (opts.reputation !== undefined) s.trust = Math.round(Math.max(15, Math.min(90, 50 + (opts.reputation - 25) / 2)));

  // Custom game: the drafted force is the roster (src/sim/custom.ts).
  if (opts.custom) {
    s.flags.custom = true;
    opts = { ...opts, roster: expandCustom(opts.regionId, opts.custom, s.flags.shiftKind as 'day' | 'night') };
  }
  buildUnits(s, rUnits, opts);
  // Career: call volume follows the force on duty (no rng use, so the other streams stay put).
  if (opts.mode === 'career') initCareerLoad(s);
  // Sector shift: the neighbouring desks' AI colleagues and a career night's cover (their own stream).
  initColleagues(s, opts);
  populateRegistry(s, rReg, region);
  addLegends(s);
  addBulletins(s, rMisc, region);
  addCoverageBulletin(s, region);
  addAreaBulletin(s);

  s.nextSpawnAt = opts.start + rMisc.range(1, 3) * MIN;

  jkPhrase(s, 'shiftStart', { kind: 'info', vars: { n: String(s.unitOrder.length) } });
  s.events = [];
  return s;
}

// ── Registry background population (DESIGN §4.10) ───────────────────────────

const BACKGROUND_SPEC: PersonSpec = {
  role: 'witness',
  wanted: 0.03,
  record: 0.2,
  weapon: 0.05,
  noLicense: 0.06,
  probation: 0.03,
  restraining: 0.015,
};

/** Residents carry no warrant, order or probation of their own; refreshResident draws those per shift. */
const RESIDENT_SPEC: PersonSpec = { ...BACKGROUND_SPEC, wanted: 0, restraining: 0, probation: 0 };

/**
 * The prefecture's residents (2.33.0): the same 150 people and 60 cars in every shift, drawn from the region's own
 * stream as of RESIDENT_EPOCH (names, codes, homes, looks, records, plates). The shift's stream decides what
 * changes: warrants, orders and probation at the background rates, and which cars are stolen.
 */
function populateRegistry(s: SimState, r: Rng, region: RegionDef): void {
  const home = new Rng(hashString(`residents:${region.id}`) || 1);
  const people: Person[] = [];
  for (let i = 0; i < 150; i++) {
    try {
      // No explicit lang/age: gen/person applies the regional demographics.
      const p = generatePerson(home, { id: `p${++s.seq.person}`, now: RESIDENT_EPOCH, region, spec: RESIDENT_SPEC });
      refreshResident(r, p, { now: s.now, region, spec: BACKGROUND_SPEC });
      s.persons[p.id] = p;
      people.push(p);
    } catch (err) {
      if (i === 0) console.warn('[EPD] generatePerson failed', err);
      break;
    }
  }
  if (!people.length) return;
  for (let i = 0; i < 60; i++) {
    const owner = home.pick(people);
    try {
      const v = generateVehicle(home, {
        now: s.now,
        owner,
        region: s.regionId,
        isTaken: (pl) => !!s.vehicles[pl],
        spec: { role: 'involved', stolen: 0, noInsurance: 0.05, noInspection: 0.07, suspended: 0.015 },
      });
      if (s.vehicles[v.plate]) continue;
      if (!v.ownerCompany) v.ownerId = owner.id;
      if (v.ownerId === owner.id && !owner.vehicles.includes(v.plate)) owner.vehicles.push(v.plate);
      if (r.chance(0.04)) v.flags.stolen = { since: isoDate(s.now - r.int(1, 20) * DAY), text: T('Varastatud omaniku elukoha juurest', 'Stolen from outside the owner’s home') };
      s.vehicles[v.plate] = v;
    } catch (err) {
      if (i === 0) console.warn('[EPD] generateVehicle failed', err);
      break;
    }
  }
}

// ── The two legends from the 2025 version ───────────────────────────────────

/** The two wanted men of the 2025 version, ordinary registry entries like anyone else. */
function legendPerson(base: Omit<Person, 'notes' | 'vehicles' | 'flags'> & { flags: Person['flags'] }): Person {
  return { ...base, vehicles: [], notes: [] };
}

export function addLegends(s: SimState): void {
  const okimum = legendPerson({
    id: 'legend-okimum',
    idcode: '50403140273',
    firstName: 'Rainer',
    lastName: 'Okimum',
    gender: 'M',
    birthDate: '2004-03-14',
    citizenship: 'EST',
    lang: 'et',
    address: 'Tallinn',
    city: 'Tallinn',
    phone: '+372 5555 2025',
    occupation: T('CSS koodi kirjutaja', 'CSS code writer'),
    appearance: {
      heightCm: 181,
      build: 'slim',
      hair: 'short',
      hairColor: 'brown',
      eyes: 'blue',
      glasses: true,
      clothing: T('must kapuutsiga pusa, kõrvaklapid', 'black hoodie, headphones'),
    },
    license: { status: 'suspended', categories: ['B'] },
    records: [
      { date: '2024-11-02', lawId: 'ls_fleeing', kind: 'misdemeanour', punishment: T('„Kriminaalne mittepeatumine“: juhtimisõiguse peatamine', '“Criminal failure to stop”: licence suspended') },
      { date: '2025-02-14', lawId: 'kars_263', kind: 'crime', punishment: T('„Tule avamine relvast avalikus kohas“: 2 a vangistust', '“Opening fire in a public place”: 2 years in prison') },
      { date: '2025-06-23', lawId: 'kars_121', kind: 'crime', punishment: T('„Kehavigastuste tekitamine“: tingimisi vangistus', '“Causing bodily injuries”: suspended sentence') },
    ],
    flags: {
      wanted: {
        reason: T('Kriminaalne mittepeatumine, tule avamine avalikus kohas', 'Criminal failure to stop, opening fire in public'),
        since: '2025-01-01',
        dangerous: true,
        armed: true,
        authority: 'Harju Maakohus',
      },
    },
    avatarSeed: 2025_0001,
  });
  const sarmert = legendPerson({
    id: 'legend-sarmert',
    idcode: '38804014385',
    firstName: 'Magnus',
    lastName: 'Sarmert',
    gender: 'M',
    birthDate: '1988-04-01',
    citizenship: 'EST',
    lang: 'et',
    address: 'Tallinn',
    city: 'Tallinn',
    phone: '+372 5438 0001',
    occupation: T('Hesburgeri klienditeenindaja', 'Hesburger customer service worker'),
    appearance: {
      heightCm: 176,
      build: 'average',
      hair: 'curly',
      hairColor: 'grey',
      eyes: 'green',
      beard: 'full',
      clothing: T('kiirtoidurestorani vormiriided, nimesilt', 'fast-food uniform with a name tag'),
    },
    license: { status: 'expired', categories: ['B'], validUntil: '1999-12-31' },
    records: [
      { date: '2023-05-05', lawId: 'kars_25_114', kind: 'crime', punishment: T('„Mõrvakatse“: 8 a vangistust', '“Attempted murder”: 8 years in prison') },
      { date: '2024-08-17', lawId: 'kars_118', kind: 'crime', punishment: T('„Toidumürgitamine“: 3 a vangistust', '“Food poisoning”: 3 years in prison') },
      { date: '2025-03-30', lawId: 'kars_200_2', kind: 'crime', punishment: T('„Relvastatud Hesburgerirööv“: tagaotsitav', '“Armed Hesburger robbery”: wanted') },
    ],
    flags: {
      wanted: {
        reason: T('Relvastatud Hesburgerirööv, mõrvakatse', 'Armed Hesburger robbery, attempted murder'),
        since: '2025-03-30',
        dangerous: true,
        armed: true,
        authority: 'Põhja Ringkonnaprokuratuur',
      },
    },
    avatarSeed: 2025_0438,
  });
  s.persons[okimum.id] = okimum;
  s.persons[sarmert.id] = sarmert;
}

// ── Bulletins: BOLO, päevakäsk, weather ─────────────────────────────────────

function pushBulletin(s: SimState, b: Omit<Bulletin, 'id' | 't'>): Bulletin {
  const out: Bulletin = { id: `b${++s.seq.bulletin}`, t: s.now, ...b };
  s.bulletins.push(out);
  return out;
}

function descPerson(p: Person, now: number): Text {
  try {
    return describePerson(p, now);
  } catch {
    return T(p.gender === 'M' ? 'mees' : 'naine', p.gender === 'M' ? 'man' : 'woman');
  }
}

function descVehicle(v: Vehicle): Text {
  try {
    return describeVehicle(v);
  } catch {
    return T(`${v.make} ${v.model} (${v.plate})`, `${v.make} ${v.model} (${v.plate})`);
  }
}

const WANTED_REASONS: Text[] = [
  T('Kahtlustatav korduvas vargustes, kohus kuulutas tagaotsitavaks.', 'Suspected of repeated thefts, declared wanted by the court.'),
  T('Hoidub kõrvale vangistuse kandmisest.', 'Evading a prison sentence.'),
  T('Kahtlustatav kehalises väärkohtlemises, ei ilmunud menetlusse.', 'Suspected of assault, failed to appear in proceedings.'),
  T('Kahtlustatav kelmuses, varjab end.', 'Suspected of fraud, in hiding.'),
  T('Rikkus kriminaalhoolduse tingimusi.', 'Breached probation conditions.'),
];

/** Capitalised sentence with a closing full stop. */
function sentence(t: string): string {
  const x = t.trim();
  if (!x) return x;
  const c = x.charAt(0).toUpperCase() + x.slice(1);
  return /[.!?]$/.test(c) ? c : c + '.';
}

/** Career: tell the player which staffed zones their force does not cover (see initCareerLoad). */
function addCoverageBulletin(s: SimState, region: RegionDef): void {
  const zones = [...skippedZones(s)].map((id) => region.zones.find((z) => z.id === id)?.name ?? T(id, id));
  if (!zones.length) return;
  pushBulletin(s, {
    kind: 'order',
    title: T('Vastutusala', 'Area of responsibility'),
    text: {
      et: `Meie ekipaažid ei kata sel vahetusel järgmisi piirkondi: ${zones.map((z) => z.et).join(', ')}. Sealsed väljakutsed võtab vastu teine dispetšer.`,
      en: `Our crews do not cover these areas this shift: ${zones.map((z) => z.en).join(', ')}. Calls from there go to another dispatcher.`,
    },
  });
}

/** Sector shift: the player's sectors and who runs the desks next door (docs/SECTORS.md). */
function addAreaBulletin(s: SimState): void {
  const mine = (s.sectors ?? []).map(sectorById).filter((x) => !!x);
  if (!mine.length) return;
  // Night cover (öine katmine): the colleague of that sector is off tonight, its calls come to the player.
  const cover = (s.coverSectors ?? []).map(sectorById).filter((x) => !!x);
  const next = neighbourSectors([...(s.sectors ?? []), ...cover.map((x) => x.id)]).filter((x) => x.regionId === s.regionId);
  const desk = (lang: 'et' | 'en') => next.map((x) => `${x.name[lang]} (${x.colleague.firstName} ${x.colleague.lastName})`).join(', ');
  const night = (lang: 'et' | 'en') =>
    cover.map((x) => (lang === 'et' ? `${x.name.et} (${x.colleague.firstName} ${x.colleague.lastName} on täna öösel vaba)` : `${x.name.en} (${x.colleague.firstName} ${x.colleague.lastName} is off tonight)`)).join(', ');
  pushBulletin(s, {
    kind: 'order',
    title: T('Vastutusala', 'Area of responsibility'),
    text: {
      et: `Sel vahetusel vastutate: ${mine.map((x) => x.name.et).join(', ')}.${cover.length ? ` Öine katmine: ${night('et')}. Sealsed väljakutsed tulevad teile, oma ekipaaži seal ei ole.` : ''}${next.length ? ` Naaberlaudades: ${desk('et')}. Ülejäänud prefektuuri väljakutsed lähevad neile.` : ''}`,
      en: `This shift you cover: ${mine.map((x) => x.name.en).join(', ')}.${cover.length ? ` Night cover: ${night('en')}. Its calls come to you; no crew of yours is based there.` : ''}${next.length ? ` At the neighbouring desks: ${desk('en')}. Calls from the rest of the prefecture go to them.` : ''}`,
    },
  });
}

function boloPerson(p: Person, now: number): Omit<Bulletin, 'id' | 't'> {
  const d = descPerson(p, now);
  const reason = p.flags.wanted!.reason;
  let age = 0;
  try {
    age = ageOf(p, now);
  } catch {
    age = 30;
  }
  return {
    kind: 'bolo_person',
    title: T(`Tagaotsitav: ${p.firstName} ${p.lastName}`, `Wanted: ${p.firstName} ${p.lastName}`),
    text: {
      et: `${p.firstName} ${p.lastName} (${age}), isikukood ${p.idcode}. ${sentence(d.et)} ${sentence(reason.et)}${p.flags.wanted!.dangerous ? ' Võib olla ohtlik!' : ''}`,
      en: `${p.firstName} ${p.lastName} (${age}), ID code ${p.idcode}. ${sentence(d.en)} ${sentence(reason.en)}${p.flags.wanted!.dangerous ? ' May be dangerous!' : ''}`,
    },
    personId: p.id,
  };
}

function addBulletins(s: SimState, r: Rng, region: RegionDef): void {
  const now = s.now;
  const persons = Object.values(s.persons).filter((p) => !p.id.startsWith('legend-'));
  const vehicles = Object.values(s.vehicles);
  // BOLO vehicles (stolen).
  const nVeh = vehicles.length ? r.int(1, 2) : 0;
  let stolen = vehicles.filter((v) => v.flags.stolen);
  while (stolen.length < nVeh && vehicles.length) {
    const v = r.pick(vehicles);
    if (!v.flags.stolen) {
      v.flags.stolen = { since: isoDate(now - r.int(1, 12) * DAY), text: T('Varastatud omaniku elukoha juurest', 'Stolen from outside the owner’s home') };
      stolen = vehicles.filter((x) => x.flags.stolen);
    }
  }
  for (const v of r.shuffle([...stolen]).slice(0, nVeh)) {
    const car = descVehicle(v);
    pushBulletin(s, {
      kind: 'bolo_vehicle',
      title: T(`Otsitav sõiduk: ${v.plate}`, `Vehicle BOLO: ${v.plate}`),
      text: {
        et: `Varastatud ${car.et}. Varguse aeg ${fmtDate(v.flags.stolen?.since ?? '')}. Märkamisel teavitada juhtimiskeskust, mitte sekkuda üksi. ANPR hoiatus aktiivne.`,
        en: `Stolen ${car.en}. Stolen on ${fmtDate(v.flags.stolen?.since ?? '')}. If seen, notify control, do not intervene alone. ANPR alert active.`,
      },
      plate: v.plate,
    });
  }
  // BOLO persons (wanted).
  const nPer = persons.length ? r.int(1, 2) : 0;
  let wanted = persons.filter((p) => p.flags.wanted);
  while (wanted.length < nPer && persons.length) {
    const p = r.pick(persons);
    if (!p.flags.wanted) {
      p.flags.wanted = {
        reason: r.pick(WANTED_REASONS),
        since: isoDate(now - r.int(5, 200) * DAY),
        dangerous: r.chance(0.2),
        authority: r.pick(['Harju Maakohus', 'Tartu Maakohus', 'Viru Maakohus', 'Pärnu Maakohus']),
      };
      wanted = persons.filter((x) => x.flags.wanted);
    }
  }
  for (const p of r.shuffle([...wanted]).slice(0, nPer)) pushBulletin(s, boloPerson(p, now));
  // Now and then the bulletin also carries one of the two wanted men from the 2025 version.
  if (r.chance(0.15) && s.persons['legend-okimum']) pushBulletin(s, boloPerson(s.persons['legend-okimum'], now));

  // Päevakäsk from the prefecture commander.
  const w = wall(now);
  const night = s.flags.shiftKind === 'night';
  const season = seasonOf(w.month);
  const focus: Text[] = [];
  if (night) focus.push(T('joobes juhid ja öörahu rikkumised', 'drunk drivers and night-quiet violations'));
  else focus.push(T('liiklusjärelevalve koolide ja lasteaedade juures', 'traffic enforcement near schools and kindergartens'));
  if (w.weekday >= 4) focus.push(T('meelelahutusasutuste ümbrus ja lähisuhtevägivald', 'nightlife areas and domestic violence'));
  if (season === 'winter') focus.push(T('libedus ja liiklusõnnetused', 'icy roads and traffic accidents'));
  else if (season === 'summer') focus.push(T('veekogud, rannad ja suvilapiirkonnad', 'lakes, beaches and summer-house areas'));
  else if (season === 'autumn') focus.push(T('pimeda ajal jalakäijate nähtavus', 'pedestrian visibility after dark'));
  else focus.push(T('kevadised kulupõlengud ja mootorrattad', 'spring grass fires and motorcycles'));
  let holiday: Text | undefined;
  try {
    holiday = dayInfo(now).holiday;
  } catch {
    holiday = undefined;
  }
  if (holiday) focus.push(T(`${holiday.et}: eeldada tavapärasest suuremat koormust`, `${holiday.en}: expect a heavier load than usual`));
  const cmd = region.commander;
  const sig = cmd ? T(`${cmd.title.et} ${cmd.name}`, `${cmd.title.en} ${cmd.name}`) : T(`${region.name.et}, prefekt`, `${region.name.en}, prefect`);
  pushBulletin(s, {
    kind: 'order',
    title: T(`Päevakäsk ${ddmmyyyy(now)}`, `Orders of the day ${ddmmyyyy(now)}`),
    text: {
      et: `${region.name.et}. Vahetus algab kell ${hhmm(now)}, teenistuses ${s.unitOrder.length} üksust. Vahetuse operatiivinfo haldur: ${s.playerName}. Erilist tähelepanu: ${focus.map((f) => f.et).join('; ')}. Kõik ekipaažid kannavad kehakaameraid, ohutus ennekõike. Allkiri: ${sig.et}`,
      en: `${region.name.en}. Shift starts at ${hhmm(now)}, ${s.unitOrder.length} units on duty. Dispatcher on shift: ${s.playerName}. Special attention: ${focus.map((f) => f.en).join('; ')}. All crews wear body cameras, safety first. Signed: ${sig.en}`,
    },
  });
  // Weather.
  const wx = s.weather;
  const icy = wx.roadFactor >= 1.2;
  const temp = (t: string, lang: 'et' | 'en') =>
    /°C/.test(t) ? '' : lang === 'et' ? ` Õhutemperatuur ${String(Math.round(wx.tempC)).replace('-', '−')} °C.` : ` Air temperature ${Math.round(wx.tempC)} °C.`;
  pushBulletin(s, {
    kind: 'weather',
    title: T('Ilm ja teeolud', 'Weather and road conditions'),
    text: {
      et: `${sentence(wx.text.et)}${temp(wx.text.et, 'et')} Tuul ${Math.round(wx.windMs)} m/s.${icy ? ' Teed on libedad. Arvestage pikema sõiduajaga.' : ''}`,
      en: `${sentence(wx.text.en)}${temp(wx.text.en, 'en')} Wind ${Math.round(wx.windMs)} m/s.${icy ? ' Roads are slippery. Expect longer travel times.' : ''}`,
    },
  });
  if (holiday) {
    pushBulletin(s, {
      kind: 'event',
      title: holiday,
      text: T('Pühade ajal on oodata rohkem väljakutseid, eriti õhtul ja öösel.', 'Expect more call-outs over the holiday, especially in the evening and at night.'),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// step
// ─────────────────────────────────────────────────────────────────────────────

export function step(s: SimState, dtGameMs: number): void {
  if (s.ended || !(dtGameMs > 0)) return;
  let left = dtGameMs;
  while (left > 0 && !s.ended) {
    const h = Math.min(SUBSTEP_MS, left);
    left -= h;
    s.now += h;
    substep(s, h);
  }
}

function substep(s: SimState, h: number): void {
  // A fixed schedule's weather is part of the schedule (it moves the call rate and the template mix): the
  // spawner runs it on the spawn stream, at its own times.
  if (s.spawnRng === undefined) {
    try {
      updateWeather(s);
    } catch (err) {
      console.warn('[EPD] updateWeather failed', err);
    }
  }
  updateSpawner(s);
  updateUnits(s, h);
  updateIncidents(s, h);
  updateFallout(s);
  try {
    updateColleagues(s);
  } catch (err) {
    console.warn('[EPD] updateColleagues failed', err);
  }
  // Sector co-op only (src/sim/desks.ts): each desk's incidents, the colleagues of desks nobody holds, help, hand-overs.
  if (s.coop?.sec) {
    try {
      updateDesks(s);
    } catch (err) {
      console.warn('[EPD] updateDesks failed', err);
    }
  }
  try {
    updateCalls(s);
  } catch (err) {
    console.warn('[EPD] updateCalls failed', err);
  }
  checkShiftEnd(s);
}

function checkShiftEnd(s: SimState): void {
  if (s.now < s.endTime || s.mode === 'director') return;
  if (!s.flags.endAnnounced) {
    s.flags.endAnnounced = true;
    jkPhrase(s, 'shiftEnd', { kind: 'info' });
  }
  const urgent = openIncidentIds(s).some((id) => {
    const inc = s.incidents[id];
    return !!inc && inc.state !== 'closed' && !isHidden(s, inc) && Math.min(inc.priority, inc.truePriority) <= 2;
  });
  if (!urgent || s.now >= s.endTime + OVERTIME_MS) {
    s.ended = true;
    updateShiftScore(s);
    emit(s, { type: 'shift_end', text: T('Vahetus lõppenud', 'Shift over') });
  }
}

export function drainEvents(s: SimState): GameEvent[] {
  const out = s.events;
  s.events = [];
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// finalizeShift
// ─────────────────────────────────────────────────────────────────────────────

export function finalizeShift(s: SimState): ShiftReport {
  settleFallout(s);
  updateShiftScore(s);
  try {
    return buildReport(s);
  } catch (err) {
    console.warn('[EPD] buildReport failed, using a minimal report', err);
    return minimalReport(s);
  }
}

function gradeOf(score: number): ShiftReport['grade'] {
  return score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
}

function minimalReport(s: SimState): ShiftReport {
  const avg: Partial<Record<Priority, number>> = {};
  for (const p of [1, 2, 3, 4] as Priority[]) {
    const xs = s.stats.responseTimes[p];
    if (xs.length) avg[p] = Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  }
  const score = Math.round(s.stats.score * earlyEndFactor(s).factor);
  return {
    ...(s.flags.custom ? { custom: true } : {}),
    regionId: s.regionId,
    mode: s.mode,
    difficulty: s.difficulty,
    start: s.startTime,
    end: s.now,
    playerName: s.playerName,
    stats: { ...s.stats, score },
    avgResponse: avg,
    score,
    grade: gradeOf(score),
    xp: Math.round(score * 2 + s.stats.closed * 5),
    reputationDelta: Math.round((score - 55) / 10),
    earnings: { bonus: 0, fuel: 0, overtime: 0, fines: 0, total: 0 },
    kmDriven: Number(s.flags.kmDriven) || 0,
    injuredOfficers: [],
    officerXp: {},
    highlights: [],
    newspaper: {
      masthead: 'EPD Teataja',
      date: ddmmyyyy(s.now),
      headline: T('Vahetus lõppes', 'Shift over'),
      sub: T(`${s.stats.closed} sündmust lahendatud`, `${s.stats.closed} events handled`),
      stories: [],
    },
  };
}
