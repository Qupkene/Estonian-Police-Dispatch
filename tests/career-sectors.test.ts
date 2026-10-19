// @vitest-environment jsdom
// Career responsibility (docs/SECTORS.md, "Career" and "Old careers"): the sectors a career covers, the prefect's
// offers, posts, the daily budget, the position title, old careers and the career normaliser. Runs against small
// fixture sectors (Põhja, Lõuna and Ida; Lääne has no sector data here, so it is one whole area).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAILY_BUDGET,
  RANKS,
  SECTOR_BUDGET,
  SECTOR_HANDOVER,
  SECTOR_OFFER,
  START_MONEY,
} from '@/data/economy';
import { applyShiftReport, dailyBudget, monthlyCosts, newCareer, rankOf } from '@/sim/career';
import {
  acceptOffer,
  careerSectors,
  coversWholeRegion,
  declineOffer,
  maybeOffer,
  offerProgress,
  offerThresholds,
  openPost,
  positionTitle,
  withSectors,
} from '@/sim/careerSectors';
import { REGIONS } from '@/data/regions';
import { normalizeCareerProfile } from '@/store/migrate';
import { useCareer } from '@/store/career';
import type { CareerProfile, RegionId, ShiftReport, ShiftStats } from '@/sim/types';

vi.mock('@/data/sectors', () => {
  const S = (id: string, regionId: string, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    regionId,
    name: { et: name, en: name },
    short: name.toUpperCase(),
    match: {},
    stationIds: [],
    neighbours: [],
    blurb: { et: '', en: '' },
    traits: [],
    colleague: { firstName: 'Mari', lastName: 'Kask', gender: 'F' },
    ...extra,
  });
  return {
    SECTORS: [
      S('pohja-kesklinn', 'pohja', 'Tallinna kesklinn', {
        stationIds: ['pohja-hq'],
        neighbours: ['pohja-lasnamae', 'pohja-laane'],
        starter: { difficulty: 'normal' },
        posts: [{ stationId: 'pohja-pohjatallinn', price: 12000, upkeep: 450 }],
      }),
      S('pohja-lasnamae', 'pohja', 'Lasnamäe', {
        neighbours: ['pohja-kesklinn', 'pohja-idaharju'],
        starter: { difficulty: 'hard' },
      }),
      S('pohja-laane', 'pohja', 'Lääne-Tallinn', { neighbours: ['pohja-kesklinn', 'pohja-laaneharju'] }),
      S('pohja-idaharju', 'pohja', 'Ida-Harju', {
        neighbours: ['pohja-lasnamae'],
        posts: [{ stationId: 'pohja-kose', price: 15000, upkeep: 500 }],
      }),
      S('pohja-laaneharju', 'pohja', 'Lääne-Harju', { neighbours: ['pohja-laane'] }),
      // Lõuna lists an easy starter first: a prefecture unlocked by rank still starts in the normal one.
      S('louna-viljandi', 'louna', 'Viljandimaa', {
        neighbours: ['louna-tartumaa'],
        starter: { difficulty: 'easy' },
      }),
      S('louna-tartu', 'louna', 'Tartu linn', {
        neighbours: ['louna-tartumaa'],
        starter: { difficulty: 'normal' },
      }),
      S('louna-tartumaa', 'louna', 'Tartumaa ja Elva', {
        neighbours: ['louna-tartu', 'louna-viljandi'],
        posts: [{ stationId: 'lo-elva', price: 14000, upkeep: 400 }],
      }),
      S('ida-narva', 'ida', 'Narva', { neighbours: ['ida-johvi'], starter: { difficulty: 'hard' } }),
      S('ida-johvi', 'ida', 'Jõhvi ja Kohtla-Järve', { neighbours: ['ida-narva', 'ida-virumaa'] }),
      S('ida-virumaa', 'ida', 'Lääne-Virumaa', {
        neighbours: ['ida-johvi'],
        starter: { difficulty: 'easy' },
      }),
    ],
  };
});

const POHJA = ['pohja-kesklinn', 'pohja-lasnamae', 'pohja-laane', 'pohja-idaharju', 'pohja-laaneharju'];

function stats(over: Partial<ShiftStats> = {}): ShiftStats {
  const byP = { 1: 0, 2: 0, 3: 0, 4: 0 };
  return {
    incidents: 12,
    closed: 12,
    byPriority: byP,
    responseTimes: { 1: [], 2: [], 3: [], 4: [] },
    arrests: 1,
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
    score: 70,
    ...over,
  };
}

