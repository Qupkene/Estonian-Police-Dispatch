import { describe, expect, it, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Incident, IncidentTemplate, Person, RadioMsg, SimState, Vehicle } from '@/sim/types';
import {
  allocateSlots,
  arcPath,
  compact,
  dec,
  donutAngles,
  linearScale,
  niceStep,
  niceTicks,
  stack,
  areaPath,
  linePath,
} from '@/ui/tools/lib/chart';
import {
  ageAt,
  CITIZENSHIP,
  citizenshipLabel,
  fallbackPersonFlags,
  fallbackVehicleFlags,
  fold,
  formatPlate,
  incidentsForPerson,
  isIdcodeLike,
  isLegend,
  isoToEt,
  lawIdLabel,
  localPendingRadio,
  localSearchPersons,
  localSearchVehicles,
  looksLikeVin,
  mmss,
  plateKey,
  queriesForRecord,
  queryReplyKind,
  querySubject,
  sameRecord,
  sortFlags,
  templateMatches,
  typedChars,
  uncheckedLinks,
  visibleIncidents,
} from '@/ui/tools/lib/helpers';
import { _resetSamples, sampleSim, samplesFor, SAMPLE_EVERY_MS } from '@/ui/tools/lib/samples';
import { fillUnits, pickTemplate, resolveWhere, SCENES, sceneDuration } from '@/ui/tools/lib/scenes';
import TOOLS_DICT from '@/i18n/parts/tools';

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 9, 17, 20, 0);

function person(over: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    idcode: '38506120234',
    firstName: 'Märt',
    lastName: 'Õunapuu',
    gender: 'M',
    birthDate: '1985-06-12',
    citizenship: 'EST',
    lang: 'et',
    address: 'Punane tn 16-45',
    city: 'Tallinn',
    phone: '+372 5123 4567',
    occupation: { et: 'ehitaja', en: 'builder' },
    appearance: { heightCm: 182, build: 'athletic', hair: 'short', hairColor: 'brown', eyes: 'blue', clothing: { et: 'must jope', en: 'black jacket' } },
    license: { status: 'valid', categories: ['B'], validUntil: '2030-01-01' },
    records: [],
    flags: {},
    vehicles: [],
    notes: [],
    avatarSeed: 1,
    ...over,
  };
}

function vehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    plate: '123 ABC',
    vin: 'WVWZZZ1KZ6W000001',
    make: 'Toyota',
    model: 'Avensis',
    year: 2012,
    color: { et: 'hall', en: 'grey' },
    kind: 'car',
    ownerId: 'p1',
    insurance: { valid: true, until: '2027-01-01', insurer: 'Kindlustus AS' },
    inspection: { valid: true, until: '2027-05-01' },
    flags: {},
    notes: [],
    ...over,
  };
}

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: 'i1',
    number: 'PÕ-261017-0001',
    templateId: 'tpl_a',
    category: 'traffic',
    code: 'LJ',
    title: { et: 'Liiklusjärelevalve', en: 'Traffic stop' },
    priority: 3,
    truePriority: 3,
    state: 'onscene',
    source: 'hk',
    createdAt: NOW - 30 * 60_000,
    location: { address: 'Narva mnt 1', coord: [24.75, 59.43], city: 'Tallinn', placeKind: 'street', zone: 'mainland' },
    summary: { et: '', en: '' },
    details: [],
    hiddenDetails: [],
    persons: [
      { personId: 'p1', role: 'driver' },
      { personId: 'p2', role: 'caller' },
    ],
    vehicles: [{ plate: '123 ABC', role: 'involved' }],
    assigned: [],
    unitHistory: [],
    need: [],
    ideal: [],
    onSceneMin: 10,
    workDone: 0,
    slaMin: 45,
    beats: [{ index: 0, status: 'active', radioId: 'r1' }],
    agencyNeeds: [],
    effects: { success: 0, risk: 0, trust: 0, time: 0, arrests: 0 },
    timeline: [],
    tags: [],
    ...over,
  };
}

