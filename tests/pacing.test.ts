/**
 * Call pacing (src/sim/spawner.ts, 2.23.0): players saw six calls in a three-hour daily challenge and long quiet
 * spells between short bursts. The daily challenge now brings about four calls an hour, never MAX_LULL apart for
 * long; co-op rooms get more calls with more players; a family's story is not told twice in a shift.
 */
import { describe, expect, it } from 'vitest';
import { createShift, step } from '@/sim/engine';
import { dailyShiftOptions } from '@/sim/daily';
import { initCoop, SERVER_SEAT, applyCommand } from '@/sim/coop';
import { roomShiftOptions } from '@/sim/room';
import { areaFactor, COOP_ROLE_EXTRA, coopCallFactor, MAX_LULL, spawnRatePerHour } from '@/sim/spawner';
import { REGIONS } from '@/data/regions';
import { MIN } from '@/sim/time';

describe('call pacing', () => {
  it('gives every daily challenge of two weeks a busy desk without long silences', () => {
    for (let d = 0; d < 14; d++) {
      const date = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
      const s = createShift(dailyShiftOptions(date, 'Test'));
      while (s.now < s.endTime) step(s, MIN);
      const times = Object.values(s.incidents)
        .map((i) => i.createdAt)
        .filter((t) => t <= s.endTime)
        .sort((a, b) => a - b);
      // Three hours: at least eight calls (before 2.23.0 a quiet day had one or two).
      expect(times.length, date).toBeGreaterThanOrEqual(8);
      const marks = [s.startTime, ...times];
      let longest = 0;
      for (let i = 1; i < marks.length; i++) longest = Math.max(longest, marks[i] - marks[i - 1]);
      // An arrival with no place in the sector is dropped, so twice the lull is the honest bound.
      expect(longest, date).toBeLessThanOrEqual(2 * MAX_LULL);
    }
  });

  it('gives co-op rooms more calls with more players', () => {
    const room = (options: object) =>
      createShift(
        roomShiftOptions({ code: 'K7M2QX', seed: 7, day: '2026-10-14', options: options as never }, 'T'),
      );
    // Role co-op: one area, each player beyond the first adds COOP_ROLE_EXTRA of it; seats that left do not count.
    const role = room({
      regionId: 'louna',
      sector: 'louna-tartu',
      difficulty: 'normal',
      hours: 3,
      slot: 'afternoon',
    });
    const solo = spawnRatePerHour(role, role.startTime);
    initCoop(role, 'K7M2QX');
    applyCommand(role, {
      id: 1,
      t: 0,
      s: SERVER_SEAT,
      k: 'setup',
      a: [
        0,
        [
          [0, 'dispatch', 'A'],
          [1, 'calls', 'B'],
        ],
      ],
    });
    expect(coopCallFactor(role)).toBeCloseTo(1 + COOP_ROLE_EXTRA, 9);
    expect(spawnRatePerHour(role, role.startTime)).toBeCloseTo(solo * (1 + COOP_ROLE_EXTRA), 9);
    applyCommand(role, { id: 2, t: 0, s: SERVER_SEAT, k: 'left', a: [1] });
    expect(coopCallFactor(role)).toBe(1);
    // Sector co-op: every desk brings its own desk's calls, two desks twice one.
    const desks = ['louna-tartu', 'louna-tartumaa'];
    const sec = room({
      regionId: 'louna',
      sector: desks[0],
      desks,
      difficulty: 'normal',
      hours: 3,
      slot: 'afternoon',
    });
    initCoop(sec, 'K7M2QX', 'sector', desks);
    const each = desks.reduce((a, id) => a + areaFactor(REGIONS.louna, [id]), 0);
    expect(coopCallFactor(sec)).toBeCloseTo(each, 9);
    expect(coopCallFactor(sec)).toBeGreaterThan(areaFactor(REGIONS.louna, [desks[0]]));
    // Outside co-op nothing changes.
    expect(coopCallFactor(createShift(dailyShiftOptions('2026-11-02', 'T')))).toBe(1);
  });
});
