/**
 * engine-core tests: createShift, step, units, incidents, beats, commands, selectors.
 *
 * Most tests run against fixtures (a mini region + fixture templates + fake generators and
 * engine-systems stand-ins) loaded with vi.doMock, so they do not depend on content/generator
 * work in progress. The last suite runs a smoke test with the REAL modules once content exists.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Incident, NewShiftOptions, SimState } from '@/sim/types';

type EngineMod = typeof import('@/sim/engine');
type CommandsMod = typeof import('@/sim/commands');
type SelectorsMod = typeof import('@/sim/selectors');
type IncidentsMod = typeof import('@/sim/incidents');
type SpawnerMod = typeof import('@/sim/spawner');
type UnitsMod = typeof import('@/sim/units');
type DataMod = typeof import('@/ui/game/data');

interface Eng {
  engine: EngineMod;
  commands: CommandsMod;
  selectors: SelectorsMod;
  incidents: IncidentsMod;
  spawner: SpawnerMod;
  units: UnitsMod;
  /** UI selector layer: bestFor() is what the D key and the big "Saada" button send. */
  data: DataMod;
}

const MOCKED = [
  '@/data/regions',
  '@/data/incidents',
  '@/gen/person',
  '@/gen/address',
  '@/gen/vehicle',
  '@/gen/describe',
  '@/gen/names',
  '@/sim/calls',
  '@/sim/weather',
  '@/sim/calendar',
  '@/sim/pursuit',
  '@/sim/search',
  '@/sim/sun',
  '@/sim/report',
];

async function loadModules(): Promise<Eng> {
  return {
    engine: await import('@/sim/engine'),
    commands: await import('@/sim/commands'),
    selectors: await import('@/sim/selectors'),
    incidents: await import('@/sim/incidents'),
    spawner: await import('@/sim/spawner'),
    units: await import('@/sim/units'),
    data: await import('@/ui/game/data'),
  };
}

async function loadFixtureEngine(): Promise<Eng> {
  vi.resetModules();
  const f = await import('./fixtures/fakeGen');
  const { MINI_REGION } = await import('./fixtures/miniRegion');
  const { FIXTURE_TEMPLATES } = await import('./fixtures/templates');
  vi.doMock('@/data/regions', () => ({
    REGIONS: { pohja: MINI_REGION, ida: MINI_REGION, louna: MINI_REGION, laane: MINI_REGION },
    REGION_IDS: ['pohja'],
    regionForCounty: () => 'pohja',
  }));
  vi.doMock('@/data/incidents', () => ({
    TEMPLATES: FIXTURE_TEMPLATES,
    TEMPLATE_BY_ID: Object.fromEntries(FIXTURE_TEMPLATES.map((t) => [t.id, t])),
  }));
  vi.doMock('@/gen/person', () => f.personModule);
  vi.doMock('@/gen/address', () => f.addressModule);
  vi.doMock('@/gen/vehicle', () => f.vehicleModule);
  vi.doMock('@/gen/describe', () => f.describeModule);
  vi.doMock('@/gen/names', () => f.namesModule);
  vi.doMock('@/sim/calls', () => f.callsModule);
  vi.doMock('@/sim/weather', () => f.weatherModule);
  vi.doMock('@/sim/calendar', () => f.calendarModule);
  vi.doMock('@/sim/pursuit', () => f.pursuitModule);
  vi.doMock('@/sim/search', () => f.searchModule);
  vi.doMock('@/sim/sun', () => f.sunModule);
  vi.doMock('@/sim/report', () => f.reportModule);
  return loadModules();
}

/** 17.10.2026 07:00 Tallinn (EEST, UTC+3). */
const START = Date.UTC(2026, 9, 17, 4, 0);
const MIN = 60_000;

function opts(over: Partial<NewShiftOptions> = {}): NewShiftOptions {
  return { seed: 42, regionId: 'pohja', mode: 'free', difficulty: 'normal', start: START, hours: 12, playerName: 'Test', ...over };
}

/** JSON with sorted keys: key order is not state (JSON round-trips may reorder keys). */
function canon(x: unknown): string {
  return JSON.stringify(x, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v,
  );
}

function stepUntil(E: Eng, s: SimState, pred: () => boolean, maxMin: number, dt = 5_000): boolean {
  const end = s.now + maxMin * MIN;
  while (s.now < end) {
    if (pred()) return true;
    E.engine.step(s, dt);
  }
  return pred();
}

function quiet(E: Eng, over: Partial<NewShiftOptions> = {}): SimState {
  const s = E.engine.createShift(opts(over));
  s.flags.autoSpawn = false;
  return s;
}

function spawn(E: Eng, s: SimState, templateId: string, coord: [number, number] = [24.84, 59.437]): Incident {
  const id = E.commands.directorSpawn(s, { templateId, coord });
  expect(id).not.toBe('');
  return s.incidents[id];
}

function dispatchBest(E: Eng, s: SimState, inc: Incident, n = 1): string[] {
  const recs = E.selectors.recommendUnits(s, inc.id).filter((r) => r.fit === 'ideal' || r.fit === 'need');
  const ids = recs.slice(0, n).map((r) => r.unit.id);
  const r = E.commands.dispatchUnits(s, inc.id, ids);
  expect(r.ok).toBe(true);
  return ids;
}

