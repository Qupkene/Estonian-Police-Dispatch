// What the briefing's conditions mean in the sim (BriefingScreen.tsx, BriefConditions.tsx): how busy the hours of
// the shift's day are, how busy a date is, what a difficulty and a weather change. Pure functions over the sim's
// own numbers (calendar, spawner, weather, report), so the pictures tell the truth.
import type { Difficulty, Lang, Weather } from '@/sim/types';
import { dayInfo, hourCurve, weekdayFactor } from '@/sim/calendar';
import { DIFFICULTY_FACTOR } from '@/sim/spawner';
import { DIFFICULTY_XP } from '@/sim/report';
import { DAY, HOUR, wall } from '@/sim/time';
import { roadFactorFor, weatherCallFactor, weatherTrafficFactor } from '@/sim/weather';

export const LOAD_LEVELS = ['low', 'normal', 'high', 'extreme'] as const;
export type LoadLevel = (typeof LOAD_LEVELS)[number];

/** Call volume of the hour at `t` against an ordinary weekday hour: the hour of day, the weekday and the date. */
export function hourLoad(t: number): number {
  const w = wall(t);
  return hourCurve(w.hour + w.minute / 60) * weekdayFactor(t) * (dayInfo(t).factor || 1);
}

/** The timeline's top: a midsummer or New Year's night reaches it, an ordinary night is about half. */
export const TIMELINE_MAX = 3.2;

export interface DayHour {
  /** Start of the hour (epoch ms). */
  t: number;
  /** Bar height, 0..1 of TIMELINE_MAX. */
  load: number;
  inShift: boolean;
}

/** The 24 hours from `dayStart` (07:00 of the shift's date, where the day shift starts), the shift's ones marked. */
export function dayHours(dayStart: number, start: number, hours: number): DayHour[] {
  const end = start + hours * HOUR;
  return Array.from({ length: 24 }, (_, i) => {
    const t = dayStart + i * HOUR;
    const load = Math.min(1, hourLoad(t + HOUR / 2) / TIMELINE_MAX);
    return { t, load, inShift: t >= start && t < end };
  });
}

/**
 * The dark parts of those 24 hours as fractions [from, to] of the span: the morning before sunrise and the night
 * from sunset to the next sunrise. `rise1`/`set1` are the date's, `rise2` the next morning's.
 */
export function darkSpans(dayStart: number, rise1: number, set1: number, rise2: number): [number, number][] {
  const f = (x: number) => Math.min(1, Math.max(0, (x - dayStart) / DAY));
  const out: [number, number][] = [];
  if (f(rise1) > 0) out.push([0, f(rise1)]);
  if (f(rise2) > f(set1)) out.push([f(set1), f(rise2)]);
  return out;
}

/** Points of a shift where the date and the weekday are looked at. */
const SHIFT_POINTS = [0, 0.25, 0.5, 0.75, 0.95];

/** The busiest the date and the weekday make the shift (1 = an ordinary weekday; the hour of day not counted). */
export function shiftDayFactor(start: number, hours: number): number {
  let f = 0;
  for (const k of SHIFT_POINTS) {
    const t = start + k * hours * HOUR;
    f = Math.max(f, (dayInfo(t).factor || 1) * weekdayFactor(t));
  }
  return f;
}

/** That factor as 1..4 bars: ordinary, busier, busy, the busiest nights of the year. */
export function dayBars(f: number): number {
  return f <= 1.05 ? 1 : f <= 1.3 ? 2 : f <= 1.6 ? 3 : 4;
}

/** Day tags that make some calls more likely (spawner.templateWeight ×3), in the order they are named. */
export const TAG_ORDER = [
  'bonfire',
  'fireworks',
  'drunk_driving',
  'drunk',
  'drowning',
  'crowd',
  'students',
  'youth',
  'pranks',
  'sport',
  'school',
  'kids_costumes',
  'public_order_watch',
] as const;

/** The tags of the shift's dates that an incident type answers to, most telling first. */
export function shiftTags(start: number, hours: number): string[] {
  const seen = new Set<string>();
  for (const k of SHIFT_POINTS) for (const tag of dayInfo(start + k * hours * HOUR).tags) seen.add(tag);
  return TAG_ORDER.filter((x) => seen.has(x));
}

/** The level of an existing load word (BriefingScreen's load), 1..4 bars. */
export function loadBars(level: LoadLevel): number {
  return LOAD_LEVELS.indexOf(level) + 1;
}

/** Calls against the normal difficulty (spawner.DIFFICULTY_FACTOR). */
export function difficultyCalls(d: Difficulty): number {
  return DIFFICULTY_FACTOR[d] / DIFFICULTY_FACTOR.normal;
}

/** XP of a shift against the normal difficulty (report.DIFFICULTY_XP). */
export function difficultyXp(d: Difficulty): number {
  return DIFFICULTY_XP[d];
}

export interface WeatherEffect {
  /** Drive-time multiplier (roadFactor). */
  drive: number;
  /** Weight of traffic incidents. */
  traffic: number;
  /** Call-rate multiplier. */
  calls: number;
  /** Wet weather keeps fights and nightlife calls down. */
  wet: boolean;
}

export function weatherEffect(w: Weather): WeatherEffect {
  return {
    drive: w.roadFactor || 1,
    traffic: weatherTrafficFactor(w),
    calls: weatherCallFactor(w),
    wet: w.kind === 'rain' || w.kind === 'storm' || w.kind === 'sleet',
  };
}

/** A kind's own drive-time multiplier (no ice), for its tile. */
export function kindDrive(kind: Weather['kind']): number {
  return roadFactorFor(kind, 10, false);
}

const MINUS = '−';

/** "×1,8" (et) or "×1.8" (en). */
export function fmtMult(x: number, lang: Lang): string {
  const s = (Math.round(x * 10) / 10).toFixed(1);
  return `×${lang === 'et' ? s.replace('.', ',') : s}`;
}

/** A multiplier as a change: 1.4 → "+40%", 0.93 → "−7%". */
export function fmtChange(x: number): string {
  const p = Math.round((x - 1) * 100);
  return `${p < 0 ? MINUS : '+'}${Math.abs(p)}%`;
}

/** "5 °C", "−6 °C" (as weather.ts writes it). */
export function fmtTemp(c: number): string {
  const r = Math.round(c);
  return `${r < 0 ? MINUS : ''}${Math.abs(r)} °C`;
}

/** The weather's own name, the first part of its one-liner ("Lumesadu, −6 °C, ..." → "Lumesadu"). */
export function weatherName(w: Weather, lang: Lang): string {
  return (w.text[lang] || w.text.et).split(', ')[0];
}

/** "reede öö", "laupäeva öö" (the Estonian weekday in the genitive), "Friday night". */
export function nightOf(weekday: string, lang: Lang): string {
  if (lang !== 'et') return `${weekday} night`;
  return `${weekday.endsWith('päev') ? weekday + 'a' : weekday} öö`;
}

export function capitalize(s: string): string {
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}
