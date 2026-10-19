// Pure helpers for the career page (Valvekaart): what the prefect's offer changes, the next shift's crews, the
// fleet's rows, the last shifts and the rank that opens the next prefecture. No React / DOM imports.
// Unit-tested in tests/career-hq-model.test.ts.
import { DAILY_BUDGET, SECTOR_HANDOVER } from '@/data/economy';
import * as rules from '@/sim/career';
import { careerSectors, positionTitle } from '@/sim/careerSectors';
import { sectorById } from '@/sim/sectors';
import type { CareerProfile, RegionId, RosterUnit, ShiftReport, Text } from '@/sim/types';
import { regionLocks, safe } from './helpers';

const DISPATCHER: Text = { et: 'Operatiivinfo haldur', en: 'Dispatcher' };

export interface OfferFacts {
  sectorId: string;
  regionId: RegionId;
  /** The AI colleague at the sector's desk now. */
  colleague: string;
  position: Text;
  /** The post with the sector added ("Vanem-operatiivinfo haldur"). */
  positionAfter: Text;
  budget: number;
  budgetAfter: number;
  grant: number;
  /** Officers that come with the sector (lowest, highest). */
  staff: readonly [number, number];
}

/** What taking `sectorId` would change: the rules applied to the profile as it would be. */
export function offerFacts(p: CareerProfile, sectorId: string): OfferFacts {
  const sec = sectorById(sectorId);
  const regionId = p.offer?.regionId ?? sec?.regionId ?? p.regionId;
  const covered = safe(() => careerSectors(p, regionId), [] as string[]);
  const after: CareerProfile = { ...p, sectors: { ...p.sectors, [regionId]: [...covered, sectorId] } };
  const fallback = DAILY_BUDGET[regionId] ?? 0;
  const c = sec?.colleague;
  return {
    sectorId,
    regionId,
    colleague: c ? `${c.firstName} ${c.lastName}`.trim() : '',
    position: safe(() => positionTitle(p), DISPATCHER),
    positionAfter: safe(() => positionTitle(after), DISPATCHER),
    budget: safe(() => rules.dailyBudget(p, regionId), fallback),
    budgetAfter: safe(() => rules.dailyBudget(after, regionId), fallback),
    grant: SECTOR_HANDOVER.grant,
    staff: SECTOR_HANDOVER.staff,
  };
}

export interface CrewRow {
  callsign: string;
  vehicle: string;
  /** "K. Kask, K. Mägi". */
  crew: string;
  onCall: boolean;
}

/** The roster as the next shift's crews: callsign, vehicle, the officers by initial and surname. */
export function crewRows(roster: readonly RosterUnit[] | null): CrewRow[] {
  return (roster ?? []).map((u) => ({
    callsign: u.callsign,
    vehicle: u.vehicle,
    crew: (u.crew ?? [])
      .map((o) => `${(o.firstName || '').slice(0, 1)}. ${o.lastName}`.replace(/^\. /, ''))
      .join(', '),
    onCall: !!u.onCall,
  }));
}

/** A vehicle the roster leaves out (rules.rosterFromCareer takes none at or under 5 %). */
const OUT = 0.05;
/** A vehicle this worn is worth a word (as in the menu's notices). */
const WORN = 0.5;

export interface FleetRow {
  id: string;
  model: string;
  plate: string;
  /** 0..100. */
  condition: number;
  upkeep: number;
  state: 'ok' | 'worn' | 'out';
}

/** The fleet's rows, in the order the career keeps them. */
export function fleetRows(p: CareerProfile): FleetRow[] {
  return (Array.isArray(p.fleet) ? p.fleet : []).map((v) => {
    const c = Number.isFinite(v.condition) ? v.condition : 0;
    return {
      id: v.id,
      model: v.model,
      plate: v.plate,
      condition: Math.round(Math.max(0, Math.min(1, c)) * 100),
      upkeep: v.upkeep || 0,
      state: c <= OUT ? 'out' : c < WORN ? 'worn' : 'ok',
    };
  });
}

export interface ShiftRow {
  day: number;
  regionId: RegionId;
  grade: ShiftReport['grade'];
  score: number;
  incidents: number;
  earnings: number;
  reputationDelta: number;
}

export interface ShiftSummary {
  /** Every shift the career has played, and the average and best of the history it keeps. */
  count: number;
  avg: number | null;
  best: number | null;
  /** The last `rows`, newest first. */
  rows: ShiftRow[];
}

const finite = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function shiftSummary(p: CareerProfile, rows = 6): ShiftSummary {
  const history = (Array.isArray(p.history) ? p.history : []).filter((h) => Number.isFinite(h.score));
  const scores = history.map((h) => h.score);
  const bestStat = finite(p.stats?.bestScore, NaN);
  return {
    count: finite(p.stats?.shifts, history.length),
    avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    best:
      Number.isFinite(bestStat) && history.length
        ? Math.round(bestStat)
        : scores.length
          ? Math.round(Math.max(...scores))
          : null,
    rows: history
      .slice(-rows)
      .reverse()
      .map((h) => ({
        day: h.day,
        regionId: h.regionId,
        grade: h.grade,
        score: Math.round(h.score),
        incidents: finite(h.incidents),
        earnings: finite(h.earnings),
        reputationDelta: finite(h.reputationDelta),
      })),
  };
}

/** The rank index that opens the next prefecture still closed (null when every one is open). */
export function nextRegionRank(p: Pick<CareerProfile, 'regionId' | 'unlockedRegions'>): number | null {
  const ranks = regionLocks(p)
    .filter((l) => !l.unlocked && l.minRank !== undefined)
    .map((l) => l.minRank!);
  return ranks.length ? Math.min(...ranks) : null;
}