function sim(): SimState {
  const p1 = person();
  const p2 = person({ id: 'p2', idcode: '48803030000', firstName: 'Liisa', lastName: 'Tamm', gender: 'F', birthDate: '1988-03-03' });
  const legend = person({ id: 'legend-rainer', idcode: '50401010000', firstName: 'Rainer', lastName: 'Okimum', birthDate: '2004-01-01' });
  const v = vehicle();
  const msgs: RadioMsg[] = [
    {
      id: 'r1',
      t: NOW - 60_000,
      from: 'Põhja 21',
      text: { et: 'Kontrolli juhti', en: 'Check the driver' },
      level: 'routine',
      kind: 'query',
      incidentId: 'i1',
      replies: [
        { id: 'clean', label: { et: 'Puhas', en: 'Clean' } },
        { id: 'wanted', label: { et: 'Tagaotsitav', en: 'Wanted' } },
      ],
    },
    {
      id: 'r2',
      t: NOW - 30_000,
      from: 'Põhja 22',
      text: { et: 'Kontrolli sõidukit 123ABC', en: 'Check vehicle 123ABC' },
      level: 'routine',
      kind: 'query',
      replies: [
        { id: 'clean', label: { et: 'Puhas', en: 'Clean' } },
        { id: 'stolen', label: { et: 'Varastatud', en: 'Stolen' } },
      ],
    },
    { id: 'r3', t: NOW - 10_000, from: 'Põhja 23', text: { et: 'Vaba', en: 'Free' }, level: 'routine', kind: 'status' },
    {
      id: 'r4',
      t: NOW - 20_000,
      from: 'Põhja 24',
      text: { et: 'Isikukood 48803030000, kontrolli', en: 'ID 48803030000, check' },
      level: 'routine',
      kind: 'query',
      replies: [{ id: 'clean', label: { et: 'Puhas', en: 'Clean' } }],
      answered: 'clean',
    },
  ];
  return {
    version: 2,
    seed: 42,
    rng: 1,
    mode: 'free',
    difficulty: 'normal',
    regionId: 'pohja',
    playerName: 'Test',
    startTime: NOW - 2 * 3600_000,
    endTime: NOW + 6 * 3600_000,
    now: NOW,
    ended: false,
    weather: { kind: 'clear', tempC: 5, windMs: 3, roadFactor: 1, text: { et: '', en: '' } },
    units: {
      u1: {
        id: 'u1',
        callsign: 'Põhja 21',
        type: 'patrol',
        stationId: 's',
        zone: 'mainland',
        vehicle: 'Škoda',
        crew: [],
        status: 'available',
        statusSince: 0,
        pos: [24.7, 59.4],
        heading: 0,
        fatigue: 0,
        breaks: 0,
        handled: 0,
      },
      u2: {
        id: 'u2',
        callsign: 'Põhja 22',
        type: 'patrol',
        stationId: 's',
        zone: 'mainland',
        vehicle: 'Škoda',
        crew: [],
        status: 'onscene',
        statusSince: 0,
        pos: [24.7, 59.4],
        heading: 0,
        fatigue: 0,
        breaks: 0,
        handled: 0,
      },
    },
    unitOrder: ['u1', 'u2'],
    incidents: { i1: incident(), i2: incident({ id: 'i2', persons: [{ personId: 'p1', role: 'suspect' }], vehicles: [] }) },
    incidentOrder: ['i1', 'i2'],
    persons: { p1, p2, [legend.id]: legend },
    vehicles: { [v.plate]: v },
    radio: msgs,
    calls: [],
    bulletins: [],
    queries: [],
    events: [],
    seq: { incident: 2, radio: 4, person: 3, call: 0, bulletin: 0 },
    nextSpawnAt: 0,
    trust: 60,
    stats: {
      incidents: 2,
      closed: 0,
      byPriority: { 1: 0, 2: 0, 3: 2, 4: 0 },
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
  };
}

const TPL_QUERY = {
  id: 'tpl_a',
  category: 'traffic',
  code: 'LJ',
  title: { et: 'Liiklusjärelevalve', en: 'Traffic stop' },
  priority: 3,
  weight: 1,
  places: ['street'],
  units: { need: [] },
  onScene: [5, 10],
  persons: [],
  summary: [],
  outcomes: [],
  beats: [{ kind: 'query', at: 'arrive', queryType: 'person', subject: 'driver', radio: [] }],
} as unknown as IncidentTemplate;

// ── chart maths ──────────────────────────────────────────────────────────────

describe('chart scales', () => {
  it('maps a linear domain to a range (incl. inverted y)', () => {
    const y = linearScale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(10)).toBe(0);
    expect(y(2.5)).toBe(75);
    expect(y.domain).toEqual([0, 10]);
  });
  it('degenerate domain does not divide by zero', () => {
    const x = linearScale([5, 5], [0, 100]);
    expect(Number.isFinite(x(5))).toBe(true);
  });
  it('picks nice steps', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(7, 4)).toBe(2);
    expect(niceStep(100, 4)).toBe(25);
    expect(niceStep(0, 4)).toBe(1);
  });
  it('builds nice ticks that cover the max', () => {
    const ticks = niceTicks(0, 17, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(17);
    expect(niceTicks(0, 3, 4, true)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0, 0, 4, true)).toEqual([0, 1]);
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
  });
  it('splits a donut proportionally with gaps', () => {
    const a = donutAngles([1, 1, 2], 0);
    expect(a[0].share).toBeCloseTo(0.25);
    expect(a[2].a1).toBeCloseTo(Math.PI * 2);
    const g = donutAngles([1, 0, 1], 0.1);
    expect(g[1].share).toBe(0);
    expect(g[0].a1 - g[0].a0).toBeCloseTo((Math.PI * 2 - 0.2) / 2);
    expect(donutAngles([0, 0]).every((x) => x.share === 0)).toBe(true);
  });
  it('produces a closed SVG arc path', () => {
    const d = arcPath(50, 50, 40, 20, 0, Math.PI / 2);
    expect(d.startsWith('M50 10')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(arcPath(50, 50, 40, 20, 0, Math.PI * 2)).toContain('Z');
  });
  it('stacks series', () => {
    expect(stack([[1, 2, 3]])).toEqual([
      [
        [0, 1],
        [1, 3],
        [3, 6],
      ],
    ]);
  });
  it('builds line/area paths', () => {
    expect(linePath([
      [0, 0],
      [10, 5],
    ])).toBe('M0 0 L10 5');
    expect(areaPath([], [])).toBe('');
    expect(areaPath([[0, 0], [10, 0]], [[0, 10], [10, 10]])).toMatch(/Z$/);
  });
  it('keeps colour slots stable for surviving categories', () => {
    const a = allocateSlots({}, ['traffic', 'violence', 'property'], 5);
    expect(a).toEqual({ traffic: 0, violence: 1, property: 2 });
    // violence drops out, domestic enters → takes the freed slot, others keep theirs
    const b = allocateSlots(a, ['property', 'traffic', 'domestic'], 5);
    expect(b.traffic).toBe(0);
    expect(b.property).toBe(2);
    expect(b.domestic).toBe(1);
  });
  it('formats compact numbers with a decimal comma in Estonian', () => {
    expect(compact(950)).toBe('950');
    expect(compact(1200, 'et')).toBe('1,2K');
    expect(compact(1200, 'en')).toBe('1.2K');
    expect(dec(7.45, 1, 'et')).toBe('7,5');
    expect(dec(7.44, 1, 'en')).toBe('7.4');
  });
});

