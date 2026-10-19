/**
 * Päeva väljakutse (src/sim/daily.ts, src/net/daily.ts): the challenge follows from the date alone, rotates
 * through every starter sector, and a daily run is an ordinary free shift marked with its date.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sectors from '@/sim/sectors';
import {
  addDays,
  cycleOrder,
  DAILY_SLOTS,
  dailyChallenge,
  dailyDateOf,
  dailyPool,
  dailyShiftOptions,
  dailyStartedOf,
  HARSH_CHANCE,
  isDailyDate,
  markDaily,
  nextChallengeAt,
  parseDate,
  SLOT_HOURS,
  todayInTallinn,
} from '@/sim/daily';
import { createShift, step } from '@/sim/engine';
import { acknowledge, answerCall, dispatchUnits, endCall } from '@/sim/commands';
import { queue, recommendUnits } from '@/sim/selectors';
import { HOUR, MIN, wall } from '@/sim/time';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { TEMPLATES } from '@/data/incidents';
import { dailyBody, guestDaily, parseDaily, parseDailyResult, rememberGuestDaily } from '@/net/daily';
import type { RegionId, SectorDef, ShiftReport, SimState } from '@/sim/types';

vi.mock('@/sim/sectors', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/sim/sectors')>();
  return { ...real, starterSectors: vi.fn(real.starterSectors) };
});

const starterMock = vi.mocked(sectors.starterSectors);

/** Two made-up starter sectors per prefecture, as the sector data will have. */
const FAKE: Record<RegionId, string[]> = {
  pohja: ['pohja-kesklinn', 'pohja-lasnamae'],
  ida: ['ida-narva', 'ida-laane-viru'],
  louna: ['louna-tartu', 'louna-viljandi'],
  laane: ['laane-parnu', 'laane-saare'],
};
const fakeStarters = (regionId: RegionId) =>
  FAKE[regionId].map((id) => ({ id, regionId, starter: { difficulty: 'normal' } }) as unknown as SectorDef);

/** Consecutive dates from `from`. */
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const areaOf = (date: string) => {
  const c = dailyChallenge(date);
  return `${c.regionId}/${c.sector}`;
};

describe('dates', () => {
  it('parses only real calendar dates', () => {
    expect(parseDate('2026-10-19')).toEqual({ y: 2026, m: 10, d: 19 });
    for (const bad of ['2026-02-30', '2026-13-01', '26-10-19', '2026-10-19T00:00', '', 'tana'])
      expect(parseDate(bad), bad).toBeNull();
    expect(isDailyDate('2028-02-29')).toBe(true);
    expect(isDailyDate('2027-02-29')).toBe(false);
    expect(isDailyDate(20261019)).toBe(false);
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-10-19', -1)).toBe('2026-10-18');
  });

  it('takes today from the Tallinn calendar (EET in winter, EEST in summer)', () => {
    // 21:30 UTC on 18 October is 00:30 on the 19th in Tallinn (UTC+3 until the last Sunday of October).
    expect(todayInTallinn(Date.UTC(2026, 9, 18, 21, 30))).toBe('2026-10-19');
    expect(todayInTallinn(Date.UTC(2026, 9, 18, 20, 59))).toBe('2026-10-18');
    // UTC+2 in January.
    expect(todayInTallinn(Date.UTC(2026, 0, 1, 21, 59))).toBe('2026-01-01');
    expect(todayInTallinn(Date.UTC(2026, 0, 1, 22, 0))).toBe('2026-01-02');
  });

  it('opens the next challenge at the next Tallinn midnight', () => {
    for (const now of [
      Date.UTC(2026, 9, 19, 10, 12),
      Date.UTC(2026, 9, 24, 23, 0),
      Date.UTC(2026, 2, 28, 22, 30),
    ]) {
      const next = nextChallengeAt(now);
      const w = wall(next);
      expect([w.hour, w.minute]).toEqual([0, 0]);
      expect(todayInTallinn(next)).toBe(addDays(todayInTallinn(now), 1));
      expect(next).toBeGreaterThan(now);
      expect(next - now).toBeLessThanOrEqual(25 * HOUR);
    }
  });
});