/** A good career shift: grade B, +5 Staatus, 250 xp. */
function report(over: Partial<ShiftReport> & { extras?: Record<string, unknown> } = {}): ShiftReport {
  return {
    regionId: 'pohja',
    mode: 'career',
    difficulty: 'normal',
    start: 0,
    end: 0,
    playerName: 'Test',
    stats: stats(),
    avgResponse: {},
    score: 70,
    grade: 'B',
    xp: 250,
    reputationDelta: 5,
    earnings: { bonus: 240, fuel: 30, overtime: 0, fines: 0, total: 210 },
    kmDriven: 200,
    injuredOfficers: [],
    officerXp: {},
    highlights: [],
    newspaper: { masthead: '', date: '', headline: { et: '', en: '' }, sub: { et: '', en: '' }, stories: [] },
    ...over,
  } as ShiftReport;
}

/** Play `n` good shifts in the career's home prefecture; the messages of the last one. */
function play(p: CareerProfile, n: number, over: Parameters<typeof report>[0] = {}) {
  let out = { profile: p, messages: [] as { et: string; en: string }[] };
  for (let i = 0; i < n; i++)
    out = applyShiftReport(out.profile, report({ regionId: out.profile.regionId, ...over }));
  return out;
}

/** A career that has earned an offer: 3 shifts on, Staatus 40, rank Konstaabel. */
function proven(p = newCareer('Mari Maasikas', '123', 'pohja', 7)): CareerProfile {
  return {
    ...p,
    reputation: 40,
    xp: RANKS[1].xp,
    history: [1, 2, 3].map((day) => ({
      day,
      regionId: p.regionId,
      score: 70,
      grade: 'B' as const,
      incidents: 10,
      earnings: 500,
      reputationDelta: 5,
    })),
    day: 4,
  };
}

/** A career from before sectors (as 92ed7f5 and the previous release wrote it). */
function oldCareer(regions: RegionId[] = ['pohja']): CareerProfile {
  const p = { ...newCareer('Vana Olija', '085', regions[0], 3), unlockedRegions: regions } as CareerProfile;
  delete p.sectors;
  delete p.openPosts;
  delete p.sectorsChangedDay;
  return p;
}

describe('a new career starts at one desk', () => {
  it('covers its starter sector with a force for one sector', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    expect(p.sectors).toEqual({ pohja: ['pohja-kesklinn'] });
    expect(p.sectorsChangedDay).toBe(1);
    expect(p.offer).toBeUndefined();
    expect(p.openPosts).toEqual([]);
    expect(p.money).toBe(START_MONEY);
    expect(START_MONEY).toBe(30000);
    expect(p.staff).toHaveLength(10);
    expect(p.staff.filter((m) => m.specialty === 'patrol')).toHaveLength(9);
    expect(p.staff.filter((m) => m.specialty === 'criminal')).toHaveLength(1);
    expect(p.fleet).toHaveLength(5);
    expect(coversWholeRegion(p, 'pohja')).toBe(false);
    expect(careerSectors(p, 'pohja')).toEqual(['pohja-kesklinn']);
    expect(positionTitle(p)).toEqual({ et: 'Operatiivinfo haldur', en: 'Dispatcher' });
  });

  it('starts in the sector picked on the onboarding screen, or the first starter when it is not one of the prefecture', () => {
    expect(newCareer('A', '1', 'pohja', 1, 'pohja-lasnamae').sectors).toEqual({ pohja: ['pohja-lasnamae'] });
    expect(newCareer('A', '1', 'pohja', 1, 'louna-tartu').sectors).toEqual({ pohja: ['pohja-kesklinn'] });
    expect(newCareer('A', '1', 'ida', 1).sectors).toEqual({ ida: ['ida-narva'] });
    // A prefecture without sector data is one whole area.
    const laane = newCareer('A', '1', 'laane', 1);
    expect(laane.sectors).toEqual({ laane: [] });
    expect(coversWholeRegion(laane, 'laane')).toBe(true);
  });

  it('makes money on an ordinary shift (careers are meant to be pleasant)', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    const { profile } = applyShiftReport(p, report());
    expect(profile.money).toBeGreaterThan(p.money);
    const daily = monthlyCosts(p).total / 30;
    expect(dailyBudget(p)).toBeGreaterThan(daily);
  });
});

