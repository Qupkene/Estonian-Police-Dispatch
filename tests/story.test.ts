// @vitest-environment jsdom
// The career told in chapters (docs/STORY.md): chapter progression, objectives, the characters' questions, the
// texts, old careers (the chapter their state matches, no retroactive rewards) and the career normaliser.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RANKS } from '@/data/economy';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { JOURNALISTS, MENTORS, STORY_CHAPTERS, UNION_REP } from '@/data/story';
import { applyShiftReport, newCareer } from '@/sim/career';
import { acceptOffer, careerSectors, coversWholeRegion, offerProgress } from '@/sim/careerSectors';
import { sectorsOf } from '@/sim/sectors';
import {
  answerStoryChoice,
  castPerson,
  featuredDesk,
  fillStory,
  matchingChapter,
  objectiveMet,
  storyAfterShift,
  storyIntro,
  storyLine,
  storyOf,
  storyOrder,
  storyPress,
  storyProgress,
  storyView,
  type StoryMessage,
} from '@/sim/story';
import { normalizeCareerProfile } from '@/store/migrate';
import { useCareer } from '@/store/career';
import { menuNotices, noticeKind } from '@/ui/screens/shell/menuModel';
import type { CareerProfile, RegionId, ShiftReport, ShiftStats, StoryState } from '@/sim/types';

function stats(over: Partial<ShiftStats> = {}): ShiftStats {
  return {
    incidents: 10,
    closed: 10,
    byPriority: { 1: 1, 2: 3, 3: 4, 4: 2 },
    responseTimes: { 1: [], 2: [], 3: [], 4: [] },
    arrests: 1,
    civilianInjuries: 0,
    officerInjuries: 0,
    escaped: 0,
    expired: 1,
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
    score: 60,
    ...over,
  };
}

/** An ordinary career shift: grade C, nothing special, 100 xp, no Staatus change. */
function report(
  over: Omit<Partial<ShiftReport>, 'stats'> & {
    stats?: Partial<ShiftStats>;
    extras?: Record<string, unknown>;
  } = {},
): ShiftReport {
  const { stats: s, ...rest } = over;
  return {
    regionId: 'louna',
    mode: 'career',
    difficulty: 'normal',
    start: 0,
    end: 0,
    playerName: 'Test',
    avgResponse: {},
    score: 60,
    grade: 'C',
    xp: 100,
    reputationDelta: 0,
    earnings: { bonus: 0, fuel: 10, overtime: 0, fines: 0, total: -10 },
    kmDriven: 70,
    injuredOfficers: [],
    officerXp: {},
    highlights: [],
    newspaper: { masthead: '', date: '', headline: { et: '', en: '' }, sub: { et: '', en: '' }, stories: [] },
    ...rest,
    stats: stats(s),
  } as ShiftReport;
}

const fresh = (regionId: RegionId = 'louna', sector?: string) =>
  newCareer('Mari Maasikas', '214', regionId, 4242, sector);

/** Apply shifts one by one; the profile and every message on the way. */
function play(p: CareerProfile, ...reports: ShiftReport[]) {
  const messages: StoryMessage[] = [];
  let profile = p;
  for (const r of reports) {
    const out = applyShiftReport(profile, r);
    profile = out.profile;
    messages.push(...(out.messages as StoryMessage[]));
  }
  return { profile, messages, story: messages.filter((m) => m.story) };
}

/** A career from before the story (the field removed, as every career before this version). */
function older(p: CareerProfile): CareerProfile {
  const out = { ...p };
  delete out.story;
  return out;
}

beforeEach(() => {
  useCareer.setState(useCareer.getInitialState(), true);
  localStorage.clear();
});

