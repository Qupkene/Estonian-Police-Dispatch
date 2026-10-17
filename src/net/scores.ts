// Leaderboard: POST /api/score after a shift (logged-in players) and GET /api/scores for the menu.
import type { Difficulty, GameMode, RegionId, ShiftReport } from '@/sim/types';
import { request } from './api';
import { isObj } from './sync';

export interface ScoreRow {
  name: string;
  score: number;
  grade: string;
  regionId: RegionId | string;
  difficulty: Difficulty | string;
  incidents: number;
  at: number;
}

/** Modes that go on the leaderboard (director mode is a film set, the tutorial is practice). */
const RANKED: GameMode[] = ['free', 'career'];

/**
 * Why a report stays off the leaderboard, or null when it goes on it. A shift without a single
 * incident scores a flat 72 in the sim, so posting it would let anyone rank by starting and
 * ending a shift at once.
 */
export function unrankedReason(report: Pick<ShiftReport, 'mode'> & { stats?: { incidents?: number } }): 'mode' | 'empty' | null {
  if (!RANKED.includes(report.mode)) return 'mode';
  if (!report.stats?.incidents) return 'empty';
  return null;
}

export function isRanked(report: Pick<ShiftReport, 'mode'> & { stats?: { incidents?: number } }): boolean {
  return unrankedReason(report) === null;
}

/** Body of POST /api/score (docs/SERVER.md). */
export function scoreBody(r: ShiftReport) {
  return {
    regionId: r.regionId,
    mode: r.mode,
    difficulty: r.difficulty,
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    grade: r.grade,
    incidents: r.stats?.incidents ?? 0,
    arrests: r.stats?.arrests ?? 0,
    start: r.start,
  };
}

/** Each report is submitted once, however often the report screen renders (StrictMode included). */
const submitted = new WeakMap<ShiftReport, Promise<number | null>>();

/** POST the report's score once; resolves with the leaderboard rank (null when the server sent none). */
export function submitScoreOnce(report: ShiftReport): Promise<number | null> {
  let p = submitted.get(report);
  if (!p) {
    p = request<{ rank?: unknown }>('POST', '/score', scoreBody(report)).then((r) => {
      invalidateScores();
      const rank = Number(r?.rank);
      return Number.isFinite(rank) && rank > 0 ? rank : null;
    });
    // A failed attempt may be retried by the player.
    p.catch(() => submitted.delete(report));
    submitted.set(report, p);
  }
  return p;
}

const toNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export function parseScores(v: unknown): ScoreRow[] {
  const list = isObj(v) && Array.isArray(v.scores) ? v.scores : [];
  return list.filter(isObj).map((s) => ({
    name: typeof s.name === 'string' ? s.name : '?',
    score: toNum(s.score),
    grade: typeof s.grade === 'string' ? s.grade : '',
    regionId: typeof s.regionId === 'string' ? s.regionId : '',
    difficulty: typeof s.difficulty === 'string' ? s.difficulty : '',
    incidents: toNum(s.incidents),
    at: toNum(s.at),
  }));
}

/** Short-lived cache so the menu does not refetch on every visit. */
const cache = new Map<string, { at: number; rows: ScoreRow[] }>();
const CACHE_MS = 20_000;

export async function fetchScores(region: RegionId | null, limit = 10, fresh = false): Promise<ScoreRow[]> {
  const key = `${region ?? ''}:${limit}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const q = new URLSearchParams({ limit: String(limit) });
  if (region) q.set('region', region);
  const rows = parseScores(await request<unknown>('GET', `/scores?${q.toString()}`));
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Forget cached leaderboards (after submitting a new score). */
export function invalidateScores(): void {
  cache.clear();
}