describe('daily budget', () => {
  it('base plus per sector for a career created with sectors, exactly DAILY_BUDGET for a converted one', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    expect(dailyBudget(p)).toBe(SECTOR_BUDGET.base + SECTOR_BUDGET.perSector);
    const two = { ...p, sectors: { pohja: ['pohja-kesklinn', 'pohja-lasnamae'] } };
    expect(dailyBudget(two)).toBe(SECTOR_BUDGET.base + 2 * SECTOR_BUDGET.perSector);
    // Covering a prefecture whole never pays less than DAILY_BUDGET.
    const whole = { ...p, sectors: { pohja: POHJA } };
    expect(dailyBudget(whole)).toBe(
      Math.max(DAILY_BUDGET.pohja, SECTOR_BUDGET.base + 5 * SECTOR_BUDGET.perSector),
    );
    expect(
      dailyBudget({
        ...p,
        regionId: 'laane' as const,
        sectors: { laane: [] },
        unlockedRegions: ['laane' as const],
      }),
    ).toBe(DAILY_BUDGET.laane);
    // Careers from before sectors keep exactly today's numbers, in every prefecture.
    for (const r of ['pohja', 'ida', 'louna', 'laane'] as const) {
      const old = oldCareer([r]);
      expect(dailyBudget(old, r)).toBe(DAILY_BUDGET[r]);
      expect(dailyBudget(withSectors(old), r)).toBe(DAILY_BUDGET[r]);
    }
  });

  it('is what a shift pays, with the post upkeep in the running costs', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    const out = applyShiftReport(p, report());
    const budget = out.ledger.find((e) => e.kind === 'budget')!;
    expect(budget.amount).toBe(dailyBudget(p));
    expect(budget.text.et).toBe('Päevaeelarve (1 sektor)');
    const old = applyShiftReport(oldCareer(), report()).ledger.find((e) => e.kind === 'budget')!;
    expect(old).toMatchObject({
      amount: DAILY_BUDGET.pohja,
      text: { et: 'Prefektuuri päevaeelarve', en: 'Prefecture daily budget' },
    });

    const opened = openPost(p, 'pohja-pohjatallinn').profile;
    expect(monthlyCosts(opened).posts).toBe(450);
    expect(monthlyCosts(opened).upkeep).toBe(monthlyCosts(p).upkeep + 450);
    expect(monthlyCosts(opened).total).toBe(monthlyCosts(p).total + 450);
    const upkeep = applyShiftReport(opened, report()).ledger.find((e) => e.kind === 'upkeep')!;
    expect(upkeep.amount).toBe(-Math.round(monthlyCosts(opened).upkeep / 30));
    expect(upkeep.text.et).toMatch(/politseipunktide/);
    expect(applyShiftReport(p, report()).ledger.find((e) => e.kind === 'upkeep')!.text.et).toBe(
      'Sõidukite ja täienduste ülalpidamine',
    );
  });
});

describe('position title', () => {
  it('comes from the area covered', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    const title = (x: CareerProfile) => positionTitle(x).et;
    expect(title(p)).toBe('Operatiivinfo haldur');
    expect(title({ ...p, sectors: { pohja: ['pohja-kesklinn', 'pohja-laane'] } })).toBe(
      'Vanem-operatiivinfo haldur',
    );
    expect(title({ ...p, sectors: { pohja: POHJA } })).toBe('Vahetuse vanem');
    expect(
      title({ ...p, sectors: { pohja: POHJA, louna: ['louna-tartu'] }, unlockedRegions: ['pohja', 'louna'] }),
    ).toBe('Vahetuse vanem');
    expect(title({ ...p, sectors: { pohja: POHJA, laane: [] }, unlockedRegions: ['pohja', 'laane'] })).toBe(
      'Grupijuht',
    );
    const all = withSectors(oldCareer(['pohja', 'louna', 'ida', 'laane']));
    expect(positionTitle(all)).toEqual({ et: 'Keskuse juht', en: 'Head of the command centre' });
    // An old career holds the Vahetuse vanem position at once.
    expect(title(withSectors(oldCareer()))).toBe('Vahetuse vanem');
    expect(positionTitle(oldCareer()).en).toBe('Shift supervisor');
  });
});