// ── plates, ids, labels ──────────────────────────────────────────────────────

describe('plates & codes', () => {
  it('normalises and formats plates', () => {
    expect(plateKey(' 123 abc ')).toBe('123ABC');
    expect(formatPlate('123abc')).toBe('123 ABC');
    expect(formatPlate('123  ABC')).toBe('123 ABC');
    expect(formatPlate('abc123')).toBe('ABC 123');
    expect(formatPlate('kalle')).toBe('KALLE');
  });
  it('recognises idcodes and VINs', () => {
    expect(isIdcodeLike('385 0612 0234')).toBe(true);
    expect(isIdcodeLike('3850612023')).toBe(false);
    expect(looksLikeVin('WVWZZZ1KZ6W000001')).toBe(true);
    expect(looksLikeVin('WVWZZZ1KZ6W00000I')).toBe(false); // I not allowed
  });
  it('folds diacritics for name search', () => {
    expect(fold('  Õunapuu  ŠAHT ')).toBe('ounapuu saht');
  });
  it('labels citizenship in both languages, incl. undetermined', () => {
    expect(citizenshipLabel('EST', 'et')).toEqual({ flag: '🇪🇪', name: 'Eesti' });
    expect(citizenshipLabel('RUS', 'et').name).toBe('Vene Föderatsioon');
    expect(citizenshipLabel('XXA', 'et').name).toBe('Määratlemata kodakondsus');
    expect(citizenshipLabel('XXA', 'en').name).toBe('Undetermined citizenship');
    expect(citizenshipLabel('UKR', 'en').name).toBe('Ukraine');
    expect(citizenshipLabel('ZZZ', 'et').name).toBe('ZZZ');
    for (const c of Object.values(CITIZENSHIP)) expect(c.name.et && c.name.en).toBeTruthy();
  });
  it('derives a law label from an id', () => {
    expect(lawIdLabel('kars_199')).toBe('KarS § 199');
    expect(lawIdLabel('ls_224_2')).toBe('LS § 224 lg 2');
    expect(lawIdLabel('custom')).toBe('custom');
  });
  it('formats dates, ages and timers', () => {
    expect(isoToEt('2026-10-17')).toBe('17.10.2026');
    expect(isoToEt(undefined)).toBe('-');
    expect(ageAt('1985-06-12', NOW)).toBe(41);
    expect(ageAt('1985-10-18', NOW)).toBe(40);
    expect(mmss(65_000)).toBe('01:05');
    expect(mmss(-5)).toBe('00:00');
  });
  it('types characters over time', () => {
    expect(typedChars(100, 0)).toBe(0);
    expect(typedChars(100, 1000, 40)).toBe(40);
    expect(typedChars(10, 5000)).toBe(10);
  });
});

