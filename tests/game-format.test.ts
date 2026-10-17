import { describe, expect, it } from 'vitest';
import {
  ageText,
  allMet,
  callsignCompare,
  countdown,
  fmtKm,
  fmtMoney,
  fmtNum,
  hmText,
  isTypingTarget,
  matchesQueueFilter,
  needCoverage,
  typeFits,
  parseQueryRef,
  roadCondition,
  slaTone,
  sortQueue,
  sortUnits,
  unitEtaMin,
  weekdayName,
} from '@/ui/game/format';
import { wall, tallinnTime } from '@/sim/time';
import type { Incident, Unit } from '@/sim/types';

describe('weekdayName', () => {
  it('maps wall().weekday (0 = Monday) to Estonian and English names', () => {
    expect(weekdayName(0, 'et')).toBe('esmaspäev');
    expect(weekdayName(5, 'et')).toBe('laupäev');
    expect(weekdayName(6, 'et')).toBe('pühapäev');
    expect(weekdayName(6, 'en')).toBe('Sunday');
    expect(weekdayName(7, 'et')).toBe('esmaspäev');
    expect(weekdayName(-1, 'en')).toBe('Sunday');
  });
  it('agrees with the Tallinn wall clock (17.10.2026 is a Saturday)', () => {
    const t = tallinnTime(2026, 10, 17, 12, 0);
    expect(weekdayName(wall(t).weekday, 'et')).toBe('laupäev');
    expect(weekdayName(wall(tallinnTime(2026, 6, 24, 1, 0)).weekday, 'et')).toBe('kolmapäev'); // jaanipäev 2026
  });
});

describe('countdown', () => {
  it('formats minutes as m:ss', () => {
    expect(countdown(7.7)).toBe('7:42');
    expect(countdown(0)).toBe('0:00');
    expect(countdown(0.5)).toBe('0:30');
    expect(countdown(10)).toBe('10:00');
  });
  it('uses h:mm:ss beyond an hour', () => {
    expect(countdown(62 + 5 / 60)).toBe('1:02:05');
  });
  it('shows overdue time with a real minus sign', () => {
    expect(countdown(-(1 + 5 / 60))).toBe('−1:05');
    expect(countdown(-0.001)).toBe('0:00');
  });
  it('handles non-finite input', () => {
    expect(countdown(Number.NaN)).toBe('--:--');
    expect(countdown(Number.POSITIVE_INFINITY)).toBe('--:--');
  });
});

describe('ageText / hmText / numbers', () => {
  it('ageText', () => {
    expect(ageText(0.4, 'et')).toBe('<1 min');
    expect(ageText(4.9, 'et')).toBe('4 min');
    expect(ageText(65, 'et')).toBe('1 t 05');
    expect(ageText(65, 'en')).toBe('1 h 05');
  });
  it('hmText', () => {
    expect(hmText(3 * 3600_000 + 24 * 60_000 + 30_000)).toBe('3:24');
    expect(hmText(-5000)).toBe('0:00');
  });
  it('decimal comma in Estonian', () => {
    expect(fmtNum(3.45, 1, 'et')).toBe('3,5');
    expect(fmtNum(3.45, 1, 'en')).toBe('3.5');
    expect(fmtKm(3.42, 'et')).toBe('3,4 km');
    expect(fmtKm(12.4, 'en')).toBe('12 km');
    expect(fmtKm(Number.NaN, 'et')).toBe('–');
  });
  it('money with thin-space thousands', () => {
    expect(fmtMoney(10000)).toBe('10 000 €');
    expect(fmtMoney(-1234567)).toBe('−1 234 567 €');
    expect(fmtMoney(950)).toBe('950 €');
  });
});

describe('roadCondition / slaTone', () => {
  it('roadCondition buckets the road factor', () => {
    expect(roadCondition(1)).toBe('dry');
    expect(roadCondition(1, 'rain')).toBe('wet');
    expect(roadCondition(1.08)).toBe('wet');
    expect(roadCondition(1.2)).toBe('slippery');
    expect(roadCondition(1.4)).toBe('icy');
  });
  it('slaTone', () => {
    expect(slaTone(8, 10)).toBe('ok');
    expect(slaTone(4, 10)).toBe('warn');
    expect(slaTone(2, 10)).toBe('danger');
    expect(slaTone(-0.1, 10)).toBe('over');
    expect(slaTone(30, 120)).toBe('danger');
  });
});

type Q = Pick<Incident, 'id' | 'state' | 'priority' | 'createdAt' | 'assigned'>;
const inc = (id: string, state: Incident['state'], priority: Incident['priority'], createdAt: number, assigned: string[] = []): Q => ({
  id,
  state,
  priority,
  createdAt,
  assigned,
});

describe('sortQueue / filters', () => {
  it('puts incoming first, then priority, then unattended, then oldest', () => {
    const list = [
      inc('a', 'queued', 3, 1),
      inc('b', 'incoming', 4, 5),
      inc('c', 'dispatched', 1, 2),
      inc('d', 'queued', 1, 3),
      inc('e', 'incoming', 1, 9),
      inc('f', 'onscene', 3, 0),
    ];
    expect(sortQueue(list).map((i) => i.id)).toEqual(['e', 'b', 'd', 'c', 'a', 'f']);
  });
  it('does not mutate its input', () => {
    const list = [inc('a', 'queued', 3, 1), inc('b', 'incoming', 1, 1)];
    sortQueue(list);
    expect(list[0].id).toBe('a');
  });
  it('filters', () => {
    expect(matchesQueueFilter(inc('a', 'queued', 2, 0), 'p12')).toBe(true);
    expect(matchesQueueFilter(inc('a', 'queued', 3, 0), 'p12')).toBe(false);
    expect(matchesQueueFilter(inc('a', 'queued', 3, 0, ['u1']), 'unassigned')).toBe(false);
    expect(matchesQueueFilter(inc('a', 'queued', 3, 0), 'unassigned')).toBe(true);
    expect(matchesQueueFilter(inc('a', 'queued', 4, 0, ['u']), 'all')).toBe(true);
  });
});

