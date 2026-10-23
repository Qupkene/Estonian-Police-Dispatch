// The briefing's conditions as pictures (src/ui/screens/shell/conditions.ts): they must tell what the sim does.
import { describe, expect, it } from 'vitest';
import DICT from '@/i18n/parts/shell';
import { DIFFICULTY_FACTOR } from '@/sim/spawner';
import { sunTimes } from '@/sim/sun';
import { HOUR, tallinnTime, wall } from '@/sim/time';
import { initialWeather } from '@/sim/weather';
import { Rng } from '@/sim/rng';
import {
  darkSpans,
  dayBars,
  dayHours,
  difficultyCalls,
  difficultyXp,
  fmtChange,
  fmtMult,
  fmtTemp,
  hourLoad,
  kindDrive,
  loadBars,
  nightOf,
  shiftDayFactor,
  shiftTags,
  TAG_ORDER,
  weatherEffect,
} from '@/ui/screens/shell/conditions';
import { shiftStart, SHIFT_PRESETS } from '@/ui/screens/shell/helpers';

const TALLINN: [number, number] = [24.745, 59.437];

describe('briefing conditions: the day line', () => {
  const date = { y: 2026, m: 10, d: 20 }; // a Tuesday
  const dayStart = shiftStart(date, 'day');

  it('marks the hours of each shift on the 07:00-07:00 line', () => {
    const on = (shift: 'day' | 'night' | 'short') =>
      dayHours(dayStart, shiftStart(date, shift), SHIFT_PRESETS[shift].hours)
        .map((h, i) => (h.inShift ? i : -1))
        .filter((i) => i >= 0);
    expect(dayHours(dayStart, dayStart, 12)).toHaveLength(24);
    expect(on('day')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(on('night')).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(on('short')).toEqual([15, 16, 17, 18]);
    expect(wall(dayHours(dayStart, dayStart, 12)[15].t).hour).toBe(22);
  });

  it('is busiest around midnight and on the big nights', () => {
    const h = dayHours(dayStart, dayStart, 12);
    const at = (hour: number) => h[(hour - 7 + 24) % 24].load;
    expect(at(23)).toBeGreaterThan(at(10));
    expect(at(5)).toBeLessThan(at(10));
    for (const x of h) expect(x.load).toBeGreaterThan(0);
    for (const x of h) expect(x.load).toBeLessThanOrEqual(1);
    const ordinary = hourLoad(tallinnTime(2027, 6, 16, 23, 30)); // a Wednesday
    const midsummer = hourLoad(tallinnTime(2027, 6, 23, 23, 30)); // also a Wednesday
    expect(midsummer).toBeGreaterThan(ordinary * 1.5);
  });

  it('shades the dark: a winter morning and the night, a summer night only', () => {
    const span = (y: number, m: number, d: number) => {
      const s = shiftStart({ y, m, d }, 'day');
      const a = sunTimes(s, TALLINN[1], TALLINN[0]);
      const b = sunTimes(s + 24 * HOUR, TALLINN[1], TALLINN[0]);
      return darkSpans(s, a.sunrise, a.sunset, b.sunrise);
    };
    const winter = span(2027, 1, 8);
    expect(winter).toHaveLength(2);
    expect(winter[0][0]).toBe(0);
    expect(winter[0][1]).toBeGreaterThan(1 / 24); // still dark after 08:00
    const summer = span(2027, 6, 23);
    expect(summer).toHaveLength(1);
    expect(summer[0][1] - summer[0][0]).toBeLessThan(6 / 24); // a short white night
  });
});

describe('briefing conditions: the dates', () => {
  it('rates the dates as the calendar does', () => {
    const night = (y: number, m: number, d: number) => shiftStart({ y, m, d }, 'night');
    expect(dayBars(shiftDayFactor(night(2026, 10, 20), 12))).toBe(1); // Tuesday
    expect(dayBars(shiftDayFactor(night(2026, 10, 23), 12))).toBe(3); // Friday night
    expect(dayBars(shiftDayFactor(night(2027, 6, 23), 12))).toBe(4); // jaaniöö
    expect(dayBars(shiftDayFactor(night(2026, 12, 31), 12))).toBe(4); // vana-aasta öö
  });

  it('names only the tags that some calls answer to, each with words', () => {
    const tags = shiftTags(shiftStart({ y: 2027, m: 6, d: 23 }, 'night'), 12);
    expect(tags).toEqual(expect.arrayContaining(['bonfire', 'drunk_driving', 'drunk', 'fireworks']));
    expect(tags).not.toContain('drowning');
    expect(shiftTags(shiftStart({ y: 2026, m: 10, d: 20 }, 'day'), 12)).toEqual([]);
    for (const tag of TAG_ORDER) {
      expect(DICT[`shell.tag.${tag}`]?.et, tag).toBeTruthy();
      expect(DICT[`shell.tag.${tag}`]?.en, tag).toBeTruthy();
    }
  });

  it('puts an Estonian weekday in the genitive for its night', () => {
    expect(nightOf('reede', 'et')).toBe('reede öö');
    expect(nightOf('laupäev', 'et')).toBe('laupäeva öö');
    expect(nightOf('Friday', 'en')).toBe('Friday night');
  });
});

describe('briefing conditions: difficulty, weather, numbers', () => {
  it('reads the difficulty from the spawner and the report', () => {
    expect(difficultyCalls('normal')).toBe(1);
    expect(difficultyCalls('cadet')).toBeCloseTo(DIFFICULTY_FACTOR.cadet / DIFFICULTY_FACTOR.normal);
    expect(difficultyCalls('realistic')).toBeGreaterThan(difficultyCalls('veteran'));
    expect(difficultyXp('normal')).toBe(1);
    expect(difficultyXp('cadet')).toBeLessThan(1);
    expect(loadBars('low')).toBe(1);
    expect(loadBars('extreme')).toBe(4);
  });

  it('tells what a weather does', () => {
    expect(kindDrive('clear')).toBe(1);
    expect(kindDrive('sleet')).toBeCloseTo(1.4);
    const t = tallinnTime(2027, 1, 8, 7, 0);
    const sleet = weatherEffect(initialWeather(new Rng(7), t, 'sleet', 'pohja'));
    expect(sleet.drive).toBeGreaterThanOrEqual(1.4);
    expect(sleet.traffic).toBeGreaterThan(1);
    expect(sleet.wet).toBe(true);
    const clear = weatherEffect(initialWeather(new Rng(7), tallinnTime(2027, 7, 10, 7, 0), 'clear', 'pohja'));
    expect(clear.wet).toBe(false);
  });

  it('formats numbers the Estonian way', () => {
    expect(fmtMult(0.611, 'et')).toBe('×0,6');
    expect(fmtMult(1.78, 'en')).toBe('×1.8');
    expect(fmtChange(1.4)).toBe('+40%');
    expect(fmtChange(0.93)).toBe('−7%');
    expect(fmtTemp(-6.4)).toBe('−6 °C');
    expect(fmtTemp(5)).toBe('5 °C');
  });

  it('keeps the new words free of long dashes', () => {
    for (const [k, v] of Object.entries(DICT)) {
      if (!k.startsWith('shell.brief.') && !k.startsWith('shell.tag.')) continue;
      expect(`${v.et} ${v.en}`, k).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