// ── registry flags & search ──────────────────────────────────────────────────

describe('registry fallbacks', () => {
  it('derives person flags, most severe first', () => {
    const p = person({
      flags: { wanted: { reason: { et: 'x', en: 'x' }, since: '2026-01-01', dangerous: true, authority: 'Harju Maakohus' }, restrainingOrder: { protectedName: 'A', until: '2027-01-01' } },
      license: { status: 'suspended', categories: ['B'] },
      weaponPermit: { kind: { et: 'jahirelv', en: 'hunting' }, validUntil: '2028-01-01', weapons: [] },
    });
    const f = sortFlags(fallbackPersonFlags(p, NOW));
    expect(f.map((x) => x.id)).toEqual(['wanted', 'armed', 'restraining', 'nolicense', 'weapon']);
    expect(f[0].text.et).toBe('TAGAOTSITAV');
    expect(f[1].text.et).toBe('RELVASTATUD JA OHTLIK');
  });
  it('ignores expired restraining orders and permits', () => {
    const p = person({
      flags: { restrainingOrder: { protectedName: 'A', until: '2020-01-01' } },
      weaponPermit: { kind: { et: 'x', en: 'x' }, validUntil: '2020-01-01', weapons: [] },
    });
    expect(fallbackPersonFlags(p, NOW)).toEqual([]);
  });
  it('derives vehicle flags', () => {
    const owner = person({ flags: { wanted: { reason: { et: 'x', en: 'x' }, since: '2026-01-01', dangerous: false, authority: 'x' } } });
    const v = vehicle({ flags: { stolen: { since: '2026-10-01', text: { et: 'x', en: 'x' } } }, insurance: { valid: true, until: '2025-01-01', insurer: 'x' } });
    const ids = fallbackVehicleFlags(v, NOW, owner).map((f) => f.id);
    expect(ids).toEqual(['stolen', 'ownerwanted', 'noinsurance']);
    expect(fallbackVehicleFlags(vehicle(), NOW)).toEqual([]);
  });
  it('detects legend persons', () => {
    expect(isLegend({ id: 'legend-magnus' })).toBe(true);
    expect(isLegend({ id: 'p1' })).toBe(false);
  });
  it('searches persons by idcode, prefix and diacritic-insensitive name', () => {
    const s = sim();
    expect(localSearchPersons(s.persons, '38506120234').map((p) => p.id)).toEqual(['p1']);
    expect(localSearchPersons(s.persons, '4880').map((p) => p.id)).toEqual(['p2']);
    expect(localSearchPersons(s.persons, 'mart ounap').map((p) => p.id)).toEqual(['p1']);
    expect(localSearchPersons(s.persons, 'okimum').map((p) => p.id)).toEqual(['legend-rainer']);
    expect(localSearchPersons(s.persons, '   ')).toEqual([]);
  });
  it('searches vehicles by plate and VIN', () => {
    const s = sim();
    expect(localSearchVehicles(s.vehicles, '123abc').length).toBe(1);
    expect(localSearchVehicles(s.vehicles, 'abc').length).toBe(1);
    expect(localSearchVehicles(s.vehicles, 'WVWZZZ1KZ6W000001').length).toBe(1);
    expect(localSearchVehicles(s.vehicles, '999 ZZZ').length).toBe(0);
  });
});

// ── query matching (core loop) ───────────────────────────────────────────────

