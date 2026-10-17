import { describe, expect, it } from 'vitest';
import type { CareerProfile, LedgerEntry } from '@/sim/types';
import {
  affordability,
  balanceSeries,
  calendarOf,
  columnPath,
  fallbackCosts,
  fmtCompact,
  fmtMoney,
  fmtNum,
  inboxStyle,
  isLocked,
  ledgerRows,
  monthBreakdown,
  niceTicks,
  rankInfo,
  readiness,
  regionLocks,
  safe,
  sortRows,
  validateOnboarding,
} from '@/ui/screens/career/helpers';
import { DICT } from '@/i18n';

const NB = ' ';
const MINUS = '−';

function profile(over: Partial<CareerProfile> = {}): CareerProfile {
  return {
    version: 1,
    name: 'Mari Maasikas',
    badge: '123',
    regionId: 'pohja',
    createdAt: 0,
    seed: 1,
    day: 1,
    money: 10000,
    reputation: 25,
    xp: 0,
    staff: [],
    fleet: [],
    upgrades: [],
    ledger: [],
    recruits: [],
    history: [],
    achievements: [],
    unlockedRegions: ['pohja'],
    stats: { shifts: 0, incidents: 0, arrests: 0, bestScore: 0, pursuitsCaught: 0 },
    ...over,
  };
}

const L = (day: number, amount: number, kind: LedgerEntry['kind'] = 'other'): LedgerEntry => ({ day, amount, kind, text: { et: '', en: '' } });

describe('career ui · formatting', () => {
  it('formats money the Estonian way', () => {
    expect(fmtMoney(10000, 'et')).toBe(`10${NB}000${NB}€`);
    expect(fmtMoney(-1250.4, 'et')).toBe(`${MINUS}1${NB}250${NB}€`);
    expect(fmtMoney(1250, 'et', { sign: true })).toBe(`+1${NB}250${NB}€`);
    expect(fmtMoney(0, 'et', { sign: true })).toBe(`0${NB}€`);
  });
  it('formats money in English', () => {
    expect(fmtMoney(10000, 'en')).toBe('€10,000');
    expect(fmtMoney(-42, 'en', { sign: true })).toBe(`${MINUS}€42`);
  });
  it('uses a decimal comma in Estonian', () => {
    expect(fmtNum(1234.5, 'et', 1)).toBe(`1${NB}234,5`);
    expect(fmtNum(1234.5, 'en', 1)).toBe('1,234.5');
    expect(fmtNum(NaN, 'et')).toBe('-');
  });
  it('compacts axis labels', () => {
    expect(fmtCompact(12400, 'en')).toBe('12k');
    expect(fmtCompact(1500, 'et')).toBe('1,5k');
    expect(fmtCompact(2000, 'et')).toBe('2k');
    expect(fmtCompact(1_250_000, 'en')).toBe('1.3M');
    expect(fmtCompact(-3000, 'en')).toBe(`${MINUS}3k`);
  });
});

describe('career ui · calendar & ranks', () => {
  it('maps career days to months and payday countdown', () => {
    expect(calendarOf(1)).toEqual({ day: 1, month: 1, dayOfMonth: 1, shiftsToPayday: 30 });
    expect(calendarOf(30)).toEqual({ day: 30, month: 1, dayOfMonth: 30, shiftsToPayday: 1 });
    expect(calendarOf(31)).toEqual({ day: 31, month: 2, dayOfMonth: 1, shiftsToPayday: 30 });
    expect(calendarOf(0).day).toBe(1);
  });
  it('never throws for ranks, even with stub rules / empty tables', () => {
    const r = rankInfo(1234);
    expect(r.index).toBeGreaterThanOrEqual(0);
    expect(r.name.et.length).toBeGreaterThan(0);
    expect(r.progress).toBeGreaterThanOrEqual(0);
    expect(r.progress).toBeLessThanOrEqual(1);
  });
  it('locks by minimum rank', () => {
    expect(isLocked(2, 1)).toBe(true);
    expect(isLocked(1, 1)).toBe(false);
    expect(isLocked(undefined, 0)).toBe(false);
  });
  it('safe() returns the fallback when a rule throws', () => {
    expect(
      safe(() => {
        throw new Error('stub');
      }, 7),
    ).toBe(7);
    expect(safe(() => 3, 7)).toBe(3);
  });
});

describe('career ui · ledger', () => {
  const ledger = [L(1, 1600, 'budget'), L(1, -300, 'salary'), L(2, 1600, 'budget'), L(2, -38000, 'vehicle'), L(31, 1600, 'budget')];
  it('computes the running balance anchored to current money', () => {
    const rows = ledgerRows(5000, ledger);
    expect(rows[rows.length - 1].balance).toBe(5000);
    // start = 5000 - sum(amounts)
    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(rows[0].balance).toBe(5000 - sum + 1600);
  });
  it('sorts by day but keeps insertion order within a day', () => {
    const rows = ledgerRows(0, [L(3, 1), L(1, 2), L(3, 3)]);
    expect(rows.map((r) => r.entry.amount)).toEqual([2, 1, 3]);
  });
  it('builds an end-of-day balance series with a starting point', () => {
    const s = balanceSeries(5000, ledger);
    expect(s[0].day).toBe(0);
    expect(s.map((p) => p.day)).toEqual([0, 1, 2, 31]);
    expect(s[s.length - 1].balance).toBe(5000);
    expect(balanceSeries(100, [])).toEqual([]);
  });
  it('breaks a month down by kind', () => {
    const b = monthBreakdown(ledger, 1);
    expect(b.income).toBe(3200);
    expect(b.expense).toBe(38300);
    expect(b.kinds[0].kind).toBe('vehicle');
    expect(b.kinds.find((k) => k.kind === 'budget')?.count).toBe(2);
    expect(monthBreakdown(ledger, 2).income).toBe(1600);
  });
});

