/**
 * Game clock (src/sim/time.ts): Tallinn wall time comes from the EU summer time rule for 2002-2037 (no time zone data
 * to load on a slow phone), and it is exactly what the time zone data says, every hour of the span and to the
 * millisecond around each change; outside the span the time zone data answers.
 */
import { describe, expect, it } from 'vitest';
import { DAY, HOUR, tallinnTime, wall, wallByZoneData } from '@/sim/time';

describe('Tallinn wall time', () => {
  it('matches the time zone data at every hour of 2002-2037', () => {
    const from = Date.UTC(2002, 0, 1);
    const to = Date.UTC(2038, 0, 1);
    let checked = 0;
    for (let t = from; t < to; t += HOUR) {
      const a = wall(t);
      const b = wallByZoneData(t);
      if (a.hour !== b.hour || a.day !== b.day || a.weekday !== b.weekday || a.month !== b.month || a.year !== b.year)
        expect(a, new Date(t).toISOString()).toEqual(b);
      checked++;
    }
    expect(checked).toBeGreaterThan(300_000);
  });

  it('changes at the very millisecond of each summer time change, both ways', () => {
    for (let year = 2002; year <= 2037; year++)
      for (const month of [2, 9]) {
        // The last Sunday of March and of October, 01:00 UTC.
        const last = Date.UTC(year, month + 1, 0, 1);
        const at = last - new Date(last).getUTCDay() * DAY;
        for (const t of [at - 1, at, at + 1, at - 30 * 60_000, at + 59 * 60_000 + 59_999])
          expect(wall(t), new Date(t).toISOString()).toEqual(wallByZoneData(t));
      }
  });

  it('keeps minutes and seconds, and answers by the time zone data outside the span', () => {
    let t = Date.UTC(2026, 6, 14, 12, 0);
    for (let i = 0; i < 2000; i++) {
      t += 7_919_237; // about 2 h 12 min, every second and minute
      expect(wall(t)).toEqual(wallByZoneData(t));
    }
    for (const old of [Date.UTC(1999, 6, 1, 12), Date.UTC(2000, 6, 1, 12), Date.UTC(2040, 6, 1, 12)])
      expect(wall(old)).toEqual(wallByZoneData(old));
    // Estonia kept no summer time in 2000: the time zone data knows.
    expect(wall(Date.UTC(2000, 6, 1, 12)).hour).toBe(14);
    expect(wall(Date.UTC(2026, 6, 1, 12)).hour).toBe(15);
    expect(wall(Date.UTC(2026, 0, 1, 12)).hour).toBe(14);
  });

  it('turns wall time back into the moment, across the changes', () => {
    for (const [y, m, d, h] of [
      [2026, 3, 29, 2],
      [2026, 3, 29, 4],
      [2026, 10, 25, 2],
      [2026, 10, 25, 5],
      [2027, 1, 1, 0],
    ] as const) {
      const w = wall(tallinnTime(y, m, d, h));
      expect([w.year, w.month, w.day, w.hour]).toEqual([y, m, d, h]);
    }
  });
});
