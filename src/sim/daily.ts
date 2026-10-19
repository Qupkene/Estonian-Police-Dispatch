/**
 * Päeva väljakutse (daily challenge): one shift a day, the same for everyone, with its own leaderboard
 * (docs/SERVER.md, "Daily challenge"). Everything follows from the date alone, so every browser builds the
 * same shift and the server only needs the date to keep one board per day.
 *
 * - Area: one starter sector (docs/SECTORS.md). Every starter sector comes up once in each run of N
 *   consecutive days (N = number of starter sectors), in a shuffled order that never repeats a sector on two
 *   days in a row. Without sector data the four prefectures rotate the same way, each played whole.
 * - Time of day: morning, afternoon, evening or night; Friday and Saturday nights come up more often.
 * - Weather: picked from the season, harsh now and then (a gale, sleet, a thunderstorm, thick fog).
 * - Normal difficulty, 3 game hours, free mode, `fixedSchedule` (the same calls whatever the player does).
 *
 * A daily run is an ordinary free shift whose `flags.daily` holds the date ('YYYY-MM-DD'); the report posts
 * it to /api/daily instead of /api/score. Pure functions: no store, no network.
 */
import { hashString, Rng } from './rng';
import { DAY, isoDate, tallinnTime } from './time';
import { starterSectors } from './sectors';
import type { Difficulty, GameMode, NewShiftOptions, RegionId, SimState, Weather } from './types';

export type DailySlot = 'morning' | 'afternoon' | 'evening' | 'night';
type Kind = Weather['kind'];

export const DAILY_HOURS = 3;
export const DAILY_DIFFICULTY: Difficulty = 'normal';
export const DAILY_MODE: GameMode = 'free';

const REGION_IDS: RegionId[] = ['pohja', 'ida', 'louna', 'laane'];

/** Start hours of each part of the day (Tallinn wall time, on the challenge's date). */
export const SLOT_HOURS: Record<DailySlot, number[]> = {
  morning: [7, 8, 9],
  afternoon: [12, 13, 14],
  evening: [17, 18, 19],
  night: [21, 22, 23],
};
export const DAILY_SLOTS: DailySlot[] = ['morning', 'afternoon', 'evening', 'night'];
/** Weights of the parts of the day: a weekday, and a Friday or Saturday (busy nights out). */
const SLOT_WEIGHT: Record<'weekday' | 'weekend', Record<DailySlot, number>> = {
  weekday: { morning: 1, afternoon: 1, evening: 1, night: 1 },
  weekend: { morning: 0.5, afternoon: 0.7, evening: 1, night: 2.8 },
};

/** How often a day gets harsh weather. */
export const HARSH_CHANCE = 0.18;

/** Ordinary weather per month (index 0 = January), roughly the Estonian climate. */
const MILD: Partial<Record<Kind, number>>[] = [
  { clear: 0.25, cloudy: 0.45, snow: 0.25, fog: 0.05 }, // Jan
  { clear: 0.3, cloudy: 0.4, snow: 0.25, fog: 0.05 }, // Feb
  { clear: 0.35, cloudy: 0.4, snow: 0.1, rain: 0.1, fog: 0.05 }, // Mar
  { clear: 0.4, cloudy: 0.35, rain: 0.2, fog: 0.05 }, // Apr
  { clear: 0.45, cloudy: 0.33, rain: 0.2, fog: 0.02 }, // May
  { clear: 0.55, cloudy: 0.25, rain: 0.2 }, // Jun
  { clear: 0.55, cloudy: 0.25, rain: 0.2 }, // Jul
  { clear: 0.5, cloudy: 0.27, rain: 0.23 }, // Aug
  { clear: 0.3, cloudy: 0.4, rain: 0.25, fog: 0.05 }, // Sep
  { clear: 0.2, cloudy: 0.45, rain: 0.28, fog: 0.07 }, // Oct
  { clear: 0.1, cloudy: 0.5, rain: 0.25, fog: 0.1, snow: 0.05 }, // Nov
  { clear: 0.15, cloudy: 0.45, snow: 0.3, fog: 0.1 }, // Dec
];
/** Harsh weather per month: winter blizzards and sleet, summer thunderstorms, autumn gales and fog. */
const HARSH: Partial<Record<Kind, number>>[] = [
  { storm: 0.4, sleet: 0.35, snow: 0.25 }, // Jan
  { storm: 0.4, sleet: 0.35, snow: 0.25 }, // Feb
  { sleet: 0.5, storm: 0.3, fog: 0.2 }, // Mar
  { sleet: 0.3, storm: 0.4, fog: 0.3 }, // Apr
  { storm: 0.6, fog: 0.4 }, // May
  { storm: 1 }, // Jun
  { storm: 1 }, // Jul
  { storm: 0.85, fog: 0.15 }, // Aug
  { storm: 0.6, fog: 0.4 }, // Sep
  { storm: 0.6, fog: 0.3, sleet: 0.1 }, // Oct
  { storm: 0.4, sleet: 0.4, fog: 0.2 }, // Nov
  { storm: 0.4, sleet: 0.3, snow: 0.3 }, // Dec
];