describe('the data', () => {
  it('has five chapters with unique ids, reachable objectives and modest effects', () => {
    expect(STORY_CHAPTERS.map((c) => c.id)).toEqual([
      'esimene-laud',
      'naabrid',
      'vahetuse-vanem',
      'prefektuur',
      'keskuse-juht',
    ]);
    const ids = STORY_CHAPTERS.flatMap((c) => [
      ...c.objectives.map((o) => o.id),
      ...(c.choice ? [c.choice.id] : []),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of STORY_CHAPTERS) {
      // The question is asked before the chapter can end.
      if (c.choice) expect(c.choice.after).toBeLessThan(c.minShifts);
      expect(c.objectives.length).toBeGreaterThanOrEqual(2);
      expect(c.objectives.length).toBeLessThanOrEqual(4);
      expect(c.need).toBeGreaterThanOrEqual(1);
      expect(c.need).toBeLessThanOrEqual(c.objectives.length);
      for (const o of c.choice?.options ?? []) {
        expect(Math.abs(o.effect.reputation ?? 0)).toBeLessThanOrEqual(3);
        expect(Math.abs(o.effect.money?.amount ?? 0)).toBeLessThanOrEqual(3000);
        expect(Math.abs(o.effect.morale ?? 0)).toBeLessThanOrEqual(0.06);
      }
      expect(c.reward.reputation ?? 0).toBeLessThanOrEqual(3);
    }
  });

  it('fills every placeholder in both languages, for every prefecture, with no dashes', () => {
    const texts = STORY_CHAPTERS.flatMap((c) => [
      c.title,
      c.summary,
      c.intro.text,
      c.outro.text,
      c.order,
      c.press.title,
      c.press.body,
      ...c.objectives.map((o) => o.text),
      ...(c.choice
        ? [
            c.choice.text,
            ...c.choice.options.flatMap((o) => [
              o.label,
              o.note,
              o.reply,
              ...(o.effect.money ? [o.effect.money.text] : []),
            ]),
          ]
        : []),
    ]);
    for (const r of REGION_IDS) {
      const p = fresh(r);
      for (const text of texts) {
        const f = fillStory(p, text);
        for (const s of [f.et, f.en]) {
          expect(s, s).not.toMatch(/[{}]/);
          expect(s, s).not.toMatch(/[\u2013\u2014]/);
          expect(s.trim().length).toBeGreaterThan(0);
        }
      }
    }
    for (const person of [...Object.values(MENTORS), ...Object.values(JOURNALISTS), UNION_REP])
      expect(`${person.name} ${person.role.et} ${person.role.en}`).not.toMatch(/[\u2013\u2014]/);
  });

  it("keeps each prefecture's prefect the region's commander, and its mentor and reporter its own", () => {
    for (const r of REGION_IDS) {
      const p = fresh(r);
      expect(castPerson(p, 'prefect').name).toBe(REGIONS[r].commander!.name);
      expect(castPerson(p, 'mentor').name).toBe(MENTORS[r].name);
      expect(castPerson(p, 'journalist').name).toBe(JOURNALISTS[r].name);
    }
    expect(castPerson(fresh('louna'), 'prefect').name).toBe('Indrek Haavasalu');
    expect(castPerson(fresh('louna'), 'prefect').role.et).toBe('Lõuna prefektuuri prefekt');
  });
});

describe('a new career', () => {
  it('starts at chapter 1 with the mentor intro, from day 1', () => {
    const p = fresh('louna', 'louna-tartu');
    expect(p.story).toMatchObject({ chapter: 1, from: 1, since: 1, shifts: 0, done: [] });
    const intro = storyIntro(p)!;
    expect(intro.who).toEqual({ name: 'Mati Tõnisson', role: MENTORS.louna.role });
    expect(intro.et).toContain('Mari');
    expect(intro.et).toContain('Tartu linn');
    expect(intro.story).toEqual({ chapter: 1, kind: 'intro' });
    expect(noticeKind(intro)).toBe('story');
  });

  it('features a neighbouring desk drawn from the seed, the same every time', () => {
    const p = fresh('louna', 'louna-tartu');
    const desk = p.story!.desk!;
    expect(sectorsOf('louna').find((s) => s.id === 'louna-tartu')!.neighbours).toContain(desk);
    expect(featuredDesk(fresh('louna', 'louna-tartu'))).toBe(desk);
    const c = castPerson(p, 'colleague');
    const sector = sectorsOf('louna').find((s) => s.id === desk)!;
    expect(c.name).toBe(`${sector.colleague.firstName} ${sector.colleague.lastName}`);
  });

  it('the store puts the intro in the inbox on create', () => {
    useCareer.getState().create('Mari Maasikas', '214', 'ida', 'ida-narva');
    const inbox = useCareer.getState().inbox as StoryMessage[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0].who?.name).toBe(MENTORS.ida.name);
  });
});