/** A simple automatic dispatcher used by the long-run tests. */
function bot(E: Eng, s: SimState, correctness = 0.8): void {
  for (const inc of E.selectors.queue(s)) {
    if (inc.state === 'incoming') E.commands.acknowledge(s, inc.id);
    const backup = E.selectors.backupNeeded(s, inc);
    if (!inc.assigned.length || backup) {
      const recs = E.selectors.recommendUnits(s, inc.id).filter((r) => r.fit === 'ideal' || r.fit === 'need');
      if (recs.length) E.commands.dispatchUnits(s, inc.id, [recs[0].unit.id]);
    }
  }
  for (const m of E.selectors.pendingRadio(s)) {
    const inc = m.incidentId ? s.incidents[m.incidentId] : undefined;
    let reply = m.replies![0].id;
    if (m.kind === 'query' && inc) {
      const b = inc.beats.find((x) => x.radioId === m.id);
      const tpl = E.selectors.templateOf(s, inc);
      const spec = b ? tpl?.beats?.[b.index] : undefined;
      if (spec?.kind === 'query') {
        const subj = E.incidents.querySubjectOf(s, inc, spec);
        const truth = subj ? E.incidents.expectedReply(s, subj, E.incidents.queryCtx(inc, spec)) : 'notfound';
        reply = (s.seq.radio % 10) / 10 < correctness ? truth : 'clean';
      }
    }
    if ((s.seq.radio % 7) !== 0) E.commands.replyRadio(s, m.id, reply);
  }
  // 112 transfers: answer, ask where, create the event with the true priority.
  for (const c of s.calls) {
    if (c.endedAt !== undefined) continue;
    const inc = s.incidents[c.incidentId];
    E.commands.answerCall(s, c.id);
    E.commands.askCall(s, c.id, 'where');
    E.commands.endCall(s, c.id, c.prank ? { action: 'prank' } : { action: 'create', priority: inc?.truePriority ?? 3 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('engine-core with fixtures', () => {
  let E: Eng;
  beforeAll(async () => {
    E = await loadFixtureEngine();
  });
  afterAll(() => {
    for (const m of MOCKED) vi.doUnmock(m);
    vi.resetModules();
  });

  it('createShift is deterministic and seed-dependent', () => {
    const a = E.engine.createShift(opts());
    const b = E.engine.createShift(opts());
    const c = E.engine.createShift(opts({ seed: 43 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('builds the roster for shift & difficulty, with crews, legends, registry and bulletins', () => {
    const s = E.engine.createShift(opts());
    const calls = s.unitOrder.map((id) => s.units[id].callsign);
    expect(calls).toEqual(['21', '22', '23', 'K-31', 'KOER-1', '26', 'KOPTER 1', 'S-1']);
    const night = E.engine.createShift(opts({ start: START + 12 * 3_600_000, difficulty: 'veteran' }));
    expect(night.unitOrder.length).toBe(10);
    const u26 = Object.values(s.units).find((u) => u.callsign === '26')!;
    expect(u26.crew[0].firstName).toBe('Toomas');
    expect(u26.crew[0].badge).toBe('085');
    expect(u26.crew.length).toBe(2);
    for (const u of Object.values(s.units)) {
      expect(u.status).toBe('available');
      for (const o of u.crew) {
        expect(o.skill).toBeGreaterThanOrEqual(0.25);
        expect(o.skill).toBeLessThanOrEqual(0.97);
        expect(o.years).toBeGreaterThanOrEqual(1);
        expect(o.rank.et.length).toBeGreaterThan(3);
      }
    }
    const heli = Object.values(s.units).find((u) => u.type === 'heli')!;
    expect(heli.onCall).toBe(true);
    expect(heli.pos).toEqual([24.8, 59.415]);
    const island = Object.values(s.units).find((u) => u.callsign === 'S-1')!;
    expect(island.zone).toBe('saar');
    // Registry: 150 background persons + 2 legends, vehicles linked to owners.
    expect(Object.keys(s.persons).length).toBe(152);
    expect(Object.keys(s.vehicles).length).toBeGreaterThan(50);
    const v = Object.values(s.vehicles)[0];
    expect(s.persons[v.ownerId!].vehicles).toContain(v.plate);
    const ok = s.persons['legend-okimum'];
    const sm = s.persons['legend-sarmert'];
    expect(ok.flags.wanted).toBeTruthy();
    expect(sm.flags.wanted).toBeTruthy();
    // Ordinary registry entries: no extra notes or marks.
    expect(ok.notes).toEqual([]);
    expect(sm.lastName).toBe('Sarmert');
    expect(sm.birthDate).toBe('1988-04-01');
    // Bulletins: 2-4 BOLO + päevakäsk + weather.
    const bolo = s.bulletins.filter((b) => b.kind === 'bolo_person' || b.kind === 'bolo_vehicle');
    expect(bolo.length).toBeGreaterThanOrEqual(2);
    expect(bolo.length).toBeLessThanOrEqual(5);
    expect(s.bulletins.some((b) => b.kind === 'order')).toBe(true);
    expect(s.bulletins.some((b) => b.kind === 'weather')).toBe(true);
    for (const b of bolo) {
      if (b.plate) expect(s.vehicles[b.plate].flags.stolen).toBeTruthy();
      if (b.personId) expect(s.persons[b.personId].flags.wanted).toBeTruthy();
    }
    expect(s.trust).toBe(50);
    expect(E.engine.createShift(opts({ reputation: 65 })).trust).toBe(70);
    expect(s.nextSpawnAt - s.startTime).toBeGreaterThanOrEqual(MIN);
    expect(s.nextSpawnAt - s.startTime).toBeLessThanOrEqual(3 * MIN);
    expect(s.radio.some((m) => m.from === 'JK')).toBe(true);
  });

  it('legend isikukoods are valid', async () => {
    const { parseIdcode } = await vi.importActual<typeof import('@/gen/isikukood')>('@/gen/isikukood');
    const s = E.engine.createShift(opts());
    expect(parseIdcode(s.persons['legend-okimum'].idcode).valid).toBe(true);
    expect(parseIdcode(s.persons['legend-sarmert'].idcode).valid).toBe(true);
  });

  it('career roster + upgrades: K-komando added on call only with the upgrade', () => {
    const base = E.engine.createShift(opts());
    const roster = [{ ...base.units.u1, crew: base.units.u1.crew, callsign: 'C-1' }].map((u) => ({
      callsign: u.callsign,
      type: u.type,
      stationId: u.stationId,
      vehicle: u.vehicle,
      crew: u.crew,
    }));
    const a = E.engine.createShift(opts({ mode: 'career', roster }));
    expect(a.unitOrder.length).toBe(1);
    const b = E.engine.createShift(opts({ mode: 'career', roster, upgrades: ['kkomando', 'heli_hours', 'mdt'] }));
    const types = b.unitOrder.map((id) => b.units[id].type);
    expect(types).toContain('special');
    expect(types).toContain('heli');
    expect(b.flags['upg:mdt']).toBe(true);
    expect(b.units[b.unitOrder.find((id) => b.units[id].type === 'special')!].onCall).toBe(true);
  });

  it('spawns at a plausible Poisson rate over 4 hours, easter eggs capped', () => {
    const s = E.engine.createShift(opts({ seed: 7 }));
    for (let i = 0; i < 4 * 60; i++) {
      E.engine.step(s, MIN);
      E.engine.drainEvents(s);
    }
    // callVolume 6/h × flat curve → ~24 expected.
    expect(s.stats.incidents).toBeGreaterThanOrEqual(10);
    expect(s.stats.incidents).toBeLessThanOrEqual(45);
    const easter = Object.values(s.incidents).filter((i) => i.easterEgg).length;
    expect(easter).toBeLessThanOrEqual(2);
    for (const inc of Object.values(s.incidents)) {
      expect(inc.number).toMatch(/^PÕ-261017-\d{4}$/);
      expect(inc.summary.et.length).toBeGreaterThan(3);
      expect(inc.summary.et).not.toMatch(/\{\w+\}/);
      expect(inc.slaMin).toBeGreaterThan(0);
      expect(inc.caller?.name).toBeTruthy();
    }
  });

  it('dispatch → enroute → onscene → closed', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_simple');
    expect(inc.state).toBe('incoming');
    expect(E.selectors.queue(s).map((i) => i.id)).toContain(inc.id);
    E.commands.acknowledge(s, inc.id);
    expect(inc.state).toBe('queued');
    expect(inc.details.length).toBe(1);
    const [uid] = dispatchBest(E, s, inc);
    const u = s.units[uid];
    expect(u.status).toBe('enroute');
    expect(inc.state).toBe('dispatched');
    expect(u.move?.siren).toBe(false);
    const p0 = E.selectors.unitPos(s, u).pos;
    expect(stepUntil(E, s, () => inc.state === 'onscene', 60)).toBe(true);
    expect(u.status).toBe('onscene');
    expect(u.pos).not.toEqual(p0);
    expect(inc.firstArrivalAt).toBeDefined();
    expect(s.stats.responseTimes[3].length).toBe(1);
    expect(stepUntil(E, s, () => inc.state === 'closed', 60)).toBe(true);
    expect(inc.closedBy).toBe('units');
    expect(inc.outcome?.score).toBeGreaterThan(0);
    expect(inc.outcome?.score).toBeLessThanOrEqual(100);
    expect(u.status).toBe('available');
    expect(u.incidentId).toBeUndefined();
    expect(u.handled).toBe(1);
    expect(s.stats.closed).toBe(1);
    expect(s.stats.score).toBe(inc.outcome?.score);
    expect(E.selectors.queue(s).length).toBe(0);
    expect(Number(s.flags.kmDriven)).toBeGreaterThan(0);
    const evs = E.engine.drainEvents(s).map((e) => e.type);
    expect(evs).toContain('incident_new');
    expect(evs).toContain('unit_arrived');
    expect(evs).toContain('incident_closed');
  });

  it('query beat: correct vs wrong answer changes success', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_query');
    dispatchBest(E, s, inc);
    expect(stepUntil(E, s, () => E.selectors.pendingRadio(s).some((m) => m.kind === 'query'), 60)).toBe(true);
    const msg = E.selectors.pendingRadio(s).find((m) => m.kind === 'query')!;
    expect(msg.replies!.map((r) => r.id)).toEqual(['clean', 'wanted', 'missing', 'restraining', 'nolicense', 'weapon', 'probation', 'notfound']);
    const suspect = s.persons[inc.persons.find((p) => p.role === 'suspect')!.personId];
    expect(msg.text.et).toContain(suspect.idcode);
    const a = JSON.parse(JSON.stringify(s)) as SimState;
    const b = JSON.parse(JSON.stringify(s)) as SimState;
    E.commands.replyRadio(a, msg.id, 'wanted');
    E.commands.replyRadio(b, msg.id, 'clean');
    const ia = a.incidents[inc.id];
    const ib = b.incidents[inc.id];
    expect(ia.effects.success).toBeCloseTo(0.15);
    expect(ib.effects.success).toBeCloseTo(-0.2);
    expect(a.stats.repliesCorrect).toBe(1);
    expect(b.stats.repliesWrong).toBe(1);
    // The crew acts on the answer: nobody knows yet that it was wrong (src/sim/fallout.ts).
    expect(b.trust).toBe(a.trust);
    expect(b.fallout?.map((f) => f.kind)).toEqual(['missed_wanted']);
    expect(a.fallout ?? []).toEqual([]);
    expect(E.selectors.pendingRadio(a).length).toBe(0);
    stepUntil(E, a, () => ia.state === 'closed', 90);
    stepUntil(E, b, () => ib.state === 'closed', 90);
    expect(ia.outcome!.success).toBeGreaterThan(ib.outcome!.success);
    expect(ia.outcome!.arrests).toBeGreaterThanOrEqual(1);
    // The warrant was missed (the incident's own outcome may still end in an arrest); the shift review counts the
    // wrong answer at the latest.
    expect(ia.effects.arrests).toBe(1);
    expect(ib.effects.arrests).toBe(0);
    E.engine.finalizeShift(a);
    E.engine.finalizeShift(b);
    expect(ia.outcome!.breakdown.decisions).toBeGreaterThan(ib.outcome!.breakdown.decisions);
  });

  /** A t_query shift with the crew's query on the air (the suspect is wanted). */
  function queryOnAir(over: Partial<NewShiftOptions> = {}) {
    const s = quiet(E, over);
    const inc = spawn(E, s, 't_query');
    dispatchBest(E, s, inc);
    expect(stepUntil(E, s, () => E.selectors.pendingRadio(s).some((m) => m.kind === 'query'), 60)).toBe(true);
    const msg = E.selectors.pendingRadio(s).find((m) => m.kind === 'query')!;
    return { s, inc, msg };
  }

  it('a wrong answer goes unnoticed on the air and comes out later (fallout)', () => {
    const { s, inc, msg } = queryOnAir();
    const radioBefore = s.radio.length;
    const trust0 = s.trust;
    E.commands.replyRadio(s, msg.id, 'clean');
    // The crew acts on it: JK's answer and the crew's "copy, clean", no "the data does not match".
    const said = s.radio.slice(radioBefore).map((m) => m.text.et).join(' | ');
    expect(said).not.toMatch(/ei klapi|vale info|andmed erinevad/);
    expect(s.trust).toBe(trust0);
    const f = s.fallout![0];
    expect(f).toMatchObject({ kind: 'missed_wanted', said: 'clean', truth: 'wanted', stage: 'hidden' });
    // Make it come out in a minute, with no crew re-check.
    f.catchAt = undefined;
    f.revealAt = s.now + MIN;
    E.engine.drainEvents(s);
    E.engine.step(s, 2 * MIN);
    expect(f.stage).toBe('revealed');
    expect(f.penalty).toBeGreaterThan(0);
    expect(s.trust).toBeLessThan(trust0);
    const told = s.radio.find((m) => m.from === 'VALVEKORRAPIDAJA');
    expect(told?.incidentId).toBe(inc.id);
    expect(told?.text.et).toContain('tagaotsitav');
    expect(E.engine.drainEvents(s).map((e) => e.type)).toContain('complaint');
    expect(inc.beats.find((b) => b.radioId === msg.id)?.revealed).toBe(true);
  });

  it('a complaint follows an unfounded detention and body cameras halve its cost', () => {
    const run = (bodycam: boolean) => {
      const { s, msg } = queryOnAir();
      if (bodycam) s.flags['upg:bodycam'] = true;
      E.commands.replyRadio(s, msg.id, 'clean');
      const f = s.fallout![0];
      // The same machinery as an unfounded detention: force the timings.
      f.kind = 'unfounded_detention';
      f.catchAt = undefined;
      f.revealAt = s.now + MIN;
      f.complaintAt = s.now + 3 * MIN;
      E.engine.step(s, 5 * MIN);
      return { s, f };
    };
    const plain = run(false);
    expect(plain.f.complained).toBe(true);
    expect(plain.s.stats.complaints).toBe(1);
    expect(plain.s.radio.some((m) => m.from === 'ARESTIMAJA')).toBe(true);
    expect(plain.s.radio.some((m) => m.from === 'SISEKONTROLL')).toBe(true);
    const cam = run(true);
    expect(cam.f.trust).toBeLessThan(plain.f.trust);
  });

  it('JK can correct a wrong answer in time ("Parandus!") and it costs only a little', () => {
    const { s, inc, msg } = queryOnAir();
    const ok = JSON.parse(JSON.stringify(s)) as SimState;
    E.commands.replyRadio(ok, msg.id, 'wanted');
    E.commands.replyRadio(s, msg.id, 'clean');
    expect(E.commands.canCorrectQuery(s, s.radio.find((m) => m.id === msg.id)!)).toBe(true);
    E.engine.step(s, MIN);
    E.commands.replyRadio(s, msg.id, 'wanted');
    expect(s.fallout ?? []).toEqual([]);
    expect(s.stats).toMatchObject({ repliesCorrect: 1, repliesWrong: 0, repliesCorrected: 1 });
    expect(inc.effects.success).toBeCloseTo(0.15);
    expect(inc.effects.arrests).toBe(1);
    expect(s.radio.some((m) => m.from === 'JK' && m.text.et.startsWith('Parandus!'))).toBe(true);
    // Correcting the same answer again changes nothing.
    const n = s.radio.length;
    E.commands.replyRadio(s, msg.id, 'wanted');
    expect(s.radio.length).toBe(n);
    const io = ok.incidents[inc.id];
    stepUntil(E, s, () => inc.state === 'closed', 90);
    stepUntil(E, ok, () => io.state === 'closed', 90);
    E.engine.finalizeShift(s);
    E.engine.finalizeShift(ok);
    expect(inc.outcome!.breakdown.decisions).toBe(io.outcome!.breakdown.decisions - 2);
  });

  it('a correction is refused after the window and once it is out', () => {
    const { s, inc, msg } = queryOnAir();
    E.commands.replyRadio(s, msg.id, 'clean');
    const m = s.radio.find((x) => x.id === msg.id)!;
    const b = inc.beats.find((x) => x.radioId === msg.id)!;
    b.answeredAt = s.now - 11 * MIN;
    expect(E.commands.canCorrectQuery(s, m)).toBe(false);
    E.commands.replyRadio(s, msg.id, 'wanted');
    expect(b.answer).toBe('clean');
    b.answeredAt = s.now;
    s.fallout![0].stage = 'revealed';
    expect(E.commands.canCorrectQuery(s, m)).toBe(false);
  });

  it('in the tutorial the crew re-checks a wrong answer at once', () => {
    const { s, msg } = queryOnAir({ mode: 'tutorial' });
    E.commands.replyRadio(s, msg.id, 'clean');
    E.engine.step(s, 5_000);
    expect(s.fallout![0].stage).toBe('caught');
    expect(s.radio.some((m) => /kontrollisime tahvlist/.test(m.text.et))).toBe(true);
  });

  it('the end of the shift settles what was still to come out', () => {
    const { s, inc, msg } = queryOnAir();
    E.commands.replyRadio(s, msg.id, 'clean');
    const f = s.fallout![0];
    f.catchAt = undefined;
    f.revealAt = s.now + 600 * MIN;
    stepUntil(E, s, () => inc.state === 'closed', 90);
    const before = inc.outcome!.breakdown.decisions;
    E.engine.finalizeShift(s);
    expect(f.stage).toBe('revealed');
    expect(f.late).toBe(true);
    expect(inc.outcome!.breakdown.decisions).toBe(before - 7);
    // Idempotent.
    const p = f.penalty;
    E.engine.finalizeShift(s);
    expect(f.penalty).toBe(p);
    expect(inc.outcome!.breakdown.decisions).toBe(before - 7);
  });

  it('vehicle query uses the vehicle reply set and knows a stolen car', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_vquery');
    dispatchBest(E, s, inc);
    expect(stepUntil(E, s, () => E.selectors.pendingRadio(s).some((m) => m.kind === 'query'), 60)).toBe(true);
    const msg = E.selectors.pendingRadio(s).find((m) => m.kind === 'query')!;
    expect(msg.replies!.map((r) => r.id)).toContain('stolen');
    expect(msg.text.et).toContain(inc.vehicles[0].plate);
    const v = s.vehicles[inc.vehicles[0].plate];
    expect(v.flags.stolen).toBeTruthy();
    // The stolen car belongs to someone else than the driver.
    const driver = inc.persons.find((p) => p.role === 'driver')!.personId;
    expect(v.ownerId).not.toBe(driver);
    E.commands.replyRadio(s, msg.id, 'stolen');
    expect(s.stats.repliesCorrect).toBe(1);
  });

  it('query timeout: slow self-check without MDT, no penalty with MDT', () => {
    for (const mdt of [false, true]) {
      const s = quiet(E, { upgrades: mdt ? ['mdt'] : [] });
      const inc = spawn(E, s, 't_query');
      dispatchBest(E, s, inc);
      stepUntil(E, s, () => E.selectors.pendingRadio(s).some((m) => m.kind === 'query'), 60);
      stepUntil(E, s, () => inc.beats[0].status !== 'active', 10);
      if (mdt) {
        expect(inc.beats[0].status).toBe('done');
        expect(s.stats.beatsMissed).toBe(0);
        expect(inc.effects.success).toBe(0);
      } else {
        expect(inc.beats[0].status).toBe('failed');
        expect(s.stats.beatsMissed).toBe(1);
        expect(inc.effects.time).toBe(8);
        expect(inc.effects.success).toBeCloseTo(-0.05);
      }
    }
  });

  it('backup beat: timeout applies failEffects, dispatching in time succeeds', () => {
    const coord: [number, number] = [24.756, 59.439];
    // Timeout.
    const s = quiet(E);
    const inc = spawn(E, s, 't_backup', coord);
    expect(inc.location.placeKind).toBe('bar');
    dispatchBest(E, s, inc);
    expect(stepUntil(E, s, () => inc.beats[0].status === 'active', 60)).toBe(true);
    expect(E.selectors.backupNeeded(s, inc)).toBe(true);
    expect(E.selectors.queue(s)[0].id).toBe(inc.id);
    expect(E.selectors.workPaused(s, inc)).toBe('backup');
    const trust0 = s.trust;
    const work0 = inc.workDone;
    E.engine.step(s, 2 * MIN);
    expect(inc.workDone).toBe(work0);
    E.engine.step(s, 2 * MIN);
    expect(inc.beats[0].status).toBe('failed');
    expect(inc.effects.success).toBeCloseTo(-0.3);
    expect(s.trust).toBeCloseTo(trust0 - 6, 5);
    expect(s.stats.beatsMissed).toBe(1);
    // Success.
    const s2 = quiet(E);
    const inc2 = spawn(E, s2, 't_backup', coord);
    dispatchBest(E, s2, inc2);
    stepUntil(E, s2, () => inc2.beats[0].status === 'active', 60);
    const recs = E.selectors.recommendUnits(s2, inc2.id);
    expect(recs[0].fit === 'ideal' || recs[0].fit === 'need').toBe(true);
    E.commands.dispatchUnits(s2, inc2.id, [recs[0].unit.id]);
    expect(inc2.beats[0].status).toBe('done');
    expect(inc2.effects.success).toBeCloseTo(0.1);
    expect(E.selectors.workPaused(s2, inc2)).toBe('backup');
    expect(stepUntil(E, s2, () => inc2.state === 'closed', 90)).toBe(true);
    expect(inc2.outcome!.breakdown.resources).toBe(15);
  });

  it('choice beat: reply applies option effects, timeout applies the default', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_choice');
    // Domestic: partner shares the household; restraining order protects the victim.
    const victim = s.persons[inc.persons.find((p) => p.role === 'victim')!.personId];
    const suspect = s.persons[inc.persons.find((p) => p.role === 'suspect')!.personId];
    expect(suspect.flags.restrainingOrder?.protectedName).toBe(`${victim.firstName} ${victim.lastName}`);
    expect(suspect.address).toBe(victim.address);
    dispatchBest(E, s, inc);
    expect(stepUntil(E, s, () => E.selectors.pendingRadio(s).some((m) => m.kind === 'choice'), 60)).toBe(true);
    const msg = E.selectors.pendingRadio(s).find((m) => m.kind === 'choice')!;
    expect(msg.replies!.map((r) => r.id)).toEqual(['wait', 'go']);
    const t = JSON.parse(JSON.stringify(s)) as SimState;
    E.commands.replyRadio(s, msg.id, 'wait');
    expect(inc.effects.success).toBeCloseTo(0.1);
    expect(inc.beats[0].correct).toBe(true);
    const it2 = t.incidents[inc.id];
    stepUntil(E, t, () => it2.beats[0].status !== 'active', 10);
    expect(it2.beats[0].answer).toBe('go');
    expect(it2.effects.success).toBeCloseTo(-0.1);
    expect(it2.effects.risk).toBeGreaterThanOrEqual(0.1);
    expect(t.stats.beatsMissed).toBe(1);
  });

  it('transport beat: unit drives to the arrest house, does paperwork, becomes available', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_transport');
    const [uid] = dispatchBest(E, s, inc);
    const u = s.units[uid];
    expect(stepUntil(E, s, () => inc.state === 'closed', 120)).toBe(true);
    expect(inc.outcome!.arrests).toBe(1);
    expect(s.stats.arrests).toBe(1);
    expect(u.status).toBe('transport');
    expect(u.move?.purpose).toBe('transport');
    expect(u.move?.path[u.move.path.length - 1]).toEqual([24.7, 59.42]);
    expect(stepUntil(E, s, () => u.status === 'busy', 60)).toBe(true);
    expect(stepUntil(E, s, () => u.status === 'available', 30)).toBe(true);
    expect(inc.timeline.some((e) => /arestimaja/.test(e.text.et))).toBe(true);
    expect(s.radio.some((m) => m.unitId === uid && m.t > inc.closedAt! - 1)).toBe(true);
  });

  it('agency beat: request through the radio reply, wait for the ambulance', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_agency');
    dispatchBest(E, s, inc);
    expect(inc.state).toBe('dispatched');
    expect(s.units[inc.assigned[0]].move?.siren).toBe(true);
    expect(stepUntil(E, s, () => E.selectors.pendingRadio(s).some((m) => m.kind === 'agency'), 60)).toBe(true);
    const msg = E.selectors.pendingRadio(s).find((m) => m.kind === 'agency')!;
    expect(msg.replies![0].id).toBe('request');
    E.commands.replyRadio(s, msg.id, 'request');
    expect(inc.agencyNeeds[0].requested).toBeDefined();
    expect(inc.beats[0].status).toBe('done');
    expect(s.radio.some((m) => m.from === 'HK' && m.incidentId === inc.id)).toBe(true);
    expect(stepUntil(E, s, () => inc.state === 'closed', 90)).toBe(true);
    expect(inc.agencyNeeds[0].requested!.arrived).toBe(true);
    expect(inc.beats[1].status).toBe('done');
  });

  it('expiry: nobody arrives → closed as expired with a trust penalty', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_simple');
    const t0 = s.trust;
    // 30 min caller patience × CALLER_PATIENCE 1.4 = 42 min.
    E.engine.step(s, 43 * MIN);
    expect(inc.state).toBe('closed');
    expect(inc.closedBy).toBe('expired');
    expect(s.stats.expired).toBe(1);
    expect(s.trust).toBeLessThanOrEqual(t0 - 3);
    expect(inc.outcome?.score).toBe(0);
  });

  it('escalation raises the priority with an HK update', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_escalate');
    E.engine.drainEvents(s);
    E.engine.step(s, 6 * MIN);
    expect(inc.escalated).toBe(true);
    expect(inc.priority).toBe(1);
    expect(inc.truePriority).toBe(1);
    expect(inc.slaMin).toBe(10.5);
    expect(E.engine.drainEvents(s).some((e) => e.type === 'incident_escalated')).toBe(true);
    expect(s.radio.some((m) => m.from === 'HK' && m.incidentId === inc.id)).toBe(true);
    // A unit already en route without lights switches to lights & siren.
    const far = spawn(E, s, 't_escalate', [25.25, 59.2]);
    const [uid] = dispatchBest(E, s, far);
    expect(s.units[uid].move?.siren).toBe(false);
    E.engine.step(s, 6 * MIN);
    expect(far.priority).toBe(1);
    expect(s.units[uid].move?.siren).toBe(true);
  });

  it('zones: ferry adds time, unreachable zones reject road units but not the helicopter', () => {
    const s = quiet(E);
    const rock = spawn(E, s, 't_simple', [23.0, 59.6]);
    expect(rock.location.zone).toBe('kalju');
    const patrol = s.unitOrder.find((id) => s.units[id].callsign === '21')!;
    const r = E.commands.dispatchUnits(s, rock.id, [patrol]);
    expect(r.ok).toBe(false);
    expect(r.reason?.et).toMatch(/kättesaamatu/);
    const heli = s.unitOrder.find((id) => s.units[id].type === 'heli')!;
    const recs = E.selectors.recommendUnits(s, rock.id);
    expect(recs.find((x) => x.unit.id === patrol)?.fit).toBe('unreachable');
    expect(E.commands.dispatchUnits(s, rock.id, [heli]).ok).toBe(true);
    // On-call activation delay.
    expect(s.units[heli].move!.departAt - s.now).toBe(5 * MIN);
    const island = spawn(E, s, 't_simple', [22.51, 58.25]);
    expect(island.location.zone).toBe('saar');
    const p22 = s.unitOrder.find((id) => s.units[id].callsign === '22')!;
    const eta = E.selectors.recommendUnits(s, island.id).find((x) => x.unit.id === p22)!;
    expect(eta.etaMin).toBeGreaterThan(60);
    const local = E.selectors.recommendUnits(s, island.id)[0];
    expect(local.unit.callsign).toBe('S-1');
  });

  it('commands: recall, reassign, breaks, close by referral/prank, director tools', () => {
    const s = quiet(E);
    const a = spawn(E, s, 't_simple');
    const b = spawn(E, s, 't_agency');
    const [uid] = dispatchBest(E, s, a);
    // Reassign the en-route unit to a more urgent event.
    const r = E.commands.dispatchUnits(s, b.id, [uid]);
    expect(r.ok).toBe(true);
    expect(r.reason?.et).toMatch(/lahkus/);
    expect(a.assigned).not.toContain(uid);
    expect(a.state).toBe('queued');
    expect(s.units[uid].incidentId).toBe(b.id);
    E.commands.recallUnit(s, uid);
    expect(b.assigned.length).toBe(0);
    expect(s.units[uid].status).toBe('available');
    // Break.
    E.commands.setUnitBreak(s, uid, true);
    expect(s.units[uid].status).toBe('break');
    const rb = E.commands.dispatchUnits(s, b.id, [uid]);
    expect(rb.ok).toBe(true);
    expect(rb.reason?.et).toMatch(/paus/);
    // Wrong referral of a P1 (its pending prompts disappear with it).
    const t0 = s.trust;
    E.commands.closeIncident(s, b.id, 'phone');
    expect(b.closedBy).toBe('phone');
    expect(s.stats.referralsWrong).toBe(1);
    expect(s.trust).toBeLessThan(t0);
    expect(s.units[uid].status).toBe('available');
    expect(E.selectors.pendingRadio(s).filter((m) => m.incidentId === b.id).length).toBe(0);
    // Correct prank close of an easter egg.
    const e = spawn(E, s, 't_easter');
    E.commands.closeIncident(s, e.id, 'prank');
    expect(s.stats.referralsCorrect).toBe(1);
    expect(e.outcome!.score).toBeGreaterThan(80);
    // Director.
    const d = E.commands.directorSpawn(s, { templateId: 't_simple', coord: [24.74, 59.43], priority: 1, summary: { et: 'Film', en: 'Film' } });
    expect(s.incidents[d].priority).toBe(1);
    expect(s.incidents[d].summary.et).toBe('Film');
    expect(s.incidents[d].source).toBe('director');
    expect(s.incidents[d].location.address).toMatch(/Pärnu mnt \d+/);
    expect(E.commands.directorSpawn(s, { templateId: 'nope' })).toBe('');
    E.commands.directorRadio(s, '21', { et: 'Test', en: 'Test' }, 'emergency');
    expect(s.radio[s.radio.length - 1].level).toBe('emergency');
    E.commands.directorMoveUnit(s, uid, [24.8, 59.44], { instant: true });
    expect(s.units[uid].pos).toEqual([24.8, 59.44]);
    E.engine.step(s, 60 * MIN);
    expect(s.units[uid].pos).toEqual([24.8, 59.44]);
  });

  it('officer injury creates an officer-down follow-up; the unit goes off duty after', () => {
    let done = false;
    for (let seed = 1; seed < 40 && !done; seed++) {
      const s = quiet(E, { seed });
      const inc = spawn(E, s, 't_armed', [24.84, 59.437]);
      inc.effects.risk = 100;
      dispatchBest(E, s, inc, 3);
      stepUntil(E, s, () => inc.state === 'closed', 120);
      if (!inc.outcome?.officerInjured) continue;
      done = true;
      expect(s.stats.officerInjuries).toBe(1);
      const follow = Object.values(s.incidents).find((i) => i.templateId === 'sys:officer_down')!;
      expect(follow).toBeDefined();
      expect(follow.priority).toBe(1);
      const victim = Object.values(s.units).find((u) => u.status === 'emergency')!;
      expect(victim).toBeDefined();
      expect(victim.crew.some((o) => o.injured)).toBe(true);
      expect(s.radio.some((m) => m.level === 'emergency')).toBe(true);
      expect(E.selectors.recommendUnits(s, follow.id).find((r) => r.unit.id === victim.id)?.fit).toBe('unavailable');
      dispatchBest(E, s, follow);
      expect(stepUntil(E, s, () => follow.state === 'closed', 120)).toBe(true);
      expect(victim.status).toBe('offduty');
    }
    expect(done).toBe(true);
  });

  it('{place} falls back to a place-kind label; alarm/anpr tags set the source; missing reply ranks after wanted', async () => {
    const { T_SIMPLE } = await import('./fixtures/templates');
    const s = quiet(E);
    const street = spawn(E, s, 't_simple', [24.74, 59.43]);
    expect(street.location.placeName).toBeUndefined();
    expect(E.incidents.incidentVars(s, street).place).toEqual({ et: 'Tänav', en: 'Street' });
    const bar = spawn(E, s, 't_backup', [24.756, 59.439]);
    expect(E.incidents.incidentVars(s, bar).place).toBe('Pubi Vana Kass');
    expect(E.spawner.createIncident(s, { ...T_SIMPLE, id: 'x_alarm', tags: ['alarm'] }).source).toBe('alarm');
    expect(E.spawner.createIncident(s, { ...T_SIMPLE, id: 'x_anpr', tags: ['anpr'] }).source).toBe('anpr');
    expect(E.spawner.createIncident(s, T_SIMPLE).source).toBe('hk');
    const p = Object.values(s.persons).find((x) => !x.id.startsWith('legend-') && !x.flags.wanted)!;
    p.flags.missing = { since: '2026-10-16', text: { et: 'Kadunud', en: 'Missing' } };
    expect(E.incidents.expectedReply(s, { personId: p.id })).toBe('missing');
    p.flags.wanted = { reason: { et: 'x', en: 'x' }, since: '2026-01-01', dangerous: false, authority: 'Harju Maakohus' };
    expect(E.incidents.expectedReply(s, { personId: p.id })).toBe('wanted');
  });

  it('abandoned incident (units recalled after arrival) lapses after 45 min', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_simple');
    const [uid] = dispatchBest(E, s, inc);
    stepUntil(E, s, () => inc.state === 'onscene', 60);
    E.commands.recallUnit(s, uid);
    expect(inc.assigned.length).toBe(0);
    expect(inc.state).toBe('queued');
    E.engine.step(s, 44 * MIN);
    expect(inc.state).toBe('queued');
    E.engine.step(s, 2 * MIN);
    expect(inc.closedBy).toBe('expired');
  });

  it('abandoned vs expired: the wording says units left, not that nobody came; open beats are closed', () => {
    // Abandoned: the unit arrived, was recalled before the query beat ran, nobody came back.
    const s = quiet(E);
    const inc = spawn(E, s, 't_query');
    const [uid] = dispatchBest(E, s, inc);
    expect(stepUntil(E, s, () => inc.state === 'onscene', 60)).toBe(true);
    expect(inc.beats.some((b) => b.status === 'pending' || b.status === 'active')).toBe(true);
    E.commands.recallUnit(s, uid);
    const hk0 = s.radio.filter((m) => m.from === 'HK').length;
    const t0 = s.trust;
    E.engine.step(s, 46 * MIN);
    expect(inc.state).toBe('closed');
    expect(inc.closedBy).toBe('expired');
    expect(s.stats.expired).toBe(1);
    expect(s.trust).toBeLessThan(t0);
    expect(inc.outcome?.id).toBe('abandoned');
    expect(inc.outcome?.text.et).toMatch(/pooleli/);
    expect(inc.outcome?.text.et).not.toMatch(/ei jõudnud kohale/);
    const texts = inc.timeline.map((e) => e.text.et).join(' | ');
    expect(texts).toMatch(/jäi pooleli/);
    expect(texts).not.toMatch(/keegi ei jõudnud kohale/);
    expect(s.radio.filter((m) => m.from === 'HK').length).toBe(hk0);
    expect(inc.beats.every((b) => b.status !== 'pending' && b.status !== 'active')).toBe(true);
    // Expired: nobody ever arrived, the old wording stays.
    const s2 = quiet(E);
    const inc2 = spawn(E, s2, 't_query');
    expect(stepUntil(E, s2, () => inc2.state === 'closed', 240, MIN)).toBe(true);
    expect(inc2.closedBy).toBe('expired');
    expect(inc2.outcome?.id).toBe('expired');
    expect(inc2.timeline.some((e) => /keegi ei jõudnud kohale/.test(e.text.et))).toBe(true);
    expect(inc2.beats.every((b) => b.status === 'skipped')).toBe(true);
  });

  it('radio prompts closed by the engine show no raw id: answeredReply is null for a timeout', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_query');
    dispatchBest(E, s, inc);
    expect(stepUntil(E, s, () => E.selectors.pendingRadio(s).some((m) => m.kind === 'query'), 60)).toBe(true);
    const msg = E.selectors.pendingRadio(s).find((m) => m.kind === 'query')!;
    expect(E.data.answeredReply(msg)).toBeNull();
    stepUntil(E, s, () => inc.beats[0].status !== 'active', 10);
    expect(msg.answered).toBe('timeout');
    expect(E.data.answeredReply(msg)).toBeNull();
    // A real reply is shown with its label.
    const s2 = quiet(E);
    const inc2 = spawn(E, s2, 't_query');
    dispatchBest(E, s2, inc2);
    stepUntil(E, s2, () => E.selectors.pendingRadio(s2).some((m) => m.kind === 'query'), 60);
    const msg2 = E.selectors.pendingRadio(s2).find((m) => m.kind === 'query')!;
    E.commands.replyRadio(s2, msg2.id, msg2.replies![0].id);
    expect(E.data.answeredReply(msg2)?.id).toBe(msg2.replies![0].id);
  });

  // ── Recommendations / D key ────────────────────────────────────────────────

  /** Park every mainland ground unit except `keep` far away in Külaküla (held there). */
  function parkFar(s: SimState, keep: string[] = []): void {
    for (const id of s.unitOrder) {
      const u = s.units[id];
      if (u.zone !== 'mainland' || u.type === 'heli' || keep.includes(u.callsign)) continue;
      E.commands.directorMoveUnit(s, id, [25.25, 59.2], { instant: true });
    }
  }
  const unitId = (s: SimState, callsign: string) => s.unitOrder.find((id) => s.units[id].callsign === callsign)!;

  it('D key: a close crew on a less urgent job beats a free crew far away', () => {
    const s = quiet(E);
    parkFar(s, ['21']);
    const near = unitId(s, '21');
    E.commands.directorMoveUnit(s, near, [24.84, 59.437], { instant: true });
    const low = E.commands.directorSpawn(s, { templateId: 't_simple', coord: [24.86, 59.44], priority: 4 });
    expect(E.commands.dispatchUnits(s, low, [near]).ok).toBe(true);
    const p1 = E.commands.directorSpawn(s, { templateId: 't_simple', coord: [24.84, 59.437], priority: 1 });
    const recs = E.selectors.recommendUnits(s, p1);
    const free = recs.find((r) => r.unit.status === 'available' && r.unit.type === 'patrol' && r.unit.zone === 'mainland')!;
    expect(free.etaMin).toBeGreaterThan(15);
    expect(recs[0].unit.id).toBe(near);
    expect(recs[0].unit.status).toBe('enroute');
    expect(recs[0].fit).toBe('need');
    const best = E.data.bestFor(recs)!;
    expect(best.unit.id).toBe(near);
    const r = E.commands.dispatchUnits(s, p1, [best.unit.id]);
    expect(r.ok).toBe(true);
    expect(r.reason?.et).toMatch(/lahkus/);
    // The reverse never happens: nothing is pulled off a more urgent event.
    const p4 = E.commands.directorSpawn(s, { templateId: 't_simple', coord: [24.84, 59.437], priority: 4 });
    expect(E.selectors.recommendUnits(s, p4).find((x) => x.unit.id === near)?.fit).toBe('unavailable');
  });

  it('D key: an ideal-only type (helicopter) never outranks a unit that covers the need', () => {
    const s = quiet(E);
    const heli = s.unitOrder.find((id) => s.units[id].type === 'heli')!;
    const inc = spawn(E, s, 't_simple', [24.8, 59.415]); // next to the air base
    inc.ideal = [{ type: 'heli', count: 1 }];
    const recs = E.selectors.recommendUnits(s, inc.id);
    const h = recs.find((r) => r.unit.id === heli)!;
    expect(h.fit).toBe('weak');
    expect(h.reason?.et).toMatch(/ei kata põhivajadust/);
    expect(recs[0].fit).toBe('need');
    expect(E.units.typeFits('patrol', recs[0].unit.type)).toBe(true);
    const best = E.data.bestFor(recs)!;
    expect(best.unit.type).not.toBe('heli');
    E.commands.dispatchUnits(s, inc.id, [best.unit.id]);
    // Need covered: now the helicopter is the ideal extra and the D key offers it.
    const after = E.selectors.recommendUnits(s, inc.id);
    expect(after[0].unit.id).toBe(heli);
    expect(after[0].fit).toBe('ideal');
    expect(E.data.bestFor(after)?.unit.id).toBe(heli);
  });

  it('D key: nothing is sent automatically once the need is met or when only specialists remain', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_simple');
    const first = E.data.bestFor(E.selectors.recommendUnits(s, inc.id))!;
    expect(['ideal', 'need']).toContain(first.fit);
    E.commands.dispatchUnits(s, inc.id, [first.unit.id]);
    const after = E.selectors.recommendUnits(s, inc.id);
    const weak = after.filter((r) => r.fit === 'weak');
    expect(weak.length).toBeGreaterThan(0);
    expect(weak.every((r) => r.manual)).toBe(true);
    expect(after.find((r) => r.unit.type === 'heli')?.fit).toBe('weak');
    expect(E.data.bestFor(after)).toBeUndefined();
    // Every mainland ground unit busy: the on-call helicopter and the island crew stay hand-pick only.
    const s2 = quiet(E);
    for (const id of s2.unitOrder) {
      const u = s2.units[id];
      if (u.type !== 'heli' && u.zone === 'mainland') E.units.setStatus(s2, u, 'onscene');
    }
    const inc2 = spawn(E, s2, 't_simple');
    const recs2 = E.selectors.recommendUnits(s2, inc2.id);
    const heli = recs2.find((r) => r.unit.type === 'heli')!;
    expect(heli.fit).toBe('weak');
    expect(heli.manual).toBe(true);
    const island = recs2.find((r) => r.unit.callsign === 'S-1')!;
    expect(island.fit).toBe('weak');
    expect(island.manual).toBe(true);
    expect(island.reason?.et).toMatch(/praam/);
    expect(E.data.bestFor(recs2)).toBeUndefined();
    // The player can still send them by hand.
    expect(E.commands.dispatchUnits(s2, inc2.id, [island.unit.id]).ok).toBe(true);
  });

  it('ferry: only a P1 on an island with no local crew free gets a mainland crew automatically', () => {
    const s = quiet(E);
    const s1 = unitId(s, 'S-1');
    E.units.setStatus(s, s.units[s1], 'onscene');
    const p3 = E.commands.directorSpawn(s, { templateId: 't_simple', coord: [22.51, 58.25], priority: 3 });
    expect(s.incidents[p3].location.zone).toBe('saar');
    const recs3 = E.selectors.recommendUnits(s, p3);
    expect(recs3.filter((r) => r.unit.type === 'patrol' && r.fit !== 'unavailable').every((r) => r.fit === 'weak' && r.manual)).toBe(true);
    expect(E.data.bestFor(recs3)).toBeUndefined();
    const p1 = E.commands.directorSpawn(s, { templateId: 't_simple', coord: [22.51, 58.25], priority: 1 });
    const best = E.data.bestFor(E.selectors.recommendUnits(s, p1))!;
    expect(best.unit.zone).toBe('mainland');
    expect(best.fit).toBe('need');
    expect(best.etaMin).toBeGreaterThan(60);
    expect(best.reason?.et).toMatch(/Praamiga/);
    // With the island crew free again it is the pick, and mainland crews are hand-pick only.
    E.units.setStatus(s, s.units[s1], 'available');
    const recs1 = E.selectors.recommendUnits(s, p1);
    expect(E.data.bestFor(recs1)?.unit.id).toBe(s1);
    expect(recs1.filter((r) => r.unit.zone === 'mainland' && r.unit.type === 'patrol').every((r) => r.fit === 'weak' && r.manual)).toBe(true);
  });

  it('zones: mid-crossing a unit is where it is (ETA from its position, ferry charged on the way back)', () => {
    const s = quiet(E);
    const s1 = s.units[unitId(s, 'S-1')];
    const a = spawn(E, s, 't_simple', [24.84, 59.437]);
    expect(E.commands.dispatchUnits(s, a.id, [s1.id]).ok).toBe(true);
    const total = (s1.move!.arriveAt - s.now) / MIN;
    expect(total).toBeGreaterThan(60);
    E.engine.step(s, Math.round(total * 0.95) * MIN);
    expect(s1.status).toBe('enroute');
    expect(E.units.unitZoneNow(s, s1)).toBe('mainland');
    const here = E.commands.directorSpawn(s, { templateId: 't_simple', coord: E.units.unitPosAt(s1, s.now).pos, priority: 1 });
    const r = E.selectors.recommendUnits(s, here).find((x) => x.unit.id === s1.id)!;
    expect(r.etaMin).toBeLessThan(5);
    // Recalled now, the trip home to the island includes the ferry.
    E.commands.recallUnit(s, s1.id);
    expect(s1.zone).toBe('mainland');
    expect((s1.move!.arriveAt - s.now) / MIN).toBeGreaterThan(60);
  });

  it('arrest transport on an island goes to the local holding cells when there are any', () => {
    const region = E.selectors.getRegion(quiet(E));
    expect(E.units.arrestHouse(quiet(E), 'saar')?.id).toBe('st_arrest'); // no local cells: the arrest house
    const cells = { id: 'st_saar_cells', name: { et: 'Saare arestikambrid', en: 'Island holding cells' }, short: 'Saare AK', kind: 'arrest' as const, city: 'Saarelinn', address: 'Transvaali tn 58', coord: [22.502, 58.252] as [number, number], zone: 'saar' };
    region.stations.push(cells);
    try {
      const s = quiet(E);
      expect(E.units.arrestHouse(s, 'saar')?.id).toBe('st_saar_cells');
      expect(E.units.arrestHouse(s, 'mainland')?.id).toBe('st_arrest');
      expect(E.units.arrestHouse(s)?.id).toBe('st_arrest');
      const inc = spawn(E, s, 't_transport', [22.51, 58.25]);
      const u = s.units[unitId(s, 'S-1')];
      expect(E.commands.dispatchUnits(s, inc.id, [u.id]).ok).toBe(true);
      expect(stepUntil(E, s, () => inc.state === 'closed', 180)).toBe(true);
      expect(u.status).toBe('transport');
      expect(u.move?.path[u.move.path.length - 1]).toEqual(cells.coord);
      expect((u.move!.arriveAt - s.now) / MIN).toBeLessThan(15);
    } finally {
      region.stations.splice(region.stations.indexOf(cells), 1);
    }
  });

  it('a unit still on a pursuit leg after the pursuit ended settles on arrival instead of staying en route', () => {
    const s = quiet(E);
    const inc = spawn(E, s, 't_simple');
    const [uid] = dispatchBest(E, s, inc);
    const u = s.units[uid];
    const heli = s.units[s.unitOrder.find((id) => s.units[id].type === 'heli')!];
    expect(E.commands.dispatchUnits(s, inc.id, [heli.id]).ok).toBe(true);
    inc.pursuit = { suspectPos: [24.83, 59.43], heading: 0, speedKmh: 90, startedAt: s.now, risk: 0, pressure: 0, heli: true, spikes: false, trail: [], ended: 'terminated' };
    E.units.moveUnit(s, u, [24.83, 59.43], 'pursuit', true);
    E.units.moveUnit(s, heli, [24.83, 59.43], 'pursuit', true);
    expect(stepUntil(E, s, () => u.move?.purpose !== 'pursuit' && heli.move?.purpose !== 'pursuit', 30)).toBe(true);
    expect(u.status).toBe('onscene');
    expect(heli.status).toBe('available');
    expect(inc.assigned).not.toContain(heli.id);
    expect(inc.assigned).toContain(u.id);
  });

  it('spike strips: standard kit in quick play and director mode, a career upgrade otherwise', () => {
    expect(E.engine.createShift(opts()).flags['upg:spikes']).toBe(true);
    expect(E.engine.createShift(opts({ mode: 'director' })).flags['upg:spikes']).toBe(true);
    expect(E.engine.createShift(opts({ mode: 'career' })).flags['upg:spikes']).toBeUndefined();
    expect(E.engine.createShift(opts({ mode: 'career', upgrades: ['spikes'] })).flags['upg:spikes']).toBe(true);
  });

  it('selectors: progress, live stats, sun, SLA, pending radio', () => {
    const s = quiet(E);
    expect(E.selectors.shiftProgress(s)).toBe(0);
    const inc = spawn(E, s, 't_simple');
    const live = E.selectors.liveStats(s);
    expect(live.open).toBe(1);
    expect(live.unitsTotal).toBe(8);
    expect(live.unitsFree).toBe(8);
    expect(live.avgResponse).toBeNull();
    expect(E.selectors.slaRemainingMin(s, inc)).toBe(inc.slaMin);
    E.engine.step(s, 5 * MIN);
    expect(E.selectors.incidentAgeMin(s, inc)).toBeCloseTo(5);
    expect(E.selectors.slaRemainingMin(s, inc)).toBeCloseTo(inc.slaMin - 5);
    expect(E.selectors.sun(s).isDay).toBe(true);
    expect(E.selectors.getRegion(s).id).toBe('pohja');
    expect(E.selectors.templateOf(s, inc)?.id).toBe('t_simple');
    expect(E.selectors.pendingRadio(s).length).toBe(0);
    expect(E.selectors.shiftProgress(s)).toBeGreaterThan(0);
    const u = s.units[s.unitOrder[0]];
    const p = E.selectors.unitPos(s, u, s.now);
    expect(p.pos.length).toBe(2);
  });

  it('radio phrase bank: ≥ 8 variants per main situation, bilingual, same placeholders', async () => {
    const { RADIO } = await import('@/data/radioPhrases');
    const main = ['dispatch', 'dispatchUrgent', 'ack', 'arrive', 'available', 'breakStart', 'breakEnd', 'transportArrest', 'transportArrive', 'emergency', 'emergencyJK', 'backupArrive', 'agencyArrive', 'agencyRequested', 'hkP1', 'hkEscalate', 'shiftStart', 'shiftEnd', 'recall', 'queryTimeout', 'backupTimeout', 'falseAlarm'];
    for (const k of main) expect(RADIO[k]?.length ?? 0, k).toBeGreaterThanOrEqual(8);
    const ph = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [k, list] of Object.entries(RADIO)) {
      for (const t of list) {
        expect(t.et.length, k).toBeGreaterThan(0);
        expect(t.en.length, k).toBeGreaterThan(0);
        expect(ph(t.et), `${k}: ${t.et}`).toBe(ph(t.en));
      }
    }
  });

  it('JSON round-trip continues identically', () => {
    const a = E.engine.createShift(opts({ seed: 99 }));
    for (let i = 0; i < 30; i++) {
      bot(E, a);
      E.engine.step(a, MIN);
    }
    const b = JSON.parse(JSON.stringify(a)) as SimState;
    for (let i = 0; i < 120; i++) {
      bot(E, a);
      bot(E, b);
      E.engine.step(a, MIN);
      E.engine.step(b, MIN);
      E.engine.drainEvents(a);
      E.engine.drainEvents(b);
    }
    expect(a.stats.incidents).toBeGreaterThan(3);
    expect(canon(b)).toBe(canon(a));
  });

  it('12-hour headless run with an auto-dispatcher reaches ended=true quickly', () => {
    const t0 = performance.now();
    const s = E.engine.createShift(opts({ seed: 2026, difficulty: 'realistic' }));
    let guard = 0;
    while (!s.ended && guard++ < 14 * 60) {
      bot(E, s, 0.7);
      E.engine.step(s, MIN);
      E.engine.drainEvents(s);
    }
    const ms = performance.now() - t0;
    expect(s.ended).toBe(true);
    expect(s.now).toBeLessThanOrEqual(s.endTime + 61 * MIN);
    expect(s.stats.closed).toBeGreaterThan(20);
    expect(s.stats.score).toBeGreaterThan(0);
    expect(s.radio.length).toBeLessThanOrEqual(300);
    expect(ms).toBeLessThan(20_000);
    const rep = E.engine.finalizeShift(s);
    expect(rep.score).toBe(s.stats.score);
    // No unit is left stuck in a transient state attached to a closed incident.
    for (const u of Object.values(s.units)) {
      if (u.status === 'enroute' || u.status === 'onscene') expect(s.incidents[u.incidentId!]?.state).not.toBe('closed');
    }
  });

  it('a whole 12-hour shift stepped with one huge dt stays fast', () => {
    const s = E.engine.createShift(opts({ seed: 5 }));
    const t0 = performance.now();
    E.engine.step(s, 13 * 3_600_000);
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(s.ended).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('engine-core smoke test with real content', () => {
  it('runs 4 hours on the real Põhja prefecture', async (ctx) => {
    vi.resetModules();
    for (const m of MOCKED) vi.doUnmock(m);
    const { REGIONS } = await import('@/data/regions');
    const { TEMPLATES } = await import('@/data/incidents');
    if (!(REGIONS.pohja.roster.length > 0 && TEMPLATES.length > 20)) {
      ctx.skip();
      return;
    }
    const E = await loadModules();
    const s = E.engine.createShift(opts({ seed: 1234, hours: 4 }));
    expect(s.unitOrder.length).toBeGreaterThan(3);
    let copy: SimState | undefined;
    for (let i = 0; i < 4 * 60 + 61 && !s.ended; i++) {
      bot(E, s, 0.8);
      E.engine.step(s, MIN);
      E.engine.drainEvents(s);
      if (i === 90) copy = JSON.parse(JSON.stringify(s)) as SimState;
      if (copy && i > 90 && i <= 150) {
        bot(E, copy, 0.8);
        E.engine.step(copy, MIN);
        E.engine.drainEvents(copy);
        if (i === 150) expect(canon(copy)).toBe(canon(s));
      }
    }
    expect(s.stats.incidents).toBeGreaterThan(3);
    expect(s.stats.closed).toBeGreaterThan(3);
    expect(s.ended).toBe(true);
    const rep = E.engine.finalizeShift(s);
    expect(rep.score).toBeGreaterThanOrEqual(0);
    for (const inc of Object.values(s.incidents)) {
      for (const t of [inc.summary, ...inc.details, ...inc.timeline.map((x) => x.text)]) expect(t.et).not.toMatch(/\{\w+\}|undefined/);
    }
    for (const m of s.radio) expect(m.text.et, m.text.et).not.toMatch(/\{\w+\}|undefined/);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('dispatch recommendations and unit movement with real content', () => {
  let E: Eng;
  let R: typeof import('@/data/regions').REGIONS;
  let P: typeof import('@/sim/pursuit');
  let ready = false;
  beforeAll(async () => {
    vi.resetModules();
    for (const m of MOCKED) vi.doUnmock(m);
    const { REGIONS } = await import('@/data/regions');
    const { TEMPLATES } = await import('@/data/incidents');
    R = REGIONS;
    ready = REGIONS.laane.roster.length > 0 && REGIONS.louna.roster.length > 0 && TEMPLATES.length > 20;
    E = await loadModules();
    P = await import('@/sim/pursuit');
  });

  const night = (regionId: NewShiftOptions['regionId'], seed = 3, hour = 22): SimState => {
    const s = E.engine.createShift(opts({ seed, regionId, mode: 'director', start: Date.UTC(2026, 9, 16, hour - 3, 0) }));
    return s;
  };
  const byCs = (s: SimState, cs: string) => Object.values(s.units).find((u) => u.callsign === cs)!;
  const town = (regionId: NewShiftOptions['regionId'], name: string) => R[regionId].towns.find((t) => t.name === name)!.coord;

  it('Lääne P1 next to a crew driving to a P4: the D key does not pick a free crew an hour away', (ctx) => {
    if (!ready) return ctx.skip();
    const s = night('laane');
    const u21 = byCs(s, 'LÄÄNE 21');
    const low = E.commands.directorSpawn(s, { templateId: 'public_order_garage_noise', coord: town('laane', 'Lihula'), priority: 4 });
    E.commands.dispatchUnits(s, low, [u21.id]);
    E.engine.step(s, MIN);
    const p1 = E.commands.directorSpawn(s, { templateId: 'domestic_knife', coord: E.units.unitPosAt(u21, s.now).pos, priority: 1 });
    const recs = E.selectors.recommendUnits(s, p1);
    const r21 = recs.find((r) => r.unit.id === u21.id)!;
    expect(['ideal', 'need']).toContain(r21.fit);
    expect(recs.indexOf(r21)).toBeLessThan(3);
    const best = E.data.bestFor(recs)!;
    expect(best.etaMin).toBeLessThan(r21.etaMin + 5);
  });

  it('Lõuna: an investigator (ideal only) is not sent before a unit that covers the patrol need', (ctx) => {
    if (!ready) return ctx.skip();
    const s = E.engine.createShift(opts({ seed: 3, regionId: 'louna', mode: 'director', start: Date.UTC(2026, 9, 16, 7, 0) }));
    const crim = Object.values(s.units).find((u) => u.type === 'criminal')!;
    const at = R.louna.stations.find((x) => x.id === crim.stationId)!.coord;
    for (const tid of ['drugs_local_dealers', 'fraud_computer_fraud', 'property_summerhouse_burglaries']) {
      const id = E.commands.directorSpawn(s, { templateId: tid, coord: at });
      expect(id).not.toBe('');
      const recs = E.selectors.recommendUnits(s, id);
      expect(recs.find((r) => r.unit.id === crim.id)?.fit).toBe('weak');
      const best = E.data.bestFor(recs)!;
      expect(best.unit.type).not.toBe('criminal');
      expect(E.units.typeFits('patrol', best.unit.type)).toBe(true);
      expect(E.commands.dispatchUnits(s, id, [best.unit.id]).ok).toBe(true);
      // Patrol need covered: the investigator is now the ideal extra.
      const next = E.data.bestFor(E.selectors.recommendUnits(s, id));
      expect(next?.unit.id).toBe(crim.id);
      expect(next?.fit).toBe('ideal');
    }
  });

  it('Lääne: with the mainland busy, a P3 in Paide does not pull the only Hiiumaa crew over the ferry', (ctx) => {
    if (!ready) return ctx.skip();
    const s = night('laane');
    for (const u of Object.values(s.units)) {
      if (u.zone !== 'mainland' || ['heli', 'boat', 'transport', 'criminal', 'special'].includes(u.type)) continue;
      const id = E.commands.directorSpawn(s, { templateId: 'public_order_garage_noise', coord: u.pos, priority: 2 });
      E.commands.dispatchUnits(s, id, [u.id]);
    }
    E.engine.step(s, MIN);
    const id = E.commands.directorSpawn(s, { templateId: 'public_order_garage_noise', coord: town('laane', 'Paide'), priority: 3 });
    const recs = E.selectors.recommendUnits(s, id);
    const hii = recs.find((r) => r.unit.callsign === 'LÄÄNE 41')!;
    expect(hii.unit.zone).toBe('hiiumaa');
    expect(hii.fit).toBe('weak');
    expect(hii.manual).toBe(true);
    expect(hii.reason?.et).toMatch(/praam/);
    expect(E.data.bestFor(recs)).toBeUndefined();
  });

  it('Lääne: 95 % of the way from Saaremaa to Pärnu the unit is on the mainland (no phantom ferry)', (ctx) => {
    if (!ready) return ctx.skip();
    const s = night('laane');
    const u = byCs(s, 'LÄÄNE 31');
    expect(u.zone).toBe('saaremaa');
    const a = E.commands.directorSpawn(s, { templateId: 'public_order_garage_noise', coord: town('laane', 'Pärnu'), priority: 2 });
    E.commands.dispatchUnits(s, a, [u.id]);
    const total = (u.move!.arriveAt - s.now) / MIN;
    expect(total).toBeGreaterThan(75);
    E.engine.step(s, Math.round(total * 0.95) * MIN);
    const b = E.commands.directorSpawn(s, { templateId: 'domestic_knife', coord: E.units.unitPosAt(u, s.now).pos, priority: 1 });
    const r = E.selectors.recommendUnits(s, b).find((x) => x.unit.id === u.id)!;
    expect(r.etaMin).toBeLessThan(5);
    E.commands.recallUnit(s, u.id);
    expect((u.move!.arriveAt - s.now) / MIN).toBeGreaterThan(75);
  });

  it('boats: no sailing to inland towns or to another water body; coast and own lake are fine', (ctx) => {
    if (!ready) return ctx.skip();
    const s = night('laane', 7, 19);
    const boat = byCs(s, 'LÄÄNE 71');
    const inland = E.commands.directorSpawn(s, { templateId: 'public_order_garage_noise', coord: town('laane', 'Paide') });
    const rec = E.selectors.recommendUnits(s, inland).find((r) => r.unit.id === boat.id)!;
    expect(rec.fit).toBe('unreachable');
    expect(rec.reason?.et).toMatch(/Veesõidukiga/);
    const res = E.commands.dispatchUnits(s, inland, [boat.id]);
    expect(res.ok).toBe(false);
    expect(res.reason?.et).toMatch(/veesõidukiga kättesaamatu/);
    expect(boat.status).toBe('available');
    const beach = R.laane.places.find((p) => p.name === 'Pärnu rand')!;
    const coast = E.commands.directorSpawn(s, { templateId: 'public_order_garage_noise', coord: beach.coord });
    expect(E.selectors.recommendUnits(s, coast).find((r) => r.unit.id === boat.id)?.fit).not.toBe('unreachable');
    // Ida: the Peipsi boat does not cross land to the Gulf of Finland.
    const si = night('ida', 7, 19);
    const ib = Object.values(si.units).find((u) => u.type === 'boat')!;
    const sea = E.commands.directorSpawn(si, { templateId: 'public_order_garage_noise', coord: town('ida', 'Narva-Jõesuu') });
    expect(E.selectors.recommendUnits(si, sea).find((r) => r.unit.id === ib.id)?.fit).toBe('unreachable');
    const peipsi = R.ida.places.find((p) => p.kind === 'beach' && /Peipsi/.test(p.name))!;
    const lake = E.commands.directorSpawn(si, { templateId: 'public_order_garage_noise', coord: peipsi.coord });
    expect(si.incidents[lake].location.placeKind).toBe('beach');
    expect(E.selectors.recommendUnits(si, lake).find((r) => r.unit.id === ib.id)?.fit).not.toBe('unreachable');
  });

  it('Lääne: island arrests use the island holding cells, the mainland keeps Pärnu', (ctx) => {
    if (!ready) return ctx.skip();
    const s = night('laane');
    expect(E.units.arrestHouse(s)?.id).toBe('la-parnu-arest');
    expect(E.units.arrestHouse(s, 'mainland')?.id).toBe('la-parnu-arest');
    expect(E.units.arrestHouse(s, 'saaremaa')?.id).toBe('la-kuressaare-kambrid');
    expect(E.units.arrestHouse(s, 'hiiumaa')?.id).toBe('la-kardla-kambrid');
    expect(E.units.arrestHouse(s, 'kihnu')?.id).toBe('la-parnu-arest');
  });

  it('Lõuna: an arrest far from Tartu goes to the nearest jaoskond, one near Tartu to the prison', (ctx) => {
    if (!ready) return ctx.skip();
    const s = night('louna');
    const far = E.units.custodyDestination(s, town('louna', 'Viljandi'));
    expect(far?.local).toBe(true);
    expect(far?.station.id).toBe('lo-viljandi');
    const near = E.units.custodyDestination(s, town('louna', 'Tartu'));
    expect(near).toEqual({ station: E.units.arrestHouse(s), local: false });
  });

  const pursuitShift = () => E.engine.createShift(opts({ seed: 9, regionId: 'pohja', mode: 'director', start: Date.UTC(2026, 9, 16, 19, 0) }));

  it('pursuit: an off-duty helicopter is not sent', (ctx) => {
    if (!ready) return ctx.skip();
    const s = pursuitShift();
    const heli = Object.values(s.units).find((u) => u.type === 'heli')!;
    E.units.setStatus(s, heli, 'offduty');
    const pat = Object.values(s.units).find((u) => u.type === 'patrol')!;
    const id = E.commands.directorSpawn(s, { templateId: 'traffic_mittepeatumine', coord: pat.pos });
    E.commands.dispatchUnits(s, id, [pat.id]);
    const inc = s.incidents[id];
    P.startPursuit(s, inc, pat.pos);
    E.commands.pursuitAction(s, id, 'heli');
    E.engine.step(s, 3 * MIN);
    expect(inc.assigned).not.toContain(heli.id);
    expect(heli.move).toBeUndefined();
    expect(heli.status).toBe('offduty');
    expect(s.radio.some((m) => m.incidentId === id && /Helikopter ei ole saadaval/.test(m.text.et))).toBe(true);
    expect(s.radio.some((m) => m.unitId === heli.id && /toetage jälitust/.test(m.text.et))).toBe(false);
  });

  it('pursuit: the helicopter is released when the pursuit ends, so the event can still close', (ctx) => {
    if (!ready) return ctx.skip();
    const s = pursuitShift();
    const heli = Object.values(s.units).find((u) => u.type === 'heli')!;
    const pat = Object.values(s.units).find((u) => u.type === 'patrol')!;
    const id = E.commands.directorSpawn(s, { templateId: 'traffic_mittepeatumine', coord: pat.pos });
    E.commands.dispatchUnits(s, id, [pat.id]);
    const inc = s.incidents[id];
    P.startPursuit(s, inc, pat.pos);
    E.commands.pursuitAction(s, id, 'heli');
    expect(inc.assigned).toContain(heli.id);
    E.engine.step(s, 8 * MIN);
    if (!inc.pursuit!.ended) E.commands.pursuitAction(s, id, 'terminate');
    E.engine.step(s, MIN);
    expect(inc.assigned).not.toContain(heli.id);
    expect(heli.incidentId).toBeUndefined();
    expect(heli.status).toBe('available');
    expect(heli.move?.purpose ?? 'none').not.toBe('pursuit');
    // Back at the scene, the ground crew is recalled before finishing: with only the helicopter
    // left it used to hang open forever; now nothing is assigned and it lapses as abandoned.
    E.engine.step(s, 30 * MIN);
    expect(heli.status).not.toBe('enroute');
    expect(inc.state).toBe('onscene');
    expect(inc.firstArrivalAt).toBeDefined();
    E.commands.recallUnit(s, pat.id);
    expect(inc.assigned).toEqual([]);
    expect(stepUntil(E, s, () => inc.state === 'closed', 60, MIN)).toBe(true);
    expect(inc.outcome?.id).toBe('abandoned');
  });
});
