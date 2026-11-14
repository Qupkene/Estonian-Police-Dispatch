/**
 * Kaamerad (docs/CCTV.md section 6): situationOf reads what a camera needs from a real shift. A crew sent to an
 * incident is coming, then near, then here, then left; other services arrive; a pursuit takes the crews away; the
 * outcome and the transports show.
 */
import { describe, expect, it } from 'vitest';
import { directorSpawn, dispatchUnits, pursuitAction, recallUnit, requestAgency } from '@/sim/commands';
import { createShift, step } from '@/sim/engine';
import { destination, haversineKm } from '@/sim/geo';
import { startPursuit } from '@/sim/pursuit';
import { startSearch } from '@/sim/search';
import { MIN, tallinnTime } from '@/sim/time';
import type { Incident, NewShiftOptions, SimState, Unit } from '@/sim/types';
import { angleDiff, frameAt, yawOf } from '@/cctv/math';
import { NEAR_S, situationOf } from '@/cctv/situation';
import type { Situation, UnitSit } from '@/cctv/stage';

const OPTS: NewShiftOptions = {
  seed: 410001,
  regionId: 'pohja',
  mode: 'director',
  difficulty: 'normal',
  start: tallinnTime(2026, 10, 23, 19, 0),
  hours: 6,
  playerName: 'Kaamera',
  weather: 'clear',
};

/** Game seconds per real second: the game's slowest clock, so a crew a few kilometres away is not near at once. */
const SPEED = 15;

/** A shift with one incident of a template a few kilometres from a patrol, and that patrol. */
function shiftWith(templateId: string, seed = OPTS.seed, km = 4): { s: SimState; inc: Incident; unit: Unit } {
  const s = createShift({ ...OPTS, seed });
  const unit = Object.values(s.units).find((u) => u.type === 'patrol' && u.status === 'available')!;
  const id = directorSpawn(s, { templateId, coord: destination(unit.pos, km, 70) });
  expect(id).not.toBe('');
  return { s, inc: s.incidents[id], unit };
}

const unitOf = (sit: Situation, id: string): UnitSit | undefined => sit.units.find((u) => u.id === id);

/** Step the game a second at a time until `done`, collecting the states one crew goes through. */
function follow(s: SimState, inc: Incident, unitId: string, done: (sit: Situation) => boolean, maxMin = 240): { states: string[]; sits: Situation[] } {
  const states: string[] = [];
  const sits: Situation[] = [];
  for (let i = 0; i < maxMin * 60; i++) {
    step(s, 1000);
    const sit = situationOf(s, inc, SPEED);
    const st = unitOf(sit, unitId)?.state ?? 'none';
    if (states[states.length - 1] !== st) {
      states.push(st);
      sits.push(sit);
    }
    if (done(sit)) break;
  }
  return { states, sits };
}

