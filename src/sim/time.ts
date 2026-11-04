/**
 * Game clock helpers. Game time is epoch ms; display uses Europe/Tallinn wall time.
 */
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const TZ = 'Europe/Tallinn';

/** The browser's time zone data, made on first use: it costs tens of milliseconds on a slow phone. */
let partsFmt: Intl.DateTimeFormat | null = null;
const fmt = () =>
  (partsFmt ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }));

/** Ms of the last Sunday of `month` (0-based) in `year`, 01:00 UTC: when the EU's summer time starts or ends. */
function lastSunday(year: number, month: number): number {
  const last = Date.UTC(year, month + 1, 0, 1);
  return last - new Date(last).getUTCDay() * DAY;
}

/**
 * Europe/Tallinn's offset (hours) by the EU rule it has kept since 2002: +3 from the last Sunday of March to the last
 * Sunday of October (01:00 UTC both), else +2. Null outside 2002-2037, where the time zone data decides
 * (tests/time.test.ts checks every hour of the span against it).
 */
function tallinnOffset(t: number): 2 | 3 | null {
  const year = new Date(t).getUTCFullYear();
  if (year < 2002 || year > 2037) return null;
  return t >= lastSunday(year, 2) && t < lastSunday(year, 9) ? 3 : 2;
}

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
  const off = tallinnOffset(t);
  if (off !== null) {
    const d = new Date(t + off * HOUR);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      weekday: (d.getUTCDay() + 6) % 7,
    };
  }
  return wallByZoneData(t);
}

/** Wall time from the browser's time zone data (and the reference for the rule above). */
export function wallByZoneData(t: number): WallTime {
  const p: Record<string, string> = {};
  for (const part of fmt().formatToParts(new Date(t))) p[part.type] = part.value;
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
