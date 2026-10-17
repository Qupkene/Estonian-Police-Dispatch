/**
 * Call-volume calendar: hour-of-day curve, weekday/weekend factor and Estonian public holidays
 * & special days (riigipühad, jaanipäev, vana-aasta öö…).
 *
 * Numbers follow docs/research/112-and-priorities.md §4.3/§5.3: peak nights (New Year's Eve
 * 500+ police call-outs ≈ 1.8× a normal night; jaanipäev 1 200+ call-outs over 23–24 June),
 * weekday trough 05–07, Friday/Saturday 20–04 at 1.6–2.0× of the weekday curve.
 *
 * Owned by engine-systems. Pure functions.
 */
import { HOUR, wall } from './time';
import type { Text } from './types';

const T = (et: string, en: string): Text => ({ et, en });

// ─────────────────────────────────────────────────────────────────────────────
// Hour curve
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multiplier per hour (index = local hour 0..23). Peak 22–02 ≈ 1.6, trough 04–07 ≈ 0.45,
 * morning commute bump (crashes) 07–09, steady afternoon, rising evening.
 * The mean is ≈ 1.04 (close to 1) so `region.callVolume` stays the true daily average rate.
 */
export const HOUR_CURVE: readonly number[] = [
  1.6, // 00
  1.5, // 01
  1.3, // 02
  0.95, // 03
  0.6, // 04
  0.45, // 05
  0.45, // 06
  0.62, // 07
  0.85, // 08
  0.88, // 09
  0.9, // 10
  0.92, // 11
  0.95, // 12
  0.95, // 13
  0.97, // 14
  1.0, // 15
  1.05, // 16
  1.08, // 17
  1.1, // 18
  1.15, // 19
  1.22, // 20
  1.32, // 21
  1.48, // 22
  1.58, // 23
];