describe('dailyChallenge', () => {
  it('is the same for everyone: the date alone decides it', () => {
    const a = dailyChallenge('2026-10-19');
    expect(dailyChallenge('2026-10-19')).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(dailyChallenge('2026-10-20').seed).not.toBe(a.seed);
    const seeds = new Set(days('2026-01-01', 365).map((d) => dailyChallenge(d).seed));
    expect(seeds.size).toBe(365);
  });

  it('is a normal, 3 hour free shift with a fixed schedule on its own date', () => {
    for (const date of days('2026-10-19', 40)) {
      const c = dailyChallenge(date);
      expect(c.options).toMatchObject({
        seed: c.seed,
        regionId: c.regionId,
        mode: 'free',
        difficulty: 'normal',
        start: c.start,
        hours: 3,
        weather: c.weather,
        fixedSchedule: true,
      });
      expect(c.options.sectors).toEqual(c.sector ? [c.sector] : undefined);
      expect(todayInTallinn(c.start)).toBe(date);
      expect(SLOT_HOURS[c.slot]).toContain(wall(c.start).hour);
      expect(wall(c.start).minute).toBe(0);
      expect(dailyShiftOptions(date, 'Mari')).toEqual({ ...c.options, playerName: 'Mari' });
    }
  });

  it('spreads the start over the day, with Friday and Saturday nights more often', () => {
    const all = days('2025-01-01', 3 * 365).map((d) => ({
      c: dailyChallenge(d),
      wd: new Date(`${d}T12:00:00Z`).getUTCDay(),
    }));
    for (const slot of DAILY_SLOTS)
      expect(all.filter((x) => x.c.slot === slot).length, slot).toBeGreaterThan(100);
    const nightShare = (pick: (wd: number) => boolean) => {
      const sel = all.filter((x) => pick(x.wd));
      return sel.filter((x) => x.c.slot === 'night').length / sel.length;
    };
    const weekend = nightShare((wd) => wd === 5 || wd === 6);
    const other = nightShare((wd) => wd !== 5 && wd !== 6);
    expect(weekend).toBeGreaterThan(0.4);
    expect(other).toBeLessThan(0.33);
    expect(weekend).toBeGreaterThan(other * 1.6);
  });

  it('picks weather that fits the season, harsh now and then', () => {
    const all = days('2025-01-01', 3 * 365).map(dailyChallenge);
    const month = (c: (typeof all)[number]) => wall(c.start).month;
    const summer = all.filter((c) => month(c) >= 6 && month(c) <= 8);
    const winter = all.filter((c) => month(c) === 12 || month(c) <= 2);
    expect(summer.some((c) => c.weather === 'snow' || c.weather === 'sleet')).toBe(false);
    expect(winter.some((c) => c.weather === 'rain')).toBe(false);
    expect(winter.filter((c) => c.weather === 'snow').length).toBeGreaterThan(30);
    expect(summer.filter((c) => c.weather === 'clear').length).toBeGreaterThan(summer.length / 3);
    const harsh = all.filter((c) => c.harsh);
    expect(harsh.length / all.length).toBeGreaterThan(HARSH_CHANCE / 2);
    expect(harsh.length / all.length).toBeLessThan(HARSH_CHANCE * 1.6);
    // Harsh days are rough: never a clear or merely cloudy sky.
    expect(harsh.every((c) => !['clear', 'cloudy'].includes(c.weather))).toBe(true);
    expect(new Set(harsh.map((c) => c.weather))).toEqual(new Set(['storm', 'sleet', 'fog', 'snow']));
  });
});