type U = Pick<Unit, 'status' | 'callsign' | 'type' | 'fatigue' | 'move'>;
const unit = (callsign: string, status: Unit['status'], type: Unit['type'], fatigue: number, arriveAt?: number): U => ({
  callsign,
  status,
  type,
  fatigue,
  move: arriveAt === undefined ? undefined : { purpose: 'incident', path: [], cum: [], departAt: 0, arriveAt, siren: true },
});

describe('units', () => {
  it('callsignCompare sorts naturally', () => {
    expect(['P1-10', 'P1-2', 'P2-1', 'P1-1'].sort(callsignCompare)).toEqual(['P1-1', 'P1-2', 'P1-10', 'P2-1']);
  });
  it('unitEtaMin', () => {
    expect(unitEtaMin(unit('x', 'enroute', 'patrol', 0, 180_000), 60_000)).toBe(2);
    expect(unitEtaMin(unit('x', 'enroute', 'patrol', 0, 10), 60_000)).toBeNull();
    expect(unitEtaMin(unit('x', 'available', 'patrol', 0), 0)).toBeNull();
  });
  const list = [
    unit('P1-10', 'onscene', 'patrol', 0.5),
    unit('P1-2', 'available', 'k9', 0.1),
    unit('P1-3', 'enroute', 'patrol', 0.3, 300_000),
    unit('P1-1', 'available', 'patrol', 0.9),
    unit('K-1', 'enroute', 'rapid', 0.2, 120_000),
  ];
  it('sorts by status code then callsign', () => {
    expect(sortUnits(list, 'status', 1, 0).map((u) => u.callsign)).toEqual(['P1-1', 'P1-2', 'K-1', 'P1-3', 'P1-10']);
  });
  it('sorts by callsign both directions', () => {
    expect(sortUnits(list, 'callsign', 1, 0).map((u) => u.callsign)).toEqual(['K-1', 'P1-1', 'P1-2', 'P1-3', 'P1-10']);
    expect(sortUnits(list, 'callsign', -1, 0).map((u) => u.callsign)[0]).toBe('P1-10');
  });
  it('keeps units without ETA at the bottom in both directions', () => {
    expect(sortUnits(list, 'eta', 1, 0).map((u) => u.callsign).slice(0, 2)).toEqual(['K-1', 'P1-3']);
    expect(sortUnits(list, 'eta', -1, 0).map((u) => u.callsign).slice(0, 2)).toEqual(['P1-3', 'K-1']);
  });
  it('sorts by fatigue and type', () => {
    expect(sortUnits(list, 'fatigue', -1, 0)[0].callsign).toBe('P1-1');
    expect(sortUnits(list, 'type', 1, 0).map((u) => u.type)).toEqual(['patrol', 'patrol', 'patrol', 'rapid', 'k9']);
  });
});

describe('needCoverage', () => {
  it('fills specific needs first, any takes leftovers, no double counting', () => {
    const rows = needCoverage(
      [
        { type: 'any', count: 1 },
        { type: 'patrol', count: 2 },
      ],
      ['patrol', 'patrol', 'k9'],
    );
    expect(rows).toEqual([
      { type: 'any', count: 1, have: 1, met: true },
      { type: 'patrol', count: 2, have: 2, met: true },
    ]);
    expect(allMet(rows)).toBe(true);
  });
  it('lets compatible types fill slots like the engine (rapid covers patrol, special covers rapid)', () => {
    expect(needCoverage([{ type: 'patrol', count: 1 }], ['rapid'])[0]).toEqual({ type: 'patrol', count: 1, have: 1, met: true });
    expect(needCoverage([{ type: 'rapid', count: 1 }], ['special'])[0].met).toBe(true);
    expect(needCoverage([{ type: 'rapid', count: 1 }], ['patrol'])[0].met).toBe(false);
    expect(needCoverage([{ type: 'k9', count: 1 }], ['patrol'])[0].met).toBe(false);
    // the exact k9 goes to the k9 slot, the patrol slot takes the rapid unit
    const rows = needCoverage(
      [
        { type: 'patrol', count: 1 },
        { type: 'k9', count: 1 },
      ],
      ['k9', 'rapid'],
    );
    expect(rows.map((r) => r.met)).toEqual([true, true]);
    expect(typeFits('any', 'criminal')).toBe(true);
    expect(typeFits('patrol', 'heli')).toBe(false);
  });
  it('reports missing units', () => {
    const rows = needCoverage([{ type: 'rapid', count: 1 }, { type: 'any', count: 2 }], ['heli']);
    expect(rows.map((r) => [r.have, r.met])).toEqual([
      [0, false],
      [0, false],
    ]);
    expect(allMet(rows)).toBe(false);
    expect(allMet([])).toBe(false);
  });
});

describe('isTypingTarget / parseQueryRef', () => {
  it('detects text inputs only', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingTarget({ tagName: 'input' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  it('extracts a personal code or a plate from radio text', () => {
    expect(parseQueryRef('Põhja 21, kontrolli isikut, isikukood 38506120234.')).toEqual({ kind: 'person', q: '38506120234' });
    expect(parseQueryRef('Kontrolli sõidukit 123ABC, hall Audi.')).toEqual({ kind: 'vehicle', q: '123 ABC' });
    expect(parseQueryRef('Number 456 BCD')).toEqual({ kind: 'vehicle', q: '456 BCD' });
    expect(parseQueryRef('21, kohal.')).toBeNull();
  });
});
