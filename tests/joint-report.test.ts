/**
 * Ühine raport (src/sim/joint.ts, src/sim/moments.ts, 2.36.0): the awards of a co-op shift, the timeline, and the
 * summary a room keeps of a round, read back from the server field by field.
 */
import { describe, expect, it } from 'vitest';
import { emptySeatStats, type CoopReport, type CoopReportSeat, type SeatStats } from '@/sim/coop';
import {
  avgResponse,
  coopAwards,
  helpPoints,
  parseRoomSummary,
  SPEED_MIN,
  type RoomSummary,
} from '@/sim/joint';
import { addMoment, MAX_MOMENTS, maskSeats, reportMoments } from '@/sim/moments';
import type { SimState } from '@/sim/types';

const seat = (n: number, st: Partial<SeatStats>, more: Partial<CoopReportSeat> = {}): CoopReportSeat => ({
  seat: n,
  name: ['Hanna', 'Ivo', 'Kati', 'Mart'][n],
  role: 'dispatch',
  present: true,
  stats: { ...emptySeatStats(), ...st },
  worked: 10,
  p1: 0,
  ...more,
});
const ids = (coop: Pick<CoopReport, 'mode' | 'seats'>) =>
  Object.fromEntries(coopAwards(coop).map((a) => [a.id, a.seat]));

describe('joint report: awards', () => {
  it('gives each award to the seat that earned it, and none to one player alone', () => {
    const seats = [
      seat(0, { calls: 20, created: 15, sent: 30, respSum: 3 * 40_000, respN: 3, lent: 1 }, { p1: 1 }),
      seat(1, { calls: 5, sent: 10, respSum: 4 * 90_000, respN: 4, lent: 3, helped: 2 }, { p1: 3 }),
    ];
    expect(ids({ mode: 'sector', seats })).toEqual({ hero: 0, fastest: 0, helper: 1, nerve: 1, snail: 1 });
    const awards = coopAwards({ mode: 'sector', seats });
    expect(awards.find((a) => a.id === 'fastest')!.value).toBe(40_000);
    expect(awards.find((a) => a.id === 'snail')!.value).toBe(90_000);
    expect(coopAwards({ mode: 'sector', seats: [seats[0]] })).toEqual([]);
  });

  it('times only seats that sent enough first crews, and keeps Tigu for a real gap', () => {
    const few = [
      seat(0, { sent: 5, respSum: 2 * 10_000, respN: SPEED_MIN - 1 }),
      seat(1, { sent: 5, respSum: 3 * 60_000, respN: SPEED_MIN }),
    ];
    // Only one seat is timed: the fastest hand, no snail.
    expect(ids({ mode: 'sector', seats: few })).toMatchObject({ fastest: 1 });
    expect(ids({ mode: 'sector', seats: few }).snail).toBeUndefined();
    const close = [
      seat(0, { sent: 5, respSum: 3 * 50_000, respN: 3 }),
      seat(1, { sent: 5, respSum: 3 * 55_000, respN: 3 }),
    ];
    expect(ids({ mode: 'sector', seats: close }).snail).toBeUndefined();
    expect(avgResponse({ respSum: 100, respN: 3 })).toBe(33);
    expect(avgResponse({})).toBeNull();
  });

  it('leaves out what nobody earned, and counts help by the kind of co-op', () => {
    const idle = [seat(0, {}), seat(1, {})];
    expect(coopAwards({ mode: 'sector', seats: idle })).toEqual([]);
    const role = [seat(0, { radio: 2, queries: 5, sent: 3 }), seat(1, { calls: 9, lent: 4 })];
    expect(helpPoints('role', role[0].stats)).toBe(7);
    expect(helpPoints('role', role[1].stats)).toBe(0);
    expect(ids({ mode: 'role', seats: role }).helper).toBe(0);
    expect(
      helpPoints('sector', { ...emptySeatStats(), lent: 1, helped: 1, handover: 1, takeover: 1, took: 1 }),
    ).toBe(2 + 3 + 1 + 1 + 3);
    // A tie goes to the seat that worked on more incidents.
    const tie = [seat(0, { sent: 4 }, { p1: 2, worked: 5 }), seat(1, { sent: 4 }, { p1: 2, worked: 9 })];
    expect(ids({ mode: 'sector', seats: tie }).nerve).toBe(1);
  });
});