describe("the prefect's offers", () => {
  it('come after three paid shifts with Staatus and rank above thresholds that rise with the sectors covered', () => {
    expect(offerThresholds(1)).toEqual({ reputation: SECTOR_OFFER.reputation, rank: 1 });
    expect(offerThresholds(2)).toEqual({
      reputation: SECTOR_OFFER.reputation + SECTOR_OFFER.reputationStep,
      rank: 2,
    });
    expect(offerThresholds(6).reputation).toBeLessThanOrEqual(SECTOR_OFFER.maxReputation);
    const p = proven();
    expect(maybeOffer({ ...p, history: p.history.slice(1) }, 'pohja').offer).toBeUndefined();
    expect(maybeOffer({ ...p, reputation: 29 }, 'pohja').offer).toBeUndefined();
    expect(maybeOffer({ ...p, xp: 0 }, 'pohja').offer).toBeUndefined();
    const offered = maybeOffer(p, 'pohja');
    expect(offered.offer?.regionId).toBe('pohja');
    expect(offered.offer?.day).toBe(p.day);
    // Neighbours of the covered sector only, one or two of them.
    expect(offered.offer!.choices.length).toBeGreaterThanOrEqual(1);
    expect(offered.offer!.choices.length).toBeLessThanOrEqual(2);
    for (const id of offered.offer!.choices) expect(['pohja-lasnamae', 'pohja-laane']).toContain(id);
    // Deterministic from the seed and the day.
    expect(maybeOffer(p, 'pohja')).toEqual(offered);
    const sizes = new Set(
      Array.from({ length: 40 }, (_, d) => maybeOffer({ ...p, day: 4 + d }, 'pohja').offer!.choices.length),
    );
    expect([...sizes].sort()).toEqual([1, 2]);
    // A second sector needs more.
    const two = { ...p, sectors: { pohja: ['pohja-kesklinn', 'pohja-lasnamae'] } };
    expect(maybeOffer(two, 'pohja').offer).toBeUndefined();
    const twoReady = { ...two, reputation: offerThresholds(2).reputation, xp: RANKS[2].xp };
    for (const id of maybeOffer(twoReady, 'pohja').offer!.choices)
      expect(['pohja-laane', 'pohja-idaharju']).toContain(id);
  });

  it('never come while one waits, in a locked prefecture or one covered whole', () => {
    const p = proven();
    const waiting = maybeOffer(p, 'pohja');
    expect(maybeOffer(waiting, 'pohja')).toBe(waiting);
    expect(maybeOffer(p, 'louna')).toBe(p);
    expect(maybeOffer({ ...p, sectors: { pohja: POHJA } }, 'pohja').offer).toBeUndefined();
    // A converted career covers its prefectures whole: no offers, ever.
    expect(
      maybeOffer(
        { ...withSectors(oldCareer()), reputation: 100, xp: 99999, history: p.history, day: 4 },
        'pohja',
      ).offer,
    ).toBeUndefined();
  });

  it('say what is still needed', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    const fresh = offerProgress(p);
    expect(fresh.ready).toBe(false);
    expect(fresh.needs.map((t) => t.en)).toEqual([
      `${SECTOR_OFFER.shifts} more shifts`,
      'Staatus at least 30 (now 25)',
      `Rank: ${RANKS[1].name.en}`,
    ]);
    expect(fresh.needs[0].et).toBe(`Veel ${SECTOR_OFFER.shifts} vahetust`);
    expect(offerProgress({ ...proven(), history: proven().history.slice(1) }).needs.map((t) => t.en)).toEqual(
      ['1 more shift'],
    );
    expect(offerProgress(proven())).toEqual({ ready: true, needs: [] });
    expect(offerProgress(maybeOffer(proven(), 'pohja'))).toEqual({ ready: true, needs: [] });
    // Nothing left to offer.
    expect(offerProgress(withSectors(oldCareer()))).toEqual({ ready: false, needs: [] });
  });

  it('arrive in the inbox after a paid shift', () => {
    let p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    p = play(p, 2).profile;
    expect(p.offer).toBeUndefined();
    const third = play(p, 1);
    expect(rankOf(third.profile.xp).index).toBeGreaterThanOrEqual(1);
    expect(third.profile.offer).toBeDefined();
    const names = third.profile.offer!.choices.map(
      (id) => ({ 'pohja-lasnamae': 'Lasnamäe', 'pohja-laane': 'Lääne-Tallinn' })[id]!,
    );
    const msg = third.messages.find((m) => m.et.startsWith('Prefekt pakub'))!;
    expect(msg.et).toContain(names.join(' või '));
    expect(msg.en).toContain(names.join(' or '));
    // The offer waits for an answer: no second message.
    expect(play(third.profile, 1).messages.some((m) => m.et.startsWith('Prefekt pakub'))).toBe(false);
  });

  it('accepting adds the sector with its crew, used cars, a bigger budget and a ledger entry', () => {
    const p = maybeOffer(proven(), 'pohja');
    const id = p.offer!.choices[0];
    const snapshot = JSON.stringify(p);
    const { profile: out, error } = acceptOffer(p, id);
    expect(error).toBeUndefined();
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(out.sectors!.pohja).toEqual(['pohja-kesklinn', id]);
    expect(out.offer).toBeUndefined();
    expect(out.sectorsChangedDay).toBe(p.day);
    const crew = out.staff.slice(p.staff.length);
    expect(crew.length).toBeGreaterThanOrEqual(SECTOR_HANDOVER.staff[0]);
    expect(crew.length).toBeLessThanOrEqual(SECTOR_HANDOVER.staff[1]);
    expect(crew.some((m) => m.morale < 0.5)).toBe(true);
    for (const m of crew) expect(m.hiredDay).toBe(p.day);
    expect(new Set(out.staff.map((m) => m.id)).size).toBe(out.staff.length);
    expect(new Set(out.staff.map((m) => m.badge).concat(out.badge)).size).toBe(out.staff.length + 1);
    const cars = out.fleet.slice(p.fleet.length);
    expect(cars).toHaveLength(2);
    for (const v of cars) {
      expect(v.condition).toBeGreaterThanOrEqual(SECTOR_HANDOVER.condition[0]);
      expect(v.condition).toBeLessThanOrEqual(SECTOR_HANDOVER.condition[1]);
      expect(v.suits).toContain('patrol');
    }
    expect(new Set(out.fleet.map((v) => v.id)).size).toBe(out.fleet.length);
    expect(dailyBudget(out)).toBe(dailyBudget(p) + SECTOR_BUDGET.perSector);
    // The new crew and cars cost less a day than the budget grows.
    expect((monthlyCosts(out).total - monthlyCosts(p).total) / 30).toBeLessThan(SECTOR_BUDGET.perSector);
    expect(out.money).toBe(p.money + SECTOR_HANDOVER.grant);
    expect(out.ledger.at(-1)).toMatchObject({ day: p.day, kind: 'budget', amount: SECTOR_HANDOVER.grant });
    expect(out.ledger.at(-1)!.text.et).toContain('Uus sektor');
    expect(positionTitle(out).et).toBe('Vanem-operatiivinfo haldur');
    // Only an offered sector, only while offered.
    expect(acceptOffer(p, 'pohja-idaharju').error).toBeDefined();
    expect(acceptOffer(p, 'nope').error).toBeDefined();
    expect(acceptOffer(out, id).error).toBeDefined();
    // The next offer is paced from the change.
    expect(maybeOffer({ ...out, reputation: 90, xp: 99999 }, 'pohja').offer).toBeUndefined();
  });

  it('declining clears the offer, which comes back about five shifts later', () => {
    const third = play(newCareer('Mari Maasikas', '123', 'pohja', 7), 3).profile;
    expect(third.offer).toBeDefined();
    let p = declineOffer(third);
    expect(p.offer).toBeUndefined();
    expect(p.sectorsChangedDay).toBe(third.day + SECTOR_OFFER.declinePause);
    expect(declineOffer(p)).toBe(p);
    const wait = SECTOR_OFFER.shifts + SECTOR_OFFER.declinePause;
    for (let i = 1; i <= 5; i++) {
      // The career screen counts the pause too: 5 more shifts right after the decline, then one less each shift.
      const left = wait - (i - 1);
      expect(
        offerProgress(p).needs.map((t) => t.en),
        `before shift ${i}`,
      ).toEqual([left === 1 ? '1 more shift' : `${left} more shifts`]);
      p = play(p, 1).profile;
      expect(!!p.offer, `shift ${i}`).toBe(i === SECTOR_OFFER.shifts + SECTOR_OFFER.declinePause);
    }
  });
});

