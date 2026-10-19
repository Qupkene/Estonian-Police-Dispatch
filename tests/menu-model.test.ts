// Main menu figures (src/ui/screens/shell/menuModel.ts): the Karjäär panel, the shifts chart, the notices and
// what the duty map shows, all from the career profile and nothing else.
import { describe, expect, it } from 'vitest';
import { applyShiftReport, newCareer } from '@/sim/career';
import type { CareerProfile, Text } from '@/sim/types';
import {
  barHeight,
  careerFigures,
  homeArea,
  mapInput,
  menuNotices,
  nextShiftKind,
  noticeKind,
  shiftBars,
} from '@/ui/screens/shell/menuModel';

const SCORES = [58, 66, 71, 82, 61, 70, 84, 86, 73, 93, 88, 74, 87];
const GRADES = ['C', 'B', 'B', 'A', 'C', 'B', 'A', 'A', 'B', 'S', 'A', 'B', 'A'] as const;

function played(): CareerProfile {
  const p = newCareer('Mari Tamm', '214', 'louna', 7, 'louna-tartu');
  return {
    ...p,
    day: 14,
    money: 47_820,
    reputation: 58,
    xp: 690,
    history: SCORES.map((score, i) => ({
      day: i + 1,
      regionId: 'louna' as const,
      score,
      grade: GRADES[i],
      incidents: 15,
      earnings: i === 12 ? 1180 : 900,
      reputationDelta: i === 12 ? 4 : 1,
    })),
    stats: { ...p.stats, shifts: 13, bestScore: 93 },
  };
}

describe('Karjäär figures', () => {
  it('a new career: no last shift, no best, payday a month away', () => {
    const f = careerFigures(newCareer('Mari Tamm', '214', 'louna', 7, 'louna-tartu'));
    expect(f.day).toBe(1);
    expect(f.month).toBe(1);
    expect(f.last).toBeNull();
    expect(f.best).toBeNull();
    expect(f.moneyDelta).toBeNull();
    expect(f.shifts).toBe(0);
    expect(f.payday).toBe(30);
    expect(f.position.et).toBe('Operatiivinfo haldur');
  });

  it("after 13 shifts: the last shift's changes, the best and its day, the next rank", () => {
    const f = careerFigures(played());
    expect(f).toMatchObject({
      day: 14,
      month: 1,
      money: 47_820,
      moneyDelta: 1180,
      rep: 58,
      repDelta: 4,
      lastDay: 13,
      payday: 17,
      shifts: 13,
    });
    expect(f.last).toEqual({ grade: 'A', score: 87, day: 13 });
    expect(f.best).toEqual({ score: 93, day: 10 });
    expect(f.rank.et).toBe('Konstaabel');
    expect(f.nextXp).toBe(1100);
    expect(f.rankProgress).toBeCloseTo((690 - 400) / (1100 - 400), 5);
  });

  it('a best score older than the kept history has no day', () => {
    const p = played();
    expect(careerFigures({ ...p, stats: { ...p.stats, bestScore: 99 } }).best).toEqual({
      score: 99,
      day: null,
    });
  });

  it('is safe on a save with missing fields', () => {
    const p = played() as unknown as Record<string, unknown>;
    const f = careerFigures({
      ...p,
      history: undefined,
      stats: undefined,
      reputation: undefined,
    } as unknown as CareerProfile);
    expect(f.last).toBeNull();
    expect(f.rep).toBe(0);
    expect(f.shifts).toBe(0);
  });
});

describe('shifts chart', () => {
  it('the last 13 shifts, oldest first, with their average', () => {
    const c = shiftBars(played())!;
    expect(c.bars.map((b) => b.score)).toEqual(SCORES);
    expect(c.from).toBe(1);
    expect(c.to).toBe(13);
    expect(c.avg).toBe(Math.round(SCORES.reduce((a, b) => a + b, 0) / 13));
    const p = played();
    const more = {
      ...p,
      history: [...p.history, { ...p.history[0], day: 14, score: 50, grade: 'C' as const }],
    };
    expect(shiftBars(more)!.from).toBe(2);
    expect(shiftBars(newCareer('A', '100', 'ida', 1))).toBeNull();
  });

  it('bar heights run from 40 points (floor) to 100 (top)', () => {
    expect(barHeight(100, 40)).toBe(40);
    expect(barHeight(40, 40)).toBe(2);
    expect(barHeight(10, 40)).toBe(2);
    expect(barHeight(70, 100)).toBe(50);
  });
});

