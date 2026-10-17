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

interface Eng {
  engine: EngineMod;
  commands: CommandsMod;
  selectors: SelectorsMod;
  incidents: IncidentsMod;
  spawner: SpawnerMod;
  units: UnitsMod;
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
    expect(ok.notes[0].et).toContain('LEGEND 2025');
    expect(sm.lastName).toContain('ᵛᵉʳᶦᶠᶦᵉᵈ');
    // Bulletins: 2–4 BOLO + päevakäsk + weather.
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
    expect(b.trust).toBeLessThan(a.trust);
    expect(E.selectors.pendingRadio(a).length).toBe(0);
    stepUntil(E, a, () => ia.state === 'closed', 90);
    stepUntil(E, b, () => ib.state === 'closed', 90);
    expect(ia.outcome!.success).toBeGreaterThan(ib.outcome!.success);
    expect(ia.outcome!.breakdown.decisions).toBeGreaterThan(ib.outcome!.breakdown.decisions);
    expect(ia.outcome!.arrests).toBeGreaterThanOrEqual(1);
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
    E.engine.step(s, 31 * MIN);
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