describe('query matching', () => {
  it('classifies query kind from reply ids', () => {
    const s = sim();
    expect(queryReplyKind(s.radio[0])).toBe('person');
    expect(queryReplyKind(s.radio[1])).toBe('vehicle');
    expect(queryReplyKind({ replies: [{ id: 'clean', label: { et: '', en: '' } }] })).toBe(null);
  });
  it('resolves the subject via the beat → template subject role', () => {
    const s = sim();
    expect(querySubject(s, s.radio[0], { tpl_a: TPL_QUERY })).toEqual({ personId: 'p1' });
  });
  it('falls back to the incident when the template is unknown', () => {
    const s = sim();
    // only one non-caller person in i1 → p1
    expect(querySubject(s, s.radio[0], {})).toEqual({ personId: 'p1' });
  });
  it('resolves plates and idcodes written in the text', () => {
    const s = sim();
    expect(querySubject(s, s.radio[1], {})).toEqual({ plate: '123 ABC' });
    expect(querySubject(s, s.radio[3], {})).toEqual({ personId: 'p2' });
  });
  it('lists pending messages and matches them to the open record', () => {
    const s = sim();
    const pend = localPendingRadio(s);
    expect(pend.map((m) => m.id)).toEqual(['r1', 'r2']);
    expect(queriesForRecord(s, pend, { personId: 'p1' }, { tpl_a: TPL_QUERY }).map((m) => m.id)).toEqual(['r1']);
    expect(queriesForRecord(s, pend, { plate: '123abc' }, {}).map((m) => m.id)).toEqual(['r2']);
    expect(queriesForRecord(s, pend, { personId: 'p2' }, {})).toEqual([]);
    expect(sameRecord(null, { personId: 'p1' })).toBe(false);
  });
  it('drops expired messages from the pending list', () => {
    const s = sim();
    s.radio[0].expiresAt = NOW - 1;
    expect(localPendingRadio(s).map((m) => m.id)).toEqual(['r2']);
  });
  it('finds unchecked links on open incidents only', () => {
    const s = sim();
    expect(uncheckedLinks(s, { personId: 'p1' })).toEqual(['i1', 'i2']);
    s.incidents.i1.persons[0].checked = true;
    s.incidents.i2.state = 'closed';
    expect(uncheckedLinks(s, { personId: 'p1' })).toEqual([]);
    expect(uncheckedLinks(s, { plate: '123ABC' })).toEqual(['i1']);
  });
  it('hides incidents flagged hidden (pending 112 calls)', () => {
    const s = sim();
    s.flags['hidden:i2'] = true;
    expect(visibleIncidents(s).map((i) => i.id)).toEqual(['i1']);
    expect(incidentsForPerson(s, 'p1').map((i) => i.id)).toEqual(['i1']);
  });
});

// ── samples ring buffer ──────────────────────────────────────────────────────

describe('utilisation samples', () => {
  beforeEach(() => _resetSamples());
  it('samples every 10 game-minutes and appends a live point', () => {
    const s = sim();
    expect(sampleSim(s)).toBe(true);
    expect(sampleSim(s)).toBe(false);
    s.now += SAMPLE_EVERY_MS - 1;
    expect(sampleSim(s)).toBe(false);
    s.now += 1;
    expect(sampleSim(s)).toBe(true);
    s.now += 60_000;
    const out = samplesFor(s);
    expect(out.length).toBe(3);
    expect(out[0].counts.available).toBe(1);
    expect(out[0].counts.onscene).toBe(1);
    expect(out[0].open).toBe(2);
  });
  it('restarts when the clock goes backwards', () => {
    const s = sim();
    sampleSim(s);
    s.now += SAMPLE_EVERY_MS;
    sampleSim(s);
    s.now -= 5 * SAMPLE_EVERY_MS;
    sampleSim(s);
    expect(samplesFor(s).length).toBe(1);
  });
});

// ── director scenes ──────────────────────────────────────────────────────────