describe('chapter 1: objectives, the question, the outro', () => {
  it('counts shift objectives from the report and finishes with 3 of 4', () => {
    const p = fresh();
    // Shift 1: grade C, one call expired: only the shift count moves. The mentor asks his question.
    const one = play(p, report());
    expect(one.profile.story).toMatchObject({
      chapter: 1,
      shifts: 1,
      done: [],
      choice: { id: 'c1-debrief', day: 2 },
    });
    expect(one.story.map((m) => m.story.kind)).toEqual(['ask']);
    // Shift 2: grade B and 3 calls answered.
    const two = play(one.profile, report({ grade: 'B', score: 72, stats: { callsAnswered: 3 } }));
    expect(two.profile.story!.done).toEqual(['c1-grade', 'c1-calls']);
    expect(two.story.map((m) => m.story.kind)).toEqual(['goal', 'goal']);
    expect(two.story[0].et).toBe('Peatükk 1, eesmärk täidetud: Vahetus hindega B või parem.');
    // Shift 3: the third shift finishes the chapter: outro, Staatus +2, the newspaper's piece, the question lapses.
    const rep0 = two.profile.reputation;
    const three = play(two.profile, report());
    const st = three.profile.story!;
    expect(st.done).toEqual(['c1-grade', 'c1-calls', 'c1-shifts']);
    expect(three.profile.reputation).toBe(rep0 + 2);
    expect(st.answers).toEqual({ 'c1-debrief': '-' });
    expect(st.choice).toBeUndefined();
    expect(storyPress(three.profile, 3)).toMatchObject({
      day: 3,
      byline: 'Karl-Erik Mõttus, Lõuna Postipoiss',
    });
    expect(storyPress(three.profile, 3)!.title.et).toBe('Juhtimiskeskuses on uus operatiivinfo haldur');
    // 300 xp: not yet Konstaabel, so chapter 2 waits.
    expect(three.profile.xp).toBeLessThan(RANKS[1].xp);
    expect(st).toMatchObject({ chapter: 1, complete: true });
    expect(three.story.map((m) => m.story.kind)).toEqual(['goal', 'outro']);
    expect(storyView(three.profile)).toMatchObject({ state: 'waiting', next: { chapter: 2 } });
    expect(storyView(three.profile)!.next!.needs[0].et).toBe('Auaste: konstaabel');
    expect(storyOrder(three.profile)).toBeNull();
    // Shift 4 brings the rank: chapter 2 begins with the colleague's intro, from the next day.
    const four = play(three.profile, report());
    expect(four.profile.story).toMatchObject({ chapter: 2, since: 5, shifts: 0, done: [], from: 1 });
    expect(four.profile.story!.complete).toBeUndefined();
    expect(four.story.map((m) => m.story.kind)).toEqual(['intro']);
    expect(four.story[0].who!.role.et).toContain('laud');
    expect(storyOrder(four.profile)!.et).toContain('naaberlaudadega');
  });

  it('never finishes a chapter twice or gives its reward again', () => {
    const p = fresh();
    const done = play(p, report({ grade: 'A', stats: { callsAnswered: 4, expired: 0 } }), report(), report());
    expect(done.profile.story!.complete).toBe(true);
    const rep = done.profile.reputation;
    const again = play({ ...done.profile, xp: 0 }, report(), report());
    expect(again.profile.reputation).toBe(rep);
    expect(again.story).toEqual([]);
  });
});