describe('notices', () => {
  const msg = (et: string): Text => ({ et, en: et });

  it('none without a career or without anything to say', () => {
    expect(menuNotices(null, [msg('Ülendus!')])).toEqual([]);
    const p = newCareer('Mari Tamm', '214', 'louna', 7, 'louna-tartu');
    expect(menuNotices(p, [])).toEqual([]);
  });

  it("the prefect's offer first, then the last shift's messages, then a worn vehicle", () => {
    const p = played();
    const worn = {
      ...p,
      offer: { regionId: 'louna' as const, choices: ['louna-tartumaa'], day: 13 },
      fleet: p.fleet.map((v, i) => (i === 0 ? { ...v, condition: 0.38 } : v)),
    };
    const out = menuNotices(worn, [
      msg('Prefekt pakub teile lisasektorit: Tartumaa ja Elva. Vastake pakkumisele karjääri ülevaates.'),
      msg('Kersti Saar sai teenistuses vigastada ja on 4 päeva töölt eemal.'),
    ]);
    expect(out.map((n) => n.kind)).toEqual(['prefect', 'staff', 'fleet']);
    expect(out[0]).toMatchObject({
      day: 13,
      text: { key: 'shell.menu.note.offer', vars: { names: { et: 'Tartumaa ja Elva' } } },
    });
    expect(out[1].day).toBe(13);
    expect(out[2]).toMatchObject({
      day: null,
      text: { key: 'shell.menu.note.fleetText', vars: { pct: 38 } },
    });
  });

  it("sorts the career's own messages by what they are about", () => {
    const p = newCareer('Mari Tamm', '214', 'louna', 7, 'louna-tartu');
    const report = {
      regionId: 'louna',
      score: 92,
      grade: 'S',
      xp: 2000,
      reputationDelta: 3,
      earnings: { bonus: 500, fuel: 10, overtime: 0, fines: 0 },
      kmDriven: 80,
      stats: {
        incidents: 12,
        arrests: 2,
        pursuitsCaught: 0,
        expired: 0,
        callsAnswered: 4,
        responseTimes: { 1: [6], 2: [12], 3: [], 4: [] },
      },
      injuredOfficers: [],
      officerXp: {},
    } as unknown as Parameters<typeof applyShiftReport>[1];
    const { messages } = applyShiftReport(p, report);
    const kinds = messages.map(noticeKind);
    expect(kinds).toContain('rank');
    expect(kinds).not.toContain('info');
    expect(noticeKind(msg('Palgapäev! 1. kuu kokkuvõte: …'))).toBe('budget');
    expect(noticeKind(msg('Saavutus: Esimene vahetus!'))).toBe('award');
    expect(noticeKind(msg('Uus prefektuur avatud: Ida prefektuur.'))).toBe('prefect');
  });
});

describe('map input', () => {
  const challenge = { sector: 'ida-narva', regionId: 'ida' as const };

  it('a sector career: its desk, the offer and its home prefecture', () => {
    const p = { ...played(), offer: { regionId: 'louna' as const, choices: ['louna-tartumaa'], day: 13 } };
    expect(mapInput(p, challenge)).toEqual({
      mine: ['louna-tartu'],
      whole: [],
      offered: ['louna-tartumaa'],
      challenge,
      home: 'louna',
    });
    expect(homeArea(p)).toEqual({ regionId: 'louna', sectors: ['louna-tartu'], whole: false });
  });

  it('a career from before sectors covers its prefecture whole', () => {
    const p = played();
    const { sectors: _drop, sectorsChangedDay: _day, ...old } = p;
    void _drop;
    void _day;
    const input = mapInput(old as CareerProfile, null);
    expect(input.whole).toEqual(['louna']);
    expect(input.mine).toEqual([]);
  });

  it('no career: only the challenge', () => {
    expect(mapInput(null, challenge)).toEqual({ mine: [], whole: [], offered: [], challenge, home: null });
  });
});

describe('next shift', () => {
  it('follows the briefing: a day shift from 6 to 17, else a night shift', () => {
    expect(nextShiftKind(6)).toEqual({ kind: 'day', from: '07', to: '19' });
    expect(nextShiftKind(16)).toEqual({ kind: 'day', from: '07', to: '19' });
    expect(nextShiftKind(17)).toEqual({ kind: 'night', from: '19', to: '07' });
    expect(nextShiftKind(2).kind).toBe('night');
  });
});