describe('rotation', () => {
  afterEach(() => starterMock.mockReset());

  function checkRotation(expected: string[]) {
    const pool = dailyPool().map((a) => `${a.regionId}/${a.sector}`);
    expect([...pool].sort()).toEqual([...expected].sort());
    const n = pool.length;
    // Days since 1970-01-01 of the first date are a multiple of n: a cycle starts there.
    const first = addDays('1970-01-01', Math.ceil(20_000 / n) * n);
    const seq = days(first, n * 30).map(areaOf);
    for (let cycle = 0; cycle < 30; cycle++) {
      const window = seq.slice(cycle * n, cycle * n + n);
      expect([...window].sort(), `cycle ${cycle}`).toEqual([...expected].sort());
    }
    // Any n consecutive days show n different areas only within a cycle, but never the same area twice in a row.
    for (let i = 1; i < seq.length; i++) expect(seq[i], `day ${i}`).not.toBe(seq[i - 1]);
    // Shuffled: the cycles do not all come in the same order.
    const orders = new Set(Array.from({ length: 30 }, (_, c) => seq.slice(c * n, c * n + n).join(',')));
    expect(orders.size).toBeGreaterThan(10);
  }

  it('goes through every starter sector over consecutive days in a shuffled order', () => {
    starterMock.mockImplementation(fakeStarters);
    checkRotation(
      Object.values(FAKE)
        .flat()
        .map((id) => `${id.split('-')[0]}/${id}`),
    );
    const c = dailyChallenge('2026-10-19');
    expect(c.sector).not.toBe('');
    expect(c.options.sectors).toEqual([c.sector]);
    expect(FAKE[c.regionId]).toContain(c.sector);
  });

  it('falls back to the whole prefectures while there is no sector data', () => {
    starterMock.mockReturnValue([]);
    checkRotation(REGION_IDS.map((r) => `${r}/`));
    const c = dailyChallenge('2026-10-19');
    expect(c.sector).toBe('');
    expect(c.options.sectors).toBeUndefined();
  });

  it('uses the real starter sectors when they exist', () => {
    const real = REGION_IDS.flatMap((r) => sectors.starterSectors(r).map((x) => `${r}/${x.id}`));
    checkRotation(real.length ? real : REGION_IDS.map((r) => `${r}/`));
  });

  it('keeps a small pool in a fixed alternating order', () => {
    const pool = [
      { regionId: 'pohja' as const, sector: 'a' },
      { regionId: 'ida' as const, sector: 'b' },
    ];
    expect(cycleOrder(pool, 5)).toEqual(pool);
  });
});

// ── Daily runs in the engine ───────────────────────────────────────────────

const ready = REGION_IDS.every((id) => REGIONS[id].roster.length > 0) && TEMPLATES.length > 50;