describe('objectives', () => {
  const p = fresh();
  const st: StoryState = { chapter: 1, from: 1, since: 1, shifts: 0, done: [] };
  const met = (
    test: (typeof STORY_CHAPTERS)[number]['objectives'][number]['test'],
    r?: ShiftReport,
    q: CareerProfile = p,
    s = st,
  ) => objectiveMet(q, { id: 'x', text: { et: '', en: '' }, test }, s, r);

  it('reads the shift report', () => {
    expect(met({ kind: 'grade', min: 'B' }, report({ grade: 'A' }))).toBe(true);
    expect(met({ kind: 'grade', min: 'B' }, report({ grade: 'C' }))).toBe(false);
    expect(met({ kind: 'grade', min: 'S' }, report({ grade: 'S' }))).toBe(true);
    expect(met({ kind: 'noExpired', minIncidents: 8 }, report({ stats: { expired: 0, incidents: 8 } }))).toBe(
      true,
    );
    expect(met({ kind: 'noExpired', minIncidents: 8 }, report({ stats: { expired: 0, incidents: 7 } }))).toBe(
      false,
    );
    expect(met({ kind: 'calls', n: 3 }, report({ stats: { callsAnswered: 3 } }))).toBe(true);
    expect(met({ kind: 'help', n: 1 }, report({ extras: { helpGiven: 1 } }))).toBe(true);
    expect(met({ kind: 'help', n: 1 }, report())).toBe(false);
    const p1 = report({
      avgResponse: { 1: 11.5 },
      stats: { responseTimes: { 1: [11, 12], 2: [], 3: [], 4: [] } },
    });
    expect(met({ kind: 'p1', maxAvg: 12, minCount: 1 }, p1)).toBe(true);
    expect(met({ kind: 'p1', maxAvg: 10, minCount: 1 }, p1)).toBe(false);
    expect(met({ kind: 'p1', maxAvg: 12, minCount: 1 }, report())).toBe(false);
    expect(
      met({ kind: 'safe', minIncidents: 10 }, report({ stats: { officerInjuries: 0, incidents: 10 } })),
    ).toBe(true);
    expect(
      met({ kind: 'safe', minIncidents: 10 }, report({ stats: { officerInjuries: 1, incidents: 14 } })),
    ).toBe(false);
    expect(met({ kind: 'away' }, report({ regionId: 'pohja' }))).toBe(true);
    expect(met({ kind: 'away' }, report({ regionId: 'louna' }))).toBe(false);
  });

  it('reads the career state (Staatus and streaks only at the end of a shift)', () => {
    expect(met({ kind: 'staatus', min: 35 }, report(), { ...p, reputation: 35 })).toBe(true);
    expect(met({ kind: 'staatus', min: 35 }, undefined, { ...p, reputation: 90 })).toBe(false);
    expect(met({ kind: 'shifts', n: 3 }, undefined, p, { ...st, shifts: 3 })).toBe(true);
    expect(met({ kind: 'sectors', n: 2 })).toBe(false);
    expect(
      met({ kind: 'sectors', n: 2 }, undefined, {
        ...p,
        sectors: { louna: ['louna-tartu', 'louna-tartumaa'] },
      }),
    ).toBe(true);
    const whole = { ...p, sectors: { louna: sectorsOf('louna').map((s) => s.id) } };
    expect(met({ kind: 'wholeHome' }, undefined, whole)).toBe(true);
    expect(met({ kind: 'wholeRegions', n: 1 }, undefined, whole)).toBe(true);
    expect(met({ kind: 'wholeRegions', n: 2 }, undefined, whole)).toBe(false);
    expect(met({ kind: 'staff', n: 10 })).toBe(true);
    expect(met({ kind: 'staff', n: 25 })).toBe(false);
    const streak = { ...p, counters: { nightShifts: 0, pranksCaught: 0, aStreak: 3 } } as CareerProfile;
    expect(met({ kind: 'streak', n: 3 }, report(), streak)).toBe(true);
    expect(met({ kind: 'streak', n: 3 }, undefined, streak)).toBe(false);
  });

  it('records a state objective as soon as it holds (an accepted sector), and begins a chapter waiting for it', () => {
    // Chapter 2 running, an offer waiting.
    let p = fresh('louna', 'louna-tartu');
    p = {
      ...p,
      xp: RANKS[1].xp,
      story: { ...p.story!, chapter: 2, since: 5, shifts: 3, done: ['c2-help', 'c2-rep'] },
      offer: { regionId: 'louna', choices: ['louna-tartumaa'], day: 6 },
    };
    const taken = acceptOffer(p, 'louna-tartumaa').profile;
    const r = storyProgress(taken);
    // The sector finishes chapter 2, and chapter 3 (two home sectors) begins at once.
    expect(r.messages.map((m) => m.story.kind)).toEqual(['goal', 'outro', 'intro']);
    expect(r.profile.story).toMatchObject({ chapter: 3, shifts: 0, done: [], since: taken.day });
    expect(r.profile.reputation).toBe(taken.reputation + 2);
    // The newspaper's piece runs in the next shift's paper.
    expect(r.profile.story!.press!.day).toBe(taken.day);
    // Nothing to record: the same profile object back.
    expect(storyProgress(r.profile).profile).toBe(r.profile);
  });
});

