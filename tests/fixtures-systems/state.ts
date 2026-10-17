/**
 * Minimal hand-built SimState fixtures for engine-systems tests (independent of engine-core's
 * createShift so the systems can be tested in isolation).
 */
import { cumulative, along } from '@/sim/geo';
import type { Incident, LngLat, Person, SimState, Unit, Vehicle, Weather } from '@/sim/types';
import { tallinnTime } from '@/sim/time';

export const T0 = tallinnTime(2026, 10, 17, 22, 0);

export function makeState(over: Partial<SimState> = {}): SimState {
  const weather: Weather = { kind: 'clear', tempC: 6, windMs: 3, roadFactor: 1, text: { et: 'Selge, 6 °C', en: 'Clear, 6 °C' } };
  return {
    version: 2,
    seed: 1,
    rng: 12345,
    mode: 'free',
    difficulty: 'normal',
    regionId: 'pohja',
    playerName: 'Test',
    startTime: T0,
    endTime: T0 + 8 * 3_600_000,
    now: T0,
    ended: false,
    weather,
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
    nextSpawnAt: T0,
    trust: 60,
    stats: {
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
    },
    flags: {},
    ...over,
  };
}

export function makePerson(id: string, over: Partial<Person> = {}): Person {
  return {
    id,
    idcode: '38506120236',
    firstName: 'Jaan',
    lastName: 'Tamm',
    gender: 'M',
    birthDate: '1985-06-12',
    citizenship: 'EST',
    lang: 'et',
    address: 'Punane tn 16-45',
    city: 'Tallinn',
    phone: '+372 5123 4567',
    occupation: { et: 'ehitaja', en: 'builder' },
    appearance: {
      heightCm: 182,
      build: 'heavy',
      hair: 'short',
      hairColor: 'brown',
      eyes: 'blue',
      clothing: { et: 'must jope', en: 'a black jacket' },
    },
    license: { status: 'valid', categories: ['B'], validUntil: '2030-01-01' },
    records: [],
    flags: {},
    vehicles: [],
    notes: [],
    avatarSeed: 7,
    ...over,
  };
}

export function makeVehicle(plate: string, over: Partial<Vehicle> = {}): Vehicle {
  return {
    plate,
    vin: 'WVWZZZ1KZ8W123456',
    make: 'Toyota',
    model: 'Avensis',
    year: 2012,
    color: { et: 'hall', en: 'grey' },
    kind: 'car',
    insurance: { valid: true, until: '2027-05-01', insurer: 'Kindlustus AS' },
    inspection: { valid: true, until: '2027-05-01' },
    flags: {},
    notes: [],
    ...over,
  };
}

export function makeUnit(id: string, pos: LngLat, over: Partial<Unit> = {}): Unit {
  return {
    id,
    callsign: id.toUpperCase(),
    type: 'patrol',
    stationId: 'st1',
    zone: 'mainland',
    vehicle: 'Škoda Octavia Combi',
    crew: [
      { id: `${id}-o1`, badge: '101', firstName: 'Mart', lastName: 'Kask', gender: 'M', rank: { et: 'konstaabel', en: 'constable' }, title: { et: 'patrullpolitseinik', en: 'patrol officer' }, years: 4, skill: 0.6, stress: 0, avatarSeed: 1 },
      { id: `${id}-o2`, badge: '102', firstName: 'Kati', lastName: 'Mets', gender: 'F', rank: { et: 'konstaabel', en: 'constable' }, title: { et: 'patrullpolitseinik', en: 'patrol officer' }, years: 3, skill: 0.6, stress: 0, avatarSeed: 2 },
    ],
    status: 'available',
    statusSince: T0,
    pos,
    heading: 0,
    fatigue: 0,
    breaks: 0,
    handled: 0,
    ...over,
  };
}

export function makeIncident(id: string, over: Partial<Incident> = {}): Incident {
  return {
    id,
    number: `PÕ-261017-${id}`,
    templateId: 'test-template',
    category: 'domestic',
    code: 'LSV',
    title: { et: 'Lähisuhtevägivald', en: 'Domestic violence' },
    priority: 2,
    truePriority: 2,
    state: 'incoming',
    source: 'hk',
    createdAt: T0,
    location: { address: 'Punane tn 16-45', coord: [24.83, 59.435], city: 'Tallinn', district: 'Lasnamäe', placeKind: 'residential', zone: 'mainland' },
    summary: { et: 'Lasnamäe, Punane tn 16-45. Naabri teatel kostab korterist karjumist ja kolinat. Relvad teadmata.', en: 'Lasnamäe, Punane tn 16-45. A neighbour reports screaming and banging from the flat. Weapons unknown.' },
    details: [],
    hiddenDetails: [],
    caller: { name: 'Mari Kask', phone: '+372 5555 1234', lang: 'et' },
    persons: [],
    vehicles: [],
    assigned: [],
    unitHistory: [],
    need: [{ type: 'patrol', count: 1 }],
    ideal: [],
    onSceneMin: 20,
    workDone: 0,
    slaMin: 20,
    beats: [],
    agencyNeeds: [],
    effects: { success: 0, risk: 0, trust: 0, time: 0, arrests: 0 },
    timeline: [],
    tags: [],
    ...over,
  };
}

export function addUnit(s: SimState, u: Unit): Unit {
  s.units[u.id] = u;
  s.unitOrder.push(u.id);
  return u;
}

export function addIncident(s: SimState, inc: Incident): Incident {
  s.incidents[inc.id] = inc;
  s.incidentOrder.push(inc.id);
  return inc;
}

/** A tiny stand-in for engine-core movement: straight line at `kmh`. */
export function stubMoveUnitTo(kmh = 70) {
  return (s: SimState, u: Unit, to: LngLat, purpose: NonNullable<Unit['move']>['purpose'], siren: boolean) => {
    const path: LngLat[] = [u.pos, to];
    const cum = cumulative(path);
    const km = cum[cum.length - 1];
    u.move = { purpose, path, cum, departAt: s.now, arriveAt: s.now + Math.max(1000, (km / kmh) * 3_600_000), siren };
    if (u.status === 'available') u.status = 'enroute';
  };
}

/** Advance unit positions along their movements (what engine-core's step does). */
export function advanceUnits(s: SimState): void {
  for (const id of s.unitOrder) {
    const u = s.units[id];
    const m = u.move;
    if (!m) continue;
    const f = Math.min(1, (s.now - m.departAt) / Math.max(1, m.arriveAt - m.departAt));
    const total = m.cum[m.cum.length - 1];
    u.pos = along(m.path, m.cum, total * f).pos;
    if (f >= 1) u.move = undefined;
  }
}