describe('posts', () => {
  it('open with money in a covered sector only', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    const { profile, error } = openPost(p, 'pohja-pohjatallinn');
    expect(error).toBeUndefined();
    expect(profile.openPosts).toEqual(['pohja-pohjatallinn']);
    expect(profile.money).toBe(p.money - 12000);
    expect(profile.ledger.at(-1)).toMatchObject({ kind: 'upgrade', amount: -12000 });
    expect(profile.ledger.at(-1)!.text.et).toMatch(/^Politseipunkt avatud: /);
    expect(p.openPosts).toEqual([]); // input untouched
    expect(openPost(profile, 'pohja-pohjatallinn').error?.en).toMatch(/already open/);
    expect(openPost(p, 'pohja-kose').error?.en).toMatch(/sector you cover/);
    expect(openPost(p, 'lo-elva').error?.en).toMatch(/sector you cover/);
    expect(openPost({ ...p, money: 100 }, 'pohja-pohjatallinn').error?.en).toMatch(/Not enough money/);
    expect(openPost(p, 'pohja-hq').error?.en).toMatch(/no such police post/);
  });

  it('cost upkeep only while they have a crew: not once the prefecture is covered whole', () => {
    const opened = openPost(newCareer('Mari Maasikas', '123', 'pohja', 7), 'pohja-pohjatallinn').profile;
    expect(monthlyCosts(opened).posts).toBe(450);
    // Covering Põhja whole, its crews follow the old allocation (no crew at the post) and the career screen
    // lists no posts: the upkeep stops instead of being paid for nothing.
    const whole = { ...opened, sectors: { pohja: POHJA } };
    expect(coversWholeRegion(whole, 'pohja')).toBe(true);
    expect(monthlyCosts(whole).posts).toBe(0);
    expect(monthlyCosts(whole).total).toBe(monthlyCosts(opened).total - 450);
    const out = applyShiftReport(whole, report());
    expect(out.ledger.find((e) => e.kind === 'upkeep')!.text.et).toBe('Sõidukite ja täienduste ülalpidamine');
    // A post of a sector not covered (or not known) costs nothing either.
    expect(monthlyCosts({ ...opened, openPosts: ['pohja-kose', 'nope'] }).posts).toBe(0);
  });
});