describe('questions', () => {
  function asked(regionId: RegionId = 'louna'): CareerProfile {
    return play(fresh(regionId), report()).profile;
  }

  it('the answer changes Staatus and the budget with a ledger line, once', () => {
    const p = asked();
    const before = { money: p.money, rep: p.reputation, ledger: p.ledger.length };
    const r = answerStoryChoice(p, 'stay');
    expect(r.error).toBeUndefined();
    expect(r.profile.money).toBe(before.money - 90);
    expect(r.profile.reputation).toBe(before.rep + 1);
    expect(r.profile.ledger).toHaveLength(before.ledger + 1);
    expect(r.profile.ledger.at(-1)).toMatchObject({ amount: -90, kind: 'other' });
    expect(r.profile.story!.answers).toEqual({ 'c1-debrief': 'stay' });
    expect(r.profile.story!.choice).toBeUndefined();
    expect(r.reply).toMatchObject({
      who: { name: MENTORS.louna.name },
      story: { chapter: 1, kind: 'reply' },
    });
    // Answered: not again, and the question is not asked again.
    expect(answerStoryChoice(r.profile, 'home').error).toBeTruthy();
    expect(play(r.profile, report()).profile.story!.choice).toBeUndefined();
    // The input is never changed.
    expect(p.story!.choice).toBeDefined();
  });

  it('a "no" changes nothing but the answer', () => {
    const p = asked();
    const r = answerStoryChoice(p, 'home');
    expect({ ...r.profile, story: undefined }).toEqual({ ...p, story: undefined });
  });

  it('refuses a cost the budget does not have, and an unknown answer, changing nothing', () => {
    const p = { ...asked(), money: 50 };
    const r = answerStoryChoice(p, 'stay');
    expect(r.error!.et).toContain('Eelarves pole piisavalt raha');
    expect(r.profile).toBe(p);
    expect(answerStoryChoice(p, 'nope').profile).toBe(p);
    expect(storyView(p)!.choice!.options.find((o) => o.id === 'stay')!.short).toBe(true);
  });

  it('morale and the timing of the next offer, within bounds', () => {
    const base = fresh('louna', 'louna-tartu');
    const p: CareerProfile = {
      ...base,
      story: { ...base.story!, chapter: 2, choice: { id: 'c2-breakroom', day: 4 } },
    };
    const r = answerStoryChoice(p, 'fund').profile;
    r.staff.forEach((m, i) =>
      expect(m.morale).toBeCloseTo(Math.min(1, Math.max(0.15, p.staff[i].morale + 0.04)), 2),
    );
    expect(r.money).toBe(p.money - 1200);
    // The journalist's question: a comment moves the prefect's next offer one shift later.
    const q: CareerProfile = {
      ...base,
      day: 6,
      sectorsChangedDay: 3,
      story: { ...base.story!, chapter: 3, choice: { id: 'c3-press', day: 6 } },
    };
    const c = answerStoryChoice(q, 'comment').profile;
    expect(c.sectorsChangedDay).toBe(4);
    expect(c.reputation).toBe(q.reputation + 2);
    const needs = (x: CareerProfile) => offerProgress(x).needs.map((n) => n.en);
    expect(needs(c)).not.toEqual(needs(q));
    // With an offer waiting it does not move anything.
    const waiting = { ...q, offer: { regionId: 'louna' as const, choices: ['louna-tartumaa'], day: 6 } };
    expect(answerStoryChoice(waiting, 'comment').profile.sectorsChangedDay).toBe(3);
  });

  it('a waiting question is a notice with its speaker, and the menu line says so', () => {
    const p = asked();
    const notes = menuNotices(p, []);
    expect(notes[0]).toMatchObject({ kind: 'story', who: { name: MENTORS.louna.name }, day: 2 });
    expect(storyLine(p)).toMatchObject({ chapter: 1, total: 5, met: 0, need: 3, ask: true, state: 'active' });
    // The asking message itself is not listed twice.
    const out = play(fresh(), report());
    expect(menuNotices(out.profile, out.messages).filter((n) => n.kind === 'story')).toHaveLength(1);
  });
});