/** Multiplier on call volume for the hour of day 0..23 (peaks around 22–02). Fractional hours interpolate. */
export function hourCurve(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const f = h - i;
  const a = HOUR_CURVE[i];
  const b = HOUR_CURVE[(i + 1) % 24];
  return a + (b - a) * f;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekday factor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multiplier for weekday/weekend. Friday night (Fri 18:00 – Sat 04:00) ×1.38, Saturday night
 * (Sat 18:00 – Sun 04:00) ×1.5, Sunday-morning tail 04–10 ×1.15, Sunday evening domestic bump,
 * quieter Sunday daytime and Monday early hours.
 */
export function weekdayFactor(t: number): number {
  const w = wall(t);
  const h = w.hour + w.minute / 60;
  const wd = w.weekday; // 0 = Mon … 6 = Sun
  // Friday night (incl. small hours of Saturday)
  if ((wd === 4 && h >= 18) || (wd === 5 && h < 4)) return h >= 22 || h < 4 ? 1.42 : 1.3;
  // Saturday night (incl. small hours of Sunday)
  if ((wd === 5 && h >= 18) || (wd === 6 && h < 4)) return h >= 22 || h < 4 ? 1.5 : 1.35;
  // Thursday late evening (students, after-work)
  if (wd === 3 && h >= 21) return 1.1;
  if (wd === 5) return 1.12; // Saturday daytime: shops, malls, traffic
  if (wd === 6) {
    if (h < 10) return 1.15; // Sunday-morning tail: drunk drivers, domestic
    if (h >= 18) return 1.05; // Sunday evening domestic bump
    return 0.88; // quiet Sunday daytime
  }
  if (wd === 0 && h < 6) return 0.85; // Monday early hours
  if (wd === 4) return 1.05; // Friday daytime
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Holidays & special days
// ─────────────────────────────────────────────────────────────────────────────

/** Gregorian Easter Sunday (Anonymous Gregorian / Meeus–Jones–Butcher). Returns [month, day]. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function addDays(year: number, month: number, day: number, delta: number): [number, number, number] {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

export interface SpecialDay {
  /** Stable id, e.g. 'jaanipaev'. */
  id: string;
  month: number;
  day: number;
  name: Text;
  /** Official public holiday (riigipüha, day off). */
  publicHoliday: boolean;
  /** Call-volume multiplier for the whole local day (night windows handled separately). */
  factor: number;
  tags: string[];
  note?: Text;
}

/**
 * Laulu- ja tantsupeo years (all-Estonian song & dance festival, early July, Tallinn
 * lauluväljak). 2025 = XXVIII laulupidu "Iseoma" (3–6 July 2025). The festival is held
 * about every five years, so 2030 is an estimate — adjust when the date is announced.
 */
export const SONG_FESTIVALS: Record<number, { from: [number, number]; to: [number, number]; estimate?: boolean }> = {
  2025: { from: [7, 3], to: [7, 6] },
  2030: { from: [7, 4], to: [7, 7], estimate: true },
};

/** All special days of a year, chronologically. */
export function specialDays(year: number): SpecialDay[] {
  const [em, ed] = easterSunday(year);
  const [, gfm, gfd] = addDays(year, em, ed, -2);
  const [, pm, pd] = addDays(year, em, ed, 49);
  const list: SpecialDay[] = [
    { id: 'uusaasta', month: 1, day: 1, name: T('Uusaasta', "New Year's Day"), publicHoliday: true, factor: 1.25, tags: ['hangover', 'drunk_driving', 'domestic'] },
    { id: 'sobrapaev', month: 2, day: 14, name: T('Sõbrapäev', "Valentine's Day"), publicHoliday: false, factor: 1.0, tags: [] },
    {
      id: 'vabariigi_aastapaev',
      month: 2,
      day: 24,
      name: T('Eesti Vabariigi aastapäev (iseseisvuspäev)', 'Independence Day of the Republic of Estonia'),
      publicHoliday: true,
      factor: 1.15,
      tags: ['parade', 'fireworks', 'crowd', 'vip'],
    },
    { id: 'suur_reede', month: gfm, day: gfd, name: T('Suur reede', 'Good Friday'), publicHoliday: true, factor: 1.05, tags: ['long_weekend', 'traffic'] },
    { id: 'ulestousmispuhad', month: em, day: ed, name: T('Ülestõusmispühade 1. püha (lihavõtted)', 'Easter Sunday'), publicHoliday: true, factor: 1.05, tags: ['family', 'long_weekend'] },
    { id: 'volbrioo', month: 4, day: 30, name: T('Volbriöö', 'Walpurgis Night'), publicHoliday: false, factor: 1.15, tags: ['students', 'drunk', 'crowd'] },
    { id: 'kevadpuha', month: 5, day: 1, name: T('Kevadpüha', 'Spring Day (May Day)'), publicHoliday: true, factor: 1.15, tags: ['drunk', 'hangover'] },
    { id: 'nelipuhad', month: pm, day: pd, name: T('Nelipühade 1. püha', 'Pentecost'), publicHoliday: true, factor: 1.0, tags: [] },
    { id: 'leinapaev', month: 6, day: 14, name: T('Leinapäev', 'Day of Mourning'), publicHoliday: false, factor: 1.0, tags: ['flags'] },
    {
      id: 'voidupuha',
      month: 6,
      day: 23,
      name: T('Võidupüha ja jaanilaupäev', 'Victory Day & Midsummer Eve'),
      publicHoliday: true,
      factor: 1.6,
      tags: ['parade', 'bonfire', 'drowning', 'drunk_driving', 'drunk', 'domestic', 'fireworks', 'jaanipaev'],
    },
    {
      id: 'jaanipaev',
      month: 6,
      day: 24,
      name: T('Jaanipäev', "Midsummer Day (St John's Day)"),
      publicHoliday: true,
      factor: 1.6,
      tags: ['bonfire', 'drowning', 'drunk_driving', 'drunk', 'domestic', 'hangover', 'jaanipaev'],
    },
    {
      id: 'taasiseseisvumispaev',
      month: 8,
      day: 20,
      name: T('Taasiseseisvumispäev', 'Day of Restoration of Independence'),
      publicHoliday: true,
      factor: 1.05,
      tags: ['concert', 'crowd'],
    },
    { id: 'teadmistepaev', month: 9, day: 1, name: T('Teadmistepäev (kooliaasta algus)', 'Knowledge Day (school starts)'), publicHoliday: false, factor: 1.1, tags: ['school', 'traffic_kids'] },
    { id: 'halloween', month: 10, day: 31, name: T('Halloween', 'Halloween'), publicHoliday: false, factor: 1.05, tags: ['pranks', 'youth'] },
    { id: 'mardipaev', month: 11, day: 10, name: T('Mardipäev', "St Martin's Day"), publicHoliday: false, factor: 1.0, tags: ['kids_costumes'] },
    { id: 'kadripaev', month: 11, day: 25, name: T('Kadripäev', "St Catherine's Day"), publicHoliday: false, factor: 1.0, tags: ['kids_costumes'] },
    { id: 'joululaupaev', month: 12, day: 24, name: T('Jõululaupäev', 'Christmas Eve'), publicHoliday: true, factor: 1.3, tags: ['domestic', 'drunk', 'family'] },
    { id: 'joulupuha1', month: 12, day: 25, name: T('Esimene jõulupüha', 'Christmas Day'), publicHoliday: true, factor: 1.2, tags: ['domestic', 'family'] },
    { id: 'joulupuha2', month: 12, day: 26, name: T('Teine jõulupüha', "St Stephen's Day (Boxing Day)"), publicHoliday: true, factor: 1.1, tags: ['domestic', 'traffic'] },
    {
      id: 'vana_aasta',
      month: 12,
      day: 31,
      name: T('Vana-aasta õhtu', "New Year's Eve"),
      publicHoliday: false,
      factor: 1.15,
      tags: ['fireworks', 'drunk', 'domestic'],
    },
  ];
  // Other police-relevant dates (docs/research/map-services.md §9.2/§9.4).
  const nthWeekday = (month: number, weekday: number, n: number): number => {
    // weekday: 0 = Sunday … 6 = Saturday (JS convention); returns day of month of the n-th occurrence
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  };
  list.push(
    { id: 'pronksioo', month: 4, day: 26, name: T('Pronksiöö aastapäev', 'Bronze Night anniversary'), publicHoliday: false, factor: 1.0, tags: ['public_order_watch'] },
    { id: 'may9', month: 5, day: 9, name: T('9. mai', '9 May'), publicHoliday: false, factor: 1.05, tags: ['public_order_watch', 'crowd'] },
    { id: 'hingedepaev', month: 11, day: 2, name: T('Hingedepäev', "All Souls' Day"), publicHoliday: false, factor: 1.0, tags: ['cemetery_traffic'] },
    { id: 'tartu_maraton', month: 2, day: nthWeekday(2, 0, 3), name: T('Tartu Maraton', 'Tartu Ski Marathon'), publicHoliday: false, factor: 1.0, tags: ['road_closures', 'sport'] },
    { id: 'tallinna_maraton', month: 9, day: nthWeekday(9, 0, 2), name: T('Tallinna maraton', 'Tallinn Marathon'), publicHoliday: false, factor: 1.05, tags: ['road_closures', 'sport', 'crowd'] },
  );
  const fest = SONG_FESTIVALS[year];
  if (fest) {
    const startUtc = Date.UTC(year, fest.from[0] - 1, fest.from[1]);
    const endUtc = Date.UTC(year, fest.to[0] - 1, fest.to[1]);
    for (let d = startUtc; d <= endUtc; d += 24 * HOUR) {
      const dt = new Date(d);
      list.push({
        id: 'laulupidu',
        month: dt.getUTCMonth() + 1,
        day: dt.getUTCDate(),
        name: T('Üldlaulu- ja tantsupidu', 'Estonian Song and Dance Celebration'),
        publicHoliday: false,
        factor: 1.25,
        tags: ['crowd', 'concert', 'traffic', 'lost_child'],
        note: fest.estimate
          ? T('Kuupäev on hinnanguline (pidu toimub umbes iga viie aasta järel).', 'Date is an estimate (held roughly every five years).')
          : undefined,
      });
    }
  }
  return list.sort((a, b) => a.month - b.month || a.day - b.day);
}

/** Public holidays (riigipühad) of a year as 'YYYY-MM-DD' strings. */
export function publicHolidays(year: number): string[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  return specialDays(year)
    .filter((d) => d.publicHoliday)
    .map((d) => `${year}-${pad(d.month)}-${pad(d.day)}`);
}

export function isPublicHoliday(t: number): boolean {
  const w = wall(t);
  return specialDays(w.year).some((d) => d.publicHoliday && d.month === w.month && d.day === w.day);
}

/** Estonian holiday / special-day info for time t. */
export function dayInfo(t: number): { holiday?: Text; factor: number; tags: string[] } {
  const w = wall(t);
  const h = w.hour + w.minute / 60;

  // Vana-aasta öö: 31.12 18:00 → 1.1 06:00 is the busiest night of the year.
  if ((w.month === 12 && w.day === 31 && h >= 18) || (w.month === 1 && w.day === 1 && h < 6)) {
    return {
      holiday: T('Vana-aasta öö', "New Year's Eve night"),
      factor: 1.8,
      tags: ['fireworks', 'drunk', 'domestic', 'newyear'],
    };
  }
  // Jaaniöö: 23.06 18:00 → 24.06 06:00 (bonfires; 1 200+ call-outs over two days).
  if ((w.month === 6 && w.day === 23 && h >= 18) || (w.month === 6 && w.day === 24 && h < 6)) {
    return {
      holiday: T('Jaaniöö', 'Midsummer Night'),
      factor: 1.75,
      tags: ['bonfire', 'drowning', 'drunk_driving', 'drunk', 'domestic', 'fireworks', 'jaanipaev'],
    };
  }

  const today = specialDays(w.year).filter((d) => d.month === w.month && d.day === w.day);
  // The evening before a public holiday behaves like a Friday night.
  const [ny, nm, nd] = addDays(w.year, w.month, w.day, 1);
  const tomorrowHoliday = h >= 18 && specialDays(ny).some((d) => d.publicHoliday && d.month === nm && d.day === nd);

  if (today.length === 0) {
    if (tomorrowHoliday) return { factor: 1.15, tags: ['holiday_eve'] };
    return { factor: 1, tags: [] };
  }
  const main = today.reduce((a, b) => (b.factor > a.factor ? b : a));
  const tags = [...new Set(today.flatMap((d) => d.tags).concat(main.publicHoliday ? ['public_holiday'] : []))];
  if (tomorrowHoliday) tags.push('holiday_eve');
  let factor = main.factor;
  // Walpurgis is an evening/night thing.
  if (main.id === 'volbrioo' && h < 17) factor = 1;
  if (tomorrowHoliday) factor = Math.max(factor, 1.15);
  return { holiday: main.name, factor, tags };
}