describe('other prefectures', () => {
  it('a career created with sectors starts a prefecture unlocked by rank in one starter sector (a normal one)', () => {
    const p = { ...newCareer('Mari Maasikas', '123', 'pohja', 7), xp: RANKS[2].xp - 10 };
    const out = applyShiftReport(p, report({ xp: 50 }));
    expect(out.profile.unlockedRegions).toEqual(['pohja', 'louna']);
    expect(out.profile.sectors).toEqual({ pohja: ['pohja-kesklinn'], louna: ['louna-tartu'] });
    expect(out.messages.find((m) => m.et.startsWith('Uus prefektuur'))!.et).toContain('Tartu linn');
    expect(coversWholeRegion(out.profile, 'louna')).toBe(false);
    // One force answers for both: the budget counts every sector covered, wherever the shift is played.
    for (const r of ['pohja', 'louna'] as const)
      expect(dailyBudget(out.profile, r)).toBe(SECTOR_BUDGET.base + 2 * SECTOR_BUDGET.perSector);
    const there = applyShiftReport(out.profile, report({ regionId: 'louna' }));
    expect(there.ledger.find((e) => e.kind === 'budget')).toMatchObject({
      amount: SECTOR_BUDGET.base + 2 * SECTOR_BUDGET.perSector,
      text: { et: 'Päevaeelarve (2 sektorit)', en: 'Daily budget (2 sectors)' },
    });
  });

  it('a converted career takes it whole, as before', () => {
    const old = { ...withSectors(oldCareer()), xp: RANKS[2].xp - 10 };
    const out = applyShiftReport(old, report({ xp: 50 }));
    expect(out.profile.sectors!.louna).toEqual(['louna-viljandi', 'louna-tartu', 'louna-tartumaa']);
    expect(out.messages.find((m) => m.et.startsWith('Uus prefektuur'))!.et).toBe(
      `Uus prefektuur avatud: ${REGIONS.louna.name.et}.`,
    );
    // A raw profile without sectors stays without them (missing means whole).
    const raw = applyShiftReport({ ...oldCareer(), xp: RANKS[2].xp - 10 }, report({ xp: 50 })).profile;
    expect(raw.sectors).toBeUndefined();
    expect(coversWholeRegion(raw, 'louna')).toBe(true);
  });
});

describe('help given to the AI colleagues', () => {
  it('adds a little Staatus, nothing when the report has no such extra', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    const base = applyShiftReport(p, report()).profile.reputation;
    expect(base).toBe(p.reputation + 5);
    const helped = (helpGiven: unknown) => report({ extras: { dayTags: [], helpGiven } });
    expect(applyShiftReport(p, helped(2)).profile.reputation).toBe(base + 2);
    expect(applyShiftReport(p, helped(40)).profile.reputation).toBe(base + 3);
    expect(applyShiftReport(p, helped('x')).profile.reputation).toBe(base);
    expect(applyShiftReport(p, report({ extras: { dayTags: [] } })).profile.reputation).toBe(base);
    const out = applyShiftReport(p, helped(1));
    expect(out.messages.some((m) => /kolleegid/.test(m.et))).toBe(true);
    expect(out.profile.history.at(-1)!.reputationDelta).toBe(6);
  });
});