describe('old careers', () => {
  it('show the chapter their state matches and start there with the next shift, without rewards', () => {
    // A converted career from before sectors: the whole prefecture, rank Komissar.
    const p0 = older({ ...fresh('pohja'), xp: RANKS[4].xp, reputation: 55 });
    delete p0.sectors;
    delete p0.sectorsChangedDay;
    const p = normalizeCareerProfile(JSON.parse(JSON.stringify(p0)))!;
    expect(p.story).toBeUndefined();
    expect(coversWholeRegion(p, 'pohja')).toBe(true);
    expect(matchingChapter(p)).toBe(5);
    expect(storyOf(p)).toMatchObject({ chapter: 5, from: 5, shifts: 0, done: [] });
    expect(storyView(p)).toMatchObject({ chapter: 5, started: false, state: 'active', from: 5 });
    // Its next paid shift starts the story: the intro only, nothing of this shift counts, nothing is given.
    const out = applyShiftReport(p, report({ regionId: 'pohja', grade: 'S', reputationDelta: 2 }));
    expect(out.profile.story).toMatchObject({ chapter: 5, from: 5, since: p.day + 1, shifts: 0, done: [] });
    expect((out.messages as StoryMessage[]).filter((m) => m.story).map((m) => m.story.kind)).toEqual([
      'intro',
    ]);
    expect(out.profile.reputation).toBe(p.reputation + 2);
    expect(out.profile.money - p.money).toBe(out.ledger.reduce((a, e) => a + e.amount, 0));
  });

  it('a sector career from before the story starts where its rank and sectors put it', () => {
    const base = fresh('louna', 'louna-tartu');
    const two = older({ ...base, sectors: { louna: ['louna-tartu', 'louna-tartumaa'] }, xp: RANKS[2].xp });
    expect(matchingChapter(two)).toBe(3);
    expect(matchingChapter(older({ ...base, xp: RANKS[3].xp }))).toBe(2);
    expect(matchingChapter(older(base))).toBe(1);
    const three = older({
      ...base,
      sectors: { louna: ['louna-tartu', 'louna-tartumaa', 'louna-viljandi'] },
      xp: RANKS[2].xp,
    });
    expect(matchingChapter(three)).toBe(4);
    // Before the story starts, a change outside a shift writes nothing.
    expect(storyProgress(two).profile).toBe(two);
    expect(storyAfterShift({ ...two }, report()).messages[0].story.kind).toBe('intro');
  });
});