describe('cctv situation: what the game says about an incident', () => {
  it('lists nobody before anyone is sent', () => {
    const { s, inc } = shiftWith('public_order_drunk_harassing');
    const sit = situationOf(s, inc, SPEED);
    expect(sit.units).toEqual([]);
    expect(sit.agencies).toEqual([]);
    expect(sit).toMatchObject({ closed: false, pursuit: 'none', searching: false, outcome: null, progress: 0, paused: false });
    expect(situationOf(s, inc, SPEED, true).paused).toBe(true);
  });

  it('a crew sent to an incident is coming, near, here and then left', { timeout: 60_000 }, () => {
    const { s, inc, unit } = shiftWith('public_order_drunk_harassing');
    expect(dispatchUnits(s, inc.id, [unit.id]).ok).toBe(true);
    const first = unitOf(situationOf(s, inc, SPEED), unit.id)!;
    expect(first).toMatchObject({ id: unit.id, type: 'patrol', model: unit.vehicle, state: 'coming', eta: 0, takes: null });
    expect(first.crew).toEqual(unit.crew.map((o) => o.gender));
    // It comes from where it is: towards the west-south-west of the incident (the incident lies at bearing 70 from it).
    const toUnit = yawOf(frameAt(inc.location.coord).toLocal(unit.pos));
    expect(Math.abs(angleDiff(first.from, toUnit))).toBeLessThan(0.02);

    const { states, sits } = follow(s, inc, unit.id, (sit) => sit.closed && unitOf(sit, unit.id)?.state === 'left');
    expect(states).toEqual(['coming', 'near', 'here', 'left']);
    // Near: the last seven real seconds of the drive, counted down in real seconds.
    const near = unitOf(sits[1], unit.id)!;
    expect(near.eta).toBeGreaterThan(NEAR_S - 1.5 / SPEED - 1e-9);
    expect(near.eta).toBeLessThanOrEqual(NEAR_S);
    // Here: on scene, and it came from the same side it was driving up from.
    const here = unitOf(sits[2], unit.id)!;
    expect(s.incidents[inc.id].firstArrivalAt).toBeDefined();
    expect(Math.abs(angleDiff(here.from, near.from))).toBeLessThan(0.05);
    expect(here.eta).toBe(0);
    // Left: the incident closed with an outcome, the work was counted to the end.
    const end = sits[3];
    expect(end.closed).toBe(true);
    expect(end.outcome).not.toBeNull();
    expect(end.outcome!.result).toBe(inc.outcome!.result);
    expect(end.progress).toBeCloseTo(1, 5);
  });

  it('counts the work on scene from 0 to 1', { timeout: 60_000 }, () => {
    const { s, inc, unit } = shiftWith('public_order_drunk_harassing', 410002);
    dispatchUnits(s, inc.id, [unit.id]);
    // The engine's target moves with what the crew finds, so the share may step back a little: it stays in 0..1.
    let last = 0;
    let grew = false;
    for (let i = 0; i < 240 * 60 && inc.state !== 'closed'; i++) {
      step(s, 1000);
      const p = situationOf(s, inc, SPEED).progress;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      if (p > 0.2 && p < 0.9) grew = true;
      last = p;
    }
    expect(grew).toBe(true);
    expect(last).toBeGreaterThan(0.99);
  });

  it('near depends on the speed of the game: the same moment is near at a fast clock and coming at a slow one', () => {
    const { s, inc, unit } = shiftWith('public_order_drunk_harassing');
    dispatchUnits(s, inc.id, [unit.id]);
    const arriveAt = s.units[unit.id].move!.arriveAt;
    // Step to 100 game seconds before the arrival.
    while (arriveAt - s.now > 100_000) step(s, 1000);
    expect(unitOf(situationOf(s, inc, 120), unit.id)!.state).toBe('near');
    expect(unitOf(situationOf(s, inc, 15), unit.id)!.state).toBe('near');
    expect(unitOf(situationOf(s, inc, 2), unit.id)!.state).toBe('coming');
    const near = unitOf(situationOf(s, inc, 15), unit.id)!;
    expect(near.eta).toBeCloseTo((arriveAt - s.now) / 1000 / 15, 6);
    // A speed of nothing (a paused game hands on its last running speed, but be safe) does not divide by zero.
    expect(Number.isFinite(unitOf(situationOf(s, inc, 0), unit.id)!.eta)).toBe(true);
  });

  it('a recalled crew has left, whether it was on its way or on scene', { timeout: 60_000 }, () => {
    const a = shiftWith('public_order_drunk_harassing');
    dispatchUnits(a.s, a.inc.id, [a.unit.id]);
    for (let i = 0; i < 20; i++) step(a.s, 1000);
    recallUnit(a.s, a.unit.id);
    expect(unitOf(situationOf(a.s, a.inc, SPEED), a.unit.id)!.state).toBe('left');

    const b = shiftWith('public_order_drunk_harassing', 410003);
    dispatchUnits(b.s, b.inc.id, [b.unit.id]);
    follow(b.s, b.inc, b.unit.id, (sit) => unitOf(sit, b.unit.id)?.state === 'here');
    expect(unitOf(situationOf(b.s, b.inc, SPEED), b.unit.id)!.state).toBe('here');
    recallUnit(b.s, b.unit.id);
    const sit = situationOf(b.s, b.inc, SPEED);
    expect(unitOf(sit, b.unit.id)).toMatchObject({ state: 'left', takes: null });
    expect(sit.closed).toBe(false);
  });

  it('another service is coming, near and here', { timeout: 60_000 }, () => {
    const { s, inc, unit } = shiftWith('public_order_drunk_harassing');
    dispatchUnits(s, inc.id, [unit.id]);
    requestAgency(s, inc.id, 'kiirabi');
    const seen: string[] = [];
    let nearEta = -1;
    for (let i = 0; i < 90 * 60; i++) {
      step(s, 1000);
      const a = situationOf(s, inc, SPEED).agencies.find((x) => x.agency === 'kiirabi');
      if (!a) break;
      if (seen[seen.length - 1] !== a.state) {
        seen.push(a.state);
        if (a.state === 'near') nearEta = a.eta;
      }
      if (a.state === 'here') break;
    }
    expect(seen).toEqual(['coming', 'near', 'here']);
    expect(nearEta).toBeGreaterThan(NEAR_S - 0.1);
    expect(nearEta).toBeLessThanOrEqual(NEAR_S);
    // A service nobody asked for is not listed.
    expect(situationOf(s, inc, SPEED).agencies.map((x) => x.agency)).toEqual(['kiirabi']);
  });

  it('a service that had not come when the incident closed is not shown driving up afterwards', { timeout: 60_000 }, () => {
    const { s, inc, unit } = shiftWith('public_order_drunk_harassing', 410004);
    dispatchUnits(s, inc.id, [unit.id]);
    follow(s, inc, unit.id, (sit) => unitOf(sit, unit.id)?.state === 'here');
    // The social service takes half an hour and more: the crew is done long before.
    requestAgency(s, inc.id, 'sotsiaal');
    for (let i = 0; i < 300 && inc.state !== 'closed'; i++) step(s, MIN / 2);
    expect(inc.state).toBe('closed');
    for (let i = 0; i < 180; i++) step(s, MIN);
    const a = situationOf(s, inc, SPEED).agencies.find((x) => x.agency === 'sotsiaal')!;
    expect(a.state).toBe('coming');
  });

  it('a pursuit takes the crews away; when it is over they are not here unless they came back', { timeout: 60_000 }, () => {
    const { s, inc, unit } = shiftWith('traffic_mittepeatumine', 9, 0.4);
    dispatchUnits(s, inc.id, [unit.id]);
    expect(situationOf(s, inc, SPEED).pursuit).toBe('none');
    // The story may start the pursuit itself the moment the crew arrives: otherwise start it by hand.
    follow(s, inc, unit.id, (sit) => sit.pursuit !== 'none' || unitOf(sit, unit.id)?.state === 'here', 30);
    if (!inc.pursuit) startPursuit(s, inc, s.units[unit.id].pos);
    let sit = situationOf(s, inc, SPEED);
    expect(sit.pursuit).toBe('on');
    // The engine keeps a pursuing crew's status as it was: its movement says where it is.
    expect(s.units[unit.id].move?.purpose).toBe('pursuit');
    expect(unitOf(sit, unit.id)!.state).toBe('left');
    for (let i = 0; i < 120 && !inc.pursuit!.ended; i++) step(s, 2000);
    if (!inc.pursuit!.ended) pursuitAction(s, inc.id, 'terminate');
    step(s, 1000);
    sit = situationOf(s, inc, SPEED);
    expect(sit.pursuit).toBe('over');
    // Wherever the crew is now, 'here' means standing at the incident's own place.
    for (let i = 0; i < 600 && inc.state !== 'closed'; i++) {
      step(s, 2000);
      const u = s.units[unit.id];
      const st = unitOf(situationOf(s, inc, SPEED), unit.id)!.state;
      if (st === 'here') expect(haversineKm(u.pos, inc.location.coord)).toBeLessThan(0.15);
      if (u.status === 'onscene' && !u.move && haversineKm(u.pos, inc.location.coord) > 0.15) expect(st).toBe('left');
    }
  });

  it('a search is running until it ends', { timeout: 60_000 }, () => {
    const { s, inc, unit } = shiftWith('public_order_drunk_harassing', 410005);
    dispatchUnits(s, inc.id, [unit.id]);
    follow(s, inc, unit.id, (sit) => unitOf(sit, unit.id)?.state === 'here');
    startSearch(s, inc, 0.6);
    expect(inc.search).toBeDefined();
    expect(situationOf(s, inc, SPEED).searching).toBe(true);
    for (let i = 0; i < 400 && inc.state !== 'closed'; i++) step(s, MIN / 2);
    expect(situationOf(s, inc, SPEED).searching).toBe(false);
  });

  it('a crew that drives the arrested to the cells has left with them; one writing its report at the scene is still here', { timeout: 120_000 }, () => {
    // Play real incidents of a shift to their ends and look at what the crews do afterwards.
    let arrests = 0;
    let hospital = 0;
    let paperwork = 0;
    const templates = ['violence_bar_fight_outside', 'traffic_joobes_juhi_kahtlus', 'public_order_drunk_harassing', 'violence_knife_threat', 'property_shoplifting_detained'];
    for (let k = 0; k < 40 && !(arrests && paperwork); k++) {
      const tpl = templates[k % templates.length];
      const s = createShift({ ...OPTS, seed: 410100 + k });
      const patrols = Object.values(s.units).filter((u) => u.type === 'patrol' && u.status === 'available');
      const id = directorSpawn(s, { templateId: tpl, coord: destination(patrols[0].pos, 0.6, 120) });
      if (!id) continue;
      const inc = s.incidents[id];
      dispatchUnits(s, id, patrols.slice(0, 2).map((u) => u.id));
      for (let i = 0; i < 400 && inc.state !== 'closed'; i++) {
        step(s, MIN / 2);
        // Answer whatever the crew asks, so the story goes on.
        for (const m of s.radio) if (m.incidentId === id && m.replies?.length && !m.answered) m.answered = m.replies[0].id;
      }
      if (inc.state !== 'closed') continue;
      const sit = situationOf(s, inc, SPEED);
      expect(sit.closed).toBe(true);
      expect(sit.outcome).toEqual({ result: inc.outcome!.result, arrests: inc.outcome!.arrests, injuries: inc.outcome!.injuries });
      for (const us of sit.units) {
        const u = s.units[us.id];
        if (u.status === 'transport' && u.incidentId === id) {
          expect(us.state).toBe('left');
          if (us.takes === 'arrest') arrests++;
          if (us.takes === 'hospital') hospital++;
          if (inc.outcome!.arrests > 0 && us.takes !== 'hospital') expect(us.takes).toBe('arrest');
        } else if (u.status === 'busy' && u.incidentId === id && !u.move) {
          expect(us).toMatchObject({ state: 'here', takes: null });
          paperwork++;
        } else {
          expect(us).toMatchObject({ state: 'left', takes: null });
        }
      }
    }
    expect(arrests).toBeGreaterThan(0);
    expect(paperwork).toBeGreaterThan(0);
    expect(hospital).toBeGreaterThanOrEqual(0);
  });
});
