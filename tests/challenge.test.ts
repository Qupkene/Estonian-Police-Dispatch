/**
 * Väljakutse lingiga (src/sim/challenge.ts, docs/CHALLENGE.md, 2.38.0): a free fixed-schedule shift gives a setup, the
 * setup plays the same calls for another player whatever either does, and the two results compare.
 */
import { describe, expect, it } from 'vitest';
import {
  challengeCodeOf,
  challengeShiftOptions,
  challengeStats,
  markChallenge,
  setupOf,
  shiftWhen,
  type ShiftSetup,
} from '@/sim/challenge';
import { acknowledge, answerCall, dispatchUnits, endCall } from '@/sim/commands';
import { markDaily } from '@/sim/daily';
import { createShift, finalizeShift, step } from '@/sim/engine';
import { queue, recommendUnits } from '@/sim/selectors';
import { MIN, tallinnTime } from '@/sim/time';
import type { NewShiftOptions, ShiftReport, SimState } from '@/sim/types';

const OPTS: NewShiftOptions = {
  seed: 777001,
  regionId: 'louna',
  mode: 'free',
  difficulty: 'veteran',
  start: tallinnTime(2026, 10, 23, 19, 0),
  hours: 4,
  playerName: 'Magnus',
  weather: 'rain',
  crisis: 0.15,
  fixedSchedule: true,
};

/** A dispatcher that answers, acknowledges and sends the best crew; an idle one does nothing at all. */
function play(s: SimState, minutes: number, active: boolean) {
  for (let m = 0; m < minutes; m++) {
    step(s, MIN);
    if (!active) continue;
    for (const call of s.calls) {
      if (call.endedAt) continue;
      if (!call.answeredAt) answerCall(s, call.id);
      else endCall(s, call.id, { action: 'create', priority: s.incidents[call.incidentId]?.truePriority ?? 3 });
    }
    for (const inc of queue(s)) {
      if (inc.state === 'incoming') acknowledge(s, inc.id);
      if (!inc.assigned.length) {
        const r = recommendUnits(s, inc.id).find((x) => x.fit === 'ideal' || x.fit === 'need');
        if (r) dispatchUnits(s, inc.id, [r.unit.id]);
      }
    }
  }
}

/** The calls of a run: when, what and where, in spawn order. */
const callsOf = (s: SimState) =>
  s.incidentOrder
    .map((id) => s.incidents[id])
    .filter((i) => !!i && i.source !== 'director')
    .map((i) => ({ t: i.createdAt, tpl: i.templateId, at: i.location.coord.map((x) => Math.round(x * 1e5)) }));

describe('challenge: the setup', () => {
  it('is the free fixed-schedule shift as it was given: seed, place, time, weather and crisis chance', () => {
    const s = createShift(OPTS);
    expect(setupOf(s)).toEqual({
      seed: 777001,
      regionId: 'louna',
      difficulty: 'veteran',
      start: OPTS.start,
      hours: 4,
      weather: 'rain',
      crisis: 0.15,
    } satisfies ShiftSetup);
    // It survives a save (JSON), and the report carries it.
    expect(setupOf(JSON.parse(JSON.stringify(s)))).toEqual(setupOf(s));
    expect(finalizeShift(s).setup).toEqual(setupOf(s));
  });

  it('is missing for a shift another player could not play the same', () => {
    const { fixedSchedule: _f, ...open } = OPTS;
    void _f;
    expect(setupOf(createShift(open)), 'not fixed').toBeUndefined();
    expect(setupOf(createShift({ ...OPTS, mode: 'career' })), 'career').toBeUndefined();
    expect(setupOf(createShift({ ...OPTS, sectors: ['louna-tartu'] })), 'an area').toBeUndefined();
    const daily = createShift(OPTS);
    markDaily(daily, '2026-10-23');
    expect(setupOf(daily), 'daily').toBeUndefined();
    const room = createShift(OPTS);
    room.flags.room = 'K7M2QX';
    expect(setupOf(room), 'room').toBeUndefined();
    const custom = createShift(OPTS);
    custom.flags.custom = true;
    expect(setupOf(custom), 'custom').toBeUndefined();
    // A challenge run passes its own link on instead of making a new challenge.
    const run = createShift(challengeShiftOptions(setupOf(createShift(OPTS))!, 'Mari'));
    markChallenge(run, 'ABC234');
    expect(challengeCodeOf(run)).toBe('ABC234');
    expect(setupOf(run)).toBeUndefined();
    expect(finalizeShift(run).challenge).toBe('ABC234');
    expect(challengeCodeOf(null)).toBeNull();
  });

  it('plays the same calls for the friend, whatever either of them does', { timeout: 120_000 }, () => {
    const mine = createShift(OPTS);
    const setup = setupOf(mine)!;
    const theirs = createShift(challengeShiftOptions(setup, 'Mari'));
    expect(theirs.playerName).toBe('Mari');
    expect(theirs.weather).toEqual(mine.weather);
    expect(Object.keys(theirs.units)).toEqual(Object.keys(mine.units));
    expect(theirs.crisis).toEqual(mine.crisis);
    play(mine, 150, true);
    play(theirs, 150, false);
    const a = callsOf(mine);
    expect(a.length).toBeGreaterThan(3);
    expect(callsOf(theirs)).toEqual(a);
    expect(Object.values(mine.incidents).some((i) => i.unitHistory.length > 0)).toBe(true);
    expect(Object.values(theirs.incidents).every((i) => i.unitHistory.length === 0)).toBe(true);
  });
});

describe('challenge: comparing', () => {
  it('compares by points, incidents handled, arrests, the most urgent response and the crisis', () => {
    const r = {
      score: 86.6,
      grade: 'A',
      stats: { closed: 14, arrests: 3 },
      avgResponse: { 1: 6.44, 2: 9 },
      crisis: { result: 71 },
    } as unknown as ShiftReport;
    expect(challengeStats(r)).toEqual({ score: 87, grade: 'A', closed: 14, arrests: 3, p1: 6.4, crisis: 71 });
    expect(challengeStats({ ...r, avgResponse: {}, crisis: undefined, score: 140 })).toMatchObject({
      score: 100,
      p1: null,
      crisis: null,
    });
  });

  it('names the shift by its weekday and whether it is a day or a night', () => {
    expect(shiftWhen(tallinnTime(2026, 10, 23, 19, 0))).toEqual({ et: 'reede öö', en: 'Friday night' });
    expect(shiftWhen(tallinnTime(2026, 10, 19, 7, 0))).toEqual({ et: 'esmaspäev päev', en: 'Monday day' });
    expect(shiftWhen(tallinnTime(2026, 10, 25, 2, 0)).et).toBe('pühapäev öö');
  });
});