describe('joint report: the timeline', () => {
  const state = (): SimState =>
    ({
      coop: { moments: [], touch: { 'inc-1': 0b101 } },
      incidents: { 'inc-1': { id: 'inc-1', createdAt: 5_000.6 } },
    }) as unknown as SimState;

  it('keeps the newest moments, the rarer kinds first, with the highlights and their seats in time order', () => {
    const s = state();
    const c = s.coop!;
    for (let i = 0; i < MAX_MOMENTS + 5; i++) addMoment(c, { t: 10_000 + i, k: 'lend', seat: -1, other: 0 });
    expect(c.moments).toHaveLength(MAX_MOMENTS);
    expect(c.moments![0].t).toBe(10_005);
    addMoment(c, { t: 20_000, k: 'take', seat: 1, desk: 'pohja-kesklinn' });
    const out = reportMoments(s, [
      {
        incidentId: 'inc-1',
        title: { et: 'Rööv', en: 'Robbery' },
        text: {
          et: '21.14 · Narva mnt 1, Tallinn. Kinni peeti.',
          en: '9:14 pm · Narva mnt 1, Tallinn. Arrested.',
        },
        good: true,
      },
      { incidentId: 'gone', title: { et: 'X', en: 'X' }, text: { et: 'x', en: 'x' }, good: false },
    ]);
    expect(out[0]).toEqual({
      t: 5_001,
      k: 'good',
      seats: [0, 2],
      title: { et: 'Rööv', en: 'Robbery' },
      text: { et: 'Narva mnt 1, Tallinn. Kinni peeti.', en: 'Narva mnt 1, Tallinn. Arrested.' },
    });
    expect(out.some((m) => m.k === 'take')).toBe(true);
    // At most 16 moments between the seats besides the highlight; the take-over is among them.
    expect(out).toHaveLength(17);
    expect(out.map((m) => m.t)).toEqual([...out.map((m) => m.t)].sort((x, y) => x - y));
    expect(maskSeats(0b1010)).toEqual([1, 3]);
    expect(reportMoments({ coop: undefined } as unknown as SimState)).toEqual([]);
  });
});

describe('joint report: the summary a room keeps', () => {
  const summary: RoomSummary = {
    v: 1,
    regionId: 'pohja',
    difficulty: 'normal',
    start: 1_792_500_000_000,
    end: 1_792_514_400_000,
    score: 74,
    grade: 'B',
    incidents: 31,
    arrests: 4,
    xp: 380,
    coop: {
      code: 'K7M2QX',
      host: 0,
      mode: 'sector',
      seats: [
        seat(0, { calls: 3, respSum: 120_000, respN: 3 }, { desk: 'pohja-kesklinn' }),
        seat(1, { lent: 2 }, { desk: 'pohja-lasnamae' }),
      ],
      desks: [
        {
          desk: 'pohja-kesklinn',
          seats: [0],
          colleague: 'Mari Tamm',
          incidents: 12,
          closed: 11,
          calls: 3,
          sent: 9,
          lent: 0,
          borrowed: 2,
          helped: 0,
          handover: 0,
          taken: 0,
          takenBy: [],
        },
      ],
      moments: [
        {
          t: 1_792_501_000_000,
          k: 'lend',
          seat: 1,
          other: 0,
          desk: 'pohja-lasnamae',
          to: 'pohja-kesklinn',
          unit: 'PÕHJA 21',
        },
        {
          t: 1_792_502_000_000,
          k: 'bad',
          seats: [0],
          title: { et: 'Rööv', en: 'Robbery' },
          text: { et: 'x', en: 'x' },
        },
      ],
    },
  };

  it('reads back what was kept', () => {
    expect(parseRoomSummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
  });

  it('drops what does not belong and refuses what is not a summary', () => {
    const bad = JSON.parse(JSON.stringify(summary));
    bad.coop.seats[0].name = 'Han\u0000na';
    bad.coop.seats[1].stats.sent = 1e9;
    bad.coop.seats.push({ ...bad.coop.seats[0] }, { seat: 7, name: 'X' });
    bad.coop.moments.push({ t: 1, k: 'nuke', seat: 0 }, { t: 2, k: 'good', seats: [0] });
    bad.coop.moments[0].desk = '<script>';
    bad.grade = 'Z';
    const read = parseRoomSummary(bad)!;
    expect(read.coop.seats.map((x) => x.name)).toEqual(['Han na', 'Ivo']);
    expect(read.coop.seats[1].stats.sent).toBe(100000);
    expect(read.coop.moments).toHaveLength(2);
    expect(read.coop.moments![0]).not.toHaveProperty('desk');
    expect(read.grade).toBe('F');
    for (const v of [null, 7, 'x', {}, { v: 2, coop: summary.coop }, { v: 1, coop: { seats: [] } }])
      expect(parseRoomSummary(v), JSON.stringify(v)).toBeNull();
    // A role co-op round has no desks.
    const role = parseRoomSummary({ ...summary, coop: { ...summary.coop, mode: 'role' } })!;
    expect(role.coop.mode).toBe('role');
    expect(role.coop).not.toHaveProperty('desks');
  });
});