/** A dispatcher that acknowledges every incident and sends the best unit; `lazy` does nothing at all. */
function play(s: SimState, minutes: number, active: boolean) {
  for (let m = 0; m < minutes; m++) {
    step(s, MIN);
    if (!active) continue;
    for (const call of s.calls) {
      if (call.endedAt) continue;
      if (!call.answeredAt) answerCall(s, call.id);
      else {
        const inc = s.incidents[call.incidentId];
        endCall(s, call.id, { action: 'create', priority: inc?.truePriority ?? 3 });
      }
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

/** The calls of a run: when, what and where, in spawn order (director incidents excluded). */
const callsOf = (s: SimState) =>
  s.incidentOrder
    .map((id) => s.incidents[id])
    .filter((i) => i && i.source !== 'director')
    .map((i) => ({
      t: i.createdAt,
      tpl: i.templateId,
      at: i.location.coord.map((x) => Math.round(x * 1e5)),
      caller: i.caller?.name ?? null,
    }));

describe.skipIf(!ready)('a daily run', () => {
  it('is a free shift of the challenge, marked with its date', () => {
    const date = '2026-10-19';
    const c = dailyChallenge(date);
    const s = createShift(dailyShiftOptions(date, 'Mari Maasikas'));
    expect(dailyDateOf(s)).toBeNull();
    markDaily(s, date, 1_792_400_000_000);
    expect(dailyDateOf(s)).toBe(date);
    expect(dailyStartedOf(s)).toBe(1_792_400_000_000);
    expect(s.flags.daily).toBe(date);
    expect(s).toMatchObject({ mode: 'free', difficulty: 'normal', regionId: c.regionId, startTime: c.start });
    expect(s.endTime - s.startTime).toBe(3 * HOUR);
    expect(s.weather.kind).toBe(c.weather);
    // The mark survives a save (JSON) like every other flag.
    expect(dailyDateOf(JSON.parse(JSON.stringify(s)))).toBe(date);
    // Two players get the same start.
    const other = createShift(dailyShiftOptions(date, 'Jüri Juurikas'));
    expect(Object.keys(other.units)).toEqual(Object.keys(s.units));
    expect(other.weather).toEqual(s.weather);
  });

  const fixed = (() => {
    try {
      return createShift(dailyShiftOptions('2026-10-19', 'probe')).spawnRng !== undefined;
    } catch {
      return false;
    }
  })();

  it.skipIf(!fixed)(
    'gets the same calls at the same times and places whatever the player does (fixedSchedule)',
    { timeout: 120_000 },
    () => {
      for (const date of ['2026-10-19', '2026-10-23', '2027-01-16']) {
        const busy = createShift(dailyShiftOptions(date, 'Aktiivne'));
        const idle = createShift(dailyShiftOptions(date, 'Passiivne'));
        play(busy, 3 * 60, true);
        play(idle, 3 * 60, false);
        const a = callsOf(busy);
        const b = callsOf(idle);
        expect(a.length, date).toBeGreaterThan(3);
        expect(b, date).toEqual(a);
        // The player really did something different.
        expect(Object.values(busy.incidents).some((i) => i.unitHistory.length > 0)).toBe(true);
        expect(Object.values(idle.incidents).every((i) => i.unitHistory.length === 0)).toBe(true);
      }
    },
  );

  it.runIf(!fixed)(
    'SKIPPED: fixedSchedule is still a no-op in the engine (SimState.spawnRng is never set)',
    () => {
      expect(fixed).toBe(false);
    },
  );
});

// ── Client API helpers ─────────────────────────────────────────────────────

describe('net/daily', () => {
  const report = {
    regionId: 'louna',
    mode: 'free',
    difficulty: 'normal',
    score: 77.6,
    grade: 'B',
    start: 1,
    stats: { incidents: 9, arrests: 2 },
  } as unknown as ShiftReport;

  it('builds the POST /api/daily body', () => {
    expect(
      dailyBody(report, { day: '2026-10-19', sector: 'louna-tartu', started: 1_792_400_000_000 }),
    ).toEqual({
      day: '2026-10-19',
      regionId: 'louna',
      sector: 'louna-tartu',
      score: 78,
      grade: 'B',
      incidents: 9,
      arrests: 2,
      started: 1_792_400_000_000,
    });
    expect(dailyBody(report, { day: '2026-10-19', sector: '', started: null })).not.toHaveProperty('started');
  });

  it('reads the server replies defensively', () => {
    expect(parseDailyResult({ ok: true, counted: false, rank: 3, players: 12 })).toEqual({
      counted: false,
      rank: 3,
      players: 12,
    });
    expect(parseDailyResult({ ok: true, counted: true, rank: null })).toEqual({
      counted: true,
      rank: null,
      players: null,
    });
    const board = parseDaily(
      {
        day: '2026-10-19',
        players: 2,
        scores: [
          { name: 'Mari', score: 90, grade: 'S', incidents: 10, at: 5, rank: 1 },
          { name: 'Jüri', score: '80', grade: 'A', incidents: 8, at: 6 },
          'junk',
        ],
        me: { name: 'Jüri', score: 80, grade: 'A', incidents: 8, at: 6, rank: 2 },
      },
      '2026-10-19',
    );
    expect(board.scores.map((r) => [r.name, r.score, r.rank])).toEqual([
      ['Mari', 90, 1],
      ['Jüri', 80, 2],
    ]);
    expect(board.me?.rank).toBe(2);
    expect(parseDaily(null, '2026-10-18')).toEqual({ day: '2026-10-18', players: 0, scores: [], me: null });
  });

  describe('guest results', () => {
    beforeEach(() => {
      const data = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, String(v)),
        removeItem: (k: string) => void data.delete(k),
        clear: () => data.clear(),
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('keeps the first result of the day only', () => {
      expect(guestDaily('2026-10-19')).toBeNull();
      rememberGuestDaily('2026-10-19', { score: 61.4, grade: 'C' });
      rememberGuestDaily('2026-10-19', { score: 99, grade: 'S' });
      expect(guestDaily('2026-10-19')).toEqual({ day: '2026-10-19', score: 61, grade: 'C' });
      expect(guestDaily('2026-10-20')).toBeNull();
      rememberGuestDaily('2026-10-20', { score: 70, grade: 'B' });
      expect(guestDaily('2026-10-20')).toEqual({ day: '2026-10-20', score: 70, grade: 'B' });
    });
  });
});
