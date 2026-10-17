/**
 * Game clock helpers. Game time is epoch ms; display uses Europe/Tallinn wall time.
 */
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const TZ = 'Europe/Tallinn';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

export interface WallTime {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Monday … 6 = Sunday
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function wall(t: number): WallTime {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(new Date(t))) p[part.type] = part.value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "23:07" */
export function hhmm(t: number): string {
  const w = wall(t);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** "23:07:45" */
export function hhmmss(t: number): string {
  const w = wall(t);
  return `${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
}

/** "17.10.2026" */
export function ddmmyyyy(t: number): string {
  const w = wall(t);
  return `${pad(w.day)}.${pad(w.month)}.${w.year}`;
}

/** "2026-10-17" */
export function isoDate(t: number): string {
  const w = wall(t);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Duration in ms → "4 min" / "1 h 05 min". */
export function durationText(ms: number, lang: 'et' | 'en' = 'et'): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} ${lang === 'et' ? 't' : 'h'} ${pad(m % 60)} min`;
}

/**
 * Epoch ms for a Europe/Tallinn wall-clock time. Handles EET/EEST by probing the offset.
 */
export function tallinnTime(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Offset is +2h (EET) or +3h (EEST); pick the one that round-trips.
  for (const off of [3, 2]) {
    const t = guess - off * HOUR;
    const w = wall(t);
    if (w.hour === hour && w.day === day) return t;
  }
  return guess - 2 * HOUR;
}

export function seasonOf(month: number): 'winter' | 'spring' | 'summer' | 'autumn' {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}
