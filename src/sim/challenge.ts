/**
 * Väljakutse lingiga (2.38.0, docs/CHALLENGE.md): a finished free shift as a setup another player can play again, the
 * same calls at the same times (a fixed-schedule shift), and what two results are compared by. Pure functions.
 */
import { DAILY_FLAG } from './daily';
import { areaOf } from './sectors';
import { HOUR, wall } from './time';
import type { Difficulty, NewShiftOptions, RegionId, ShiftReport, SimState, Text, Weather } from './types';

/** What it takes to play a free shift again: the same seed, place, time and conditions. */
export interface ShiftSetup {
  seed: number;
  regionId: RegionId;
  difficulty: Difficulty;
  /** Game time the shift starts (ms). */
  start: number;
  hours: number;
  /** The weather the briefing gave (its forecast or the kind picked). */
  weather?: Weather['kind'];
  /** The chance of a major incident (NewShiftOptions.crisis). */
  crisis?: number;
}

/** sim.flags key of a challenge run: the challenge's code. */
export const CHALLENGE_FLAG = 'challenge';
/** sim.flags keys of the setup createShift was given (engine.ts): the weather and the crisis chance. */
export const SETUP_WX = 'setup:wx';
export const SETUP_CRISIS = 'setup:crisis';

/**
 * The setup of a shift another player can play the same: a free fixed-schedule shift of the whole prefecture that is
 * not a custom game, a daily run, a room's or itself a challenge run. Undefined for any other.
 */
export function setupOf(s: SimState): ShiftSetup | undefined {
  if (s.mode !== 'free' || s.spawnRng === undefined || areaOf(s).length) return undefined;
  if (s.flags.custom || s.flags.room || s.flags[DAILY_FLAG] || s.flags[CHALLENGE_FLAG]) return undefined;
  const wx = s.flags[SETUP_WX];
  const crisis = s.flags[SETUP_CRISIS];
  return {
    seed: s.seed,
    regionId: s.regionId,
    difficulty: s.difficulty,
    start: s.startTime,
    hours: Math.round(((s.endTime - s.startTime) / HOUR) * 100) / 100,
    ...(typeof wx === 'string' ? { weather: wx as Weather['kind'] } : {}),
    ...(typeof crisis === 'number' && crisis > 0 ? { crisis } : {}),
  };
}

/** The shift of a challenge, for the player who takes it. */
export function challengeShiftOptions(setup: ShiftSetup, playerName: string): NewShiftOptions {
  return {
    seed: setup.seed,
    regionId: setup.regionId,
    mode: 'free',
    difficulty: setup.difficulty,
    start: setup.start,
    hours: setup.hours,
    playerName,
    fixedSchedule: true,
    ...(setup.weather ? { weather: setup.weather } : {}),
    ...(setup.crisis ? { crisis: setup.crisis } : {}),
  };
}

export function markChallenge(sim: Pick<SimState, 'flags'>, code: string): void {
  sim.flags[CHALLENGE_FLAG] = code;
}

export function challengeCodeOf(sim: Pick<SimState, 'flags'> | null | undefined): string | null {
  const v = sim?.flags[CHALLENGE_FLAG];
  return typeof v === 'string' && v ? v : null;
}

/** What two results of a challenge are compared by (docs/CHALLENGE.md section 1). */
export interface ChallengeStats {
  /** 0..100. */
  score: number;
  grade: ShiftReport['grade'];
  /** Incidents handled (closed). */
  closed: number;
  arrests: number;
  /** Average minutes to the first crew at the most urgent calls, one decimal; null without any. */
  p1: number | null;
  /** The major incident's result (0..100), null without one. */
  crisis: number | null;
}

export function challengeStats(r: ShiftReport): ChallengeStats {
  const p1 = r.avgResponse?.[1];
  return {
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    grade: r.grade,
    closed: r.stats?.closed ?? 0,
    arrests: r.stats?.arrests ?? 0,
    p1: typeof p1 === 'number' && Number.isFinite(p1) ? Math.round(p1 * 10) / 10 : null,
    crisis: r.crisis ? r.crisis.result : null,
  };
}

const WEEKDAY: Text[] = [
  { et: 'esmaspäev', en: 'Monday' },
  { et: 'teisipäev', en: 'Tuesday' },
  { et: 'kolmapäev', en: 'Wednesday' },
  { et: 'neljapäev', en: 'Thursday' },
  { et: 'reede', en: 'Friday' },
  { et: 'laupäev', en: 'Saturday' },
  { et: 'pühapäev', en: 'Sunday' },
];

/** "reede öö" / "Friday night": the shift's weekday and whether it is a day or a night shift (Tallinn time). */
export function shiftWhen(start: number): Text {
  const w = wall(start);
  // wall's weekday: 0 Monday .. 6 Sunday; a day shift as engine.ts shiftKindOf counts it.
  const day = WEEKDAY[w.weekday] ?? WEEKDAY[0];
  const night = w.hour < 6 || w.hour >= 18;
  return { et: `${day.et} ${night ? 'öö' : 'päev'}`, en: `${day.en} ${night ? 'night' : 'day'}` };
}