describe('old careers (withSectors)', () => {
  it('get every sector of each unlocked prefecture; staff, fleet, money and history untouched', () => {
    const old = { ...oldCareer(['pohja', 'louna', 'laane']), money: 4321 };
    const p = withSectors(old);
    expect(p.sectors).toEqual({
      pohja: POHJA,
      louna: ['louna-viljandi', 'louna-tartu', 'louna-tartumaa'],
      laane: [],
    });
    expect({ ...p, sectors: undefined }).toEqual({ ...old, sectors: undefined });
    expect(p.sectorsChangedDay).toBeUndefined();
    for (const r of ['pohja', 'louna', 'laane'] as const) expect(coversWholeRegion(p, r)).toBe(true);
    expect(withSectors(p)).toEqual(p);
    // A converted career stays whole when the prefecture gains a sector later.
    expect(
      withSectors({ ...p, sectors: { ...p.sectors, pohja: ['pohja-kesklinn'] } }).sectors!.pohja,
    ).toEqual(POHJA);
  });

  it('drop invalid ids, give every unlocked prefecture an entry, and are idempotent', () => {
    const p = {
      ...newCareer('Mari Maasikas', '123', 'pohja', 7),
      unlockedRegions: ['pohja', 'louna', 'ida'] as RegionId[],
    };
    const out = withSectors({
      ...p,
      sectors: { pohja: ['pohja-kesklinn', 'louna-tartu', 'nope', 'pohja-kesklinn', 'pohja-laane'], ida: [] },
    });
    expect(out.sectors).toEqual({
      pohja: ['pohja-kesklinn', 'pohja-laane'],
      louna: ['louna-tartu'],
      ida: ['ida-virumaa'],
    });
    expect(withSectors(out)).toEqual(out);
    // Sectors of a prefecture not unlocked (yet) are kept.
    expect(
      withSectors({ ...p, sectors: { pohja: ['pohja-kesklinn'], laane: [] }, unlockedRegions: ['pohja'] })
        .sectors,
    ).toEqual({ pohja: ['pohja-kesklinn'], laane: [] });
  });

  it('drop an offer that is gone stale', () => {
    const p = newCareer('Mari Maasikas', '123', 'pohja', 7);
    const offer = {
      regionId: 'pohja' as const,
      choices: ['pohja-lasnamae', 'pohja-kesklinn', 'nope'],
      day: 3,
    };
    expect(withSectors({ ...p, offer }).offer).toEqual({ ...offer, choices: ['pohja-lasnamae'] });
    expect(withSectors({ ...p, offer: { ...offer, choices: ['pohja-kesklinn'] } }).offer).toBeUndefined();
    expect(
      withSectors({ ...p, offer: { ...offer, regionId: 'louna', choices: ['louna-tartu'] } }).offer,
    ).toBeUndefined();
  });
});

