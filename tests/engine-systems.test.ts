import { beforeAll, describe, expect, it } from 'vitest';
import { wireInternals } from '@/sim/internal';
import { sunAltitude, sunTimes } from '@/sim/sun';
import { dayInfo, easterSunday, hourCurve, publicHolidays, weekdayFactor } from '@/sim/calendar';
import { initialWeather, updateWeather } from '@/sim/weather';
import { correctReply, foldName, personFlags, searchPersons, searchVehicles, vehicleFlags } from '@/sim/registry';
import { gradeOf, buildReport, inessive, type ShiftReportX } from '@/sim/report';
import { callAnswer, callAsk, callEnd, callInterpreter, maybeCreateCall, updateCalls } from '@/sim/calls';
import { isOnLand, pursuitCommand, startPursuit, updatePursuit } from '@/sim/pursuit';
import { startSearch, updateSearch } from '@/sim/search';
import {
  applyShiftReport,
  buyUpgrade,
  buyVehicle,
  generateCandidates,
  hire,
  monthlyCosts,
  newCareer,
  rankOf,
  rosterFromCareer,
  sellVehicle,
} from '@/sim/career';
import { ACHIEVEMENTS, RANKS, UPGRADES, VEHICLE_CATALOG } from '@/data/economy';
import { Rng } from '@/sim/rng';
import { hhmm, tallinnTime } from '@/sim/time';
import type { IncidentTemplate, ShiftReport, SimState } from '@/sim/types';
import { addIncident, addUnit, advanceUnits, makeIncident, makePerson, makeState, makeUnit, makeVehicle, stubMoveUnitTo, T0 } from './fixtures-systems/state';

const published: string[] = [];
beforeAll(() => {
  wireInternals({
    publishIncident: (s, inc) => {
      delete s.flags[`hidden:${inc.id}`];
      published.push(inc.id);
    },
    moveUnitTo: stubMoveUnitTo(75),
  });
});

const TALLINN = { lat: 59.437, lon: 24.745 };
const minutesOfDay = (t: number) => {
  const [h, m] = hhmm(t).split(':').map(Number);
  return h * 60 + m;
};

// ─────────────────────────────────────────────────────────────────────────────

describe('sun', () => {
  it('Tallinn sunrise/sunset on 21 June within ±3 min', () => {
    const st = sunTimes(tallinnTime(2026, 6, 21, 12), TALLINN.lat, TALLINN.lon);
    expect(Math.abs(minutesOfDay(st.sunrise) - (4 * 60 + 2))).toBeLessThanOrEqual(3);
    expect(Math.abs(minutesOfDay(st.sunset) - (22 * 60 + 42))).toBeLessThanOrEqual(3);
  });
  it('Tallinn sunrise/sunset on 21 December within ±3 min', () => {
    const st = sunTimes(tallinnTime(2026, 12, 21, 12), TALLINN.lat, TALLINN.lon);
    expect(Math.abs(minutesOfDay(st.sunrise) - (9 * 60 + 17))).toBeLessThanOrEqual(3);
    expect(Math.abs(minutesOfDay(st.sunset) - (15 * 60 + 20))).toBeLessThanOrEqual(3);
  });
  it('altitude: high at summer noon, below horizon at winter midnight', () => {
    expect(sunAltitude(tallinnTime(2026, 6, 21, 13, 20), TALLINN.lat, TALLINN.lon)).toBeGreaterThan(50);
    expect(sunAltitude(tallinnTime(2026, 12, 21, 0, 0), TALLINN.lat, TALLINN.lon)).toBeLessThan(-40);
  });
});