describe('career ui · management helpers', () => {
  it('falls back to summing salaries & upkeep', () => {
    const p = profile({
      staff: [{ salary: 2000 }, { salary: 2500 }] as CareerProfile['staff'],
      fleet: [{ upkeep: 300 }] as CareerProfile['fleet'],
    });
    expect(fallbackCosts(p)).toEqual({ salaries: 4500, upkeep: 300, total: 4800 });
  });
  it('rates affordability', () => {
    const p = profile({ money: 3000 });
    const costs = { salaries: 40000, upkeep: 0, total: 40000 };
    expect(affordability(p, 2500, 0, costs, 48000)).toBe('ok');
    expect(affordability(p, 3500, 0, costs, 48000)).toBe('no');
    expect(affordability(p, 2900, 0, { ...costs, total: 46000 }, 48000)).toBe('tight');
    expect(affordability(p, 100, 5000, costs, 48000)).toBe('no');
  });
  it('flags readiness issues', () => {
    expect(readiness(profile(), null).issues.map((i) => i.key)).toContain('career.ready.noStaff');
    expect(readiness(profile({ money: -5 }), null).issues[0].key).toBe('career.ready.debt');
  });
  it('validates onboarding input', () => {
    expect(validateOnboarding('Mari', '123')).toEqual({});
    expect(validateOnboarding(' ', '12').name).toBeDefined();
    expect(validateOnboarding('Mari', '12a').badge).toBeDefined();
  });
  it('sorts rows numerically and alphabetically', () => {
    expect(sortRows([3, 1, 2], (x) => x, 'asc')).toEqual([1, 2, 3]);
    expect(sortRows(['Õun', 'Aas', 'Zeta'], (x) => x, 'asc')[0]).toBe('Aas');
  });
  it('picks inbox styles from message text', () => {
    expect(inboxStyle({ et: 'Palgapäev! Laekus 12 000 €', en: 'Payday!' }).icon).toBe('money');
    expect(inboxStyle({ et: 'Ametnik sai vigastada', en: 'Officer injured' }).tone).toBe('danger');
    expect(inboxStyle({ et: 'Sind edutati', en: 'You were promoted' }).icon).toBe('star');
  });
  it('draws columns with a square baseline', () => {
    expect(columnPath(0, 10, 20, 50)).toMatch(/^M0 50 V/);
    expect(columnPath(0, 50, 20, 50)).toContain('v-0.5');
  });
  it('produces nice ticks', () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 50, 100]);
    const t = niceTicks(-3200, 12400, 4);
    expect(t[0]).toBeLessThanOrEqual(-3200);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(12400);
  });
});

describe('career ui · prefecture locks', () => {
  it('marks home + unlocked regions open and gives the rest a rank requirement', () => {
    const locks = regionLocks({ regionId: 'ida', unlockedRegions: ['ida'] });
    expect(locks.map((l) => l.id)).toEqual(['pohja', 'ida', 'louna', 'laane']);
    expect(locks.find((l) => l.id === 'ida')).toMatchObject({ unlocked: true, minRank: undefined });
    expect(locks.filter((l) => !l.unlocked)).toHaveLength(3);
    const two = regionLocks({ regionId: 'pohja', unlockedRegions: ['pohja', 'louna'] });
    expect(two.filter((l) => l.unlocked).map((l) => l.id)).toEqual(['pohja', 'louna']);
  });
});

describe('career ui · i18n', () => {
  it('has Estonian and English for every career key', () => {
    const keys = Object.keys(DICT).filter((k) => k.startsWith('career.'));
    expect(keys.length).toBeGreaterThan(200);
    for (const k of keys) {
      expect(DICT[k].et, k).toBeTruthy();
      expect(DICT[k].en, k).toBeTruthy();
    }
  });
  it('covers all dynamic key families', () => {
    for (const r of ['pohja', 'ida', 'louna', 'laane']) for (const f of ['name', 'short', 'hq', 'desc', 'trait']) expect(DICT[`career.region.${r}.${f}`], `${r}.${f}`).toBeDefined();
    for (const u of ['patrol', 'rapid', 'k9', 'traffic', 'criminal', 'special', 'heli', 'border', 'aux', 'community', 'transport', 'boat']) {
      expect(DICT[`career.spec.${u}`], u).toBeDefined();
      expect(DICT[`career.specShort.${u}`], u).toBeDefined();
    }
    for (const k of ['budget', 'bonus', 'salary', 'hire', 'vehicle', 'upgrade', 'upkeep', 'fuel', 'overtime', 'fine', 'other']) expect(DICT[`career.kind.${k}`], k).toBeDefined();
    for (const s of ['active', 'injured', 'vacation', 'training']) expect(DICT[`career.status.${s}`], s).toBeDefined();
    for (const s of ['ok', 'accent', 'warn', 'danger']) expect(DICT[`career.staatus.${s}`], s).toBeDefined();
  });
});