describe('director scenes', () => {
  const tpls = [
    { ...TPL_QUERY, id: 'crash', category: 'traffic', title: { et: 'Liiklusõnnetus', en: 'Crash' }, tags: [] },
    { ...TPL_QUERY, id: 'rob', category: 'property', title: { et: 'Rööv pangas', en: 'Bank robbery' }, tags: ['armed'] },
    { ...TPL_QUERY, id: 'egg', category: 'easter', title: { et: 'Rööv', en: 'Robbery' }, easterEgg: true, tags: ['armed', 'robbery'] },
  ] as IncidentTemplate[];
  it('picks templates by tags/keywords/category and skips easter eggs', () => {
    expect(pickTemplate(tpls, { tags: ['armed', 'robbery'], keywords: ['rööv'] })?.id).toBe('rob');
    expect(pickTemplate(tpls, { keywords: ['liiklusõnnetus'] })?.id).toBe('crash');
    expect(pickTemplate(tpls, { keywords: ['nothing'] })?.id).toBe('crash');
    expect(pickTemplate([], {})).toBeUndefined();
  });
  it('resolves coordinates per region', () => {
    const w = { pohja: [24.75, 59.43] as [number, number], offsetKm: [11.132, 11.132] as [number, number] };
    expect(resolveWhere(w, 'pohja', [0, 0])).toEqual([24.75, 59.43]);
    const [lon, lat] = resolveWhere(w, 'louna', [26.7, 58.0]);
    expect(lat).toBeCloseTo(58.1, 2);
    expect(lon).toBeGreaterThan(26.7);
  });
  it('fills unit placeholders', () => {
    expect(fillUnits({ et: '{u1}, kohal', en: '{u1}, on scene {u9}' }, { u1: 'Põhja 21' })).toEqual({ et: 'Põhja 21, kohal', en: 'Põhja 21, on scene {u9}' });
  });
  it('ships four complete bilingual scenes', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(4);
    for (const sc of SCENES) {
      expect(sc.title.et && sc.title.en && sc.desc.et && sc.desc.en).toBeTruthy();
      expect(sceneDuration(sc)).toBeGreaterThan(0);
      for (const st of sc.steps) {
        if (st.kind === 'incident') expect(st.summary.et && st.summary.en).toBeTruthy();
        if (st.kind === 'radio') expect(st.text.et && st.text.en).toBeTruthy();
      }
    }
  });
  it('matches templates in the director search', () => {
    expect(templateMatches(tpls[1], 'roov')).toBe(true);
    expect(templateMatches(tpls[1], 'property')).toBe(true);
    expect(templateMatches(tpls[1], 'liiklus')).toBe(false);
    expect(templateMatches(tpls[1], '')).toBe(true);
  });
});

// ── i18n completeness ────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('tools i18n', () => {
  it('has Estonian and English for every key', () => {
    for (const [k, v] of Object.entries(TOOLS_DICT)) {
      expect(k.startsWith('tools.'), k).toBe(true);
      expect(v.et.trim(), k).not.toBe('');
      expect(v.en.trim(), k).not.toBe('');
    }
  });
  it('defines every static tools.* key used by the panels', () => {
    const dir = join(process.cwd(), 'src/ui/tools');
    const used = new Set<string>();
    for (const f of walk(dir)) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/['"`](tools\.[a-zA-Z0-9_.]+)['"`]/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !(k in TOOLS_DICT));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(50);
  });
});

describe('flag text split', () => {
  it('splits engine flag texts into head and detail', async () => {
    const { splitFlagText } = await import('@/ui/tools/lib/helpers');
    expect(splitFlagText('TAGAOTSITAV: Rööv (Harju Maakohus, alates 01.02.2026)')).toEqual({ head: 'TAGAOTSITAV', rest: 'Rööv (Harju Maakohus, alates 01.02.2026)' });
    expect(splitFlagText('LÄHENEMISKEELD (kaitstav: Mari Tamm)')).toEqual({ head: 'LÄHENEMISKEELD', rest: 'kaitstav: Mari Tamm' });
    expect(splitFlagText('KARISTATUD (3 korda)')).toEqual({ head: 'KARISTATUD', rest: '3 korda' });
    expect(splitFlagText('RELVALUBA')).toEqual({ head: 'RELVALUBA', rest: '' });
  });
});

describe('time ticks', () => {
  it('uses round wall-clock steps', async () => {
    const { timeTicks } = await import('@/ui/tools/lib/chart');
    const H = 3600_000;
    const t0 = Date.UTC(2026, 9, 17, 16, 0);
    const ticks = timeTicks(t0, t0 + 41 * 60_000, 4);
    expect(ticks.every((t) => (t / 60_000) % 15 === 0)).toBe(true);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(timeTicks(t0, t0 + 8 * H, 5).every((t) => t % (2 * H) === 0)).toBe(true);
  });
});
