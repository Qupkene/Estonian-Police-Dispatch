// Pure helpers for the main menu (no React / DOM): the Karjäär panel's figures, its shifts chart, the notices
// (Teated) and the map's input, all from the career profile. Unit-tested in tests/menu-model.test.ts.
import { REGIONS } from '@/data/regions';
import { careerSectors, coversWholeRegion, positionTitle, sectorNames } from '@/sim/careerSectors';
import type { DutyInput } from './dutyMap';
import type { CareerProfile, RegionId, ShiftReport, Text } from '@/sim/types';
import { calendarOf, rankInfo, safe } from '../career/helpers';

type Grade = ShiftReport['grade'];

export interface CareerFigures {
  day: number;
  month: number;
  rank: Text;
  position: Text;
  money: number;
  /** The last shift's change of the budget and its day (null before the first shift). */
  moneyDelta: number | null;
  rep: number;
  repDelta: number | null;
  lastDay: number | null;
  xp: number;
  /** XP of the next rank (null at the top) and the way there, 0..1. */
  nextXp: number | null;
  rankProgress: number;
  /** Shifts until (and with) the payday shift at the end of the month. */
  payday: number;
  last: { grade: Grade; score: number; day: number } | null;
  shifts: number;
  /** Best score, and the career day it was set on when the history still has it. */
  best: { score: number; day: number | null } | null;
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The Karjäär panel's figures (every field safe on an old or partial save). */
export function careerFigures(p: CareerProfile): CareerFigures {
  const cal = calendarOf(p.day);
  const rank = rankInfo(p.xp);
  const history = Array.isArray(p.history) ? p.history : [];
  const last = history[history.length - 1];
  const bestScore = num(p.stats?.bestScore, NaN);
  const shifts = num(p.stats?.shifts, history.length);
  let bestDay: number | null = null;
  for (const h of history) if (h.score === bestScore) bestDay = h.day;
  return {
    day: cal.day,
    month: cal.month,
    rank: rank.name,
    position: safe(() => positionTitle(p), { et: 'Operatiivinfo haldur', en: 'Dispatcher' }),
    money: num(p.money),
    moneyDelta: last && Number.isFinite(last.earnings) ? last.earnings : null,
    rep: Math.round(num(p.reputation)),
    repDelta: last && Number.isFinite(last.reputationDelta) ? last.reputationDelta : null,
    lastDay: last ? last.day : null,
    xp: Math.round(num(p.xp)),
    nextXp: rank.nextXp ?? null,
    rankProgress: rank.progress,
    payday: cal.shiftsToPayday,
    last: last ? { grade: last.grade, score: Math.round(last.score), day: last.day } : null,
    shifts,
    best: shifts > 0 && Number.isFinite(bestScore) ? { score: Math.round(bestScore), day: bestDay } : null,
  };
}

export interface ShiftBars {
  bars: { day: number; score: number; grade: Grade }[];
  /** Days of the first and last bar. */
  from: number;
  to: number;
  avg: number;
}

/** The last `n` shifts for the chart, oldest first (null before the first shift). */
export function shiftBars(p: CareerProfile, n = 13): ShiftBars | null {
  const history = (Array.isArray(p.history) ? p.history : []).filter((h) => Number.isFinite(h.score));
  const bars = history.slice(-n).map((h) => ({ day: h.day, score: Math.round(h.score), grade: h.grade }));
  if (!bars.length) return null;
  return {
    bars,
    from: bars[0].day,
    to: bars[bars.length - 1].day,
    avg: Math.round(bars.reduce((a, b) => a + b.score, 0) / bars.length),
  };
}

/** Bar height in px for a score: 40 points is the floor, 100 the top. */
export function barHeight(score: number, max: number): number {
  return Math.max(2, Math.round(((Math.min(100, Math.max(40, score)) - 40) / 60) * max));
}

/** Sectors the career covers in its home prefecture, or that it covers the prefecture whole. */
export function homeArea(p: CareerProfile): { regionId: RegionId; sectors: string[]; whole: boolean } {
  const regionId = p.regionId;
  const whole = safe(() => coversWholeRegion(p, regionId), true);
  return { regionId, sectors: whole ? [] : safe(() => careerSectors(p, regionId), []), whole };
}

/** What the duty map shows for the player: their desks, the offer, the challenge, the home prefecture. */
export function mapInput(
  p: CareerProfile | null,
  challenge: { sector: string; regionId: RegionId } | null,
): DutyInput {
  if (!p) return { mine: [], whole: [], offered: [], challenge, home: null };
  const regions = [
    ...new Set<RegionId>([p.regionId, ...(Array.isArray(p.unlockedRegions) ? p.unlockedRegions : [])]),
  ].filter((r) => !!REGIONS[r]);
  const mine: string[] = [];
  const whole: RegionId[] = [];
  for (const r of regions) {
    if (safe(() => coversWholeRegion(p, r), false)) whole.push(r);
    else mine.push(...safe(() => careerSectors(p, r), []));
  }
  return {
    mine,
    whole,
    offered: p.offer?.choices ?? [],
    challenge,
    home: REGIONS[p.regionId] ? p.regionId : null,
  };
}

// ── Teated ───────────────────────────────────────────────────────────────────

export type NoticeKind = 'prefect' | 'staff' | 'fleet' | 'budget' | 'rank' | 'award' | 'info';

export interface Notice {
  kind: NoticeKind;
  /** Career day it is about (P13), or null for the present state. */
  day: number | null;
  /** The text itself (a career message), or an i18n key with its variables (a Text one in the shown language). */
  text: Text | { key: string; vars: Record<string, string | number | Text> };
}

/** What a career message (sim/career applyShiftReport) is about, from its Estonian text. */
export function noticeKind(text: Text): NoticeKind {
  const s = text.et;
  if (/^Prefekt pakub|^Uus prefektuur/.test(s)) return 'prefect';
  if (/^Ülendus|^Avanes/.test(s)) return 'rank';
  if (/^Saavutus/.test(s)) return 'award';
  if (/^Palgapäev|^Eelarve on miinuses/.test(s)) return 'budget';
  if (/vigastada|tagasi teenistuses|moraal|Värbamisnimekiri|kolleegid/.test(s)) return 'staff';
  return 'info';
}

/** A vehicle this worn is worth a notice. */
const WORN = 0.5;

/**
 * The career's notices, newest concerns first: the prefect's standing offer, the messages of the last shift
 * (the same ones the HQ inbox shows until they are dismissed) and the most worn vehicle. Nothing is made up:
 * no career, no messages, no notices.
 */
export function menuNotices(p: CareerProfile | null, inbox: readonly Text[]): Notice[] {
  if (!p) return [];
  const out: Notice[] = [];
  const lastDay = p.history?.length ? p.history[p.history.length - 1].day : null;
  if (p.offer?.choices?.length) {
    const names = safe(() => sectorNames(p.offer!.choices), { et: '', en: '' });
    out.push({
      kind: 'prefect',
      day: p.offer.day ?? lastDay,
      text: { key: 'shell.menu.note.offer', vars: { names } },
    });
  }
  for (const m of inbox ?? []) {
    if (!m || typeof m.et !== 'string') continue;
    // The offer has its own notice above.
    if (p.offer && /^Prefekt pakub/.test(m.et)) continue;
    out.push({ kind: noticeKind(m), day: lastDay, text: m });
  }
  const worn = (Array.isArray(p.fleet) ? p.fleet : [])
    .filter((v) => Number.isFinite(v.condition) && v.condition < WORN)
    .sort((a, b) => a.condition - b.condition)[0];
  if (worn)
    out.push({
      kind: 'fleet',
      day: null,
      text: {
        key: 'shell.menu.note.fleetText',
        vars: { model: worn.model, plate: worn.plate, pct: Math.round(worn.condition * 100) },
      },
    });
  return out;
}

// ── The next career shift ─────────────────────────────────────────────────────

/** The shift the briefing will propose at this hour (it picks day 07-19 between 6 and 17, else night 19-07). */
export function nextShiftKind(hour: number): { kind: 'day' | 'night'; from: string; to: string } {
  return hour >= 6 && hour < 17
    ? { kind: 'day', from: '07', to: '19' }
    : { kind: 'night', from: '19', to: '07' };
}