describe('calendar', () => {
  it('computes Easter Sunday', () => {
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2025)).toEqual([4, 20]);
    expect(easterSunday(2027)).toEqual([3, 28]);
  });
  it('lists Estonian public holidays incl. movable ones', () => {
    const h = publicHolidays(2026);
    for (const d of ['2026-01-01', '2026-02-24', '2026-04-03', '2026-04-05', '2026-05-01', '2026-05-24', '2026-06-23', '2026-06-24', '2026-08-20', '2026-12-24', '2026-12-25', '2026-12-26']) {
      expect(h).toContain(d);
    }
    expect(h).toHaveLength(12);
  });
  it('special days carry factors and tags', () => {
    const nye = dayInfo(tallinnTime(2026, 12, 31, 23, 30));
    expect(nye.factor).toBeCloseTo(1.8);
    expect(nye.tags).toEqual(expect.arrayContaining(['fireworks', 'drunk']));
    const newYearMorning = dayInfo(tallinnTime(2027, 1, 1, 3));
    expect(newYearMorning.factor).toBeCloseTo(1.8);
    const jaan = dayInfo(tallinnTime(2026, 6, 24, 14));
    expect(jaan.factor).toBeGreaterThanOrEqual(1.6);
    expect(jaan.tags).toEqual(expect.arrayContaining(['bonfire', 'drowning', 'drunk_driving']));
    expect(jaan.holiday?.et).toBe('Jaanipäev');
    expect(dayInfo(tallinnTime(2026, 2, 24, 11)).tags).toContain('parade');
    expect(dayInfo(tallinnTime(2026, 3, 11, 11))).toEqual({ factor: 1, tags: [] });
    expect(dayInfo(tallinnTime(2025, 7, 5, 12)).tags).toContain('concert'); // song festival 2025
  });
  it('hour curve and weekday factor have the right shape', () => {
    expect(hourCurve(23)).toBeGreaterThan(1.5);
    expect(hourCurve(0)).toBeGreaterThan(1.5);
    expect(hourCurve(5)).toBeLessThan(0.5);
    const sat = weekdayFactor(tallinnTime(2026, 10, 17, 23)); // Saturday
    const wed = weekdayFactor(tallinnTime(2026, 10, 14, 23)); // Wednesday
    expect(sat).toBeGreaterThanOrEqual(1.35);
    expect(wed).toBe(1);
    expect(weekdayFactor(tallinnTime(2026, 10, 18, 2))).toBeGreaterThanOrEqual(1.35); // Sat night small hours
  });
});