describe('the career normaliser', () => {
  it('loads a stored story deep-equal, and leaves a career without one without one', () => {
    const p = play(
      fresh(),
      report(),
      report({ grade: 'A', stats: { callsAnswered: 3, expired: 0 } }),
      report(),
    ).profile;
    expect(p.story!.press).toBeDefined();
    const json = JSON.parse(JSON.stringify(p));
    const issues: string[] = [];
    expect(normalizeCareerProfile(json, issues)).toEqual(p);
    expect(issues).toEqual([]);
    const old = older(p);
    expect(normalizeCareerProfile(JSON.parse(JSON.stringify(old)))).toEqual(old);
  });

  it('drops bad entries one by one and keeps unknown fields', () => {
    const p = fresh();
    const issues: string[] = [];
    const out = normalizeCareerProfile(
      {
        ...JSON.parse(JSON.stringify(p)),
        story: {
          chapter: 2,
          from: 9,
          since: '4',
          shifts: 'x',
          done: ['c2-help', 7],
          complete: 'yes',
          choice: { id: 3 },
          answers: { 'c1-debrief': 'stay', bad: 1 },
          press: { day: 3, title: 'Pealkiri', body: { et: 'Tekst', en: 'Text' } },
          later: { kept: true },
        },
      },
      issues,
    )!;
    expect(out.story).toEqual({
      chapter: 2,
      from: 2,
      since: 4,
      shifts: 0,
      done: ['c2-help'],
      answers: { 'c1-debrief': 'stay' },
      press: {
        day: 3,
        title: { et: 'Pealkiri', en: 'Pealkiri' },
        body: { et: 'Tekst', en: 'Text' },
        byline: '',
      },
      later: { kept: true },
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        'story.shifts',
        'story.done[1]',
        'story.complete',
        'story.choice',
        'story.answers.bad',
        'story.from',
      ]),
    );
    // Idempotent.
    expect(normalizeCareerProfile(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });

  it('a story with no usable chapter is dropped and starts again from the state', () => {
    const issues: string[] = [];
    const out = normalizeCareerProfile(
      { ...JSON.parse(JSON.stringify(fresh())), story: { chapter: 'two' } },
      issues,
    )!;
    expect(out.story).toBeUndefined();
    expect(issues).toContain('story');
    expect(storyOf(out).chapter).toBe(1);
  });

  it('a chapter a later version adds is kept and shown as nothing here', () => {
    const p = { ...fresh(), story: { chapter: 9, from: 1, since: 40, shifts: 2, done: ['c9-x'] } };
    expect(normalizeCareerProfile(JSON.parse(JSON.stringify(p)))!.story).toEqual(p.story);
    expect(storyView(p)).toBeNull();
    const out = applyShiftReport(p, report());
    expect(out.profile.story).toEqual(p.story);
  });
});

describe('a whole story', () => {
  it('runs from the first desk to the last chapter with normal play', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let p = fresh('louna', 'louna-tartu');
    const seen: number[] = [];
    const good = () =>
      report({
        grade: 'S',
        score: 95,
        xp: 900,
        reputationDelta: 6,
        avgResponse: { 1: 8 },
        stats: {
          callsAnswered: 4,
          expired: 0,
          incidents: 14,
          responseTimes: { 1: [8], 2: [], 3: [], 4: [] },
        },
        extras: { helpGiven: 1, dayTags: [] },
      });
    for (let i = 0; i < 200 && !(p.story!.chapter === 5 && p.story!.complete); i++) {
      const away = p.unlockedRegions.find((r) => r !== p.regionId);
      const out = applyShiftReport(p, { ...good(), regionId: i % 5 === 4 && away ? away : p.regionId });
      p = out.profile;
      if (!seen.includes(p.story!.chapter)) seen.push(p.story!.chapter);
      if (p.offer) p = storyProgress(acceptOffer(p, p.offer.choices[0]).profile).profile;
      if (p.story!.choice)
        p = answerStoryChoice(p, STORY_CHAPTERS[p.story!.chapter - 1].choice!.options[1].id).profile;
      // The prefecture whole means covering every sector: give it once the career has earned two of them.
      if (
        p.story!.chapter >= 5 &&
        careerSectors(p, 'pohja').length &&
        !coversWholeRegion(p, 'pohja') &&
        p.unlockedRegions.includes('pohja')
      )
        p = { ...p, sectors: { ...p.sectors, pohja: sectorsOf('pohja').map((s) => s.id) } };
    }
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(storyView(p)!.state).toBe('told');
    expect(storyOrder(p)).toBeNull();
    expect(storyLine(p)!.state).toBe('told');
  });
});

describe('pacing', () => {
  it('a chapter lasts its shifts however fast its objectives are met', () => {
    const great = report({ grade: 'S', stats: { callsAnswered: 5, expired: 0, incidents: 12 } });
    const one = play(fresh(), great);
    expect(one.profile.story).toMatchObject({ chapter: 1, done: ['c1-grade', 'c1-noexpired', 'c1-calls'] });
    expect(one.profile.story!.complete).toBeUndefined();
    expect(storyView(one.profile)).toMatchObject({ met: 3, need: 3, shiftsLeft: 2 });
    const three = play(one.profile, report(), report());
    expect(three.profile.story!.complete || three.profile.story!.chapter === 2).toBe(true);
  });
});
