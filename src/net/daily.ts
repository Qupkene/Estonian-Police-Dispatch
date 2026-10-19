// Päeva väljakutse (daily challenge, src/sim/daily.ts): POST /api/daily after a daily run (accounts only) and
// GET /api/daily?day= for the menu tile and the daily board. Daily runs never go to POST /api/score.
import type { ShiftReport } from '@/sim/types';
import { isDailyDate } from '@/sim/daily';
import { request } from './api';
import { isObj } from './sync';

export interface DailyRow {
  name: string;
  score: number;
  grade: string;
  incidents: number;
  at: number;
  /** Place on the day's board: 1 + the number of players with a strictly higher score. */
  rank: number;
}

export interface DailyBoard {
  day: string;
  /** Players with a counted run that day. */
  players: number;
  /** Top 50, best first. */
  scores: DailyRow[];
  /** The caller's counted run (logged in only). */
  me: DailyRow | null;
}

export interface DailyResult {
  /** False when the player already had a counted run that day: this one was practice. */
  counted: boolean;
  /** Place of the player's counted run. */
  rank: number | null;
  players: number | null;
}

/** What the report knows about a daily run besides the report itself (from sim.flags, src/sim/daily.ts). */
export interface DailyRun {
  day: string;
  sector: string;
  /** Real time the run was started (unix ms), for the grace window after midnight. */
  started: number | null;
}

/** Body of POST /api/daily (docs/SERVER.md). */
export function dailyBody(r: ShiftReport, run: DailyRun) {
  return {
    day: run.day,
    regionId: r.regionId,
    sector: run.sector,
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    grade: r.grade,
    incidents: r.stats?.incidents ?? 0,
    arrests: r.stats?.arrests ?? 0,
    ...(run.started ? { started: run.started } : {}),
  };
}

const toNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const posInt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

function parseRow(v: unknown): DailyRow | null {
  if (!isObj(v)) return null;
  return {
    name: typeof v.name === 'string' ? v.name : '?',
    score: toNum(v.score),
    grade: typeof v.grade === 'string' ? v.grade : '',
    incidents: toNum(v.incidents),
    at: toNum(v.at),
    rank: posInt(v.rank) ?? 0,
  };
}

export function parseDaily(v: unknown, day: string): DailyBoard {
  const o = isObj(v) ? v : {};
  const scores = Array.isArray(o.scores) ? o.scores.map(parseRow).filter((r): r is DailyRow => !!r) : [];
  return {
    day: isDailyDate(o.day) ? o.day : day,
    players: Math.max(toNum(o.players), scores.length),
    scores: scores.map((r, i) => (r.rank ? r : { ...r, rank: i + 1 })),
    me: parseRow(o.me),
  };
}

export function parseDailyResult(v: unknown): DailyResult {
  const o = isObj(v) ? v : {};
  return { counted: o.counted !== false, rank: posInt(o.rank), players: posInt(o.players) };
}

/** Each report is posted once, however often the report screen renders (StrictMode included). */
const submitted = new WeakMap<ShiftReport, Promise<DailyResult>>();

/** POST the daily run once; resolves with whether it counted and the player's place that day. */
export function submitDailyOnce(report: ShiftReport, run: DailyRun): Promise<DailyResult> {
  let p = submitted.get(report);
  if (!p) {
    p = request<unknown>('POST', '/daily', dailyBody(report, run)).then((r) => {
      invalidateDaily();
      return parseDailyResult(r);
    });
    // A failed attempt may be retried by the player.
    p.catch(() => submitted.delete(report));
    submitted.set(report, p);
  }
  return p;
}

/** Short-lived cache so the menu does not refetch on every visit. */
const cache = new Map<string, { at: number; board: DailyBoard }>();
const CACHE_MS = 20_000;

/** A day's board. `who` (the signed-in account id, null for a guest) keeps `me` apart per account in the cache. */
export async function fetchDaily(day: string, who: number | null = null, fresh = false): Promise<DailyBoard> {
  const key = `${day}:${who ?? ''}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.board;
  const board = parseDaily(await request<unknown>('GET', `/daily?day=${encodeURIComponent(day)}`), day);
  cache.set(key, { at: Date.now(), board });
  return board;
}

/** Forget cached boards (after a run was posted, or the account changed). */
export function invalidateDaily(): void {
  cache.clear();
}

// ── A guest's own result (kept in this browser only; it never counts) ──────────

const GUEST_KEY = 'epd:daily.guest';

export interface LocalDaily {
  day: string;
  score: number;
  grade: string;
}

/** The guest's first result of `day` in this browser, if any. */
export function guestDaily(day: string): LocalDaily | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null');
    if (!isObj(v) || v.day !== day || typeof v.grade !== 'string') return null;
    return { day, score: toNum(v.score), grade: v.grade };
  } catch {
    return null;
  }
}

/** Remember a guest's result of `day`; like the server, only the first one of the day. */
export function rememberGuestDaily(day: string, report: Pick<ShiftReport, 'score' | 'grade'>): void {
  if (guestDaily(day)) return;
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({ day, score: Math.round(report.score), grade: report.grade }),
    );
  } catch {
    /* storage full or blocked: nothing to remember */
  }
}
