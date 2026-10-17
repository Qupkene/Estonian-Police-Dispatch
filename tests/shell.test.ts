import { describe, expect, it } from 'vitest';
import {
  clearEpdStorage,
  countyShapes,
  ESTONIA_BOUNDS,
  formatCountdown,
  formatMoney,
  generateIdentity,
  gradeTone,
  isLegacyLogin,
  isValidPin1,
  looksLikeEstonianMobile,
  looksLikeIdcode,
  makeProjection,
  mean,
  nthWeekday,
  presetHoliday,
  regionOfCounty,
  regionSummary,
  resolveDatePreset,
  responseTone,
  shiftStart,
  simplifyRing,
  verificationCode,
  weekdayOf,
} from '@/ui/screens/shell/helpers';
import { parseIdcode } from '@/gen/isikukood';
import { tallinnTime, wall } from '@/sim/time';
import { ringSchedule, RING_CADENCE, SFX_NAMES, volumeToGain } from '@/audio/sfx';
import { pickVoice, speechText } from '@/audio/speech';
import { ICON_NAMES } from '@/ui/components/Icon';
import DICT from '@/i18n/parts/shell';

describe('login simulation', () => {
  it('accepts exactly the 2024 empty login', () => {
    expect(isLegacyLogin('', '')).toBe(true);
    expect(isLegacyLogin('   ', '')).toBe(true);
    expect(isLegacyLogin('admin', '')).toBe(false);
    expect(isLegacyLogin('', ' ')).toBe(false);
    expect(isLegacyLogin('a', 'b')).toBe(false);
  });

  it('generates deterministic, valid Estonian identities', () => {
    const a = generateIdentity(42);
    const b = generateIdentity(42);
    expect(a).toEqual(b);
    for (let s = 1; s < 60; s++) {
      const id = generateIdentity(s * 7919);
      const info = parseIdcode(id.idcode);
      expect(info.valid).toBe(true);
      expect(info.gender).toBe(id.gender);
      expect(info.birthDate).toBe(id.birthDate);
      expect(looksLikeIdcode(id.idcode)).toBe(true);
      expect(looksLikeEstonianMobile(id.phone)).toBe(true);
      expect(id.firstName.length).toBeGreaterThan(1);
    }
  });

  it('validates PIN1 and verification codes', () => {
    expect(isValidPin1('1234')).toBe(true);
    expect(isValidPin1('123')).toBe(false);
    expect(isValidPin1('12a4')).toBe(false);
    for (let s = 0; s < 50; s++) expect(verificationCode(s)).toMatch(/^\d{4}$/);
  });

  it('formats countdowns', () => {
    expect(formatCountdown(120)).toBe('2:00');
    expect(formatCountdown(65.2)).toBe('1:06');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('formatting', () => {
  it('formats money the Estonian and English way', () => {
    expect(formatMoney(10000, 'et')).toBe('10 000 €');
    expect(formatMoney(-1250, 'et')).toBe('−1 250 €');
    expect(formatMoney(300, 'et', true)).toBe('+300 €');
    expect(formatMoney(10000, 'en')).toBe('€10,000');
  });
  it('computes means safely', () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
  });
});

describe('regions & map', () => {
  it('maps every county to the right prefecture', () => {
    expect(regionOfCounty('Harju maakond')).toBe('pohja');
    expect(regionOfCounty('Ida-Viru maakond')).toBe('ida');
    expect(regionOfCounty('Lääne-Viru maakond')).toBe('ida');
    expect(regionOfCounty('Võru maakond')).toBe('louna');
    expect(regionOfCounty('Järva maakond')).toBe('laane');
    expect(regionOfCounty('Saare maakond')).toBe('laane');
    expect(regionOfCounty('Atlantis')).toBeUndefined();
  });

  it('builds county outlines for all 15 counties, grouped into 4 prefectures', () => {
    const proj = makeProjection(ESTONIA_BOUNDS, 640, 12);
    const shapes = countyShapes(proj);
    expect(shapes).toHaveLength(15);
    const regions = new Set(shapes.map((s) => s.regionId));
    expect([...regions].sort()).toEqual(['ida', 'laane', 'louna', 'pohja']);
    for (const s of shapes) {
      expect(s.d.startsWith('M')).toBe(true);
      expect(s.area).toBeGreaterThan(0);
    }
  });

  it('projects with cos(lat) scaling and keeps points inside the viewBox', () => {
    const proj = makeProjection(ESTONIA_BOUNDS, 600, 10);
    expect(proj.height).toBeGreaterThan(300);
    expect(proj.height).toBeLessThan(450);
    const [x1, y1] = proj.project([24.745, 59.437]); // Tallinn
    const [x2, y2] = proj.project([26.722, 58.378]); // Tartu
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeGreaterThan(y1);
    for (const [x, y] of [proj.project(ESTONIA_BOUNDS[0]), proj.project(ESTONIA_BOUNDS[1])]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(600);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(proj.height);
    }
  });

  it('simplifies rings without dropping endpoints', () => {
    const ring: [number, number][] = Array.from({ length: 100 }, (_, i) => [i * 0.1, 0] as [number, number]);
    const out = simplifyRing(ring, 1);
    expect(out.length).toBeLessThan(20);
    expect(out[0]).toEqual(ring[0]);
    expect(out[out.length - 1]).toEqual(ring[ring.length - 1]);
  });

  it('region summaries always have names, HQ and commander (even with placeholder data)', () => {
    for (const id of ['pohja', 'ida', 'louna', 'laane'] as const) {
      const r = regionSummary(id);
      expect(r.name.et.length).toBeGreaterThan(3);
      expect(r.hqCity.length).toBeGreaterThan(2);
      expect(r.commander.name.length).toBeGreaterThan(2);
      expect(r.counties.length).toBeGreaterThan(0);
    }
  });
});

describe('briefing presets', () => {
  const now = tallinnTime(2026, 10, 17, 12, 0);
  it('resolves special dates to the next occurrence', () => {
    expect(resolveDatePreset('today', now)).toEqual({ y: 2026, m: 10, d: 17 });
    expect(resolveDatePreset('jaanipaev', now)).toEqual({ y: 2027, m: 6, d: 23 });
    expect(resolveDatePreset('newyear', now)).toEqual({ y: 2026, m: 12, d: 31 });
    const fri = resolveDatePreset('winterfri', now);
    expect(fri.m).toBe(1);
    expect(fri.y).toBe(2027);
    expect(weekdayOf(fri)).toBe(4);
    const sat = resolveDatePreset('summersat', now);
    expect(sat.m).toBe(7);
    expect(weekdayOf(sat)).toBe(5);
  });
  it('finds n-th weekdays', () => {
    expect(nthWeekday(2026, 10, 5, 3)).toEqual({ y: 2026, m: 10, d: 17 }); // 3rd Saturday of Oct 2026
  });
  it('builds shift starts in Tallinn wall time', () => {
    const t = shiftStart({ y: 2026, m: 12, d: 31 }, 'night');
    const w = wall(t);
    expect([w.year, w.month, w.day, w.hour]).toEqual([2026, 12, 31, 19]);
    expect(wall(shiftStart({ y: 2026, m: 6, d: 23 }, 'short')).hour).toBe(22);
    expect(wall(shiftStart({ y: 2026, m: 7, d: 1 }, 'day')).hour).toBe(7);
  });
  it('knows the big holidays', () => {
    expect(presetHoliday({ y: 2026, m: 6, d: 23 })?.et).toMatch(/jaani/i);
    expect(presetHoliday({ y: 2026, m: 12, d: 31 })?.et).toMatch(/Vana-aasta/);
    expect(presetHoliday({ y: 2026, m: 3, d: 3 })).toBeUndefined();
  });
});

describe('report helpers', () => {
  it('maps grades and response times to tones', () => {
    expect(gradeTone('S')).toBe('gold');
    expect(gradeTone('F')).toBe('danger');
    expect(responseTone(8, 10)).toBe('ok');
    expect(responseTone(14, 10)).toBe('warn');
    expect(responseTone(20, 10)).toBe('danger');
    expect(responseTone(undefined, 10)).toBe('neutral');
  });
  it('clears only epd:* storage keys', () => {
    const data: Record<string, string> = { 'epd:settings': '1', 'epd:career': '2', other: '3' };
    const store = {
      get length() {
        return Object.keys(data).length;
      },
      key: (i: number) => Object.keys(data)[i] ?? null,
      removeItem: (k: string) => {
        delete data[k];
      },
    };
    expect(clearEpdStorage(store).sort()).toEqual(['epd:career', 'epd:settings']);
    expect(Object.keys(data)).toEqual(['other']);
  });
});

describe('audio helpers', () => {
  it('schedules a European-style ring cadence', () => {
    const s = ringSchedule(3);
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ start: 0, dur: RING_CADENCE.on });
    expect(s[1].start).toBeCloseTo(RING_CADENCE.on + RING_CADENCE.off);
    expect(ringSchedule(0)).toEqual([]);
  });
  it('maps volume perceptually and clamps', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(0.5)).toBeLessThan(0.5);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });
  it('covers every sound name', () => {
    expect(new Set(SFX_NAMES).size).toBe(20);
  });
  it('picks an Estonian voice only when one exists', () => {
    const voices = [
      { lang: 'en-US', name: 'US', localService: true },
      { lang: 'en-GB', name: 'GB', localService: false },
      { lang: 'fi-FI', name: 'FI' },
    ];
    expect(pickVoice(voices, 'et')).toBeNull();
    expect(pickVoice(voices, 'en')?.name).toBe('GB');
    expect(pickVoice([...voices, { lang: 'et_EE', name: 'Anu' }], 'et')?.name).toBe('Anu');
    expect(pickVoice([], 'en')).toBeNull();
  });
  it('cleans radio text for speech', () => {
    expect(speechText('Põhja 21 [auto] «kohal»')).toBe('Põhja 21 kohal');
    const long = 'Lause üks on siin. '.repeat(20);
    expect(speechText(long, 60).length).toBeLessThanOrEqual(61);
  });
});

describe('icons & strings', () => {
  it('has a unique icon name list', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });
  it('has Estonian and English text for every shell key', () => {
    for (const [k, v] of Object.entries(DICT)) {
      expect(v.et.trim(), k).not.toBe('');
      expect(v.en.trim(), k).not.toBe('');
      const varsEt = (v.et.match(/\{\w+\}/g) ?? []).sort();
      const varsEn = (v.en.match(/\{\w+\}/g) ?? []).sort();
      expect(varsEn, k).toEqual(varsEt);
    }
  });
});