describe('weather', () => {
  it('forced kinds get plausible temperatures and road factors', () => {
    const w = initialWeather(new Rng(3), tallinnTime(2026, 1, 15, 8), 'snow');
    expect(w.kind).toBe('snow');
    expect(w.tempC).toBeLessThanOrEqual(0.5);
    expect(w.roadFactor).toBeGreaterThanOrEqual(1.3);
    expect(w.text.et).toMatch(/Lumesadu, −?\d+ °C/);
    const r = initialWeather(new Rng(3), tallinnTime(2026, 7, 15, 14), 'rain');
    expect(r.roadFactor).toBeCloseTo(1.1);
  });
  it('hourly drift stays physically consistent', () => {
    const s = makeState({ now: tallinnTime(2026, 11, 20, 0) });
    s.weather = initialWeather(new Rng(9), s.now);
    for (let h = 0; h < 72; h++) {
      s.now += 3_600_000;
      updateWeather(s);
      expect(!(s.weather.kind === 'snow' && s.weather.tempC > 2.5)).toBe(true);
      expect(!(s.weather.kind === 'rain' && s.weather.tempC < -1.5)).toBe(true);
      expect(s.weather.roadFactor).toBeGreaterThanOrEqual(1);
    }
    expect(s.flags['wx:last']).toBe(s.now);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function registryState(): SimState {
  const s = makeState();
  s.persons = {
    p1: makePerson('p1', { firstName: 'Jüri', lastName: 'Õunapuu', idcode: '38506120236' }),
    p2: makePerson('p2', { firstName: 'Žanna', lastName: 'Šarapova', idcode: '48803030012', gender: 'F' }),
    p3: makePerson('p3', { firstName: 'Jürgen', lastName: 'Tamm', idcode: '39001010011' }),
    'legend-rainer': makePerson('legend-rainer', { firstName: 'Rainer', lastName: 'Okimum', idcode: '50304050011' }),
  };
  s.vehicles = {
    '123 ABC': makeVehicle('123 ABC', { vin: 'YV1RS61T832123456' }),
    '456 XYZ': makeVehicle('456 XYZ', { vin: 'WVWZZZ1KZ8W654321' }),
  };
  return s;
}

describe('registry search', () => {
  it('folds diacritics', () => {
    expect(foldName('Õunapuu Šarapova Žanna Jüri')).toBe('ounapuu sarapova zanna juri');
  });
  it('finds people case- and diacritic-insensitively, logs queries', () => {
    const s = registryState();
    expect(searchPersons(s, 'juri ounapuu').map((p) => p.id)).toEqual(['p1']);
    expect(searchPersons(s, 'ÕUNA').map((p) => p.id)).toEqual(['p1']);
    expect(searchPersons(s, 'sarapova')[0].id).toBe('p2');
    const jur = searchPersons(s, 'jür').map((p) => p.id);
    expect(jur).toContain('p1');
    expect(jur).toContain('p3');
    expect(searchPersons(s, '48803030012').map((p) => p.id)).toEqual(['p2']);
    expect(s.queries.length).toBe(5);
    expect(s.stats.queries).toBe(5);
    searchPersons(s, 'okimum');
    expect(s.flags.legendQueried).toBe(true);
  });
  it('finds vehicles by normalised plate, prefix and VIN suffix', () => {
    const s = registryState();
    expect(searchVehicles(s, '123abc').map((v) => v.plate)).toEqual(['123 ABC']);
    expect(searchVehicles(s, ' 123 a ').map((v) => v.plate)).toEqual(['123 ABC']);
    expect(searchVehicles(s, '654321').map((v) => v.plate)).toEqual(['456 XYZ']);
    expect(searchVehicles(s, 'YV1RS61T832123456').map((v) => v.plate)).toEqual(['123 ABC']);
    expect(searchVehicles(s, '12345')).toEqual([]);
  });
  it('produces ordered bilingual flags', () => {
    const p = makePerson('legend-x', {
      flags: { wanted: { reason: { et: 'Röövimine', en: 'Robbery' }, since: '2026-01-01', dangerous: true, authority: 'Harju Maakohus' } },
      weaponPermit: { kind: { et: 'jahirelv', en: 'hunting weapon' }, validUntil: '2030-01-01', weapons: ['vintpüss'] },
      records: [{ date: '2020-01-01', lawId: 'kars_121', kind: 'crime', punishment: { et: 'vangistus', en: 'prison' } }],
      license: { status: 'suspended', categories: ['B'] },
    });
    const ids = personFlags(p, T0).map((f) => f.id);
    expect(ids).toEqual(['legend', 'wanted', 'armed', 'license', 'weapon', 'records']);
    const v = makeVehicle('1 A', { flags: { stolen: { since: '2026-10-01', text: { et: 'Varastati hoovist', en: 'Stolen from a yard' } } }, insurance: { valid: false, until: '2025-01-01', insurer: 'X' } });
    expect(vehicleFlags(v, T0, makePerson('o', { flags: { wanted: { reason: { et: 'x', en: 'x' }, since: '2026-01-01', dangerous: false, authority: 'x' } } })).map((f) => f.id)).toEqual([
      'stolen',
      'ownerwanted',
      'noinsurance',
    ]);
  });
});

describe('correctReply ordering', () => {
  const wanted = { reason: { et: 'x', en: 'x' }, since: '2026-01-01', dangerous: false, authority: 'Harju Maakohus' };
  const permit = { kind: { et: 'jahirelv', en: 'hunting' }, validUntil: '2030-01-01', weapons: [] };
  it('person: wanted > restraining > nolicense(driver) > weapon > probation > clean', () => {
    const s = makeState();
    s.persons = {
      a: makePerson('a', { flags: { wanted, restrainingOrder: { protectedName: 'Mari', until: '2030-01-01' } }, weaponPermit: permit }),
      b: makePerson('b', { flags: { restrainingOrder: { protectedName: 'Mari', until: '2030-01-01' } }, weaponPermit: permit }),
      c: makePerson('c', { license: { status: 'revoked', categories: [] }, weaponPermit: permit }),
      d: makePerson('d', { flags: { probation: { until: '2030-01-01' } } }),
      e: makePerson('e'),
      f: makePerson('f', { flags: { restrainingOrder: { protectedName: 'Mari', until: '2020-01-01' } } }),
    };
    expect(correctReply(s, { personId: 'a' })).toBe('wanted');
    expect(correctReply(s, { personId: 'b' })).toBe('restraining');
    expect(correctReply(s, { personId: 'c' }, { role: 'driver' })).toBe('nolicense');
    expect(correctReply(s, { personId: 'c' }, { role: 'suspect' })).toBe('weapon');
    expect(correctReply(s, { personId: 'c' })).toBe('weapon');
    expect(correctReply(s, { personId: 'd' })).toBe('probation');
    expect(correctReply(s, { personId: 'e' })).toBe('clean');
    expect(correctReply(s, { personId: 'f' })).toBe('clean'); // expired order
    expect(correctReply(s, { personId: 'zzz' })).toBe('notfound');
    // Driver role found through the incident when no context is given.
    addIncident(s, makeIncident('i1', { category: 'traffic', persons: [{ personId: 'c', role: 'driver' }] }));
    expect(correctReply(s, { personId: 'c' })).toBe('nolicense');
  });
  it('vehicle: stolen > ownerwanted > suspended > noinsurance > noinspection > clean', () => {
    const s = makeState();
    s.persons = { o: makePerson('o', { flags: { wanted } }) };
    const bad = { valid: false, until: '2025-01-01', insurer: 'X' };
    s.vehicles = {
      '111 AAA': makeVehicle('111 AAA', { flags: { stolen: { since: '2026-01-01', text: { et: 'x', en: 'x' } }, suspended: true }, ownerId: 'o' }),
      '222 BBB': makeVehicle('222 BBB', { ownerId: 'o', flags: { suspended: true } }),
      '333 CCC': makeVehicle('333 CCC', { flags: { suspended: true }, insurance: bad }),
      '444 DDD': makeVehicle('444 DDD', { insurance: bad, inspection: { valid: false, until: '2025-01-01' } }),
      '555 EEE': makeVehicle('555 EEE', { inspection: { valid: false, until: '2025-01-01' } }),
      '666 FFF': makeVehicle('666 FFF'),
    };
    expect(correctReply(s, { plate: '111 AAA' })).toBe('stolen');
    expect(correctReply(s, { plate: '222BBB' })).toBe('ownerwanted');
    expect(correctReply(s, { plate: '333 CCC' })).toBe('suspended');
    expect(correctReply(s, { plate: '444 DDD' })).toBe('noinsurance');
    expect(correctReply(s, { plate: '555 EEE' })).toBe('noinspection');
    expect(correctReply(s, { plate: '666 FFF' })).toBe('clean');
    expect(correctReply(s, { plate: '999 ZZZ' })).toBe('notfound');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const TPL: IncidentTemplate = {
  id: 'test-template',
  category: 'domestic',
  code: 'LSV',
  title: { et: 'Lähisuhtevägivald', en: 'Domestic violence' },
  priority: 2,
  weight: 1,
  places: ['residential'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [20, 40],
  persons: [{ role: 'suspect' }],
  summary: [{ et: 'x', en: 'x' }],
  outcomes: [{ id: 'ok', weight: 1, result: 'resolved', text: { et: 'ok', en: 'ok' } }],
  interactiveChance: 1,
};

describe('112 calls', () => {
  it('rings, answers, reveals facts with delay, creates the event with classification', () => {
    const s = makeState();
    s.persons = { sus: makePerson('sus') };
    const inc = addIncident(s, makeIncident('i1', { persons: [{ personId: 'sus', role: 'suspect' }] }));
    const call = maybeCreateCall(s, inc, TPL)!;
    expect(call).not.toBeNull();
    expect(s.flags['hidden:i1']).toBe(true);
    expect(s.events.some((e) => e.type === 'call_ring')).toBe(true);
    expect(maybeCreateCall(s, addIncident(s, makeIncident('i2')), TPL)).toBeNull(); // one at a time
    callAnswer(s, call.id);
    expect(s.stats.callsAnswered).toBe(1);
    callAsk(s, call.id, 'where');
    if (!call.learned.includes('where')) callAsk(s, call.id, 'where'); // panicking callers may need a second ask
    const answer = call.lines[call.lines.length - 1];
    expect(answer.who).toBe('caller');
    expect(answer.t).toBeGreaterThan(s.now);
    expect(answer.text.et).toContain('Punane tn 16-45');
    expect(call.learned).toContain('where');
    callAsk(s, call.id, 'suspect');
    if (!call.learned.includes('suspect')) callAsk(s, call.id, 'suspect');
    expect(inc.details.some((d) => d.et.startsWith('Kirjeldus:'))).toBe(true);
    callEnd(s, call.id, { action: 'create', priority: 2 });
    expect(call.endedAt).toBe(s.now);
    expect(s.flags['hidden:i1']).toBeUndefined();
    expect(inc.tags).toContain('class:ok');
    expect(inc.tags).toContain('learned:where');
    expect(published).toContain('i1');
    s.now += 31_000;
    updateCalls(s);
    expect(s.calls.find((c) => c.id === call.id)).toBeUndefined();
  });
  it('unanswered call → Häirekeskus card after 45 s', () => {
    const s = makeState();
    const inc = addIncident(s, makeIncident('m1'));
    const call = maybeCreateCall(s, inc, TPL)!;
    s.now += 46_000;
    updateCalls(s);
    expect(call.endedAt).toBeDefined();
    expect(s.stats.callsMissed).toBe(1);
    expect(s.flags['hidden:m1']).toBeUndefined();
    expect(s.events.some((e) => e.type === 'call_missed')).toBe(true);
  });
  it('Russian caller: original until the interpreter translates', () => {
    const s = makeState();
    const inc = addIncident(s, makeIncident('r1', { caller: { name: 'Olga Ivanova', phone: '+372 5', lang: 'ru' } }));
    const call = maybeCreateCall(s, inc, TPL)!;
    expect(call.lang).toBe('ru');
    callAnswer(s, call.id);
    const opening = call.lines.find((l) => l.who === 'caller')!;
    expect(opening.ru).toMatch(/[А-Яа-яЁё]/);
    expect(opening.text.et).toBe(opening.ru);
    callInterpreter(s, call.id);
    expect(opening.text.et).not.toBe(opening.ru);
    const before = s.now;
    callAsk(s, call.id, 'injured');
    const ans = call.lines[call.lines.length - 1];
    expect(ans.t - before).toBeGreaterThanOrEqual(20_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function pursuitFixture(seed: number): { s: SimState; incId: string } {
  const s = makeState({ rng: seed });
  addUnit(s, makeUnit('u1', [24.8, 59.43], { status: 'onscene' }));
  addUnit(s, makeUnit('u2', [24.79, 59.425], { status: 'enroute' }));
  const inc = addIncident(s, makeIncident('p1', { category: 'traffic', state: 'onscene', assigned: ['u1', 'u2'], unitHistory: ['u1', 'u2'], location: { address: 'Laagna tee 50', coord: [24.8, 59.43], city: 'Tallinn', district: 'Lasnamäe', placeKind: 'street', zone: 'mainland' } }));
  return { s, incId: inc.id };
}

function runPursuit(seed: number): { ended: string; minutes: number; pressure: number; trail: number } {
  const { s, incId } = pursuitFixture(seed);
  const inc = s.incidents[incId];
  startPursuit(s, inc, inc.location.coord);
  let minutes = 0;
  for (let i = 0; i < 2000 && !inc.pursuit!.ended; i++) {
    s.now += 5000;
    advanceUnits(s);
    updatePursuit(s, inc, 5 / 60);
    minutes += 5 / 60;
  }
  return { ended: inc.pursuit!.ended ?? 'none', minutes: Math.round(minutes * 100) / 100, pressure: inc.pursuit!.pressure, trail: inc.pursuit!.trail.length };
}

describe('pursuit', () => {
  it('land polygon', () => {
    expect(isOnLand([24.75, 59.43])).toBe(true); // Tallinn
    expect(isOnLand([24.5, 59.7])).toBe(false); // Gulf of Finland
    expect(isOnLand([22.5, 58.3])).toBe(true); // Saaremaa
  });
  it('runs deterministically to an end', () => {
    const a = runPursuit(777);
    const b = runPursuit(777);
    expect(a).toEqual(b);
    expect(['caught', 'crashed', 'escaped']).toContain(a.ended);
    expect(a.minutes).toBeLessThanOrEqual(26);
    expect(a.trail).toBeLessThanOrEqual(60);
  });
  it('produces a mix of outcomes across seeds', () => {
    const ends = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) ends.add(runPursuit(seed * 7919).ended);
    expect(ends.size).toBeGreaterThanOrEqual(2);
  });
  it('terminate ends the pursuit with a trust penalty', () => {
    const { s, incId } = pursuitFixture(5);
    const inc = s.incidents[incId];
    startPursuit(s, inc, inc.location.coord);
    pursuitCommand(s, inc, 'terminate');
    expect(inc.pursuit!.ended).toBe('terminated');
    expect(inc.effects.trust).toBe(-1);
    expect(s.events.some((e) => e.type === 'pursuit_end')).toBe(true);
  });
  it('spikes need the upgrade', () => {
    const { s, incId } = pursuitFixture(6);
    const inc = s.incidents[incId];
    startPursuit(s, inc, inc.location.coord);
    pursuitCommand(s, inc, 'spikes');
    expect(inc.pursuit!.spikes).toBe(false);
  });
});

describe('search', () => {
  it('finds the target faster with a K9', () => {
    const run = (types: ('patrol' | 'k9')[]) => {
      const s = makeState({ rng: 99 });
      const ids = types.map((t, i) => addUnit(s, makeUnit(`s${i}`, [24.8, 59.43], { type: t, status: 'onscene' })).id);
      const inc = addIncident(s, makeIncident('srch', { category: 'missing', assigned: ids, location: { address: 'Pirita mets', coord: [24.8, 59.43], city: 'Tallinn', placeKind: 'forest', zone: 'mainland' } }));
      startSearch(s, inc, 1.5);
      let min = 0;
      while (!updateSearch(s, inc, 1) && min < 600) min++;
      return { min, found: inc.search!.found };
    };
    const patrol = run(['patrol', 'patrol']);
    const k9 = run(['patrol', 'k9']);
    expect(patrol.found).toBe(true);
    expect(k9.found).toBe(true);
    expect(k9.min).toBeLessThanOrEqual(patrol.min + 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function reportState(): SimState {
  const s = makeState({ now: T0 + 8 * 3_600_000 });
  s.persons = { sus: makePerson('sus') };
  const bd = { response: 25, resources: 15, decisions: 18, outcome: 16, safety: 10, classification: 5, total: 89 };
  addIncident(
    s,
    makeIncident('a', {
      state: 'closed',
      closedBy: 'units',
      truePriority: 1,
      priority: 1,
      firstArrivalAt: T0 + 6 * 60_000,
      persons: [{ personId: 'sus', role: 'suspect' }],
      outcome: { id: 'arr', result: 'arrest', text: { et: 'Mees peeti kinni.', en: 'The man was detained.' }, success: 0.85, arrests: 1, injuries: 0, officerInjured: false, score: 89, breakdown: bd },
    }),
  );
  addIncident(
    s,
    makeIncident('b', {
      state: 'closed',
      closedBy: 'expired',
      truePriority: 3,
      priority: 3,
      category: 'property',
      title: { et: 'Jalgratta vargus', en: 'Bicycle theft' },
      location: { address: 'Rüütli tn 5', coord: [26.72, 58.38], city: 'Tartu', placeKind: 'street', zone: 'mainland' },
      summary: { et: 'Tartu, Rüütli tn 5. Teataja jalgratas varastati.', en: 'Tartu, Rüütli tn 5. The caller’s bicycle was stolen.' },
      outcome: { id: 'expired', result: 'unfounded', text: { et: 'Aegus', en: 'Expired' }, success: 0, arrests: 0, injuries: 0, officerInjured: false, score: 0, breakdown: { ...bd, total: 0 } },
    }),
  );
  s.stats.incidents = 2;
  s.stats.closed = 2;
  s.stats.expired = 1;
  s.stats.arrests = 1;
  s.stats.responseTimes[1] = [6];
  s.flags['km:u1'] = 120;
  addUnit(s, makeUnit('u1', [24.8, 59.43], { handled: 1 }));
  s.incidents.a.unitHistory = ['u1'];
  return s;
}

describe('report', () => {
  it('grade boundaries', () => {
    expect(gradeOf(100)).toBe('S');
    expect(gradeOf(92)).toBe('S');
    expect(gradeOf(91.9)).toBe('A');
    expect(gradeOf(82)).toBe('A');
    expect(gradeOf(81)).toBe('B');
    expect(gradeOf(70)).toBe('B');
    expect(gradeOf(69)).toBe('C');
    expect(gradeOf(55)).toBe('C');
    expect(gradeOf(54)).toBe('D');
    expect(gradeOf(40)).toBe('D');
    expect(gradeOf(39)).toBe('F');
    expect(gradeOf(0)).toBe('F');
  });
  it('builds a full report with a bilingual newspaper', () => {
    const s = reportState();
    const r = buildReport(s) as ShiftReportX;
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.grade).toBe(gradeOf(r.score));
    expect(r.avgResponse[1]).toBe(6);
    expect(r.kmDriven).toBe(120);
    expect(r.earnings.fuel).toBe(Math.round(120 * 0.14));
    expect(r.earnings.total).toBe(r.earnings.bonus - r.earnings.fuel - r.earnings.overtime - r.earnings.fines);
    expect(r.reputationDelta).toBeGreaterThanOrEqual(-10);
    expect(r.reputationDelta).toBeLessThanOrEqual(10);
    expect(r.highlights.length).toBeGreaterThanOrEqual(2);
    const np = r.newspaper;
    expect(np.masthead).toBeTruthy();
    expect(np.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    for (const t of [np.headline, np.sub, ...np.stories.flatMap((x) => [x.title, x.body])]) {
      expect(t.et.length).toBeGreaterThan(3);
      expect(t.en.length).toBeGreaterThan(3);
    }
    expect(np.stories.length).toBeGreaterThanOrEqual(3);
    expect(np.stories.length).toBeLessThanOrEqual(4);
    expect(np.stories.some((x) => x.body.et.includes('teatati Häirekeskusele'))).toBe(true);
    expect(np.stories.some((x) => x.body.et.includes('Tallinnas Lasnamäel aadressil Punane tn 16-45'))).toBe(true);
    expect(r.officerXp['u1-o1']).toBeGreaterThan(0);
    expect(r.extras?.resolvedByDistrict['Lasnamäe']).toBe(1);
  });
  it('empty shift still produces a calm-night paper', () => {
    const s = makeState({ now: T0 + 4 * 3_600_000 });
    const r = buildReport(s);
    expect(r.newspaper.headline.et).toMatch(/Rahulik/);
    expect(r.newspaper.stories.length).toBeGreaterThanOrEqual(3);
  });
  it('inessive forms', () => {
    expect(inessive('Tallinn')).toBe('Tallinnas');
    expect(inessive('Lasnamäe')).toBe('Lasnamäel');
    expect(inessive('Kohtla-Järve')).toBe('Kohtla-Järvel');
    expect(inessive('Rakvere')).toBe('Rakveres');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function fakeReport(over: Partial<ShiftReport> = {}): ShiftReport {
  const s = reportState();
  return { ...buildReport(s), regionId: 'pohja', mode: 'career', ...over };
}

describe('economy data', () => {
  it('has enough content', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(13);
    expect(VEHICLE_CATALOG.length).toBeGreaterThanOrEqual(12);
    expect(RANKS.length).toBeGreaterThanOrEqual(10);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
    for (const id of ['bodycam', 'taser', 'mdt', 'anpr', 'drone', 'k9kennel', 'heli_hours', 'spikes', 'negotiation', 'psychologist', 'kkomando', 'interpreter_line', 'extra_station']) {
      expect(UPGRADES.find((u) => u.id === id)).toBeDefined();
    }
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].xp).toBeGreaterThan(RANKS[i - 1].xp);
    for (const v of VEHICLE_CATALOG) expect(v.minRank).toBeLessThan(RANKS.length);
  });
});

describe('career', () => {
  it('newCareer is valid (Põhja homage staff)', () => {
    const p = newCareer('Test', '777', 'pohja', 42);
    expect(p.money).toBe(10000);
    expect(p.reputation).toBe(25);
    expect(p.day).toBe(1);
    expect(p.staff).toHaveLength(8);
    expect(p.staff.find((m) => m.badge === '085')?.lastName).toBe('Rebane');
    expect(p.staff.filter((m) => m.specialty === 'patrol').length).toBeGreaterThanOrEqual(5);
    expect(p.fleet).toHaveLength(4);
    expect(p.recruits).toHaveLength(8);
    expect(p.unlockedRegions).toEqual(['pohja']);
    for (const m of p.staff) {
      expect(m.salary).toBeGreaterThanOrEqual(1700);
      expect(m.salary).toBeLessThanOrEqual(3400);
    }
    const ida = newCareer('Test', '777', 'ida', 42);
    expect(ida.staff).toHaveLength(8);
    expect(new Set(ida.staff.map((m) => m.badge)).size).toBe(8);
  });
  it('rosterFromCareer builds crews from staff and fleet', () => {
    const p = newCareer('Test', '777', 'pohja', 42);
    const roster = rosterFromCareer(p, 'night');
    expect(roster.length).toBeGreaterThanOrEqual(4);
    const officerIds = roster.flatMap((u) => u.crew.map((o) => o.id));
    expect(new Set(officerIds).size).toBe(officerIds.length);
    for (const u of roster) {
      expect(u.crew.length).toBeGreaterThan(0);
      if (u.type === 'patrol') expect(u.crew.length).toBeGreaterThanOrEqual(2);
      if (u.type === 'criminal') expect(u.crew.length).toBeLessThanOrEqual(2);
    }
    expect(officerIds).toHaveLength(8); // everyone seated with the starting fleet
    expect(roster.filter((u) => u.type === 'patrol').length).toBeGreaterThanOrEqual(2);
    expect(new Set(roster.map((u) => u.callsign)).size).toBe(roster.length);
    expect(roster.some((u) => u.type === 'k9')).toBe(false);
  });
  it('hire deducts money and adds staff; buy fails without money', () => {
    const p = newCareer('Test', '777', 'pohja', 42);
    const c = p.recruits[0];
    const r = hire(p, c.id);
    expect(r.error).toBeUndefined();
    expect(r.profile.staff).toHaveLength(9);
    expect(r.profile.money).toBe(p.money - c.salary);
    expect(r.profile.recruits.find((x) => x.id === c.id)).toBeUndefined();
    expect(p.staff).toHaveLength(8); // input untouched
    const broke = { ...p, money: 100 };
    expect(buyVehicle(broke, 'skoda_octavia_combi').error).toBeDefined();
    expect(buyUpgrade(broke, 'bodycam').error).toBeDefined();
    expect(buyVehicle(p, 'bmw_530d_touring').error?.et).toMatch(/auaste/);
    const bought = buyVehicle({ ...p, money: 50000 }, 'skoda_octavia_combi');
    expect(bought.error).toBeUndefined();
    expect(bought.profile.fleet).toHaveLength(5);
    const sold = sellVehicle(bought.profile, bought.profile.fleet[4].id);
    expect(sold.money).toBe(bought.profile.money + Math.round(38000 * 0.6));
    const upg = buyUpgrade(p, 'bodycam');
    expect(upg.profile.upgrades).toContain('bodycam');
    expect(buyUpgrade(upg.profile, 'bodycam').error).toBeDefined();
    expect(monthlyCosts(upg.profile).upkeep).toBe(monthlyCosts(p).upkeep + 150);
  });
  it('applyShiftReport is immutable and updates money, xp, history', () => {
    const p = newCareer('Test', '777', 'pohja', 42);
    const snapshot = JSON.stringify(p);
    const r = fakeReport();
    const out = applyShiftReport(p, r);
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(out.profile).not.toBe(p);
    expect(out.profile.day).toBe(2);
    expect(out.profile.xp).toBe(r.xp);
    expect(out.profile.history).toHaveLength(1);
    expect(out.profile.achievements).toContain('first_shift');
    const delta = out.ledger.reduce((a, e) => a + e.amount, 0);
    expect(out.profile.money).toBe(p.money + delta);
    expect(out.ledger.some((e) => e.kind === 'budget')).toBe(true);
    expect(out.ledger.some((e) => e.kind === 'salary')).toBe(true);
  });
  it('injuries keep officers out for 2-10 days', () => {
    const p = newCareer('Test', '777', 'pohja', 42);
    const id = p.staff[0].id;
    const out = applyShiftReport(p, fakeReport({ injuredOfficers: [id], officerXp: { [id]: 20 } }));
    const m = out.profile.staff.find((x) => x.id === id)!;
    expect(m.status).toBe('injured');
    expect(m.statusUntil! - p.day).toBeGreaterThanOrEqual(2);
    expect(m.statusUntil! - p.day).toBeLessThanOrEqual(10);
    expect(rosterFromCareer(out.profile, 'day').flatMap((u) => u.crew).some((o) => o.id === id)).toBe(false);
  });
  it('payday after 30 days refreshes recruits', () => {
    let p = newCareer('Test', '777', 'pohja', 42);
    const firstRecruits = p.recruits.map((c) => c.id).join();
    let payday = false;
    const r = fakeReport();
    for (let d = 0; d < 30; d++) {
      const out = applyShiftReport(p, r);
      if (out.messages.some((m) => m.et.startsWith('Palgapäev'))) payday = true;
      p = out.profile;
    }
    expect(payday).toBe(true);
    expect(p.day).toBe(31);
    expect(p.recruits.map((c) => c.id).join()).not.toBe(firstRecruits);
    expect(p.recruits.length).toBeGreaterThanOrEqual(8);
    expect(p.achievements).toContain('first_payday');
  });
  it('ranks and candidates', () => {
    expect(rankOf(0).index).toBe(0);
    expect(rankOf(RANKS[3].xp).index).toBe(3);
    expect(rankOf(10_000_000).next).toBeUndefined();
    const p = newCareer('Test', '777', 'louna', 1);
    const cands = generateCandidates(new Rng(5), 40, p);
    expect(cands).toHaveLength(40);
    for (const c of cands) {
      expect(c.salary).toBeGreaterThanOrEqual(1700);
      expect(c.salary).toBeLessThanOrEqual(3400);
      expect(c.bio.et.length).toBeGreaterThan(10);
      expect(c.bio.en.length).toBeGreaterThan(10);
    }
    // skill and salary correlate
    const hi = cands.filter((c) => c.skill > 0.6 && c.specialty === 'patrol');
    const lo = cands.filter((c) => c.skill < 0.45 && c.specialty === 'patrol');
    if (hi.length && lo.length) {
      const avg = (xs: typeof cands) => xs.reduce((a, c) => a + c.salary, 0) / xs.length;
      expect(avg(hi)).toBeGreaterThan(avg(lo));
    }
  });
});