/** One day's challenge. */
export interface DailyChallenge {
  /** 'YYYY-MM-DD', Europe/Tallinn. */
  date: string;
  regionId: RegionId;
  /** Starter sector id; '' when the prefecture has no sector data and is played whole. */
  sector: string;
  slot: DailySlot;
  /** Game start (epoch ms): the challenge's date at the slot's hour, Tallinn wall time. */
  start: number;
  hours: number;
  weather: Kind;
  /** A day of harsh weather. */
  harsh: boolean;
  seed: number;
  /** Shift options for createShift, all but the player's name. */
  options: Omit<NewShiftOptions, 'playerName'>;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Year, month, day of a 'YYYY-MM-DD' string, or null when it is not a real calendar date. */
export function parseDate(date: string): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

export function isDailyDate(v: unknown): v is string {
  return typeof v === 'string' && parseDate(v) !== null;
}

/** Days since 1970-01-01 of a calendar date (no time zone involved). */
function dayNumber(date: string): number {
  const p = parseDate(date);
  if (!p) throw new Error(`dailyChallenge: bad date ${date}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY);
}

/** The calendar date `delta` days from `date`. */
export function addDays(date: string, delta: number): string {
  const p = parseDate(date);
  if (!p) throw new Error(`addDays: bad date ${date}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + delta));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Today's date in Europe/Tallinn ('YYYY-MM-DD'): the day whose challenge is open. */
export function todayInTallinn(now: number = Date.now()): string {
  return isoDate(now);
}

/** Epoch ms of the next midnight in Tallinn, when the next challenge opens. */
export function nextChallengeAt(now: number = Date.now()): number {
  const p = parseDate(addDays(todayInTallinn(now), 1))!;
  return tallinnTime(p.y, p.m, p.d, 0, 0);
}

interface Area {
  regionId: RegionId;
  sector: string;
}

/** Every starter sector of the four prefectures; the prefectures themselves while there is no sector data. */
export function dailyPool(): Area[] {
  const sectors: Area[] = REGION_IDS.flatMap((regionId) =>
    starterSectors(regionId).map((x) => ({ regionId, sector: x.id })),
  );
  return sectors.length ? sectors : REGION_IDS.map((regionId) => ({ regionId, sector: '' }));
}

const sameArea = (a: Area, b: Area) => a.regionId === b.regionId && a.sector === b.sector;

function shuffledCycle(pool: Area[], cycle: number): Area[] {
  return new Rng(hashString(`epd-daily-cycle:${pool.length}:${cycle}`)).shuffle([...pool]);
}

/**
 * Order of the areas in a cycle of `pool.length` days: shuffled, and never the same area on the last day of
 * one cycle and the first day of the next (the first two swap; the last day stays, so this never cascades).
 */
export function cycleOrder(pool: Area[], cycle: number): Area[] {
  if (pool.length <= 2) return [...pool];
  const order = shuffledCycle(pool, cycle);
  const prevLast = shuffledCycle(pool, cycle - 1)[pool.length - 1];
  if (sameArea(order[0], prevLast)) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

function pickWeighted<T extends string>(rng: Rng, weights: Partial<Record<T, number>>): T {
  const keys = Object.keys(weights) as T[];
  return rng.weighted(keys, (k) => weights[k] ?? 0);
}

/** The challenge of a date ('YYYY-MM-DD'): the same for everyone, whoever asks and whenever. */
export function dailyChallenge(date: string): DailyChallenge {
  const p = parseDate(date);
  if (!p) throw new Error(`dailyChallenge: bad date ${date}`);
  const n = dayNumber(date);
  const pool = dailyPool();
  const cycle = Math.floor(n / pool.length);
  const area = cycleOrder(pool, cycle)[n - cycle * pool.length];

  const seed = hashString(`epd-daily:${date}`) || 1;
  // Separate streams, so a change to one choice never reshuffles the others.
  const rSlot = new Rng(hashString(`epd-daily-slot:${date}`));
  const rWeather = new Rng(hashString(`epd-daily-weather:${date}`));

  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sunday
  const busy = weekday === 5 || weekday === 6;
  const slot = pickWeighted<DailySlot>(rSlot, SLOT_WEIGHT[busy ? 'weekend' : 'weekday']);
  const hour = rSlot.pick(SLOT_HOURS[slot]);
  const start = tallinnTime(p.y, p.m, p.d, hour, 0);

  const harsh = rWeather.chance(HARSH_CHANCE);
  const weather = pickWeighted<Kind>(rWeather, (harsh ? HARSH : MILD)[p.m - 1]);

  return {
    date,
    regionId: area.regionId,
    sector: area.sector,
    slot,
    start,
    hours: DAILY_HOURS,
    weather,
    harsh,
    seed,
    options: {
      seed,
      regionId: area.regionId,
      mode: DAILY_MODE,
      difficulty: DAILY_DIFFICULTY,
      start,
      hours: DAILY_HOURS,
      weather,
      ...(area.sector ? { sectors: [area.sector] } : {}),
      fixedSchedule: true,
    },
  };
}

/** Shift options of a date's challenge for a player. */
export function dailyShiftOptions(date: string, playerName: string): NewShiftOptions {
  return { ...dailyChallenge(date).options, playerName };
}

/** sim.flags keys of a daily run: its date, and when (real time, unix ms) it was started. */
export const DAILY_FLAG = 'daily';
export const DAILY_STARTED_FLAG = 'dailyStarted';

/** Mark a freshly created shift as the run of a date's challenge. */
export function markDaily(sim: Pick<SimState, 'flags'>, date: string, startedAt: number = Date.now()): void {
  sim.flags[DAILY_FLAG] = date;
  sim.flags[DAILY_STARTED_FLAG] = startedAt;
}

/** The challenge date of a daily run, or null for any other shift. */
export function dailyDateOf(sim: Pick<SimState, 'flags'> | null | undefined): string | null {
  const v = sim?.flags?.[DAILY_FLAG];
  return isDailyDate(v) ? v : null;
}

/** Real time (unix ms) a daily run was started, when known. */
export function dailyStartedOf(sim: Pick<SimState, 'flags'> | null | undefined): number | null {
  const v = sim?.flags?.[DAILY_STARTED_FLAG];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