describe('the career normaliser', () => {
  /** A 2.0 career: one sector, an opened post and the prefect's offer waiting. */
  function current(): CareerProfile {
    return maybeOffer(
      proven(openPost(newCareer('Mari Maasikas', '123', 'pohja', 7), 'pohja-pohjatallinn').profile),
      'pohja',
    );
  }

  it('gives a stored 2.0 profile back deep-equal, with nothing to repair', () => {
    const p = JSON.parse(JSON.stringify(current())) as CareerProfile;
    expect(p.offer).toBeDefined();
    const issues: string[] = [];
    expect(normalizeCareerProfile(p, issues)).toEqual(p);
    expect(issues).toEqual([]);
  });

  it('converts a profile from before sectors without calling it a repair', () => {
    const old = JSON.parse(JSON.stringify(oldCareer(['pohja', 'louna']))) as CareerProfile;
    const issues: string[] = [];
    const p = normalizeCareerProfile(old, issues)!;
    expect(issues).toEqual([]);
    expect(p.sectors).toEqual({ pohja: POHJA, louna: ['louna-viljandi', 'louna-tartu', 'louna-tartumaa'] });
    expect({ ...p, sectors: undefined }).toEqual({ ...old, sectors: undefined });
    expect(normalizeCareerProfile(p)).toEqual(p);
  });

  it('drops bad entries one by one and lists them, the rest stays', () => {
    const p = current();
    const issues: string[] = [];
    const got = normalizeCareerProfile(
      {
        ...p,
        sectors: { pohja: ['pohja-kesklinn', 7, 'louna-tartu'], saared: ['x'], louna: 'tartu' },
        openPosts: ['pohja-pohjatallinn', null],
        offer: { ...p.offer, choices: [p.offer!.choices[0], 3], day: 'soon' },
        sectorsChangedDay: 'eile',
      },
      issues,
    )!;
    expect(got.sectors).toEqual({ pohja: ['pohja-kesklinn'] });
    expect(got.openPosts).toEqual(['pohja-pohjatallinn']);
    expect(got.offer).toEqual({ ...p.offer, choices: [p.offer!.choices[0]], day: p.day });
    expect(got.sectorsChangedDay).toBe(1);
    expect(issues.sort()).toEqual(
      [
        'offer.choices[1]',
        'offer.day',
        'openPosts[1]',
        'sectors.louna',
        'sectors.pohja[1]',
        'sectors.pohja[2]',
        'sectors.saared',
        'sectorsChangedDay',
      ].sort(),
    );
    expect(normalizeCareerProfile(got)).toEqual(got);
    // Shapes that cannot be used at all.
    const bad: string[] = [];
    const none = normalizeCareerProfile(
      { ...p, sectors: ['pohja-kesklinn'], offer: { regionId: 'saared', choices: [] } },
      bad,
    )!;
    expect(bad).toEqual(['sectors', 'offer']);
    expect(none.offer).toBeUndefined();
    // Without a usable `sectors` the career covers its unlocked prefectures whole: generous, never a lockout.
    expect(none.sectors).toEqual({ pohja: POHJA });
  });

  it("keeps a later version's sector of the prefecture without playing it, so a sync never loses it", () => {
    const p = current();
    const issues: string[] = [];
    const got = normalizeCareerProfile(
      { ...p, sectors: { pohja: ['pohja-kesklinn', 'pohja-uuslinn', 'louna-uuslinn', 'Pohja-X'] } },
      issues,
    )!;
    expect(got.sectors).toEqual({ pohja: ['pohja-kesklinn', 'pohja-uuslinn'] });
    expect(issues.sort()).toEqual(['sectors.pohja[2]', 'sectors.pohja[3]']);
    expect(careerSectors(got, 'pohja')).toEqual(['pohja-kesklinn']);
    expect(normalizeCareerProfile(got)).toEqual(got);
    // Accepting an offer keeps it too.
    const accepted = acceptOffer(got, got.offer!.choices[0]).profile;
    expect(accepted.sectors!.pohja).toEqual(['pohja-kesklinn', 'pohja-uuslinn', got.offer!.choices[0]]);
    // Only later sectors in a prefecture: it still gets a starter sector to play.
    const only = normalizeCareerProfile({ ...p, sectors: { pohja: ['pohja-uuslinn'] } })!;
    expect(only.sectors!.pohja![0]).toBe('pohja-uuslinn');
    expect(careerSectors(only, 'pohja')).toHaveLength(1);
  });
});

describe('the career store', () => {
  beforeEach(() => {
    useCareer.setState(useCareer.getInitialState(), true);
    localStorage.clear();
  });

  it('creates a career in the picked sector and answers offers and posts through its actions', () => {
    useCareer.getState().create('Mari Maasikas', '123', 'pohja', 'pohja-lasnamae');
    expect(useCareer.getState().profile!.sectors).toEqual({ pohja: ['pohja-lasnamae'] });
    useCareer.getState().create('Mari Maasikas', '123', 'pohja');
    expect(useCareer.getState().profile!.sectors).toEqual({ pohja: ['pohja-kesklinn'] });

    expect(useCareer.getState().acceptOffer('pohja-laane')?.en).toMatch(/no offer/);
    expect(useCareer.getState().openPost('pohja-kose')?.en).toMatch(/sector you cover/);
    expect(useCareer.getState().openPost('pohja-pohjatallinn')).toBeUndefined();
    expect(useCareer.getState().profile!.openPosts).toEqual(['pohja-pohjatallinn']);

    useCareer.getState().update((p) => maybeOffer(proven(p), 'pohja'));
    const choice = useCareer.getState().profile!.offer!.choices[0];
    expect(useCareer.getState().acceptOffer(choice)).toBeUndefined();
    expect(useCareer.getState().profile!.sectors!.pohja).toContain(choice);

    useCareer.getState().update((p) =>
      maybeOffer(
        {
          ...p,
          history: [...p.history, ...[5, 6, 7].map((day) => ({ ...p.history[0], day }))],
          day: 8,
          reputation: 60,
          xp: RANKS[3].xp,
        },
        'pohja',
      ),
    );
    expect(useCareer.getState().profile!.offer).toBeDefined();
    useCareer.getState().declineOffer();
    expect(useCareer.getState().profile!.offer).toBeUndefined();
    // Everything went to storage.
    expect(JSON.parse(localStorage.getItem('epd:career')!).state.profile).toEqual(
      useCareer.getState().profile,
    );
  });
});
